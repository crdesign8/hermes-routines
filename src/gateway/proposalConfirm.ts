// ── confirmation and activation (issue #64) ──
// The ordered semantics the guided review runs when the user confirms:
//
//   1. re-run the stale proposal guard immediately before the mutation;
//   2. apply through the deterministic primitive from #63;
//   3. re-fetch the job and verify the persisted values;
//   4. only after that verification, call the official resume path — and
//      only when the USER asked for activation;
//   5. re-fetch again and verify the active state;
//   6. report success only after backend truth confirms it.
//
// Stage separation is the point of this module: every refusal names the
// step it happened in, the exact reason, and the recovery that is safe to
// offer (`GuidedRetry`). Nothing here throws for a backend refusal — the
// backend answers refusals in-band inside a successful frame, and the
// report is a value the UI renders.
//
// Activation is deliberately NOT part of the proposal contract: a
// validated proposal always carries `desiredActive: false` (#63), so a
// proposal can never turn a routine on. `desiredActive` here is the
// decision the person made by clicking, passed in explicitly.
//
// Identity: every step addresses rows by exact `job_id` on the retained
// owner route. No name targeting, no active-profile fallback, and the
// resume uses the same profile-scoped `cron.manage` door the rest of the
// plugin mutates through.

import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { messageOf } from '../lib/errors';
import { jobIdOf, normalizeJobs, type RoutineJob } from '../domain/jobs';
import {
  fingerprintSnapshot,
  snapshotJobConfig,
  validateProposal,
  type ProposalBaseSnapshot,
  type ValidatedProposal,
} from '../domain/routineProposal';
import {
  GUIDED_WORKFLOW_STAGE,
  proposedSnapshot,
  type GuidedRetry,
  type GuidedWorkflowStage,
} from '../domain/guidedWorkflow';
import { backendTargetProfile } from '../domain/routing';
import { listRoutines, requestCronForRoute } from './cronGateway';
import { buildResumeParams } from './cronParams';
import { cronOutcomeOf } from '../domain/provisional';
import { applyValidatedProposal, type ProposalApplyFailureReason } from './proposalApply';

/** What a backend read of ONE routine returned. */
export interface GuidedConfigRead {
  ok: true;
  /** false when the id no longer exists on the owning profile. */
  exists: boolean;
  /** Normalized configuration of the row (`''` fields when it is gone). */
  snapshot: ProposalBaseSnapshot;
  paused: boolean;
  /** Deterministic fingerprint of `snapshot` — the staleness currency. */
  fingerprint: string;
}

export type ConfigReadResult = GuidedConfigRead | { ok: false; message: string };

export interface ConfigReadRequest {
  route: PluginProfileRoute | null | undefined;
  /** Authoritative id. Never a name: names are not unique upstream. */
  jobId: string;
}

function scopeOf(route: PluginProfileRoute | null | undefined): string | null {
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) return null;
  return backendTargetProfile(route, '') || null;
}

/**
 * Read the authoritative state of one routine by exact id.
 *
 * Used twice with different intent: to build the review's "current"
 * column, and to verify what a mutation actually left behind. Both need
 * backend truth, never the echo of a write.
 */
export async function readJobConfig(request: ConfigReadRequest): Promise<ConfigReadResult> {
  const route = request?.route;
  if (!scopeOf(route)) {
    return { ok: false, message: 'reading a routine requires the resolved profile route that owns it' };
  }
  const jobId = typeof request?.jobId === 'string' ? request.jobId : '';
  if (!jobId) {
    return { ok: false, message: 'reading a routine requires its authoritative job id' };
  }
  let rows: RoutineJob[];
  try {
    rows = normalizeJobs(await listRoutines(route as PluginProfileRoute));
  } catch (err) {
    return { ok: false, message: 'the routines list could not be read: ' + messageOf(err) };
  }
  const row = rows.find((candidate) => jobIdOf(candidate) === jobId) ?? null;
  if (row === null) {
    return { ok: true, exists: false, snapshot: { name: '', schedule: '', prompt: '', delivery: '', modelOverride: '', paused: false }, paused: false, fingerprint: '' };
  }
  const snapshot = snapshotJobConfig(row);
  return {
    ok: true,
    exists: true,
    snapshot,
    paused: snapshot.paused,
    fingerprint: fingerprintSnapshot(snapshot),
  };
}

/** A confirmation attempt: success, or the stage it was refused in. */
export type ConfirmResult =
  | {
      ok: true;
      /** True only after a verified resume; false means still paused. */
      activated: boolean;
      /** Id carrying the configuration now (a replacement id after apply). */
      jobId: string;
      /** Superseded id ('' when nothing was replaced). */
      previousJobId: string;
      /** False when the patch already matched truth — zero mutations. */
      changed: boolean;
    }
  | {
      ok: false;
      stage: GuidedWorkflowStage;
      /** Machine-readable refusal code. */
      reason: string;
      /** User-facing, honest about the state every job was left in. */
      message: string;
      jobId: string;
      recovery: GuidedRetry;
      /** Addressable id left behind by a partial write, when one exists. */
      replacementJobId: string | null;
    };

