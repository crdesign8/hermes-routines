import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const installDoc = path.join(root, 'docs', 'INSTALL.md');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

// Fail-closed behavior is verified against the GENERATED artifact
// (desktop/plugin.js) with the SDK face stubbed — the bundle closes over
// its imported `host`, so door interactions are observed via the stub.
register('./stubs/sdk-loader.mjs', import.meta.url);
const sdk = await import('./stubs/sdk-stub.mjs');
const shapes = await import('../desktop/plugin.js');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

// P0 fail-closed: a profile-looking operation must never slide silently
// into the active gateway door, and a routed call must never drop its
// profile scope silently.
describe('fail-closed', () => {
  it('requestCronForRoute(null|unscoped) rejects by default', async () => {
    sdk.__reset();
    for (const target of [null, undefined, {}, { name: 'p1' }]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(target, 'cron.manage', { action: 'list' }),
        /without a resolved profile route/,
        `target ${JSON.stringify(target)} must reject`,
      );
    }
    assert.equal(sdk.__calls().length, 0, 'no host door may be touched on reject');
  });

  it('requestCronForRoute opens the active door only with { allowActiveDoor: true }', async () => {
    sdk.__reset();
    sdk.__setHost({ request: async () => 'plain' });
    const out = await shapes.requestCronForRoute(
      null,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowActiveDoor: true },
    );
    assert.equal(out, 'plain');
    const logged = sdk.__calls();
    assert.equal(logged[0].door, 'request');
    assert.equal(logged[0].args[0], 'cron.manage');
    // timeoutMs still flows positionally ahead of options
    const out2 = await shapes.requestCronForRoute(
      null,
      'cron.manage',
      { action: 'list' },
      50,
      { allowActiveDoor: true },
    );
    assert.equal(out2, 'plain');
    assert.equal(sdk.__calls()[1].args[2], 50, 'timeout must reach host.request as 3rd arg');
    // truthy-but-not-true must NOT open the door
    for (const flag of [1, 'yes', {}]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(null, 'cron.manage', {}, undefined, { allowActiveDoor: flag }),
        TypeError,
      );
    }
  });

  it('requestCronForRoute validates the options bag', async () => {
    sdk.__reset();
    for (const bad of [null, [], 'x', 42]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(null, 'cron.manage', {}, undefined, bad),
        TypeError,
        `options ${JSON.stringify(bad)} must throw TypeError`,
      );
    }
    await assert.rejects(
      () => shapes.requestCronForRoute(null, 'cron.manage', {}, undefined, { allowUnscoped: 'yes' }),
      TypeError,
    );
    assert.equal(sdk.__calls().length, 0, 'invalid options reject before any dispatch');
  });

  it('scopedCronParams throws when the route exists but params carries no profile', async () => {
    assert.throws(
      () => shapes.scopedCronParams(ROUTE, { action: 'list' }),
      /requires params\.profile/,
    );
    // explicit opt-in returns params untouched (same reference)
    const params = { action: 'list' };
    assert.equal(shapes.scopedCronParams(ROUTE, params, { allowUnscoped: true }), params);
    // profile present -> rewritten to the backend target
    assert.deepEqual(shapes.scopedCronParams(ROUTE, { action: 'list', profile: 'p1' }), {
      action: 'list',
      profile: 't1',
    });
    // no route -> passthrough untouched (same reference)
    assert.equal(shapes.scopedCronParams(null, params), params);
    assert.equal(shapes.scopedCronParams(undefined, params), params);
    // non-object params with a route -> domain TypeError, not a silent pass
    for (const bad of [null, [], 'x', 42]) {
      assert.throws(() => shapes.scopedCronParams(ROUTE, bad), TypeError);
    }
  });

  it('routed requestCronForRoute requires params.profile by default', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => 'routed' });
    await assert.rejects(
      () => shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(sdk.__calls().length, 0);
    const out = await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(out, 'routed');
    // stub logs { door, args }: args = [route, method, scopedParams, timeout?]
    const logged = sdk.__calls();
    assert.equal(logged[0].door, 'requestProfile');
    assert.deepEqual(logged[0].args[2], { action: 'list', profile: 't1' });
    // intentional unscoped routed call stays possible via opt-in
    const out2 = await shapes.requestCronForRoute(
      ROUTE,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowUnscoped: true },
    );
    assert.equal(out2, 'routed');
    assert.deepEqual(sdk.__calls()[1].args[2], { action: 'list' }, 'unscoped opt-in passes params through');
  });

  it('routed call rejects when the host is missing requestProfile (door guard)', async () => {
    sdk.__reset();
    sdk.__dropDoor('requestProfile');
    try {
      await assert.rejects(
        () => shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }),
        /Cannot route/,
      );
      assert.equal(sdk.__calls().length, 0, 'no door may be touched when the door is missing');
    } finally {
      sdk.__reset();
    }
  });

  it('active-door dispatch rejects when the host is missing request (door guard)', async () => {
    sdk.__reset();
    sdk.__dropDoor('request');
    try {
      await assert.rejects(
        () =>
          shapes.requestCronForRoute(null, 'cron.manage', { action: 'list' }, undefined, {
            allowActiveDoor: true,
          }),
        /host\.request is not a function/,
      );
      assert.equal(sdk.__calls().length, 0);
    } finally {
      sdk.__reset();
    }
  });

  it('uncloneable payload surfaces a domain TypeError (not the raw DOMException)', async () => {
    let err = null;
    try {
      shapes.addJob({ job_id: 'j1', schedule: '* * * * *', payload: { fn: () => {} } });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof TypeError, 'must be a TypeError');
    assert.match(err.message, /uncloneable value/);
    assert.equal(err?.cause?.name, 'DataCloneError');
    assert.throws(() => shapes.listJobs([{ fn: () => {} }]), /uncloneable value/);
  });

  it('src/ gateway is fail-closed too (source pin)', () => {
    const src = readSrcTree();
    assert.match(src, /allowActiveDoor/, 'gateway must gate the active door');
    assert.match(src, /without a resolved profile route/, 'gateway must carry the fail-closed error');
    assert.match(src, /allowUnscoped/, 'gateway must support the unscoped opt-in');
    assert.match(src, /requires a route with profile\/targetProfile/, 'listRoutines must require scope');
    assert.match(src, /function assertRoutingOptions/, 'gateway must validate the options bag');
  });

  it('docs pin the fail-closed opt-ins', () => {
    const doc = readFileSync(installDoc, 'utf8');
    assert.match(doc, /allowActiveDoor/, 'docs must document the active-door opt-in');
    assert.match(doc, /allowUnscoped/, 'docs must document the unscoped opt-in');
  });
});
