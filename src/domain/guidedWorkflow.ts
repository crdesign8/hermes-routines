// ── guided configuration workflow (issue #64) ──
// The explicit state model behind "review → confirm → apply → verify →
// activate". Before this module the guided flow was derived from
// incidental component booleans (a launch result here, a proposal there),
// which cannot answer "may I mutate now?" — and every safety rule in the
// issue is exactly that question.
//
// Invariants this file owns:
//
//   1. Transitions are explicit and testable: a table
//      (`GUIDED_TRANSITIONS`) says which states may follow which, the
//      reducer refuses everything else, and `canGuidedTransition` exposes
//      the table to tests instead of letting them infer it.
//   2. Nothing mutates from `proposal_ready`: the only way out toward the
//      backend is a `confirm` event carrying the user's explicit decision.
//   3. `active` is reached ONLY after a verified apply followed by a
//      verified resume. A proposal being generated, a patch request
//      returning, or a resume answering success are each insufficient on
//      their own — they are intermediate events, never the end state.
//   4. Failures are staged (`stale` / `apply` / `verify` / `resume` /
//      `activate-verify`) and each carries the recovery the caller may
//      offer. A failure never deletes the provisional job: identity lives
//      in `jobId` for the whole life of the workflow.
//
// Pure: no host access, no clock, no throwing for domain refusals. An
// event that is not legal from the current state leaves the state
// untouched (returns the same object), so a late or duplicate answer can
// never corrupt a flow that already moved on.

import {
  fingerprintSnapshot,
  type ProposalBaseSnapshot,
  type ValidatedProposal,
} from './routineProposal';

/** The eight states of a guided configuration, as named by the issue. */
export const GUIDED_WORKFLOW_STATE = Object.freeze({
  /** Job exists and is proven paused; no chat has been opened yet. */
  PROVISIONAL_PAUSED: 'provisional_paused',
  /** A guided chat is (or was) clarifying the configuration. */
  CONFIGURING: 'configuring',
  /** A validated proposal is on the table, waiting for a decision. */
  PROPOSAL_READY: 'proposal_ready',
  /** The confirmed proposal is being written to the backend. */
  APPLYING: 'applying',
  /** Configuration applied AND verified; the routine is still paused. */
  CONFIGURED_PAUSED: 'configured_paused',
  /** Resume issued; the active state has not been proven yet. */
  ACTIVATING: 'activating',
  /** Applied, resumed and re-read as running. Backend truth, not intent. */
  ACTIVE: 'active',
  /** Something needs the user: an uncertain or failed transition. */
  NEEDS_ATTENTION: 'needs_attention',
} as const);

export type GuidedWorkflowState =
  (typeof GUIDED_WORKFLOW_STATE)[keyof typeof GUIDED_WORKFLOW_STATE];

/** Which ordered confirmation step a failure belongs to (issue §Failure). */
export const GUIDED_WORKFLOW_STAGE = Object.freeze({
  /** The handoff itself was refused — nothing was read or written. */
  HANDOFF: 'handoff',
  /** Pre-mutation guard: identity, ownership, staleness, paused-ness. */
  STALE: 'stale',
  /** The deterministic write (add → pause → remove → re-read). */
  APPLY: 'apply',
  /** Post-apply verification read of the persisted values. */
  VERIFY: 'verify',
  /** The official resume/enable call. */
  RESUME: 'resume',
  /** Post-resume verification read of the active state. */
  ACTIVATE_VERIFY: 'activate-verify',
} as const);

export type GuidedWorkflowStage =
  (typeof GUIDED_WORKFLOW_STAGE)[keyof typeof GUIDED_WORKFLOW_STAGE];

/**
 * The recovery a failure offers. The panel renders exactly this action —
 * it never guesses a retry from a message string.
 *
 * - `review`      → back to the review surface (nothing was mutated);
 * - `apply`       → re-confirm: the write never started or created nothing;
 * - `refresh`     → re-read backend truth before any further mutation
 *                   (an addressable job may already exist);
 * - `activation`  → resume again: configuration is already applied and
 *                   verified, so re-applying would mint a second replacement.
 */
