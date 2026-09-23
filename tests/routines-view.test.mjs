import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so desktop/routines.js can be
// exercised behaviorally under node:test (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

const routines = await import('../desktop/routines.js');
const shapes = await import('../desktop/lib/cron-shapes.mjs');
const sdk = await import('./stubs/sdk-stub.mjs');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const ROUTE_B = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function extractSyncRegion(src, name, label) {
  const beginNeedle = `// @begin-sync ${name}`;
  const endNeedle = `// @end-sync ${name}`;
  const beginIdx = src.indexOf(beginNeedle);
  const endIdx = src.indexOf(endNeedle);
  assert.notEqual(beginIdx, -1, `${label}: missing ${beginNeedle}`);
  assert.notEqual(endIdx, -1, `${label}: missing ${endNeedle}`);
  assert.ok(endIdx > beginIdx, `${label}: ${name} end precedes begin`);
  const innerStart = src.indexOf('\n', beginIdx) + 1;
  const endLineStart = src.slice(0, endIdx).lastIndexOf('\n') + 1;
  return src.slice(innerStart, endLineStart);
}

// Walk a jsx-stub tree ({ type, props }) collecting every node.
function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    collect(node.props ? node.props.children : null, out);
    return out;
  }
  return out;
}

function texts(node) {
  return collect(node)
    .map((n) => n.props.children)
    .flat(5)
    .filter((c) => typeof c === 'string');
}

describe('routines-view loading/empty/error/retry', () => {
  it('starts in routes-loading with empty collections', () => {
    const state = routines.initialRoutinesState();
    assert.equal(state.status, 'routes-loading');
    assert.deepEqual(state.routes, []);
    assert.deepEqual(state.jobs, []);
    assert.equal(state.selectedKey, null);
  });

  it('routes-loaded selects the first usable route and enters list-loading', () => {
    const state = reduce([{ type: 'routes-loaded', routes: [ROUTE, ROUTE_B] }]);
    assert.equal(state.status, 'list-loading');
    assert.equal(state.selectedKey, 'c1::p1');
    assert.deepEqual(state.jobs, []);
  });

  it('routes-loaded with zero routes lands on ready-empty (no invented route)', () => {
    const state = reduce([{ type: 'routes-loaded', routes: [] }]);
    assert.equal(state.status, 'ready');
    assert.deepEqual(state.jobs, []);
    assert.equal(state.selectedKey, null);
  });

  it('routes-loaded skips unusable entries instead of failing the view', () => {
    const state = reduce([{ type: 'routes-loaded', routes: [{ nope: true }, ROUTE_B] }]);
    assert.equal(state.status, 'list-loading');
    assert.equal(state.selectedKey, 'c2::p2');
  });

  it('routes-loaded with only unusable entries lands on ready-empty', () => {
    const state = reduce([{ type: 'routes-loaded', routes: [{ nope: true }] }]);
    assert.equal(state.status, 'ready');
    assert.equal(state.selectedKey, null);
    assert.deepEqual(state.jobs, []);
  });

  it('list-loaded normalizes envelope, bare array and garbage', () => {
    const base = [{ type: 'routes-loaded', routes: [ROUTE] }];
    const fromEnvelope = reduce([...base, { type: 'list-loaded', jobs: { jobs: [{ name: 'j1' }] } }]);
    assert.equal(fromEnvelope.status, 'ready');
    assert.deepEqual(fromEnvelope.jobs, [{ name: 'j1' }]);
    const fromArray = reduce([...base, { type: 'list-loaded', jobs: [{ name: 'j2' }] }]);
    assert.deepEqual(fromArray.jobs, [{ name: 'j2' }]);
    for (const bad of [null, undefined, {}, 'nope', 42]) {
      const s = reduce([...base, { type: 'list-loaded', jobs: bad }]);
      assert.equal(s.status, 'ready');
      assert.deepEqual(s.jobs, [], `payload ${JSON.stringify(bad)} must normalize to []`);
    }
  });

  it('list-error keeps the route and retry-list re-enters loading', () => {
    let state = reduce([{ type: 'routes-loaded', routes: [ROUTE] }, { type: 'list-error', error: 'boom' }]);
    assert.equal(state.status, 'list-error');
    assert.equal(state.error, 'boom');
    assert.equal(state.selectedKey, 'c1::p1');
    state = routines.routinesViewReducer(state, { type: 'retry-list' });
    assert.equal(state.status, 'list-loading');
    assert.equal(state.error, null);
    assert.equal(state.selectedKey, 'c1::p1');
  });

  it('routes-error surfaces the message and retry-routes resets', () => {
    let state = reduce([{ type: 'routes-error', error: 'door shut' }]);
    assert.equal(state.status, 'routes-error');
    assert.equal(state.error, 'door shut');
    state = routines.routinesViewReducer(state, { type: 'retry-routes' });
    assert.equal(state.status, 'routes-loading');
    assert.equal(state.error, null);
  });

  it('route-changed switches selection and clears stale rows', () => {
    let state = reduce([
      { type: 'routes-loaded', routes: [ROUTE, ROUTE_B] },
      { type: 'list-loaded', jobs: [{ name: 'j1' }] },
    ]);
    assert.equal(state.jobs.length, 1);
    state = routines.routinesViewReducer(state, { type: 'route-changed', key: 'c2::p2' });
    assert.equal(state.status, 'list-loading');
    assert.equal(state.selectedKey, 'c2::p2');
    assert.deepEqual(state.jobs, []);
  });

  it('unknown events leave state untouched', () => {
    const beforeState = reduce([{ type: 'routes-loaded', routes: [ROUTE] }]);
    assert.equal(routines.routinesViewReducer(beforeState, { type: 'nope' }), beforeState);
    assert.equal(routines.routinesViewReducer(beforeState, null), beforeState);
  });
});