export interface ConfirmProposalRequest {
  /** Re-validated at runtime: the brand guides callers, this gate protects. */
  proposal: ValidatedProposal | unknown;
  /** The retained owner route — the session's route, never the active door. */
  route: PluginProfileRoute | null | undefined;
  /** The USER's decision at confirmation time. Never read from the proposal. */
  desiredActive: boolean;
}

function refused(
  stage: GuidedWorkflowStage,
  reason: string,
  message: string,
  jobId: string,
  recovery: GuidedRetry,
  replacementJobId: string | null = null,
): ConfirmResult {
  return { ok: false, stage, reason, message, jobId, recovery, replacementJobId };
}

/**
 * Classify a primitive refusal into (stage, recovery).
 *
 * The rule that matters: a recovery must be SAFE to offer. `apply` is
 * offered only where re-confirming cannot create a second job; anything
 * that may have left an addressable row behind asks for `refresh` first,
 * because a blind retry there could mint a duplicate replacement.
 */
function classifyApplyFailure(
  reason: ProposalApplyFailureReason,
  replacementJobId: string | null,
): { stage: GuidedWorkflowStage; recovery: GuidedRetry } {
  const S = GUIDED_WORKFLOW_STAGE;
  switch (reason) {
    case 'no_route':
    case 'owner_mismatch':
    case 'invalid_proposal':
      return { stage: S.STALE, recovery: 'review' };
    case 'list_failed':
    case 'job_not_found':
    case 'stale_base':
    case 'not_paused':
    case 'unapplyable_base':
      return { stage: S.STALE, recovery: 'review' };
    case 'create_rejected':
      // The add was refused: nothing exists, so re-confirming is safe.
      return { stage: S.APPLY, recovery: 'apply' };
    case 'identity_unresolved':
    case 'supersede_incomplete':
      return { stage: S.APPLY, recovery: 'refresh' };
    case 'replacement_not_paused':
      return { stage: S.APPLY, recovery: replacementJobId ? 'refresh' : 'apply' };
    case 'truth_unconfirmed':
      return { stage: S.VERIFY, recovery: 'refresh' };
    default:
      return { stage: S.APPLY, recovery: 'refresh' };
  }
}

/**
 * Apply the validated proposal, then prove what the backend persisted.
 *
 * Step 1 (stale guard) runs as its own read so a moved target is refused
 * BEFORE any mutation and reported as a review problem. The primitive
 * re-runs the same guard internally immediately before its write, so the
 * window between the two reads cannot turn into an overwrite.
 */
