import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shapesPath = path.join(root, 'src', 'domain', 'cronShapes.ts');

// Schedule is opaque pass-through: the desktop never parses cron semantics;
// validation lives in the backend parse_schedule. The desktop only trims
// border whitespace and enforces length/printability at the edge so
// malformed input fails fast. addJob carries the *trimmed* string.
describe('schedule', () => {
  it('passes schedule strings through (trimming border whitespace)', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const schedules = [
      '* * * * *',
      '0 9 * * MON',
      '*/15 9-17 * * 1-5',
      '0 0 1 * *',
      '@daily',
      '2026-09-24T09:00:00-03:00',
    ];
    for (const schedule of schedules) {
      const added = shapes.addJob({ job_id: 'j1', schedule });
      assert.equal(added.schedule, schedule, `schedule must pass through: ${schedule}`);
      assert.equal(added.action, 'add');
      assert.equal(added.name, 'j1');
    }
    const padded = shapes.addJob({ job_id: 'j1', schedule: '  * * * * *  ' });
    assert.equal(padded.schedule, '* * * * *', 'border whitespace is trimmed');
  });

  it('keeps schedule and payload independent (deep clone)', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const payload = { channel: 'ops', text: 'ping' };
    const added = shapes.addJob({ job_id: 'j1', schedule: '0 9 * * *', payload });
    assert.equal(added.schedule, '0 9 * * *');
    assert.deepEqual(added.payload, payload);
    payload.text = 'mutated';
    assert.equal(added.payload.text, 'ping', 'payload must be cloned, not aliased');
  });

  it('rejects empty, whitespace-only, non-string, overlong or control-char schedule', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    for (const bad of ['', '   ', 42, null, undefined, {}, []]) {
      assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: bad }), TypeError);
    }
    assert.throws(() => shapes.addJob({ job_id: 'j1' }), TypeError);
    assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: 'x'.repeat(257) }), TypeError);
    assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: '* * \n*' }), TypeError);
  });

  it('source pins: schedule edge limits (MAX_* constants live in cronShapes.ts)', () => {
    const src = readFileSync(shapesPath, 'utf8');
    assert.match(src, /MAX_SCHEDULE_LENGTH = 256/, 'schedule length limit must be pinned');
    assert.match(src, /control/i, 'control-char rejection must be documented in source');
  });
});
