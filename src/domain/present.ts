import type { RoutineJob } from './jobs';
import { jobIdOf, jobPaused } from './jobs';

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
 * prefix some cron names carry. Falls back to the caller label.
 */
export function routineTitle(job: RoutineJob | null | undefined, fallback: string): string {
  const row = asRecord(job);
  const raw = firstString(row?.name, row?.job_id, row?.id) ?? '';
  const title = raw
    .replace(/^\[bot:[a-z0-9][a-z0-9_-]*\]\s*/i, '')
    .trim();
  return title || fallback;
}

/** Canonical identity for keys and mutations (mirrors jobIdOf). */
export function routineKey(job: RoutineJob | null | undefined, fallback: string): string {
  return jobIdOf(job ?? undefined) || fallback;
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
 * translates a cron expression ("0 7 * * 2" -> "Tuesdays at 07:00").
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

export function lastRanWithError(job: RoutineJob | null | undefined): boolean {
  const status = (lastStatusOf(job) ?? '').trim().toLowerCase();
  const failed =
    status === 'error' || status === 'failed' || status === 'failure' || status === '1';
  return failed || issueOf(job) !== null;
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
 * Collapsed subtitle: the humanized schedule followed by the next-run
 * distance, e.g. "Fridays at 08:00  |  Next in 06 days". Terminal jobs
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

// ── CronScheduleHumanizer.describe port ──

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Plain-English description; unknown shapes return verbatim. */
export function describeSchedule(expr: unknown): string {
  if (typeof expr !== 'string') return '';
  const trimmed = expr.trim();
  if (!trimmed) return '';
  const interval = describeInterval(trimmed);
  if (interval !== null) return interval;

  const fields = splitFields(trimmed);
  if (fields === null) return trimmed;
  const minute = parseField(fields[0] ?? '', 0, 59);
  const hour = parseField(fields[1] ?? '', 0, 23);
  const dom = parseField(fields[2] ?? '', 1, 31);
  const month = parseField(fields[3] ?? '', 1, 12);
  const dow = parseField(fields[4] ?? '', 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return trimmed;

  if (minute.isWildcard && hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    return 'Every minute';
  }
  if (
    minute.step !== null &&
    minute.step > 1 &&
    hour.isWildcard &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    return `Every ${minute.step} minutes`;
  }
  if (
    minute.isZeroOnly &&
    hour.step !== null &&
    hour.step > 1 &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    return `Every ${hour.step} hours`;
  }
  if (
    minute.values.length === 1 &&
    hour.isWildcard &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const only = minute.values[0];
    if (only === undefined) return trimmed;
    if (minute.isZeroOnly) return 'Every hour';
    return `Every hour at :${String(only).padStart(2, '0')}`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === undefined || h === undefined) return trimmed;
    return `Every day at ${formatTime(m, h)}`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    dom.isWildcard &&
    month.isWildcard &&
    !dow.isWildcard
  ) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === undefined || h === undefined) return trimmed;
    const days = normalizedWeekdays(dow.values);
    if (days.length === 0) return trimmed;
    return `${describeWeekdays(days)} at ${formatTime(m, h)}`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    !dom.isWildcard &&
    dom.values.length > 1 &&
    isContiguousRange(dom.values) &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    const h = hour.values[0];
    const first = dom.values[0];
    const last = dom.values[dom.values.length - 1];
    if (m === undefined || h === undefined || first === undefined || last === undefined) {
      return trimmed;
    }
    return `At ${formatTime(m, h)} on the ${ordinal(first)} to ${ordinal(last)} of every month`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    !dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === undefined || h === undefined) return trimmed;
    const days = sortedUnique(dom.values);
    if (days.length === 1) {
      const only = days[0];
      if (only === undefined) return trimmed;
      return `On the ${ordinal(only)} of every month at ${formatTime(m, h)}`;
    }
    return `On ${joinNames(days.map(ordinal))} of every month at ${formatTime(m, h)}`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    dom.isWildcard &&
    !month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === undefined || h === undefined) return trimmed;
    const months = sortedUnique(month.values)
      .map((value) => (value >= 1 && value <= 12 ? MONTH_NAMES[value - 1] : null))
      .filter((name): name is string => name !== null);
    if (months.length === 0) return trimmed;
    return `Every day in ${joinNames(months)} at ${formatTime(m, h)}`;
  }
  if (
    minute.values.length === 1 &&
    hour.values.length > 1 &&
    !isContiguousRange(hour.values) &&
    hour.explicitStep == null &&
    !hour.isWildcard &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    if (m === undefined) return trimmed;
    return `At ${joinNames(hour.values.map((h) => formatTime(m, h)))} every day`;
  }
  if (
    minute.values.length === 1 &&
    (isContiguousRange(hour.values) || hour.explicitStep != null) &&
    !hour.isWildcard &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const m = minute.values[0];
    const first = hour.values[0];
    const last = hour.values[hour.values.length - 1];
    if (m === undefined || first === undefined || last === undefined) return trimmed;
    const start = formatTime(m, first);
    const end = formatTime(m, last);
    if (hour.explicitStep != null && hour.explicitStep > 1) {
      return `Every ${hour.explicitStep} hours from ${start} to ${end}`;
    }
    return `Every hour from ${start} to ${end}`;
  }
  if (
    minute.values.length === 1 &&
    month.isWildcard &&
    dow.isWildcard &&
    hour.step !== null &&
    hour.step > 1
  ) {
    const cadence = `Every ${hour.step} hours`;
    if (dom.isWildcard) return cadence;
    const first = dom.values[0];
    const last = dom.values[dom.values.length - 1];
    if (first === undefined || last === undefined) return trimmed;
    if (dom.values.length === 1) return `${cadence} on the ${ordinal(first)} of every month`;
    if (isContiguousRange(dom.values)) {
      return `${cadence} on the ${ordinal(first)} to ${ordinal(last)} of every month`;
    }
    return `${cadence} on the ${joinNames(dom.values.map(ordinal))} of every month`;
  }
  return trimmed;
}

