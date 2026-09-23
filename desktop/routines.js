// @ts-check
// hermes-routines Desktop plugin entry (installed byte-identical as plugin.js).
//
// Static contract: checked with `tsc --noEmit` (checkJs). SDK/host shapes
// come from the local typedefs in types/sdk.d.ts (global
// `PluginProfileRoute` / `PluginHost` / `PluginContext` /
// `PluginDefinition`); `@hermes/plugin-sdk` is unpublished (npm 404), so
// no devDep is added and these typedefs mirror the verified loader
// (tests/stubs/sdk-stub.mjs + docs/INSTALL.md mount note: single
// ROUTES_AREA mount, `component` is entry metadata only).
import { definePlugin, host, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk';
import { useEffect, useRef, useState } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

const ID = 'hermes-routines';
const ROUTE_ID = 'routines';
const ROUTE_PATH = '/routines';
const SIDEBAR_ID = 'sidebar-nav';

// Areas: 'routes' for the page and 'sidebar.nav' for the nav row.
// The page mounts in the workspace at ROUTE_PATH; the nav row points
// at the same path and highlights while the app is there.

// ── RoutinesView: functional page for one desktop profile connection ──
// Data flow (fail-closed): routes come from host.profileRoutes(); the
// selected route loads through listRoutines(), which rides
// host.requestProfile for cron.manage. A missing route never slides
// into the active gateway door: listRoutines rejects and the view shows
// an error with retry instead of guessing a backend.
// Route type: PluginProfileRoute from the host registry.
//
// Optimism policy (rollback only where the semantics are safe):
// - pause and resume are optimistic with snapshot rollback. They flip
//   one reversible flag, stay idempotent across retries, and the
//   snapshot restores the exact prior rows when the host call fails.
// - create is never optimistic: the backend owns schedule normalization
//   and the canonical list, so an unconfirmed row could duplicate on
//   retry. The form stays pending until the host confirms, then the
//   list reloads from the server.
// - remove is never optimistic: removal destroys data, so the row stays
//   visible and marked busy until the host confirms. A failed removal
//   keeps the row in place and surfaces a wrapped error.
// isSafeOptimistic pins this policy and is covered by tests.
//
// While any mutation is in flight the remaining mutation buttons stay
// disabled, so optimistic snapshots never overlap.

export const ROUTINES_VIEW_STATUS = Object.freeze({
  ROUTES_LOADING: 'routes-loading',
  ROUTES_ERROR: 'routes-error',
  LIST_LOADING: 'list-loading',
  READY: 'ready',
  LIST_ERROR: 'list-error',
});

const ROUTINE_FILTERS = Object.freeze([
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
]);

/**
 * @returns {{ status: string, routes: PluginProfileRoute[], selectedKey: string | null, jobs: any[], error: string | null, notice: string | null, pending: string[], confirmName: string | null, filter: string, snapshot: any }}
 */
export function initialRoutinesState() {
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

/**
 * @param {any} value
 * @returns {string}
 */
function messageOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.message === 'string' && value.message) return value.message;
  return String(value);
}

// Wrap host failures for display: keep the message, keep the cause for
// debugging, never leak a raw stack into the view.
/**
 * @param {any} err
 * @param {any} context
 * @returns {Error}
 */
export function wrapHostError(err, context) {
  const detail = messageOf(err);
  const clipped = detail.length > 300 ? detail.slice(0, 300) : detail;
  return new Error(String(context) + ': ' + clipped, { cause: err });
}

// The list endpoint may answer with a jobs envelope or a bare array;
// anything else normalizes to an empty list.
/**
 * @param {any} payload
 * @returns {any[]}
 */
export function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.jobs)) return payload.jobs;
  return [];
}

/**
 * @param {any} routes
 * @returns {PluginProfileRoute | null}
 */
export function selectDefaultRoute(routes) {
  if (!Array.isArray(routes) || routes.length === 0) return null;
  return routes[0] || null;
}

// Keep only entries that describe a real connection plus profile.
// Unusable entries are skipped; an empty result is an honest empty or
// error state, never a reason to invent a route.
/**
 * @param {any} routes
 * @returns {PluginProfileRoute[]}
 */
export function coerceRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  const usable = [];
  for (const route of routes) {
    try {
      routeKey(route);
      usable.push(route);
    } catch {
      continue;
    }
  }
  return usable;
}

/**
 * @param {any} routes
 * @param {any} key
 * @returns {PluginProfileRoute | null}
 */
