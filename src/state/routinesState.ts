import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { activeRouteKey, coerceRoutes, resolveActiveRoute } from '../domain/routing';
import { jobIdOf, normalizeJobs, withPausedFlag, type RoutineFilter, type RoutineJob } from '../domain/jobs';
import { attentionTargets } from '../domain/attention';
import { guidedConfigCandidateOf } from '../domain/provisional';
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
  /**
   * Canonical `job_id`s the user asked to focus from the needs-attention
   * summary (issue #80), or null for no focus. This is a THIRD dimension
   * beside `filter`, not a new lifecycle slice: a routine can be both paused
   * and failing, so the focus cannot be expressed as 'all' | 'active' |
   * 'paused' without losing one of the two answers. It is transient view
   * state, so every path that drops the inventory (a profile switch, a
   * routes reload) clears it — a focus that outlives its rows would filter
   * the list down to nothing with no way back except a fresh chip click.
   */
  attentionFocus: string[] | null;
  /**
   * Canonical `job_id`s the user asked to focus from the
   * needs-configuration summary (issue #93), or null for no focus. This is
   * a FOURTH dimension beside `filter` and `attentionFocus`: a routine that
   * needs configuration is paused and never ran, so it can never be in the
   * attention slice, and the two summaries must never narrow the list at
   * the same time. Setting one focus clears the other, and every path that
   * drops the inventory clears both — a focus that outlives its rows would
   * filter the list down to nothing with no way back except a fresh click.
   */
  configFocus: string[] | null;
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
  | { type: 'attention-focus'; jobs: unknown }
  | { type: 'attention-focus-cleared' }
  | { type: 'config-focus'; jobs: unknown }
  | { type: 'config-focus-cleared' }
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
    attentionFocus: null,
    configFocus: null,
  };
}

function profileText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Keep only the focus targets that are STILL failing in the inventory that
 * just arrived, or null when none of them is.
 *
 * The focus is a claim about specific routines, so it is re-derived instead
 * of trusted: a routine whose latest run succeeded must leave it (issue #80
 * — recovery clears the attention state), and a routine the backend no
 * longer returns cannot stay in it either.
 *
 * The result is null, never `[]`, when nothing survives. The two are
 * different states and conflating them blanks the page: null means "not
 * focused" and shows every row, while `[]` would filter the list down to
 * nothing and leave the user staring at an empty page with no control
 * explaining why. That is exactly the case a single recovering routine
 * creates, so the guard is on the INTERSECTION, not on the surviving set.
 */
function pruneAttentionFocus(focus: string[] | null, jobs: RoutineJob[]): string[] | null {
  if (focus === null) return null;
  const alive = attentionTargets(jobs)
    .map((job) => jobIdOf(job))
    .filter((id) => id !== '');
  const kept = focus.filter((id) => alive.indexOf(id) !== -1);
  return kept.length > 0 ? kept : null;
}

/**
 * Keep only the focus targets that are STILL configuration candidates in
 * the inventory that just arrived, or null when none of them is.
 *
 * The focus is a claim about specific routines, so it is re-derived
 * instead of trusted: a routine that ran (or was resumed, or was deleted)
 * is no longer a `guidedConfigCandidateOf` candidate and must leave the
 * focus. The result is null, never `[]`, when nothing survives — null
 * means "not focused" and shows every row, while `[]` would filter the
 * list down to nothing with no control explaining why.
 */
function pruneConfigFocus(focus: string[] | null, jobs: RoutineJob[]): string[] | null {
  if (focus === null) return null;
  const alive: string[] = [];
  for (const job of jobs) {
    const candidate = guidedConfigCandidateOf(job);
    if (candidate !== null && alive.indexOf(candidate.jobId) === -1) alive.push(candidate.jobId);
  }
  const kept = focus.filter((id) => alive.indexOf(id) !== -1);
  return kept.length > 0 ? kept : null;
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
        attentionFocus: null,
        configFocus: null,
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
          attentionFocus: null,
          configFocus: null,
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
        attentionFocus: null,
        configFocus: null,
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
        attentionFocus: null,
        configFocus: null,
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
        attentionFocus: null,
        configFocus: null,
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
          attentionFocus: null,
          configFocus: null,
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
        attentionFocus: null,
        configFocus: null,
      };
    }
    case 'list-loading':
      return { ...base, status: S.LIST_LOADING, error: null };
    case 'list-loaded': {
      // Race guard: a superseded request (profile A resolving after the
      // switch to B) carries A's key and is ignored — the view keeps B.
      if (typeof event.key !== 'string' || event.key !== base.activeKey) return base;
      const jobs = normalizeJobs(event.jobs);
      return {
        ...base,
        status: S.READY,
        jobs,
        error: null,
        snapshot: null,
        pending: [],
        // A focus is a claim about specific rows, so it is re-checked
        // against the inventory that just arrived. A routine that recovered
        // (or was deleted) leaves the focus, and a focus left with nothing in
        // it is dropped entirely — an empty focus would empty the list and
        // leave the user on a blank page with no control that says why.
        attentionFocus: pruneAttentionFocus(base.attentionFocus, jobs),
        // The configuration focus is re-derived the same way: a routine
        // that ran, resumed, or vanished is no longer a candidate and
        // leaves it, and an emptied focus is dropped instead of blanking
        // the page.
        configFocus: pruneConfigFocus(base.configFocus, jobs),
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
        // A lifecycle chip is a different question from either focus, and
        // the user answering one has answered the other: they are no longer
        // looking at "what is failing" or "what needs configuration".
        // Keeping any of them would leave the list showing a slice of one
        // question while a focus bar claims another, with no way back to
        // the rest of the list.
        attentionFocus: null,
        configFocus: null,
      };
    case 'attention-focus': {
      // Focus the routines that currently need attention, by canonical
      // identity. Ids are taken from the domain verdict, never from the
      // event payload, so a caller cannot focus a healthy routine (or a row
      // with no id) by passing its name. The lifecycle filter is reset
      // because the focus IS the slice now; leaving 'paused' on top of an
      // attention focus would silently hide the active ones.
      const ids = attentionTargets(event.jobs)
        .map((job) => jobIdOf(job))
        .filter((id) => id !== '');
      if (ids.length === 0) return { ...base, attentionFocus: null };
      // The two foci are exclusive: entering the attention slice leaves the
      // configuration slice, so the list can never be narrowed by both at
      // once with only one focus bar explaining why it shrank.
      return { ...base, filter: 'all', attentionFocus: ids, configFocus: null };
    }
    case 'attention-focus-cleared':
      return base.attentionFocus === null ? base : { ...base, attentionFocus: null };
    case 'config-focus': {
      // Focus the routines that still need configuration, by canonical
      // identity. Ids are taken from the domain verdict, never from the
      // event payload, so a caller cannot focus a configured routine (or a
      // row with no id) by passing its name. The lifecycle filter is reset
      // because the focus IS the slice now, and the attention focus is
      // cleared because the two foci are exclusive.
      const ids: string[] = [];
      const rows = Array.isArray(event.jobs) ? event.jobs : [];
      for (const job of rows) {
        const candidate = guidedConfigCandidateOf(job as RoutineJob);
        if (candidate !== null && ids.indexOf(candidate.jobId) === -1) ids.push(candidate.jobId);
      }
      if (ids.length === 0) return { ...base, configFocus: null };
      return { ...base, filter: 'all', attentionFocus: null, configFocus: ids };
    }
    case 'config-focus-cleared':
      return base.configFocus === null ? base : { ...base, configFocus: null };
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
