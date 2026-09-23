import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { coerceRoutes, findRouteByKey, routeKey } from '../domain/routing';
import { jobIdOf, normalizeJobs, visibleJobs, withPausedFlag, type RoutineFilter, type RoutineJob } from '../domain/jobs';
import { messageOf } from '../lib/errors';

// Page state machine for the Routines view. Pure and reducer-driven: every
// event passes through routinesViewReducer, so one event = one
// transition. The component dispatches functional state updates (see
// RoutinesPage) and tests drive the reducer directly.

export const ROUTINES_VIEW_STATUS = Object.freeze({
  ROUTES_LOADING: 'routes-loading',
  ROUTES_ERROR: 'routes-error',
  LIST_LOADING: 'list-loading',
  READY: 'ready',
  LIST_ERROR: 'list-error',
} as const);

export type RoutinesStatus = (typeof ROUTINES_VIEW_STATUS)[keyof typeof ROUTINES_VIEW_STATUS];

export interface RoutinesState {
  status: RoutinesStatus;
  routes: PluginProfileRoute[];
  selectedKey: string | null;
  jobs: RoutineJob[];
  error: string | null;
  notice: string | null;
  pending: string[];
  confirmName: string | null;
  filter: RoutineFilter;
  snapshot: RoutineJob[] | null;
}

export type RoutinesEvent =
  | { type: 'routes-loading' }
  | { type: 'routes-loaded'; routes: unknown }
  | { type: 'routes-error'; error: unknown }
  | { type: 'retry-routes' }
  | { type: 'route-changed'; key: string }
  | { type: 'list-loading' }
  | { type: 'list-loaded'; jobs: unknown }
  | { type: 'list-error'; error: unknown }
  | { type: 'retry-list' }
  | { type: 'filter-changed'; filter: unknown }
  | { type: 'confirm-open'; name: unknown }
  | { type: 'confirm-close' }
  | { type: 'mutate-start'; name: unknown }
  | { type: 'mutate-end'; name: unknown }
  | { type: 'optimistic-pause'; name: string }
  | { type: 'optimistic-resume'; name: string }
  | { type: 'optimistic-rollback' }
  | { type: 'notice'; notice: unknown }
  | { type: 'mutation-error'; error: unknown };

export function initialRoutinesState(): RoutinesState {
  return {
    status: ROUTINES_VIEW_STATUS.ROUTES_LOADING,
    routes: [],
    selectedKey: null,
    jobs: [],
    error: null,
    notice: null,
    pending: [],
    confirmName: null,
    filter: 'all',
    snapshot: null,
  };
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
      return { ...base, status: S.ROUTES_LOADING, error: null, notice: null };
    case 'routes-loaded': {
      const usable = coerceRoutes(event.routes);
      if (usable.length === 0) {
        return {
          ...base,
          status: S.READY,
          routes: [],
          selectedKey: null,
          jobs: [],
          error: null,
          snapshot: null,
          pending: [],
          confirmName: null,
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        routes: usable,
        selectedKey: routeKey(usable[0]),
        jobs: [],
        error: null,
        notice: null,
        confirmName: null,
        snapshot: null,
        pending: [],
      };
    }
    case 'routes-error':
      return {
        ...base,
        status: S.ROUTES_ERROR,
        error: messageOf(event.error),
        routes: [],
        selectedKey: null,
        jobs: [],
      };
    case 'retry-routes':
      return { ...base, status: S.ROUTES_LOADING, error: null, notice: null };
    case 'route-changed':
      return {
        ...base,
        status: S.LIST_LOADING,
        selectedKey: event.key,
        jobs: [],
        error: null,
        notice: null,
        confirmName: null,
        snapshot: null,
      };
    case 'list-loading':
      return { ...base, status: S.LIST_LOADING, error: null };
    case 'list-loaded':
      return {
        ...base,
        status: S.READY,
        jobs: normalizeJobs(event.jobs),
        error: null,
        snapshot: null,
        pending: [],
        confirmName: null,
      };
    case 'list-error':
      return { ...base, status: S.LIST_ERROR, error: messageOf(event.error) };
    case 'retry-list':
      return { ...base, status: S.LIST_LOADING, error: null, notice: null, confirmName: null };
    case 'filter-changed':
      return {
        ...base,
        filter: event.filter === 'active' || event.filter === 'paused' ? event.filter : 'all',
      };
    case 'confirm-open':
      return { ...base, confirmName: typeof event.name === 'string' ? event.name : null };
    case 'confirm-close':
      return { ...base, confirmName: null };
    case 'mutate-start': {
      if (typeof event.name !== 'string' || !event.name) return base;
      if (base.pending.indexOf(event.name) !== -1) return { ...base, notice: null };
      return { ...base, pending: base.pending.concat([event.name]), notice: null };
    }
    case 'mutate-end':
      return { ...base, pending: base.pending.filter((name) => name !== event.name) };
    case 'optimistic-pause':
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => (jobIdOf(job) === event.name ? withPausedFlag(job, true) : job)),
      };
    case 'optimistic-resume':
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => (jobIdOf(job) === event.name ? withPausedFlag(job, false) : job)),
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
