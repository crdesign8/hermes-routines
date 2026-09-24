// Composer → serializer → humanizer contract matrix for issue #4.
//
// Coverage is relevant-dimensions-per-trigger (exhaustive over every
// dimension the UI can vary for each trigger), NOT a full cartesian
// product. Counts: every_hour 96 slots, every_day 96, weekdays 96,
// every_week 96 slots x 7 days = 672, every_month 96 slots x 31 dom = 2976,
// interval 7 values x 3 units = 21. Total 3957 configs.
//
// The two wording paraphrases allowlisted in the round-trip test are owned
// by open issue #5 (wording unification); the allowlist must fail closed on
// any third divergence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  buildCronExpression,
  describeScheduleConfig,
  validateScheduleConfig,
  generateTimeSlots,
  TIME_SLOTS,
  DAYS_OF_WEEK,
  DAYS_OF_MONTH,
  INTERVAL_VALUES,
  INTERVAL_UNITS,
  TRIGGER_OPTIONS,
  toOrdinal,
  DEFAULT_SCHEDULE_CONFIG,
} from '../src/domain/routineSchedule.ts';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) can be exercised behaviorally under node:test.
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');

const DOW_CRON = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const UNIT_SUFFIX = { minutes: 'm', hours: 'h', days: 'd' };

// Every matrix config: exact cron AND exact composer description.
function buildMatrix() {
  const entries = [];
  const slots = generateTimeSlots();
  for (const slot of slots) {
    const [hour, minute] = slot.split(':');
    const m = String(Number(minute));
    const h = String(Number(hour));
    const base = { ...DEFAULT_SCHEDULE_CONFIG, time: slot };
    entries.push({
      config: { ...base, trigger: 'every_hour' },
      cron: '0 * * * *',
      composer: 'Every hour',
    });
    entries.push({
      config: { ...base, trigger: 'every_day' },
      cron: `${m} ${h} * * *`,
      composer: `Every day at ${slot}`,
    });
    entries.push({
      config: { ...base, trigger: 'weekdays' },
      cron: `${m} ${h} * * 1-5`,
      composer: `Weekdays at ${slot}`,
    });
    for (const day of DAYS_OF_WEEK) {
      entries.push({
        config: { ...base, trigger: 'every_week', dayOfWeek: day },
        cron: `${m} ${h} * * ${DOW_CRON[day]}`,
        composer: `Every ${day} at ${slot}`,
      });
    }
    for (let dom = 1; dom <= 31; dom++) {
      entries.push({
        config: { ...base, trigger: 'every_month', dayOfMonth: dom },
        cron: `${m} ${h} ${dom} * *`,
        composer: `On the ${toOrdinal(dom)} of every month at ${slot}`,
      });
    }
  }
  for (const v of INTERVAL_VALUES) {
    for (const u of INTERVAL_UNITS) {
      entries.push({
        config: { ...DEFAULT_SCHEDULE_CONFIG, trigger: 'interval', intervalValue: v, intervalUnit: u },
        cron: `every ${v}${UNIT_SUFFIX[u]}`,
        composer: `Every ${v} ${u}`,
      });
    }
  }
  return entries;
}

const MATRIX = buildMatrix();

