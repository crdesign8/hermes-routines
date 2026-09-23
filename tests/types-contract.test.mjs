import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

// Static SDK contract (P1-4): @ts-check + JSDoc typedefs + checkJs in CI,
// zero runtime/dev dependencies. The published SDK is unpublished (npm 404),
// so local typedefs mirror the verified loader and no devDep is added.
describe('types-contract', () => {
  it('jsconfig enables strict checkJs over desktop + scripts + types', () => {
    const cfg = readJson('jsconfig.json');
    assert.equal(cfg.compilerOptions.checkJs, true, 'checkJs must be on');
    assert.equal(cfg.compilerOptions.strict, true, 'strict must be on');
    assert.equal(cfg.compilerOptions.noEmit, true, 'noEmit must be on');
    assert.equal(cfg.compilerOptions.allowJs, true, 'allowJs must be on');
    const include = cfg.include.join(' ');
    assert.match(include, /desktop/, 'must cover desktop/');
    assert.match(include, /scripts/, 'must cover scripts/');
  });

  it('local SDK typedefs mirror the verified loader (no published package)', () => {
    const dts = read('types/sdk.d.ts');
    for (const name of [
      'PluginProfileRoute',
      'PluginHost',
      'PluginContext',
      'PluginDefinition',
      'RoutingOptions',
      'RouteRegistration',
      'SidebarRegistration',
    ]) {
      assert.match(dts, new RegExp(name), `${name} typedef required`);
    }
    assert.match(dts, /definePlugin/, 'definePlugin surface required');
    assert.match(dts, /profileRoutes/, 'host.profileRoutes surface required');
    assert.match(dts, /requestProfile/, 'host.requestProfile surface required');
    assert.match(dts, /ROUTES_AREA/, 'ROUTES_AREA surface required');
    assert.match(dts, /SIDEBAR_NAV_AREA/, 'SIDEBAR_NAV_AREA surface required');
    assert.match(dts, /ctx\.register|register\(entry/, 'ctx.register surface required');
    // Mount note: single ROUTES_AREA mount, component is metadata only.
    assert.match(dts, /no second render|single.*mount|entry metadata/i, 'mount note required');
    // Version is part of the static contract (string required).
    assert.match(dts, /version:\s*string/, 'PluginDefinition.version: string required');
  });

  it('desktop + scripts carry // @ts-check', () => {
    for (const rel of [
      'desktop/routines.js',
      'desktop/lib/cron-shapes.mjs',
      'scripts/check-allowlist.mjs',
      'scripts/check-version.mjs',
      'scripts/sync-shapes.mjs',
      'scripts/install.mjs',
      'scripts/check-types.mjs',
    ]) {
      assert.match(read(rel), /@ts-check/, `${rel} must carry // @ts-check`);
    }
  });

  it('does NOT add @hermes/plugin-sdk (unpublished) or typescript as a dependency', () => {
    const pkg = readJson('package.json');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const v = pkg[field] || {};
      assert.equal(v['@hermes/plugin-sdk'], undefined, `${field} must not contain @hermes/plugin-sdk`);
      assert.equal(v.typescript, undefined, `${field} must not contain typescript`);
    }
  });

  it('npm run check wires the static gate (check-types)', () => {
    const pkg = readJson('package.json');
    assert.match(pkg.scripts.check, /check-types/, 'npm run check must include check-types');
    assert.match(pkg.scripts['check:types'], /check-types\.mjs/, 'check:types script must exist');
  });

  it('version pin stays statically typed (definePlugin requires version: string)', () => {
    const src = read('desktop/routines.js');
    assert.match(src, /PluginDefinition/, 'routines.js must reference the PluginDefinition contract');
    assert.match(src, /version:\s*['"]/, 'definePlugin({ version }) pin must exist');
  });

  it('check-types gate passes (tsc --noEmit)', () => {
    const out = execFileSync('node', [path.join(root, 'scripts', 'check-types.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 240000,
    });
    assert.match(out, /check-types ok/, 'check-types must report ok');
  });
});
