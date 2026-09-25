import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { host, useValue, type PluginProfileRoute } from '@hermes/plugin-sdk';
import {
  ROUTINES_VIEW_STATUS,
  initialRoutinesState,
  routinesViewReducer,
  type RoutinesEvent,
  type RoutinesState,
} from '../state/routinesState';
import { findRouteByKey } from '../domain/routing';
import { jobIdOf, visibleJobs } from '../domain/jobs';
import { humanScheduleOf, routineTitle } from '../domain/present';
import { wrapHostError } from '../lib/errors';
import {
  buildAddParams,
  buildListParams,
  buildPauseParams,
  buildResumeParams,
  isSafeOptimistic,
} from '../gateway/cronParams';
import { listProfileRoutes, listRoutines, requestCronForRoute } from '../gateway/cronGateway';
import { ROUTINES_CSS } from './routinesStyles';
import { FilterNav } from './FilterNav';
import { RoutineList } from './RoutineList';
import { RoutineInspectorPanel } from './RoutineInspectorPanel';
import { RoutineComposerPanel } from './RoutineComposerPanel';
import { StatusLine } from './panels';
import {
  EmptyFilterState,
  EmptyState,
  ErrorState,
  LoadingState,
  StaleBanner,
  UnavailableState,
} from './RoutineStates';

// Routines page for the Desktop's active profile connection.
//
// Data flow (fail-closed, active-profile bound): the Desktop owns the
// active profile (`host.state.profile` + `host.state.connectionId`,
// subscribed via `useValue`). Routes come from `host.profileRoutes()` and
// are used ONLY to locate the exact descriptor for that active identity;
// the view never offers a picker and never falls back to another profile.
// listRoutines() rides host.requestProfile for cron.manage at the host's
// default (background) dial priority; the user actions — pause, resume,
// create — pass { spawnPriority: 'foreground' } so their possible
// cold-start takes the pool's reserved interactive slot. A missing
// route shows the unavailable state instead of guessing a backend, and the
// view never passes the active-door opt-in.
//
// Races: every list round carries its connection-qualified key. A request
// for profile A that resolves after the switch to B is ignored twice —
// once by the generation guard in the effect, once by the reducer's key
// check — so the UI keeps showing only B.
//
// State: one reducer (routinesViewReducer). Every dispatch is a functional
// update, so each event becomes exactly one transition. Optimism (rollback
// only where safe): pause and resume are optimistic with snapshot
// rollback; isSafeOptimistic pins the policy and is covered by tests.
//
// Scope of this surface: list / details / create / pause / resume. Create
// rides the composer panel and the upstream `cron.manage add` contract
// (name + schedule + prompt); delete, edit and run-now are not part of
// this view and have no interface here.

function pastTense(kind: string): string {
  if (kind === 'pause') return 'paused';
  if (kind === 'resume') return 'resumed';
  return 'saved';
}

