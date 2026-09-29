import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { messageOf } from '../lib/errors';
import { buildAddParams, buildPauseParams } from './cronParams';
import { requestCronForRoute } from './cronGateway';
import {
  mintedRoutineFrom,
  resolveProvisionalCreate,
  type PauseOutcome,
  type ProvisionalResult,
} from '../domain/provisional';

// The one door to "create a routine that exists but cannot run yet".
//
// Two round trips, and the second one is not optional. `cron.manage add`
// always creates a runnable job: its wire params are `extra="forbid"` and
// declare no paused/disabled key, and the handler forwards only
// name/schedule/prompt/repeat/continuity/deliver. So the paused invariant
// is reached by pausing the id the backend just minted, and then
// PROVING the pause took — an unconfirmed pause is reported, never
// assumed.
//
// Fail-closed, like the rest of the gateway: a create with no resolved
// route is refused before any host door is touched, and the view never
// passes the active-door opt-in.
//
// This function never throws for a backend refusal: `cron.manage` reports
// tool-level failures inside a SUCCESSFUL JSON-RPC frame, so a rejected
// mutation must be read out of the answer, not inferred from a rejection.

/** User input for a provisional create — the same fields the composer collects. */
export interface ProvisionalCreateRequest {
  route: PluginProfileRoute | null | undefined;
  name: string;
  schedule: string;
  prompt: string;
  /**
   * Optional normalized delivery target (issue #65). Absent/undefined is
   * the backend default — `buildAddParams` omits the key entirely.
   */
  delivery?: string;
}

/**
 * Create the routine paused and return its authoritative handle.
 *
 * On success the caller holds a `job_id` that is proven non-runnable plus
 * the route that owns it. On any failure it holds either nothing (the
 * backend refused the create) or a `jobId` it can still address — never a
 * name to guess with, and never a silently-active routine reported as
 * provisional.
 */
export async function createProvisionalRoutine(
  request: ProvisionalCreateRequest,
): Promise<ProvisionalResult> {
  const { route, name, schedule, prompt, delivery } = request;

  // Build both payloads before any round trip: a local validation or
  // scoping fault must cost zero backend calls, never leave a minted job
  // half-configured behind it.
  let addParams: Record<string, unknown>;
  let pauseOf: (jobId: string) => Record<string, unknown>;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt, delivery });
    pauseOf = (jobId: string) => buildPauseParams(route, jobId);
  } catch (err) {
    // A fault here is a local/scoping rejection, so no job was minted.
    return resolveProvisionalCreate({ route, addAnswer: null, pause: { status: 'rejected', message: messageOf(err) } });
  }

  let addAnswer: unknown;
  try {
    addAnswer = await requestCronForRoute(route, 'cron.manage', addParams, undefined, {
      spawnPriority: 'foreground',
    });
  } catch (err) {
    return resolveProvisionalCreate({ route, addAnswer: null, pause: { status: 'rejected', message: messageOf(err) } });
  }

  // Stop before the second call unless the add genuinely minted an
  // addressable job: a refused create has no job to pause, and an answer
  // with no id must never be matched by title to pause a DIFFERENT
  // routine. The minted verdict is asked on its own because the pause
  // needs the id this call produces.
  const minted = mintedRoutineFrom(route, addAnswer);
  if (minted.ok === false) return minted;

  let pause: PauseOutcome;
  try {
    const pauseAnswer = await requestCronForRoute(
      route,
      'cron.manage',
      pauseOf(minted.jobId),
      undefined,
      { spawnPriority: 'foreground' },
    );
    pause = { status: 'answered', answer: pauseAnswer };
  } catch (err) {
    pause = { status: 'rejected', message: messageOf(err) };
  }

  return resolveProvisionalCreate({ route, addAnswer, pause });
}
