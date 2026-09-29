import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { backendTargetProfile } from './routing';
import { jobIdFromResponse, jobPaused, type RoutineJob } from './jobs';
import {
  GUIDED_DIAG_STAGES,
  recordGuidedDiag,
  type GuidedDiagRecord,
} from './diagnostics';

// ── provisional (guided) routine creation ──
// A guided configuration conversation needs a routine identity before the
// conversation starts: the job must EXIST so the session can be bound to a
// real `job_id`, and it must NOT be runnable while clarification is still
// incomplete.
//
// Why this is two round trips and not one. The `cron.manage` wire declares
// its params with `extra="forbid"` (`tui_gateway/contracts/base.py`) and
// `CronManageParams` carries no paused/disabled key, while the handler
// forwards only name/schedule/prompt/repeat/continuity/deliver — so `add`
// ALWAYS creates a runnable job. The backend has no "create me inert" verb
// on this surface. The only way to reach the provisional invariant is:
// add → read the minted id → pause THAT id → prove the pause took.
//
// Identity rule (unchanged, and load-bearing): `job_id` is the only
// mutation identity, and it comes from the backend's own answer — never
// from the submitted title. Names are not unique (the backend raises
// AmbiguousJobReference on a duplicate title), so a name lookup can only
// ever be a guess. An answer without a usable id is a blocking failure.
//
// Everything in this module is pure: the caller owns the RPC round trips,
// this module owns what their answers mean.

/** Why a provisional create could not reach the paused invariant. */
export type ProvisionalFailureReason =
  /** No resolved route + backend profile: the create could not be scoped. */
  | 'no_route'
  /** The backend answered the add in-band with `success: false`. */
  | 'create_rejected'
  /** The add succeeded but no authoritative `job_id` came back. */
  | 'identity_unresolved'
  /** The pause round trip threw, or the backend refused it in-band. */
  | 'pause_rejected'
  /** The pause was accepted but the backend did not confirm a paused job. */
  | 'pause_unconfirmed';

/** How the pause round trip ended. */
export type PauseOutcome =
  /** The pause was sent and the backend answered (possibly `success: false`). */
  | { status: 'answered'; answer: unknown }
  /** The pause never completed — the round trip threw. */
  | { status: 'rejected'; message: string };

/**
 * A routine that exists, is addressed by its authoritative `job_id`, is
 * owned by a concrete route, and is PROVEN paused. This is the handle the
 * guided session binds to; `createdPaused: true` is a literal because the
 * value is only ever built from a confirmed pause.
 */
export interface ProvisionalRoutine {
  /** Authoritative `job_id` minted by the backend — the ONLY mutation identity. */
  jobId: string;
  /** Route that owns the job, preserved so follow-up work targets the same owner. */
  route: PluginProfileRoute;
  /** Backend profile the create was scoped to. */
  backendProfile: string;
  /** The job was created and the backend confirmed it is paused. */
  createdPaused: true;
  /** Authoritative normalized row from the backend, when it answered one. */
  job: RoutineJob | null;
}

/**
 * A provisional create that did not reach the paused invariant. `jobId`
 * and `route` are populated whenever a real job was minted, so a partial
 * failure still leaves the job ADDRESSABLE and recoverable — the caller
 * never has to fall back to a name to go find it.
 */
export interface ProvisionalFailure {
  ok: false;
  reason: ProvisionalFailureReason;
  /** User-facing, honest about the state the job was left in. */
  message: string;
  /** Minted id, or '' when the backend refused before minting one. */
  jobId: string;
  route: PluginProfileRoute | null;
  backendProfile: string | null;
  /** Always false: the paused invariant was not reached. */
  createdPaused: false;
}

export type ProvisionalResult = { ok: true; routine: ProvisionalRoutine } | ProvisionalFailure;

/** The paused-end-state question `ProvisionalResult` answers, in inputs. */
export interface ProvisionalCreateInput {
  route: PluginProfileRoute | null | undefined;
  /** Answer of the `add` round trip, or the thrown error when it failed outright. */
  addAnswer: unknown;
  /** How the pause round trip ended. */
  pause: PauseOutcome;
}

/**
 * Read the backend's in-band verdict.
 *
 * `cron.manage` reports a tool-level failure INSIDE a successful JSON-RPC
 * frame: the tool returns `{"success": false, "error": ...}` and the
 * handler wraps it with `_ok(...)`. A rejected mutation therefore resolves
 * exactly like a happy one, and "did it throw" is not a verdict — reading
 * only that silently reports rejected mutations as applied. An absent
 * `success` is tolerated (an older gateway omits it); the load-bearing
 * proofs are the minted `job_id` and the paused snapshot, not this flag.
 */
