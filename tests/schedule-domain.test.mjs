// Canonical schedule-domain contract tests (issue #5, phase-1).
//
// Pins src/domain/schedule.ts directly: composer outputs per trigger,
// interval native-syntax truth (no cron-step normalization), verbatim
// fallback for unsupported/6-field shapes, ordinal teens guard, and
// composer weekday/dow wording. No caller behavior changes here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCronExpression,
  describeSchedule,
  describeInterval,
  describeScheduleConfig,
  validateScheduleConfig,
  toOrdinal,
  generateTimeSlots,
  TIME_SLOTS,
  DAYS_OF_WEEK,
  INTERVAL_VALUES,
  INTERVAL_UNITS,
  TRIGGER_OPTIONS,
  DEFAULT_SCHEDULE_CONFIG,
} from '../src/domain/schedule.ts';

const base = (overrides = {}) => ({ ...DEFAULT_SCHEDULE_CONFIG, ...overrides });

describe('schedule domain: composer contract', () => {
  it('every_hour serializes to top-of-hour cron', () => {
    const config = base({ trigger: 'every_hour', time: '08:30' });
    assert.equal(buildCronExpression(config), '0 * * * *');
    assert.equal(describeScheduleConfig(config), 'Every hour');
  });

  it('every_day serializes M H and describes with HH:mm', () => {
    const config = base({ trigger: 'every_day', time: '08:30' });
    assert.equal(buildCronExpression(config), '30 8 * * *');
    assert.equal(describeScheduleConfig(config), 'Every day at 08:30');
  });

  it('weekdays uses composer wording "Weekdays at"', () => {
    const config = base({ trigger: 'weekdays', time: '09:15' });
    assert.equal(buildCronExpression(config), '15 9 * * 1-5');
    assert.equal(describeScheduleConfig(config), 'Weekdays at 09:15');
  });

  it('every_week maps Sunday=0 and uses "Every {Day} at" wording', () => {
    const sunday = base({ trigger: 'every_week', time: '08:00', dayOfWeek: 'Sunday' });
    assert.equal(buildCronExpression(sunday), '0 8 * * 0');
    assert.equal(describeScheduleConfig(sunday), 'Every Sunday at 08:00');
    const monday = base({ trigger: 'every_week', time: '18:45', dayOfWeek: 'Monday' });
    assert.equal(buildCronExpression(monday), '45 18 * * 1');
    assert.equal(describeScheduleConfig(monday), 'Every Monday at 18:45');
  });

  it('every_month serializes dom with ordinal wording', () => {
    const config = base({ trigger: 'every_month', time: '08:00', dayOfMonth: 1 });
    assert.equal(buildCronExpression(config), '0 8 1 * *');
    assert.equal(
      describeScheduleConfig(config),
      'On the 1st of every month at 08:00',
    );
  });

  it('interval keeps Hermes-native syntax (no cron-step normalization)', () => {
    assert.equal(
      buildCronExpression(base({ trigger: 'interval', intervalValue: 5, intervalUnit: 'minutes' })),
      'every 5m',
    );
    assert.equal(
      buildCronExpression(base({ trigger: 'interval', intervalValue: 2, intervalUnit: 'hours' })),
      'every 2h',
    );
    assert.equal(
      buildCronExpression(base({ trigger: 'interval', intervalValue: 3, intervalUnit: 'days' })),
      'every 3d',
    );
    assert.equal(
      describeScheduleConfig(base({ trigger: 'interval', intervalValue: 5, intervalUnit: 'minutes' })),
      'Every 5 minutes',
    );
    assert.equal(
      describeScheduleConfig(base({ trigger: 'interval', intervalValue: 1, intervalUnit: 'minutes' })),
      'Every 1 minute',
    );
  });
});

describe('schedule domain: humanizer contract', () => {
  it('Hermes-native intervals stay truth, tolerant aliases included', () => {
    assert.equal(describeSchedule('every 5m'), 'Every 5 minutes');
    assert.equal(describeSchedule('every 2h'), 'Every 2 hours');
    assert.equal(describeSchedule('every 1d'), 'Every day');
    assert.equal(describeSchedule('every 24h'), 'Every day');
    assert.equal(describeSchedule('2 days'), 'Every 2 days');
    assert.equal(describeInterval('every 5m'), 'Every 5 minutes');
    assert.equal(describeInterval('5 mins'), 'Every 5 minutes');
    assert.equal(describeInterval('*/5 * * * *'), null);
  });

  it('cron shapes describe as cron', () => {
    assert.equal(describeSchedule('0 * * * *'), 'Every hour');
    assert.equal(describeSchedule('30 8 * * *'), 'Every day at 08:30');
    assert.equal(describeSchedule('30 8 * * 1-5'), 'Weekdays at 08:30');
    assert.equal(describeSchedule('30 8 * * 1'), 'Every Monday at 08:30');
    assert.equal(describeSchedule('30 8 15 * *'), 'On the 15th of every month at 08:30');
  });

  it('fails closed to verbatim on unsupported, 6-field, and non-uniform steps', () => {
    assert.equal(describeSchedule('0 30 8 * * *'), '0 30 8 * * *');
    assert.equal(describeSchedule('*/7 * * * *'), '*/7 * * * *');
    assert.equal(describeSchedule('not a schedule'), 'not a schedule');
  });

  it('returns empty string for empty and non-string input', () => {
    assert.equal(describeSchedule(''), '');
    assert.equal(describeSchedule('   '), '');
    assert.equal(describeSchedule(null), '');
    assert.equal(describeSchedule(42), '');
  });
});