export async function confirmProposal(request: ConfirmProposalRequest): Promise<ConfirmResult> {
  const route = request?.route;
  const backendProfile = scopeOf(route);
  const S = GUIDED_WORKFLOW_STAGE;

  // ── validate: schema, identity and ownership. Zero host calls. ──
  const checked = validateProposal(request?.proposal, null);
  if (checked.ok === false) {
    return refused(S.STALE, 'invalid_proposal', 'the proposal is not valid: ' + checked.message, '', 'review');
  }
  const proposal = checked.proposal;
  const jobId = proposal.jobId;
  if (!route || !backendProfile) {
    return refused(S.STALE, 'no_route', 'applying a proposal requires the resolved profile route that owns the routine', jobId, 'review');
  }
  if (
    route.connectionId !== proposal.owner.connectionId ||
    (route.profile !== proposal.owner.profile && route.targetProfile !== proposal.owner.profile)
  ) {
    return refused(
      S.STALE,
      'owner_mismatch',
      `the proposal belongs to ${proposal.owner.connectionId}::${proposal.owner.profile} and cannot be applied on ${route.connectionId}::${route.profile}`,
      jobId,
      'review',
    );
  }

  // ── 1. stale guard, re-run immediately before the mutation ──
  const before = await readJobConfig({ route, jobId });
  if (!before.ok) {
    return refused(S.STALE, 'list_failed', before.message, jobId, 'review');
  }
  if (!before.exists) {
    return refused(
      S.STALE,
      'job_not_found',
      'the routine no longer exists on its owning profile — check the routines list before reapplying',
      jobId,
      'review',
    );
  }
  if (before.fingerprint !== proposal.base.fingerprint) {
    return refused(
      S.STALE,
      'stale_base',
      'the routine changed since the configuration session started — review the current values and build a new proposal instead of overwriting newer state',
      jobId,
      'review',
    );
  }
  if (!before.paused) {
    return refused(
      S.STALE,
      'not_paused',
      'only a paused routine can be reconfigured — the routine is currently active, so the proposal no longer describes a safe target',
      jobId,
      'review',
    );
  }

  // ── 2. apply through the deterministic primitive (#63) ──
  const applied = await applyValidatedProposal({ proposal: proposal as ValidatedProposal, route });
  if (applied.ok === false) {
    const { stage, recovery } = classifyApplyFailure(applied.reason, applied.replacementJobId);
    return refused(stage, applied.reason, applied.message, applied.jobId || jobId, recovery, applied.replacementJobId);
  }

  // ── 3. re-fetch and verify the persisted values ──
  const expected = proposedSnapshot(before.snapshot, proposal.patch);
  const verified = await readJobConfig({ route, jobId: applied.jobId });
  if (!verified.ok) {
    return refused(S.VERIFY, 'verification_unreadable', verified.message, applied.jobId, 'refresh', null);
  }
  if (!verified.exists) {
    return refused(
      S.VERIFY,
      'verification_missing',
      `the configuration was applied but the routine ${applied.jobId} is not in the re-read list — verify it before any activation`,
      applied.jobId,
      'refresh',
      null,
    );
  }
  if (
    verified.snapshot.name !== expected.name ||
    verified.snapshot.schedule !== expected.schedule ||
    verified.snapshot.prompt !== expected.prompt
  ) {
    return refused(
      S.VERIFY,
      'verification_failed',
      `the re-read routine ${applied.jobId} does not hold the proposed configuration — do not activate it; check the routines list`,
      applied.jobId,
      'refresh',
      null,
    );
  }
  if (!verified.paused) {
    return refused(
      S.VERIFY,
      'verification_unpaused',
      `the re-read routine ${applied.jobId} is not paused after the apply — it must be parked before any activation decision`,
      applied.jobId,
      'refresh',
      null,
    );
  }

  if (request?.desiredActive !== true) {
    return { ok: true, activated: false, jobId: applied.jobId, previousJobId: applied.previousJobId, changed: applied.changed };
  }

  // ── 4–5. official resume, then a second truth read ──
  const activated = await activateConfigured({ route, jobId: applied.jobId });
  if (activated.ok === false) return activated;
  return { ok: true, activated: true, jobId: applied.jobId, previousJobId: applied.previousJobId, changed: applied.changed };
}

export interface ActivateRequest {
  route: PluginProfileRoute | null | undefined;
  /** Id whose configuration is already applied and verified. */
  jobId: string;
}

/**
 * Resume an ALREADY verified configuration and prove the active state.
 *
 * Deliberately separate from `confirmProposal`: retrying an activation
 * must never re-apply (that would mint a second replacement for a
 * configuration that is already in place). The resume answer is never
 * taken on trust — truth is re-read whether the call resolved, returned
 * an in-band refusal, or threw.
 */
export async function activateConfigured(request: ActivateRequest): Promise<ConfirmResult> {
  const route = request?.route;
  const jobId = typeof request?.jobId === 'string' ? request.jobId : '';
  const S = GUIDED_WORKFLOW_STAGE;
  if (!scopeOf(route) || !jobId) {
    return refused(
      S.RESUME,
      'no_route',
      'activating a routine requires the resolved profile route that owns it',
      jobId,
      'activation',
    );
  }

  // Answer of the official resume door — recorded, never believed alone.
  let resumeError: string | null = null;
  try {
    const params = buildResumeParams(route as PluginProfileRoute, jobId);
    const answer = await requestCronForRoute(route as PluginProfileRoute, 'cron.manage', params, undefined, {
      spawnPriority: 'foreground',
    });
    const outcome = cronOutcomeOf(answer);
    if (!outcome.ok) resumeError = outcome.error;
  } catch (err) {
    resumeError = messageOf(err);
  }

  // ── 5. re-fetch again and verify the active state ──
  const after = await readJobConfig({ route, jobId });
  if (!after.ok) {
    return refused(S.ACTIVATE_VERIFY, 'truth_unreadable', after.message, jobId, 'refresh');
  }
  if (!after.exists) {
    return refused(
      S.ACTIVATE_VERIFY,
      'job_missing',
      `the routine ${jobId} is no longer in the re-read list — check the routines list before retrying`,
      jobId,
      'refresh',
    );
  }
  if (!after.paused) {
    return { ok: true, activated: true, jobId, previousJobId: '', changed: false };
  }
  if (resumeError !== null) {
    return refused(
      S.RESUME,
      'resume_rejected',
      `the backend refused to resume the routine (${resumeError}) — it stays configured and paused`,
      jobId,
      'activation',
    );
  }
  return refused(
    S.ACTIVATE_VERIFY,
    'resume_unconfirmed',
    `the resume was accepted but the routine ${jobId} still reads as paused — the active state was not confirmed`,
    jobId,
    'refresh',
  );
}