export function cronOutcomeOf(answer: unknown): { ok: boolean; error: string } {
  if (answer === null || typeof answer !== 'object') {
    return { ok: false, error: 'the backend returned no result' };
  }
  const row = answer as { success?: unknown; error?: unknown };
  if (row.success !== false) return { ok: true, error: '' };
  const detail = typeof row.error === 'string' ? row.error.trim() : '';
  return { ok: false, error: detail || 'the backend rejected the request' };
}

/**
 * Did the backend CONFIRM this job is paused?
 *
 * Proof, not inference. A pause answers `{"success": true, "job":
 * _format_job(updated)}`, and `_format_job` derives the row's `enabled`
 * from the stored record precisely so a half-paused record cannot render
 * as paused. So `job.enabled === false` is the backend's own word for
 * "this will not fire". An answer with no job row confirms nothing, and an
 * unconfirmed pause must never be reported as a provisional success.
 */
export function pausedConfirmedBy(answer: unknown): boolean {
  if (answer === null || typeof answer !== 'object') return false;
  const job = (answer as { job?: unknown }).job;
  if (job === null || typeof job !== 'object') return false;
  return (job as { enabled?: unknown }).enabled === false;
}

/** The normalized row an answer carried, or null when it carried none. */
function rowOf(answer: unknown): RoutineJob | null {
  if (answer === null || typeof answer !== 'object') return null;
  const job = (answer as { job?: unknown }).job;
  return job !== null && typeof job === 'object' ? (job as RoutineJob) : null;
}

/** The route's backend profile, or null when the route cannot scope one. */
function scopeOf(route: PluginProfileRoute | null | undefined): string | null {
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) return null;
  return backendTargetProfile(route, '') || null;
}

/**
 * What a single `add` round trip minted: a verdict plus, when one exists,
 * the addressable job. This is the step that answers "did the create
 * happen, and can I name it?" — deliberately separate from the pause
 * verdict, because a caller needs to know the minted id BEFORE it can
 * decide whether there is anything to pause.
 */
export type MintedRoutine =
  | { ok: true; jobId: string; route: PluginProfileRoute; backendProfile: string; job: RoutineJob | null }
  | ProvisionalFailure;

/**
 * Read the backend's own verdict on one `add` answer.
 *
 * Fails closed exactly where a guided flow must not continue: the backend
 * refused (nothing was minted), or the answer carries no authoritative
 * `job_id` (something exists, but it cannot be addressed — and must not be
 * found by title, since names are not unique).
 */
export function mintedRoutineFrom(
  route: PluginProfileRoute | null | undefined,
  addAnswer: unknown,
): MintedRoutine {
  const backendProfile = scopeOf(route);
  if (!route || !backendProfile) {
    return {
      ok: false,
      reason: 'no_route',
      message: 'Provisional creation requires a resolved profile route',
      jobId: '',
      route: null,
      backendProfile: null,
      createdPaused: false,
    };
  }
  const created = cronOutcomeOf(addAnswer);
  if (!created.ok) {
    return {
      ok: false,
      reason: 'create_rejected',
      message: 'the backend refused to create the routine: ' + created.error,
      jobId: '',
      route,
      backendProfile,
      createdPaused: false,
    };
  }
  // The authoritative identity, and the only one. An answer without it is
  // a blocking error: guessing from the title would bind the guided chat
  // to a routine it does not own.
  const jobId = jobIdFromResponse(addAnswer);
  if (!jobId) {
    return {
      ok: false,
      reason: 'identity_unresolved',
      message:
        'the routine was created but the backend returned no job id, so it cannot be addressed — ' +
        'check the routines list before configuring it',
      jobId: '',
      route,
      backendProfile,
      createdPaused: false,
    };
  }
  return { ok: true, jobId, route, backendProfile, job: rowOf(addAnswer) };
}

/**
 * Decide what a pair of round trips means, with no host access and no
 * throwing: every failure mode is a report, so the caller can surface it
 * and still keep the minted job addressable.
 */
