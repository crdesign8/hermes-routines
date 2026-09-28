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
 * Health indicator for the routine row: a single token combining lifecycle
 * state with the last-run outcome. Precedence is
 * completed > error(state) > paused > failed > healthy > unknown, matching
 * statusOf/collapsedSubtitleOf, so a terminal job keeps its lifecycle token
 * even when disabled and a paused job never reports a stale failure.
 * Null rows are unknown.
 */
export type RoutineHealth = 'healthy' | 'failed' | 'paused' | 'completed' | 'unknown';

export function routineHealthOf(job: RoutineJob | null | undefined): RoutineHealth {
  if (job === null || job === undefined) return 'unknown';
  if (routineCompleted(job)) return 'completed';
  if (routineErrored(job)) return 'failed';
  if (routinePausedOf(job)) return 'paused';
  if (lastRanWithError(job)) return 'failed';
  if (lastRanSuccessfully(job)) return 'healthy';
  return 'unknown';
}

/**
 * Collapsed subtitle: the humanized schedule followed by the next-run
 * distance, e.g. "Every Friday at 08:00  |  Next in 06 days". Terminal jobs
 * keep their status copy even when disabled; paused jobs show "Paused".
 */
export function collapsedSubtitleOf(job: RoutineJob | null | undefined): string {
  if (routineCompleted(job)) return 'Completed';
  if (routineErrored(job)) return 'Error';
  if (routinePausedOf(job)) return 'Paused';
  const base = humanScheduleOf(job) || '—';
  const next = nextRunIso(job);
  const when = next === null ? null : formatWhen(next);
  if (when === null) return base;
  const daysMatch = /^in (\d+) days?$/.exec(when);
  const nextText =
    daysMatch?.[1] !== undefined
      ? `Next in ${daysMatch[1].padStart(2, '0')} days`
      : `Next ${when.charAt(0).toUpperCase()}${when.slice(1)}`;
  return `${base}  |  ${nextText}`;
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

/**
 * Relative human distance ("in 2 days", "4 days ago", "in 30 minutes").
 * Returns null for malformed input. Mirrors formatCronWhen.
 */
export function formatWhen(iso: string | null | undefined, now?: Date): string | null {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const reference = now ?? new Date();
  const diffMs = timestamp.getTime() - reference.getTime();
  if (diffMs > 0) {
    if (diffMs < 60_000) return 'soon';
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `in ${minutes} ${plural(minutes, 'minute')}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours} ${plural(hours, 'hour')}`;
    const days = Math.round(hours / 24);
    return `in ${days} ${plural(days, 'day')}`;
  }
  const elapsedMs = -diffMs;
  if (elapsedMs < 60_000) return 'just now';
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${plural(days, 'day')} ago`;
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
