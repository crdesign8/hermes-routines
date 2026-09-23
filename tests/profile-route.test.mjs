import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

register('./stubs/sdk-loader.mjs', import.meta.url);
const sdk = await import('./stubs/sdk-stub.mjs');
// Routing helpers are pure and re-exported by the generated artifact;
// requestCronForRoute closes over the imported host, so it is exercised
// through the same artifact with the stubbed SDK face.
const shapes = await import('../desktop/plugin.js');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

describe('profile-route', () => {
  it('src consumes PluginProfileRoute via host.profileRoutes then host.requestProfile for cron.manage without hermes-bots import', () => {
    const src = readSrcTree();
    assert.match(src, /PluginProfileRoute/, 'must reference PluginProfileRoute');
    assert.match(src, /host\.profileRoutes/, 'must consume host.profileRoutes');
    assert.match(src, /host\.requestProfile/, 'must consume host.requestProfile');
    assert.match(src, /cron\.manage/, 'must route cron.manage through the profile route');
    assert.equal(src.includes('requestForBot'), false, 'must mirror routing without importing requestForBot');
    assert.equal(src.includes('hermes-bots'), false, 'must not import hermes-bots');
  });

  it('routing helpers keep cross-connection semantics without imports', async () => {
    for (const fn of [
      'routeKey',
      'resolveProfileRoute',
      'profileRoute',
      'backendTargetProfile',
      'scopedCronParams',
      'requestCronForRoute',
      'resolveActiveRoute',
      'activeRouteKey',
    ]) {
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

    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => 'routed', request: async () => 'plain' });
    const out = await shapes.requestCronForRoute(resolved.route, 'cron.manage', {
      action: 'list',
      profile: 'p1',
    });
    assert.equal(out, 'routed');
    let logged = sdk.__calls();
    assert.equal(logged[0].door, 'requestProfile');
    assert.equal(logged[0].args[1], 'cron.manage');
    const out2 = await shapes.requestCronForRoute(
      null,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowActiveDoor: true },
    );
    assert.equal(out2, 'plain');
    logged = sdk.__calls();
    assert.equal(logged[logged.length - 1].door, 'request');
  });
});
