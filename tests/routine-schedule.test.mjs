import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCronExpression,
  describeScheduleConfig,
  generateTimeSlots,
  toOrdinal,
  validateScheduleConfig,
  TRIGGER_OPTIONS,
  DAYS_OF_WEEK,
  DAYS_OF_MONTH,
  INTERVAL_VALUES,
  INTERVAL_UNITS,
} from '../src/domain/routineSchedule.ts';

describe('routineSchedule', () => {
  it('generates 96 15-minute time slots covering 00:00 to 23:45', () => {
    const slots = generateTimeSlots();
    assert.equal(slots.length, 96);
    assert.equal(slots[0], '00:00');
    assert.equal(slots[1], '00:15');
    assert.equal(slots[95], '23:45');
  });

  it('formats ordinals accurately', () => {
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
  });

  it('builds cron expressions and descriptions for each trigger mode', () => {
    // Every Hour
    const hourConf = {
      trigger: 'every_hour',
      time: '08:00',
      dayOfWeek: 'Monday',
      dayOfMonth: 1,
      intervalValue: 5,
      intervalUnit: 'minutes',
    };
    assert.equal(buildCronExpression(hourConf), '0 * * * *');
    assert.equal(describeScheduleConfig(hourConf), 'Every hour');

    // Every Day
    const dayConf = { ...hourConf, trigger: 'every_day', time: '08:15' };
    assert.equal(buildCronExpression(dayConf), '15 8 * * *');
    assert.equal(describeScheduleConfig(dayConf), 'Every day at 08:15');

    // Weekdays
    const weekdaysConf = { ...hourConf, trigger: 'weekdays', time: '09:30' };
    assert.equal(buildCronExpression(weekdaysConf), '30 9 * * 1-5');
    assert.equal(describeScheduleConfig(weekdaysConf), 'Weekdays at 09:30');

    // Every week
    const weekConf = { ...hourConf, trigger: 'every_week', dayOfWeek: 'Tuesday', time: '14:45' };
    assert.equal(buildCronExpression(weekConf), '45 14 * * 2');
    assert.equal(describeScheduleConfig(weekConf), 'Every Tuesday at 14:45');

    // Every week Sunday
    const sunConf = { ...hourConf, trigger: 'every_week', dayOfWeek: 'Sunday', time: '00:00' };
    assert.equal(buildCronExpression(sunConf), '0 0 * * 0');
    assert.equal(describeScheduleConfig(sunConf), 'Every Sunday at 00:00');

    // Every month
    const monthConf = { ...hourConf, trigger: 'every_month', dayOfMonth: 1, time: '08:00' };
    assert.equal(buildCronExpression(monthConf), '0 8 1 * *');
    assert.equal(describeScheduleConfig(monthConf), 'On the 1st of every month at 08:00');

    // Interval minutes (issue #1: Hermes-native interval, not cron steps)
    const minConf = { ...hourConf, trigger: 'interval', intervalValue: 5, intervalUnit: 'minutes' };
    assert.equal(buildCronExpression(minConf), 'every 5m');
    assert.equal(describeScheduleConfig(minConf), 'Every 5 minutes');

    // Interval hours
    const hrConf = { ...hourConf, trigger: 'interval', intervalValue: 2, intervalUnit: 'hours' };
    assert.equal(buildCronExpression(hrConf), 'every 2h');
    assert.equal(describeScheduleConfig(hrConf), 'Every 2 hours');

    // Interval days
    const daysConf = { ...hourConf, trigger: 'interval', intervalValue: 10, intervalUnit: 'days' };
    assert.equal(buildCronExpression(daysConf), 'every 10d');
    assert.equal(describeScheduleConfig(daysConf), 'Every 10 days');
  });

  it('serializes issue #1 regression intervals as native syntax', () => {
    const base = {
      trigger: 'interval',
      time: '08:00',
      dayOfWeek: 'Monday',
      dayOfMonth: 1,
      intervalValue: 5,
      intervalUnit: 'minutes',
    };
    assert.equal(
      buildCronExpression({ ...base, intervalValue: 45, intervalUnit: 'minutes' }),
      'every 45m',
    );
    assert.equal(
      buildCronExpression({ ...base, intervalValue: 5, intervalUnit: 'hours' }),
      'every 5h',
    );
    assert.equal(
      buildCronExpression({ ...base, intervalValue: 10, intervalUnit: 'days' }),
      'every 10d',
    );
  });
});

