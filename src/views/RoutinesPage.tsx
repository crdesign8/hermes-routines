import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import {
  ROUTINES_VIEW_STATUS,
  initialRoutinesState,
  routinesViewReducer,
  type RoutinesEvent,
  type RoutinesState,
} from '../state/routinesState';
import { findRouteByKey } from '../domain/routing';
import { jobIdOf, jobPaused, visibleJobs } from '../domain/jobs';
import { wrapHostError } from '../lib/errors';
import {
  buildAddParams,
  buildListParams,
  buildPauseParams,
  buildRemoveParams,
  buildResumeParams,
  isSafeOptimistic,
} from '../gateway/cronParams';
import { listProfileRoutes, listRoutines, requestCronForRoute } from '../gateway/cronGateway';
import { ROUTINES_CSS } from './routinesStyles';
import { RoutePicker } from './RoutePicker';
import { FilterNav } from './FilterNav';
import { RoutineRow } from './RoutineRow';
import { CreateRoutineForm } from './CreateRoutineForm';
import { EmptyPanel, ErrorPanel, StatusLine } from './panels';

// Routines page for one desktop profile connection.
//
// Data flow (fail-closed): routes come from host.profileRoutes(); the
// selected route loads through listRoutines(), which rides
// host.requestProfile for cron.manage. A missing route never slides into
// the active gateway door: listRoutines rejects and the view shows an
// error with retry instead of guessing a backend. The view never passes
// the active-door opt-in.
//
// State: one reducer (routinesViewReducer). Every dispatch is a functional
// update, so each event becomes exactly one transition — never a raw
// object assignment. Optimism policy (rollback only where the semantics
// are safe):
// - pause and resume are optimistic with snapshot rollback: one reversible
//   idempotent flag, snapshot restores the exact prior rows on failure.
// - create is never optimistic: the backend owns schedule normalization
//   and the canonical list, so an unconfirmed row could duplicate on retry.
// - remove is never optimistic: removal destroys data, so the row stays
//   visible and marked busy until the host confirms.
// isSafeOptimistic pins this policy and is covered by tests.
//
// While any mutation is in flight the remaining mutation buttons stay
// disabled, so optimistic snapshots never overlap.

function pastTense(kind: string): string {
  if (kind === 'pause') return 'paused';
  if (kind === 'resume') return 'resumed';
  if (kind === 'remove') return 'removed';
  return 'saved';
}

