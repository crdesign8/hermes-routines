import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(path.join(root, 'sdk-baseline.json'), 'utf8'));

const SHIM_REL = path.join('src', 'types', 'plugin-sdk.d.ts');
const GATE_REL = path.join('scripts', 'check-sdk-baseline.mjs');
const DOC_REL = path.join('docs', 'SDK-BASELINE.md');

// The compatibility baseline is a second, independent re-parse of the SDK
// contract: this test never calls scripts/check-sdk-baseline.mjs for its
// assertions, so the gate and the test cross-check each other. The gate is
// exercised separately, on a scratch tree, for its fail-closed behaviour.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
}

function srcFiles(dir = path.join(root, 'src')) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...srcFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function importedSdkNames() {
  const values = new Set();
  const types = new Set();
  for (const file of srcFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const re = /import\s+([^;]*?)\s*from\s*['"]@hermes\/plugin-sdk['"]/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      const clause = (m[1] || '').trim();
      const brace = clause.indexOf('{');
      assert.ok(brace !== -1, `only named SDK imports expected in ${file}`);
      const typeOnly = clause.startsWith('type ');
      const nameList = clause.slice(brace + 1, clause.lastIndexOf('}'));
      for (const raw of nameList.split(',')) {
        let spec = raw.trim();
        if (spec === '') continue;
        const isType = typeOnly || spec.startsWith('type ');
        if (spec.startsWith('type ')) spec = spec.slice('type '.length).trim();
        const asIndex = spec.search(/\s+as\s+/);
        const name = asIndex === -1 ? spec : spec.slice(0, asIndex).trim();
        (isType ? types : values).add(name);
      }
    }
  }
  return { values, types };
}

function hostMemberNames() {
  const found = new Set();
  for (const file of srcFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const re = /(?<![\w$.])host((?:\??\.[\w$]+)+)/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      const segments = (m[1] || '')
        .split('.')
        .map((s) => s.replace(/\?$/, ''))
        .filter(Boolean);
      if (segments.length > 0) found.add(segments.slice(0, 2).join('.'));
    }
  }
  return found;
}

function shimExports() {
  const source = readFileSync(path.join(root, SHIM_REL), 'utf8');
  const exported = new Set();
  const re = /(?:^|\n)\s*export\s+(?:declare\s+)?(?:interface|type|const|function|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) if (m[1]) exported.add(m[1]);
  return { source, exported };
}

const namesOfKind = (kind) => baseline.symbols.filter((s) => s.kind === kind).map((s) => s.name);
const exportNames = new Set([...namesOfKind('value-export'), ...namesOfKind('type-export')]);
const hostNames = new Set(namesOfKind('host-member'));

function runGate(dir) {
  return spawnSync(process.execPath, [path.join(dir, GATE_REL)], { encoding: 'utf8' });
}

function scratchTree() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sdk-baseline-gate-'));
  for (const entry of ['src', 'scripts']) {
    cpSync(path.join(root, entry), path.join(tmp, entry), { recursive: true });
  }
  writeFileSync(path.join(tmp, 'sdk-baseline.json'), readFileSync(path.join(root, 'sdk-baseline.json')));
  return tmp;
}

