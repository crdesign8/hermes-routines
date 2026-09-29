import type { RoutineJob } from './jobs';
import { jobIdOf, jobPaused } from './jobs';
// @ts-ignore TS5097: intentional explicit .ts extension for node runtime
import { describeSchedule as describeCanonicalSchedule } from './schedule.ts';

// Presentation layer ported from hermes-crew (Flutter) —
//   app/lib/models/cron_job.dart (state, title, humanSchedule, run
//   distances, last-result) and
//   app/lib/core/utils/cron_schedule_humanizer.dart (describe).
//
// The backend owns the row shape (cron.manage), so every reader below is
// defensive: snake_case (Core REST) and camelCase both resolve, `schedule`
// may be a string or a { display, expr } object, and anything unparseable
// falls back to the raw text instead of hiding the schedule.

export type RoutineState = 'scheduled' | 'paused' | 'completed' | 'error' | 'unknown';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalString(value);
    if (text !== null) return text;
  }
  return null;
}

/** Raw `state` token, normalized the way CronJobState.fromJson does. */
export function routineStateOf(job: RoutineJob | null | undefined): RoutineState {
  const row = asRecord(job);
  const raw = row === null ? '' : optionalString(row.state) ?? '';
  const token = raw.trim();
  if (!token) return 'scheduled';
  if (token === 'scheduled') return 'scheduled';
  if (token === 'paused') return 'paused';
  if (token === 'completed') return 'completed';
  if (token === 'error') return 'error';
  return 'unknown';
}

/** True while the job cannot fire (paused token or stored enabled === false). */
export function routinePausedOf(job: RoutineJob | null | undefined): boolean {
  if (jobPaused(job ?? undefined)) return true;
  return routineStateOf(job) === 'paused';
}

export function routineCompleted(job: RoutineJob | null | undefined): boolean {
  return routineStateOf(job) === 'completed';
}

export function routineErrored(job: RoutineJob | null | undefined): boolean {
  return routineStateOf(job) === 'error';
}

export function routineTerminal(job: RoutineJob | null | undefined): boolean {
  const state = routineStateOf(job);
  return state === 'completed' || state === 'error';
}

/** True while the job still has a future: neither terminal nor paused. */
export function routineActive(job: RoutineJob | null | undefined): boolean {
  return !routinePausedOf(job) && !routineTerminal(job);
}

/**
 * Display title: `name` else `job_id`, without the optional `[bot:x]`
 * prefix some cron names carry. Presentation only — a title never drives a
 * mutation (see `jobIdOf`). Falls back to the caller label.
 */
export function routineTitle(job: RoutineJob | null | undefined, fallback: string): string {
  const row = asRecord(job);
  const raw = firstString(row?.name, row?.job_id, row?.id) ?? '';
  const title = raw
    .replace(/^\[bot:[a-z0-9][a-z0-9_-]*\]\s*/i, '')
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return title || fallback;
}

/**
 * View key for rendering and selection: the canonical `job_id`, else the
 * caller's positional label (a display-only placeholder for a row that
 * carries no id). Never a mutation identity — mutations address a row
 * through `jobIdOf` and fail closed on ''.
 */
export function routineKey(job: RoutineJob | null | undefined, fallback: string): string {
  return jobIdOf(job ?? undefined) || fallback;
}

/**
 * Run instruction for display: full `prompt`, else the `prompt_preview`
 * the list may carry, else a legacy nested `payload.prompt`. Null when the
 * row carries no instruction (callers render their own fallback).
 */
export function routinePromptOf(job: RoutineJob | null | undefined): string | null {
  const row = asRecord(job);
  if (row === null) return null;
  const nested = asRecord(row.payload);
  return firstString(row.prompt, row.prompt_preview, row.promptPreview, nested?.prompt);
}

interface ScheduleTexts {
  display: string | null;
  expr: string | null;
}

function scheduleTexts(job: RoutineJob | null | undefined): ScheduleTexts {
  const row = asRecord(job);
  if (row === null) return { display: null, expr: null };
  const nested = asRecord(row.schedule);
  const display = firstString(
    row.schedule_display,
    row.scheduleDisplay,
    nested?.display,
  );
  let expr = firstString(row.schedule_expr, row.scheduleExpr, nested?.expr);
  if (expr === null && typeof row.schedule === 'string') {
    const raw = optionalString(row.schedule);
    // A bare string is the expression; when it equals the display the
    // parser drops it (mirrors CronJob.fromJson distinctScheduleExpr).
    expr = raw !== null && raw !== display ? raw : null;
  }
  if (expr !== null && expr === display) expr = null;
  return { display, expr };
}

