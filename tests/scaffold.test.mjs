import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
}

describe('scaffold', () => {
  it('package.json is ESM private with node>=24 and zero deps', () => {
    const pkg = readJson('package.json');
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.private, true);
    assert.ok(pkg.engines && typeof pkg.engines.node === 'string', 'engines.node required');
    assert.match(pkg.engines.node, /24/, 'engines.node must require node>=24');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const v = pkg[field];
      assert.ok(v === undefined || Object.keys(v).length === 0, `${field} must be absent or empty`);
    }
  });

  it('routines.js is a standalone descriptor with stable id and no hello runtime', () => {
    const p = path.join(root, 'desktop', 'routines.js');
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, 'utf8');
    assert.match(src, /hermes-routines/, 'stable id hermes-routines required');
    assert.equal(src.includes('hello-' + 'runtime'), false, 'must not contain forbidden marker');
    assert.match(src, /\bjsx\s*\(/, 'must render via jsx() without JSX syntax');
    assert.equal(/<[A-Za-z][\w-]*(\s|>|\/)/.test(src), false, 'must not contain JSX syntax');
  });

  it('cron-shapes builders pin {action,name:job_id} for remove/pause/resume', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const fn of ['listJobs', 'addJob', 'removeJob', 'pauseJob', 'resumeJob']) {
      assert.equal(typeof shapes[fn], 'function', `${fn} must be exported`);
    }
    assert.deepEqual(shapes.removeJob('j1'), { action: 'remove', name: 'j1' });
    assert.deepEqual(shapes.pauseJob('j1'), { action: 'pause', name: 'j1' });
    assert.deepEqual(shapes.resumeJob('j1'), { action: 'resume', name: 'j1' });
    const listed = shapes.listJobs([{ name: 'j1' }]);
    assert.equal(listed.action, 'list');
    const added = shapes.addJob({ job_id: 'j1', schedule: '* * * * *' });
    assert.equal(added.action, 'add');
    assert.equal(added.name, 'j1');
  });

  it('cron-shapes source has zero bare imports', () => {
    const src = readFileSync(path.join(root, 'desktop', 'lib', 'cron-shapes.mjs'), 'utf8');
    const patterns = [
      /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
      /export\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    const bare = [];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')) {
          bare.push(spec);
        }
      }
    }
    assert.deepEqual(bare, []);
  });
});
