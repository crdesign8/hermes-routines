// Aggregate needs-configuration state (issue #93).
//
// The banner used to grow one configuration button per affected routine,
// which does not scale past a couple of rows. This file pins the
// replacement contract end to end:
//
//   banner   -> aggregate count plus exactly one View action, never one
//               button per routine; nothing at all when zero qualify
//   focus    -> View narrows the list to the candidate canonical job_ids,
//               exclusive with the attention focus, cleared by the
//               lifecycle chips, pruned back to null on every list load
//   row      -> a quiet Needs configuration line, never a button or badge
//   inspector -> the single Continue configuration action, candidate-only,
//               wired to the existing guided-reopen path
//
// Fixtures mirror the upstream contract throughout: a technical `job_id`
// AND a distinct human title on the same row, so an identity smuggled in
// through a display name could not pass unnoticed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cssSource = readFileSync(path.join(root, 'src', 'views', 'routinesStyles.ts'), 'utf8');
const pageSource = readFileSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx'), 'utf8');

const routines = await import('../desktop/plugin.js');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const noop = () => {};

// ── fixtures ──────────────────────────────────────────────────────────

/** Paused and never ran: a configuration candidate. */
function candidate(id, name) {
  return {
    job_id: id,
    name,
    schedule: '0 9 * * *',
    schedule_display: 'Every day at 09:00',
    prompt: 'Summarize yesterday.',
    enabled: false,
    state: 'paused',
  };
}

const CANDIDATE_A = candidate('cfg-aaaa-0001', 'Morning Brief');
const CANDIDATE_B = candidate('cfg-bbbb-0002', 'Nightly Digest');
const CANDIDATE_C = candidate('cfg-cccc-0003', 'Weekly Roundup');

/** Active and healthy: never a candidate. */
const HEALTHY = {
  job_id: 'ok-1111-2222',
  name: 'Healthy Routine',
  schedule: '0 9 * * *',
  schedule_display: 'Every day at 09:00',
  prompt: 'Do the thing.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T09:00:00Z',
  last_status: 'success',
};

/** Active and failing: attention state, never a configuration candidate. */
const FAILING = {
  job_id: 'fail-3333-4444',
  name: 'Failing Routine',
  schedule: '0 2 * * *',
  schedule_display: 'Every day at 02:00',
  prompt: 'Back up the archive.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T02:00:00Z',
  last_status: 'failed',
};

/** Paused AFTER a failed run: history with run evidence, not a candidate. */
const PAUSED_HISTORY = {
  job_id: 'hist-5555-6666',
  name: 'Old Failure',
  schedule: '0 8 * * 1',
  schedule_display: 'Every Monday at 08:00',
  prompt: 'Compile the report.',
  enabled: false,
  state: 'paused',
  last_run_at: '2026-06-08T08:00:00Z',
  last_status: 'failed',
};

/** Paused but addressable by nothing: renders, never focuses. */
const IDLESS = {
  name: 'Nameless Row',
  schedule: '0 9 * * *',
  schedule_display: 'Every day at 09:00',
  prompt: 'Do the thing.',
  enabled: false,
  state: 'paused',
};

// ── harness ───────────────────────────────────────────────────────────

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function readyWith(jobs) {
  return reduce([
    { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
    { type: 'list-loaded', jobs, key: 'c1::p1' },
  ]);
}

/** Host nodes in document order; function components stay unexpanded. */
function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    if (typeof node.type === 'function') {
      try {
        collect(node.type(node.props || {}), out);
      } catch {
        // leaf or non-evaluable
      }
    } else {
      collect(node.props ? node.props.children : null, out);
    }
    return out;
  }
  return out;
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
    else if (typeof n === 'object' && n.props && n.props.children) walk(n.props.children);
  })(node);
  return out.join(' ');
}

function renderCard(job) {
  return routines.RoutineCard({
    job,
    fallback: 'routine 1',
    inspected: false,
    busy: false,
    disabled: false,
    inspectorId: 'hermes-routines-inspector',
    onSelect: noop,
    onPause: noop,
    onResume: noop,
  });
}

