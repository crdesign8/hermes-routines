import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so desktop/routines.js can be
// exercised behaviorally under node:test (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const shapes = await import('../desktop/lib/cron-shapes.mjs');
const routines = await import('../desktop/routines.js');
const sdk = await import('./stubs/sdk-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

function makeLibHost(log, overrides = {}) {
  return {
    requestProfile: async (...args) => {
      log.push(['profile', ...args]);
      return 'routed';
    },
    request: async (...args) => {
      log.push(['plain', ...args]);
      return 'plain';
    },
    ...overrides,
  };
}

describe('sync-semantics: requestCronForRoute behaves the same on both sides', () => {
  it('routed call rewrites profile to the backend target and returns the host value', async () => {
    // lib (explicit host param)
    const calls = [];
    const out = await shapes.requestCronForRoute(makeLibHost(calls), ROUTE, 'cron.manage', {
      action: 'list',
      profile: 'p1',
    });
    assert.equal(out, 'routed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'profile');
    assert.deepEqual(calls[0][1], ROUTE);
    assert.equal(calls[0][2], 'cron.manage');
    assert.deepEqual(calls[0][3], { action: 'list', profile: 't1' });

    // routines (imported host overload)
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => ({ ok: true }) });
    const out2 = await routines.requestCronForRoute(ROUTE, 'cron.manage', {
      action: 'list',
      profile: 'p1',
    });
    assert.deepEqual(out2, { ok: true });
    const logged = sdk.__calls().filter((c) => c.door === 'requestProfile');
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0].args[0], ROUTE);
    assert.equal(logged[0].args[1], 'cron.manage');
    assert.deepEqual(logged[0].args[2], { action: 'list', profile: 't1' });
  });

  it('routed call without params.profile rejects on both sides without touching any host', async () => {
    const calls = [];
    await assert.rejects(
      () => shapes.requestCronForRoute(makeLibHost(calls), ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(calls.length, 0);

    sdk.__reset();
    await assert.rejects(
      () => routines.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(sdk.__calls().length, 0);
  });

  it('null/unscoped target rejects by default on both sides', async () => {
    const calls = [];
    for (const target of [null, undefined, {}, { name: 'p1' }]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(makeLibHost(calls), target, 'cron.manage', { action: 'list' }),
        /without a resolved profile route/,
      );
    }
    assert.equal(calls.length, 0);

    sdk.__reset();
    for (const target of [null, undefined, {}, { name: 'p1' }]) {
      await assert.rejects(
        () => routines.requestCronForRoute(target, 'cron.manage', { action: 'list' }),
        /without a resolved profile route/,
      );
    }
    assert.equal(sdk.__calls().length, 0);
  });

  it('active-door opt-in rides host.request with the original params on both sides', async () => {
    const calls = [];
    const out = await shapes.requestCronForRoute(
      makeLibHost(calls),
      null,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowActiveDoor: true },
    );
    assert.equal(out, 'plain');
    assert.equal(calls[0][0], 'plain');
    assert.equal(calls[0][1], 'cron.manage');
    assert.deepEqual(calls[0][2], { action: 'list' });

    sdk.__reset();
    sdk.__setHost({ request: async (method, params) => ({ method, params }) });
    const out2 = await routines.requestCronForRoute(null, 'cron.manage', { action: 'list' }, undefined, {
      allowActiveDoor: true,
    });
    assert.deepEqual(out2, { method: 'cron.manage', params: { action: 'list' } });
    const logged = sdk.__calls().filter((c) => c.door === 'request');
    assert.equal(logged.length, 1);
    assert.equal(logged[0].args[0], 'cron.manage');
    assert.deepEqual(logged[0].args[1], { action: 'list' });
  });

  it('timeoutMs flows positionally (3-arg vs 4-arg) on both sides', async () => {
    const calls = [];
    const host = makeLibHost(calls);
    await shapes.requestCronForRoute(host, ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(calls[0].length, 4, 'no timeout -> host.requestProfile(route, method, scoped)');
    await shapes.requestCronForRoute(
      host,
      ROUTE,
      'cron.manage',
      { action: 'list', profile: 'p1' },
      50,
    );
    assert.equal(calls[1].length, 5, 'timeout -> host.requestProfile(route, method, scoped, timeoutMs)');
    assert.equal(calls[1][4], 50);
    await shapes.requestCronForRoute(host, null, 'cron.manage', { action: 'list' }, 75, {
      allowActiveDoor: true,
    });
    assert.equal(calls[2][0], 'plain');
    assert.equal(calls[2][3], 75);

    sdk.__reset();
    let seen = null;
    sdk.__setHost({
      requestProfile: async (...args) => {
        seen = args;
        return 'ok';
      },
    });
    await routines.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(seen.length, 3);
    await routines.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, 50);
    assert.equal(seen.length, 4);
    assert.equal(seen[3], 50);
  });

  it('invalid timeoutMs throws TypeError on both sides without touching any host', async () => {
    for (const bad of [-1, NaN, Infinity, -Infinity, '50', null, {}, []]) {
      const calls = [];
      await assert.rejects(
        () =>
          shapes.requestCronForRoute(makeLibHost(calls), ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, bad),
        TypeError,
        `lib timeoutMs ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(calls.length, 0);

      sdk.__reset();
      await assert.rejects(
        () => routines.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, bad),
        TypeError,
        `routines timeoutMs ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(sdk.__calls().length, 0);
    }
  });

  it('invalid options bag throws TypeError on both sides', async () => {
    for (const bad of [null, [], 'x', 42, { allowActiveDoor: 'yes' }, { allowUnscoped: 1 }]) {
      const calls = [];
      await assert.rejects(
        () =>
          shapes.requestCronForRoute(makeLibHost(calls), null, 'cron.manage', {}, undefined, bad),
        TypeError,
        `lib options ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(calls.length, 0);

      sdk.__reset();
      await assert.rejects(
        () => routines.requestCronForRoute(null, 'cron.manage', {}, undefined, bad),
        TypeError,
        `routines options ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(sdk.__calls().length, 0);
    }
    // truthy-but-not-true allowActiveDoor never opens the door
    for (const flag of [1, 'yes', {}]) {
      const calls = [];
      await assert.rejects(
        () =>
          shapes.requestCronForRoute(makeLibHost(calls), null, 'cron.manage', {}, undefined, {
            allowActiveDoor: flag,
          }),
        TypeError,
      );
      assert.equal(calls.length, 0);
      sdk.__reset();
      await assert.rejects(
        () =>
          routines.requestCronForRoute(null, 'cron.manage', {}, undefined, { allowActiveDoor: flag }),
        TypeError,
      );
      assert.equal(sdk.__calls().length, 0);
    }
  });

  it('allowUnscoped opt-in lets a routed call through without profile on both sides', async () => {
    const calls = [];
    const out = await shapes.requestCronForRoute(
      makeLibHost(calls),
      ROUTE,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowUnscoped: true },
    );
    assert.equal(out, 'routed');
    assert.deepEqual(calls[0][3], { action: 'list' });

    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => 'ok-unscoped' });
    const out2 = await routines.requestCronForRoute(
      ROUTE,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowUnscoped: true },
    );
    assert.equal(out2, 'ok-unscoped');
  });

  it('missing host door rejects instead of misdispatching (lib explicit-host side)', async () => {
    await assert.rejects(
      () =>
        shapes.requestCronForRoute({ request: async () => 'x' }, ROUTE, 'cron.manage', {
          action: 'list',
          profile: 'p1',
        }),
      /Cannot route/,
    );
    await assert.rejects(
      () =>
        shapes.requestCronForRoute({}, null, 'cron.manage', { action: 'list' }, undefined, {
          allowActiveDoor: true,
        }),
      /host\.request is not a function/,
    );
  });
});

describe('sync-semantics: assertTimeoutMs is exported and identical on both sides', () => {
  it('both modules export assertTimeoutMs (unified export decision)', () => {
    assert.equal(typeof shapes.assertTimeoutMs, 'function', 'lib must export assertTimeoutMs');
    assert.equal(typeof routines.assertTimeoutMs, 'function', 'routines must export assertTimeoutMs');
  });

  it('accepts undefined and non-negative finite numbers, rejects the rest', () => {
    for (const fn of [shapes.assertTimeoutMs, routines.assertTimeoutMs]) {
      assert.equal(fn(undefined), undefined);
      for (const ok of [0, 1, 50, 1.5]) assert.equal(fn(ok), undefined);
      for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, '50', null, {}, [], true]) {
        assert.throws(() => fn(bad), TypeError, `timeoutMs ${JSON.stringify(bad)} must throw`);
      }
    }
  });
});
