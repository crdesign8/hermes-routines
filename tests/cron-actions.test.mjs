import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

// Phase 3: pin exactly 5 cron actions — list, add, remove, pause, resume.
// remove/pause/resume are { action, name: job_id }. No update, no run.
describe('cron-actions', () => {
  it('exports exactly the five action builders', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const fn of ['listJobs', 'addJob', 'removeJob', 'pauseJob', 'resumeJob']) {
      assert.equal(typeof shapes[fn], 'function', `${fn} must be exported`);
    }
  });

  it('remove/pause/resume build { action, name: job_id }', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    assert.deepEqual(shapes.removeJob('j1'), { action: 'remove', name: 'j1' });
    assert.deepEqual(shapes.pauseJob('j1'), { action: 'pause', name: 'j1' });
    assert.deepEqual(shapes.resumeJob('j1'), { action: 'resume', name: 'j1' });
  });

  it('add builds { action: add, name, schedule, payload }', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    assert.deepEqual(shapes.addJob({ job_id: 'j1', schedule: '* * * * *' }), {
      action: 'add',
      name: 'j1',
      schedule: '* * * * *',
      payload: {},
    });
    assert.deepEqual(
      shapes.addJob({ job_id: 'j1', schedule: '0 9 * * MON', payload: { k: 'v' } }),
      { action: 'add', name: 'j1', schedule: '0 9 * * MON', payload: { k: 'v' } },
    );
  });

  it('list builds { action: list, jobs } without mutating input', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const input = [{ name: 'j1' }];
    const listed = shapes.listJobs(input);
    assert.deepEqual(listed, { action: 'list', jobs: [{ name: 'j1' }] });
    assert.deepEqual(input, [{ name: 'j1' }]);
    assert.deepEqual(shapes.listJobs(), { action: 'list', jobs: [] });
  });

  it('rejects empty or non-string job_id', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const bad of ['', 42, null, undefined, {}]) {
      assert.throws(() => shapes.removeJob(bad), TypeError);
      assert.throws(() => shapes.pauseJob(bad), TypeError);
      assert.throws(() => shapes.resumeJob(bad), TypeError);
      assert.throws(() => shapes.addJob({ job_id: bad, schedule: '* * * * *' }), TypeError);
    }
  });

  it('exposes no update and no run actions', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    assert.equal(shapes.updateJob, undefined, 'updateJob must not exist');
    assert.equal(shapes.runJob, undefined, 'runJob must not exist');
    const src = readFileSync(libPath, 'utf8');
    assert.equal(src.includes("action: 'update'"), false, 'no update action shape allowed');
    assert.equal(src.includes("action: 'run'"), false, 'no run action shape allowed');
    assert.equal(src.includes('updateJob'), false, 'no updateJob builder allowed');
    assert.equal(src.includes('runJob'), false, 'no runJob builder allowed');
  });
});
