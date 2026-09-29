import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { host, useValue, type PluginProfileRoute } from '@hermes/plugin-sdk';
import {
  ROUTINES_VIEW_STATUS,
  initialRoutinesState,
  routinesViewReducer,
  type RoutinesEvent,
  type RoutinesState,
} from '../state/routinesState';
import { findRouteByKey } from '../domain/routing';
import { jobIdFromResponse, jobIdOf, visibleJobs } from '../domain/jobs';
import { humanScheduleOf, routineKey, routinePromptOf, routineTitle } from '../domain/present';
import { wrapHostError } from '../lib/errors';
import {
  buildAddParams,
  buildListParams,
  buildPauseParams,
  buildResumeParams,
  isSafeOptimistic,
} from '../gateway/cronParams';
import { listProfileRoutes, listRoutines, requestCronForRoute } from '../gateway/cronGateway';
import { createProvisionalRoutine } from '../gateway/provisionalCreate';
import { launchGuidedConfiguration, type GuidedLaunchResult } from '../gateway/guidedLaunch';
import {
  buildReopenHandle,
  cronOutcomeOf,
  guidedConfigCandidateOf,
  type ProvisionalRoutine,
} from '../domain/provisional';
import { ROUTINES_CSS } from './routinesStyles';
import { FilterNav } from './FilterNav';
import { RoutineList } from './RoutineList';
import { INSPECTOR_PANEL_ID, RoutineInspectorPanel } from './RoutineInspectorPanel';
import {
  NEW_ROUTINE_CONTROL_ID,
  dismissFocusId,
  escapeLeavesPanel,
  focusById,
  routineRowFocusId,
} from './PanelNav';
import { RoutineComposerPanel } from './RoutineComposerPanel';
import { GuidedRoutinePanel } from './GuidedRoutinePanel';
import { StatusLine } from './panels';
import {
  EmptyFilterState,
  EmptyState,
  ErrorState,
  LoadingState,
  NeedsConfigurationNotice,
  StaleBanner,
  UnavailableState,
  type GuidedReopenTarget,
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
// (name + schedule + prompt) and lets Hermes mint the job_id; delete, edit
// and run-now are not part of this view and have no interface here.
//
// Identity: rows are addressed by their canonical `job_id` (pause/resume,
// optimistic flips, pending/busy). `name` is display text only — shown as
// the card title, never sent as a mutation target. A row without a usable
// job_id stays visible but refuses mutation (buttons disabled, builder
// fail-closed) instead of guessing identity from its title. Creating a
// routine on hold pauses the row the backend just minted, using the
// `job_id` from the add answer.

function pastTense(kind: string): string {
  if (kind === 'pause') return 'paused';
  if (kind === 'resume') return 'resumed';
  return 'saved';
}

/** The guided panel's inputs: an addressable handle plus submitted values. */
interface GuidedPanelState {
  routine: ProvisionalRoutine;
  name: string;
  schedule: string;
  prompt: string;
  delivery?: string;
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
  // Selection key for the inspector: the row's view key (canonical job_id,
  // else its positional label). Display only — never a mutation identity.
  const [selectedJobKey, setSelectedJobKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Guided path state. The handle holds the authoritative job_id and the
  // owning route, so the launch (and every retry) stays bound to the job
  // the backend minted — never to a name, and never to whichever profile
  // is active when the user clicks.
  const [guided, setGuided] = useState<GuidedPanelState | null>(null);
  // The session the user closed without finishing (issue #65 Part B,
  // scenario 1). Retained so closing the panel can only ever leave the
  // routine paused — and the user can resume exactly that handle instead
  // of starting over. Appended after `guided`: preset-position tests
  // address earlier slots.
  const [guidedRecent, setGuidedRecent] = useState<GuidedPanelState | null>(null);

  // Clear selected job if it is no longer present in the jobs inventory
  useEffect(() => {
    if (selectedJobKey === null) return;
    const stillThere = state.jobs.some(
      (job, index) => routineKey(job, `routine ${index + 1}`) === selectedJobKey,
    );
    if (!stillThere) setSelectedJobKey(null);
  }, [state.jobs, selectedJobKey]);

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
    if (!selectedJobKey) return null;
    return (
      state.jobs.find(
        (j, index) => routineKey(j, `routine ${index + 1}`) === selectedJobKey,
      ) ?? null
    );
  }, [state.jobs, selectedJobKey]);

  // Canonical identity of the inspected row ('' when the row has none) and
  // the display title the notice uses. Mutations read the first, never the
  // second.
  const selectedJobId = selectedJob ? jobIdOf(selectedJob) : '';
  const selectedJobLabel = selectedJob
    ? routineTitle(selectedJob, selectedJobKey || 'Routine')
    : selectedJobKey || 'Routine';

  /**
   * One dismiss path for every panel (issue #78), so the control in the
   * header, the Escape key and the row's own toggle can never disagree
   * about what closing means: the panel unmounts, then focus returns to
   * wherever the user would expect to continue — the row the inspector
   * belonged to, the New routine control for the composer, nothing for the
   * guided panel (its opener unmounts behind it). Restored on the next
   * tick, because the target lives in the panel that is being removed.
   */
  function closeSurface(surface: 'inspector' | 'composer' | 'guided'): void {
    const key = surface === 'inspector' ? selectedJobKey : null;
    if (surface === 'inspector') setSelectedJobKey(null);
    if (surface === 'composer') setIsCreating(false);
    if (surface === 'guided') handleGuidedClose();
    const focusId = dismissFocusId(surface, key);
    if (focusId === null) return;
    setTimeout(() => {
      focusById(focusId);
    }, 0);
  }

  // Which panel owns the workspace, decided in one place: the panels are
  // mutually exclusive by construction, and the header control and the
  // Escape key both read THIS, so neither can be right about one panel
  // while the other is open.
  const openSurface: 'inspector' | 'composer' | 'guided' | null =
    selectedJob !== null ? 'inspector' : guided !== null ? 'guided' : isCreating ? 'composer' : null;

  /**
   * Escape dismisses the open panel — and only the open panel. With
   * nothing open the key is not handled at all, so it cannot steal a
   * keystroke from the search box; and a focused control that owns Escape
   * for itself (a text field, an open dropdown — the composer is built
   * from dropdowns) keeps it, because a key that dismisses the form the
   * instant it dismisses a menu inside it resolves two intents at once and
   * only the first is recoverable.
   */
  function handleWorkspaceKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return;
    if (openSurface === null) return;
    if (!escapeLeavesPanel(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    closeSurface(openSurface);
  }

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

  /**
   * One pause/resume round trip. `jobId` is the canonical identity sent to
   * the backend and the key for optimistic/pending state; `label` is the
   * display title used in the notice. Callers refuse an unaddressable row
   * before this point (empty jobId) — the reducer refuses to flip an empty
   * identity and the builders reject it, so no path can mutate a title.
   */
  async function runMutation(
    kind: 'pause' | 'resume',
    jobId: string,
    label: string,
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
      dispatch(kind === 'pause' ? { type: 'optimistic-pause', jobId } : { type: 'optimistic-resume', jobId });
    }
    dispatch({ type: 'mutate-start', jobId });
    try {
      // User-initiated mutation: foreground so a cold-started backend takes
      // the pool's interactive slot instead of timing out behind it.
      await requestCronForRoute(activeRoute, 'cron.manage', params, undefined, {
        spawnPriority: 'foreground',
      });
      dispatch({ type: 'mutate-end', jobId });
      dispatch({ type: 'notice', notice: 'routine ' + label + ' ' + pastTense(kind) });
      dispatch({ type: 'retry-list' });
      return true;
    } catch (err) {
      dispatch({ type: 'mutate-end', jobId });
      if (isSafeOptimistic(kind)) dispatch({ type: 'optimistic-rollback' });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to ' + kind + ' routine').message });
      return false;
    }
  }

  function handlePause(jobId: string, label: string): void {
    if (locked || !jobId || !activeRoute) return;
    const route = activeRoute;
    void runMutation('pause', jobId, label, () => buildPauseParams(route, jobId));
  }

  function handleResume(jobId: string, label: string): void {
    if (locked || !jobId || !activeRoute) return;
    const route = activeRoute;
    void runMutation('resume', jobId, label, () => buildResumeParams(route, jobId));
  }

  async function handleCreateRoutine(
    name: string,
    schedule: string,
    prompt: string,
    active: boolean,
    delivery?: string,
  ): Promise<boolean> {
    if (!activeRoute) {
      dispatch({ type: 'mutation-error', error: 'the active profile route is no longer available' });
      return false;
    }
    const route = activeRoute;
    // The create slot: no job_id exists until the backend answers, so the
    // in-flight lock is keyed on '' rather than on any user-supplied text.
    const createSlot = '';
    try {
      // `delivery` is the composer's normalized target, or undefined for
      // the backend default (absent — `buildAddParams` omits the key).
      const addParams = buildAddParams(route, { name, schedule, prompt, delivery });
      dispatch({ type: 'mutate-start', jobId: createSlot });
      const created = await requestCronForRoute(route, 'cron.manage', addParams, undefined, {
        spawnPriority: 'foreground',
      });
      // `cron.manage` reports a refused mutation INSIDE a successful
      // JSON-RPC frame (`{"success": false, "error": ...}` wrapped by
      // `_ok`). A rejected create therefore resolves like a happy one, so
      // the verdict is read from the answer — treating "did not throw" as
      // "created" would announce a routine that does not exist.
      const outcome = cronOutcomeOf(created);
      if (!outcome.ok) {
        dispatch({ type: 'mutate-end', jobId: createSlot });
        dispatch({ type: 'mutation-error', error: 'failed to create routine: ' + outcome.error });
        return false;
      }
      if (!active) {
        // Creating on hold needs a second call against the row the backend
        // just minted: pause by its canonical job_id, never by the name.
        const createdId = jobIdFromResponse(created);
        if (!createdId) {
          dispatch({ type: 'mutate-end', jobId: createSlot });
          dispatch({ type: 'retry-list' });
          setIsCreating(false);
          dispatch({
            type: 'notice',
            notice:
              'routine ' + name + ' created — the backend returned no job id, so it stays active',
          });
          return true;
        }
        const pauseParams = buildPauseParams(route, createdId);
        const paused = await requestCronForRoute(route, 'cron.manage', pauseParams, undefined, {
          spawnPriority: 'foreground',
        });
        // Same in-band verdict on the pause: a create-on-hold that ends
        // here must not be announced as "created on hold" when the pause
        // was refused. The job is already minted, so this reports the real
        // state instead of hiding it.
        const pauseOutcome = cronOutcomeOf(paused);
        if (!pauseOutcome.ok) {
          dispatch({ type: 'mutate-end', jobId: createSlot });
          dispatch({ type: 'retry-list' });
          setIsCreating(false);
          dispatch({
            type: 'mutation-error',
            error:
              'routine ' + name + ' was created but the backend refused to pause it (' +
              pauseOutcome.error + ') — it may still run on its schedule',
          });
          return false;
        }
      }
      dispatch({ type: 'mutate-end', jobId: createSlot });
      dispatch({ type: 'notice', notice: 'routine ' + name + ' created' });
      dispatch({ type: 'retry-list' });
      setIsCreating(false);
      return true;
    } catch (err) {
      dispatch({ type: 'mutate-end', jobId: createSlot });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to create routine').message });
      return false;
    }
  }

  /**
   * Guided creation: create the routine PAUSED, then hand its authoritative
   * handle to the guided panel. The chat is NOT launched from here — the
   * panel owns the launch (and the retry) so a failed launch keeps the same
   * job_id instead of starting over.
   *
   * The route is the one the create was scoped to, and the create itself
   * proves the pause. Nothing here resumes or activates the routine.
   */
  async function handleCreateGuided(
    name: string,
    schedule: string,
    prompt: string,
    delivery?: string,
  ): Promise<boolean> {
    if (!activeRoute) {
      dispatch({ type: 'mutation-error', error: 'the active profile route is no longer available' });
      return false;
    }
    const createSlot = '';
    dispatch({ type: 'mutate-start', jobId: createSlot });
    try {
      const result = await createProvisionalRoutine({ route: activeRoute, name, schedule, prompt, delivery });
      dispatch({ type: 'mutate-end', jobId: createSlot });
      dispatch({ type: 'retry-list' });
      if (result.ok === false) {
        dispatch({ type: 'mutation-error', error: 'failed to create routine: ' + result.message });
        return false;
      }
      setGuided({ routine: result.routine, name, schedule, prompt, delivery });
      setGuidedRecent(null);
      setIsCreating(false);
      setSelectedJobKey(null);
      // Honest copy: the routine EXISTS and is paused; nothing about its
      // configuration has been decided yet.
      dispatch({ type: 'notice', notice: 'routine ' + name + ' created paused — it needs configuration' });
      return true;
    } catch (err) {
      dispatch({ type: 'mutate-end', jobId: createSlot });
      dispatch({ type: 'mutation-error', error: wrapHostError(err, 'failed to create routine').message });
      return false;
    }
  }

  /**
   * Open (or re-open) the guided configuration chat for a handle. Routed
   * through the launch boundary, which binds the chat to the handle's own
   * route and job_id. Returns the honest outcome so the panel can offer a
   * retry; the routine stays paused either way.
   */
  async function handleGuidedLaunch(
    routine: ProvisionalRoutine,
    submitted: { name: string; schedule: string; prompt: string },
    autoSubmit: boolean,
  ): Promise<GuidedLaunchResult> {
    return launchGuidedConfiguration({ routine, submitted, autoSubmit });
  }

  /**
   * Closing the guided panel abandons the chat, never the routine: the
   * handle is retained so the user can resume it, and the routine stays
   * exactly as paused as it already was. No resume, no remove, no write
   * of any kind happens here.
   */
  function handleGuidedClose(): void {
    if (guided !== null) setGuidedRecent(guided);
    setGuided(null);
  }

  /**
   * (Re)open a guided session from the list (issue #65 Part B, scenarios
   * 1–2). A retained in-session handle resumes verbatim; otherwise the
   * handle is rebuilt from the durable row on the CURRENT active route.
   * Either way the panel re-reads truth on review and the confirm path
   * re-runs its stale guard — opening proves nothing and changes nothing.
   */
  function handleGuidedReopen(jobId: string): void {
    if (guidedRecent !== null && guidedRecent.routine.jobId === jobId) {
      setGuided(guidedRecent);
      setGuidedRecent(null);
      setIsCreating(false);
      setSelectedJobKey(null);
      return;
    }
    const row = state.jobs.find((job) => jobIdOf(job) === jobId) ?? null;
    if (row === null || guidedConfigCandidateOf(row) === null) {
      dispatch({
        type: 'notice',
        notice: 'that routine can no longer be opened for configuration — check the routines list',
      });
      return;
    }
    const handle = activeRoute === null ? null : buildReopenHandle(activeRoute, row);
    if (handle === null) {
      dispatch({
        type: 'notice',
        notice: 'that routine can no longer be opened for configuration — check the routines list',
      });
      return;
    }
    setGuided({
      routine: handle,
      name: routineTitle(row, 'Routine'),
      schedule: humanScheduleOf(row) || '',
      prompt: routinePromptOf(row) ?? '',
    });
    setGuidedRecent(null);
    setIsCreating(false);
    setSelectedJobKey(null);
  }

  /**
   * Incomplete-configuration targets for the list notice: the retained
   * in-session handle first (when its row is still paused below), then
   * every other paused-never-ran row. Computed per render from backend
   * rows — never from ephemeral panel state — so it survives a reload.
   */
  function guidedReopenTargets(): GuidedReopenTarget[] {
    if (guided !== null) return [];
    const targets: GuidedReopenTarget[] = [];
    const seen: string[] = [];
    if (guidedRecent !== null) {
      const id = guidedRecent.routine.jobId;
      const row = state.jobs.find((job) => jobIdOf(job) === id) ?? null;
      if (row !== null && guidedConfigCandidateOf(row) !== null) {
        targets.push({
          jobId: id,
          title: routineTitle(row, guidedRecent.name || 'Routine'),
          resumed: true,
        });
        seen.push(id);
      }
    }
    for (const job of state.jobs) {
      const id = jobIdOf(job);
      if (!id || seen.indexOf(id) !== -1) continue;
      if (guidedConfigCandidateOf(job) === null) continue;
      targets.push({ jobId: id, title: routineTitle(job, 'Routine'), resumed: false });
    }
    return targets;
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
            inspectedId={selectedJobKey}
            inspectorId={INSPECTOR_PANEL_ID}
            rowControlId={routineRowFocusId}
            onInspect={(key) => {
              setSelectedJobKey(key);
              if (key) {
                setIsCreating(false);
                handleGuidedClose();
              }
            }}
            onPause={handlePause}
            onResume={handleResume}
          />
        )}
      </>
    );
  }

  // Live-region copy. Transient feedback wins: an error, a pause/resume or
  // create result, and a loading/unavailable state are the page's visible
  // operational signal. Only the settled READY count restates text the
  // page already shows on screen (the toolbar count, the empty state), so
  // it is announced but not painted a second time. The count must be built
  // from the SAME rows the toolbar paints (filteredJobs), never from the
  // status-filter-only list: with a search active those two disagree and a
  // screen reader would hear a count that does not match the screen.
  let liveText = '';
  let liveRestatesVisible = false;
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.LIST_LOADING) liveText = 'Loading routines.';
  else if (state.status === S.ROUTE_UNAVAILABLE) liveText = 'Routines unavailable for this profile.';
  else if (state.status === S.READY) {
    if (state.jobs.length === 0) {
      liveText = 'No routines yet.';
      liveRestatesVisible = true;
    } else {
      liveText = `Showing ${filteredJobs.length} of ${state.jobs.length} routines.`;
      liveRestatesVisible = true;
    }
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
    const reopenTargets = guidedReopenTargets();
    if (reopenTargets.length > 0) {
      body.push(
        <NeedsConfigurationNotice
          key="needs-configuration"
          targets={reopenTargets}
          onConfigure={handleGuidedReopen}
        />,
      );
    }
    body.push(<div key="ready-list">{renderList()}</div>);
  }

  const profileLabel = typeof activeProfile === 'string' && activeProfile ? activeProfile : '—';

  return (
    <section id="hermes-routines-root" className="hr-root" aria-labelledby="hermes-routines-heading">
      <style>{ROUTINES_CSS}</style>
      {/* One key handler for the whole split workspace, so Escape means
          "leave the panel that is open" everywhere inside it (issue #78). */}
      <div className="hr-workspace" onKeyDown={handleWorkspaceKeyDown}>
        <div className={`hr-feed-column${!selectedJob && !guided && !isCreating ? ' hr-feed-contained' : ''}`}>
          <header className="hr-header">
            <div className="hr-header-top">
              <h2 id="hermes-routines-heading" ref={headingRef} tabIndex={-1} className="hr-title">
                Routines
              </h2>
              <button
                type="button"
                id={NEW_ROUTINE_CONTROL_ID}
                className="hr-btn-new"
                onClick={() => {
                  setSelectedJobKey(null);
                  setGuided(null);
                  setGuidedRecent(null);
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
            fallback={selectedJobKey || 'Routine'}
            id={INSPECTOR_PANEL_ID}
            activeRoute={activeRoute}
            activeProfile={state.activeProfile ?? (typeof activeProfile === 'string' ? activeProfile : null)}
            busy={selectedJobId !== '' && state.pending.indexOf(selectedJobId) !== -1}
            disabled={locked}
            onClose={() => closeSurface('inspector')}
            onPause={() => handlePause(selectedJobId, selectedJobLabel)}
            onResume={() => handleResume(selectedJobId, selectedJobLabel)}
          />
        ) : guided ? (
          <GuidedRoutinePanel
            routine={guided.routine}
            submittedName={guided.name}
            submittedSchedule={guided.schedule}
            submittedPrompt={guided.prompt}
            submittedDelivery={guided.delivery}
            activeRoute={activeRoute}
            onLaunch={handleGuidedLaunch}
            onClose={() => closeSurface('guided')}
          />
        ) : isCreating ? (
          <RoutineComposerPanel
            activeRoute={activeRoute}
            activeProfile={state.activeProfile ?? (typeof activeProfile === 'string' ? activeProfile : null)}
            // Destinations come from the SAME route roster the page
            // already resolved (issue #73): the picker lists what this
            // profile really exposes and never invents a channel. The
            // active route is included so the profile's own Bot Chat is
            // always among the choices.
            destinationRoutes={activeRoute === null ? state.routes : [activeRoute, ...state.routes]}
            disabled={locked}
            onClose={() => closeSurface('composer')}
            onSubmit={handleCreateRoutine}
            onSubmitGuided={handleCreateGuided}
          />
        ) : null}
      </div>

      <StatusLine text={liveText} statusRef={statusRef} restatesVisibleState={liveRestatesVisible} />
    </section>
  );
}