describe('sdk-baseline', () => {
  it('pins the upstream reference and carries a well-formed symbol table', () => {
    assert.equal(baseline.version, 1, 'baseline schema version must be 1');
    const up = baseline.upstream;
    assert.equal(up.repository, 'NousResearch/hermes-agent', 'canonical upstream repository must be named');
    assert.match(up.ref, /^[0-9a-f]{40}$/, 'baseline must pin a full upstream commit sha');
    assert.equal(up.sdkModule, 'apps/desktop/src/sdk/index.ts', 'canonical SDK module must be named');
    assert.match(up.docs, /desktop-plugin-sdk\.md$/, 'SDK documentation page must be named');
    assert.equal(up.examplePlugins, 'NousResearch/hermes-example-plugins', 'companion examples repo must be named');
    assert.match(up.firstPartyPlugins, /plugins\/$/, 'first-party plugin implementations must be named');
    assert.equal(up.package.name, '@hermes/plugin-sdk');
    assert.equal(up.package.published, false, 'the SDK package is unpublished; the shim exists because of that');
    assert.ok(Array.isArray(baseline.symbols) && baseline.symbols.length > 0, 'symbols must be recorded');
    const names = baseline.symbols.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, 'symbol names must be unique');
    for (const symbol of baseline.symbols) {
      assert.ok(
        ['value-export', 'type-export', 'host-member', 'shim-internal'].includes(symbol.kind),
        `${symbol.name} has an unknown kind`,
      );
      assert.match(symbol.upstream, /^[^\s:]+:\d+$/, `${symbol.name} must point at an upstream file:line anchor`);
      if (symbol.kind === 'host-member') {
        assert.equal(symbol.surface, `host.${symbol.name}`, `${symbol.name} surface must be host.<member>`);
      }
    }
  });

  it('records exactly the SDK exports src/ imports', () => {
    const { values, types } = importedSdkNames();
    for (const name of values) {
      assert.ok(exportNames.has(name), `SDK value import ${name} must be in sdk-baseline.json`);
      assert.ok(namesOfKind('value-export').includes(name), `${name} must be recorded as a value-export`);
    }
    for (const name of types) {
      assert.ok(exportNames.has(name), `SDK type import ${name} must be in sdk-baseline.json`);
      assert.ok(namesOfKind('type-export').includes(name), `${name} must be recorded as a type-export`);
    }
    for (const name of exportNames) {
      assert.ok(
        values.has(name) || types.has(name),
        `${name} is recorded in the baseline but src/ never imports it (no speculative entries)`,
      );
    }
  });

  it('records exactly the host members src/ calls', () => {
    const called = hostMemberNames();
    for (const name of called) {
      assert.ok(hostNames.has(name), `host.${name} is called by src/ but not recorded in sdk-baseline.json`);
    }
    for (const name of hostNames) {
      assert.ok(called.has(name), `host.${name} is recorded but src/ never calls it`);
    }
  });

  it('keeps the shim minimal: it exports exactly the recorded exports, no more', () => {
    const { source, exported } = shimExports();
    assert.deepEqual([...exported].sort(), [...exportNames].sort(), 'shim exports must equal the recorded export set');
    for (const name of exported) {
      assert.ok(exportNames.has(name), `shim exports ${name}, which the baseline does not record`);
    }
    // The shim's own helpers stay unexported: they are structural stand-ins,
    // not SDK imports, and exporting them would make the shim a fiction.
    for (const helper of namesOfKind('shim-internal')) {
      assert.match(source, new RegExp(`interface\\s+${helper}\\b`), `shim must declare ${helper}`);
      assert.equal(
        new RegExp(`export\\s+(?:declare\\s+)?(?:interface|type|const|function)\\s+${helper}\\b`).test(source),
        false,
        `shim must NOT export the shim-internal helper ${helper}`,
      );
    }
  });

  it('documents the baseline, the enforcement rules, and the refresh procedure', () => {
    assert.equal(existsSync(path.join(root, DOC_REL)), true, `${DOC_REL} must exist`);
    const doc = readFileSync(path.join(root, DOC_REL), 'utf8');
    assert.ok(doc.includes(baseline.upstream.ref), 'doc must record the pinned upstream commit');
    assert.ok(doc.includes(baseline.upstream.sdkModule), 'doc must name the canonical SDK module');
    assert.ok(doc.includes('NousResearch/hermes-example-plugins'), 'doc must name the companion examples repo');
    assert.ok(doc.includes('apps/desktop/src/plugins/'), 'doc must name the first-party reference implementations');
    assert.match(doc, /npm view @hermes\/plugin-sdk/, 'doc must record the unpublished-package evidence');
    assert.match(doc, /Refreshing the baseline/, 'doc must document when and how the baseline is refreshed');
    assert.match(doc, /check-sdk-baseline\.mjs/, 'doc must name the enforcing gate');
  });

  it('npm run check wires the SDK baseline gate', () => {
    assert.equal(pkg.scripts['check:sdk-baseline'], 'node scripts/check-sdk-baseline.mjs');
    assert.match(pkg.scripts.check, /check-sdk-baseline/, 'npm run check must include the SDK baseline gate');
    assert.ok(pkg.files.includes('sdk-baseline.json'), 'the baseline must ship with the package');
  });

  it('gate passes on this repository and fails closed on a new SDK import', () => {
    const clean = scratchTree();
    const ok = runGate(clean);
    assert.equal(ok.status, 0, `clean scratch tree must pass the gate, got: ${ok.stderr}`);

    const target = path.join(clean, 'src', 'gateway', 'cronGateway.ts');
    appendFileSync(target, "\nimport { haptic } from '@hermes/plugin-sdk';\nexport const __hapticProbe = haptic;\n");
    const bad = runGate(clean);
    assert.notEqual(bad.status, 0, 'gate must fail on an SDK import the baseline does not record');
    assert.match(bad.stderr, /haptic/, 'gate must name the unrecorded symbol');
    assert.match(bad.stderr, /sdk-baseline\.json/, 'gate must point at the baseline file to update');
  });

  it('gate fails closed on an unrecorded host member and on a stale baseline entry', () => {
    const forHost = scratchTree();
    appendFileSync(
      path.join(forHost, 'src', 'gateway', 'cronGateway.ts'),
      '\nexport const __hostProbe = () => host.getGateway();\n',
    );
    const hostRun = runGate(forHost);
    assert.notEqual(hostRun.status, 0, 'gate must fail on an unrecorded host member call');
    assert.match(hostRun.stderr, /host\.getGateway/, 'gate must name the unrecorded host member');

    const forStale = scratchTree();
    const stalePath = path.join(forStale, 'sdk-baseline.json');
    const stale = JSON.parse(readFileSync(stalePath, 'utf8'));
    stale.symbols = stale.symbols.filter((s) => s.name !== 'useValue');
    writeFileSync(stalePath, JSON.stringify(stale, null, 2));
    const staleRun = runGate(forStale);
    assert.notEqual(staleRun.status, 0, 'gate must fail when src/ imports a symbol the baseline dropped');
    assert.match(staleRun.stderr, /useValue/, 'gate must name the symbol missing from the baseline');

    const forShim = scratchTree();
    appendFileSync(
      path.join(forShim, SHIM_REL),
      '\nexport const haptic = (): void => undefined;\n',
    );
    const shimRun = runGate(forShim);
    assert.notEqual(shimRun.status, 0, 'gate must fail when the shim exports a symbol the baseline does not record');
    assert.match(shimRun.stderr, /haptic/, 'gate must name the undeclared shim export');
  });
});
