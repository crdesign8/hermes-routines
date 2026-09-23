import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
}

// Version pin: package.json <-> definePlugin({ version }) in
// desktop/routines.js. Drift must break the suite (and `npm run check`
// via scripts/check-version.mjs).
describe('version-sync', () => {
  it('package.json version equals definePlugin({ version })', () => {
    const pkg = readJson('package.json');
    const src = readFileSync(path.join(root, 'desktop', 'routines.js'), 'utf8');
    const match = src.match(/definePlugin\(\{[^}]*?version:\s*['"]([^'"]+)['"]/s);
    assert.ok(match, 'definePlugin({ version }) must exist in desktop/routines.js');
    assert.equal(src.match(/version:\s*['"][^'"]+['"]/g)?.length, 1, 'exactly one version pin expected');
    assert.equal(match[1], pkg.version, `drift: package.json (${pkg.version}) vs routines.js (${match[1]})`);
  });

  it('npm run check wires the version gate', () => {
    const pkg = readJson('package.json');
    assert.match(pkg.scripts.check, /check-version/, 'npm run check must include check-version');
    assert.match(pkg.scripts['check:version'], /check-version\.mjs/, 'check:version script must exist');
  });
});
