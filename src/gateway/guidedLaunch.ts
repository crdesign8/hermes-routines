import {
  buildGuidedEnvelope,
  serializeGuidedEnvelope,
  type GuidedEnvelopeFallback,
} from '../domain/guidedEnvelope';
import type { ProvisionalRoutine } from '../domain/provisional';
import { openGuidedRoutineChat, type GuidedRoutineChatFailure } from './guidedChat';
import { readJobConfig } from './proposalConfirm';
import {
  GUIDED_DIAG_STAGES,
  recordGuidedDiag,
  type GuidedDiagRecord,
} from '../domain/diagnostics';
import type { ProposalBaseSnapshot } from '../domain/routineProposal';

// The one door from "a routine exists, paused and addressable" to "a
// Hermes conversation is configuring exactly that routine".
//
// It composes two pure pieces — the envelope (what to say) and
// openGuidedRoutineChat (how to open it) — and adds the one thing neither
// can enforce alone: the launch never targets a routine the caller did not
// just mint. The route comes from the provisional handle the create
// returned, never from whichever profile happens to be active when the
// button is pressed, so a chat for a job on another connection cannot land
// on this one.
//
// Fail-closed end to end. No envelope means no chat (a session not bound
// to an authoritative job id is worse than no session), and every refusal
// is a report the UI can offer a retry for — never a throw, because the
// routine is already created and pausing it is the correct end state.
//
// Cold start: the two `cron.manage` round trips of the create already ran
// at foreground priority, so the owning profile is warm by the time this
// opens. The Desktop session door (`host.newChat`) takes no dial-priority
// argument upstream, so there is no priority to request here.

export interface GuidedLaunchRequest {
  /** The handle `createProvisionalRoutine` returned — the only identity source. */
  routine: ProvisionalRoutine;
  /** Submitted form values, used only where the stored row has no such field. */
  submitted?: GuidedEnvelopeFallback | null;
  /**
   * false (default) seats the envelope for the USER to send; true makes the
   * button press itself start the conversation. Passed through verbatim, so
   * this flow cannot invent a send the caller did not ask for.
   */
  autoSubmit?: boolean;
}

/** Everything the UI needs to render an honest retry path. */
export type GuidedLaunchResult =
  | { ok: true; routeKey: string; jobId: string; autoSubmitted: boolean; prompt: string }
  | {
      ok: false;
      reason: 'envelope_unavailable' | GuidedRoutineChatFailure;
      /** Why, in words fit to show the user. */
      message: string;
      /** Present whenever a real job was minted, so a retry keeps its identity. */
      jobId: string;
    };

/**
 * Open the guided configuration session for `request.routine`.
 *
 * A refused launch leaves the routine exactly as it was: paused, addressed
 * by its `job_id`, and recoverable. Nothing here resumes or mutates.
 */
export async function launchGuidedConfiguration(
  request: GuidedLaunchRequest,
): Promise<GuidedLaunchResult> {
  const routine = request?.routine;
  const jobId = typeof routine?.jobId === 'string' ? routine.jobId : '';

  // The envelope is built first, before any host door: an unbindable
  // routine must cost zero Desktop calls and open no chat at all.
  const built = buildGuidedEnvelope(routine, request?.submitted);
  if (built.ok === false) {
    return {
      ok: false,
      reason: 'envelope_unavailable',
      message: built.message,
      jobId,
    };
  }

  const prompt = serializeGuidedEnvelope(built.envelope);
  // The ROUTE carried by the handle — the descriptor, not the profile name
  // string in the envelope — so `newChat` creates the chat on the
  // connection that owns this job rather than on the active one.
  const opened = await openGuidedRoutineChat({
    route: routine.route,
    initialPrompt: prompt,
    autoSubmit: request.autoSubmit === true,
  });

  if (opened.ok === false) {
    return { ok: false, reason: opened.reason, message: opened.message, jobId };
  }

  return {
    ok: true,
    routeKey: opened.routeKey,
    jobId: built.envelope.jobId,
    autoSubmitted: opened.autoSubmitted,
    prompt,
  };
}