export function RoutinesPage() {
  const [state, setState] = useState<RoutinesState>(initialRoutinesState);
  const [draftId, setDraftId] = useState('');
  const [draftSchedule, setDraftSchedule] = useState('');
  const [routesNonce, setRoutesNonce] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // One event = one reducer transition: setState only ever receives a
  // functional update. dispatch is stable, so effects can list it safely.
  const dispatch = useCallback((event: RoutinesEvent): void => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);

  const selectedRoute = findRouteByKey(state.routes, state.selectedKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'routes-loading' });
    void (async () => {
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
  }, [routesNonce, dispatch]);

  useEffect(() => {
    if (state.status !== S.LIST_LOADING) return undefined;
    let cancelled = false;
    void (async () => {
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
  }, [state.status, state.routes, state.selectedKey, dispatch]);

  useEffect(() => {
    if (state.confirmName) confirmRef.current?.focus();
  }, [state.confirmName]);

  useEffect(() => {
    if (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) statusRef.current?.focus();
  }, [state.status]);

  function focusHeading(): void {
    headingRef.current?.focus();
  }

  function focusStatus(): void {
    statusRef.current?.focus();
  }

  function handleRetryRoutes(): void {
    dispatch({ type: 'retry-routes' });
    setRoutesNonce((nonce) => nonce + 1);
  }

  async function runMutation(
    kind: 'pause' | 'resume' | 'remove',
    name: string,
    build: () => Record<string, unknown>,
  ): Promise<boolean> {
    if (!selectedRoute) {
      dispatch({ type: 'mutation-error', error: 'select a profile route first' });
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

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (locked) return;
    if (!selectedRoute) {
      dispatch({ type: 'mutation-error', error: 'select a profile route first' });
      return;
    }
    let params: Record<string, unknown>;
    try {
      params = buildAddParams(selectedRoute, { job_id: draftId, schedule: draftSchedule });
    } catch (err) {
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'invalid routine').message });
      return;
    }
    const name = typeof params.name === 'string' ? params.name : '';
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

  function handlePause(name: string): Promise<boolean> | undefined {
    if (locked || !name) return undefined;
    return runMutation('pause', name, () => buildPauseParams(selectedRoute, name));
  }

  function handleResume(name: string): Promise<boolean> | undefined {
    if (locked || !name) return undefined;
    return runMutation('resume', name, () => buildResumeParams(selectedRoute, name));
  }

  async function handleRemoveConfirm(name: string): Promise<void> {
    dispatch({ type: 'confirm-close' });
    if (locked || !name) return;
    const ok = await runMutation('remove', name, () => buildRemoveParams(selectedRoute, name));
    if (ok) focusHeading();
    else focusStatus();
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
          <EmptyPanel
            message={
              state.jobs.length === 0
                ? 'No routines yet. Create the first one below.'
                : 'No routines match this filter.'
            }
          />
        ) : (
          <ul className="hr-list" aria-label="Routines">
            {shown.map((job, index) => {
              const name = jobIdOf(job) || `routine ${index + 1}`;
              const paused = jobPaused(job);
              const busy = state.pending.indexOf(name) !== -1;
              return (
                <RoutineRow
                  key={`${index}::${name}`}
                  job={job}
                  name={name}
                  paused={paused}
                  busy={busy}
                  confirming={state.confirmName === name}
                  disabled={locked}
                  confirmRef={confirmRef}
                  onPause={() => handlePause(name)}
                  onResume={() => handleResume(name)}
                  onRemoveOpen={() => dispatch({ type: 'confirm-open', name })}
                  onConfirmRemove={() => void handleRemoveConfirm(name)}
                  onCancel={() => dispatch({ type: 'confirm-close' })}
                />
              );
            })}
          </ul>
        )}
        <CreateRoutineForm
          draftId={draftId}
          draftSchedule={draftSchedule}
          locked={locked}
          canSubmit={selectedRoute !== null}
          onDraftIdChange={setDraftId}
          onDraftScheduleChange={setDraftSchedule}
          onSubmit={handleCreate}
        />
      </>
    );
  }

  let liveText = '';
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = 'Loading profile routes.';
  else if (state.status === S.LIST_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.READY) {
    if (state.routes.length === 0) liveText = 'No profile routes available.';
    else if (state.jobs.length === 0) liveText = 'No routines yet. Create the first one below.';
    else liveText = `Showing ${shown.length} of ${state.jobs.length} routines.`;
  }

  const body: ReactNode[] = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(<p key="routes-loading" className="hr-muted">Loading profile routes.</p>);
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      <ErrorPanel
        key="routes-error"
        title="Could not list profile routes."
        message={state.error || 'Unknown error.'}
        onRetry={handleRetryRoutes}
      />,
    );
  } else if (state.routes.length === 0) {
    body.push(
      <EmptyPanel
        key="routes-empty"
        message="No profile routes available. Connect a profile, then reload."
        actionLabel="Reload routes"
        onAction={handleRetryRoutes}
      />,
    );
  } else {
    body.push(
      <RoutePicker
        key="route-picker"
        routes={state.routes}
        selectedKey={state.selectedKey}
        onSelect={(key) => dispatch({ type: 'route-changed', key })}
      />,
    );
  }

  if (selectedRoute) {
    if (state.status === S.LIST_LOADING) {
      body.push(<p key="list-loading" className="hr-muted">Loading routines.</p>);
    } else if (state.status === S.LIST_ERROR) {
      body.push(
        <ErrorPanel
          key="list-error"
          title="Could not load routines."
          message={state.error || 'Unknown error.'}
          onRetry={() => dispatch({ type: 'retry-list' })}
        />,
      );
    } else if (state.status === S.READY) {
      body.push(renderList());
    }
  }

  return (
    <section id="hermes-routines-root" className="hr-root" aria-labelledby="hermes-routines-heading">
      <style>{ROUTINES_CSS}</style>
      <h2 id="hermes-routines-heading" ref={headingRef} tabIndex={-1} className="hr-title">
        Routines
      </h2>
      <p className="hr-sub">
        Per-profile routines. Reads and writes ride cron.manage through the selected profile route.
      </p>
      {body}
      <StatusLine text={liveText} statusRef={statusRef} />
    </section>
  );
}
