import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) can be exercised behaviorally under node:test
// (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const routines = await import('../desktop/plugin.js');
// Single bundled source: the builders live in the artifact itself.
const shapes = routines;
const sdk = await import('./stubs/sdk-stub.mjs');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const ROUTE_B = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loaded(routes, profile = 'p1', connectionId = 'c1') {
  return { type: 'routes-loaded', routes, profile, connectionId };
}

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

// Render entry: exactly the ROUTES_AREA contribution the descriptor
// registers (nothing renders the descriptor a second time). The jsx-stub
// returns an element — unwrap the top-level component so paint() sees the
// evaluated tree (hooks run here, fed by reactStub.__presetStates and the
// sdk-stub active identity).
function renderView() {
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const routes = items.filter((c) => c.area === 'routes');
  assert.equal(routes.length, 1, 'a single ROUTES_AREA render means no double-mount');
  assert.equal(typeof routes[0].render, 'function');
  let tree = routes[0].render();
  if (tree && typeof tree === 'object' && typeof tree.type === 'function') {
    tree = tree.type(tree.props);
  }
  return tree;
}

// Walk a jsx-stub tree ({ type, props }) collecting every node. Function
// nodes are child components: the stub renders one level, so expand them
// by calling the component (pure in this view layer — page-level state
// hooks live only in RoutinesPage, already unwrapped by renderView/paint;
// RoutineList expansion state defaults with an empty preset queue).
function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    if (typeof node.type === 'function') {
      collect(node.type(node.props), out);
    } else {
      collect(node.props ? node.props.children : null, out);
    }
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

