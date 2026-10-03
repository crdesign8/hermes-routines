// Native shell surface (issue #101): palette commands plus a conditional
// status contribution.
//
// The Desktop SDK exposes shell contributions beyond routes/sidebar, and
// the first-party kanban plugin shows they are intended for plugin use.
// Routines adopts the same pattern in a restrained form:
//
//   - `Routines: Open` and `Routines: New routine` palette rows route
//     through the supported SDK navigation surface (`host.navigate`);
//   - the status bar renders nothing while healthy and a compact count
//     affordance while routines need attention;
//   - keybinds were evaluated and deliberately left out rather than
//     claiming a global chord.
//
// Fixtures mirror the upstream contract throughout: a technical `job_id`
// AND a distinct human title on the same row (the issue #45 lesson).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const sdkStub = await import('./stubs/sdk-stub.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function textOf(node) {
  const out = [];
  (function walk(n) {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object' && n.props) walk(n.props.children);
  })(node);
  return out.join(' ').trim();
}

function collectRegistrations() {
  const registrations = [];
  const ctx = {
    source: 'plugin:test',
    register(contribution) {
      registrations.push(contribution);
      return () => {};
    },
  };
  routines.register(ctx);
  return registrations;
}

function drainShellRequests() {
  let kind = routines.takeShellRequest();
  while (kind !== null) kind = routines.takeShellRequest();
}

const HEALTHY = {
  job_id: 'a1b2c3d4e5f6',
  name: 'Morning brief',
  schedule: '0 9 * * *',
  schedule_display: 'Every day at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T09:00:00Z',
  last_status: 'success',
};

const FAILING = {
  job_id: 'f6e5d4c3b2a1',
  name: 'Nightly backup',
  schedule: '0 2 * * *',
  schedule_display: 'Every day at 02:00',
  prompt: 'Back up the archive.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T02:00:00Z',
  last_status: 'failed',
  last_fire_error: 'process exited before backup: gpg: command not found',
};

const SECOND_FAILING = {
  job_id: 'd4e5f6a7b8c9',
  name: 'Midday sync',
  schedule: '0 12 * * *',
  schedule_display: 'Every day at 12:00',
  prompt: 'Sync the mirrors.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T12:00:00Z',
  last_status: 'failed',
  last_fire_error: 'the mirror was unreachable',
};

beforeEach(() => {
  sdkStub.__reset();
  drainShellRequests();
});

