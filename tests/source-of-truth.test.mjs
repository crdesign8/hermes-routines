import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

// Replaces copy-identity: there is no mirrored copy anymore. src/ is the
// single editable source, desktop/plugin.js is the generated artifact, and
// the old sync machinery (desktop/lib, sync-shapes, @begin-sync markers)
// must be gone for good.
describe('source-of-truth', () => {
  it('desktop/ holds only the generated artifact', () => {
    assert.deepEqual(readdirSync(path.join(root, 'desktop')), ['plugin.js']);
    assert.equal(existsSync(path.join(root, 'desktop', 'lib')), false, 'no mirrored lib copy');
  });

  it('sync machinery is gone (scripts, jsconfig, markers)', () => {
    assert.equal(existsSync(path.join(root, 'scripts', 'sync-shapes.mjs')), false, 'sync-shapes removed');
    assert.equal(existsSync(path.join(root, 'scripts', 'check-types.mjs')), false, 'check-types removed');
    assert.equal(existsSync(path.join(root, 'jsconfig.json')), false, 'jsconfig removed');
    const src = readSrcTree();
    const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    for (const [label, text] of [['src/', src], ['desktop/plugin.js', artifact]]) {
      assert.equal(text.includes('@begin-sync'), false, `${label} must not carry sync markers`);
      assert.equal(text.includes('@end-sync'), false, `${label} must not carry sync markers`);
      assert.equal(text.includes('cron-shapes.mjs'), false, `${label} must not reference the removed mirror`);
    }
  });

  it('artifact header declares it generated and not editable', () => {
    const head = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8').slice(0, 600);
    assert.match(head, /AUTO-GENERATED/, 'generated banner required');
    assert.match(head, /DO NOT EDIT/i, 'do-not-edit banner required');
    assert.match(head, /npm run build|scripts\/build\.mjs/, 'banner must point at the producing build');
  });

  it('freshness gate binds the artifact to src/', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.match(pkg.scripts['check-generated'], /build\.mjs --check/, 'freshness check wired');
    assert.match(pkg.scripts.check, /build\.mjs --check/, 'npm run check includes freshness');
  });

  it('single cron-shape source bundled into the artifact', async () => {
    assert.equal(existsSync(path.join(root, 'src', 'domain', 'cronShapes.ts')), true);
    register('./stubs/sdk-loader.mjs', import.meta.url);
    const artifact = await import('../desktop/plugin.js');
    for (const fn of ['listJobs', 'addJob', 'removeJob', 'pauseJob', 'resumeJob', 'routeKey', 'scopedCronParams']) {
      assert.equal(typeof artifact[fn], 'function', `${fn} must come from the single bundled source`);
    }
  });
});
