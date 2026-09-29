import { useState, type ReactElement } from 'react';
import type { GuidedLaunchResult } from '../gateway/guidedLaunch';
import type { ProvisionalRoutine } from '../domain/provisional';
import { backendTargetProfile } from '../domain/routing';
import { humanScheduleOf, routinePromptOf, routineTitle } from '../domain/present';
import { submitProposalForRoutine } from '../domain/routineProposal';
import {
  GUIDED_WORKFLOW_STATE,
  buildProposalReview,
  guidedIndicator,
  guidedWorkflowReducer,
  initialGuidedWorkflow,
  proposedSnapshot,
  type GuidedWorkflow,
  type GuidedWorkflowFailure,
  type GuidedWorkflowState,
} from '../domain/guidedWorkflow';
import { activateConfigured, confirmProposal, readJobConfig } from '../gateway/proposalConfirm';
import { GuidedProposalReview } from './GuidedProposalReview';

// The guided configuration window: the ONLY place that says what is known
// about a routine that EXISTS, is addressable, and is proven paused.
//
// It drives the explicit workflow state machine from
// `domain/guidedWorkflow.ts` instead of deriving the flow from component
// booleans, which is what makes the review boundary enforceable:
//
//   - the review is built from authoritative truth read at review time
//     (`readJobConfig`), never from the typed form and never from the
//     proposal's own claim;
//   - confirmation goes through `confirmProposal`, which re-runs the
//     stale guard, applies through the #63 primitive, re-reads and
//     verifies the persisted values, and only then resumes — and only
//     when the person asked for activation;
//   - nothing here resumes on cleanup or unmount. The component owns no
//     effect that mutates; closing it simply stops rendering it, so an
//     abandoned review can only ever leave the routine as paused as it
//     already was.
//
// The proposal arrives through the explicit, user-confirmed handoff
// (`submitProposalForRoutine`): the person pastes what Hermes returned
// and presses Review. There is no transcript scraping and no polling of
// the chat — upstream exposes no agent→plugin return surface (see
// docs/proposal-handoff.md), so the human is the carrier by design.
//
// Live region: `wf.status` is announced through one visually-hidden
// `role="status"` node. The visible copy per state is the state card and
// — when there is one — the exact failure message, so the announcement
// never paints a second box of the same text.

export interface GuidedRoutinePanelProps {
  routine: ProvisionalRoutine;
  /** The submitted form values, for a field the stored row does not carry. */
  submittedName: string;
  submittedSchedule: string;
  submittedPrompt: string;
  /**
   * The delivery the composer submitted with the provisional create, for
   * the same reason as the other submitted values. Absent/empty means the
   * backend default — nothing is painted.
   */
  submittedDelivery?: string;
  /** Auto-send on the first launch only; a retry always drafts. */
  autoSubmitOnFirstLaunch?: boolean;
  onLaunch: (
    routine: ProvisionalRoutine,
    submitted: { name: string; schedule: string; prompt: string },
    autoSubmit: boolean,
  ) => Promise<GuidedLaunchResult>;
  onClose: () => void;
}

/** Short, honest sentence under the state title. Never a second alert. */
function stateSubtitle(
  state: GuidedWorkflowState,
  failure: GuidedWorkflowFailure | null,
  profile: string,
): string {
  const S = GUIDED_WORKFLOW_STATE;
  switch (state) {
    case S.PROVISIONAL_PAUSED:
    case S.CONFIGURING:
      return `The routine was created on ${profile} and will not run until its configuration is finished.`;
    case S.PROPOSAL_READY:
      return 'Nothing has been applied yet. Read what Hermes proposes, then decide.';
    case S.APPLYING:
      return 'The confirmed proposal is being written to the backend.';
    case S.CONFIGURED_PAUSED:
      return failure !== null && failure.stage === 'resume'
        ? 'The configuration was applied and verified, but the routine could not be activated. It stays paused.'
        : 'The configuration was applied and verified. The routine stays paused.';
    case S.ACTIVATING:
      return 'The resume was sent. The active state is still being verified.';
    case S.ACTIVE:
      return 'The configuration was applied, verified, and the routine is running.';
    case S.NEEDS_ATTENTION:
      switch (failure?.stage) {
        case 'handoff':
          return 'The pasted proposal could not be read.';
        case 'stale':
          return 'The proposal no longer describes this routine. Nothing was applied.';
        case 'apply':
          return 'The configuration could not be applied. The routine stays paused.';
        case 'verify':
          return 'The configuration was written but is not confirmed. The routine stays paused and must not be activated yet.';
        case 'resume':
          return 'The configuration is verified, but activation failed.';
        default:
          return 'The routine needs attention before it can be activated.';
      }
  }
}