export type GuidedRetry = 'review' | 'apply' | 'refresh' | 'activation';

/** A staged failure: what happened, in words, and how to recover. */
export interface GuidedWorkflowFailure {
  stage: GuidedWorkflowStage;
  /** Machine-readable cause (the gateway's refusal code). */
  reason: string;
  /** User-facing and honest about the state the job was left in. */
  message: string;
  recovery: GuidedRetry;
}

/** One workflow instance: the whole guided path for ONE authoritative id. */
export interface GuidedWorkflow {
  /** Authoritative `job_id`. Never changes — an apply may re-point it. */
  jobId: string;
  state: GuidedWorkflowState;
  /** The validated proposal under review, once one has arrived. */
  proposal: ValidatedProposal | null;
  /** Authoritative configuration read when the proposal arrived. */
  current: ProposalBaseSnapshot | null;
  /**
   * The user's activation decision, recorded at confirmation time. The
   * proposal itself always carries `desiredActive: false` (#63): a
   * proposal never activates anything, only the person clicking does.
   */
  desiredActive: boolean;
  /** Id that carries the configuration after a verified apply. */
  appliedJobId: string;
  failure: GuidedWorkflowFailure | null;
  /** Text for the live region — an announcement, not a second visible box. */
  status: string;
}

export function initialGuidedWorkflow(jobId: string): GuidedWorkflow {
  return {
    jobId,
    state: GUIDED_WORKFLOW_STATE.PROVISIONAL_PAUSED,
    proposal: null,
    current: null,
    desiredActive: false,
    appliedJobId: '',
    failure: null,
    status: 'Routine created paused. It needs configuration.',
  };
}

/**
 * Legal successors per state. The reducer refuses anything not listed
 * here; `failure.recovery` then gates the finer choice inside
 * `needs_attention` (a retry that would re-mint a replacement is not
 * offered after a partial write, for instance).
 */
export const GUIDED_TRANSITIONS: Readonly<Record<GuidedWorkflowState, readonly GuidedWorkflowState[]>> =
  Object.freeze({
    [GUIDED_WORKFLOW_STATE.PROVISIONAL_PAUSED]: [
      GUIDED_WORKFLOW_STATE.CONFIGURING,
      GUIDED_WORKFLOW_STATE.PROPOSAL_READY,
    ],
    [GUIDED_WORKFLOW_STATE.CONFIGURING]: [
      GUIDED_WORKFLOW_STATE.CONFIGURING,
      GUIDED_WORKFLOW_STATE.PROPOSAL_READY,
    ],
    [GUIDED_WORKFLOW_STATE.PROPOSAL_READY]: [
      GUIDED_WORKFLOW_STATE.APPLYING,
      GUIDED_WORKFLOW_STATE.CONFIGURING,
    ],
    // proposal_ready: a stale/invalid proposal goes back to review, a
    // verified apply branches on the recorded activation decision, and
    // everything else is an attention state.
    [GUIDED_WORKFLOW_STATE.APPLYING]: [
      GUIDED_WORKFLOW_STATE.PROPOSAL_READY,
      GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
      GUIDED_WORKFLOW_STATE.ACTIVATING,
      GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION,
    ],
    [GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED]: [
      GUIDED_WORKFLOW_STATE.ACTIVATING,
      GUIDED_WORKFLOW_STATE.CONFIGURING,
      GUIDED_WORKFLOW_STATE.ACTIVE,
    ],
    // A resume answer is never taken on trust: activating ends in active
    // only through a verified read, back to configured_paused when the
    // resume was refused, and in needs_attention when truth is unreadable.
    [GUIDED_WORKFLOW_STATE.ACTIVATING]: [
      GUIDED_WORKFLOW_STATE.ACTIVE,
      GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
      GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION,
    ],
    // Losing activation (paused from outside) is a legitimate move.
    [GUIDED_WORKFLOW_STATE.ACTIVE]: [GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED],
    [GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION]: [
      GUIDED_WORKFLOW_STATE.APPLYING,
      GUIDED_WORKFLOW_STATE.ACTIVATING,
      GUIDED_WORKFLOW_STATE.CONFIGURING,
      GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
      GUIDED_WORKFLOW_STATE.ACTIVE,
    ],
  });

