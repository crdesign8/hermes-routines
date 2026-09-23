import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Phase 3: schedule is opaque pass-through. The desktop never parses or
// normalizes the schedule string; validation lives in the backend
// parse_schedule. addJob must carry the exact input string to `schedule`.
describe('schedule', () => {
  it('passes schedule strings through verbatim', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const schedules = [
      '* * * * *',
      '0 9 * * MON',
      '*/15 9-17 * * 1-5',
      '0 0 1 * *',
      '@daily',
      '2026-09-24T09:00:00-03:00',
      '  * * * * *  ',
    ];
    for (const schedule of schedules) {
      const added = shapes.addJob({ job_id: 'j1', schedule });
      assert.equal(added.schedule, schedule, `schedule must pass through verbatim: ${schedule}`);
      assert.equal(added.action, 'add');
      assert.equal(added.name, 'j1');
    }
  });

  it('keeps schedule and payload independent', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const payload = { channel: 'ops', text: 'ping' };
    const added = shapes.addJob({ job_id: 'j1', schedule: '0 9 * * *', payload });
    assert.equal(added.schedule, '0 9 * * *');
    assert.deepEqual(added.payload, payload);
  });

  it('rejects empty or non-string schedule', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const bad of ['', 42, null, undefined, {}, []]) {
      assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: bad }), TypeError);
    }
    assert.throws(() => shapes.addJob({ job_id: 'j1' }), TypeError);
  });
});
