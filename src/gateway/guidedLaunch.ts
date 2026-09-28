import {
  buildGuidedEnvelope,
  serializeGuidedEnvelope,
  type GuidedEnvelopeFallback,
} from '../domain/guidedEnvelope';
import type { ProvisionalRoutine } from '../domain/provisional';
import { openGuidedRoutineChat, type GuidedRoutineChatFailure } from './guidedChat';

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
