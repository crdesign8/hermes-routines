import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { activeRouteKey, coerceRoutes, resolveActiveRoute } from '../domain/routing';
import { jobIdOf, normalizeJobs, withPausedFlag, type RoutineFilter, type RoutineJob } from '../domain/jobs';
import { messageOf } from '../lib/errors';

// Page state machine for the Routines view. Pure and reducer-driven: every
// event passes through routinesViewReducer, so one event = one
// transition. The component dispatches functional state updates (see
// RoutinesPage) and tests drive the reducer directly.
//
// Identity: every row-keyed transition (optimistic flip, pending/busy) is
// keyed by the canonical `job_id` (jobIdOf) — never by the display name. A
// row without an id is not addressable and simply never matches.
//
// Active-profile binding: the plugin never offers a profile picker. The
// Desktop owns the active profile (`host.state.profile` +
// `host.state.connectionId`); the reducer only ever represents that exact
// connection-qualified route. A profile switch clears the previous
// profile's rows — stale data is never shown as current — and late
// list responses carry their route key so a superseded request cannot
// contaminate the new view.

export const ROUTINES_VIEW_STATUS = Object.freeze({
  ROUTES_LOADING: 'routes-loading',
  ROUTES_ERROR: 'routes-error',
  ROUTE_UNAVAILABLE: 'route-unavailable',
  LIST_LOADING: 'list-loading',
  READY: 'ready',
  LIST_ERROR: 'list-error',
} as const);

export type RoutinesStatus = (typeof ROUTINES_VIEW_STATUS)[keyof typeof ROUTINES_VIEW_STATUS];

export interface RoutinesState {
  status: RoutinesStatus;
  routes: PluginProfileRoute[];
  /** Connection-qualified key of the active route (`connectionId::profile`). */
  activeKey: string | null;
  activeProfile: string | null;
  activeConnectionId: string | null;
  jobs: RoutineJob[];
  error: string | null;
  notice: string | null;
  /** In-flight mutation keys: canonical `job_id`s, plus the create slot. */
  pending: string[];
  filter: RoutineFilter;
  snapshot: RoutineJob[] | null;
}

export type RoutinesEvent =
  | { type: 'routes-loading' }
  | { type: 'routes-loaded'; routes: unknown; profile: unknown; connectionId: unknown }
  | { type: 'routes-error'; error: unknown }
  | { type: 'retry-routes' }
  | { type: 'active-changed'; profile: unknown; connectionId: unknown }
  | { type: 'list-loading' }
  | { type: 'list-loaded'; jobs: unknown; key: unknown }
  | { type: 'list-error'; error: unknown; key: unknown }
  | { type: 'retry-list' }
  | { type: 'filter-changed'; filter: unknown }
  | { type: 'mutate-start'; jobId: unknown }
  | { type: 'mutate-end'; jobId: unknown }
  | { type: 'optimistic-pause'; jobId: string }
  | { type: 'optimistic-resume'; jobId: string }
  | { type: 'optimistic-rollback' }
  | { type: 'notice'; notice: unknown }
  | { type: 'mutation-error'; error: unknown };

export function initialRoutinesState(): RoutinesState {
  return {
    status: ROUTINES_VIEW_STATUS.ROUTES_LOADING,
    routes: [],
    activeKey: null,
    activeProfile: null,
    activeConnectionId: null,
    jobs: [],
    error: null,
    notice: null,
    pending: [],
    filter: 'all',
    snapshot: null,
  };
}

function profileText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function routinesViewReducer(
  state: RoutinesState | undefined,
  event: RoutinesEvent | null,
): RoutinesState {
  const S = ROUTINES_VIEW_STATUS;
  const base = state ?? initialRoutinesState();
  if (!event) return base;
  switch (event.type) {
    case 'routes-loading':
      return {
        ...base,
        status: S.ROUTES_LOADING,
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null,
      };
    case 'routes-loaded': {
      const usable = coerceRoutes(event.routes);
      const profile = profileText(event.profile);
      const connectionId = profileText(event.connectionId);
      const route = resolveActiveRoute(usable, profile, connectionId);
      const key = activeRouteKey(profile, connectionId);
      if (!route || !key) {
        return {
          ...base,
          status: S.ROUTE_UNAVAILABLE,
          routes: usable,
          activeKey: null,
          activeProfile: profile,
          activeConnectionId: connectionId,
          jobs: [],
          error: null,
          notice: null,
          pending: [],
          snapshot: null,
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        routes: usable,
        activeKey: key,
        activeProfile: profile,
        activeConnectionId: connectionId,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null,
      };
    }
    case 'routes-error':
      return {
        ...base,
        status: S.ROUTES_ERROR,
        error: messageOf(event.error),
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: [],
      };
    case 'retry-routes':
      return {
        ...base,
        status: S.ROUTES_LOADING,
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null,
      };
    case 'active-changed': {
      const profile = profileText(event.profile);
      const connectionId = profileText(event.connectionId);
      const key = activeRouteKey(profile, connectionId);
      if (key === base.activeKey) return base;
      const route = resolveActiveRoute(base.routes, profile, connectionId);
      if (!route || !key) {
        return {
          ...base,
          status: S.ROUTE_UNAVAILABLE,
          activeKey: null,
          activeProfile: profile,
          activeConnectionId: connectionId,
          jobs: [],
          error: null,
          notice: null,
          pending: [],
          snapshot: null,
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        activeKey: key,
        activeProfile: profile,
        activeConnectionId: connectionId,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null,
      };
    }
    case 'list-loading':
      return { ...base, status: S.LIST_LOADING, error: null };
    case 'list-loaded': {
      // Race guard: a superseded request (profile A resolving after the
      // switch to B) carries A's key and is ignored — the view keeps B.
      if (typeof event.key !== 'string' || event.key !== base.activeKey) return base;
      return {
        ...base,
        status: S.READY,
        jobs: normalizeJobs(event.jobs),
        error: null,
        snapshot: null,
        pending: [],
      };
    }
    case 'list-error': {
      if (typeof event.key !== 'string' || event.key !== base.activeKey) return base;
      return { ...base, status: S.LIST_ERROR, error: messageOf(event.error) };
    }
    case 'retry-list':
      return { ...base, status: S.LIST_LOADING, error: null, notice: null };
    case 'filter-changed':
      return {
        ...base,
        filter: event.filter === 'active' || event.filter === 'paused' ? event.filter : 'all',
      };
    case 'mutate-start': {
      // '' is the create slot: a create has no job_id until the backend
      // answers, and the lock must cover that window too.
      if (typeof event.jobId !== 'string') return base;
      if (base.pending.indexOf(event.jobId) !== -1) return { ...base, notice: null };
      return { ...base, pending: base.pending.concat([event.jobId]), notice: null };
    }
    case 'mutate-end':
      return { ...base, pending: base.pending.filter((jobId) => jobId !== event.jobId) };
    case 'optimistic-pause':
      // Identity must exist: '' addresses nothing (and must never match the
      // rows that carry no id either).
      if (!event.jobId) return base;
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => (jobIdOf(job) === event.jobId ? withPausedFlag(job, true) : job)),
      };
    case 'optimistic-resume':
      if (!event.jobId) return base;
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => (jobIdOf(job) === event.jobId ? withPausedFlag(job, false) : job)),
      };
    case 'optimistic-rollback':
      return { ...base, snapshot: null, jobs: Array.isArray(base.snapshot) ? base.snapshot : base.jobs };
    case 'notice':
      return { ...base, notice: messageOf(event.notice), error: null };
    case 'mutation-error':
      return { ...base, error: messageOf(event.error) };
    default:
      return base;
  }
}
