// ── deterministic proposal apply (issue #63) ──
// The mutation side of the proposal contract: turns a VALIDATED proposal
// into backend state, or into an honest report about why it did not.
//
// Ordered semantics (forced by the backend surface): `cron.manage`
// exposes NO update verb — only list/add/remove/pause/resume, and `add`
// always mints a runnable job (see domain/provisional.ts). So "apply the
// patch" is a supervised replacement:
//
//   1. re-fetch the authoritative list on the retained owner route;
//   2. find the row by exact `job_id` (never by name — names are not
//      unique, and the backend raises AmbiguousJobReference on a
//      duplicate title);
//   3. compare its fingerprint to the proposal base; a moved target is a
//      `stale_base` refusal, never an overwrite;
//   4. `add` the patched configuration (add-first: any failure before the
//      remove leaves the original untouched — there is nothing to roll
//      back because nothing was destroyed);
//   5. `pause` the replacement and PROVE it (`enabled === false`); a
//      replacement that cannot be parked is removed again best-effort and
//      reported, so no runnable surprise is left behind;
//   6. `remove` the superseded id — the ONLY destructive step, running
//      solely after the replacement is proven paused. If it fails the
//      result is an explicit partial: the replacement id is returned, both
//      rows are paused, nothing was lost, nothing was hidden;
//   7. re-read the list (backend truth after mutation, never the echo of
//      the write) and compare EVERY patched field, `delivery` included (#65)
//      — a green apply that persisted a different value is a lie the write's
//      own echo would have hidden.
//
// Properties: route/profile scoped, job-id scoped, no name targeting,
// fail closed on missing/stale identity, never resumes, refreshes truth
// after mutation, surfaces partial failure explicitly. This function never
// throws for a backend refusal — `cron.manage` answers refusals in-band
// inside a successful frame (see domain/provisional.ts `cronOutcomeOf`).

import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { messageOf } from '../lib/errors';
import { jobIdFromResponse, jobIdOf, normalizeJobs } from '../domain/jobs';
import {
  fingerprintSnapshot,
  isProposalStale,
  snapshotJobConfig,
  validateProposal,
  type ValidatedProposal,
} from '../domain/routineProposal';
import { backendTargetProfile } from '../domain/routing';
import { listRoutines, requestCronForRoute } from './cronGateway';
import { buildAddParams, buildPauseParams, buildRemoveParams } from './cronParams';
import { cronOutcomeOf, pausedConfirmedBy } from '../domain/provisional';

/** Why a proposal apply did not reach the replaced-and-paused end state. */
export type ProposalApplyFailureReason =
  /** No resolved route + backend profile: nothing was sent. */
  | 'no_route'
  /** The retained route is not the proposal's owner: nothing was sent. */
  | 'owner_mismatch'
  /** The proposal object fails strict validation: nothing was sent. */
  | 'invalid_proposal'
  /** The authoritative list could not be read. */
  | 'list_failed'
  /** No row with the proposal's `job_id` exists on the owner route. */
  | 'job_not_found'
  /** The row moved since the session started: nothing was mutated. */
  | 'stale_base'
  /** The current row is not paused: reconfiguration would change run state. */
  | 'not_paused'
  /** The current row cannot carry the patched result (no name/prompt). */
  | 'unapplyable_base'
  /** The replacement `add` was refused or minted no addressable id. */
  | 'create_rejected'
  /** The replacement id has no usable `job_id` in the add answer. */
  | 'identity_unresolved'
  /** The replacement could not be proven paused (original untouched). */
  | 'replacement_not_paused'
  /** Replacement proven paused, but the superseded id could not be removed. */
  | 'supersede_incomplete'
  /** Replacement applied, but backend truth could not be re-read. */
  | 'truth_unconfirmed';

/** What one apply attempt means. */
export type ProposalApplyResult =
  | {
      ok: true;
      /** The id that now carries the configuration (new id, or the same id when unchanged). */
      jobId: string;
      /** The superseded id ('' when nothing was replaced). */
      previousJobId: string;
      /** False when the patch already matched truth — zero mutations sent. */
      changed: boolean;
      backendProfile: string;
    }
  | {
      ok: false;
      reason: ProposalApplyFailureReason;
      /** User-facing, honest about the state every job was left in. */
      message: string;
      /** The proposal's target id — still addressable unless the remove took it. */
      jobId: string;
      /** Addressable replacement id, when one was minted (partial states). */
      replacementJobId: string | null;
      backendProfile: string | null;
    };

export interface ProposalApplyRequest {
  /** A proposal from `validateProposal`/`submitProposalHandoff` (re-validated at runtime). */
  proposal: ValidatedProposal | unknown;
  /** The retained owner route — the session's route, never the active door. */
  route: PluginProfileRoute | null | undefined;
}

/** The route's backend profile, or null when the route cannot scope one. */
function scopeOf(route: PluginProfileRoute | null | undefined): string | null {
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) return null;
  return backendTargetProfile(route, '') || null;
}