export function resolveProvisionalCreate(input: ProvisionalCreateInput): ProvisionalResult {
  const minted = mintedRoutineFrom(input.route, input.addAnswer);
  if (minted.ok === false) return minted;
  const { jobId, route, backendProfile } = minted;

  if (input.pause.status === 'rejected') {
    return {
      ok: false,
      reason: 'pause_rejected',
      message:
        'the routine was created but pausing it failed (' + input.pause.message +
        ') — it may still run on its schedule; check it before the first run',
      jobId,
      route,
      backendProfile,
      createdPaused: false,
    };
  }
  const paused = cronOutcomeOf(input.pause.answer);
  if (!paused.ok) {
    return {
      ok: false,
      reason: 'pause_rejected',
      message: 'the routine was created but the backend refused to pause it: ' + paused.error,
      jobId,
      route,
      backendProfile,
      createdPaused: false,
    };
  }
  if (!pausedConfirmedBy(input.pause.answer)) {
    return {
      ok: false,
      reason: 'pause_unconfirmed',
      message:
        'the routine was created but the backend did not confirm it is paused — ' +
        'check it before its first run',
      jobId,
      route,
      backendProfile,
      createdPaused: false,
    };
  }

  return {
    ok: true,
    routine: {
      jobId,
      route,
      backendProfile,
      createdPaused: true,
      job: rowOf(input.pause.answer) ?? minted.job,
    },
  };
}

// ── reload rehydration (issue #65 Part B, scenario 2) ──
// A Desktop/plugin reload wipes every React slot, so the ONLY durable
// truth is the backend row. `_format_job` returns `paused_reason` +
// `paused_at` on every row — but the plugin surface cannot STAMP a
// distinct reason: the `cron.manage` RPC forwards only
// name/schedule/prompt/repeat/continuity/deliver on add and only the
// job_id on pause (`tui_gateway/methods_tools.py`), and `pause_job`
// stores `paused_reason: None` when it receives none (`cron/jobs.py`).
// A guided provisional is therefore row-indistinguishable from a
// user-paused routine. This module does NOT pretend otherwise.
//
// What IS durable and honest: a routine that is paused and has NEVER run
// has no complete configuration to preserve — whether it came from the
// guided flow, the composer's create-on-hold, or a manual pause before
// the first run. Such a row is a *candidate* for (re)opening a guided
// session: the reopen re-reads truth, re-binds identity by exact job_id,
// and no path below resumes or mutates anything. A row with any run
// evidence is never a candidate, so a configured routine can never be
// mislabelled as needing configuration.

/** Row keys that prove a routine has fired at least once. */
const RUN_EVIDENCE_KEYS = Object.freeze([
  'last_run_at',
  'lastRunAt',
  'last_run',
  'lastRun',
  'last_status',
  'lastStatus',
  'last_fire_error',
  'lastFireError',
  'last_error',
  'lastError',
]);

function hasRunEvidence(job: RoutineJob): boolean {
  for (const key of RUN_EVIDENCE_KEYS) {
    const value = job[key];
    if (typeof value === 'string' && value.trim() !== '') return true;
    if (value !== undefined && value !== null && typeof value !== 'string') return true;
  }
  return false;
}

/**
 * Is this row a candidate for (re)opening a guided configuration
 * session? Paused, addressable by exact job_id, and never run. Null for
 * anything else — an active, missing-id, or already-run row is never
 * mislabelled, and returning null is what keeps the affordance away
 * from configured routines.
 */
export function guidedConfigCandidateOf(job: RoutineJob | null | undefined): { jobId: string } | null {
  if (job === null || job === undefined) return null;
  const row = job as RoutineJob;
  const id = typeof row.job_id === 'string' ? row.job_id.trim() : '';
  if (!id) return null;
  if (!jobPaused(row)) return null;
  if (hasRunEvidence(row)) return null;
  return { jobId: id };
}

/**
 * Rebuild an addressable guided handle from a durable row, e.g. after a
 * reload wiped the panel state, or to resume a configuration the user
 * closed. The row must be a `guidedConfigCandidateOf` candidate AND the
 * caller must hand the route that owns it; anything else is null, never
 * a guessed handle. The handle re-proves paused-ness from the list read
 * it was built from — it never auto-resumes, and the confirm path still
 * re-runs its stale guard before any mutation.
 */
export function buildReopenHandle(
  route: PluginProfileRoute | null | undefined,
  job: RoutineJob | null | undefined,
): ProvisionalRoutine | null {
  const candidate = guidedConfigCandidateOf(job);
  if (candidate === null) return null;
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) return null;
  const backendProfile = backendTargetProfile(route, '') || null;
  if (!backendProfile) return null;
  return {
    jobId: candidate.jobId,
    route,
    backendProfile,
    createdPaused: true,
    job: (job as RoutineJob) ?? null,
  };
}

/** Classify a provisional-create outcome as a stage record (observability). */
export function diagOfProvisionalResult(result: ProvisionalResult): GuidedDiagRecord {
  if (result.ok) return recordGuidedDiag(GUIDED_DIAG_STAGES.PROVISIONAL_CREATE, 'ok');
  return recordGuidedDiag(GUIDED_DIAG_STAGES.PROVISIONAL_CREATE, result.reason);
}