function renderInspector(job, onConfigure) {
  return routines.RoutineInspectorPanel({
    job,
    fallback: 'Routine',
    activeRoute: ROUTE,
    activeProfile: 'p1',
    busy: false,
    disabled: false,
    onClose: noop,
    onPause: noop,
    onResume: noop,
    ...(onConfigure ? { onConfigure } : {}),
  });
}

describe('configuration focus state (issue #93)', () => {
  it('starts unfocused', () => {
    assert.equal(routines.initialRoutinesState().configFocus, null);
  });

  it('focuses candidates by canonical job_id, ignoring everything else', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [CANDIDATE_A, HEALTHY], key: 'c1::p1' },
      {
        type: 'config-focus',
        jobs: [CANDIDATE_A, CANDIDATE_B, HEALTHY, FAILING, PAUSED_HISTORY, IDLESS],
      },
    ]);
    assert.deepEqual(state.configFocus, ['cfg-aaaa-0001', 'cfg-bbbb-0002']);
    assert.equal(state.filter, 'all', 'the focus is the slice now');
  });

  it('a focus with no candidates leaves no focus behind', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY], key: 'c1::p1' },
      { type: 'config-focus', jobs: [HEALTHY, FAILING, PAUSED_HISTORY, IDLESS] },
    ]);
    assert.equal(state.configFocus, null);
  });

  it('the two foci are exclusive', () => {
    let state = readyWith([CANDIDATE_A, FAILING]);
    state = routines.routinesViewReducer(state, { type: 'config-focus', jobs: [CANDIDATE_A] });
    assert.deepEqual(state.configFocus, ['cfg-aaaa-0001']);
    state = routines.routinesViewReducer(state, { type: 'attention-focus', jobs: [FAILING] });
    assert.deepEqual(state.attentionFocus, ['fail-3333-4444']);
    assert.equal(state.configFocus, null, 'entering attention leaves configuration');
    state = routines.routinesViewReducer(state, { type: 'config-focus', jobs: [CANDIDATE_A] });
    assert.deepEqual(state.configFocus, ['cfg-aaaa-0001']);
    assert.equal(state.attentionFocus, null, 'entering configuration leaves attention');
  });

  it('a lifecycle chip clears the configuration focus', () => {
    let state = readyWith([CANDIDATE_A]);
    state = routines.routinesViewReducer(state, { type: 'config-focus', jobs: [CANDIDATE_A] });
    assert.notEqual(state.configFocus, null);
    for (const filter of ['active', 'paused', 'all']) {
      const next = routines.routinesViewReducer(state, { type: 'filter-changed', filter });
      assert.equal(next.configFocus, null, `chip ${filter} answers a different question`);
    }
  });

  it('clearing an empty focus is a no-op', () => {
    const state = readyWith([CANDIDATE_A]);
    const next = routines.routinesViewReducer(state, { type: 'config-focus-cleared' });
    assert.equal(next, state);
  });

  it('a list reload prunes configured, resumed, or vanished rows back to null', () => {
    let state = readyWith([CANDIDATE_A, CANDIDATE_B]);
    state = routines.routinesViewReducer(state, {
      type: 'config-focus',
      jobs: [CANDIDATE_A, CANDIDATE_B],
    });
    // A ran, B vanished: nothing survives, so the focus drops entirely
    // instead of blanking the page with an empty slice.
    const configuredA = { ...CANDIDATE_A, last_run_at: '2026-06-16T09:00:00Z', last_status: 'success' };
    state = routines.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [configuredA, HEALTHY],
      key: 'c1::p1',
    });
    assert.equal(state.configFocus, null, 'an emptied focus is null, never []');
  });

  it('a list reload keeps the survivors of a partial recovery', () => {
    let state = readyWith([CANDIDATE_A, CANDIDATE_B]);
    state = routines.routinesViewReducer(state, {
      type: 'config-focus',
      jobs: [CANDIDATE_A, CANDIDATE_B],
    });
    const resumedA = { ...CANDIDATE_A, enabled: true, state: 'scheduled' };
    state = routines.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [resumedA, CANDIDATE_B],
      key: 'c1::p1',
    });
    assert.deepEqual(state.configFocus, ['cfg-bbbb-0002']);
  });

  it('dropping the inventory clears the configuration focus', () => {
    let state = readyWith([CANDIDATE_A]);
    state = routines.routinesViewReducer(state, { type: 'config-focus', jobs: [CANDIDATE_A] });
    assert.notEqual(state.configFocus, null);
    assert.equal(
      routines.routinesViewReducer(state, { type: 'routes-loading' }).configFocus,
      null,
    );
    assert.equal(
      routines.routinesViewReducer(state, {
        type: 'active-changed',
        profile: 'p2',
        connectionId: 'c2',
      }).configFocus,
      null,
      'a profile switch must not carry the old focus onto new rows',
    );
  });
});