export function findRouteByKey(routes, key) {
  if (!Array.isArray(routes) || typeof key !== 'string' || !key) return null;
  for (const route of routes) {
    try {
      if (routeKey(route) === key) return route;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @returns {string}
 */
function targetProfileOf(route) {
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) {
    throw new Error('routine mutation requires a resolved profile route');
  }
  const target = backendTargetProfile(route, '');
  if (!target) {
    throw new Error('routine mutation requires a route with profile/targetProfile');
  }
  return target;
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @returns {Record<string, unknown>}
 */
export function buildListParams(route) {
  return { action: 'list', include_disabled: true, profile: targetProfileOf(route) };
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {any} input
 * @returns {Record<string, unknown>}
 */
export function buildAddParams(route, input) {
  const target = targetProfileOf(route);
  const shaped = addJob(input || {});
  return { ...shaped, profile: target };
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {any} jobId
 * @returns {Record<string, unknown>}
 */
export function buildPauseParams(route, jobId) {
  return { ...pauseJob(jobId), profile: targetProfileOf(route) };
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {any} jobId
 * @returns {Record<string, unknown>}
 */
export function buildResumeParams(route, jobId) {
  return { ...resumeJob(jobId), profile: targetProfileOf(route) };
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {any} jobId
 * @returns {Record<string, unknown>}
 */
export function buildRemoveParams(route, jobId) {
  return { ...removeJob(jobId), profile: targetProfileOf(route) };
}

// Optimism gate: only pause and resume may apply ahead of the host
// answer. Create and remove wait for confirmation (see note above).
/**
 * @param {any} action
 * @returns {boolean}
 */
export function isSafeOptimistic(action) {
  return action === 'pause' || action === 'resume';
}

/**
 * @param {any} job
 * @returns {string}
 */
export function jobIdOf(job) {
  if (typeof job?.name === 'string' && job.name) return job.name;
  if (typeof job?.job_id === 'string' && job.job_id) return job.job_id;
  return '';
}

/**
 * @param {any} job
 * @returns {boolean}
 */
export function jobPaused(job) {
  if (job?.disabled === true) return true;
  if (job?.enabled === false) return true;
  return false;
}

/**
 * @param {any} job
 * @param {any} paused
 * @returns {any}
 */
export function withPausedFlag(job, paused) {
  const next = { ...(job || {}) };
  if (paused) {
    next.disabled = true;
    if ('enabled' in next) next.enabled = false;
  } else {
    next.disabled = false;
    if ('enabled' in next) next.enabled = true;
  }
  return next;
}

/**
 * @param {any} jobs
 * @param {any} filter
 * @returns {any[]}
 */
export function visibleJobs(jobs, filter) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (filter === 'active') return list.filter((job) => !jobPaused(job));
  if (filter === 'paused') return list.filter((job) => jobPaused(job));
  return list.slice();
}

/**
 * @param {any} kind
 * @returns {string}
 */
function pastTense(kind) {
  if (kind === 'pause') return 'paused';
  if (kind === 'resume') return 'resumed';
  if (kind === 'remove') return 'removed';
  return 'saved';
}

/**
 * @param {any} state
 * @param {any} event
 * @returns {any}
 */
export function routinesViewReducer(state, event) {
  const S = ROUTINES_VIEW_STATUS;
  const base = state || initialRoutinesState();
  switch (event?.type) {
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
      return { ...base, filter: event.filter === 'active' || event.filter === 'paused' ? event.filter : 'all' };
    case 'confirm-open':
      return { ...base, confirmName: typeof event.name === 'string' ? event.name : null };
    case 'confirm-close':
      return { ...base, confirmName: null };
    case 'mutate-start': {
      if (typeof event.name !== 'string' || !event.name) return base;
      if (base.pending.indexOf(event.name) !== -1) return { ...base, notice: null };
      return { ...base, pending: base.pending.concat([event.name]), notice: null };
    }
    case 'mutate-end': {
      const keep = [];
      for (const name of base.pending) {
        if (name !== event.name) keep.push(name);
      }
      return { ...base, pending: keep };
    }
    case 'optimistic-pause':
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((/** @type {any} */ job) => (jobIdOf(job) === event.name ? withPausedFlag(job, true) : job)),
      };
    case 'optimistic-resume':
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((/** @type {any} */ job) => (jobIdOf(job) === event.name ? withPausedFlag(job, false) : job)),
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

// Contrast tokens (measured foreground on background with the WCAG
// formula): ink #161616 on white 18.10, muted #595959 on white 7.00,
// white on accent #0b5fff 5.13, white on danger #b42318 6.57, white on
// pine #166534 7.13, badge ink #1f1f1f on #f2f2f2 14.72. The focus ring
// reuses the accent at 3px, above the 3.0 non-text floor. Error text
// uses the danger ink on white (6.57); the sidebar glyph stays
// host-rendered, so the view ships text badges instead of icons.
const VIEW_CSS = [
  '.hr-root{box-sizing:border-box;max-width:880px;margin:0 auto;padding:24px;font-family:inherit;color:#161616;background:#ffffff;}',
  '.hr-title{font-size:22px;line-height:1.3;margin:0 0 8px;color:#161616;}',
  '.hr-sub{margin:0 0 8px;color:#595959;font-size:14px;line-height:1.5;}',
  '.hr-label{display:block;font-weight:600;margin:16px 0 6px;color:#161616;}',
  '.hr-select,.hr-input{display:block;width:100%;max-width:420px;padding:8px 10px;font-size:14px;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;}',
  '.hr-fieldset{margin:20px 0 0;border:1px solid #d9d9d9;border-radius:8px;padding:16px;}',
  '.hr-fieldset legend{font-weight:600;padding:0 6px;color:#161616;}',
  '.hr-btn{display:inline-block;padding:8px 14px;font-size:14px;font-weight:600;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;cursor:pointer;}',
  '.hr-btn:disabled{opacity:0.55;cursor:not-allowed;}',
  '.hr-btn-primary{background:#0b5fff;border-color:#0b5fff;color:#ffffff;}',
  '.hr-btn-danger{background:#b42318;border-color:#b42318;color:#ffffff;}',
  '.hr-btn-current{outline:2px solid #0b5fff;outline-offset:2px;}',
  '.hr-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;}',
  '.hr-list{list-style:none;margin:12px 0;padding:0;}',
  '.hr-row-item{border:1px solid #d9d9d9;border-radius:8px;padding:12px;margin-bottom:8px;}',
  '.hr-row-id{font-weight:600;color:#161616;overflow-wrap:anywhere;}',
  '.hr-row-meta{color:#595959;font-size:13px;line-height:1.5;}',
  '.hr-row-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}',
  '.hr-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;}',
  '.hr-badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:8px;}',
  '.hr-badge-active{background:#166534;color:#ffffff;}',
  '.hr-badge-paused{background:#f2f2f2;color:#1f1f1f;border:1px solid #6e6e6e;}',
  '.hr-error{border:1px solid #b42318;border-left-width:6px;border-radius:8px;padding:12px;background:#ffffff;color:#161616;margin:12px 0;}',
  '.hr-error strong{color:#b42318;}',
  '.hr-empty{border:1px dashed #6e6e6e;border-radius:8px;padding:16px;color:#595959;margin:12px 0;}',
  '.hr-muted{color:#595959;font-size:14px;line-height:1.5;}',
  '.hr-status{margin-top:16px;color:#595959;font-size:13px;}',
  '.hr-root :focus-visible{outline:3px solid #0b5fff;outline-offset:2px;}',
  '@media (max-width:560px){.hr-row-actions{flex-direction:column;align-items:stretch;}}',
].join('\n');

function RoutinesView() {
  const [state, dispatch] = useState(initialRoutinesState);
  const [draftId, setDraftId] = useState('');
  const [draftSchedule, setDraftSchedule] = useState('');
  const [routesNonce, setRoutesNonce] = useState(0);
  const headingRef = useRef(null);
  const statusRef = useRef(null);
  const confirmRef = useRef(null);
  const selectedRoute = findRouteByKey(state.routes, state.selectedKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'routes-loading' });
    (async () => {
      try {
        const routes = await listProfileRoutes();
        if (!cancelled) dispatch({ type: 'routes-loaded', routes });
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: 'routes-error', error: wrapHostError(err, 'failed to list profile routes').message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routesNonce]);

  useEffect(() => {
    if (state.status !== S.LIST_LOADING) return undefined;
    let cancelled = false;
    (async () => {
      const route = findRouteByKey(state.routes, state.selectedKey);
      if (!route) {
        if (!cancelled) dispatch({ type: 'list-error', error: 'selected profile route is no longer available' });
        return;
      }
      try {
        const payload = await listRoutines(route);
        if (!cancelled) dispatch({ type: 'list-loaded', jobs: payload });
      } catch (err) {
        if (!cancelled) dispatch({ type: 'list-error', error: wrapHostError(err, 'failed to load routines').message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, state.routes, state.selectedKey]);

  useEffect(() => {
    if (state.confirmName && confirmRef.current && typeof confirmRef.current.focus === 'function') {
      confirmRef.current.focus();
    }
    return undefined;
  }, [state.confirmName]);

  useEffect(() => {
    if (
      (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) &&
      statusRef.current &&
      typeof statusRef.current.focus === 'function'
    ) {
      statusRef.current.focus();
    }
    return undefined;
  }, [state.status]);

  function focusHeading() {
    if (headingRef.current && typeof headingRef.current.focus === 'function') {
      headingRef.current.focus();
    }
  }

  function focusStatus() {
    if (statusRef.current && typeof statusRef.current.focus === 'function') {
      statusRef.current.focus();
    }
  }

  function handleRetryRoutes() {
    dispatch({ type: 'retry-routes' });
    setRoutesNonce((/** @type {any} */ n) => n + 1);
  }

  /**
   * @param {any} kind
   * @param {any} name
   * @param {any} build
   * @returns {AsyncBoolean}
   */
  async function runMutation(kind, name, build) {
    if (!selectedRoute) {
      dispatch({ type: 'mutation-error', error: 'select a profile route first' });
      return false;
    }
    let params;
    try {
      params = build();
    } catch (err) {
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'invalid routine ' + kind).message });
      return false;
    }
    if (isSafeOptimistic(kind)) {
      dispatch({ type: kind === 'pause' ? 'optimistic-pause' : 'optimistic-resume', name });
    }
    dispatch({ type: 'mutate-start', name });
    try {
      await requestCronForRoute(selectedRoute, 'cron.manage', params);
      dispatch({ type: 'mutate-end', name });
      dispatch({ type: 'notice', notice: 'routine ' + name + ' ' + pastTense(kind) });
      dispatch({ type: 'retry-list' });
      return true;
    } catch (err) {
      dispatch({ type: 'mutate-end', name });
      if (isSafeOptimistic(kind)) dispatch({ type: 'optimistic-rollback' });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to ' + kind + ' routine').message });
      return false;
    }
  }

  /**
   * @param {any} event
   * @returns {AsyncVoid}
   */
  async function handleCreate(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (locked) return;
    if (!selectedRoute) {
      dispatch({ type: 'mutation-error', error: 'select a profile route first' });
      return;
    }
    let params;
    try {
      params = buildAddParams(selectedRoute, { job_id: draftId, schedule: draftSchedule });
    } catch (err) {
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'invalid routine').message });
      return;
    }
    const name = params.name;
    dispatch({ type: 'mutate-start', name });
    try {
      await requestCronForRoute(selectedRoute, 'cron.manage', params);
      dispatch({ type: 'mutate-end', name });
      dispatch({ type: 'notice', notice: 'routine ' + name + ' created' });
      setDraftId('');
      setDraftSchedule('');
      dispatch({ type: 'retry-list' });
    } catch (err) {
      dispatch({ type: 'mutate-end', name });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to create routine').message });
    }
  }

  /**
   * @param {any} name
   * @returns {any}
   */
  function handlePause(name) {
    if (locked || !name) return undefined;
    return runMutation('pause', name, () => buildPauseParams(selectedRoute, name));
  }

  /**
   * @param {any} name
   * @returns {any}
   */
  function handleResume(name) {
    if (locked || !name) return undefined;
    return runMutation('resume', name, () => buildResumeParams(selectedRoute, name));
  }

  /**
   * @param {any} name
   * @returns {AsyncVoid}
   */
  async function handleRemoveConfirm(name) {
    dispatch({ type: 'confirm-close' });
    if (locked || !name) return;
    const ok = await runMutation('remove', name, () => buildRemoveParams(selectedRoute, name));
    if (ok) focusHeading();
    else focusStatus();
  }

  /**
   * @param {any} job
   * @param {any} name
   * @param {any} paused
   * @param {any} busyName
   * @returns {any}
   */
  function renderRowActions(job, name, paused, busyName) {
    if (state.confirmName === name) {
      return jsxs('div', {
        key: 'confirm',
        className: 'hr-confirm',
        role: 'group',
        'aria-label': 'Confirm removal of ' + name,
        children: [
          jsx('span', { key: 'q', className: 'hr-row-meta', children: 'Remove ' + name + '?' }),
          jsx('button', {
            key: 'yes',
            ref: confirmRef,
            type: 'button',
            className: 'hr-btn hr-btn-danger',
            disabled: locked,
            onClick: () => {
              handleRemoveConfirm(name);
            },
            children: 'Confirm remove',
          }),
          jsx('button', {
            key: 'no',
            type: 'button',
            className: 'hr-btn',
            disabled: locked,
            onClick: () => dispatch({ type: 'confirm-close' }),
            children: 'Cancel',
          }),
        ],
      });
    }
    return jsxs('div', {
      key: 'actions',
      className: 'hr-row-actions',
      children: [
        paused
          ? jsx('button', {
              key: 'resume',
              type: 'button',
              className: 'hr-btn',
              disabled: locked,
              onClick: () => handleResume(name),
              'aria-label': 'Resume ' + name,
              children: busyName ? 'Resuming…' : 'Resume',
            })
          : jsx('button', {
              key: 'pause',
              type: 'button',
              className: 'hr-btn',
              disabled: locked,
              onClick: () => handlePause(name),
              'aria-label': 'Pause ' + name,
              children: busyName ? 'Pausing…' : 'Pause',
            }),
        jsx('button', {
          key: 'remove',
          type: 'button',
          className: 'hr-btn hr-btn-danger',
          disabled: locked,
          onClick: () => dispatch({ type: 'confirm-open', name }),
          'aria-label': 'Remove ' + name,
          children: busyName ? 'Removing…' : 'Remove',
        }),
      ],
    });
  }

  function renderList() {
    const items = [];
    items.push(
      jsx('nav', {
        key: 'filters',
        className: 'hr-filters',
        'aria-label': 'Filter routines by status',
        children: ROUTINE_FILTERS.map((/** @type {any} */ entry) =>
          jsx('button', {
            key: entry.value,
            type: 'button',
            className: 'hr-btn' + (state.filter === entry.value ? ' hr-btn-current' : ''),
            'aria-current': state.filter === entry.value ? 'true' : undefined,
            disabled: locked,
            onClick: () => dispatch({ type: 'filter-changed', filter: entry.value }),
            children: entry.label,
          }),
        ),
      }),
    );
    if (shown.length === 0) {
      items.push(
        jsx('div', {
          key: 'empty',
          className: 'hr-empty',
          children:
            state.jobs.length === 0
              ? 'No routines yet. Create the first one below.'
              : 'No routines match this filter.',
        }),
      );
    } else {
      items.push(
        jsx('ul', {
          key: 'list',
          className: 'hr-list',
          'aria-label': 'Routines',
          children: shown.map((/** @type {any} */ job, /** @type {any} */ index) => {
            const name = jobIdOf(job) || 'routine ' + String(index + 1);
            const paused = jobPaused(job);
            const busyName = state.pending.indexOf(name) !== -1;
            return jsx('li', {
              key: String(index) + '::' + name,
              className: 'hr-row-item',
              children: [
                jsxs('div', {
                  key: 'main',
                  children: [
                    jsxs('span', {
                      key: 'title',
                      children: [
                        jsx('strong', { key: 'name', className: 'hr-row-id', children: name }),
                        jsx('span', {
                          key: 'badge',
                          className: paused ? 'hr-badge hr-badge-paused' : 'hr-badge hr-badge-active',
                          children: paused ? 'Paused' : 'Active',
                        }),
                      ],
                    }),
                    jsx('div', {
                      key: 'meta',
                      className: 'hr-row-meta',
                      children:
                        'Schedule: ' + String(job?.schedule || 'not set') + (busyName ? ' — Working…' : ''),
                    }),
                  ],
                }),
                renderRowActions(job, name, paused, busyName),
              ],
            });
          }),
        }),
      );
    }
    items.push(
      jsx('form', {
        key: 'create',
        className: 'hr-form',
        onSubmit: handleCreate,
        children: jsx('fieldset', {
          className: 'hr-fieldset',
          children: [
            jsx('legend', { key: 'legend', children: 'Create routine' }),
            jsx('label', {
              key: 'label-id',
              htmlFor: 'hermes-routines-job',
              className: 'hr-label',
              children: 'Routine id',
            }),
            jsx('input', {
              key: 'input-id',
              id: 'hermes-routines-job',
              className: 'hr-input',
              name: 'job_id',
              autoComplete: 'off',
              maxLength: 128,
              value: draftId,
              disabled: locked,
              onChange: (/** @type {any} */ event) => setDraftId(event && event.target ? String(event.target.value) : ''),
              placeholder: 'e.g. morning-brief',
            }),
            jsx('label', {
              key: 'label-schedule',
              htmlFor: 'hermes-routines-schedule',
              className: 'hr-label',
              children: 'Schedule',
            }),
            jsx('input', {
              key: 'input-schedule',
              id: 'hermes-routines-schedule',
              className: 'hr-input',
              name: 'schedule',
              autoComplete: 'off',
              maxLength: 256,
              value: draftSchedule,
              disabled: locked,
              onChange: (/** @type {any} */ event) => setDraftSchedule(event && event.target ? String(event.target.value) : ''),
              placeholder: 'e.g. 0 9 * * MON',
            }),
            jsx('p', {
              key: 'hint',
              className: 'hr-row-meta',
              children: 'Validated locally, then saved with cron.manage on the selected profile.',
            }),
            jsx('button', {
              key: 'submit',
              type: 'submit',
              className: 'hr-btn hr-btn-primary',
              disabled: locked || !selectedRoute,
              children: locked ? 'Saving…' : 'Create routine',
            }),
          ],
        }),
      }),
    );
    return jsxs(Fragment, { children: items });
  }

  let liveText = '';
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = 'Loading profile routes.';
  else if (state.status === S.LIST_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.READY) {
    if (state.routes.length === 0) liveText = 'No profile routes available.';
    else if (state.jobs.length === 0) liveText = 'No routines yet. Create the first one below.';
    else liveText = 'Showing ' + String(shown.length) + ' of ' + String(state.jobs.length) + ' routines.';
  }

  const body = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(jsx('p', { key: 'routes-loading', className: 'hr-muted', children: 'Loading profile routes.' }));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      jsxs('div', {
        key: 'routes-error',
        className: 'hr-error',
        role: 'alert',
        children: [
          jsx('strong', { key: 'title', children: 'Could not list profile routes.' }),
          jsx('p', { key: 'message', className: 'hr-row-meta', children: state.error || 'Unknown error.' }),
          jsx('button', { key: 'retry', type: 'button', className: 'hr-btn', onClick: handleRetryRoutes, children: 'Retry' }),
        ],
      }),
    );
  } else if (state.routes.length === 0) {
    body.push(
      jsxs('div', {
        key: 'routes-empty',
        className: 'hr-empty',
        children: [
          jsx('p', { key: 'message', children: 'No profile routes available. Connect a profile, then reload.' }),
          jsx('button', { key: 'reload', type: 'button', className: 'hr-btn', onClick: handleRetryRoutes, children: 'Reload routes' }),
        ],
      }),
    );
  } else {
    body.push(
      jsxs('div', {
        key: 'route-picker',
        children: [
          jsx('label', {
            key: 'label',
            htmlFor: 'hermes-routines-profile',
            className: 'hr-label',
            children: 'Profile connection',
          }),
          jsx('select', {
            key: 'select',
            id: 'hermes-routines-profile',
            className: 'hr-select',
            value: state.selectedKey || '',
            onChange: (/** @type {any} */ event) => {
              const next = event && event.target ? String(event.target.value) : '';
              if (next) dispatch({ type: 'route-changed', key: next });
            },
            children: state.routes.map((/** @type {any} */ route) => {
              let key;
              try {
                key = routeKey(route);
              } catch {
                return null;
              }
              return jsx('option', { key, value: key, children: key });
            }),
          }),
        ],
      }),
    );
  }

  if (selectedRoute) {
    if (state.status === S.LIST_LOADING) {
      body.push(jsx('p', { key: 'list-loading', className: 'hr-muted', children: 'Loading routines.' }));
    } else if (state.status === S.LIST_ERROR) {
      body.push(
        jsxs('div', {
          key: 'list-error',
          className: 'hr-error',
          role: 'alert',
          children: [
            jsx('strong', { key: 'title', children: 'Could not load routines.' }),
            jsx('p', { key: 'message', className: 'hr-row-meta', children: state.error || 'Unknown error.' }),
            jsx('button', {
              key: 'retry',
              type: 'button',
              className: 'hr-btn',
              onClick: () => dispatch({ type: 'retry-list' }),
              children: 'Retry',
            }),
          ],
        }),
      );
    } else if (state.status === S.READY) {
      body.push(renderList());
    }
  }

  return jsx('section', {
    id: 'hermes-routines-root',
    className: 'hr-root',
    'aria-labelledby': 'hermes-routines-heading',
    children: jsxs(Fragment, {
      children: [
        jsx('style', { key: 'css', children: VIEW_CSS }),
        jsx('h2', {
          key: 'heading',
          id: 'hermes-routines-heading',
          ref: headingRef,
          tabIndex: -1,
          className: 'hr-title',
          children: 'Routines',
        }),
        jsx('p', {
          key: 'intro',
          className: 'hr-sub',
          children: 'Per-profile routines. Reads and writes ride cron.manage through the selected profile route.',
        }),
        jsxs(Fragment, { key: 'body', children: body }),
        jsx('p', {
          key: 'live',
          ref: statusRef,
          tabIndex: -1,
          className: 'hr-status',
          role: 'status',
          'aria-live': 'polite',
          children: liveText || 'Routines ready.',
        }),
      ],
    }),
  });
}

// Route descriptor for one desktop profile connection.
// Shape follows PluginProfileRoute: connectionId plus profile pair.
// NOTE (copy-identity): the regions below must stay byte-identical
// with the canonical lib copy. Do not edit by hand —
// edit the lib and run the sync script with --write.
// Identity is by marked region + sha256 hash, never by parsing JS.
// @begin-sync cron-shapes-routing
/**
 * @param {PluginProfileRoute} route
 * @returns {string}
 */
export function routeKey(route) {
  if (!route || typeof route.connectionId !== 'string' || typeof route.profile !== 'string') {
    throw new TypeError('invalid route: connectionId and profile must be strings');
  }
  const connectionId = route.connectionId.trim();
  const profile = route.profile.trim();
  if (!connectionId || !profile) {
    throw new TypeError('invalid route: connectionId and profile must be non-empty');
  }
  return `${connectionId}::${profile}`;
}

/**
 * @param {any} entry
 * @returns {{ status: string, route: PluginProfileRoute | null, profile?: string }}
 */
export function resolveProfileRoute(entry) {
  if (!entry?.sourceScoped && !entry?.remoteSource) {
    return { status: 'not_scoped', route: null };
  }
  const candidate = entry.route || {
    connectionId: entry.connectionId,
    mode: entry.connectionKind === 'local' ? 'local' : 'remote',
    profile: entry.name,
    targetProfile: entry.targetProfile || entry.name,
  };
  if (candidate.mode !== undefined && candidate.mode !== 'local' && candidate.mode !== 'remote') {
    throw new TypeError(`invalid route mode: ${String(candidate.mode)}`);
  }
  const connectionId = String(candidate?.connectionId || '').trim();
  const profile = String(candidate?.profile || entry?.name || '').trim() || 'default';
  const targetProfile = String(candidate?.targetProfile || profile).trim() || profile;
  if (!connectionId) {
    return { status: 'owner_removed', route: null, profile };
  }
  const mode = candidate.mode === 'local' || connectionId === 'local' ? 'local' : 'remote';
  return {
    status: 'resolved',
    route: Object.freeze({ connectionId, mode, profile, targetProfile }),
  };
}

/**
 * @param {any} entry
 * @returns {PluginProfileRoute | null}
 */
export function profileRoute(entry) {
  const resolved = resolveProfileRoute(entry);
  if (resolved.status === 'owner_removed') {
    throw new Error(`Profile ${resolved.profile} has no connection owner`);
  }
  return resolved.route;
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {string} [fallbackProfile]
 * @returns {string}
 */
export function backendTargetProfile(route, fallbackProfile = 'default') {
  if (!route) {
    return fallbackProfile;
  }
  return route.targetProfile || route.profile;
}

/**
 * @param {PluginProfileRoute | null | undefined} route
 * @param {any} [params]
 * @param {RoutingOptions} [options]
 * @returns {any}
 */
export function scopedCronParams(route, params = {}, options = {}) {
  if (!route) {
    return params;
  }
  assertRoutingOptions(options);
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('scopedCronParams params must be a plain object');
  }
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    if (options?.allowUnscoped === true) {
      return params;
    }
    throw new TypeError(
      `scopedCronParams requires params.profile for ${route.connectionId}::${route.profile} (pass { allowUnscoped: true } to send unscoped intentionally)`,
    );
  }
  return { ...params, profile: target };
}

/**
 * @param {any} options
 * @returns {void}
 */
function assertRoutingOptions(options) {
  if (options === undefined) return;
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }
  if (options.allowActiveDoor !== undefined && typeof options.allowActiveDoor !== 'boolean') {
    throw new TypeError('options.allowActiveDoor must be a boolean');
  }
  if (options.allowUnscoped !== undefined && typeof options.allowUnscoped !== 'boolean') {
    throw new TypeError('options.allowUnscoped must be a boolean');
  }
}

/**
 * @param {any} timeoutMs
 * @returns {void}
 */
export function assertTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined) return;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative finite number');
  }
}
// @end-sync cron-shapes-routing