describe('routines-view create/pause/resume/remove via builders', () => {
  it('buildListParams pins the list envelope with the backend profile', () => {
    assert.deepEqual(routines.buildListParams(ROUTE), {
      action: 'list',
      include_disabled: true,
      profile: 't1',
    });
    assert.throws(() => routines.buildListParams(null), /resolved profile route/);
    assert.throws(() => routines.buildListParams({}), /resolved profile route/);
  });

  it('buildAddParams matches the lib addJob plus scope', () => {
    const input = { job_id: '  j1  ', schedule: '  0 9 * * MON  ', payload: { k: 'v' } };
    assert.deepEqual(
      routines.buildAddParams(ROUTE, input),
      { ...shapes.addJob(input), profile: 't1' },
    );
    assert.deepEqual(routines.buildAddParams(ROUTE, { job_id: 'j1', schedule: '* * * * *' }), {
      action: 'add',
      name: 'j1',
      schedule: '* * * * *',
      payload: {},
      profile: 't1',
    });
  });

  it('buildPause/Resume/Remove match the lib builders plus scope', () => {
    assert.deepEqual(routines.buildPauseParams(ROUTE, 'j1'), { ...shapes.pauseJob('j1'), profile: 't1' });
    assert.deepEqual(routines.buildResumeParams(ROUTE, 'j1'), { ...shapes.resumeJob('j1'), profile: 't1' });
    assert.deepEqual(routines.buildRemoveParams(ROUTE, 'j1'), { ...shapes.removeJob('j1'), profile: 't1' });
  });

  it('builder validation rejects bad input with TypeError before any host call', () => {
    sdk.__reset();
    for (const bad of ['', '   ', 'a b', 'x'.repeat(129), 42, null, undefined]) {
      assert.throws(() => routines.buildPauseParams(ROUTE, bad), TypeError);
      assert.throws(() => routines.buildResumeParams(ROUTE, bad), TypeError);
      assert.throws(() => routines.buildRemoveParams(ROUTE, bad), TypeError);
      assert.throws(() => routines.buildAddParams(ROUTE, { job_id: bad, schedule: '* * * * *' }), TypeError);
    }
    for (const badSchedule of ['', '   ', 42, null, undefined, 'x'.repeat(257)]) {
      assert.throws(
        () => routines.buildAddParams(ROUTE, { job_id: 'j1', schedule: badSchedule }),
        TypeError,
      );
    }
    assert.equal(sdk.__calls().length, 0, 'validation must not touch the host');
  });

  it('view builders stay byte-identical to the canonical lib copy (sync region)', () => {
    const a = readFileSync(routinesPath, 'utf8');
    const b = readFileSync(libPath, 'utf8');
    const fromRoutines = extractSyncRegion(a, 'cron-shapes-builders', 'routines.js');
    const fromLib = extractSyncRegion(b, 'cron-shapes-builders', 'cron-shapes.mjs');
    const hash = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
    assert.equal(hash(fromRoutines), hash(fromLib), 'builders region hash mismatch');
    assert.equal(fromRoutines, fromLib, 'builders region must be copy-identical');
  });
});

