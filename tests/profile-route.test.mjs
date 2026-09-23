import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');

describe('profile-route', () => {
  it('routines.js consumes PluginProfileRoute via host.profileRoutes then host.requestProfile for cron.manage without hermes-bots import', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /PluginProfileRoute/, 'must reference PluginProfileRoute');
    assert.match(src, /host\.profileRoutes/, 'must consume host.profileRoutes');
    assert.match(src, /host\.requestProfile/, 'must consume host.requestProfile');
    assert.match(src, /cron\.manage/, 'must route cron.manage through the profile route');
    assert.equal(src.includes('requestForBot'), false, 'must mirror routing without importing requestForBot');
    assert.equal(src.includes('hermes-bots'), false, 'must not import hermes-bots');
  });

  it('cron-shapes mirrors cross-connection routing semantics without imports', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    for (const fn of ['routeKey', 'resolveProfileRoute', 'profileRoute', 'backendTargetProfile', 'scopedCronParams', 'requestCronForRoute']) {
      assert.equal(typeof shapes[fn], 'function', `${fn} must be exported`);
    }
    assert.equal(shapes.routeKey({ connectionId: 'c1', profile: 'p1' }), 'c1::p1');
    assert.deepEqual(shapes.resolveProfileRoute(null), { status: 'not_scoped', route: null });
    const resolved = shapes.resolveProfileRoute({ sourceScoped: true, connectionId: 'c1', name: 'p1' });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.route.connectionId, 'c1');
    assert.equal(resolved.route.profile, 'p1');
    assert.equal(shapes.backendTargetProfile({ targetProfile: 't1', profile: 'p1' }, 'd'), 't1');
    const scoped = shapes.scopedCronParams({ targetProfile: 't1', profile: 'p1' }, { action: 'list', profile: 'p1' });
    assert.equal(scoped.profile, 't1');
    const calls = [];
    const fakeHost = {
      requestProfile: async (...args) => {
        calls.push(['profile', ...args]);
        return 'routed';
      },
      request: async (...args) => {
        calls.push(['plain', ...args]);
        return 'plain';
      },
    };
    const out = await shapes.requestCronForRoute(fakeHost, resolved.route, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(out, 'routed');
    assert.equal(calls[0][0], 'profile');
    assert.equal(calls[0][2], 'cron.manage');
    const out2 = await shapes.requestCronForRoute(fakeHost, null, 'cron.manage', { action: 'list' });
    assert.equal(out2, 'plain');
    assert.equal(calls[calls.length - 1][0], 'plain');
  });
});