describe('configuration summary band (issue #93)', () => {
  it('renders nothing when zero routines need configuration', () => {
    assert.equal(routines.NeedsConfigurationNotice({ count: 0, onView: noop }), null);
  });

  it('names the aggregate count at 1, 2, and 10+ with exactly one View action', () => {
    for (const [count, copy] of [
      [1, '1 routine needs configuration'],
      [2, '2 routines need configuration'],
      [12, '12 routines need configuration'],
    ]) {
      let views = 0;
      const element = routines.NeedsConfigurationNotice({
        count,
        onView: () => {
          views += 1;
        },
      });
      const nodes = collect(element);
      assert.match(textOf(element), new RegExp(copy), `count ${count} reads as aggregate`);
      const buttons = nodes.filter((n) => n.type === 'button');
      assert.equal(buttons.length, 1, `count ${count} still offers exactly one action`);
      assert.match(textOf(buttons[0]), /View/);
      buttons[0].props.onClick();
      assert.equal(views, 1);
    }
  });

  it('is a quiet status band on its own id, distinct from the attention band', () => {
    const element = routines.NeedsConfigurationNotice({ count: 3, onView: noop });
    const nodes = collect(element);
    const band = nodes.find((n) => n.props && n.props.className === 'hr-config-note');
    assert.ok(band, 'the summary keeps its quiet class');
    assert.equal(band.props.role, 'status');
    assert.equal(band.props.tabIndex, -1, 'the replacement band is a focus target');
    assert.equal(band.props.id, routines.CONFIG_BAND_ID);
    assert.notEqual(
      routines.CONFIG_BAND_ID,
      routines.ATTENTION_BAND_ID,
      'focus must land on the band that replaced the pressed control',
    );
  });

  it('the focus bar restates the visible count with a way back', () => {
    for (const [visible, copy] of [
      [0, 'No routine needing configuration matches this search'],
      [1, 'Showing 1 routine that needs configuration'],
      [5, 'Showing 5 routines that need configuration'],
    ]) {
      let cleared = 0;
      const element = routines.NeedsConfigurationFocusBar({
        visibleCount: visible,
        onClear: () => {
          cleared += 1;
        },
      });
      const nodes = collect(element);
      const bar = nodes.find(
        (n) => n.props && n.props.id === routines.CONFIG_BAND_ID,
      );
      assert.ok(bar, 'the bar carries the configuration band id');
      assert.equal(bar.props.role, 'status', 'leaving the focus is announced too');
      assert.match(textOf(element), new RegExp(copy));
      const buttons = nodes.filter((n) => n.type === 'button');
      assert.equal(buttons.length, 1);
      assert.match(textOf(buttons[0]), /Show all/);
      buttons[0].props.onClick();
      assert.equal(cleared, 1);
    }
  });
});