export function RoutinesPage() {
  const [state, setState] = useState<RoutinesState>(initialRoutinesState);
  const [routesNonce, setRoutesNonce] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const generationRef = useRef(0);

  // Reactive active identity: the ONLY profile this page represents.
  const activeProfile = useValue(host.state.profile);
  const activeConnectionId = useValue(host.state.connectionId);

  // One event = one reducer transition: setState only ever receives a
  // functional update. dispatch is stable, so effects can list it safely.
  const dispatch = useCallback((event: RoutinesEvent): void => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);

  const activeRoute: PluginProfileRoute | null = findRouteByKey(state.routes, state.activeKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobName, setSelectedJobName] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Clear selected job if it is no longer present in the jobs inventory
  useEffect(() => {
    if (selectedJobName === null) return;
    const stillThere = state.jobs.some(
      (job, index) => (jobIdOf(job) || `routine ${index + 1}`) === selectedJobName,
    );
    if (!stillThere) setSelectedJobName(null);
  }, [state.jobs, selectedJobName]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shown;
    return shown.filter((job) => {
      const name = (routineTitle(job, '') || jobIdOf(job)).toLowerCase();
      const schedule = (humanScheduleOf(job) || '').toLowerCase();
      return name.includes(q) || schedule.includes(q);
    });
  }, [shown, searchQuery]);

  const selectedJob = useMemo(() => {
    if (!selectedJobName) return null;
    return (
      state.jobs.find(
        (j, index) => (jobIdOf(j) || `routine ${index + 1}`) === selectedJobName,
      ) ?? null
    );
  }, [state.jobs, selectedJobName]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'routes-loading' });
    void (async () => {
      try {
        const routes = await listProfileRoutes();
        if (cancelled) return;
        // Read the identity fresh at response time: the profile may have
        // switched while the inventory was in flight.
        dispatch({
          type: 'routes-loaded',
          routes,
          profile: host.state.profile.get(),
          connectionId: host.state.connectionId.get(),
        });
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: 'routes-error', error: wrapHostError(err, 'failed to list profile routes').message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routesNonce, dispatch]);

  // Follow the Desktop's profile switches. Guarded until the route
  // inventory exists so the first paint stays in routes-loading instead
  // of flashing unavailable.
  useEffect(() => {
    if (state.status === S.ROUTES_LOADING || state.status === S.ROUTES_ERROR) return;
    if (state.routes.length === 0 && state.status !== S.ROUTE_UNAVAILABLE) return;
    dispatch({ type: 'active-changed', profile: activeProfile, connectionId: activeConnectionId });
  }, [activeProfile, activeConnectionId, state.status, state.routes.length, dispatch, S.ROUTES_LOADING, S.ROUTES_ERROR, S.ROUTE_UNAVAILABLE]);

  useEffect(() => {
    if (state.status !== S.LIST_LOADING) return undefined;
    if (!state.activeKey) return undefined;
    const key = state.activeKey;
    const route = findRouteByKey(state.routes, key);
    if (!route) {
      dispatch({ type: 'list-error', error: 'the active profile route is no longer available', key });
      return undefined;
    }
    // listRoutines validates the scoped envelope up front (fail-closed);
    // build the params first so a scoping fault surfaces without a host call.
    try {
      buildListParams(route);
    } catch (err) {
      dispatch({ type: 'list-error', error: wrapHostError(err, 'failed to load routines').message, key });
      return undefined;
    }
    const generation = (generationRef.current += 1);
    let cancelled = false;
    void (async () => {
      try {
        const payload = await listRoutines(route);
        if (!cancelled && generation === generationRef.current) {
          dispatch({ type: 'list-loaded', jobs: payload, key });
        }
      } catch (err) {
        if (!cancelled && generation === generationRef.current) {
          dispatch({ type: 'list-error', error: wrapHostError(err, 'failed to load routines').message, key });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, state.routes, state.activeKey, dispatch, S.LIST_LOADING]);

  useEffect(() => {
    if (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) statusRef.current?.focus();
  }, [state.status, S.ROUTES_ERROR, S.LIST_ERROR]);

  function handleRetryRoutes(): void {
    setRoutesNonce((nonce) => nonce + 1);
  }

  async function runMutation(
    kind: 'pause' | 'resume',
    name: string,
    build: () => Record<string, unknown>,
  ): Promise<boolean> {
    if (!activeRoute) {
      dispatch({ type: 'mutation-error', error: 'the active profile route is no longer available' });
      return false;
    }
    let params: Record<string, unknown>;
    try {
      params = build();
    } catch (err) {
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'invalid routine ' + kind).message });
      return false;
    }
    if (isSafeOptimistic(kind)) {
      dispatch(kind === 'pause' ? { type: 'optimistic-pause', name } : { type: 'optimistic-resume', name });
    }
    dispatch({ type: 'mutate-start', name });
    try {
      // User-initiated mutation: foreground so a cold-started backend takes
      // the pool's interactive slot instead of timing out behind it.
      await requestCronForRoute(activeRoute, 'cron.manage', params, undefined, {
        spawnPriority: 'foreground',
      });
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

  function handlePause(name: string): void {
    if (locked || !name || !activeRoute) return;
    const route = activeRoute;
    void runMutation('pause', name, () => buildPauseParams(route, name));
  }

  function handleResume(name: string): void {
    if (locked || !name || !activeRoute) return;
    const route = activeRoute;
    void runMutation('resume', name, () => buildResumeParams(route, name));
  }

  async function handleCreateRoutine(
    name: string,
    schedule: string,
    prompt: string,
    active: boolean,
  ): Promise<boolean> {
    if (!activeRoute) {
      dispatch({ type: 'mutation-error', error: 'the active profile route is no longer available' });
      return false;
    }
    const route = activeRoute;
    try {
      const addParams = buildAddParams(route, { job_id: name, schedule, prompt });
      dispatch({ type: 'mutate-start', name });
      await requestCronForRoute(route, 'cron.manage', addParams, undefined, {
        spawnPriority: 'foreground',
      });
      if (!active) {
        const pauseParams = buildPauseParams(route, name);
        await requestCronForRoute(route, 'cron.manage', pauseParams, undefined, {
          spawnPriority: 'foreground',
        });
      }
      dispatch({ type: 'mutate-end', name });
      dispatch({ type: 'notice', notice: 'routine ' + name + ' created' });
      dispatch({ type: 'retry-list' });
      setIsCreating(false);
      return true;
    } catch (err) {
      dispatch({ type: 'mutate-end', name });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to create routine').message });
      return false;
    }
  }

  function renderList(): ReactNode {
    const totalCount = state.jobs.length;
    const shownCount = filteredJobs.length;
    const isReduced = shownCount < totalCount;
    const countText = isReduced
      ? `Showing ${shownCount} of ${totalCount} routines.`
      : `Showing all ${totalCount} routines.`;

    return (
      <>
        <div className="hr-toolbar">
          <div className="hr-search-wrap">
            <input
              type="text"
              className="hr-search-input"
              placeholder="Search routines…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search routines"
            />
            {searchQuery ? (
              <button
                type="button"
                className="hr-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            ) : null}
          </div>
          <div className="hr-filters-col">
            <FilterNav
              filter={state.filter}
              disabled={locked}
              onSelect={(value) => dispatch({ type: 'filter-changed', filter: value })}
            />
            {state.status === S.READY && totalCount > 0 ? (
              <span className="hr-count-right">
                {countText}
              </span>
            ) : null}
          </div>
        </div>
        {filteredJobs.length === 0 ? (
          state.jobs.length === 0 ? (
            <EmptyState />
          ) : (
            <EmptyFilterState />
          )
        ) : (
          <RoutineList
            jobs={filteredJobs}
            pending={state.pending}
            locked={locked}
            inspectedId={selectedJobName}
            onInspect={(name) => {
              setSelectedJobName(name);
              if (name) setIsCreating(false);
            }}
            onPause={handlePause}
            onResume={handleResume}
          />
        )}
      </>
    );
  }

  let liveText = '';
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.LIST_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.ROUTE_UNAVAILABLE) liveText = 'Routines unavailable for this profile.';
  else if (state.status === S.READY) {
    if (state.jobs.length === 0) liveText = 'No routines yet.';
    else liveText = `Showing ${shown.length} of ${state.jobs.length} routines.`;
  }

  const body: ReactNode[] = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(<LoadingState key="routes-loading" text="Loading routines." />);
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      <ErrorState
        key="routes-error"
        title="Could not list routines."
        message={state.error || 'Unknown error.'}
        onRetry={handleRetryRoutes}
      />,
    );
  } else if (state.status === S.ROUTE_UNAVAILABLE) {
    body.push(
      <UnavailableState
        key="route-unavailable"
        profile={state.activeProfile ?? (typeof activeProfile === 'string' ? activeProfile : null)}
        onRetry={handleRetryRoutes}
      />,
    );
  } else if (state.status === S.LIST_LOADING) {
    if (state.jobs.length > 0) {
      body.push(
        <StaleBanner key="stale-loading" onRetry={() => dispatch({ type: 'retry-list' })} />,
      );
      body.push(<div key="stale-list">{renderList()}</div>);
    } else {
      body.push(<LoadingState key="list-loading" text="Loading routines." />);
    }
  } else if (state.status === S.LIST_ERROR) {
    if (state.jobs.length > 0) {
      body.push(
        <StaleBanner key="stale-error" onRetry={() => dispatch({ type: 'retry-list' })} />,
      );
      body.push(<div key="stale-list-error">{renderList()}</div>);
    }
    body.push(
      <ErrorState
        key="list-error"
        title="Could not load routines."
        message={state.error || 'Unknown error.'}
        onRetry={() => dispatch({ type: 'retry-list' })}
      />,
    );
  } else if (state.status === S.READY) {
    body.push(<div key="ready-list">{renderList()}</div>);
  }

  const profileLabel = typeof activeProfile === 'string' && activeProfile ? activeProfile : '—';

  return (
    <section id="hermes-routines-root" className="hr-root" aria-labelledby="hermes-routines-heading">
      <style>{ROUTINES_CSS}</style>
      <div className="hr-workspace">
        <div className={`hr-feed-column${!selectedJob && !isCreating ? ' hr-feed-contained' : ''}`}>
          <header className="hr-header">
            <div className="hr-header-top">
              <h2 id="hermes-routines-heading" ref={headingRef} tabIndex={-1} className="hr-title">
                Routines
              </h2>
              <button
                type="button"
                className="hr-btn-new"
                onClick={() => {
                  setSelectedJobName(null);
                  setIsCreating(true);
                }}
                aria-label="New routine"
                title="New routine"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <span className="hr-sr-only">Profile: {profileLabel}</span>
            </div>
            <p className="hr-sub">
              Routines are scheduled jobs this profile runs to do recurring tasks.
            </p>
          </header>
          {body}
        </div>
        {selectedJob ? (
          <RoutineInspectorPanel
            job={selectedJob}
            fallback={selectedJobName || 'Routine'}
            activeRoute={activeRoute}
            activeProfile={state.activeProfile ?? (typeof activeProfile === 'string' ? activeProfile : null)}
            busy={state.pending.indexOf(selectedJobName || '') !== -1}
            disabled={locked}
            onClose={() => setSelectedJobName(null)}
            onPause={() => handlePause(jobIdOf(selectedJob) || selectedJobName || '')}
            onResume={() => handleResume(jobIdOf(selectedJob) || selectedJobName || '')}
          />
        ) : isCreating ? (
          <RoutineComposerPanel
            activeRoute={activeRoute}
            activeProfile={state.activeProfile ?? (typeof activeProfile === 'string' ? activeProfile : null)}
            disabled={locked}
            onClose={() => setIsCreating(false)}
            onSubmit={handleCreateRoutine}
          />
        ) : null}
      </div>

      <StatusLine text={liveText} statusRef={statusRef} />
    </section>
  );
}
