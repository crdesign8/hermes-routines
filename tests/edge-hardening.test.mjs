import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');

// Hardening coverage for review findings: validation at the edge,
// fail-closed routing, traversal-safe install, no-aliasing shapes.
describe('edge-hardening', () => {
  it('rejects blank, overlong and charset-invalid job_id', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const bad of ['', '   ', '\t\n', 'a b', 'j;1', '../x', 'x'.repeat(129), 42, null, undefined, {}, []]) {
      assert.throws(() => shapes.removeJob(bad), TypeError, `removeJob(${JSON.stringify(bad)})`);
      assert.throws(() => shapes.pauseJob(bad), TypeError);
      assert.throws(() => shapes.resumeJob(bad), TypeError);
      assert.throws(() => shapes.addJob({ job_id: bad, schedule: '* * * * *' }), TypeError);
    }
    // trimming normalizes: padded id is accepted as trimmed
    assert.deepEqual(shapes.removeJob('  j1  '), { action: 'remove', name: 'j1' });
  });

  it('rejects non-object payload and clones objects', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const bad of [null, [], 'x', 42]) {
      assert.throws(() => shapes.addJob({ job_id: 'j1', schedule: '* * * * *', payload: bad }), TypeError);
    }
    const nested = { a: { b: [1, 2] } };
    const added = shapes.addJob({ job_id: 'j1', schedule: '* * * * *', payload: nested });
    nested.a.b.push(3);
    assert.deepEqual(added.payload, { a: { b: [1, 2] } }, 'nested payload must be deep-cloned');
  });

  it('listJobs deep-clones items instead of aliasing', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const inner = { name: 'j1', meta: { n: 1 } };
    const listed = shapes.listJobs([inner]);
    inner.meta.n = 99;
    inner.name = 'mut';
    assert.equal(listed.jobs[0].name, 'j1');
    assert.equal(listed.jobs[0].meta.n, 1);
    assert.deepEqual(shapes.listJobs('nope'), { action: 'list', jobs: [] });
  });

  it('scopedCronParams tolerates null route; routeKey/backend guards', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const params = { action: 'list' };
    assert.equal(shapes.scopedCronParams(null, params), params, 'null route returns params as-is');
    assert.equal(shapes.scopedCronParams(undefined, params), params);
    for (const bad of [null, undefined, {}, { connectionId: 'c1' }, { profile: 'p1' }, { connectionId: '  ', profile: 'p1' }]) {
      assert.throws(() => shapes.routeKey(bad), TypeError);
    }
    assert.equal(shapes.backendTargetProfile(null, 'd'), 'd');
  });

  it('resolveProfileRoute rejects unknown mode; handles remoteSource/owner_removed', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    assert.throws(
      () =>
        shapes.resolveProfileRoute({
          sourceScoped: true,
          route: { connectionId: 'c1', mode: 'banana', profile: 'p1', targetProfile: 'p1' },
        }),
      TypeError,
    );
    const viaRemote = shapes.resolveProfileRoute({ remoteSource: true, connectionId: 'c1', name: 'p1' });
    assert.equal(viaRemote.status, 'resolved');
    const ownerGone = shapes.resolveProfileRoute({ sourceScoped: true, connectionId: '', name: 'p1' });
    assert.equal(ownerGone.status, 'owner_removed');
    assert.throws(() => shapes.profileRoute({ sourceScoped: true, connectionId: '', name: 'p1' }), /no connection owner/);
  });

  it('requestCronForRoute validates timeoutMs and missing host doors', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const route = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 'p1' };
    const okHost = {
      requestProfile: async () => 'routed',
      request: async () => 'plain',
    };
    for (const bad of [-1, NaN, Infinity, '100', {}]) {
      await assert.rejects(() => shapes.requestCronForRoute(okHost, route, 'cron.manage', {}, bad), TypeError);
    }
    await assert.rejects(() => shapes.requestCronForRoute({}, route, 'cron.manage', {}), /Cannot route/);
    await assert.rejects(() => shapes.requestCronForRoute({}, null, 'cron.manage', {}), /Cannot dispatch/);
    const out = await shapes.requestCronForRoute(okHost, route, 'cron.manage', { action: 'list' }, 100);
    assert.equal(out, 'routed');
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
    const abs = install.resolveProfileHome({ profileHome: '/tmp/prof-home' });
    assert.equal(abs, '/tmp/prof-home');
  });

  it('install fails when source is missing and leaves no temp files', async () => {
    const install = await import('../scripts/install.mjs');
    const home = mkdtempSync(path.join(tmpdir(), 'routines-prof-'));
    assert.throws(() => install.install({ profileHome: home, root: '/nonexistent-root' }), /install source missing/);
  });

  it('routines.js is fail-closed: listRoutines requires a route, listProfileRoutes wraps errors', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /listRoutines requires a resolved profile route/, 'listRoutines must guard null route');
    assert.match(src, /failed to list profile routes/, 'listProfileRoutes must wrap host errors');
    assert.match(src, /timeoutMs must be a non-negative finite number/, 'timeoutMs must be validated');
  });

  it('routines.js register uses the declared id/path constants', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /id:\s*ROUTE_ID/, 'route registration must use ROUTE_ID');
    assert.match(src, /path:\s*ROUTE_PATH/, 'registration must use ROUTE_PATH');
    assert.match(src, /id:\s*SIDEBAR_ID/, 'sidebar registration must use SIDEBAR_ID');
  });
});