describe('routines-view active-profile binding', () => {
  it('starts in routes-loading with empty collections', () => {
    const state = routines.initialRoutinesState();
    assert.equal(state.status, 'routes-loading');
    assert.deepEqual(state.routes, []);
    assert.deepEqual(state.jobs, []);
    assert.equal(state.activeKey, null);
  });

  it('routes-loaded resolves the exact active route and enters list-loading', () => {
    const state = reduce([loaded([ROUTE, ROUTE_B], 'p1', 'c1')]);
    assert.equal(state.status, 'list-loading');
    assert.equal(state.activeKey, 'c1::p1');
    assert.equal(state.activeProfile, 'p1');
    assert.equal(state.activeConnectionId, 'c1');
    assert.deepEqual(state.jobs, []);
  });

  it('routes-loaded is connection-aware: same profile on another connection resolves there', () => {
    const other = { connectionId: 'c9', mode: 'remote', profile: 'p1', targetProfile: 'p1' };
    const state = reduce([loaded([ROUTE, other], 'p1', 'c9')]);
    assert.equal(state.status, 'list-loading');
    assert.equal(state.activeKey, 'c9::p1');
  });

  it('routes-loaded with zero routes lands on route-unavailable (no invented route)', () => {
    const state = reduce([loaded([], 'p1', 'c1')]);
    assert.equal(state.status, 'route-unavailable');
    assert.equal(state.activeKey, null);
    assert.deepEqual(state.jobs, []);
  });

  it('routes-loaded with an unresolvable active identity lands on route-unavailable', () => {
    const state = reduce([loaded([ROUTE, ROUTE_B], 'ghost', 'c1')]);
    assert.equal(state.status, 'route-unavailable');
    assert.equal(state.activeKey, null);
    assert.deepEqual(state.jobs, [], 'no other profile rows may stand in');
  });

  it('routes-loaded with null connectionId fails closed', () => {
    const state = reduce([loaded([ROUTE], 'p1', null)]);
    assert.equal(state.status, 'route-unavailable');
    assert.equal(state.activeKey, null);
  });

  it('routes-loaded skips unusable entries instead of failing the view', () => {
    const state = reduce([loaded([{ nope: true }, ROUTE_B], 'p2', 'c2')]);
    assert.equal(state.status, 'list-loading');
    assert.equal(state.activeKey, 'c2::p2');
  });

  it('active-changed follows the Desktop switch and clears stale rows', () => {
    let state = reduce([
      loaded([ROUTE, ROUTE_B], 'p1', 'c1'),
      { type: 'list-loaded', jobs: [{ name: 'j1' }], key: 'c1::p1' },
    ]);
    assert.equal(state.jobs.length, 1);
    state = routines.routinesViewReducer(state, { type: 'active-changed', profile: 'p2', connectionId: 'c2' });
    assert.equal(state.status, 'list-loading');
    assert.equal(state.activeKey, 'c2::p2');
    assert.deepEqual(state.jobs, [], 'previous profile rows must not read as current');
  });

  it('active-changed to an unresolvable identity lands on route-unavailable with cleared rows', () => {
    let state = reduce([
      loaded([ROUTE, ROUTE_B], 'p1', 'c1'),
      { type: 'list-loaded', jobs: [{ name: 'j1' }], key: 'c1::p1' },
    ]);
    state = routines.routinesViewReducer(state, { type: 'active-changed', profile: 'ghost', connectionId: 'c1' });
    assert.equal(state.status, 'route-unavailable');
    assert.equal(state.activeKey, null);
    assert.deepEqual(state.jobs, []);
  });

  it('active-changed with the same identity is a no-op', () => {
    const before = reduce([loaded([ROUTE], 'p1', 'c1')]);
    const after = routines.routinesViewReducer(before, { type: 'active-changed', profile: 'p1', connectionId: 'c1' });
    assert.equal(after, before);
  });

  it('stale list responses cannot contaminate the new view (race guard)', () => {
    let state = reduce([loaded([ROUTE, ROUTE_B], 'p1', 'c1')]);
    state = routines.routinesViewReducer(state, { type: 'active-changed', profile: 'p2', connectionId: 'c2' });
    assert.equal(state.activeKey, 'c2::p2');
    // Late arrival from profile A carries A's key and is ignored.
    const stale = routines.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [{ name: 'from-A' }],
      key: 'c1::p1',
    });
    assert.equal(stale, state);
    assert.deepEqual(stale.jobs, []);
    const staleErr = routines.routinesViewReducer(state, {
      type: 'list-error',
      error: 'A failed late',
      key: 'c1::p1',
    });
    assert.equal(staleErr, state);
    // The current key still lands.
    const fresh = routines.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [{ name: 'from-B' }],
      key: 'c2::p2',
    });
    assert.equal(fresh.status, 'ready');
    assert.deepEqual(fresh.jobs, [{ name: 'from-B' }]);
  });

  it('list-loaded normalizes envelope, bare array and garbage', () => {
    const base = [loaded([ROUTE], 'p1', 'c1')];
    const fromEnvelope = reduce([...base, { type: 'list-loaded', jobs: { jobs: [{ name: 'j1' }] }, key: 'c1::p1' }]);
    assert.equal(fromEnvelope.status, 'ready');
    assert.deepEqual(fromEnvelope.jobs, [{ name: 'j1' }]);
    const fromArray = reduce([...base, { type: 'list-loaded', jobs: [{ name: 'j2' }], key: 'c1::p1' }]);
    assert.deepEqual(fromArray.jobs, [{ name: 'j2' }]);
    for (const bad of [null, undefined, {}, 'nope', 42]) {
      const s = reduce([...base, { type: 'list-loaded', jobs: bad, key: 'c1::p1' }]);
      assert.equal(s.status, 'ready');
      assert.deepEqual(s.jobs, [], `payload ${JSON.stringify(bad)} must normalize to []`);
    }
  });

  it('list-error keeps the route key and retry-list re-enters loading', () => {
    let state = reduce([loaded([ROUTE], 'p1', 'c1'), { type: 'list-error', error: 'boom', key: 'c1::p1' }]);
    assert.equal(state.status, 'list-error');
    assert.equal(state.error, 'boom');
    assert.equal(state.activeKey, 'c1::p1');
    state = routines.routinesViewReducer(state, { type: 'retry-list' });
    assert.equal(state.status, 'list-loading');
    assert.equal(state.error, null);
    assert.equal(state.activeKey, 'c1::p1');
  });

  it('routes-error surfaces the message and retry-routes resets', () => {
    let state = reduce([{ type: 'routes-error', error: 'door shut' }]);
    assert.equal(state.status, 'routes-error');
    assert.equal(state.error, 'door shut');
    state = routines.routinesViewReducer(state, { type: 'retry-routes' });
    assert.equal(state.status, 'routes-loading');
    assert.equal(state.error, null);
  });

  it('unknown events leave state untouched', () => {
    const beforeState = reduce([loaded([ROUTE], 'p1', 'c1')]);
    assert.equal(routines.routinesViewReducer(beforeState, { type: 'nope' }), beforeState);
    assert.equal(routines.routinesViewReducer(beforeState, null), beforeState);
  });
});

