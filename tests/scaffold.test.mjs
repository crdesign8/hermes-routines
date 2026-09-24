import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function runtimeDeps() {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.bundledDependencies || {}),
  };
}

describe('scaffold', () => {
  it('package.json is public-ready ESM with node>=20 and zero runtime deps', () => {
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.private, false);
    assert.equal(pkg.homepage, 'https://github.com/crdesign8/hermes-routines#readme');
    assert.equal(pkg.repository?.type, 'git');
    assert.equal(pkg.repository?.url, 'https://github.com/crdesign8/hermes-routines.git');
    assert.equal(pkg.bugs?.url, 'https://github.com/crdesign8/hermes-routines/issues');
    assert.ok(Array.isArray(pkg.files) && pkg.files.includes('README.md'), 'public files metadata required');
    assert.ok(pkg.engines && typeof pkg.engines.node === 'string', 'engines.node required');
    assert.match(pkg.engines.node, />=\s*20/, 'engines.node must require node>=20');
    assert.deepEqual(
      runtimeDeps(),
      {},
      `no runtime deps allowed (devDependencies are fine), found ${JSON.stringify(runtimeDeps())}`,
    );
    assert.ok(pkg.devDependencies, 'build tooling lives in devDependencies');
    assert.ok(
      !(pkg.devDependencies && pkg.devDependencies['@hermes/plugin-sdk']),
      'SDK must stay external, never installed',
    );
    assert.ok(!(pkg.devDependencies && pkg.devDependencies.react), 'react must stay external');
  });

  it('scripts: build, typecheck, test and freshness gates are wired', () => {
    assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
    assert.match(pkg.scripts.typecheck, /^tsc --noEmit/, 'typecheck must run tsc --noEmit');
    assert.equal(pkg.scripts['check-generated'], 'node scripts/build.mjs --check');
    assert.match(pkg.scripts.test, /node --test/, 'tests must run through node --test');
    assert.ok(pkg.scripts.check.includes('typecheck'), 'check must typecheck');
    assert.ok(pkg.scripts.check.includes('check-allowlist'), 'check must run allowlist');
    assert.ok(pkg.scripts.check.includes('check-version'), 'check must run version gate');
    assert.ok(pkg.scripts.check.includes('check-manifest'), 'check must run manifest parity gate');
    assert.equal(pkg.scripts['check:manifest'], 'node scripts/check-manifest.mjs');
    assert.ok(pkg.scripts.check.includes('build.mjs --check'), 'check must verify the artifact is fresh');
  });

  it('distribution manifest: plugin.yaml at the root, shipped, wired to the parity gate', () => {
    assert.equal(existsSync(path.join(root, 'plugin.yaml')), true, 'plugin.yaml must exist at the repo root');
    assert.ok(
      Array.isArray(pkg.files) && pkg.files.includes('plugin.yaml'),
      'plugin.yaml must ship in the published package',
    );
    assert.equal(existsSync(path.join(root, 'scripts', 'check-manifest.mjs')), true, 'manifest parity gate must exist');
    assert.equal(
      existsSync(path.join(root, 'tests', 'manifest-sync.test.mjs')),
      true,
      'manifest parity test must exist',
    );
  });

  it('source of truth: src/ + strict tsconfig + build script', () => {
    assert.equal(existsSync(path.join(root, 'src', 'plugin.tsx')), true, 'src/plugin.tsx must exist');
    assert.equal(
      existsSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx')),
      true,
      'views must live in src/',
    );
    assert.equal(existsSync(path.join(root, 'scripts', 'build.mjs')), true, 'esbuild build must exist');
    const tsconfig = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
    assert.equal(tsconfig.compilerOptions.strict, true, 'tsconfig must be strict');
    assert.equal(tsconfig.compilerOptions.noEmit, true, 'typecheck only');
    assert.equal(tsconfig.compilerOptions.jsx, 'react-jsx', 'React 17+ JSX transform');
    // src/ must be the editable surface (tsconfig covers src/**/* ...)
    assert.ok(
      Array.isArray(tsconfig.include) && tsconfig.include.some((e) => e.startsWith('src')),
      'include must cover src/',
    );
    const desktopFiles = readdirSync(path.join(root, 'desktop'));
    assert.deepEqual(desktopFiles, ['plugin.js'], 'desktop/ must hold only the generated artifact');
  });

  it('generated artifact: descriptor has stable id/version/register, no JSX syntax, renders via jsx()', () => {
    const p = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    assert.match(p, /id:\s*ROUTE_ID/, 'stable id ROUTE_ID required');
    assert.match(p, /version:\s*['"][^'"]+['"]/, 'version is declared');
    assert.match(p, /register\s*[:(]/, 'descriptor wires a register hook');
    assert.equal(p.includes('hello-' + 'runtime'), false, 'must not contain forbidden marker');
    assert.match(p, /export\s*\{[^}]*default|export default/, 'default export exists');

    // renders through jsx() calls (esbuild output) without JSX syntax in the artifact
    assert.match(p, /\bjsx\s*\(/, 'must render via jsx() without JSX syntax');
    assert.equal(
      /<[A-Za-z][\w-]*(\s|>|\/)/.test(p),
      false,
      'must not contain JSX syntax',
    );
  });

  it('builders + view + gateway exports come from the generated artifact', async () => {
    const { register } = await import('node:module');
    register('./stubs/sdk-loader.mjs', import.meta.url);
    const artifact = await import('../desktop/plugin.js');
    for (const f of [
      'listJobs',
      'addJob',
      'removeJob',
      'pauseJob',
      'resumeJob',
      'listRoutines',
      'requestCronForRoute',
      'routeKey',
      'resolveProfileRoute',
      'scopedCronParams',
      'isSafeOptimistic',
      'routinesViewReducer',
      'visibleJobs',
      'wrapHostError',
    ]) {
      assert.equal(typeof artifact[f], 'function', `${f} must be exported by plugin.js`);
    }
    assert.equal(artifact.default.version, pkg.version, 'plugin descriptor version must equal package.json');
    assert.deepEqual(
      artifact.removeJob('j1'),
      { action: 'remove', name: 'j1' },
      'remove/pause/resume keep the {action,name:job_id} contract',
    );
    assert.deepEqual(artifact.pauseJob('j1'), { action: 'pause', name: 'j1' });
    assert.deepEqual(artifact.resumeJob('j1'), { action: 'resume', name: 'j1' });
  });

  it('src/domain/cronShapes.ts keeps zero runtime imports (domain unit stays pure)', () => {
    const src = readFileSync(path.join(root, 'src', 'domain', 'cronShapes.ts'), 'utf8');
    const specifiers = [];
    const patterns = [
      /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src)) !== null) {
        if (!m[1].startsWith('node:')) specifiers.push(m[1]);
      }
    }
    assert.deepEqual(specifiers, [], 'cronShapes.ts must not import anything');
  });
});