function describeInterval(expr: string): string | null {
  const match = /^(?:every\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i.exec(
    expr.trim(),
  );
  if (!match) return null;
  const raw = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const token = (match[2] ?? '').toLowerCase();
  let minutes = raw;
  if (token.startsWith('h')) minutes = raw * 60;
  else if (token.startsWith('d')) minutes = raw * 1440;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Every day' : `Every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
  }
  return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
}

function splitFields(expr: string): string[] | null {
  const normalized = expr.trim().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
  const list = normalized.split(' ').filter((f) => f.length > 0);
  if (list.length === 6 && list[0] === '0') list.shift();
  if (list.length !== 5) return null;
  return list;
}

interface ParsedField {
  values: number[];
  isWildcard: boolean;
  step: number | null;
  explicitStep: number | null;
  isZeroOnly: boolean;
}

function parsedField(
  values: number[],
  opts: { isWildcard?: boolean; step?: number | null; explicitStep?: number | null } = {},
): ParsedField {
  return {
    values,
    isWildcard: opts.isWildcard ?? false,
    step: opts.step ?? null,
    explicitStep: opts.explicitStep ?? null,
    isZeroOnly: values.length === 1 && values[0] === 0,
  };
}

function parseField(field: string, min: number, max: number): ParsedField | null {
  const trimmed = field.trim();
  if (!trimmed) return null;
  let step: number | null = null;
  let base = trimmed;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length !== 2) return null;
    const parsed = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    step = parsed;
    base = parts[0] ?? '';
  }
  if (base === '*') {
    if (step !== null) {
      const values: number[] = [];
      for (let v = min; v <= max; v += step) values.push(v);
      return parsedField(values, { isWildcard: step === 1, step, explicitStep: step });
    }
    const values: number[] = [];
    for (let v = min; v <= max; v++) values.push(v);
    return parsedField(values, { isWildcard: step == null, step: step ?? 1, explicitStep: step });
  }
  if (!base.includes('*') && !base.includes(',') && !base.includes('-')) {
    const value = Number.parseInt(base, 10);
    if (!Number.isInteger(value) || value < min || value > max) return null;
    return parsedField([value]);
  }
  if (base.includes(',') || base.includes('-')) {
    const values = new Set<number>();
    for (const segment of base.split(',')) {
      const piece = segment.trim();
      if (!piece) return null;
      if (piece.includes('-')) {
        const range = piece.split('-');
        if (range.length !== 2) return null;
        const start = Number.parseInt(range[0] ?? '', 10);
        const end = Number.parseInt(range[1] ?? '', 10);
        if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
        if (start < min || end > max || start > end) return null;
        for (let v = start; v <= end; v++) values.add(v);
      } else {
        const value = Number.parseInt(piece, 10);
        if (!Number.isInteger(value) || value < min || value > max) return null;
        values.add(value);
      }
    }
    const sorted = sortedUnique([...values]);
    const stepped =
      step == null ? sorted : sorted.filter((v) => (v - (sorted[0] ?? 0)) % step === 0);
    if (stepped.length === 0) return null;
    return parsedField(stepped, { explicitStep: step });
  }
  return null;
}

function normalizedWeekdays(values: number[]): number[] {
  const normalized = new Set(values.map((v) => (v === 7 ? 0 : v)));
  return WEEKDAY_NAMES.map((_, index) => index).filter((index) => normalized.has(index));
}

function describeWeekdays(days: number[]): string {
  const dayList = sortedUnique(days);
  if (sameValues(dayList, [1, 2, 3, 4, 5])) return 'Every weekday';
  if (sameValues(dayList, [0, 6])) return 'Every weekend';
  if (dayList.length === 1) {
    const only = dayList[0];
    if (only === undefined) return '';
    return `${WEEKDAY_NAMES[only]}s`;
  }
  return `Every ${joinNames(dayList.map((d) => WEEKDAY_NAMES[d] ?? String(d)))}`;
}

function sameValues(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort((x, y) => x - y);
  return a.every((value, index) => value === sortedB[index]);
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const last = value % 10;
  if (last === 1) return `${value}st`;
  if (last === 2) return `${value}nd`;
  if (last === 3) return `${value}rd`;
  return `${value}th`;
}

function formatTime(minute: number, hour: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function isContiguousRange(values: number[]): boolean {
  if (values.length < 2) return false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== (values[i - 1] ?? 0) + 1) return false;
  }
  return true;
}
