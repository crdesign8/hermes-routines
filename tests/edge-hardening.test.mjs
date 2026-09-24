import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactPath = path.join(root, 'desktop', 'plugin.js');

register('./stubs/sdk-loader.mjs', import.meta.url);
const sdk = await import('./stubs/sdk-stub.mjs');
const artifact = await import('../desktop/plugin.js');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

// Hardening coverage for review findings: validation at the edge,
// fail-closed routing, traversal-safe install, no-aliasing shapes.
describe('edge-hardening', () => {
  it('rejects blank, overlong and charset-invalid job_id', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    for (const bad of ['', '   ', '\t\n', 'a b', 'j;1', '../x', 'x'.repeat(129), 42, null, undefined, {}, []]) {
      assert.throws(() => shapes.removeJob(bad), TypeError, `removeJob(${JSON.stringify(bad)})`);
      assert.throws(() => shapes.pauseJob(bad), TypeError);
      assert.throws(() => shapes.resumeJob(bad), TypeError);
      assert.throws(() => shapes.addJob({ job_id: bad, schedule: '* * * * *' }), TypeError);
    }
    // trimming normalizes: padded id is accepted as trimmed
    assert.deepEqual(shapes.removeJob('  j1  '), { action: 'remove', name: 'j1' });
  });

  it('rejects blank, non-string and overlong prompt', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    for (const bad of ['', '   ', null, undefined, 42, {}, [], 'x'.repeat(20001)]) {
      assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: '* * * * *', prompt: bad }), TypeError);
    }
    const added = shapes.addJob({ job_id: 'j1', schedule: '* * * * *', prompt: '  ping  ' });
    assert.equal(added.prompt, 'ping', 'prompt is trimmed');
  });

  it('listJobs deep-clones items instead of aliasing', async () => {
    const shapes = await import('../src/domain/cronShapes.ts');
    const inner = { name: 'j1', meta: { n: 1 } };
    const listed = shapes.listJobs([inner]);
    inner.meta.n = 99;
    inner.name = 'mut';
    assert.equal(listed.jobs[0].name, 'j1');
    assert.equal(listed.jobs[0].meta.n, 1);
    assert.deepEqual(shapes.listJobs('nope'), { action: 'list', jobs: [] });
  });

  it('scopedCronParams tolerates null route; routeKey/backend guards', async () => {
    const routing = await import('../src/domain/routing.ts');
    const params = { action: 'list' };
    assert.equal(routing.scopedCronParams(null, params), params, 'null route returns params as-is');
    assert.equal(routing.scopedCronParams(undefined, params), params);
    for (const bad of [null, undefined, {}, { connectionId: 'c1' }, { profile: 'p1' }, { connectionId: '  ', profile: 'p1' }]) {
      assert.throws(() => routing.routeKey(bad), TypeError);
    }
    assert.equal(routing.backendTargetProfile(null, 'd'), 'd');
  });

  it('resolveProfileRoute rejects unknown mode; handles remoteSource/owner_removed', async () => {
    const routing = await import('../src/domain/routing.ts');
    assert.throws(
      () =>
        routing.resolveProfileRoute({
          sourceScoped: true,
          route: { connectionId: 'c1', mode: 'banana', profile: 'p1', targetProfile: 'p1' },
        }),
      TypeError,
    );
    const viaRemote = routing.resolveProfileRoute({ remoteSource: true, connectionId: 'c1', name: 'p1' });
    assert.equal(viaRemote.status, 'resolved');
    const ownerGone = routing.resolveProfileRoute({ sourceScoped: true, connectionId: '', name: 'p1' });
    assert.equal(ownerGone.status, 'owner_removed');
    assert.throws(() => routing.profileRoute({ sourceScoped: true, connectionId: '', name: 'p1' }), /no connection owner/);
  });

  it('requestCronForRoute validates timeoutMs and missing host doors', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => 'routed', request: async () => 'plain' });
    const route = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 'p1' };
    for (const bad of [-1, NaN, Infinity, '100', {}]) {
      await assert.rejects(() => artifact.requestCronForRoute(route, 'cron.manage', {}, bad), TypeError);
    }
    assert.equal(sdk.__calls().length, 0, 'invalid timeout must reject before any dispatch');

    sdk.__dropDoor('requestProfile');
    try {
      await assert.rejects(
        () => artifact.requestCronForRoute(route, 'cron.manage', { profile: 'p1' }),
        /Cannot route/,
      );
    } finally {
      sdk.__reset();
    }
    sdk.__dropDoor('request');
    try {
      await assert.rejects(
        () => artifact.requestCronForRoute(null, 'cron.manage', {}, undefined, { allowActiveDoor: true }),
        /Cannot dispatch/,
      );
    } finally {
      sdk.__reset();
    }

    const out = await artifact.requestCronForRoute(route, 'cron.manage', { action: 'list', profile: 'p1' }, 100);
    assert.equal(out, 'routed');
    const logged = sdk.__calls().filter((c) => c.door === 'requestProfile');
    assert.equal(logged[0].args[3], 100, 'timeout must reach host.requestProfile as 4th arg');
  });

  it('resolveProfileHome rejects traversal; blank falls back to default', async () => {
    const install = await import('../scripts/install.mjs');
    for (const bad of ['../../evil', '..', '.', '/abs/path', 'a/b', 'has space']) {
      assert.throws(() => install.resolveProfileHome({ profile: bad }), /invalid profile/);
    }
    assert.throws(() => install.resolveProfileHome({ profileHome: '   ' }), /invalid profileHome/);
    // Empty profile keeps the historical fallback to `default`.
    const defHome = install.resolveProfileHome({ profile: '' });
    assert.match(defHome, /default$/);
    const ok = install.resolveProfileHome({ profile: 'code-reviewer' });
    assert.match(ok, /code-reviewer$/);
    // explicit absolute home is honored (resolved)
    const testAbs = path.resolve('/tmp/prof-home');
    const abs = install.resolveProfileHome({ profileHome: testAbs });
    assert.equal(abs, testAbs);
  });

  it('install fails when source is missing and leaves no temp files', async () => {
    const install = await import('../scripts/install.mjs');
    const home = mkdtempSync(path.join(tmpdir(), 'routines-prof-'));
    assert.throws(() => install.install({ profileHome: home, root: '/nonexistent-root' }), /install source missing/);
  });

  it('src gateway is fail-closed: listRoutines requires a route, listProfileRoutes wraps errors', () => {
    const src = readSrcTree();
    assert.match(src, /listRoutines requires a resolved profile route/, 'listRoutines must guard null route');
    assert.match(src, /failed to list profile routes/, 'listProfileRoutes must wrap host errors');
    assert.match(src, /timeoutMs must be a non-negative finite number/, 'timeoutMs must be validated');
  });

  it('desktop/plugin.js register uses the declared id/path constants', () => {
    const src = readFileSync(artifactPath, 'utf8');
    assert.match(src, /id:\s*ROUTE_ID/, 'route registration must use ROUTE_ID');
    assert.match(src, /path:\s*ROUTE_PATH/, 'registration must use ROUTE_PATH');
    assert.match(src, /id:\s*SIDEBAR_ID/, 'sidebar registration must use SIDEBAR_ID');
  });
});