/**
 * Human-readable schedule: prefers plain-language display text, otherwise
 * translates a cron expression ("0 7 * * 2" -> "Every Tuesday at 07:00").
 * Falls back to the raw expression, never to an empty claim.
 */
export function humanScheduleOf(job: RoutineJob | null | undefined): string {
  const { display, expr } = scheduleTexts(job);
  if (display !== null && !looksLikeCronExpression(display)) {
    return describeSchedule(display);
  }
  const source = expr ?? display;
  if (source === null) return '';
  return describeSchedule(source);
}

/** Raw cron expression for the technical disclosure (null when absent). */
export function rawScheduleOf(job: RoutineJob | null | undefined): string | null {
  const { display, expr } = scheduleTexts(job);
  return expr ?? display;
}

function fieldOf(job: RoutineJob | null | undefined, ...keys: string[]): string | null {
  const row = asRecord(job);
  if (row === null) return null;
  for (const key of keys) {
    const text = optionalString(row[key]);
    if (text !== null) return text;
  }
  return null;
}

export function nextRunIso(job: RoutineJob | null | undefined): string | null {
  return fieldOf(job, 'next_run_at', 'nextRunAt', 'next_run', 'nextRun');
}

export function lastRunIso(job: RoutineJob | null | undefined): string | null {
  return fieldOf(job, 'last_run_at', 'lastRunAt', 'last_run', 'lastRun');
}

export function lastStatusOf(job: RoutineJob | null | undefined): string | null {
  return fieldOf(job, 'last_status', 'lastStatus');
}

export function issueOf(job: RoutineJob | null | undefined): string | null {
  const row = asRecord(job);
  if (row === null) return null;
  const fire = asRecord(row.last_fire_error);
  const candidates: unknown[] = [
    row.last_fire_error && typeof row.last_fire_error === 'string' ? row.last_fire_error : null,
    fire?.detail ?? null,
    fire?.at ?? null,
    row.lastFireError ?? null,
    row.last_delivery_error,
    row.lastDeliveryError,
    row.paused_reason,
    row.pausedReason,
    row.last_error,
    row.lastError,
  ];
  for (const candidate of candidates) {
    const text = optionalString(candidate);
    if (text !== null) return text;
  }
  return null;
}

export function lastRanSuccessfully(job: RoutineJob | null | undefined): boolean {
  const status = (lastStatusOf(job) ?? '').trim().toLowerCase();
  return status === 'ok' || status === 'success' || status === 'completed' || status === '0';
}

/**
 * Status-token-only failure gate: true when `last_status` itself carries a
 * failure token (failed/error/failure/1). Deliberately ignores
 * `paused_reason`/`pausedReason`/`issueOf` — a clean pause that records a
 * benign reason (e.g. "paused by user") is not a failed run.
 */
export function isFailedStatus(job: RoutineJob | null | undefined): boolean {
  const status = (lastStatusOf(job) ?? '').trim().toLowerCase();
  return status === 'error' || status === 'failed' || status === 'failure' || status === '1';
}

export function lastRanWithError(job: RoutineJob | null | undefined): boolean {
  return isFailedStatus(job) || issueOf(job) !== null;
}

export interface LastResult {
  kind: 'success' | 'error' | 'neutral';
  text: string;
}

/** Outcome row: success / failure detail, else the stored status text. */
export function lastResultOf(job: RoutineJob | null | undefined): LastResult {
  if (lastRanSuccessfully(job)) return { kind: 'success', text: 'Success' };
  if (lastRanWithError(job)) {
    return { kind: 'error', text: issueOf(job) ?? 'Failed' };
  }
  return { kind: 'neutral', text: lastStatusOf(job) ?? '—' };
}

/**
 * Canonical "now" window. A timestamp inside ±1 minute of the reference
 * clock is neither future nor past for a scheduler — the run it points at
 * may already be picked up — so copy for that band states one canonical
 * condition ("Due now" for a next run, "just now" for run history) instead
 * of a signed distance that would contradict the verb in front of it.
 *
 * The window is symmetric and inclusive: exactly ±60s reads as "now", and
 * every decision below reads this single threshold.
 */