function failed(
  reason: ProposalApplyFailureReason,
  message: string,
  jobId: string,
  backendProfile: string | null,
  replacementJobId: string | null = null,
): ProposalApplyResult {
  return { ok: false, reason, message, jobId, replacementJobId, backendProfile };
}

/**
 * Apply a validated proposal through the official `cron.manage` path.
 *
 * Accepts only validated proposals at the type level and re-validates at
 * runtime, so even a hand-forged object is checked before any host door
 * is touched. Local/validation refusals cost zero backend calls; every
 * mutation refusal names the ids that are still addressable.
 */
export async function applyValidatedProposal(request: ProposalApplyRequest): Promise<ProposalApplyResult> {
  const route = request?.route;
  const backendProfile = scopeOf(route);
  if (!route || !backendProfile) {
    return failed(
      'no_route',
      'applying a proposal requires the resolved profile route that owns the routine',
      '',
      null,
    );
  }

  // Runtime re-validation: the type brand guides callers, this gate
  // protects the backend. Zero host calls have happened so far.
  const checked = validateProposal(request?.proposal, null);
  if (checked.ok === false) {
    return failed('invalid_proposal', 'the proposal is not valid: ' + checked.message, '', backendProfile);
  }
  const proposal = checked.proposal;
  const jobId = proposal.jobId;

  // Exact owner match on the RETAINED route. Either the logical profile or
  // the backend target may name the owner (the envelope prefers the
  // backend profile); anything else is another connection's job.
  if (
    route.connectionId !== proposal.owner.connectionId ||
    (route.profile !== proposal.owner.profile && route.targetProfile !== proposal.owner.profile)
  ) {
    return failed(
      'owner_mismatch',
      `the proposal belongs to ${proposal.owner.connectionId}::${proposal.owner.profile} and cannot be applied on ${route.connectionId}::${route.profile}`,
      jobId,
      backendProfile,
    );
  }

  // 1–2. Authoritative truth, addressed by exact job_id. A duplicate human
  // title anywhere in the list cannot divert this: only the id matches.
  let rows;
  try {
    rows = normalizeJobs(await listRoutines(route));
  } catch (err) {
    return failed('list_failed', 'the routines list could not be read: ' + messageOf(err), jobId, backendProfile);
  }
  const current = rows.find((row) => jobIdOf(row) === jobId) ?? null;
  if (current === null) {
    return failed(
      'job_not_found',
      'the routine no longer exists on its owning profile — check the routines list before reapplying',
      jobId,
      backendProfile,
    );
  }

  // 3. Stale guard: the session stayed open while the job moved.
  if (isProposalStale(proposal, current)) {
    return failed(
      'stale_base',
      'the routine changed since the configuration session started — review the current values and build a new proposal instead of overwriting newer state',
      jobId,
      backendProfile,
    );
  }

  const snapshot = snapshotJobConfig(current);
  if (!snapshot.paused) {
    return failed(
      'not_paused',
      'only a paused routine can be reconfigured — the routine is currently active, so the proposal no longer describes a safe target',
      jobId,
      backendProfile,
    );
  }

  const name = proposal.patch.name ?? snapshot.name;
  const schedule = proposal.patch.schedule ?? snapshot.schedule;
  const prompt = proposal.patch.prompt ?? snapshot.prompt;
  // #65: `delivery` rides the same replacement (the gateway RPC forwards
  // `deliver` on create — see reports/issue-65-decisions.md D1). Absent in the
  // patch means "keep whatever is stored", never "clear it": clearing is an
  // explicit empty-string patch, which normalizes to ''.
  const delivery = proposal.patch.delivery ?? snapshot.delivery;
  if (!name || !schedule || !prompt) {
    return failed(
      'unapplyable_base',
      'the routine carries no usable name, schedule or instruction to carry forward — fill every field in the proposal',
      jobId,
      backendProfile,
    );
  }
  if (
    name === snapshot.name &&
    schedule === snapshot.schedule &&
    prompt === snapshot.prompt &&
    delivery === snapshot.delivery
  ) {
    return { ok: true, jobId, previousJobId: '', changed: false, backendProfile };
  }

  // 4. Add-first: the replacement is minted before anything is destroyed.
  // Payloads are built before the round trip so a local fault costs zero
  // backend calls and leaves no half-configured job behind it.
  let addParams: Record<string, unknown>;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt, delivery });
  } catch (err) {
    return failed('invalid_proposal', 'the patched configuration is not valid: ' + messageOf(err), jobId, backendProfile);
  }
  let addAnswer: unknown;
  try {
    addAnswer = await requestCronForRoute(route, 'cron.manage', addParams, undefined, {
      spawnPriority: 'foreground',
    });
  } catch (err) {
    return failed(
      'create_rejected',
      'the backend refused to create the replacement routine (' + messageOf(err) + ') — the original is untouched',
      jobId,
      backendProfile,
    );
  }
  const created = cronOutcomeOf(addAnswer);
  if (!created.ok) {
    return failed(
      'create_rejected',
      'the backend refused to create the replacement routine: ' + created.error + ' — the original is untouched',
      jobId,
      backendProfile,
    );
  }
  const replacementId = jobIdFromResponse(addAnswer);
  if (!replacementId) {
    return failed(
      'identity_unresolved',
      'the backend created a replacement but returned no job id, so it cannot be addressed — the original is untouched; check the routines list',
      jobId,
      backendProfile,
    );
  }

  // 5. Park the replacement and PROVE it. A replacement that cannot be
  // parked is removed again best-effort: the report names the outcome of
  // that cleanup instead of assuming it.
  let pauseParams: Record<string, unknown>;
  try {
    pauseParams = buildPauseParams(route, replacementId);
  } catch (err) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      'replacement_not_paused',
      `the replacement ${replacementId} could not be addressed for pausing (${messageOf(err)}) — the original ${jobId} is untouched` +
        (cleanup ? ' and the replacement was removed' : '; the replacement may still exist — check the routines list'),
      jobId,
      backendProfile,
      cleanup ? null : replacementId,
    );
  }
  let pauseAnswer: unknown;
  try {
    pauseAnswer = await requestCronForRoute(route, 'cron.manage', pauseParams, undefined, {
      spawnPriority: 'foreground',
    });
  } catch (err) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      'replacement_not_paused',
      `the replacement routine could not be paused (${messageOf(err)}) — the original ${jobId} is untouched` +
        (cleanup ? ' and the unpaused replacement was removed' : '; the unpaused replacement may still exist — check the routines list'),
      jobId,
      backendProfile,
      cleanup ? null : replacementId,
    );
  }
  if (!cronOutcomeOf(pauseAnswer).ok || !pausedConfirmedBy(pauseAnswer)) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      'replacement_not_paused',
      'the backend did not confirm the replacement is paused — the original ' +
        jobId +
        ' is untouched' +
        (cleanup ? ' and the replacement was removed' : '; the replacement may still exist — check the routines list'),
      jobId,
      backendProfile,
      cleanup ? null : replacementId,
    );
  }

  // 6. The only destructive step: the replacement is proven paused, so the
  // superseded id can go. A refused remove is an explicit partial — both
  // rows paused, nothing lost, both ids returned.
  let removeParams: Record<string, unknown>;
  try {
    removeParams = buildRemoveParams(route, jobId);
  } catch (err) {
    return failed(
      'supersede_incomplete',
      `the replacement ${replacementId} is configured and paused, but the superseded ${jobId} could not be addressed for removal (${messageOf(err)}) — remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  let removeAnswer: unknown;
  try {
    removeAnswer = await requestCronForRoute(route, 'cron.manage', removeParams, undefined, {
      spawnPriority: 'foreground',
    });
  } catch (err) {
    return failed(
      'supersede_incomplete',
      `the replacement ${replacementId} is configured and paused, but removing the superseded ${jobId} failed (${messageOf(err)}) — remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  if (!cronOutcomeOf(removeAnswer).ok) {
    const detail = cronOutcomeOf(removeAnswer).error;
    return failed(
      'supersede_incomplete',
      `the replacement ${replacementId} is configured and paused, but the backend refused to remove the superseded ${jobId}: ${detail} — remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId,
    );
  }

  // 7. Backend truth after mutation — the write's echo proves nothing.
  let fresh;
  try {
    fresh = normalizeJobs(await listRoutines(route));
  } catch (err) {
    return failed(
      'truth_unconfirmed',
      `the replacement ${replacementId} is configured and paused, but the routines list could not be re-read (${messageOf(err)}) — verify it before the first run`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  const confirmed = fresh.find((row) => jobIdOf(row) === replacementId) ?? null;
  if (confirmed === null || fingerprintSnapshot(snapshotJobConfig(confirmed)) === proposal.base.fingerprint) {
    return failed(
      'truth_unconfirmed',
      `the replacement ${replacementId} was applied but the re-read list does not show the new configuration — verify it before the first run`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  const confirmedSnapshot = snapshotJobConfig(confirmed);
  if (
    confirmedSnapshot.name !== name ||
    confirmedSnapshot.schedule !== schedule ||
    confirmedSnapshot.prompt !== prompt ||
    confirmedSnapshot.delivery !== delivery
  ) {
    return failed(
      'truth_unconfirmed',
      `the re-read list shows the replacement ${replacementId} with different values than requested — verify it before the first run`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  if (!confirmedSnapshot.paused) {
    return failed(
      'truth_unconfirmed',
      `the re-read list does not show the replacement ${replacementId} as paused — check it before its first run`,
      jobId,
      backendProfile,
      replacementId,
    );
  }
  return { ok: true, jobId: replacementId, previousJobId: jobId, changed: true, backendProfile };
}

/** Best-effort removal of a replacement that must not survive. True when the backend confirmed it. */
async function removeQuietly(route: PluginProfileRoute, jobId: string): Promise<boolean> {
  try {
    const answer = await requestCronForRoute(route, 'cron.manage', buildRemoveParams(route, jobId), undefined, {
      spawnPriority: 'foreground',
    });
    return cronOutcomeOf(answer).ok;
  } catch {
    return false;
  }
}
