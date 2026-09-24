// Canonical schedule-domain contract (issue #5).
// Single source of truth for schedule vocabularies, validation,
// cron/interval serialization, composer wording, and humanizer.
// Pure domain: zero external dependencies, fail-closed validation.
//
// Composer semantics ported from routineSchedule.ts; humanizer semantics
// ported from present.ts (CronScheduleHumanizer.describe port). Callers
// must migrate here; the legacy modules re-export this contract.

export type TriggerType =
  | 'every_hour'
  | 'every_day'
  | 'weekdays'
  | 'every_week'
  | 'every_month'
  | 'interval';

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export type IntervalUnit = 'minutes' | 'hours' | 'days';

export interface ScheduleConfig {
  trigger: TriggerType;
  time: string; // "HH:mm" e.g. "08:00"
  dayOfWeek: DayOfWeek;
  dayOfMonth: number; // 1..31
  intervalValue: number; // 2, 5, 10, 15, 20, 30, 45
  intervalUnit: IntervalUnit;
}

export const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string }> = [
  { value: 'every_hour', label: 'Every Hour' },
  { value: 'every_day', label: 'Every Day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'every_week', label: 'Every week' },
  { value: 'every_month', label: 'Every month' },
  { value: 'interval', label: 'Interval' },
];

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_OF_WEEK_TO_CRON: Record<DayOfWeek, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const INTERVAL_VALUES: number[] = [2, 5, 10, 15, 20, 30, 45];
export const INTERVAL_UNITS: IntervalUnit[] = ['minutes', 'hours', 'days'];

// Closed vocabularies: validation membership tests, never coercion sources.
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TRIGGER_VALUES: Set<string> = new Set(TRIGGER_OPTIONS.map((o) => o.value));
const DAY_OF_WEEK_VALUES: Set<string> = new Set(DAYS_OF_WEEK);
const INTERVAL_UNIT_VALUES: Set<string> = new Set(INTERVAL_UNITS);

/** Render an invalid value for an error message without letting a huge
 * payload flood the caller. Never throws: null-prototype objects and
 * circular structures would blow up String()/JSON.stringify(). */
function show(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  } catch {
    text = Object.prototype.toString.call(value);
  }
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Generate 15-minute time steps for 24 hours (96 slots from 00:00 to 23:45). */
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    for (const m of [0, 15, 30, 45]) {
      const mm = String(m).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

export const TIME_SLOTS: string[] = generateTimeSlots();

/** Format number to ordinal string (e.g. 1 -> "1st", 2 -> "2nd", 3 -> "3rd"). */
export function toOrdinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  if (rem10 === 1) return `${n}st`;
  if (rem10 === 2) return `${n}nd`;
  if (rem10 === 3) return `${n}rd`;
  return `${n}th`;
}

export const DAYS_OF_MONTH: Array<{ value: number; label: string }> = Array.from(
  { length: 31 },
  (_, i) => ({ value: i + 1, label: toOrdinal(i + 1) }),
);

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  trigger: 'every_day',
  time: '08:00',
  dayOfWeek: 'Monday',
  dayOfMonth: 1,
  intervalValue: 5,
  intervalUnit: 'minutes',
};

/**
 * Fail-closed validation of a ScheduleConfig (issue #2).
 *
 * The domain layer must never turn an invalid config into a different
 * valid-looking schedule: every value is checked against its closed
 * vocabulary or numeric range, and anything unknown, non-finite,
 * out-of-range or malformed throws a domain TypeError instead of being
 * clamped, defaulted or coerced.
 *
 * The whole config is validated regardless of the selected trigger: an
 * unrelated field carrying garbage is still an invalid config.
 */
export function validateScheduleConfig(input: unknown): asserts input is ScheduleConfig {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError(`schedule config must be an object (got ${show(input)})`);
  }
  const config = input as ScheduleConfig;

  if (!TRIGGER_VALUES.has(config.trigger)) {
    throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
  if (typeof config.time !== 'string' || !TIME_RE.test(config.time)) {
    throw new TypeError(`time must be a valid HH:mm string (got ${show(config.time)})`);
  }
  if (!DAY_OF_WEEK_VALUES.has(config.dayOfWeek)) {
    throw new TypeError(`unknown dayOfWeek value: ${show(config.dayOfWeek)}`);
  }
  if (
    typeof config.dayOfMonth !== 'number' ||
    !Number.isInteger(config.dayOfMonth) ||
    config.dayOfMonth < 1 ||
    config.dayOfMonth > 31
  ) {
    throw new TypeError(
      `dayOfMonth must be an integer between 1 and 31 (got ${show(config.dayOfMonth)})`,
    );
  }
  if (
    typeof config.intervalValue !== 'number' ||
    !Number.isInteger(config.intervalValue) ||
    config.intervalValue < 1
  ) {
    throw new TypeError(
      `intervalValue must be a finite positive integer (got ${show(config.intervalValue)})`,
    );
  }
  if (!INTERVAL_UNIT_VALUES.has(config.intervalUnit)) {
    throw new TypeError(`unknown intervalUnit value: ${show(config.intervalUnit)}`);
  }
}

/** Split a validated "HH:mm" string. Callers must validate first — this
 * parses, it never repairs. */
function parseTime(time: string): { minute: number; hour: number } {
  const [hourText, minuteText] = time.split(':');
  return { hour: Number(hourText), minute: Number(minuteText) };
}

/** Translate high abstraction config to a backend schedule string.
 * Wall-clock triggers serialize as standard 5-part cron. The interval
 * trigger serializes as Hermes-native interval syntax (every Nm/Nh/Nd),
 * which the backend parse_schedule() runs as a continuous interval —
 * cron step expressions would reset at field boundaries instead.
 *
 * Throws a TypeError on any invalid field (see validateScheduleConfig):
 * no clamping, no fallback, no silent normalization. */