/** Is `to` a legal successor of `from`? Exposed so tests assert the table. */
export function canGuidedTransition(from: GuidedWorkflowState, to: GuidedWorkflowState): boolean {
  const allowed = GUIDED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
}

export type GuidedWorkflowEvent =
  /** The configuration chat opened (or re-opened) for this routine. */
  | { type: 'chat-launched' }
  /** `submitProposalHandoff` refused the pasted object. Nothing mutated. */
  | { type: 'handoff-rejected'; reason: string; message: string }
  /** A validated proposal arrived together with the current truth. */
  | { type: 'proposal-received'; proposal: ValidatedProposal; current: ProposalBaseSnapshot }
  /** Back to the review surface from an attention state (read-only). */
  | { type: 'return-to-review' }
  /** Abandon the review and go back to clarification. No mutation. */
  | { type: 'continue-configuring' }
  /** The user confirmed. `desiredActive` is THEIR decision, not the proposal's. */
  | { type: 'confirm'; desiredActive: boolean }
  /** Resume a configuration that is already applied and verified. */
  | { type: 'confirm-activation' }
  /** A staged refusal. The reducer maps stage → next state. */
  | {
      type: 'failed';
      stage: GuidedWorkflowStage;
      reason: string;
      message: string;
      recovery: GuidedRetry;
      /**
       * The id the report is addressable under — a replacement id when a
       * partial write minted one, the proposal's id otherwise. Tracking
       * it is what makes the `refresh` recovery read the row that may
       * actually carry the configuration.
       */
      jobId?: string;
    }
  /** Apply finished AND the persisted values were verified by re-read. */
  | { type: 'apply-verified'; jobId: string }
  /** Resume finished AND the re-read proves the routine is running. */
  | { type: 'activation-verified'; jobId: string }
  /** Answer of an explicit truth re-read (the `refresh` recovery). */
  | { type: 'refresh-result'; exists: boolean; paused: boolean; configured: boolean };

function failure(
  stage: GuidedWorkflowStage,
  reason: string,
  message: string,
  recovery: GuidedRetry,
): GuidedWorkflowFailure {
  return { stage, reason, message, recovery };
}

/** Same state, new status/failure — used when an event must not move us. */
function announce(base: GuidedWorkflow, status: string): GuidedWorkflow {
  return { ...base, status };
}

/**
 * One event = one transition. Illegal or stale events return `base`
 * unchanged (same reference), so tests can assert "nothing happened" by
 * identity as well as by value.
 */