describe('schedule domain: ordinals and vocabularies', () => {
  it('toOrdinal guards teens 11-13', () => {
    assert.equal(toOrdinal(1), '1st');
    assert.equal(toOrdinal(2), '2nd');
    assert.equal(toOrdinal(3), '3rd');
    assert.equal(toOrdinal(4), '4th');
    assert.equal(toOrdinal(11), '11th');
    assert.equal(toOrdinal(12), '12th');
    assert.equal(toOrdinal(13), '13th');
    assert.equal(toOrdinal(21), '21st');
    assert.equal(toOrdinal(22), '22nd');
    assert.equal(toOrdinal(23), '23rd');
    assert.equal(toOrdinal(31), '31st');
    assert.equal(toOrdinal(111), '111th');
    assert.equal(toOrdinal(121), '121st');
  });

  it('pins the closed vocabularies', () => {
    assert.equal(TRIGGER_OPTIONS.length, 6);
    assert.deepEqual(DAYS_OF_WEEK, [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    assert.deepEqual(INTERVAL_VALUES, [2, 5, 10, 15, 20, 30, 45]);
    assert.deepEqual(INTERVAL_UNITS, ['minutes', 'hours', 'days']);
    const slots = generateTimeSlots();
    assert.equal(slots.length, 96);
    assert.deepEqual(slots, TIME_SLOTS);
  });

  it('validation stays fail-closed', () => {
    assert.throws(() => validateScheduleConfig({ ...base(), trigger: 'hourly' }), TypeError);
    assert.throws(() => validateScheduleConfig({ ...base(), time: '8:00' }), TypeError);
    assert.throws(() => validateScheduleConfig({ ...base(), dayOfMonth: 0 }), TypeError);
    assert.throws(() => validateScheduleConfig({ ...base(), intervalValue: 0 }), TypeError);
    assert.throws(() => buildCronExpression({ ...base(), trigger: 'hourly' }), TypeError);
  });
});

describe('schedule domain: routineSchedule delegation parity (issue #5, phase-2)', () => {
  it('legacy shim re-exports canonical outputs with zero change', async () => {
    const canonical = await import('../src/domain/schedule.ts');
    const legacy = await import('../src/domain/routineSchedule.ts');
    assert.deepEqual(legacy.TRIGGER_OPTIONS, canonical.TRIGGER_OPTIONS);
    assert.deepEqual(legacy.DAYS_OF_WEEK, canonical.DAYS_OF_WEEK);
    assert.deepEqual(legacy.INTERVAL_VALUES, canonical.INTERVAL_VALUES);
    assert.deepEqual(legacy.INTERVAL_UNITS, canonical.INTERVAL_UNITS);
    assert.deepEqual(legacy.TIME_SLOTS, canonical.TIME_SLOTS);
    assert.deepEqual(legacy.DAYS_OF_MONTH, canonical.DAYS_OF_MONTH);
    assert.deepEqual(legacy.DEFAULT_SCHEDULE_CONFIG, canonical.DEFAULT_SCHEDULE_CONFIG);
    assert.deepEqual(legacy.generateTimeSlots(), canonical.generateTimeSlots());
    for (const n of [1, 2, 3, 11, 12, 13, 21, 31]) {
      assert.equal(legacy.toOrdinal(n), canonical.toOrdinal(n));
    }
    const configs = [
      base({ trigger: 'every_hour', time: '08:30' }),
      base({ trigger: 'every_day', time: '08:30' }),
      base({ trigger: 'weekdays', time: '09:15' }),
      base({ trigger: 'every_week', time: '18:45', dayOfWeek: 'Monday' }),
      base({ trigger: 'every_week', time: '08:00', dayOfWeek: 'Sunday' }),
      base({ trigger: 'every_month', time: '08:00', dayOfMonth: 15 }),
      base({ trigger: 'interval', intervalValue: 5, intervalUnit: 'minutes' }),
      base({ trigger: 'interval', intervalValue: 2, intervalUnit: 'hours' }),
      base({ trigger: 'interval', intervalValue: 3, intervalUnit: 'days' }),
    ];
    for (const config of configs) {
      assert.equal(
        legacy.buildCronExpression({ ...config }),
        canonical.buildCronExpression({ ...config }),
      );
      assert.equal(
        legacy.describeScheduleConfig({ ...config }),
        canonical.describeScheduleConfig({ ...config }),
      );
    }
    assert.throws(
      () => legacy.validateScheduleConfig({ ...base(), trigger: 'hourly' }),
      TypeError,
    );
  });
});