// Issue #2: validation is fail-closed — invalid values are rejected
// explicitly instead of being clamped, defaulted or coerced into a
// different schedule (no NaN, Infinity, implicit Monday, implicit 00:00).
describe('routineSchedule fail-closed validation', () => {
  const valid = {
    trigger: 'every_day',
    time: '08:00',
    dayOfWeek: 'Monday',
    dayOfMonth: 1,
    intervalValue: 5,
    intervalUnit: 'minutes',
  };

  /** Every override must be rejected by both serializers and by the
   * exported validator, with a domain TypeError. */
  function assertRejected(label, patch, messageRe) {
    const config = { ...valid, ...patch };
    for (const [name, fn] of [
      ['validateScheduleConfig', () => validateScheduleConfig(config)],
      ['buildCronExpression', () => buildCronExpression(config)],
      ['describeScheduleConfig', () => describeScheduleConfig(config)],
    ]) {
      assert.throws(() => fn(), TypeError, `${label}: ${name} must throw TypeError`);
      assert.throws(() => fn(), messageRe, `${label}: ${name} message must match ${messageRe}`);
    }
  }

  it('rejects malformed or non-HH:mm time values (no clamp, no 00:00 fallback)', () => {
    assertRejected('unpadded hour', { time: '8:00' }, /HH:mm/);
    assertRejected('missing separator', { time: '0800' }, /HH:mm/);
    assertRejected('hour 24', { time: '24:00' }, /HH:mm/);
    assertRejected('minute 60', { time: '08:60' }, /HH:mm/);
    assertRejected('unpadded minute', { time: '08:5' }, /HH:mm/);
    assertRejected('empty', { time: '' }, /HH:mm/);
    assertRejected('whitespace padded', { time: ' 08:00 ' }, /HH:mm/);
    assertRejected('text', { time: 'morning' }, /HH:mm/);
    assertRejected('non-string', { time: 800 }, /HH:mm/);
    assertRejected('null', { time: null }, /HH:mm/);
  });

  it('rejects unknown trigger values (no daily fallback)', () => {
    assertRejected('unknown string', { trigger: 'daily' }, /unknown trigger/);
    assertRejected('case drift', { trigger: 'Every_Day' }, /unknown trigger/);
    assertRejected('non-string', { trigger: 42 }, /unknown trigger/);
    assertRejected('null', { trigger: null }, /unknown trigger/);
  });

  it('rejects unknown weekday values (no implicit Monday)', () => {
    assertRejected('invented day', { dayOfWeek: 'Funday' }, /unknown dayOfWeek/);
    assertRejected('case drift', { dayOfWeek: 'monday' }, /unknown dayOfWeek/);
    assertRejected('numeric index', { dayOfWeek: 1 }, /unknown dayOfWeek/);
    assertRejected('null', { dayOfWeek: null }, /unknown dayOfWeek/);
  });

  it('rejects invalid day-of-month values (no clamping to 1..31)', () => {
    assertRejected('zero', { dayOfMonth: 0 }, /dayOfMonth/);
    assertRejected('too large', { dayOfMonth: 32 }, /dayOfMonth/);
    assertRejected('negative', { dayOfMonth: -1 }, /dayOfMonth/);
    assertRejected('fractional', { dayOfMonth: 1.5 }, /dayOfMonth/);
    assertRejected('NaN', { dayOfMonth: Number.NaN }, /dayOfMonth/);
    assertRejected('Infinity', { dayOfMonth: Number.POSITIVE_INFINITY }, /dayOfMonth/);
    assertRejected('numeric string', { dayOfMonth: '5' }, /dayOfMonth/);
    assertRejected('null', { dayOfMonth: null }, /dayOfMonth/);
  });

  it('rejects interval values that are not finite positive integers', () => {
    assertRejected('zero', { intervalValue: 0 }, /intervalValue/);
    assertRejected('negative', { intervalValue: -5 }, /intervalValue/);
    assertRejected('fractional', { intervalValue: 2.5 }, /intervalValue/);
    assertRejected('NaN', { intervalValue: Number.NaN }, /intervalValue/);
    assertRejected('Infinity', { intervalValue: Number.POSITIVE_INFINITY }, /intervalValue/);
    assertRejected('-Infinity', { intervalValue: Number.NEGATIVE_INFINITY }, /intervalValue/);
    assertRejected('numeric string', { intervalValue: '10' }, /intervalValue/);
    assertRejected('null', { intervalValue: null }, /intervalValue/);
  });

  it('rejects unknown interval units (no fall-through to days)', () => {
    assertRejected('plural mismatch', { intervalUnit: 'weeks' }, /unknown intervalUnit/);
    assertRejected('singular', { intervalUnit: 'minute' }, /unknown intervalUnit/);
    assertRejected('case drift', { intervalUnit: 'Minutes' }, /unknown intervalUnit/);
    assertRejected('null', { intervalUnit: null }, /unknown intervalUnit/);
  });

  it('rejects non-object and missing-field configs', () => {
    for (const bad of [null, undefined, 'every_day', 42, [], () => {}, Symbol('x')]) {
      assert.throws(() => validateScheduleConfig(bad), TypeError, `config ${String(bad)}`);
      assert.throws(() => buildCronExpression(bad), TypeError);
      assert.throws(() => describeScheduleConfig(bad), TypeError);
    }
    // empty object and undefined fields are invalid, not defaulted
    for (const bad of [{}, { ...valid, time: undefined }, { ...valid, trigger: undefined }]) {
      assert.throws(() => validateScheduleConfig(bad), TypeError, JSON.stringify(bad));
      assert.throws(() => buildCronExpression(bad), TypeError);
      assert.throws(() => describeScheduleConfig(bad), TypeError);
    }
    // error rendering must not itself throw on exotic values
    const circular = {};
    circular.self = circular;
    assert.throws(
      () => validateScheduleConfig({ ...valid, trigger: Object.create(null) }),
      /unknown trigger value/,
    );
    assert.throws(
      () => validateScheduleConfig({ ...valid, dayOfMonth: circular }),
      /dayOfMonth/,
    );
  });

  it('valid UI-generated configs still serialize exactly as before', () => {
    assert.equal(validateScheduleConfig(valid), undefined);
    assert.equal(buildCronExpression(valid), '0 8 * * *');
    assert.equal(describeScheduleConfig(valid), 'Every day at 08:00');

    // Every value the closed selects can produce stays accepted.
    for (const time of generateTimeSlots()) {
      assert.match(buildCronExpression({ ...valid, time }), /^\d{1,2} \d{1,2} \* \* \*$/);
    }
    for (const dayOfWeek of DAYS_OF_WEEK) {
      assert.match(
        buildCronExpression({ ...valid, trigger: 'every_week', dayOfWeek }),
        /^\d{1,2} \d{1,2} \* \* \d$/,
      );
    }
    for (const { value } of DAYS_OF_MONTH) {
      assert.equal(
        buildCronExpression({ ...valid, trigger: 'every_month', dayOfMonth: value }),
        `0 8 ${value} * *`,
      );
    }
    for (const intervalValue of INTERVAL_VALUES) {
      for (const intervalUnit of INTERVAL_UNITS) {
        const suffix = { minutes: 'm', hours: 'h', days: 'd' }[intervalUnit];
        assert.equal(
          buildCronExpression({ ...valid, trigger: 'interval', intervalValue, intervalUnit }),
          `every ${intervalValue}${suffix}`,
        );
      }
    }
    for (const trigger of TRIGGER_OPTIONS.map((o) => o.value)) {
      assert.equal(typeof describeScheduleConfig({ ...valid, trigger }), 'string');
    }
  });

  it('serialized output never carries NaN, Infinity or undefined', () => {
    const outputs = [
      buildCronExpression(valid),
      describeScheduleConfig(valid),
      buildCronExpression({ ...valid, trigger: 'interval', intervalValue: 45, intervalUnit: 'minutes' }),
      describeScheduleConfig({ ...valid, trigger: 'every_month', dayOfMonth: 31 }),
    ];
    for (const out of outputs) {
      assert.doesNotMatch(out, /NaN|Infinity|undefined|null/);
    }
  });
});