export function guidedWorkflowReducer(
  state: GuidedWorkflow | undefined | null,
  event: GuidedWorkflowEvent | null | undefined,
): GuidedWorkflow {
  const base = state ?? initialGuidedWorkflow('');
  if (!event) return base;
  const S = GUIDED_WORKFLOW_STATE;

  switch (event.type) {
    case 'chat-launched': {
      // Opening a chat proves nothing about the configuration, so this
      // only ever moves forward into `configuring` (or re-announces it).
      if (base.state === S.PROVISIONAL_PAUSED) {
        return {
          ...base,
          state: S.CONFIGURING,
          status: 'Configuration chat opened for this routine. It stays paused.',
        };
      }
      if (base.state === S.CONFIGURING) {
        return announce(base, 'Configuration chat re-opened for this routine. It stays paused.');
      }
      return base;
    }

    case 'handoff-rejected': {
      // Only meaningful while a proposal could have arrived; a refusal
      // never disturbs a flow that is already writing to the backend.
      if (base.state !== S.PROVISIONAL_PAUSED && base.state !== S.CONFIGURING) return base;
      return {
        ...base,
        failure: failure('handoff', event.reason, event.message, 'review'),
        status: event.message,
      };
    }

    case 'proposal-received': {
      // Replacing a proposal is allowed exactly where a proposal may sit:
      // before the review, inside it, or after an attention state offered
      // no other recovery. Never mid-write — a late handoff must not
      // overwrite an apply in flight.
      const legal =
        base.state === S.PROVISIONAL_PAUSED ||
        base.state === S.CONFIGURING ||
        base.state === S.PROPOSAL_READY ||
        (base.state === S.NEEDS_ATTENTION && base.failure?.recovery === 'review');
      if (!legal) return base;
      return {
        ...base,
        state: S.PROPOSAL_READY,
        proposal: event.proposal,
        current: event.current,
        desiredActive: false,
        failure: null,
        status: 'Proposal ready for review. Nothing has been applied yet.',
      };
    }

    case 'return-to-review': {
      if (base.state !== S.NEEDS_ATTENTION) return base;
      if (base.failure === null || base.failure.recovery !== 'review') return base;
      return {
        ...base,
        state: S.PROPOSAL_READY,
        failure: null,
        status: 'Back to review. Nothing has been applied yet.',
      };
    }

    case 'continue-configuring': {
      if (!canGuidedTransition(base.state, S.CONFIGURING)) return base;
      // Dropping the review changes nothing on the backend: the routine
      // stays paused, and no cleanup path may resume it later.
      return {
        ...base,
        state: S.CONFIGURING,
        proposal: null,
        current: null,
        desiredActive: false,
        failure: null,
        status: 'Back to configuration. The routine stays paused.',
      };
    }

    case 'confirm': {
      // The single gate between "a proposal exists" and "the backend is
      // written to". From an attention state it is only a retry of a write
      // that never started or created nothing (`recovery: 'apply'`).
      if (base.state === S.PROPOSAL_READY) {
        if (base.proposal === null || base.current === null) return base;
        return {
          ...base,
          state: S.APPLYING,
          desiredActive: event.desiredActive === true,
          failure: null,
          status: event.desiredActive
            ? 'Applying the reviewed configuration.'
            : 'Applying the reviewed configuration. The routine stays paused.',
        };
      }
      if (base.state === S.NEEDS_ATTENTION && base.failure?.recovery === 'apply') {
        if (base.proposal === null || base.current === null) return base;
        return {
          ...base,
          state: S.APPLYING,
          desiredActive: event.desiredActive === true,
          failure: null,
          status: 'Retrying the configuration apply.',
        };
      }
      return base;
    }

    case 'confirm-activation': {
      // Resume of an ALREADY verified configuration. Legal from
      // configured_paused (first attempt or retry after a refused resume)
      // and from an attention state whose recovery is exactly this.
      const legal =
        base.state === S.CONFIGURED_PAUSED ||
        (base.state === S.NEEDS_ATTENTION && base.failure?.recovery === 'activation');
      if (!legal) return base;
      return {
        ...base,
        state: S.ACTIVATING,
        desiredActive: true,
        failure: null,
        status: 'Activating the routine.',
      };
    }

    case 'failed': {
      const detail = failure(event.stage, event.reason, event.message, event.recovery);
      // Track the id the report is addressable under: after a partial
      // write that may be a replacement id, and it is the row every
      // recovery from here reads or acts on.
      const address =
        typeof event.jobId === 'string' && event.jobId.length > 0 ? event.jobId : base.jobId;
      const parked = { ...base, jobId: address, failure: detail, status: event.message };
      if (base.state === S.APPLYING) {
        // A pre-mutation refusal returns to review with the job untouched.
        // A write or verification refusal parks the flow: the job is
        // paused, but what exists is no longer certain, and resuming an
        // unverified configuration is exactly what must not happen.
        if (event.stage === GUIDED_WORKFLOW_STAGE.STALE || event.stage === GUIDED_WORKFLOW_STAGE.HANDOFF) {
          return { ...parked, state: S.PROPOSAL_READY };
        }
        return { ...parked, state: S.NEEDS_ATTENTION };
      }
      if (base.state === S.ACTIVATING) {
        // A refused resume keeps the verified configuration and offers the
        // activation retry; an unreadable post-resume truth is uncertain.
        if (event.stage === GUIDED_WORKFLOW_STAGE.RESUME) {
          return { ...parked, state: S.CONFIGURED_PAUSED };
        }
        return { ...parked, state: S.NEEDS_ATTENTION };
      }
      return base;
    }

    case 'apply-verified': {
      if (base.state !== S.APPLYING) return base;
      const jobId = typeof event.jobId === 'string' && event.jobId ? event.jobId : base.jobId;
      const applied = { ...base, appliedJobId: jobId, failure: null, jobId };
      if (base.desiredActive) {
        return {
          ...applied,
          state: S.ACTIVATING,
          status: 'Configuration applied and verified. Activating the routine.',
        };
      }
      return {
        ...applied,
        state: S.CONFIGURED_PAUSED,
        status: 'Configuration applied and verified. The routine stays paused.',
      };
    }

    case 'activation-verified': {
      if (base.state !== S.ACTIVATING) return base;
      const jobId = typeof event.jobId === 'string' && event.jobId ? event.jobId : base.jobId;
      return {
        ...base,
        state: S.ACTIVE,
        jobId,
        appliedJobId: jobId,
        failure: null,
        status: 'Routine active. The active state was confirmed by a backend read.',
      };
    }

    case 'refresh-result': {
      // A re-read is only allowed to move a flow that already depends on
      // backend truth: an attention state, a configured pause, or an
      // active routine that may have been paused from outside.
      const allowed =
        base.state === S.NEEDS_ATTENTION ||
        base.state === S.CONFIGURED_PAUSED ||
        base.state === S.ACTIVE;
      if (!allowed) return base;
      if (!event.exists) {
        if (base.state !== S.NEEDS_ATTENTION) return base;
        return {
          ...base,
          status: 'The routine no longer exists on its owning profile.',
          failure: base.failure
            ? { ...base.failure, message: 'The routine no longer exists on its owning profile.' }
            : base.failure,
        };
      }
      if (!event.paused) {
        return {
          ...base,
          state: S.ACTIVE,
          failure: null,
          status: 'The routine is active, confirmed by a backend read.',
        };
      }
      // Paused again.
      if (base.state === S.ACTIVE) {
        return {
          ...base,
          state: S.CONFIGURED_PAUSED,
          failure: null,
          status: 'The routine is paused. Its configuration is unchanged.',
        };
      }
      if (base.state === S.NEEDS_ATTENTION && event.configured) {
        return {
          ...base,
          state: S.CONFIGURED_PAUSED,
          failure: null,
          status: 'The persisted configuration was verified. The routine stays paused.',
        };
      }
      if (base.state === S.NEEDS_ATTENTION) {
        return announce(base, 'The routine is still paused and its configuration is not confirmed yet.');
      }
      return base;
    }

    default:
      return base;
  }
}

