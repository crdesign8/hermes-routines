// ── failure hierarchy (issue #76) ──
//
// A failed routine has to answer three questions, in this order:
//
//   1. what failed          -> "The last run failed."
//   2. the concise reason   -> derived ONLY when the backend output can be
//                              safely summarized
//   3. the technical detail -> exit code, stderr, timestamps, the raw
//                              runner/backend message, identifiers
//
// This module owns (2) and (3), and it owns them fail-closed:
//
//   * a reason comes from a small CLOSED table of machine tokens the
//     backend actually emitted (an errno, a canonical error sentence).
//     Each sentence is a restatement of the token, never a diagnosis —
//     the table may say WHAT the output said, never WHY beyond it.
//     Anything unmatched derives nothing (null), so an unparseable
//     failure falls back to the generic summary instead of a guess;
//   * evidence is copied verbatim: never trimmed at the ends of a line,
//     never ellipsized, never summarized. A long stderr stays long;
//   * a missing field paints NO row: an absent stderr is absent, not an
//     empty claim.
//
// Pure and host-free: no clock, no rendering, and no throwing for row
// shapes the backend may legitimately send (the same defensive contract
// as present.ts — the backend owns the row).

import type { RoutineJob } from './jobs';
import { issueOf, lastExecutionOf, lastRunIso } from './present';

/** What failed, stated plainly. Used only when nothing safer can be said. */
export const GENERIC_FAILURE_SUMMARY = 'The last run failed.';

/** One piece of raw technical evidence, copied verbatim from the row. */
export interface FailureEvidence {
  /** Row label, e.g. "Exit code" — what the value is, not what it means. */
  label: string;
  /** The value exactly as the backend sent it (interior newlines kept). */
  value: string;
}

export interface FailureExplanation {
  /** The headline: always safe, always present when a run failed. */
  summary: string;
  /** A concise reason derived from a known token; null when none can be. */
  reason: string | null;
  /** Raw evidence in reading order; this module never truncates it. */
  evidence: FailureEvidence[];
}

/**
 * Closed table of machine token -> one fixed sentence. First match wins,
 * in this order (the most specific signal first). Matching is case
 * insensitive and deliberately narrow: an errno or a canonical message is
 * evidence, prose that merely resembles one is not.
 */
const REASON_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcommand not found\b|\bENOENT\b/i, 'A required command or file was not found.'],
  [/\bpermission denied\b|\bEACCES\b/i, 'Permission was denied.'],
  [/\btim(?:ed|e)?[ -]?out\b|\bETIMEDOUT\b/i, 'The run timed out.'],
  [
    /\bconnection refused\b|\bECONNREFUSED\b|\bENOTFOUND\b|\bEAI_AGAIN\b/i,
    'The network request failed.',
  ],
  [
    /\btoo many requests\b|\brate[ -]?limit(?:ed|ing)?\b|\b(?:status|http)[ :]*429\b/i,
    'The service rate limit was hit.',
  ],
  [
    /\bunauthorized\b|\bauthentication (?:failed|required)\b|\binvalid api key\b/i,
    'Authentication was rejected.',
  ],
  [/\bno space left on device\b|\bENOSPC\b/i, 'The disk is full.'],
];

/**
 * Derive the concise reason from the raw failure texts, or null when no
 * known token is present. Callers must treat null as "nothing can be
 * safely said" — never as "try harder to guess".
 */
export function deriveFailureReason(...texts: (string | null | undefined)[]): string | null {
  for (const [pattern, reason] of REASON_PATTERNS) {
    for (const text of texts) {
      if (typeof text === 'string' && pattern.test(text)) return reason;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * First present, non-empty value among the keys, kept verbatim apart from
 * surrounding whitespace (interior newlines and long lines are the
 * evidence). Numbers are stringified, because an exit code arrives as
 * either. Null when the row carries none of them.
 */
function firstText(row: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/**
 * Explain a failed run for a read-only disclosure: the safe headline, the
 * derived reason when one exists, and the raw evidence behind them.
 *
 * Returns null unless the row's LATEST run is known-failed — the same gate
 * the inspector paints with — so a success (even one still carrying a
 * stale error string), a clean pause, or a never-run row earns no
 * explanation and no technical block at all.
 */
export function explainFailureOf(job: RoutineJob | null | undefined): FailureExplanation | null {
  const execution = lastExecutionOf(job);
  // `known` matters as much as the outcome: a row that carries only a
  // parked reason (issueOf also reads `paused_reason`) reports no run, and
  // claiming "the last run failed" above its own "No runs yet." would be
  // a contradiction the block must never print.
  if (!execution.known || execution.resultKind !== 'error') return null;

  const row = asRecord(job);
  const message = issueOf(job);
  const stderr = firstText(row, ['last_stderr', 'lastStderr', 'stderr']);
  const exitCode = firstText(row, ['last_exit_code', 'lastExitCode', 'exit_code', 'exitCode']);
  const runAt = lastRunIso(job);
  const runId = firstText(row, ['last_run_id', 'lastRunId', 'run_id', 'runId']);

  const evidence: FailureEvidence[] = [];
  const push = (label: string, value: string | null): void => {
    if (value !== null) evidence.push({ label, value });
  };

  // Reading order follows the disclosure itself: how it exited, what it
  // printed, when it ran, the recorded message, then identifiers.
  push('Exit code', exitCode);
  // A stderr that merely repeats the recorded message is one fact twice.
  push('Stderr', stderr === message ? null : stderr);
  push('Run timestamp', runAt);
  push('Issue', message);
  push('Run id', runId);

  return {
    summary: GENERIC_FAILURE_SUMMARY,
    reason: deriveFailureReason(message, stderr),
    evidence,
  };
}
