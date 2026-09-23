import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
// Version pin: package.json <-> the plugin descriptor embedded in the
// GENERATED artifact (desktop/plugin.js, built by scripts/build.mjs).
// Drift must break the suite (and `npm run check` via check-version.mjs).
const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');

describe('version-sync', () => {
  it('package.json version equals the plugin.js descriptor version', () => {
    const pins = artifact.match(/version:\s*['"][^'"]+['"]/g) || [];
    assert.equal(pins.length, 1, `exactly one version pin expected in desktop/plugin.js, got ${pins.length}`);
    const match = /version:\s*['"]([^'"]+)['"]/.exec(pins[0]);
    assert.ok(match, 'version pin must carry a value');
    assert.equal(match[1], pkg.version, `drift: package.json (${pkg.version}) vs plugin.js (${match[1]})`);
  });

  it('npm run check wires the version gate', () => {
    assert.match(pkg.scripts.check, /check-version/, 'npm run check must include check-version');
    assert.match(pkg.scripts['check:version'], /check-version\.mjs/, 'check:version script must exist');
  });
});