export function GuidedRoutinePanel({
  routine,
  submittedName,
  submittedSchedule,
  submittedPrompt,
  submittedDelivery,
  autoSubmitOnFirstLaunch,
  onLaunch,
  onClose,
}: GuidedRoutinePanelProps): ReactElement {
  // The first three slots predate the workflow and keep their order —
  // existing tests preset them positionally.
  const [launching, setLaunching] = useState(false);
  // Launch outcome lives here, not in page state: a retry must reuse the
  // same handle, and a page-level reset would lose the job_id.
  const [launch, setLaunch] = useState<GuidedLaunchResult | null>(null);
  const [autoSubmit] = useState<boolean>(autoSubmitOnFirstLaunch === true);
  const [handoff, setHandoff] = useState('');
  const [wf, setWf] = useState<GuidedWorkflow>(() => initialGuidedWorkflow(routine.jobId));
  const [busy, setBusy] = useState(false);
  const firstLaunch = launch === null;

  const S = GUIDED_WORKFLOW_STATE;
  const title = routineTitle(routine.job, submittedName || 'Routine');
  const schedule = humanScheduleOf(routine.job) || submittedSchedule || '—';
  const instruction = routinePromptOf(routine.job) ?? submittedPrompt;
  const profile = backendTargetProfile(routine.route, routine.backendProfile);
  const review = buildProposalReview(wf.current, wf.proposal);
  const inFlight = busy || wf.state === S.APPLYING || wf.state === S.ACTIVATING;

  async function handleLaunch(): Promise<void> {
    if (launching) return;
    setLaunching(true);
    try {
      const result = await onLaunch(
        routine,
        { name: submittedName, schedule: submittedSchedule, prompt: submittedPrompt },
        // Auto-send is a property of the FIRST launch only. A retry means
        // the user is present and re-deciding, so it drafts and lets them
        // send — a hidden second auto-send would start a conversation the
        // user never asked for.
        autoSubmit && firstLaunch,
      );
      setLaunch(result);
      if (result.ok) setWf(guidedWorkflowReducer(wf, { type: 'chat-launched' }));
    } finally {
      setLaunching(false);
    }
  }

  /**
   * The explicit handoff: nothing is read until the person presses the
   * button. The pasted text is bound to THIS routine and validated
   * before anything else, then authoritative truth is read so the review
   * can show current-vs-proposed. A refusal lands in the workflow as a
   * handoff failure — visible, and never a review.
   */
  async function handleReviewProposal(): Promise<void> {
    if (busy || inFlight) return;
    const target = {
      jobId: routine.jobId,
      connectionId: routine.route?.connectionId ?? '',
      profile: routine.backendProfile || backendTargetProfile(routine.route, ''),
    };
    const accepted = submitProposalForRoutine(handoff, target);
    if (accepted.ok === false) {
      setWf(
        guidedWorkflowReducer(wf, {
          type: 'handoff-rejected',
          reason: accepted.code,
          message: accepted.message,
        }),
      );
      return;
    }
    setBusy(true);
    try {
      const read = await readJobConfig({ route: routine.route, jobId: accepted.proposal.jobId });
      if (!read.ok) {
        setWf(
          guidedWorkflowReducer(wf, { type: 'handoff-rejected', reason: 'read_failed', message: read.message }),
        );
        return;
      }
      if (!read.exists) {
        setWf(
          guidedWorkflowReducer(wf, {
            type: 'handoff-rejected',
            reason: 'job_not_found',
            message:
              'the routine no longer exists on its owning profile — check the routines list before reviewing',
          }),
        );
        return;
      }
      setWf(
        guidedWorkflowReducer(wf, {
          type: 'proposal-received',
          proposal: accepted.proposal,
          current: read.snapshot,
        }),
      );
      setHandoff('');
    } finally {
      setBusy(false);
    }
  }

  /** Apply the proposal on review — and activate it only when asked to. */
  async function handleConfirm(desiredActive: boolean): Promise<void> {
    if (busy || inFlight || wf.proposal === null) return;
    const applying = guidedWorkflowReducer(wf, { type: 'confirm', desiredActive });
    if (applying === wf) return;
    setWf(applying);
    setBusy(true);
    try {
      const result = await confirmProposal({
        proposal: wf.proposal,
        route: routine.route,
        desiredActive,
      });
      if (result.ok) {
        const verified = guidedWorkflowReducer(applying, { type: 'apply-verified', jobId: result.jobId });
        setWf(
          result.activated
            ? guidedWorkflowReducer(verified, { type: 'activation-verified', jobId: result.jobId })
            : verified,
        );
        return;
      }
      setWf(
        guidedWorkflowReducer(applying, {
          type: 'failed',
          stage: result.stage,
          reason: result.reason,
          message: result.message,
          recovery: result.recovery,
          jobId: result.replacementJobId ?? result.jobId,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Resume a configuration that is already applied and verified. Never
   * re-applies: a second apply would mint a replacement for a
   * configuration that is already in place.
   */
  async function handleActivate(): Promise<void> {
    if (busy || inFlight) return;
    const activating = guidedWorkflowReducer(wf, { type: 'confirm-activation' });
    if (activating === wf) return;
    setWf(activating);
    setBusy(true);
    try {
      const result = await activateConfigured({
        route: routine.route,
        jobId: wf.appliedJobId || wf.jobId,
      });
      if (result.ok) {
        setWf(guidedWorkflowReducer(activating, { type: 'activation-verified', jobId: result.jobId }));
        return;
      }
      setWf(
        guidedWorkflowReducer(activating, {
          type: 'failed',
          stage: result.stage,
          reason: result.reason,
          message: result.message,
          recovery: result.recovery,
          jobId: result.jobId,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * The `refresh` recovery: re-read backend truth and let the reducer
   * decide what that means. It can only confirm or downgrade a state —
   * it never activates anything.
   */
  async function handleRefresh(): Promise<void> {
    if (busy || inFlight) return;
    setBusy(true);
    try {
      const read = await readJobConfig({ route: routine.route, jobId: wf.appliedJobId || wf.jobId });
      if (!read.ok) {
        setWf(
          guidedWorkflowReducer(wf, {
            type: 'failed',
            stage: 'verify',
            reason: 'refresh_failed',
            message: read.message,
            recovery: 'refresh',
          }),
        );
        return;
      }
      const expected =
        wf.current !== null && wf.proposal !== null ? proposedSnapshot(wf.current, wf.proposal.patch) : null;
      setWf(
        guidedWorkflowReducer(wf, {
          type: 'refresh-result',
          exists: read.exists,
          paused: read.paused,
          configured:
            expected !== null &&
            read.exists &&
            read.snapshot.name === expected.name &&
            read.snapshot.schedule === expected.schedule &&
            read.snapshot.prompt === expected.prompt,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  const failed = launch !== null && launch.ok === false;
  const opened = launch !== null && launch.ok === true;
  const showHandoff = wf.state === S.PROVISIONAL_PAUSED || wf.state === S.CONFIGURING;
  const showReview = wf.state === S.PROPOSAL_READY && review !== null;

  /** Action row for every phase except the review, which owns its own. */
  function actionsFor(): ReactElement {
    const close = (
      <button type="button" className="hr-btn hr-btn-back-routines" onClick={onClose}>
        Close
      </button>
    );
    if (showReview) {
      return <div className="hr-create-actions">{close}</div>;
    }
    if (wf.state === S.CONFIGURED_PAUSED) {
      return (
        <div className="hr-create-actions">
          {close}
          <button
            type="button"
            className="hr-btn hr-btn-create-submit"
            disabled={inFlight}
            onClick={() => void handleActivate()}
          >
            {wf.failure !== null && wf.failure.stage === 'resume' ? 'Retry activation' : 'Activate now'}
          </button>
        </div>
      );
    }
    if (wf.state === S.NEEDS_ATTENTION) {
      const recovery = wf.failure?.recovery;
      return (
        <div className="hr-create-actions">
          {close}
          {recovery === 'apply' ? (
            <button
              type="button"
              className="hr-btn hr-btn-create-submit"
              disabled={inFlight}
              onClick={() => void handleConfirm(wf.desiredActive)}
            >
              Try applying again
            </button>
          ) : null}
          {recovery === 'activation' ? (
            <button
              type="button"
              className="hr-btn hr-btn-create-submit"
              disabled={inFlight}
              onClick={() => void handleActivate()}
            >
              Retry activation
            </button>
          ) : null}
          {recovery === 'refresh' ? (
            <button
              type="button"
              className="hr-btn hr-btn-create-submit"
              disabled={inFlight}
              onClick={() => void handleRefresh()}
            >
              Refresh status
            </button>
          ) : null}
        </div>
      );
    }
    if (wf.state === S.PROVISIONAL_PAUSED || wf.state === S.CONFIGURING) {
      return (
        <div className="hr-create-actions">
          {close}
          <button
            type="button"
            className="hr-btn hr-btn-create-submit"
            disabled={launching}
            onClick={() => void handleLaunch()}
          >
            {launching ? 'Opening…' : failed ? 'Retry chat' : 'Configure with Hermes'}
          </button>
        </div>
      );
    }
    // applying / activating / active: the only safe action is leaving.
    return <div className="hr-create-actions">{close}</div>;
  }

  return (
    <aside className="hr-inspector hr-create-inspector" aria-label="Configure routine with Hermes">
      <header className="hr-inspector-header">
        <button
          type="button"
          className="hr-btn-action hr-btn-back"
          onClick={onClose}
          aria-label="Back to routines"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              fillRule="evenodd"
              d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
            />
          </svg>
          <span>Back to routines</span>
        </button>
      </header>

      <div className="hr-inspector-body">
        <h3 className="hr-create-title">{title}</h3>

        {/* The state, stated in words: the routine exists and cannot run. */}
        <div className="hr-create-active-card">
          <div className="hr-create-active-info">
            <span className="hr-create-active-title">{guidedIndicator(wf.state, wf.failure)}</span>
            <span className="hr-create-active-subtitle">
              {stateSubtitle(wf.state, wf.failure, profile)}
            </span>
          </div>
        </div>

        <div className="hr-create-field">
          <label className="hr-field-label">Job id</label>
          <input
            type="text"
            className="hr-create-input"
            value={routine.jobId}
            disabled
            readOnly
            aria-label="Routine job id"
          />
        </div>

        {showReview && review !== null ? (
          <GuidedProposalReview
            review={review}
            busy={inFlight}
            onConfirm={(desiredActive) => void handleConfirm(desiredActive)}
            onContinueConfiguring={() =>
              setWf(guidedWorkflowReducer(wf, { type: 'continue-configuring' }))
            }
          />
        ) : (
          <>
            <div className="hr-create-field">
              <label className="hr-field-label">What should this routine do?</label>
              <textarea
                className="hr-create-textarea"
                rows={3}
                value={instruction ?? ''}
                disabled
                readOnly
                aria-label="What this routine does"
                placeholder="No instruction stored for this routine."
              />
            </div>

            <div className="hr-create-when-section">
              <div className="hr-create-section-label">WHEN TO RUN</div>
              <div className="hr-create-preview-sentence">{schedule}</div>
            </div>

            {/* Submitted delivery, shown only when it differs from the
                backend default. Read-only text, never a control: the
                provisional shell already carries it. */}
            {submittedDelivery ? (
              <div className="hr-create-field">
                <label className="hr-field-label">Delivery</label>
                <div className="hr-create-preview-sentence">{submittedDelivery}</div>
              </div>
            ) : null}
          </>
        )}

        {/* One visible copy of the exact failure, when there is one. The
            live region below announces it; it is not painted again. */}
        {wf.failure !== null ? (
          <div className="hr-create-error" role="alert">
            {wf.failure.message}
          </div>
        ) : null}

        {failed ? (
          <div className="hr-create-error" role="alert">
            {launch.message}
            {launch.jobId ? ' The routine is still paused.' : ''}
          </div>
        ) : null}

        {opened ? (
          <div className="hr-create-preview-sentence" role="status">
            {launch.autoSubmitted
              ? 'Chat opened on this profile and the configuration envelope was sent.'
              : 'Chat opened on this profile with the configuration envelope ready to send.'}
          </div>
        ) : null}

        {/* The explicit handoff seam: nothing is read until the person
            pastes a proposal and presses Review. */}
        {showHandoff ? (
          <div className="hr-create-field">
            <label className="hr-field-label" htmlFor="hr-guided-handoff">
              Proposal returned by Hermes
            </label>
            <textarea
              id="hr-guided-handoff"
              className="hr-create-textarea"
              rows={4}
              value={handoff}
              onChange={(e) => setHandoff(e.target.value)}
              aria-label="Paste the proposal object Hermes returned"
              placeholder={
                '{"version":1,"jobId":"…","owner":{…},"base":{…},"patch":{…},"desiredActive":false}'
              }
            />
            <div className="hr-create-actions">
              <button
                type="button"
                className="hr-btn hr-btn-create-submit"
                disabled={inFlight || handoff.trim().length === 0}
                onClick={() => void handleReviewProposal()}
              >
                {busy ? 'Reading…' : 'Review proposal'}
              </button>
            </div>
          </div>
        ) : null}

        {actionsFor()}

        {/* One announcement channel for the whole flow. */}
        <p className="hr-sr-only" role="status" aria-live="polite">
          {wf.status}
        </p>
      </div>
    </aside>
  );
}
