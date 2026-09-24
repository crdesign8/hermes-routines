import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// Manifest/package/artifact parity: plugin.yaml <-> package.json (single
// source of truth) <-> src/constants.ts (PLUGIN_ID) <-> the GENERATED
// desktop/plugin.js descriptor. Independent re-parse — this test does not
// import scripts/check-manifest.mjs, so the gate and the test cross-check
// each other instead of sharing one implementation.
function constString(src, name) {
  const m = new RegExp(`${name}\\s*=\\s*(['"])([^'"]+)\\1`).exec(src);
  assert.ok(m?.[2], `${name} string literal must exist`);
  return m[2];
}

function flatManifest(text) {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    assert.ok(raw.charAt(0) !== ' ' && raw.charAt(0) !== '\t', `manifest line ${i + 1} must start at column 0, got ${JSON.stringify(raw)}`);
    const colon = line.indexOf(':');
    assert.ok(colon > 0, `manifest line must be key: value, got ${JSON.stringify(line)}`);
    const key = line.slice(0, colon).trim();
    assert.ok(key !== '', `manifest line ${i + 1} has an empty key`);
    assert.ok(!out.has(key), `manifest duplicates key ${JSON.stringify(key)}`);
    let value = line.slice(colon + 1).trim();
    assert.ok(value !== '', `manifest key ${JSON.stringify(key)} has an empty value`);
    if (value.charAt(0) === "'" || value.charAt(0) === '"') {
      const quote = value.charAt(0);
      assert.ok(value.length >= 2 && value.endsWith(quote), `manifest key ${JSON.stringify(key)} has an unterminated string`);
      value = value.slice(1, -1);
      assert.ok(value !== '', `manifest key ${JSON.stringify(key)} has an empty value`);
    }
    out.set(key, value);
  }
  return out;
}

function artifactDescriptor(src) {
  const m = /var\s+plugin\s*=\s*\{[\s\S]*?\n\};/.exec(src);
  assert.ok(m, 'artifact descriptor var plugin = { ... }; must exist');
  return m[0];
}

describe('manifest-sync', () => {
  it('plugin.yaml ships at the package root with the package triple', () => {
    assert.equal(existsSync(path.join(root, 'plugin.yaml')), true, 'plugin.yaml must exist at the repo root');
    assert.ok(
      Array.isArray(pkg.files) && pkg.files.includes('plugin.yaml'),
      'plugin.yaml must ship in the published package (files)',
    );
    const manifest = flatManifest(readFileSync(path.join(root, 'plugin.yaml'), 'utf8'));
    assert.equal(manifest.get('name'), pkg.name, 'manifest name must equal package.json name');
    assert.equal(manifest.get('version'), pkg.version, 'manifest version must equal package.json version');
    assert.equal(manifest.get('description'), pkg.description, 'manifest description must equal package.json description');
  });

  it('plugin.yaml declares no tools and no hooks', () => {
    const manifest = flatManifest(readFileSync(path.join(root, 'plugin.yaml'), 'utf8'));
    assert.equal(manifest.get('provides_tools'), '[]', 'provides_tools must stay empty');
    assert.equal(manifest.get('provides_hooks'), '[]', 'provides_hooks must stay empty');
  });

  it('PLUGIN_ID, manifest name and artifact id agree on the package name', () => {
    const constants = readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
    assert.equal(constString(constants, 'PLUGIN_ID'), pkg.name, 'PLUGIN_ID must equal package.json name');
    const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    assert.equal(constString(artifact, 'PLUGIN_ID'), pkg.name, 'artifact PLUGIN_ID must equal package.json name');
    assert.match(artifact, /\bid\s*:\s*PLUGIN_ID\b/, 'descriptor id must wire through PLUGIN_ID');
    assert.match(artifact, /\bname\s*:\s*PLUGIN_NAME\b/, 'descriptor name must wire through PLUGIN_NAME');
  });

  it('artifact description/version/defaultEnabled match the source of truth', () => {
    const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    const descriptor = artifactDescriptor(artifact);
    const descriptions = [...descriptor.matchAll(/\bdescription\s*:\s*(['"])([^'"]+)\1/g)];
    assert.equal(descriptions.length, 1, 'exactly one description field expected in the artifact descriptor');
    assert.equal(descriptions[0]?.[2], pkg.description, 'artifact description must equal package.json description');
    assert.equal([...artifact.matchAll(/\bdescription\s*:\s*(['"])([^'"]+)\1/g)].length, 1, 'no stray description outside the descriptor');
    const versions = [...descriptor.matchAll(/\bversion\s*:\s*(['"])([^'"]+)\1/g)];
    assert.equal(versions.length, 1, 'exactly one version pin expected in the artifact descriptor');
    assert.equal(versions[0]?.[2], pkg.version, 'artifact version must equal package.json version');
    assert.equal([...artifact.matchAll(/\bversion\s*:\s*(['"])([^'"]+)\1/g)].length, 1, 'no stray version outside the descriptor');
    const flags = [...descriptor.matchAll(/\bdefaultEnabled\s*:\s*(true|false)/g)];
    assert.equal(flags.length, 1, 'exactly one defaultEnabled field expected in the artifact descriptor');
    assert.equal(flags[0]?.[1], 'false', 'defaultEnabled must stay false (opt-in)');
    assert.equal([...artifact.matchAll(/\bdefaultEnabled\s*:\s*(true|false)/g)].length, 1, 'no stray defaultEnabled outside the descriptor');
  });

  it('plugin.yaml omits requires_hermes (fail-closed)', () => {
    const manifest = flatManifest(readFileSync(path.join(root, 'plugin.yaml'), 'utf8'));
    assert.equal(manifest.has('requires_hermes'), false, 'requires_hermes must be omitted, never pinned');
  });

  it('gate rejects a scratch manifest copy declaring requires_hermes', () => {
    // Observable gate check without touching the repo: stage a scratch tree
    // with the files the gate reads (it resolves root as scripts/..), run
    // the REAL gate script against it, and confirm a bogus requires_hermes
    // fails while the clean copy passes.
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'manifest-gate-'));
    for (const f of ['package.json', 'plugin.yaml', 'scripts/check-manifest.mjs', path.join('src', 'constants.ts'), path.join('desktop', 'plugin.js')]) {
      const dst = path.join(tmp, f);
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(path.join(root, f), dst);
    }
    const gate = path.join(tmp, 'scripts', 'check-manifest.mjs');
    const clean = spawnSync(process.execPath, [gate], { encoding: 'utf8' });
    assert.equal(clean.status, 0, `clean scratch tree must pass the gate, got: ${clean.stderr}`);
    appendFileSync(path.join(tmp, 'plugin.yaml'), '\nrequires_hermes: banana\n');
    const bad = spawnSync(process.execPath, [gate], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'gate must fail on a scratch manifest declaring requires_hermes');
    assert.match(bad.stderr, /must not declare requires_hermes/, 'gate must name the offending key');
  });

  it('npm run check wires the manifest gate', () => {
    assert.equal(pkg.scripts['check:manifest'], 'node scripts/check-manifest.mjs');
    assert.match(pkg.scripts.check, /check-manifest/, 'npm run check must include check-manifest');
  });
});