describe('routines-view pause/resume via builders', () => {
  it('buildListParams pins the list envelope with the backend profile', () => {
    assert.deepEqual(routines.buildListParams(ROUTE), {
      action: 'list',
      include_disabled: true,
      profile: 't1',
    });
    assert.throws(() => routines.buildListParams(null), /resolved profile route/);
    assert.throws(() => routines.buildListParams({}), /resolved profile route/);
  });

  it('buildPause/Resume match the builders plus scope', () => {
    assert.deepEqual(routines.buildPauseParams(ROUTE, 'j1'), { ...shapes.pauseJob('j1'), profile: 't1' });
    assert.deepEqual(routines.buildResumeParams(ROUTE, 'j1'), { ...shapes.resumeJob('j1'), profile: 't1' });
  });

  it('builder validation rejects bad input with TypeError before any host call', () => {
    sdk.__reset();
    for (const bad of ['', '   ', 'a b', 'x'.repeat(129), 42, null, undefined]) {
      assert.throws(() => routines.buildPauseParams(ROUTE, bad), TypeError);
      assert.throws(() => routines.buildResumeParams(ROUTE, bad), TypeError);
    }
    assert.equal(sdk.__calls().length, 0, 'validation must not touch the host');
  });

  it('active route helper resolves connection-qualified identity', () => {
    assert.equal(typeof routines.resolveActiveRoute, 'function');
    assert.equal(typeof routines.activeRouteKey, 'function');
    assert.deepEqual(routines.resolveActiveRoute([ROUTE, ROUTE_B], 'p2', 'c2'), ROUTE_B);
    assert.equal(routines.resolveActiveRoute([ROUTE, ROUTE_B], 'p1', 'c2'), null);
    assert.equal(routines.resolveActiveRoute([ROUTE], 'p1', null), null);
    assert.equal(routines.activeRouteKey('p1', 'c1'), 'c1::p1');
    assert.equal(routines.activeRouteKey('', 'c1'), null);
  });
});