export function buildCronExpression(config: ScheduleConfig): string {
  validateScheduleConfig(config);
  const { minute, hour } = parseTime(config.time);

  switch (config.trigger) {
    case 'every_hour':
      return '0 * * * *';
    case 'every_day':
      return `${minute} ${hour} * * *`;
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`;
    case 'every_week': {
      const dow = DAY_OF_WEEK_TO_CRON[config.dayOfWeek];
      return `${minute} ${hour} * * ${dow}`;
    }
    case 'every_month': {
      const dom = config.dayOfMonth;
      return `${minute} ${hour} ${dom} * *`;
    }
    case 'interval': {
      const val = config.intervalValue;
      if (config.intervalUnit === 'minutes') {
        return `every ${val}m`;
      }
      if (config.intervalUnit === 'hours') {
        return `every ${val}h`;
      }
      if (config.intervalUnit === 'days') {
        return `every ${val}d`;
      }
      throw new TypeError(`unknown intervalUnit value: ${show(config.intervalUnit)}`);
    }
    default:
      throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
}

/** Generate natural language subtitle matching the UI mockups.
 * Fails closed on invalid config exactly like buildCronExpression. */
export function describeScheduleConfig(config: ScheduleConfig): string {
  validateScheduleConfig(config);
  switch (config.trigger) {
    case 'every_hour':
      return 'Every hour';
    case 'every_day':
      return `Every day at ${config.time}`;
    case 'weekdays':
      return `Weekdays at ${config.time}`;
    case 'every_week':
      return `Every ${config.dayOfWeek} at ${config.time}`;
    case 'every_month':
      return `On the ${toOrdinal(config.dayOfMonth)} of every month at ${config.time}`;
    case 'interval': {
      const unit = config.intervalValue === 1
        ? config.intervalUnit.replace(/s$/, '')
        : config.intervalUnit;
      return `Every ${config.intervalValue} ${unit}`;
    }
    default:
      throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
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
    isUniformMinuteStep(minute) &&
    hour.isWildcard &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const step = minute.explicitStep ?? minute.step ?? 0;
    return `Every ${step} minutes`;
  }
  if (
    minute.isZeroOnly &&
    isUniformHourStep(hour) &&
    dom.isWildcard &&
    month.isWildcard &&
    dow.isWildcard
  ) {
    const step = hour.explicitStep ?? hour.step ?? 0;
    return `Every ${step} hours`;
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
    // A stepped hour claim across days/months is only equivalent when the
    // step is uniform across midnight; otherwise fail closed to verbatim.
    if (!isUniformHourStep(hour)) return trimmed;
    const step = hour.explicitStep ?? hour.step;
    const cadence = `Every ${step} hours`;
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

export function describeInterval(expr: string): string | null {
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
  // Six-field (seconds-included) expressions are never silently reinterpreted
  // as five-field: fail closed to the verbatim expression.
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

function parseStrictInt(token: string): number | null {
  if (!/^\d+$/.test(token)) return null;
  const value = Number.parseInt(token, 10);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/**
 * A minute step is only a uniform interval when it starts at :00 and divides
 * the hour without a remainder across the hour boundary (step 15 divides
 * 60; step 45 leaves a 15-minute gap). Anything else fails closed to verbatim.
 */
function isUniformMinuteStep(field: ParsedField): boolean {
  const step = field.explicitStep ?? field.step;
  if (step === null || step <= 1) return false;
  if (field.values[0] !== 0) return false;
  return 60 % step === 0;
}

/**
 * An hour step is only a uniform interval when it starts at 00:00 and divides
 * the day without a remainder across midnight (step 6 divides 24; step 5
 * leaves a 4-hour gap). Anything else fails closed to verbatim.
 */
function isUniformHourStep(field: ParsedField): boolean {
  const step = field.explicitStep ?? field.step;
  if (step === null || step <= 1) return false;
  if (field.values[0] !== 0) return false;
  return 24 % step === 0;
}

function parseField(field: string, min: number, max: number): ParsedField | null {
  const trimmed = field.trim();
  if (!trimmed) return null;
  let step: number | null = null;
  let base = trimmed;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length !== 2) return null;
    const parsed = parseStrictInt(parts[1] ?? '');
    if (parsed === null || parsed <= 0) return null;
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
    const start = parseStrictInt(base);
    if (start === null || start < min || start > max) return null;
    // A bare start with a step (e.g. `5/15`) expands from the start value;
    // it must never be silently collapsed to a single value.
    if (step === null) return parsedField([start]);
    const values: number[] = [];
    for (let v = start; v <= max; v += step) values.push(v);
    return parsedField(values, { step, explicitStep: step });
  }
  if (base.includes(',') || base.includes('-')) {
    const values = new Set<number>();
    for (const segment of base.split(',')) {
      const piece = segment.trim();
      if (!piece) return null;
      if (piece.includes('-')) {
        const range = piece.split('-');
        if (range.length !== 2) return null;
        const start = parseStrictInt(range[0] ?? '');
        const end = parseStrictInt(range[1] ?? '');
        if (start === null || end === null) return null;
        if (start < min || end > max || start > end) return null;
        for (let v = start; v <= end; v++) values.add(v);
      } else {
        const value = parseStrictInt(piece);
        if (value === null || value < min || value > max) return null;
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
  if (sameValues(dayList, [1, 2, 3, 4, 5])) return 'Weekdays';
  if (sameValues(dayList, [0, 6])) return 'Every weekend';
  if (dayList.length === 1) {
    const only = dayList[0];
    if (only === undefined) return '';
    return `Every ${WEEKDAY_NAMES[only]}`;
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