describe('routines-view delete confirmation', () => {
  it('confirm-open/close tracks the pending removal without mutating rows', () => {
    const jobs = [{ name: 'j1' }, { name: 'j2' }];
    let state = reduce([
      { type: 'routes-loaded', routes: [ROUTE] },
      { type: 'list-loaded', jobs },
      { type: 'confirm-open', name: 'j1' },
    ]);
    assert.equal(state.confirmName, 'j1');
    assert.deepEqual(state.jobs, jobs);
    state = routines.routinesViewReducer(state, { type: 'confirm-close' });
    assert.equal(state.confirmName, null);
    assert.deepEqual(state.jobs, jobs);
  });

  it('list reload clears a stale confirmation', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE] },
      { type: 'list-loaded', jobs: [{ name: 'j1' }] },
      { type: 'confirm-open', name: 'j1' },
      { type: 'list-loaded', jobs: [{ name: 'j1' }] },
    ]);
    assert.equal(state.confirmName, null);
  });

  it('source renders a two-step remove (ask, then confirm/cancel)', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /confirm-open/, 'remove must open a confirmation first');
    assert.match(src, /Confirm remove/, 'confirmation must name the action');
    assert.match(src, /Cancel/, 'confirmation must offer cancel');
    assert.match(src, /Confirm removal of/, 'confirmation group must be labelled');
  });
});

describe('routines-view optimism policy', () => {
  it('only pause and resume are optimistic', () => {
    assert.equal(routines.isSafeOptimistic('pause'), true);
    assert.equal(routines.isSafeOptimistic('resume'), true);
    for (const unsafe of ['add', 'remove', 'list', 'create', undefined, null, '']) {
      assert.equal(routines.isSafeOptimistic(unsafe), false, `${String(unsafe)} must not be optimistic`);
    }
  });

  it('optimistic pause flips the flag and rollback restores the snapshot', () => {
    const jobs = [
      { name: 'j1', schedule: '* * * * *', disabled: false },
      { name: 'j2', schedule: '0 9 * * MON', disabled: true },
    ];
    let state = reduce([
      { type: 'routes-loaded', routes: [ROUTE] },
      { type: 'list-loaded', jobs },
      { type: 'optimistic-pause', name: 'j1' },
    ]);
    assert.equal(state.jobs[0].disabled, true);
    assert.equal(state.jobs[1].disabled, true);
    assert.deepEqual(state.snapshot, jobs);
    state = routines.routinesViewReducer(state, { type: 'optimistic-rollback' });
    assert.deepEqual(state.jobs, jobs);
    assert.equal(state.snapshot, null);
  });

  it('optimistic resume clears the flag and rollback restores it', () => {
    const jobs = [{ name: 'j1', schedule: '* * * * *', disabled: true, enabled: false }];
    let state = reduce([
      { type: 'routes-loaded', routes: [ROUTE] },
      { type: 'list-loaded', jobs },
      { type: 'optimistic-resume', name: 'j1' },
    ]);
    assert.equal(state.jobs[0].disabled, false);
    state = routines.routinesViewReducer(state, { type: 'optimistic-rollback' });
    assert.deepEqual(state.jobs, jobs);
  });

  it('rollback without a snapshot keeps current rows', () => {
    const jobs = [{ name: 'j1' }];
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE] },
      { type: 'list-loaded', jobs },
      { type: 'optimistic-rollback' },
    ]);
    assert.deepEqual(state.jobs, jobs);
  });

  it('visibleJobs filters active/paused without mutating', () => {
    const jobs = [{ name: 'a' }, { name: 'b', disabled: true }, { name: 'c', enabled: false }];
    assert.deepEqual(
      routines.visibleJobs(jobs, 'active').map((j) => j.name),
      ['a'],
    );
    assert.deepEqual(
      routines.visibleJobs(jobs, 'paused').map((j) => j.name),
      ['b', 'c'],
    );
    assert.deepEqual(
      routines.visibleJobs(jobs, 'all').map((j) => j.name),
      ['a', 'b', 'c'],
    );
    assert.deepEqual(jobs.map((j) => j.name), ['a', 'b', 'c']);
  });
});