/**
 * The state card's title — the workflow indicators the issue asks for.
 * Wording lives here (not in the component) so tests can pin the exact
 * labels without rendering anything.
 */
export function guidedIndicator(
  state: GuidedWorkflowState,
  failure: GuidedWorkflowFailure | null,
): string {
  const S = GUIDED_WORKFLOW_STATE;
  switch (state) {
    case S.PROVISIONAL_PAUSED:
    case S.CONFIGURING:
      return 'Paused · needs configuration';
    case S.PROPOSAL_READY:
      return 'Proposal ready';
    case S.APPLYING:
      return 'Applying configuration';
    case S.CONFIGURED_PAUSED:
      return failure !== null && failure.stage === GUIDED_WORKFLOW_STAGE.RESUME
        ? 'Activation failed'
        : 'Configured · Paused';
    case S.ACTIVATING:
      return 'Activating';
    case S.ACTIVE:
      return 'Active';
    case S.NEEDS_ATTENTION:
      return failure !== null &&
        (failure.stage === GUIDED_WORKFLOW_STAGE.RESUME ||
          failure.stage === GUIDED_WORKFLOW_STAGE.ACTIVATE_VERIFY)
        ? 'Activation failed'
        : 'Needs attention';
  }
}

// ── review model ──
// Current-vs-proposed, computed once from authoritative truth plus the
// validated proposal. Pure, so the review is deterministic and testable
// without a DOM.