export const NOW_WINDOW_MS = 60_000;

/** Where a signed gap (timestamp − reference) sits relative to the window. */
type RunRelation = 'future' | 'now' | 'past';

function relationOfDiff(diffMs: number): RunRelation {
  if (diffMs > NOW_WINDOW_MS) return 'future';
  if (diffMs < -NOW_WINDOW_MS) return 'past';
  return 'now';
}

/**
 * Unsigned distance copy ("2 minutes", "3 hours", "5 days") for a gap the
 * caller has already proven sits outside the now window, so the smallest
 * value a user can see is "1 minute" — a leading "0" never reaches copy.
 */
function distanceText(absMs: number): string {
  const minutes = Math.floor(absMs / 60_000);
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')}`;
  const days = Math.round(hours / 24);
  return `${days} ${plural(days, 'day')}`;
}

/**
 * Run-history distance, always past-oriented: "just now" inside the now
 * window, "2 minutes ago" beyond it. A timestamp ahead of the clock is
 * skew, not a future execution — a last-run row saying "in 2 minutes"
 * would claim a run that has not happened — so it clamps to the same
 * canonical "just now".
 */
export interface RunDistance {
  text: string;
  date: string | null;
}

export function runDistanceOf(iso: string | null | undefined, now?: Date): RunDistance | null {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const elapsedMs = (now ?? new Date()).getTime() - timestamp.getTime();
  return {
    text: relationOfDiff(-elapsedMs) === 'past' ? `${distanceText(elapsedMs)} ago` : 'just now',
    date: formatDate(iso ?? null),
  };
}

/** Next-run condition for copy: ahead of the clock, due, or stale. */
export type NextRunState = 'future' | 'now' | 'overdue';

/**
 * Next-run copy, decided from the timestamp's relation to the clock rather
 * than from the field it came from (issue #75): a past `next_run_at` is an
 * overdue schedule, never a "Next" label glued to an "ago" distance.
 *
 * `sentence` is complete for a surface with no label of its own ("Next run
 * in 2 minutes", "Due now", "Overdue by 2 minutes"); `text` is the
 * predicate a labelled row needs beside its own "Next run" label ("in 2
 * minutes", "due now", "overdue by 2 minutes"). Both come from this one
 * state machine, so no surface composes wording of its own.
 */
export interface NextRunCopy {
  state: NextRunState;
  text: string;
  sentence: string;
  date: string | null;
}

export function nextRunCopyOf(iso: string | null | undefined, now?: Date): NextRunCopy | null {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const diffMs = timestamp.getTime() - (now ?? new Date()).getTime();
  const date = formatDate(iso ?? null);
  const relation = relationOfDiff(diffMs);
  if (relation === 'future') {
    const distance = distanceText(diffMs);
    return { state: 'future', text: `in ${distance}`, sentence: `Next run in ${distance}`, date };
  }
  if (relation === 'past') {
    const distance = distanceText(-diffMs);
    return { state: 'overdue', text: `overdue by ${distance}`, sentence: `Overdue by ${distance}`, date };
  }
  return { state: 'now', text: 'due now', sentence: 'Due now', date };
}

/**
 * Latest execution, shaped for a read-only disclosure: the last-run distance
 * with its absolute date, the outcome as a tone plus a short label, and the
 * failure detail on its own row.
 *
 * `issue` is set only for a failure — a successful run never leaks a stale
 * `last_fire_error` — and the result label stays short ('Failed') so the same
 * tone can be reused wherever the detail sits next to it.
 *
 * `known` asks whether the row carries evidence of an execution at all: a run
 * timestamp or a last-status token. Deliberately not `issueOf`, which also
 * reads non-run fields — a benign `paused_reason` would otherwise render a
 * routine that never fired as a failed one. A lifecycle `error` state with no
 * recorded run stays empty here on purpose: the inspector reports executions,
 * and the job's error state is already spoken for by the row's status
 * indicator, which has its own vocabulary.
 *
 * `nextRun` is the state-aware copy from `nextRunCopyOf`, so the inspector
 * reads "in 2 hours" for a future schedule and "overdue by 2 hours" for a
 * stale one — never a past distance behind a "Next run" label.
 */