describe('routines-view fail-closed dispatch', () => {
  it('listRoutines rides requestProfile with scoped params', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => ({ jobs: [{ name: 'j1' }] }) });
    const out = await routines.listRoutines(ROUTE);
    assert.deepEqual(out, { jobs: [{ name: 'j1' }] });
    const calls = sdk.__calls().filter((c) => c.door === 'requestProfile');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[1], 'cron.manage');
    assert.deepEqual(calls[0].args[2], { action: 'list', include_disabled: true, profile: 't1' });
  });

  it('listRoutines(null|unscoped) rejects without touching any host door', async () => {
    sdk.__reset();
    for (const target of [null, undefined, {}, { profile: 'p1' }]) {
      await assert.rejects(() => routines.listRoutines(target), /resolved profile route/);
    }
    assert.equal(sdk.__calls().length, 0);
  });

  it('requestCronForRoute mirror rejects the active door by default', async () => {
    sdk.__reset();
    await assert.rejects(
      () => routines.requestCronForRoute(null, 'cron.manage', { action: 'list' }),
      /without a resolved profile route/,
    );
    await assert.rejects(
      () => routines.requestCronForRoute(ROUTE, 'cron.manage', { action: 'list' }),
      /requires params\.profile/,
    );
    assert.equal(sdk.__calls().length, 0);
  });

  it('the active-door opt-in lives only in the fail-closed router', () => {
    const src = readFileSync(routinesPath, 'utf8');
    const total = src.split('allowActiveDoor: true').length - 1;
    assert.equal(total, 2, 'exactly the two pre-existing router occurrences expected');
    const viewStart = src.indexOf('RoutinesView: functional page');
    const viewEnd = src.indexOf('// Route descriptor for one desktop profile connection.');
    assert.notEqual(viewStart, -1);
    assert.notEqual(viewEnd, -1);
    assert.ok(viewEnd > viewStart);
    const viewSide = src.slice(viewStart, viewEnd).split('allowActiveDoor: true').length - 1;
    assert.equal(viewSide, 0, 'the view block must never opt into the active door');
  });

  it('wrapHostError keeps the message and cause, never a raw stack', () => {
    const cause = new Error('backend says no');
    cause.stack = 'Error: backend says no\n    at hidden (secret.js:1:1)';
    const wrapped = routines.wrapHostError(cause, 'failed to load routines');
    assert.match(wrapped.message, /^failed to load routines: backend says no$/);
    assert.equal(wrapped.cause, cause);
    assert.equal(wrapped.message.includes('secret.js'), false);
    const fromString = routines.wrapHostError('plain failure', 'ctx');
    assert.equal(fromString.message, 'ctx: plain failure');
    const long = routines.wrapHostError(new Error('x'.repeat(500)), 'ctx');
    assert.ok(long.message.length <= 305);
  });
});

describe('routines-view render branches', () => {
  function paint(state) {
    const noop = () => {};
    reactStub.__presetStates([[state, noop], ['', noop], ['', noop], [0, noop]]);
    return routines.plugin.component();
  }

  function readyWith(jobs, extra = {}) {
    return reduce([
      { type: 'routes-loaded', routes: [ROUTE, ROUTE_B] },
      { type: 'list-loaded', jobs },
      ...(extra.events || []),
    ]);
  }

  it('ready list renders rows with badges and row actions', () => {
    const tree = paint(readyWith([{ name: 'j1', schedule: '* * * * *' }, { name: 'j2', schedule: '0 9 * * MON', disabled: true }]));
    const nodes = collect(tree);
    const list = nodes.find((n) => n.type === 'ul');
    assert.ok(list, 'ul required');
    const items = nodes.filter((n) => n.type === 'li');
    assert.equal(items.length, 2);
    const all = texts(tree).join(' | ');
    assert.match(all, /j1/);
    assert.match(all, /Active/);
    assert.match(all, /Paused/);
    const buttons = nodes.filter((n) => n.type === 'button').map((n) => n.props.children);
    assert.ok(buttons.includes('Pause'));
    assert.ok(buttons.includes('Resume'));
    assert.ok(buttons.includes('Remove'));
    assert.ok(buttons.includes('Create routine'));
  });

  it('filter nav marks the current filter and filters rows', () => {
    const state = {
      ...readyWith([{ name: 'a' }, { name: 'b', disabled: true }]),
      filter: 'paused',
    };
    const tree = paint(state);
    const nodes = collect(tree);
    const nav = nodes.find((n) => n.type === 'nav');
    assert.ok(nav, 'filter nav required');
    const current = nodes.filter((n) => n.type === 'button' && n.props['aria-current'] === 'true');
    assert.equal(current.length, 1);
    assert.equal(current[0].props.children, 'Paused');
    const items = nodes.filter((n) => n.type === 'li');
    assert.equal(items.length, 1);
    assert.ok(texts(tree).join(' ').includes('b'));
  });

  it('confirm state renders the two-step removal group', () => {
    const tree = paint(readyWith([{ name: 'j1' }], { events: [{ type: 'confirm-open', name: 'j1' }] }));
    const nodes = collect(tree);
    const group = nodes.find((n) => n.props && n.props.role === 'group');
    assert.ok(group, 'confirm group required');
    assert.match(String(group.props['aria-label']), /Confirm removal of j1/);
    const buttons = nodes.filter((n) => n.type === 'button').map((n) => n.props.children);
    assert.ok(buttons.includes('Confirm remove'));
    assert.ok(buttons.includes('Cancel'));
    assert.equal(buttons.includes('Pause'), false, 'row actions hide while confirming');
  });

  it('error states render message plus retry', () => {
    const listErr = paint(reduce([{ type: 'routes-loaded', routes: [ROUTE] }, { type: 'list-error', error: 'ctx: backend says no' }]));
    let nodes = collect(listErr);
    assert.ok(nodes.some((n) => n.props && n.props.role === 'alert'));
    assert.ok(texts(listErr).join(' ').includes('backend says no'));
    assert.ok(nodes.filter((n) => n.type === 'button').map((n) => n.props.children).includes('Retry'));
    const routesErr = paint(reduce([{ type: 'routes-error', error: 'ctx: door shut' }]));
    nodes = collect(routesErr);
    assert.ok(nodes.some((n) => n.props && n.props.role === 'alert'));
    assert.ok(texts(routesErr).join(' ').includes('door shut'));
  });

  it('empty list renders the empty state plus the create form', () => {
    const tree = paint(readyWith([]));
    const all = texts(tree).join(' ');
    assert.ok(all.includes('No routines yet.'));
    const nodes = collect(tree);
    assert.ok(nodes.some((n) => n.type === 'form'), 'create form stays visible when empty');
    assert.ok(nodes.some((n) => n.type === 'select'), 'profile selector stays visible');
  });

  it('profile selector lists every usable route', () => {
    const tree = paint(readyWith([{ name: 'j1' }]));
    const nodes = collect(tree);
    const select = nodes.find((n) => n.type === 'select');
    assert.ok(select);
    const options = nodes.filter((n) => n.type === 'option').map((n) => n.props.value);
    assert.deepEqual(options, ['c1::p1', 'c2::p2']);
  });
});

