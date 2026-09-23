import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const installDoc = path.join(root, 'docs', 'INSTALL.md');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

function makeHost(log) {
  return {
    requestProfile: async (...args) => {
      log.push(['profile', ...args]);
      return 'routed';
    },
    request: async (...args) => {
      log.push(['plain', ...args]);
      return 'plain';
    },
  };
}

// P0 fail-closed: a profile-looking operation must never slide silently
// into the active gateway door, and a routed call must never drop its
// profile scope silently.
describe('fail-closed', () => {
  it('requestCronForRoute(null|unscoped) rejects by default', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const calls = [];
    const host = makeHost(calls);
    for (const target of [null, undefined, {}, { name: 'p1' }]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(host, target, 'cron.manage', { action: 'list' }),
        /without a resolved profile route/,
        `target ${JSON.stringify(target)} must reject`,
      );
    }
    assert.equal(calls.length, 0, 'no host door may be touched on reject');
  });

  it('requestCronForRoute opens the active door only with { allowActiveDoor: true }', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const calls = [];
    const host = makeHost(calls);
    const out = await shapes.requestCronForRoute(
      host,
      null,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowActiveDoor: true },
    );
    assert.equal(out, 'plain');
    assert.equal(calls[0][0], 'plain');
    assert.equal(calls[0][1], 'cron.manage');
    // timeoutMs still flows positionally ahead of options
    const out2 = await shapes.requestCronForRoute(
      host,
      null,
      'cron.manage',
      { action: 'list' },
      50,
      { allowActiveDoor: true },
    );
    assert.equal(out2, 'plain');
    // truthy-but-not-true must NOT open the door
    for (const flag of [1, 'yes', {}]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(host, null, 'cron.manage', {}, undefined, { allowActiveDoor: flag }),
        TypeError,
      );
    }
  });

  it('requestCronForRoute validates the options bag', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const host = makeHost([]);
    for (const bad of [null, [], 'x', 42]) {
      await assert.rejects(
        () => shapes.requestCronForRoute(host, null, 'cron.manage', {}, undefined, bad),
        TypeError,
        `options ${JSON.stringify(bad)} must throw TypeError`,
      );
    }
    await assert.rejects(
      () => shapes.requestCronForRoute(host, null, 'cron.manage', {}, undefined, { allowUnscoped: 'yes' }),
      TypeError,
    );
  });

  it('scopedCronParams throws when the route exists but params carries no profile', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
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
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
    const calls = [];
    const host = makeHost(calls);
    await assert.rejects(
      () => shapes.requestCronForRoute(host, ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(calls.length, 0);
    const out = await shapes.requestCronForRoute(host, ROUTE, 'cron.manage', { action: 'list', profile: 'p1' });
    assert.equal(out, 'routed');
    assert.deepEqual(calls[0][3], { action: 'list', profile: 't1' });
    // intentional unscoped routed call stays possible via opt-in
    const out2 = await shapes.requestCronForRoute(
      host,
      ROUTE,
      'cron.manage',
      { action: 'list' },
      undefined,
      { allowUnscoped: true },
    );
    assert.equal(out2, 'routed');
  });

  it('uncloneable payload surfaces a domain TypeError (not the raw DOMException)', async () => {
    const shapes = await import('../desktop/lib/cron-shapes.mjs');
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

  it('routines.js mirror is fail-closed too (source pin)', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /allowActiveDoor/, 'mirror must gate the active door');
    assert.match(src, /without a resolved profile route/, 'mirror must carry the fail-closed error');
    assert.match(src, /allowUnscoped/, 'mirror must support the unscoped opt-in');
    assert.match(src, /requires a route with profile\/targetProfile/, 'listRoutines must require scope');
    assert.match(src, /function assertRoutingOptions/, 'mirror must validate the options bag');
  });

  it('docs pin the fail-closed opt-ins', () => {
    const doc = readFileSync(installDoc, 'utf8');
    assert.match(doc, /allowActiveDoor/, 'docs must document the active-door opt-in');
    assert.match(doc, /allowUnscoped/, 'docs must document the unscoped opt-in');
  });
});