// ── fresh session after session loss (issue #65 Part B, scenario 8) ──
// A chat can die while its routine survives: abandoned, reloaded away, or
// its Desktop session closed. Starting over must NOT reuse the dead
// session's snapshot — the job may have moved meanwhile — so the relaunch
// re-reads authoritative truth FIRST and the new session carries a NEW
// snapshot/fingerprint. A missing or unpaused target fails closed before
// any chat is opened: a fresh session for a gone routine would be worse
// than none, and an active routine needs no configuration session.
//
// There is deliberately no TTL/expiry concept here: the backend offers no
// session expiry to honor, so "freshness" is the fingerprint match the
// review and confirm paths already enforce — not a clock. A session that
// outlives its snapshot is refused by the stale guard, never by a timer.

/** Why a fresh guided session could not be started. */
export type GuidedRelaunchFailure =
  | 'envelope_unavailable'
  | GuidedRoutineChatFailure
  /** The authoritative list could not be read. */
  | 'session_target_unreadable'
  /** The id no longer exists on the owning profile: never recreate it. */
  | 'session_target_gone'
  /** The routine is active: it needs no configuration session. */
  | 'session_target_active';

/** A fresh session: the launch proof plus the NEW authoritative basis. */
export type GuidedRelaunchResult =
  | {
      ok: true;
      routeKey: string;
      jobId: string;
      autoSubmitted: boolean;
      prompt: string;
      /** Authoritative configuration read DURING the relaunch. */
      snapshot: ProposalBaseSnapshot;
      /** Fingerprint of `snapshot` — the new session's staleness currency. */
      fingerprint: string;
    }
  | {
      ok: false;
      reason: GuidedRelaunchFailure;
      /** Why, in words fit to show the user. */
      message: string;
      /** The id the caller asked about ('' when it never resolved). */
      jobId: string;
    };

/**
 * Start a fresh guided session for an already-existing paused job.
 *
 * Truth first, chat second: the job is re-read and must exist paused on
 * its owner route before anything opens. Nothing here resumes, applies,
 * or recreates — a gone target stays gone and reported.
 */
export async function relaunchGuidedConfiguration(
  request: GuidedLaunchRequest,
): Promise<GuidedRelaunchResult> {
  const routine = request?.routine;
  const jobId = typeof routine?.jobId === 'string' ? routine.jobId : '';
  if (!jobId) {
    return {
      ok: false,
      reason: 'envelope_unavailable',
      message: 'starting a fresh session requires the authoritative job id',
      jobId: '',
    };
  }

  // The fresh basis: re-read BEFORE opening anything, so a moved target
  // fails here — with zero Desktop calls — instead of mid-conversation.
  const read = await readJobConfig({ route: routine.route, jobId });
  if (!read.ok) {
    return { ok: false, reason: 'session_target_unreadable', message: read.message, jobId };
  }
  if (!read.exists) {
    return {
      ok: false,
      reason: 'session_target_gone',
      message:
        'the routine no longer exists on its owning profile — check the routines list; it is not recreated',
      jobId,
    };
  }
  if (!read.paused) {
    return {
      ok: false,
      reason: 'session_target_active',
      message: 'the routine is active, so it needs no configuration session',
      jobId,
    };
  }

  const launched = await launchGuidedConfiguration(request);
  if (launched.ok === false) {
    return { ok: false, reason: launched.reason, message: launched.message, jobId: launched.jobId };
  }
  return {
    ok: true,
    routeKey: launched.routeKey,
    jobId: launched.jobId,
    autoSubmitted: launched.autoSubmitted,
    prompt: launched.prompt,
    snapshot: read.snapshot,
    fingerprint: read.fingerprint,
  };
}

/** Classify a launch outcome as a stage record (observability). */
export function diagOfLaunchResult(result: GuidedLaunchResult | GuidedRelaunchResult): GuidedDiagRecord {
  if (result.ok) return recordGuidedDiag(GUIDED_DIAG_STAGES.SESSION_LAUNCH, 'ok');
  return recordGuidedDiag(GUIDED_DIAG_STAGES.SESSION_LAUNCH, result.reason);
}
