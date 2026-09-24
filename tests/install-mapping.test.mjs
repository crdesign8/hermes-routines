import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const install = await import('../scripts/install.mjs');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

describe('install-mapping', () => {
  it('maps desktop/plugin.js to <profile-home>/plugins/routines/plugin.js (folder name equals id routines)', () => {
    assert.equal(install.PLUGIN_DIR_NAME, 'routines', 'plugin dir name must equal id routines');
    assert.equal(install.PLUGIN_FILE_NAME, 'plugin.js');
    const testHome = path.resolve('/tmp', 'prof-home');
    const paths = install.resolveInstallPaths(testHome, root);
    assert.equal(paths.src, path.join(root, 'desktop', 'plugin.js'));
    assert.equal(paths.destDir, path.join(testHome, 'plugins', 'routines'));
    assert.equal(paths.dest, path.join(testHome, 'plugins', 'routines', 'plugin.js'));
  });

  it('install copies byte-identical with sha256 verify', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-prof-'));
    const result = install.install({ profileHome: home, root });
    const srcBytes = readFileSync(result.src);
    const destBytes = readFileSync(result.dest);
    assert.equal(destBytes.length, srcBytes.length, 'dest must be byte-identical to src');
    assert.equal(result.sha256, sha256(srcBytes), 'reported sha256 must match src');
    assert.equal(sha256(destBytes), sha256(srcBytes), 'dest sha256 must match src sha256');
    const again = install.install({ profileHome: home, root });
    assert.equal(again.sha256, result.sha256, 'reinstall must be idempotent');
  });

  it('flat install: only desktop/plugin.js ships, plugin.yaml stays at the package root', () => {
    assert.equal(install.SOURCE_REL, path.join('desktop', 'plugin.js'));
    const src = readFileSync(path.join(root, 'scripts', 'install.mjs'), 'utf8');
    assert.equal(
      src.includes('plugin.yaml'),
      false,
      'the flat installer must not reference plugin.yaml (distribution-only, see docs/INSTALL.md)',
    );
  });
});