describe('routines-view presentation (Crew port)', () => {
  it('humanizes cron schedules instead of showing raw cron', () => {
    assert.equal(routines.describeSchedule('0 7 * * 2'), 'Every Tuesday at 07:00');
    assert.equal(routines.describeSchedule('0 9 * * *'), 'Every day at 09:00');
    assert.equal(routines.describeSchedule('every 5m'), 'Every 5 minutes');
    assert.equal(routines.describeSchedule('0 9 * * MON'), '0 9 * * MON', 'unknown tokens stay verbatim');
  });

  it('humanizer fails closed on cron shapes that cannot be proven equivalent (issue #3)', () => {
    // Non-uniform minute step: */45 fires at :00 and :45 (15-minute gap).
    assert.equal(routines.describeSchedule('*/45 * * * *'), '*/45 * * * *');
    // Non-uniform hour step: */5 fires at 00,05,10,15,20 (4-hour gap to midnight).
    // It must never claim a uniform five-hour interval.
    assert.notEqual(routines.describeSchedule('0 */5 * * *'), 'Every 5 hours');
    assert.equal(routines.describeSchedule('0 */5 1 * *'), '0 */5 1 * *');
    // Six-field expressions are never silently reinterpreted as five-field.
    assert.equal(routines.describeSchedule('0 0 9 * * *'), '0 0 9 * * *');
    assert.equal(routines.describeSchedule('30 0 9 * * *'), '30 0 9 * * *');
    // Partial numeric tokens are rejected, not partially accepted.
    assert.equal(routines.describeSchedule('12abc * * * *'), '12abc * * * *');
    assert.equal(routines.describeSchedule('*/15x * * * *'), '*/15x * * * *');
    assert.equal(routines.describeSchedule('1-5abc 0 * * *'), '1-5abc 0 * * *');
    // A bare start with a step is never collapsed to a single value.
    assert.equal(routines.describeSchedule('5/15 * * * *'), '5/15 * * * *');
    // Safe humanizations remain intact.
    assert.equal(routines.describeSchedule('*/15 * * * *'), 'Every 15 minutes');
    assert.equal(routines.describeSchedule('*/20 * * * *'), 'Every 20 minutes');
    assert.equal(routines.describeSchedule('0 */2 * * *'), 'Every 2 hours');
    assert.equal(routines.describeSchedule('0 */6 * * *'), 'Every 6 hours');
    assert.equal(routines.describeSchedule('0 9 * * 1-5'), 'Weekdays at 09:00');
    assert.equal(routines.describeSchedule('0 8 1 * *'), 'On the 1st of every month at 08:00');
  });

  it('titles strip the bot prefix and fall back honestly', () => {
    assert.equal(routines.routineTitle({ name: '[bot:news] Morning brief' }, 'routine 1'), 'Morning brief');
    assert.equal(routines.routineTitle({ name: '' }, 'routine 1'), 'routine 1');
  });

  it('collapsed subtitles lead with human schedule and next run; paused stays Paused', () => {
    assert.equal(
      routines.collapsedSubtitleOf({ name: 'a', schedule: '0 9 * * *', disabled: false }),
      'Every day at 09:00',
    );
    assert.equal(routines.collapsedSubtitleOf({ name: 'b', disabled: true }), 'Paused');
    assert.equal(routines.collapsedSubtitleOf({ name: 'c', state: 'completed' }), 'Completed');
    assert.equal(routines.collapsedSubtitleOf({ name: 'd', state: 'error' }), 'Error');
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
      loaded([ROUTE], 'p1', 'c1'),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
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
      loaded([ROUTE], 'p1', 'c1'),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-resume', name: 'j1' },
    ]);
    assert.equal(state.jobs[0].disabled, false);
    state = routines.routinesViewReducer(state, { type: 'optimistic-rollback' });
    assert.deepEqual(state.jobs, jobs);
  });

  it('rollback without a snapshot keeps current rows', () => {
    const jobs = [{ name: 'j1' }];
    const state = reduce([
      loaded([ROUTE], 'p1', 'c1'),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-rollback' },
    ]);
    assert.deepEqual(state.jobs, jobs);
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

  it('the active-door opt-in never lives in the view layer', () => {
    const base = path.join(root, 'src');
    const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
    for (const f of files) {
      const text = readFileSync(path.join(base, String(f)), 'utf8');
      const name = String(f);
      const isViewLayer = name.startsWith(`views${path.sep}`) || name === `plugin.tsx`;
      if (isViewLayer) {
        assert.equal(
          text.includes('allowActiveDoor'),
          false,
          `${name} must never opt into the active door`,
        );
      }
    }
    // the opt-in exists only as an explicit router capability
    const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
    assert.match(artifact, /allowActiveDoor/, 'router must keep the explicit active-door opt-in');
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
    // RoutinesPage hooks: [state, routesNonce]
    reactStub.__presetStates([[state, noop], [0, noop]]);
    return renderView();
  }

  function readyWith(jobs, extra = {}) {
    return reduce([
      loaded([ROUTE, ROUTE_B], 'p1', 'c1'),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      ...(extra.events || []),
    ]);
  }

  it('ready list renders humanized cards with status and pause/resume only', () => {
    const tree = paint(readyWith([{ name: 'j1', schedule: '0 9 * * *' }, { name: 'j2', schedule: '0 9 * * *', disabled: true }]));
    const nodes = collect(tree);
    const list = nodes.find((n) => n.type === 'ul');
    assert.ok(list, 'ul required');
    const items = nodes.filter((n) => n.type === 'li');
    assert.equal(items.length, 2);
    const all = texts(tree).join(' | ');
    assert.match(all, /j1/);
    assert.match(all, /Active/);
    assert.match(all, /Paused/);
    assert.match(all, /Every day at 09:00/, 'schedule must read human, not raw cron');
    const buttons = nodes.filter((n) => n.type === 'button').map((n) => n.props.children);
    assert.ok(buttons.includes('Pause'));
    assert.ok(buttons.includes('Resume'));
    assert.equal(buttons.includes('Remove'), false, 'delete is not part of this surface');
    assert.equal(buttons.includes('Create routine'), false, 'create is not part of this surface');
    assert.equal(buttons.includes('Confirm remove'), false);
  });

  it('cards disclose details on demand with aria-expanded', () => {
    const tree = paint(readyWith([{ name: 'j1', schedule: '0 9 * * *' }]));
    const nodes = collect(tree);
    const toggle = nodes.find((n) => n.type === 'button' && n.props['aria-expanded'] !== undefined);
    assert.ok(toggle, 'expand toggle required');
    assert.equal(toggle.props['aria-expanded'], false);
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

  it('no profile picker, create form or delete affordance exists anywhere', () => {
    const tree = paint(readyWith([{ name: 'j1' }]));
    const nodes = collect(tree);
    assert.equal(nodes.some((n) => n.type === 'select'), false, 'RoutePicker must be gone');
    assert.equal(nodes.some((n) => n.type === 'form'), false, 'create form must be gone');
    const src = readSrcTree();
    assert.equal(src.includes('RoutePicker'), false, 'RoutePicker must not remain in src/');
    assert.equal(src.includes('CreateRoutineForm'), false);
    assert.equal(src.includes('Confirm remove'), false);
  });

  it('error states render message plus retry', () => {
    const listErr = paint(reduce([loaded([ROUTE], 'p1', 'c1'), { type: 'list-error', error: 'ctx: backend says no', key: 'c1::p1' }]));
    let nodes = collect(listErr);
    assert.ok(nodes.some((n) => n.props && n.props.role === 'alert'));
    assert.ok(texts(listErr).join(' ').includes('backend says no'));
    assert.ok(nodes.filter((n) => n.type === 'button').map((n) => n.props.children).includes('Retry'));
    const routesErr = paint(reduce([{ type: 'routes-error', error: 'ctx: door shut' }]));
    nodes = collect(routesErr);
    assert.ok(nodes.some((n) => n.props && n.props.role === 'alert'));
    assert.ok(texts(routesErr).join(' ').includes('door shut'));
  });

  it('unavailable state names the problem with retry', () => {
    const tree = paint(reduce([loaded([ROUTE], 'ghost', 'c1')]));
    const nodes = collect(tree);
    assert.ok(nodes.some((n) => n.props && n.props.role === 'alert'));
    assert.ok(texts(tree).join(' ').includes('unavailable'));
    assert.ok(nodes.filter((n) => n.type === 'button').map((n) => n.props.children).includes('Retry'));
  });

  it('empty list renders the product empty state without a create form', () => {
    const tree = paint(readyWith([]));
    const all = texts(tree).join(' ');
    assert.ok(all.includes('No routines yet'));
    const nodes = collect(tree);
    assert.equal(nodes.some((n) => n.type === 'form'), false, 'no create form in this surface');
    assert.equal(nodes.some((n) => n.type === 'select'), false, 'no profile selector in this surface');
  });

  it('header follows the active profile without a selector', () => {
    sdk.__setActive('p1', 'c1');
    const tree = paint(readyWith([{ name: 'j1' }]));
    assert.ok(texts(tree).join(' ').includes('p1'));
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

  it('descriptor keeps id/version/register without a second route', () => {
    assert.equal(routines.plugin.id, 'hermes-routines');
    assert.equal(routines.plugin.version, '0.1.0');
    assert.equal(typeof routines.plugin.register, 'function');
    assert.equal(routines.default, routines.plugin);
    // no descriptor-level component: rendering happens only through the
    // routes contribution (single mount, nothing renders twice)
    assert.equal(routines.plugin.component, undefined, 'component must not live on the descriptor');
  });

  it('initial paint renders landmark, heading and a polite live region', () => {
    const tree = renderView();
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
    assert.ok(texts(tree).some((t) => t.includes('Loading routines.')));
  });

  it('source wires the a11y contract end to end', () => {
    const src = readSrcTree();
    assert.match(src, /aria-labelledby.*hermes-routines-heading/, 'landmark labelled by the heading');
    assert.match(src, /aria-live.*polite/, 'polite live region for updates');
    assert.match(src, /aria-current/, 'current marker on the in-view filter nav');
    assert.match(src, /aria-expanded/, 'disclosure state on routine cards');
    assert.match(src, /tabIndex.*-1/, 'programmatic focus targets');
    assert.match(src, /:focus-visible/, 'visible focus ring');
    assert.match(src, /role.*alert/, 'assertive error boxes');
    assert.match(src, /\.focus\(\)/, 'managed focus after errors');
    assert.match(src, /<nav\b/, 'in-view filter navigation');
    assert.match(src, /<ul\b/, 'routine list');
    assert.equal(src.includes('<select'), false, 'no native selector: the plugin follows the active profile');
  });
});
