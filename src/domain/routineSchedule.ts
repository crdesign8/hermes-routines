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

function parseTime(time: string): { minute: number; hour: number } {
  const parts = time.split(':');
  const hour = Math.max(0, Math.min(23, parseInt(parts[0] || '0', 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(parts[1] || '0', 10) || 0));
  return { minute, hour };
}

/** Translate high abstraction config to standard 5-part cron string. */
export function buildCronExpression(config: ScheduleConfig): string {
  const { minute, hour } = parseTime(config.time);

  switch (config.trigger) {
    case 'every_hour':
      return '0 * * * *';
    case 'every_day':
      return `${minute} ${hour} * * *`;
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`;
    case 'every_week': {
      const dow = DAY_OF_WEEK_TO_CRON[config.dayOfWeek] ?? 1;
      return `${minute} ${hour} * * ${dow}`;
    }
    case 'every_month': {
      const dom = Math.max(1, Math.min(31, Math.floor(config.dayOfMonth)));
      return `${minute} ${hour} ${dom} * *`;
    }
    case 'interval': {
      const val = Math.max(1, Math.floor(config.intervalValue));
      if (config.intervalUnit === 'minutes') {
        return `*/${val} * * * *`;
      }
      if (config.intervalUnit === 'hours') {
        return `0 */${val} * * *`;
      }
      return `0 0 */${val} * *`;
    }
    default:
      return `${minute} ${hour} * * *`;
  }
}

/** Generate natural language subtitle matching the UI mockups. */
export function describeScheduleConfig(config: ScheduleConfig): string {
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
      return `Every day at ${config.time}`;
  }
}