// Gateway RPC on the entry owning connection. Entries with a resolved
// route descriptor ride host.requestProfile. Fail-closed: with no resolved
// route the active gateway door (`host.request`) opens ONLY with the
// explicit opt-in `{ allowActiveDoor: true }`. Same dispatch shape as
// cross-connection routing elsewhere, reimplemented here so this file
// stays dependency free.
// Route type: PluginProfileRoute from the host registry.
// NOTE: this overload binds the imported `host`, unlike the lib version
// which takes `host` as a parameter (see copy-identity test).
/**
 * @param {any} target
 * @param {string} method
 * @param {any} [params]
 * @param {any} [timeoutMs]
 * @param {RoutingOptions} [options]
 * @returns {AsyncUnknown}
 */
export async function requestCronForRoute(target, method, params = {}, timeoutMs, options = {}) {
  assertTimeoutMs(timeoutMs);
  assertRoutingOptions(options);
  const route = target && target.connectionId ? target : profileRoute(target);
  if (route) {
    if (typeof host.requestProfile !== 'function') {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params, { allowUnscoped: options?.allowUnscoped });
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped)
      : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (options?.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`,
    );
  }
  if (typeof host.request !== 'function') {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}

// Inventory every credential free route, then read that profile own
// cron store. Route type: PluginProfileRoute from host.profileRoutes.
/**
 * @returns {AsyncRoutes}
 */
export async function listProfileRoutes() {
  try {
    return await host.profileRoutes();
  } catch (/** @type {any} */ err) {
    throw new Error(`failed to list profile routes: ${err?.message || err}`, { cause: err });
  }
}

// List helper scoped to one profile route via cron.manage.
// Route type: PluginProfileRoute; backend field profile carries target.
// Fail-closed: a resolved route is required — never fall back to the
// active gateway door for an explicitly scoped read.
/**
 * @param {PluginProfileRoute | null | undefined} route
 * @returns {AsyncUnknown}
 */
export async function listRoutines(route) {
  if (!route?.connectionId) {
    throw new Error('listRoutines requires a resolved profile route');
  }
  const target = backendTargetProfile(route, '');
  if (!target) {
    throw new Error('listRoutines requires a route with profile/targetProfile');
  }
  return requestCronForRoute(route, 'cron.manage', {
    action: 'list',
    include_disabled: true,
    profile: target,
  });
}

// ── cron action shapes (copy-identity with the canonical lib copy) ──
// Canonical source is the lib (zero imports). This file must stay
// dependency free (no relative imports allowed), so the builders below
// are verbatim copies. tests/routines-view.test.mjs pins identity;
// run the sync check plus the suite after editing the lib.
// @begin-sync cron-shapes-builders
const MAX_JOB_ID_LENGTH = 128;
const JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MAX_SCHEDULE_LENGTH = 256;

/**
 * @param {any} job_id
 * @returns {string}
 */
function assertJobId(job_id) {
  if (typeof job_id !== 'string') {
    throw new TypeError('job_id must be a non-empty string');
  }
  const id = job_id.trim();
  if (!id) {
    throw new TypeError('job_id must be a non-empty string');
  }
  if (id.length > MAX_JOB_ID_LENGTH || !JOB_ID_RE.test(id)) {
    throw new TypeError('job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars');
  }
  return id;
}

/**
 * @param {any} schedule
 * @returns {string}
 */
function assertSchedule(schedule) {
  if (typeof schedule !== 'string') {
    throw new TypeError('schedule must be a non-empty string');
  }
  const s = schedule.trim();
  if (!s) {
    throw new TypeError('schedule must be a non-empty string');
  }
  if (s.length > MAX_SCHEDULE_LENGTH) {
    throw new TypeError('schedule must be at most 256 chars');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(s)) {
    throw new TypeError('schedule must not contain control characters');
  }
  return s;
}

/**
 * @param {any} payload
 * @returns {Record<string, unknown>}
 */
function assertPayload(payload) {
  if (payload === undefined) return {};
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be a plain object');
  }
  return payload;
}

/**
 * @param {any} value
 * @returns {any}
 */
function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch (/** @type {any} */ err) {
    if (err?.name === 'DataCloneError') {
      throw new TypeError(`uncloneable value: ${err?.message || 'DataCloneError'}`, { cause: err });
    }
    throw err;
  }
}

/**
 * @param {any} [jobs]
 * @returns {{ action: string, jobs: any[] }}
 */
export function listJobs(jobs = []) {
  const items = Array.isArray(jobs) ? jobs.map((j) => cloneValue(j)) : [];
  return { action: 'list', jobs: items };
}

/**
 * @param {{ job_id?: any, schedule?: any, payload?: any }} [input]
 * @returns {{ action: string, name: string, schedule: string, payload: Record<string, unknown> }}
 */
export function addJob({ job_id, schedule, payload = {} } = {}) {
  const id = assertJobId(job_id);
  const normalizedSchedule = assertSchedule(schedule);
  const cleanPayload = assertPayload(payload);
  return {
    action: 'add',
    name: id,
    schedule: normalizedSchedule,
    payload: cloneValue(cleanPayload),
  };
}

/**
 * @param {any} job_id
 * @returns {{ action: string, name: string }}
 */
export function removeJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'remove', name: id };
}

/**
 * @param {any} job_id
 * @returns {{ action: string, name: string }}
 */
export function pauseJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'pause', name: id };
}

/**
 * @param {any} job_id
 * @returns {{ action: string, name: string }}
 */
export function resumeJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'resume', name: id };
}
// @end-sync cron-shapes-builders

/**
 * Single mount: one ROUTES_AREA page plus one SIDEBAR_NAV_AREA row. Never
 * `panes`. `component` in definePlugin below stays as entry metadata only
 * (no second render — see mount note in docs/INSTALL.md).
 * @param {PluginContext} ctx
 * @returns {void}
 */
export function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => jsx(RoutinesView, {}),
  });
  ctx.register({
    id: SIDEBAR_ID,
    area: SIDEBAR_NAV_AREA,
    order: 50,
    data: { path: ROUTE_PATH, label: 'Routines', codicon: 'history' },
  });
}

/** @type {PluginDefinition} */
export const plugin = definePlugin({
  id: ID,
  name: 'Routines',
  version: '0.1.0',
  component: RoutinesView,
  register,
});

export default plugin;
