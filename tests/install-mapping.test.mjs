import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  it('maps desktop/plugin.js to <HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js', () => {
    assert.equal(install.PLUGIN_ID, 'hermes-routines');
    assert.equal(install.PLUGIN_DIR_NAME, 'hermes-routines', 'app-level dir name must equal the plugin id');
    assert.equal(install.PLUGIN_FILE_NAME, 'plugin.js');
    assert.equal(install.DESKTOP_PLUGINS_DIR, 'desktop-plugins');
    const testHome = path.resolve('/tmp', 'hermes-home');
    const paths = install.resolveInstallPaths(testHome, root);
    assert.equal(paths.src, path.join(root, 'desktop', 'plugin.js'));
    assert.equal(paths.destDir, path.join(testHome, 'desktop-plugins', 'hermes-routines'));
    assert.equal(paths.dest, path.join(testHome, 'desktop-plugins', 'hermes-routines', 'plugin.js'));
    assert.equal(paths.prev, path.join(testHome, 'desktop-plugins', 'hermes-routines', 'plugin.js.prev'));
  });

  it('install copies byte-identical with sha256 verify and is idempotent', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-home-'));
    const result = install.install({ hermesHome: home, root });
    const srcBytes = readFileSync(result.src);
    const destBytes = readFileSync(result.dest);
    assert.equal(destBytes.length, srcBytes.length, 'dest must be byte-identical to src');
    assert.equal(result.sha256, sha256(srcBytes), 'reported sha256 must match src');
    assert.equal(sha256(destBytes), sha256(srcBytes), 'dest sha256 must match src sha256');
    assert.equal(result.backedUp, false, 'first install takes no backup');
    assert.equal(result.unchanged, false);
    const again = install.install({ hermesHome: home, root });
    assert.equal(again.sha256, result.sha256, 'reinstall must be idempotent');
    assert.equal(again.unchanged, true, 'reinstall of identical bytes reports unchanged');
  });

  it('update is install; differing reinstall backs up prev and rollback restores it', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-upd-'));
    const first = install.install({ hermesHome: home, root });
    // Simulate an older installed version by overwriting dest with other bytes.
    const dest = path.join(home, 'desktop-plugins', 'hermes-routines', 'plugin.js');
    const prev = path.join(home, 'desktop-plugins', 'hermes-routines', 'plugin.js.prev');
    const foreign = Buffer.from('// old version\n');
    writeFileSync(dest, foreign);
    const updated = install.update({ hermesHome: home, root });
    assert.equal(updated.backedUp, true, 'differing update must back up the previous bytes');
    assert.equal(readFileSync(prev).toString(), '// old version\n', 'backup must hold the previous bytes');
    assert.equal(updated.sha256, first.sha256, 'update must publish the current artifact');
    // Roll back to the foreign bytes via the backup.
    const rolled = install.rollback({ hermesHome: home, root });
    assert.equal(rolled.sha256, sha256(foreign), 'rollback must restore the backup bytes');
    assert.equal(readFileSync(dest).toString(), '// old version\n');
  });

  it('uninstall removes the app-level file and is idempotent when missing', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-rm-'));
    const missing = install.uninstall({ hermesHome: home, root });
    assert.equal(missing.removed, false, 'missing install must report removed:false');
    install.install({ hermesHome: home, root });
    const removed = install.uninstall({ hermesHome: home, root });
    assert.equal(removed.removed, true);
    assert.equal(existsSync(path.join(home, 'desktop-plugins', 'hermes-routines', 'plugin.js')), false);
    assert.equal(
      existsSync(path.join(home, 'desktop-plugins', 'hermes-routines')),
      false,
      'uninstall must remove the now-empty plugin dir',
    );
    const again = install.uninstall({ hermesHome: home, root });
    assert.equal(again.removed, false);
  });

  it('rollback without a backup fails closed', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-rb-'));
    install.install({ hermesHome: home, root });
    assert.throws(() => install.rollback({ hermesHome: home, root }), /no backup/);
  });

  it('hermes home resolution: explicit flag wins, HERMES_HOME env next, default ~/.hermes', () => {
    const saved = process.env.HERMES_HOME;
    const savedLegacy = process.env.HERMES_PROFILE_HOME;
    try {
      delete process.env.HERMES_PROFILE_HOME;
      process.env.HERMES_HOME = '/tmp/env-hermes-home';
      assert.equal(install.resolveHermesHome({}), path.resolve('/tmp/env-hermes-home'));
      assert.equal(
        install.resolveHermesHome({ hermesHome: '/tmp/flag-home' }),
        path.resolve('/tmp/flag-home'),
        'explicit hermesHome must win over the env',
      );
      process.env.HERMES_PROFILE_HOME = '/tmp/legacy-profile';
      assert.throws(
        () => install.resolveHermesHome({}),
        /legacy profile install removed/,
        'legacy env must fail closed even when HERMES_HOME is set (sessions inject it)',
      );
      assert.equal(
        install.resolveHermesHome({ hermesHome: '/tmp/flag-home' }),
        path.resolve('/tmp/flag-home'),
        'explicit hermesHome must win over the legacy env too',
      );
      delete process.env.HERMES_PROFILE_HOME;
      delete process.env.HERMES_HOME;
      assert.match(install.resolveHermesHome({}), /\.hermes$/, 'default must be ~/.hermes');
      assert.throws(() => install.resolveHermesHome({ hermesHome: '   ' }), /invalid hermesHome/);
    } finally {
      if (saved === undefined) delete process.env.HERMES_HOME;
      else process.env.HERMES_HOME = saved;
      if (savedLegacy === undefined) delete process.env.HERMES_PROFILE_HOME;
      else process.env.HERMES_PROFILE_HOME = savedLegacy;
    }
  });

  it('legacy profile inputs fail closed with a migration pointer', () => {
    const saved = process.env.HERMES_PROFILE_HOME;
    try {
      process.env.HERMES_PROFILE_HOME = '/tmp/legacy-profile';
      delete process.env.HERMES_HOME;
      assert.throws(() => install.resolveHermesHome({}), /legacy profile install removed/);
    } finally {
      if (saved === undefined) delete process.env.HERMES_PROFILE_HOME;
      else process.env.HERMES_PROFILE_HOME = saved;
    }
    const src = readFileSync(path.join(root, 'scripts', 'install.mjs'), 'utf8');
    assert.match(src, /--profile-home/, 'legacy CLI flags must be rejected in the parser');
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
