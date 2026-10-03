import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Formerly sync-semantics (lib ↔ routines.js mirror comparison): with the
// copy-identity sync removed, gateway behavior has a single source — the
// generated artifact (desktop/plugin.js) exercised through the stubbed
// SDK face. Every case below is the routed/active-door semantics the old
// two-sided suite pinned, kept against the shipped side.
register('./stubs/sdk-loader.mjs', import.meta.url);
const shapes = await import('../desktop/plugin.js');
const sdk = await import('./stubs/sdk-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

describe('gateway semantics: requestCronForRoute (single source: desktop/plugin.js)', () => {
  it('routed call rewrites profile to the backend target and returns the host value', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => ({ ok: true }) });
    const out = await shapes.requestCronForRoute(ROUTE, 'cron.manage', {
      action: 'list',
      profile: 'p1',
    });
    assert.deepEqual(out, { ok: true });
    const logged = sdk.__calls().filter((c) => c.door === 'requestProfile');
    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0].args[0], ROUTE);
    assert.equal(logged[0].args[1], 'cron.manage');
    assert.deepEqual(logged[0].args[2], { action: 'list', profile: 't1' });
  });

  it('routed call without params.profile rejects without touching any host door', async () => {
    sdk.__reset();
    await assert.rejects(
      () => shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(sdk.__calls().length, 0);
  });

  it('null/unscoped target rejects by default without touching any host door', async () => {
    sdk.__reset();
    for (const target of [null, undefined, {}, { name: 'p1' }]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(target, 'cron.manage', { action: 'list' }),
        /without a resolved profile route/,
      );
    }
    assert.equal(sdk.__calls().length, 0);
  });

  it('active-door opt-in rides host.request with the original params', async () => {
    sdk.__reset();
    sdk.__setHost({ request: async (method, params) => ({ method, params }) });
    const out = await shapes.requestCronForRoute(null, 'cron.manage', { action: 'list' }, undefined, {
      allowActiveDoor: true,
    });
    assert.deepEqual(out, { method: 'cron.manage', params: { action: 'list' } });
    const logged = sdk.__calls().filter((c) => c.door === 'request');
    assert.equal(logged.length, 1);
    assert.equal(logged[0].args[0], 'cron.manage');
    assert.deepEqual(logged[0].args[1], { action: 'list' });
  });

  it('timeoutMs flows positionally (3-arg vs 4-arg host calls)', async () => {
    sdk.__reset();
    let seen = null;
    sdk.__setHost({
      requestProfile: async (...args) => {
        seen = args;
        return 'ok';
      },
    });
    await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(seen.length, 3, 'no timeout -> host.requestProfile(route, method, scoped)');
    await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, 50);
    assert.equal(seen.length, 4, 'timeout -> host.requestProfile(route, method, scoped, timeoutMs)');
    assert.equal(seen[3], 50);

    sdk.__reset();
    let plain = null;
    sdk.__setHost({
      request: async (...args) => {
        plain = args;
        return 'plain';
      },
    });
    await shapes.requestCronForRoute(null, 'cron.manage', { action: 'list' }, 75, { allowActiveDoor: true });
    assert.equal(plain.length, 3, 'timeout -> host.request(method, params, timeoutMs)');
    assert.equal(plain[2], 75);
  });

  it("foreground user actions ride the 5th-arg { spawnPriority: 'foreground' } bag", async () => {
    sdk.__reset();
    let seen = null;
    sdk.__setHost({
      requestProfile: async (...args) => {
        seen = args;
        return 'ok';
      },
    });
    // no timeout: the undefined placeholder keeps the bag in 5th position
    await shapes.requestCronForRoute(
      ROUTE,
      'cron.manage',
      { action: 'pause', profile: 'p1' },
      undefined,
      { spawnPriority: 'foreground' },
    );
    assert.equal(seen.length, 5, 'foreground -> host.requestProfile(route, method, scoped, undefined, options)');
    assert.equal(seen[3], undefined, 'timeoutMs placeholder stays undefined when none was given');
    assert.deepEqual(seen[4], { spawnPriority: 'foreground' });

    // with a timeout the bag still lands 5th, after the positional deadline
    await shapes.requestCronForRoute(
      ROUTE,
      'cron.manage',
      { action: 'resume', profile: 'p1' },
      50,
      { spawnPriority: 'foreground' },
    );
    assert.equal(seen.length, 5);
    assert.equal(seen[3], 50, 'timeoutMs stays positional (4th arg)');
    assert.deepEqual(seen[4], { spawnPriority: 'foreground' });

    // explicit background is forwarded as-is (same position)
    await shapes.requestCronForRoute(
      ROUTE,
      'cron.manage',
      { action: 'list', profile: 'p1' },
      undefined,
      { spawnPriority: 'background' },
    );
    assert.deepEqual(seen[4], { spawnPriority: 'background' });

    // no spawnPriority: the background default keeps the pinned 3/4-arg shapes
    await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(seen.length, 3, 'background default -> host.requestProfile(route, method, scoped)');
    await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, 50);
    assert.equal(seen.length, 4, 'background default + timeout -> 4th arg is timeoutMs');
  });

  it('listRoutines (polling) keeps the background default: no 5th arg', async () => {
    sdk.__reset();
    let seen = null;
    sdk.__setHost({
      requestProfile: async (...args) => {
        seen = args;
        return 'ok';
      },
    });
    await shapes.listRoutines(ROUTE);
    assert.equal(seen.length, 3, 'polling must not ask for the interactive slot');
    assert.equal(seen[4], undefined);
  });

  it('invalid spawnPriority rejects before touching any host door', async () => {
    sdk.__reset();
    for (const bad of ['Foreground', 'urgent', 1, null, {}, []]) {
      await assert.rejects(
        () =>
          shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, undefined, {
            spawnPriority: bad,
          }),
        TypeError,
        `spawnPriority ${JSON.stringify(bad)} must throw TypeError`,
      );
    }
    assert.equal(sdk.__calls().length, 0);
    // absent is fine: undefined is simply the background default
    await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, undefined, {});
    assert.equal(sdk.__calls().length, 1);
  });

  it('spawnPriority on the active door rejects (host.request has no options bag)', async () => {
    sdk.__reset();
    sdk.__setHost({ request: async () => 'plain' });
    await assert.rejects(
      () =>
        shapes.requestCronForRoute(null, 'cron.manage', { action: 'list' }, undefined, {
          allowActiveDoor: true,
          spawnPriority: 'foreground',
        }),
      /spawnPriority requires a resolved profile route/,
    );
    assert.equal(sdk.__calls().length, 0, 'the unsupported intent must fail before dispatch');
    // without the priority the opt-in door still works as before
    const out = await shapes.requestCronForRoute(null, 'cron.manage', { action: 'list' }, undefined, {
      allowActiveDoor: true,
    });
    assert.equal(out, 'plain');
  });

  it('view user actions all request foreground (list polling stays background)', () => {
    const view = readFileSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx'), 'utf8');
    // comment lines carry prose mentions; only executable lines are counted
    const code = view
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const mutations = code.match(/requestCronForRoute\(/g) || [];
    const foreground = code.match(/spawnPriority:\s*'foreground'/g) || [];
    assert.equal(mutations.length, 3, 'pause/resume + create(add, pause) are the user actions');
    assert.equal(
      foreground.length,
      mutations.length,
      'every user action must ask for the interactive spawn slot',
    );
    // The list load rides the scoped query layer (issue #102): exactly one
    // fetch site in the view, delegating to the background list door. It
    // must never request the interactive slot: it is polling, not a user
    // action.
    const listLoadCalls = code.match(/fetchRoutinesForRoute\(/g) || [];
    assert.equal(listLoadCalls.length, 1, 'exactly one list load site');
    assert.equal(/fetchRoutinesForRoute\([^)]*spawnPriority/.test(code), false, 'polling stays background');
  });

  it('invalid timeoutMs throws TypeError without touching any host', async () => {
    sdk.__reset();
    for (const bad of [-1, NaN, Infinity, -Infinity, '50', null, {}, []]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list', profile: 'p1' }, bad),
        TypeError,
        `timeoutMs ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(sdk.__calls().length, 0);
    }
  });

  it('invalid options bag throws TypeError', async () => {
    sdk.__reset();
    for (const bad of [null, [], 'x', 42, { allowActiveDoor: 'yes' }, { allowUnscoped: 1 }]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(null, 'cron.manage', {}, undefined, bad),
        TypeError,
        `options ${JSON.stringify(bad)} must throw`,
      );
      assert.equal(sdk.__calls().length, 0);
    }
    // truthy-but-not-true allowActiveDoor never opens the door
    for (const flag of [1, 'yes', {}]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(null, 'cron.manage', {}, undefined, { allowActiveDoor: flag }),
        TypeError,
      );
      assert.equal(sdk.__calls().length, 0);
    }
  });

  it('allowUnscoped opt-in lets a routed call through without profile', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => 'ok-unscoped' });
    const out = await shapes.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list' }, undefined, {
      allowUnscoped: true,
    });
    assert.equal(out, 'ok-unscoped');
    const logged = sdk.__calls();
    assert.deepEqual(logged[0].args[2], { action: 'list' });
  });
});

describe('gateway semantics: assertTimeoutMs is exported and validated', () => {
  it('artifact exports assertTimeoutMs', () => {
    assert.equal(typeof shapes.assertTimeoutMs, 'function', 'plugin.js must export assertTimeoutMs');
  });

  it('accepts undefined and non-negative finite numbers, rejects the rest', () => {
    const fn = shapes.assertTimeoutMs;
    assert.equal(fn(undefined), undefined);
    for (const ok of [0, 1, 50, 1.5]) assert.equal(fn(ok), undefined);
    for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, '50', null, {}, [], true]) {
      assert.throws(() => fn(bad), TypeError, `timeoutMs ${JSON.stringify(bad)} must throw`);
    }
  });
});
