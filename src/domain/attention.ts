// Runtime health, modeled apart from lifecycle (issue #80).
//
// The list segments by LIFECYCLE — all / active / paused — which answers
// "can this routine fire?". That question cannot also answer "is this
// routine working?", because the two dimensions combine:
//
//   active + healthy      -> nothing to do
//   active + failing      -> the user is losing a scheduled task right now
//   paused + old failure  -> history: nothing will retry it while it stays
//                            paused, so it must not inflate the actionable
//                            summary
//   paused + healthy      -> nothing to do
//
// A row's status indicator paints both dimensions in one glyph, which is
// why a critical failure used to depend on someone scanning the list for a
// small red icon. This module owns the SECOND dimension on its own, so a
// surface can ask "which routines need attention?" without inferring it
// from a lifecycle token.
//
// The rules, in the order they are decided (precedence is the whole
// contract, so it is written once here and read by every surface):
//
//   0. no row                -> nothing is claimed; a malformed row earns
//                               no attention it cannot prove
//   1. completed             -> terminal; there is no next run to protect
//   2. lifecycle `error`     -> the backend says the job is broken NOW;
//                               an explicit current signal, so it wins over
//                               a recorded run outcome AND over the paused
//                               rule below
//   3. last run succeeded    -> RECOVERY. This sits above every failure
//                               token on purpose: the backend keeps
//                               `last_fire_error` / `last_stderr` from the
//                               run that failed, so a later success must
//                               clear the attention state instead of being
//                               repainted by a stale field
//   4. paused                -> a pre-pause failure is history, not work.
//                               Handled INTENTIONALLY (issue #80): it is
//                               excluded from the attention slice because
//                               no retry can happen until the user resumes
//                               it, and the row still states the failure in
//                               words so the history is not lost
//   5. failed status token   -> the latest run failed and the routine will
//                               run again: this is the attention state
//   6. anything else         -> never ran, or a status token this plugin
//                               does not read as a failure. Unknown is not
//                               failure — a surprise red badge trains users
//                               to ignore red badges
//
// Two edges of this chain are deliberately NOT symmetric, and both are
// intentional rather than incidental:
//
//   * A PAUSED row whose lifecycle token is `error` still qualifies (step 2
//     runs before step 4). The paused rule is about a recorded RUN failure —
//     history the user must resume into. An `error` token is a claim about the
//     JOB itself, from the backend, about now: it needs a fix, not a resume.
//     So does the reverse case: a paused row with a failed `last_status` and
//     no `error` token stays out, because the only thing wrong with it is the
//     run that already happened.
//   * A row with no usable `job_id` NEVER qualifies, however it is failing.
//     Everything downstream of this verdict is a focus keyed on `job_id`, and
//     a row the plugin cannot address cannot be focused: it would make the
//     count promise rows the "Show them" control could not reveal. Such a row
//     still renders and still states its own failure in words.
//
// Pure and host-free, like the rest of the domain: no clock, no rendering,
// nothing thrown for a row shape the backend may legitimately send.

import { jobIdOf, type RoutineJob } from './jobs';
import {
  isFailedStatus,
  lastRanSuccessfully,
  routineCompleted,
  routineErrored,
  routinePausedOf,
} from './present';

/** Why a routine is in the attention slice. Null when it is not. */
export type AttentionReason = 'lifecycle-error' | 'current-failure';

export interface AttentionVerdict {
  /** True only when the routine is failing in a way the user can act on now. */
  needsAttention: boolean;
  reason: AttentionReason | null;
}

const NONE: AttentionVerdict = { needsAttention: false, reason: null };

/**
 * The attention verdict for one row. Every surface reads this instead of
 * re-deriving "failing" from a status token, so the page summary, the row
 * copy and the focus slice can never disagree about which routines are in
 * trouble.
 */
export function attentionOf(job: RoutineJob | null | undefined): AttentionVerdict {
  if (job === null || job === undefined) return NONE;
  // 0. An unaddressable row is outside this contract entirely. See the
  //    header: every consumer of the verdict keys on `job_id`, so counting a
  //    row with none would make the number promise a row the focus cannot
  //    reveal. It still renders, and it still states its own failure.
  if (jobIdOf(job) === '') return NONE;
  // 1. A terminal routine has no next run; a historical failure on it is
  //    not pending work.
  if (routineCompleted(job)) return NONE;
  // 2. The lifecycle token outranks the run outcome (same precedence as
  //    routineHealthOf): `error` is a claim about the job, not about a run.
  //    It is read BEFORE the paused rule on purpose — a paused job whose
  //    lifecycle token is `error` is still broken now, and resuming it does
  //    not fix a broken job.
  if (routineErrored(job)) return { needsAttention: true, reason: 'lifecycle-error' };
  // 3. A verified later success clears the attention state. Placed before
  //    every failure token so a leftover error string can never resurrect it.
  if (lastRanSuccessfully(job)) return NONE;
  // 4. Paused: a failure recorded before the pause is history (documented
  //    above). The row keeps stating it; the summary does not chase it.
  if (routinePausedOf(job)) return NONE;
  // 5. The latest run failed and the routine is still live.
  if (isFailedStatus(job)) return { needsAttention: true, reason: 'current-failure' };
  // 6. No run, or a token this plugin does not read as failure.
  return NONE;
}

/** Convenience predicate over `attentionOf`, for callers that need no reason. */
export function needsAttention(job: RoutineJob | null | undefined): boolean {
  return attentionOf(job).needsAttention;
}

/**
 * The rows that need attention, in backend order, without mutating the
 * source. A non-array input yields an empty list: the count a surface
 * paints must never be invented from garbage.
 */
export function attentionTargets(jobs: unknown): RoutineJob[] {
  if (!Array.isArray(jobs)) return [];
  return (jobs as RoutineJob[]).filter((job) => attentionOf(job).needsAttention);
}

/**
 * How many rows need attention. Computed over whatever set the caller
 * passes in — the page passes the SEARCH matches, like `filterCounts` does,
 * so the number answers "how many would I open?" rather than "how many
 * exist behind this search?".
 */
export function attentionCount(jobs: unknown): number {
  return attentionTargets(jobs).length;
}