export interface LastExecution {
  known: boolean;
  lastRun: RunDistance | null;
  resultKind: LastResult['kind'];
  resultText: string;
  issue: string | null;
  nextRun: NextRunCopy | null;
}

export function lastExecutionOf(job: RoutineJob | null | undefined): LastExecution {
  const result = lastResultOf(job);
  const failed = result.kind === 'error';
  const known = lastRunIso(job) !== null || lastStatusOf(job) !== null;

  return {
    known,
    lastRun: runDistanceOf(lastRunIso(job)),
    resultKind: result.kind,
    // The failure detail moves to its own row; the badge keeps the outcome.
    resultText: failed ? 'Failed' : result.text,
    // Gated on known so the block can never contradict itself: a row with no
    // execution shows the empty state and no issue row, even when the backend
    // parked a benign reason there (issueOf also reads paused_reason).
    issue: known && failed ? issueOf(job) : null,
    nextRun: routineActive(job) ? nextRunCopyOf(nextRunIso(job)) : null,
  };
}

/**
 * Health indicator for the routine row: a single token combining lifecycle
 * state with the last-run outcome. Precedence is
 * completed > error(state) > paused > outcome > unknown, matching
 * statusOf/collapsedSubtitleOf, so a terminal job keeps its lifecycle token
 * even when disabled and a paused job never reports a stale failure.
 *
 * Inside the outcome step a recorded success outranks a failure signal
 * (issue #76): the outcome belongs to the run, and `lastResultOf` already
 * reads it that way — a `last_fire_error` left behind by an earlier run
 * cannot repaint a successful one as failed. Null rows are unknown.
 */
export type RoutineHealth = 'healthy' | 'failed' | 'paused' | 'completed' | 'unknown';

export function routineHealthOf(job: RoutineJob | null | undefined): RoutineHealth {
  if (job === null || job === undefined) return 'unknown';
  if (routineCompleted(job)) return 'completed';
  if (routineErrored(job)) return 'failed';
  if (routinePausedOf(job)) return 'paused';
  if (lastRanSuccessfully(job)) return 'healthy';
  if (lastRanWithError(job)) return 'failed';
  return 'unknown';
}

/**
 * Collapsed subtitle: the humanized schedule followed by the canonical
 * next-run copy, e.g. "Every Friday at 08:00  |  Next run in 6 days".
 * Terminal jobs keep their status copy even when disabled; paused jobs
 * show "Paused". The next-run half comes from nextRunCopyOf, so an overdue
 * schedule reads "Overdue by 2 hours" instead of a past distance hiding
 * behind a "Next" label.
 */
export function collapsedSubtitleOf(job: RoutineJob | null | undefined): string {
  if (routineCompleted(job)) return 'Completed';
  if (routineErrored(job)) return 'Error';
  if (routinePausedOf(job)) return 'Paused';
  const base = humanScheduleOf(job) || '—';
  const next = nextRunCopyOf(nextRunIso(job));
  if (next === null) return base;
  return `${base}  |  ${next.sentence}`;
}

/** Parse an ISO-8601 timestamp without letting malformed values escape. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return null;
  return new Date(time);
}

/** Absolute local date ("09/01/2026 07:00"). Null for malformed input. */
export function formatDate(iso: string | null | undefined): string | null {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const month = pad(timestamp.getMonth() + 1);
  const day = pad(timestamp.getDate());
  const year = timestamp.getFullYear();
  return `${month}/${day}/${year} ${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
}

function plural(value: number, unit: string): string {
  return value === 1 ? unit : `${unit}s`;
}

function looksLikeCronExpression(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) return false;
  return fields.every((field) => /^[\d*,/\-*]+$/.test(field));
}

// ── Humanizer: delegated to the canonical schedule-domain contract ──
//
// Wording unification (issue #5): the canonical contract in ./schedule.ts
// owns every humanizer semantic (interval truth, cron parsing, composer
// wording, verbatim fail-closed fallback). This module keeps only the
// presentation glue above (humanScheduleOf routing, scheduleTexts,
// rawScheduleOf, looksLikeCronExpression) and re-exports the canonical
// describeSchedule under this module's long-standing name, so every
// existing import path keeps resolving with zero behavior drift.

/** Plain-English description; unknown shapes return verbatim. */
export function describeSchedule(expr: unknown): string {
  return describeCanonicalSchedule(expr);
}
