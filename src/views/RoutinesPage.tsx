import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { host, useValue, type PluginProfileRoute } from '@hermes/plugin-sdk';
import {
  ROUTINES_VIEW_STATUS,
  initialRoutinesState,
  routinesViewReducer,
  type RoutinesEvent,
  type RoutinesState,
} from '../state/routinesState';
import { findRouteByKey } from '../domain/routing';
import { visibleJobs } from '../domain/jobs';
import { wrapHostError } from '../lib/errors';
import {
  buildListParams,
  buildPauseParams,
  buildResumeParams,
  isSafeOptimistic,
} from '../gateway/cronParams';
import { listProfileRoutes, listRoutines, requestCronForRoute } from '../gateway/cronGateway';
import { ROUTINES_CSS } from './routinesStyles';
import { FilterNav } from './FilterNav';
import { RoutineList } from './RoutineList';
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
// listRoutines() rides host.requestProfile for cron.manage. A missing
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
// Scope of this surface: list / details / pause / resume. Create, delete,
// edit and run-now are not part of this view; their builders stay in the
// domain layer but drive no interface here.

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
      await requestCronForRoute(activeRoute, 'cron.manage', params);
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

  function renderList(): ReactNode {
    return (
      <>
        <FilterNav
          filter={state.filter}
          disabled={locked}
          onSelect={(value) => dispatch({ type: 'filter-changed', filter: value })}
        />
        {shown.length === 0 ? (
          state.jobs.length === 0 ? (
            <EmptyState />
          ) : (
            <EmptyFilterState />
          )
        ) : (
          <RoutineList
            jobs={shown}
            pending={state.pending}
            locked={locked}
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
      <h2 id="hermes-routines-heading" ref={headingRef} tabIndex={-1} className="hr-title">
        Routines
      </h2>
      <p className="hr-sub">
        Routines are scheduled jobs this profile runs to do recurring tasks.
      </p>
      <p className="hr-profile" aria-live="polite">
        Profile: <strong>{profileLabel}</strong>
      </p>
      {state.status === S.READY && state.jobs.length > 0 ? (
        <p className="hr-count">
          Showing {shown.length} of {state.jobs.length} routines.
        </p>
      ) : null}
      {body}
      <StatusLine text={liveText} statusRef={statusRef} />
    </section>
  );
}
