import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCronExpression,
  describeScheduleConfig,
  generateTimeSlots,
  toOrdinal,
  TRIGGER_OPTIONS,
  DAYS_OF_WEEK,
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