describe('routines-view registration and render', () => {
  it('registers exactly one routes contribution plus the sidebar row', () => {
    const items = [];
    routines.register({ register: (c) => items.push(c) });
    const routes = items.filter((c) => c.area === 'routes');
    assert.equal(routes.length, 1, 'a single ROUTES_AREA render means no double-mount');
    assert.equal(routes[0].id, 'routines');
    assert.equal(routes[0].data.path, '/routines');
    assert.equal(typeof routes[0].render, 'function');
    const nav = items.filter((c) => c.area === 'sidebar.nav');
    assert.equal(nav.length, 1);
    assert.equal(nav[0].id, 'sidebar-nav');
    assert.equal(nav[0].data.label, 'Routines');
    assert.equal(nav[0].data.path, '/routines');
  });

  it('definePlugin keeps component metadata without a second route', () => {
    assert.equal(routines.plugin.id, 'hermes-routines');
    assert.equal(routines.plugin.version, '0.1.0');
    assert.equal(typeof routines.plugin.component, 'function');
    assert.equal(typeof routines.plugin.register, 'function');
    assert.equal(routines.default, routines.plugin);
  });

  it('initial paint renders landmark, heading and a polite live region', () => {
    const tree = routines.plugin.component();
    assert.equal(tree.type, 'section');
    assert.equal(tree.props.id, 'hermes-routines-root');
    assert.equal(tree.props['aria-labelledby'], 'hermes-routines-heading');
    const nodes = collect(tree);
    const heading = nodes.find((n) => n.type === 'h2');
    assert.ok(heading, 'heading required');
    assert.equal(heading.props.id, 'hermes-routines-heading');
    const live = nodes.find((n) => n.props && n.props.role === 'status');
    assert.ok(live, 'live region required');
    assert.equal(live.props['aria-live'], 'polite');
    assert.ok(texts(tree).some((t) => t.includes('Loading profile routes.')));
  });

  it('source wires the a11y contract end to end', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /aria-labelledby.*hermes-routines-heading/, 'landmark labelled by the heading');
    assert.match(src, /aria-live.*polite/, 'polite live region for updates');
    assert.match(src, /aria-current/, 'current marker on the in-view filter nav');
    assert.match(src, /tabIndex.*-1/, 'programmatic focus targets');
    assert.match(src, /:focus-visible/, 'visible focus ring');
    assert.match(src, /htmlFor.*hermes-routines-profile/, 'labelled profile selector');
    assert.match(src, /role.*alert/, 'assertive error boxes');
    assert.match(src, /\.focus\(\)/, 'managed focus after delete and retry');
    assert.match(src, /jsx\('nav'/, 'in-view filter navigation');
    assert.match(src, /jsx\('ul'/, 'routine list');
    assert.match(src, /jsx\('select'/, 'native keyboard-operable selector');
  });
});