describe('configuration row and inspector (issue #93)', () => {
  it('a candidate row states Needs configuration with no action and no chrome', () => {
    const nodes = collect(renderCard(CANDIDATE_A));
    const marker = nodes.find((n) => n.props && n.props.className === 'hr-sub-config');
    assert.ok(marker, 'the candidate row identifies itself');
    assert.match(textOf(marker), /Needs configuration/);
    const buttons = nodes.filter((n) => n.type === 'button');
    for (const button of buttons) {
      assert.doesNotMatch(textOf(button), /configur/i, 'no per-row configuration action');
    }
  });

  it('a configured row carries no configuration marker', () => {
    for (const job of [HEALTHY, FAILING, PAUSED_HISTORY]) {
      const nodes = collect(renderCard(job));
      assert.equal(
        nodes.some((n) => n.props && n.props.className === 'hr-sub-config'),
        false,
        `${job.name} must not claim it needs configuration`,
      );
    }
  });

  it('the inspector offers Continue configuration for a candidate only', () => {
    const seen = [];
    const tree = renderInspector(CANDIDATE_A, (jobId) => seen.push(jobId));
    const nodes = collect(tree);
    const action = nodes
      .filter((n) => n.type === 'button')
      .find((n) => /Continue configuration/.test(textOf(n)));
    assert.ok(action, 'the candidate inspector carries the single reopen action');
    action.props.onClick();
    assert.deepEqual(seen, ['cfg-aaaa-0001'], 'the handler gets the canonical job_id');
  });

  it('the inspector stays action-free without a wired handler or a candidate', () => {
    const unwired = collect(renderInspector(CANDIDATE_A));
    assert.equal(
      unwired
        .filter((n) => n.type === 'button')
        .some((n) => /Continue configuration/.test(textOf(n))),
      false,
      'a candidate without a handler renders no action',
    );
    const configured = collect(renderInspector(HEALTHY, noop));
    assert.equal(
      configured
        .filter((n) => n.type === 'button')
        .some((n) => /Continue configuration/.test(textOf(n))),
      false,
      'a configured routine never offers configuration',
    );
  });
});

describe('configuration wiring and budgets (issue #93)', () => {
  it('the page restores keyboard focus to the replacing band on the next tick', () => {
    const restore = pageSource.indexOf('focusById(CONFIG_BAND_ID)');
    assert.notEqual(restore, -1, 'the config band is a focus-restore target');
    const tick = pageSource.indexOf('setTimeout(() => {', restore - 200);
    assert.ok(tick !== -1 && tick < restore, 'the restore waits a tick for the swap');
  });

  it('the inspector reopen action rides the existing guided-reopen path', () => {
    assert.match(
      pageSource,
      /onConfigure=\{handleGuidedReopen\}/,
      'no parallel configuration interaction is invented',
    );
  });

  it('the quiet row marker and the narrow layout are styled', () => {
    assert.match(cssSource, /\.hr-sub-config\s*\{/, 'the row marker has a style rule');
    const mediaAt = cssSource.indexOf('@media (max-width: 820px)');
    assert.notEqual(mediaAt, -1, 'the narrow breakpoint exists');
    assert.ok(
      cssSource.indexOf('.hr-config-note', mediaAt) !== -1,
      'the aggregate summary adapts at 820px',
    );
  });

  it('every path that opens the guided panel leaves the focus behind', () => {
    // Both bands hide while the panel is open, so a live focus would
    // narrow the list with no visible way back until it closed.
    for (const opener of ['handleCreateGuided', 'handleGuidedReopen']) {
      const start = pageSource.indexOf(`function ${opener}(`);
      assert.notEqual(start, -1, `${opener} exists`);
      const end = pageSource.indexOf('\n  function ', start + 1);
      const body = pageSource.slice(start, end === -1 ? undefined : end);
      assert.match(
        body,
        /dispatch\(\{ type: 'config-focus-cleared' \}\);/,
        `${opener} clears the configuration focus before opening the panel`,
      );
    }
  });

  it('the prior attention contract is preserved beside the new focus', () => {
    const state = readyWith([CANDIDATE_A, FAILING]);
    const attention = routines.routinesViewReducer(state, {
      type: 'attention-focus',
      jobs: [CANDIDATE_A, FAILING],
    });
    assert.deepEqual(
      attention.attentionFocus,
      ['fail-3333-4444'],
      'candidates never leak into the attention slice',
    );
    let views = 0;
    const summary = routines.NeedsAttentionNotice({
      count: 1,
      paused: 0,
      onFocus: () => {
        views += 1;
      },
    });
    assert.ok(summary, 'the attention summary still renders');
    assert.match(textOf(summary), /1 routine needs attention/);
  });
});
