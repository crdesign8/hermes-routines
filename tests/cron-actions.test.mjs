import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shapesPath = path.join(root, 'src', 'domain', 'cronShapes.ts');

// Contract of the five cron.manage actions. Single source of truth:
// src/domain/cronShapes.ts (ported 1:1 from the former lib/cron-shapes.mjs,
// bundled into desktop/plugin.js by scripts/build.mjs).
describe('cron-actions (single source: src/domain/cronShapes.ts)', () => {
  it('addJob builds {action:add,name,schedule,payload} with edge validation', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const added = shapes.addJob({ job_id: 'wake', schedule: '  0 9 * * *  ' });
    assert.deepEqual(added, {
      action: 'add',
      name: 'wake',
      schedule: '0 9 * * *',
      payload: {},
    });
    assert.throws(() => shapes.addJob({ job_id: '', schedule: '* * * * *' }), /job_id must be a non-empty string/);
    assert.throws(() => shapes.addJob({ job_id: 'bad id!', schedule: '* * * * *' }), /job_id must match/);
    assert.throws(() => shapes.addJob({ job_id: 'wake' }), /schedule must be a non-empty string/);
    assert.throws(() => shapes.addJob({ job_id: 'wake', schedule: 'x'.repeat(300) }), /at most 256/);
    assert.throws(() => shapes.addJob({ job_id: 'wake', schedule: '* * \n*' }), /control characters/);
    assert.throws(() => shapes.addJob({ job_id: 'wake', schedule: '* * * * *', payload: 'str' }), /plain object/);
    assert.throws(() => shapes.addJob({ job_id: 'wake', schedule: '* * * * *', payload: [] }), /plain object/);
  });

  it('removeJob/pauseJob/resumeJob share the single-id contract', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    assert.deepEqual(shapes.removeJob('j1'), { action: 'remove', name: 'j1' });
    assert.deepEqual(shapes.pauseJob('j1'), { action: 'pause', name: 'j1' });
    assert.deepEqual(shapes.resumeJob('j1'), { action: 'resume', name: 'j1' });
    for (const fn of ['removeJob', 'pauseJob', 'resumeJob']) {
      for (const bad of ['', '   ', 42, null, undefined, 'bad id!', 'x'.repeat(200)]) {
        assert.throws(() => shapes[fn](bad), TypeError, `${fn} must reject ${String(bad)}`);
      }
    }
  });

  it('listJobs clones rows (queued shapes are never aliased)', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const jobs = [{ name: 'j1' }];
    const listed = shapes.listJobs(jobs);
    assert.deepEqual(listed, { action: 'list', jobs: [{ name: 'j1' }] });
    listed.jobs[0].name = 'mutated';
    assert.equal(jobs[0].name, 'j1', 'listJobs must clone rows');
    assert.deepEqual(shapes.listJobs('nope'), { action: 'list', jobs: [] }, 'non-array input lists nothing');
    assert.deepEqual(shapes.listJobs(), { action: 'list', jobs: [] });
  });

  it('addJob payload is deep-cloned; uncloneable values surface as TypeError', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const payload = { nested: { text: 'ping' } };
    const added = shapes.addJob({ job_id: 'j1', schedule: '* * * * *', payload });
    payload.nested.text = 'mutated';
    assert.equal(added.payload.nested.text, 'ping', 'payload must be cloned, not aliased');
    assert.throws(
      () => shapes.addJob({ job_id: 'j1', schedule: '* * * * *', payload: { fn() {} } }),
      /uncloneable value/,
    );
  });

  it('source pins: five actions, no update/run fiction', () => {
    const src = readFileSync(shapesPath, 'utf8');
    const actions = src.match(/action:\s*['"][a-z_]+['"]/g) || [];
    const unique = new Set(actions);
    assert.equal(
      unique.size,
      5,
      `expected exactly five distinct cron.manage actions, got ${unique.size}: ${[...unique].join(', ')}`,
    );
    for (const known of ["action: 'list'", "action: 'add'", "action: 'remove'", "action: 'pause'", "action: 'resume'"]) {
      assert.ok(unique.has(known), `missing ${known}`);
    }
    for (const forbidden of ["action: 'update'", "action: 'run'", 'updateJob', 'runJob']) {
      assert.ok(!src.includes(forbidden), `${forbidden} must not appear (cron.manage has no update/run)`);
    }
  });
});