/** Fields the review shows. `delivery`/`modelOverride` have no write path. */
export type ReviewField = 'name' | 'schedule' | 'prompt' | 'delivery' | 'modelOverride';

export interface ProposalReviewRow {
  field: ReviewField;
  label: string;
  /** Authoritative value read at review time. */
  current: string;
  /** What the routine would hold after a verified apply. */
  proposed: string;
  changed: boolean;
  /** False for fields no proposal can write (#63 patch scope). */
  patchable: boolean;
}

export interface ProposalReview {
  jobId: string;
  rows: ProposalReviewRow[];
  /** Field names whose value would actually change. */
  changedFields: ReviewField[];
  /** The agent's explanatory text, kept OUT of the authoritative values. */
  note: string | null;
  /** The row moved since the proposal's base: applying would refuse. */
  stale: boolean;
  current: ProposalBaseSnapshot;
  proposed: ProposalBaseSnapshot;
}

/** The snapshot a verified apply would leave behind. */
export function proposedSnapshot(
  current: ProposalBaseSnapshot,
  patch: ValidatedProposal['patch'],
): ProposalBaseSnapshot {
  return {
    ...current,
    name: patch.name ?? current.name,
    schedule: patch.schedule ?? current.schedule,
    prompt: patch.prompt ?? current.prompt,
    // #65: an explicit '' clears the target; an absent key keeps the stored
    // one. `??` cannot express that, so the empty string is checked directly.
    delivery: patch.delivery === undefined ? current.delivery : patch.delivery,
  };
}

const REVIEW_LABELS: Readonly<Record<ReviewField, string>> = Object.freeze({
  name: 'Name',
  schedule: 'Schedule',
  prompt: 'Instruction',
  delivery: 'Delivery',
  modelOverride: 'Model override',
});

const REVIEW_ORDER: readonly ReviewField[] = ['name', 'schedule', 'prompt', 'delivery', 'modelOverride'];
/**
 * A review row the reviewer may change. `delivery` became patchable in
 * issue #65 (the gateway RPC forwards `deliver` on create).
 * `modelOverride` is displayed but NOT patchable: the RPC has no
 * `model`/`provider` key, so a proposal could only pretend to set it.
 */
export const REVIEW_PATCHABLE: Readonly<Record<ReviewField, boolean>> = Object.freeze({
  name: true,
  schedule: true,
  prompt: true,
  delivery: true,
  modelOverride: false,
});

/** Fields a proposal may write. Mirrors `PATCH_FIELDS` in routineProposal.ts. */
const PATCHABLE: Readonly<Record<ReviewField, boolean>> = REVIEW_PATCHABLE;

/**
 * Build the deterministic current-vs-proposed review.
 *
 * `current` is authoritative truth read from the backend (never the form
 * the user typed, never the proposal's own claim), so the table can show
 * exactly what exists and exactly what would change — including fields no
 * proposal may write, which are displayed rather than hidden.
 */
export function buildProposalReview(
  current: ProposalBaseSnapshot | null | undefined,
  proposal: ValidatedProposal | null | undefined,
): ProposalReview | null {
  if (!current || !proposal) return null;
  const proposed = proposedSnapshot(current, proposal.patch);
  const rows: ProposalReviewRow[] = REVIEW_ORDER.map((field) => {
    const before = current[field] ?? '';
    const after = proposed[field] ?? '';
    return {
      field,
      label: REVIEW_LABELS[field],
      current: before,
      proposed: after,
      changed: before !== after,
      patchable: PATCHABLE[field],
    };
  });
  return {
    jobId: proposal.jobId,
    rows,
    changedFields: rows.filter((row) => row.changed).map((row) => row.field),
    note: typeof proposal.note === 'string' && proposal.note.trim() ? proposal.note : null,
    stale: fingerprintSnapshot(current) !== proposal.base.fingerprint,
    current,
    proposed,
  };
}
