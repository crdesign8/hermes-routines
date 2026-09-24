// Schedule builder & humanizer for high-abstraction routine creation.
// Pure domain: zero external dependencies, fail-closed validation.

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
