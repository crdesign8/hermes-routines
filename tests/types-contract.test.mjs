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

// Static typing contract: strict TypeScript over src/, checkJs over the
// scripts, a local SDK shim (the published SDK is unpublished — npm 404),
// and a tsc --noEmit gate wired into `npm run check`.
describe('types-contract', () => {
  it('tsconfig enables strict noEmit typecheck over src + scripts', () => {
    const cfg = readJson('tsconfig.json');
    assert.equal(cfg.compilerOptions.strict, true, 'strict must be on');
    assert.equal(cfg.compilerOptions.noEmit, true, 'noEmit must be on');
    assert.equal(cfg.compilerOptions.jsx, 'react-jsx', 'React 17+ JSX transform for TSX');
    assert.equal(cfg.compilerOptions.allowJs, true, 'allowJs must be on');
    assert.equal(cfg.compilerOptions.checkJs, true, 'checkJs must be on');
    const include = cfg.include.join(' ');
    assert.match(include, /src/, 'must cover src/');
    assert.match(include, /scripts/, 'must cover scripts/');
    // jsconfig is gone: tsconfig is the single typing configuration, and
    // the generated bundle in desktop/ is intentionally not type-checked.
    assert.equal(existsSync(path.join(root, 'jsconfig.json')), false, 'jsconfig.json must be removed');
    assert.equal(existsSync(path.join(root, 'types', 'sdk.d.ts')), false, 'root types/ replaced by src shim + @types');
  });

  it('local SDK shim mirrors the verified loader (no published package)', () => {
    const dts = read('src/types/plugin-sdk.d.ts');
    for (const name of [
      'PluginProfileRoute',
      'PluginContribution',
      'PluginContext',
      'HermesPlugin',
      'PluginHost',
    ]) {
      assert.match(dts, new RegExp(name), `${name} typedef required`);
    }
    // P0 pin: definePlugin does NOT exist in the real SDK — the shim must
    // never reintroduce it (the loader consumes the default export object).
    assert.equal(/definePlugin/.test(dts), false, 'definePlugin must not appear in the shim');
    assert.match(dts, /profileRoutes/, 'host.profileRoutes surface required');
    assert.match(dts, /requestProfile/, 'host.requestProfile surface required');
    assert.match(dts, /host\.state/, 'host.state surface required (active-profile binding)');
    assert.match(dts, /connectionId/, 'host.state.connectionId surface required');
    assert.match(dts, /useValue/, 'useValue surface required (reactive atoms in React)');
    assert.match(dts, /ROUTES_AREA/, 'ROUTES_AREA surface required');
    assert.match(dts, /SIDEBAR_NAV_AREA/, 'SIDEBAR_NAV_AREA surface required');
    assert.match(dts, /register\s*[:(]/, 'ctx.register surface required');
    assert.match(dts, /disposer|returns a function|=> \(\) => void|=> \(\) =>/, 'register returns a disposer');
    assert.match(dts, /404/, 'shim must document why the SDK is not a dependency');
  });

  it('scripts carry // @ts-check (belt and suspenders over checkJs)', () => {
    for (const rel of [
      'scripts/build.mjs',
      'scripts/check-allowlist.mjs',
      'scripts/check-version.mjs',
      'scripts/install.mjs',
    ]) {
      assert.match(read(rel), /@ts-check/, `${rel} must carry // @ts-check`);
    }
    // the removed gates must be gone with their files
    for (const rel of ['scripts/sync-shapes.mjs', 'scripts/check-types.mjs']) {
      assert.equal(existsSync(path.join(root, rel)), false, `${rel} must be removed`);
    }
  });

  it('SDK stays out of every dependency field; typescript/esbuild are dev-only', () => {
    const pkg = readJson('package.json');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const v = pkg[field] || {};
      assert.equal(v['@hermes/plugin-sdk'], undefined, `${field} must not contain @hermes/plugin-sdk`);
      assert.equal(v.react, undefined, `${field} must not contain react`);
      if (field !== 'devDependencies') {
        assert.equal(v.typescript, undefined, `${field} must not contain typescript`);
        assert.equal(v.esbuild, undefined, `${field} must not contain esbuild`);
      }
    }
    assert.ok(pkg.devDependencies.typescript, 'typescript is a devDependency (typecheck)');
    assert.ok(pkg.devDependencies.esbuild, 'esbuild is a devDependency (build)');
    assert.equal(
      pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0,
      true,
      'zero runtime dependencies',
    );
  });

  it('npm run check wires the static gates (typecheck + generated freshness)', () => {
    const pkg = readJson('package.json');
    assert.match(pkg.scripts.typecheck, /^tsc --noEmit/, 'typecheck script must exist');
    assert.match(pkg.scripts.check, /typecheck/, 'npm run check must include typecheck');
    assert.match(pkg.scripts.check, /build\.mjs --check/, 'npm run check must verify generated freshness');
    assert.match(pkg.scripts['check-generated'], /build\.mjs --check/, 'check:generated must exist');
  });

  it('artifact pins the typed descriptor (version + register, no definePlugin)', () => {
    const src = read('desktop/plugin.js');
    assert.match(src, /version:\s*['"]/, 'descriptor version pin must exist');
    assert.match(src, /register\s*[:(]/, 'descriptor must wire register');
    assert.equal(src.includes('definePlugin'), false, 'definePlugin does not exist in the SDK (P0)');
    assert.equal(src.includes('PluginDefinition'), false, 'no invented PluginDefinition contract');
  });

  it('typecheck gate passes (tsc --noEmit)', () => {
    const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
    assert.equal(existsSync(tsc), true, 'typescript must be installed as a devDependency');
    execFileSync(tsc, ['--noEmit', '-p', 'tsconfig.json'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 240000,
    });
  });
});
