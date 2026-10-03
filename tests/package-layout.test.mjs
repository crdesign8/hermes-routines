import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const GATE_REL = path.join('scripts', 'check-package-layout.mjs');

/**
 * The gate resolves the repository as `scripts/..`, so a scratch tree only
 * needs the paths it reads: package.json, the manifest, the source constants,
 * the generated artifact, and both docs. `src/` is only probed for existence
 * via stat, and no other src file is read, so a single constants.ts is enough.
 */
function scratchTree() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'package-layout-'));
  const files = [
    'package.json',
    'plugin.yaml',
    GATE_REL,
    path.join('src', 'constants.ts'),
    path.join('desktop', 'plugin.js'),
    'README.md',
    path.join('docs', 'INSTALL.md'),
  ];
  for (const rel of files) {
    const dst = path.join(tmp, rel);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(path.join(root, rel), dst);
  }
  return tmp;
}

function runGate(dir) {
  return spawnSync(process.execPath, [path.join(dir, GATE_REL)], { encoding: 'utf8', timeout: 60000 });
}

/** Apply a mutation to a scratch tree and return the gate result. */
function runGateAfter(dir, mutate) {
  mutate(dir);
  return runGate(dir);
}

describe('unified package layout (issue #99)', () => {
  it('the removed manual installer is gone with nothing left pointing at it', () => {
    assert.equal(existsSync(path.join(root, 'scripts', 'install.mjs')), false, 'scripts/install.mjs must be removed');
    for (const rel of [
      'README.md',
      path.join('docs', 'INSTALL.md'),
      path.join('docs', 'RELEASE.md'),
      'CHANGELOG.md',
    ]) {
      const text = readFileSync(path.join(root, rel), 'utf8');
      assert.equal(
        /node\s+scripts\/install\.mjs/.test(text),
        false,
        `${rel} must not still tell the reader to run the removed installer`,
      );
    }
    // No script may import the removed installer. (A mention inside the
    // layout gate's own check pattern is fine; an import would revive it.)
    const gateFiles = [
      'build.mjs',
      'check-allowlist.mjs',
      'check-version.mjs',
      'check-manifest.mjs',
      'check-sdk-baseline.mjs',
      'check-package-layout.mjs',
    ];
    for (const name of gateFiles) {
      const text = readFileSync(path.join(root, 'scripts', name), 'utf8');
      assert.equal(
        /(?:from\s+|import\s*\(\s*)['"][^'"]*install\.mjs['"]/.test(text),
        false,
        `scripts/${name} must not import the removed installer`,
      );
    }
  });

  it('the package keeps the shape the host installs and projects', () => {
    // plugin.yaml + desktop/plugin.js in ONE package is the unified model
    // (upstream _LOADABLE_ENTRYPOINTS); both must be present and shipped.
    assert.equal(existsSync(path.join(root, 'plugin.yaml')), true, 'plugin.yaml must ship at the package root');
    assert.equal(existsSync(path.join(root, 'desktop', 'plugin.js')), true, 'desktop/plugin.js must ship in the package');
    assert.ok(pkg.files.includes('plugin.yaml'), 'plugin.yaml must be in files');
    assert.ok(pkg.files.includes('desktop/'), 'desktop/ must be in files');
    // The projected folder name is the plugins/<name> key, and the loader
    // reads <id>/plugin.js — so the package name IS the plugin id.
    const constants = readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
    const id = /PLUGIN_ID\s*=\s*(['"])([^'"]+)\1/.exec(constants)?.[2];
    assert.equal(id, pkg.name, 'the projected folder name must equal the plugin id');
    const manifest = readFileSync(path.join(root, 'plugin.yaml'), 'utf8');
    assert.match(manifest, /^name:\s*['"]?hermes-routines['"]?/m, 'plugin.yaml name must equal the package name');
  });

  it('the generated artifact still exposes the descriptor the loader reads', () => {
    const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    assert.match(artifact, /AUTO-GENERATED/, 'the artifact must stay banner-marked as generated');
    assert.match(artifact, /export\s*\{[^}]*\bdefault\b[^}]*\}|export\s+default\b/, 'loader reads the default export');
  });

  it('docs name exactly one canonical installation model', () => {
    for (const rel of ['README.md', path.join('docs', 'INSTALL.md')]) {
      const text = readFileSync(path.join(root, rel), 'utf8');
      assert.match(text, /hermes plugins install/, `${rel} must name the plugin manager as canonical`);
      assert.match(text, /hermes plugins update/, `${rel} must name the plugin manager update path`);
      assert.match(text, /hermes plugins remove/, `${rel} must name the plugin manager remove path`);
      // No second supported install root.
      assert.equal(/desktop-plugins\/hermes-routines\/plugin\.js[^\n]*—/.test(text), false, 'docs must not present a manual copy step');
    }
  });

  it('the minimum supported Hermes release is recorded', () => {
    const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /2026\.9\.11/, 'README must record the minimum supported Hermes release');
    const doc = readFileSync(path.join(root, 'docs', 'INSTALL.md'), 'utf8');
    assert.match(doc, /2026\.9\.11/, 'INSTALL must record the minimum supported Hermes release');
  });

  it('npm run check wires the package layout gate', () => {
    assert.equal(pkg.scripts['check:package-layout'], 'node scripts/check-package-layout.mjs');
    assert.match(pkg.scripts.check, /check-package-layout/, 'npm run check must include the package layout gate');
  });

  it('gate passes on this repository', () => {
    const clean = runGate(root);
    assert.equal(clean.status, 0, `gate must pass on the real repository, got: ${clean.stderr}`);
    assert.match(clean.stdout, /check-package-layout ok/);
  });

  it('gate fails closed when the package loses a host entry point', () => {
    const missingManifest = runGateAfter(scratchTree(), (dir) => {
      rmSync(path.join(dir, 'plugin.yaml'));
    });
    assert.notEqual(missingManifest.status, 0, 'gate must fail without plugin.yaml');
    assert.match(missingManifest.stderr, /plugin\.yaml missing/, 'gate must name the missing entry point');

    const missingDesktop = runGateAfter(scratchTree(), (dir) => {
      rmSync(path.join(dir, 'desktop', 'plugin.js'));
    });
    assert.notEqual(missingDesktop.status, 0, 'gate must fail without desktop/plugin.js');
    assert.match(missingDesktop.stderr, /desktop\/plugin\.js missing/);
  });

  it('gate fails closed when the projected folder name would not equal the plugin id', () => {
    const drifted = runGateAfter(scratchTree(), (dir) => {
      const file = path.join(dir, 'src', 'constants.ts');
      writeFileSync(file, readFileSync(file, 'utf8').replace("PLUGIN_ID = 'hermes-routines'", "PLUGIN_ID = 'routines'"));
    });
    assert.notEqual(drifted.status, 0, 'gate must fail on PLUGIN_ID drift');
    assert.match(drifted.stderr, /projected folder name would not equal the plugin id/);
  });

  it('gate fails closed when docs drift back to a second install path', () => {
    const staleDoc = runGateAfter(scratchTree(), (dir) => {
      const file = path.join(dir, 'README.md');
      writeFileSync(file, `${readFileSync(file, 'utf8')}\nnode scripts/install.mjs install\n`);
    });
    assert.notEqual(staleDoc.status, 0, 'gate must fail when docs reference the removed installer');
    assert.match(staleDoc.stderr, /removed the manual installer|still tells the reader to run/);

    const missingMin = runGateAfter(scratchTree(), (dir) => {
      const file = path.join(dir, 'README.md');
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('2026.9.11', '2026.9.7'));
    });
    assert.notEqual(missingMin.status, 0, 'gate must fail when README drops the minimum supported release');
    assert.match(missingMin.stderr, /minimum supported Hermes release/);
  });

  it('gate fails closed when the shipped tarball stops carrying the install unit', () => {
    const noDesktop = runGateAfter(scratchTree(), (dir) => {
      const file = path.join(dir, 'package.json');
      const pkgCopy = JSON.parse(readFileSync(file, 'utf8'));
      pkgCopy.files = pkgCopy.files.filter((f) => f !== 'desktop/');
      writeFileSync(file, JSON.stringify(pkgCopy, null, 2));
    });
    assert.notEqual(noDesktop.status, 0, 'gate must fail when desktop/ is not shipped');
    assert.match(noDesktop.stderr, /files must ship desktop\//);
  });
});