describe('schedule contract (issue #4)', () => {
  it('pins the closed vocabularies the matrix ranges over', () => {
    const slots = generateTimeSlots();
    assert.equal(slots.length, 96, 'expected 96 slots');
    assert.equal(slots[0], '00:00');
    assert.equal(slots[slots.length - 1], '23:45');
    assert.deepEqual(slots, TIME_SLOTS);
    const slotRe = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    for (const slot of slots) {
      assert.match(slot, slotRe, `slot shape: ${slot}`);
      assert.ok(['00', '15', '30', '45'].includes(slot.slice(3)), `15-minute step: ${slot}`);
    }
    assert.deepEqual(DAYS_OF_WEEK, [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    assert.equal(DAYS_OF_MONTH.length, 31);
    assert.deepEqual(
      DAYS_OF_MONTH.map((d) => d.value),
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
    for (const d of DAYS_OF_MONTH) {
      assert.equal(d.label, toOrdinal(d.value), `ordinal label for ${d.value}`);
    }
    assert.deepEqual(INTERVAL_VALUES, [2, 5, 10, 15, 20, 30, 45]);
    assert.deepEqual(INTERVAL_UNITS, ['minutes', 'hours', 'days']);
    assert.deepEqual(
      TRIGGER_OPTIONS.map((o) => o.value),
      ['every_hour', 'every_day', 'weekdays', 'every_week', 'every_month', 'interval'],
    );
  });

  it('builds the exact cron and composer description for every matrix config', () => {
    // Relevant-dimensions-per-trigger: 96 + 96 + 96 + 672 + 2976 + 21.
    assert.equal(MATRIX.length, 96 + 96 + 96 + 672 + 2976 + 21);
    for (const { config, cron, composer } of MATRIX) {
      const ctx = `config=${JSON.stringify(config)}`;
      assert.doesNotThrow(() => validateScheduleConfig(config), `valid matrix config: ${ctx}`);
      assert.equal(buildCronExpression(config), cron, ctx);
      assert.equal(describeScheduleConfig(config), composer, `${ctx} composer=${composer}`);
    }
  });

  it('fails closed on malformed and boundary inputs', () => {
    const badFields = [
      ['time', ['8:00', '0800', '24:00', '08:60', '08:5', '', ' morning', 800, null, undefined]],
      ['trigger', ['daily', 'Every_Day', 42, null, undefined]],
      ['dayOfWeek', ['Funday', 'monday', 1, null, undefined]],
      ['dayOfMonth', [0, 32, -1, 1.5, NaN, Infinity, '5', null, undefined]],
      ['intervalValue', [0, -5, 2.5, NaN, Infinity, '10', null, undefined]],
      ['intervalUnit', ['weeks', 'minute', 'Minutes', 42, null, undefined]],
    ];
    for (const [field, values] of badFields) {
      for (const value of values) {
        const config = { ...DEFAULT_SCHEDULE_CONFIG, [field]: value };
        const ctx = `field=${field} value=${String(value)} config=${JSON.stringify(config)}`;
        assert.throws(() => validateScheduleConfig(config), TypeError, `validate ${ctx}`);
        assert.throws(() => buildCronExpression(config), TypeError, `build ${ctx}`);
        assert.throws(() => describeScheduleConfig(config), TypeError, `describe ${ctx}`);
      }
    }
    const badConfigs = [null, undefined, 'every_day', 42, [], {}, { ...DEFAULT_SCHEDULE_CONFIG, time: undefined }];
    for (const config of badConfigs) {
      const ctx = `config=${JSON.stringify(config)}`;
      assert.throws(() => validateScheduleConfig(config), TypeError, `validate ${ctx}`);
      assert.throws(() => buildCronExpression(config), TypeError, `build ${ctx}`);
      assert.throws(() => describeScheduleConfig(config), TypeError, `describe ${ctx}`);
    }
  });

  it('pins the issue-listed interval regressions and their round-trips', () => {
    const cases = [
      [{ intervalValue: 45, intervalUnit: 'minutes' }, 'every 45m', 'Every 45 minutes'],
      [{ intervalValue: 5, intervalUnit: 'hours' }, 'every 5h', 'Every 5 hours'],
      [{ intervalValue: 10, intervalUnit: 'days' }, 'every 10d', 'Every 10 days'],
    ];
    for (const [override, cron, composer] of cases) {
      const config = { ...DEFAULT_SCHEDULE_CONFIG, trigger: 'interval', ...override };
      const ctx = `config=${JSON.stringify(config)} cron=${cron} composer=${composer}`;
      assert.equal(buildCronExpression(config), cron, ctx);
      assert.equal(describeScheduleConfig(config), composer, ctx);
      assert.equal(routines.describeSchedule(cron), composer, `${ctx} human=${routines.describeSchedule(cron)}`);
    }
  });

  it('reads back persisted schedules through the persistence→readback leg', () => {
    // One sample cron per trigger; humanScheduleOf must agree with
    // describeSchedule and rawScheduleOf must return the raw cron.
    const crons = ['0 * * * *', '15 8 * * *', '30 9 * * 1-5', '45 14 * * 2', '0 8 1 * *', 'every 5m'];
    for (const cron of crons) {
      const human = routines.describeSchedule(cron);
      assert.equal(routines.humanScheduleOf({ schedule: cron }), human, `human readback: cron=${cron}`);
      assert.equal(routines.rawScheduleOf({ schedule: cron }), cron, `raw readback: cron=${cron}`);
    }
  });

  it('round-trips every matrix config: human === composer except two paraphrases', () => {
    // Wording unification is issue #5; this allowlist is exactly these two
    // paraphrase shapes and must fail closed on any third divergence.
    let weekdaysAllow = 0;
    let weekAllow = 0;
    let strict = 0;
    for (const { config, composer } of MATRIX) {
      const cron = buildCronExpression(config);
      const human = routines.describeSchedule(cron);
      const ctx = `config=${JSON.stringify(config)} cron=${cron} composer=${composer} human=${human}`;
      if (composer === human) {
        strict++;
        continue;
      }
      if (config.trigger === 'weekdays' && composer === `Weekdays at ${config.time}` && human === `Every weekday at ${config.time}`) {
        weekdaysAllow++;
        continue;
      }
      if (
        config.trigger === 'every_week' &&
        composer === `Every ${config.dayOfWeek} at ${config.time}` &&
        human === `${config.dayOfWeek}s at ${config.time}`
      ) {
        weekAllow++;
        continue;
      }
      assert.fail(`round-trip divergence outside the two-shape allowlist: ${ctx}`);
    }
    // Instrumented branches: the allowlist cannot silently absorb a new family.
    assert.equal(weekdaysAllow, 96, `weekdays paraphrase branch fired ${weekdaysAllow}x, expected 96`);
    assert.equal(weekAllow, 672, `every_week paraphrase branch fired ${weekAllow}x, expected 672`);
    assert.equal(strict, MATRIX.length - 96 - 672, `strict-equality path took ${strict}x`);
  });

  it('preserves unsupported/raw cron verbatim and humanizes safe shapes exactly', () => {
    // Fail-closed verbatim: trimmed input back, never a guessed humanization.
    // Mirrors the existing pins in tests/routines-view.test.mjs lines 270-310.
    const verbatim = [
      '0 0 9 * * *',
      '30 0 9 * * *',
      '12abc * * * *',
      '*/15x * * * *',
      '1-5abc 9 * * *',
      '0 9 * * 1x',
      '*/45 * * * *',
      '*/5 9-17 * * *',
      '*/15 9-17 * * 1-5',
      '5/15 * * * *',
      '0 */5 1 * *',
      '0 9 * * MON',
      '@daily',
    ];
    for (const expr of verbatim) {
      assert.equal(routines.describeSchedule(expr), expr, `verbatim: ${JSON.stringify(expr)}`);
      assert.equal(routines.describeSchedule(`  ${expr}  `), expr, `trimmed verbatim: ${JSON.stringify(expr)}`);
    }
    // Non-strings and empties never humanize: fail-closed empty string.
    for (const expr of [null, 42, '', '   ']) {
      assert.equal(routines.describeSchedule(expr), '', `empty for ${JSON.stringify(expr)}`);
    }
    // Safe humanizations stay pinned exactly (mirror routines-view.test.mjs,
    // remainder observed against desktop/plugin.js and confirmed fail-closed).
    const humanized = [
      ['*/15 * * * *', 'Every 15 minutes'],
      ['*/20 * * * *', 'Every 20 minutes'],
      ['0 */2 * * *', 'Every 2 hours'],
      ['0 */6 * * *', 'Every 6 hours'],
      ['0 9 * * 1-5', 'Every weekday at 09:00'],
      ['0 7 * * 2', 'Tuesdays at 07:00'],
      ['0 0 1 * *', 'On the 1st of every month at 00:00'],
      ['0 12 1 * *', 'On the 1st of every month at 12:00'],
      ['0 8 1 * *', 'On the 1st of every month at 08:00'],
    ];
    for (const [expr, expected] of humanized) {
      assert.equal(routines.describeSchedule(expr), expected, `humanized: ${JSON.stringify(expr)}`);
    }
  });
});