describe('shell-surface', () => {
  it('registers two palette commands and one conditional status item, without touching panes', () => {
    const registrations = collectRegistrations();
    const areas = registrations.map((contribution) => String(contribution.area));
    assert.equal(
      registrations.filter((contribution) => contribution.area === 'routes').length,
      1,
      'exactly one routes contribution (no duplicate page)',
    );
    assert.equal(
      registrations.filter((contribution) => contribution.area === 'sidebar.nav').length,
      1,
      'exactly one sidebar row (no duplicate nav)',
    );
    assert.equal(areas.includes('panes'), false, 'must never register panes area');
    assert.equal(areas.join(' ').includes('panes'), false, 'no panes area id anywhere');

    const palette = registrations.filter((contribution) => contribution.area === 'palette');
    assert.equal(palette.length, 2, 'two palette rows: open + new routine');
    const open = palette.find((contribution) => contribution.data?.id === 'routines.open');
    const create = palette.find((contribution) => contribution.data?.id === 'routines.newRoutine');
    assert.ok(open, 'Routines: Open command must be registered');
    assert.ok(create, 'Routines: New routine command must be registered');
    assert.equal(open.data.label, 'Routines: Open');
    assert.equal(create.data.label, 'Routines: New routine');
    assert.equal(typeof open.data.run, 'function', 'palette rows run through a handler, not a DOM hack');
    assert.equal(typeof create.data.run, 'function', 'palette rows run through a handler, not a DOM hack');

    const status = registrations.filter((contribution) => String(contribution.area).startsWith('statusBar.'));
    assert.equal(status.length, 1, 'exactly one status contribution');
    assert.equal(status[0].area, 'statusBar.right', 'status contribution lives on the right side');
    assert.equal(typeof status[0].render, 'function', 'status contribution renders a component');
  });

  it('palette runs route through host.navigate, parking a create request only for the creation flow', () => {
    const registrations = collectRegistrations();
    const open = registrations.find((contribution) => contribution.data?.id === 'routines.open');
    const create = registrations.find((contribution) => contribution.data?.id === 'routines.newRoutine');

    open.data.run();
    const openCalls = sdkStub.__calls().filter((call) => call.door === 'navigate');
    assert.deepEqual(
      openCalls.map((call) => call.args[0]),
      ['/routines'],
      'Routines: Open navigates to the page through the SDK',
    );
    assert.equal(routines.takeShellRequest(), null, 'opening parks no page request');

    create.data.run();
    const createCalls = sdkStub.__calls().filter((call) => call.door === 'navigate');
    assert.deepEqual(
      createCalls.map((call) => call.args[0]),
      ['/routines', '/routines'],
      'Routines: New routine navigates to the page through the SDK',
    );
    assert.equal(routines.takeShellRequest(), 'create', 'creation flow parks a create request for the page');
  });

  it('status activation parks an attention request and navigates to the page', () => {
    routines.openRoutineAttention();
    assert.equal(routines.takeShellRequest(), 'attention', 'status activation parks an attention request');
    const navigations = sdkStub.__calls().filter((call) => call.door === 'navigate');
    assert.deepEqual(
      navigations.map((call) => call.args[0]),
      ['/routines'],
      'status activation opens the page through the SDK',
    );
  });

  it('status view is silent while healthy and compact while failing', () => {
    assert.equal(routines.RoutinesStatusItemView({ count: null, onOpen() {} }), null, 'unknown renders nothing');
    assert.equal(routines.RoutinesStatusItemView({ count: 0, onOpen() {} }), null, 'healthy renders nothing');

    let opened = 0;
    const node = routines.RoutinesStatusItemView({
      count: 2,
      onOpen() {
        opened += 1;
      },
    });
    assert.equal(node?.type, 'button', 'failure state is a real activating button');
    assert.match(textOf(node), /2/, 'failure state carries the compact count');
    assert.match(String(node.props['aria-label']), /attention/i, 'failure state names the attention state');
    node.props.onClick();
    assert.equal(opened, 1, 'activating the status affordance fires the open handler');
  });

  it('status and page counts derive from the one shared domain verdict', () => {
    const jobs = [HEALTHY, FAILING, SECOND_FAILING];
    assert.equal(routines.attentionCount(jobs), 2, 'shared verdict counts exactly the failing rows');
    assert.deepEqual(
      routines.attentionTargets(jobs).map((job) => job.job_id),
      [FAILING.job_id, SECOND_FAILING.job_id],
      'shared verdict targets exactly the failing rows',
    );
    const node = routines.RoutinesStatusItemView({
      count: routines.attentionCount(jobs),
      onOpen() {},
    });
    assert.equal(node?.type, 'button', 'shared count reaches the status affordance');
    assert.match(textOf(node), /2/, 'status paints the shared count, not a second classifier');
    assert.equal(routines.attentionCount([HEALTHY]), 0, 'a healthy inventory paints no status');
  });

  it('shell requests keep only the latest intent and release subscribers on dispose', () => {
    const seen = [];
    const dispose = routines.subscribeShellRequests(() => {
      seen.push(routines.peekShellRequest());
    });
    routines.requestRoutineCreate();
    routines.requestAttentionFocus();
    assert.deepEqual(seen, ['create', 'attention'], 'subscribers observe every parked request');
    assert.equal(routines.takeShellRequest(), 'attention', 'the latest intent wins; nothing queues');
    assert.equal(routines.takeShellRequest(), null, 'taking clears the slot');
    dispose();
    routines.requestRoutineCreate();
    assert.deepEqual(seen, ['create', 'attention'], 'a disposed subscriber hears nothing more');
    assert.equal(routines.takeShellRequest(), 'create', 'requests still park without subscribers');
  });

  it('wiring pins the shell contract in source: shared verdict, page consumption, cleanup, no DOM or keybind claims', () => {
    const statusSrc = read('src/views/RoutinesStatus.tsx');
    const pageSrc = read('src/views/RoutinesPage.tsx');
    const pluginSrc = read('src/plugin.tsx');
    const shellSrc = read('src/state/shellRequests.ts');

    assert.match(statusSrc, /attentionCount/, 'status count reads the shared domain verdict');
    assert.equal(/isFailedStatus\(/.test(statusSrc), false, 'status must not re-derive failure from a token');
    assert.equal(/last_status/.test(statusSrc), false, 'status must not read run tokens directly');
    assert.match(statusSrc, /clearInterval/, 'status poller is disposed on unmount');
    assert.match(statusSrc, /cancelled = true/, 'in-flight status reads are cancelled on unmount');
    assert.match(pluginSrc, /STATUSBAR_AREAS\.right/, 'status registers on the right side only');
    assert.equal(pluginSrc.includes('STATUSBAR_AREAS.left'), false, 'no left-side status contribution');

    assert.match(pageSrc, /subscribeShellRequests/, 'page subscribes to parked shell requests');
    assert.match(pageSrc, /takeShellRequest/, 'page consumes parked shell requests');
    assert.match(pageSrc, /attention-focus/, 'page honors attention requests through the focus event');

    assert.match(pluginSrc, /PALETTE_AREA/, 'palette commands register through the native area');
    assert.match(pluginSrc, /host\.navigate/, 'shell commands route through the supported SDK navigation');
    for (const source of [pluginSrc, statusSrc, shellSrc]) {
      assert.equal(source.includes('KEYBINDS_AREA'), false, 'no keybind contribution: evaluated, not forced');
      assert.equal(/querySelector|getElementById|innerHTML/.test(source), false, 'no DOM-level integration');
    }
    assert.equal(/mod\+alt/i.test(pluginSrc + statusSrc + shellSrc), false, 'no default chord is claimed');
    assert.equal(/Notification|THEMES_AREA/.test(pluginSrc + statusSrc), false, 'no notifications or theme work');
  });
});
