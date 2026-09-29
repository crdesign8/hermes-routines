// Run-time copy contract for issue #75.
//
// The routines list used to build ONE generic relative-time string and
// prepend "Next", so a stale `next_run_at` rendered "Next in 2 minutes ago"
// and a just-due one rendered "Next in just now": future-oriented grammar
// glued to a past-oriented distance. Copy is now a state machine over the
// timestamp's relation to the clock (future / now / overdue for a next run;
// always past for run history), and this file pins the whole band:
//
//   future            -> "Next run in 2 minutes"
//   inside ±1 minute  -> "Due now" / "just now" (one canonical phrase each)
//   past the window   -> "Overdue by 2 minutes" / "2 minutes ago"
//   missing/malformed -> no claim at all
//
// Exact distances are asserted with an injected reference clock (the helpers
// take `now`), so nothing rots with the calendar. The rendered surfaces are
// exercised through the GENERATED artifact (desktop/plugin.js), the bundle
// the Desktop actually loads.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so the GENERATED artifact can be
// exercised behaviorally under node:test (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Fixed reference clock: every exact assertion below is a pure function of it. */
const NOW = new Date('2026-06-15T12:00:00Z');
const plus = (ms) => new Date(NOW.getTime() + ms).toISOString();
/** A timestamp relative to the real wall clock, for the rendered surfaces. */
const wallClock = (ms) => new Date(Date.now() + ms).toISOString();

const BASE = {
  job_id: 'abc123',
  name: 'morning-digest',
  schedule: '0 9 * * *',
  schedule_display: 'Daily at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
};

// ── Domain: the state machine ──────────────────────────────────────────

describe('next-run copy is a state machine over the clock (issue #75)', () => {
  it('states a future schedule as "Next run in <distance>"', () => {
    const cases = [
      [2 * MINUTE, 'in 2 minutes', 'Next run in 2 minutes'],
      [1 * HOUR, 'in 1 hour', 'Next run in 1 hour'],
      [3 * HOUR, 'in 3 hours', 'Next run in 3 hours'],
      [5 * DAY, 'in 5 days', 'Next run in 5 days'],
    ];
    for (const [offset, text, sentence] of cases) {
      const value = plus(offset);
      assert.deepEqual(routines.nextRunCopyOf(value, NOW), {
        state: 'future',
        text,
        sentence,
        date: routines.formatDate(value),
      });
    }
  });

  it('collapses the near-now band into one canonical "Due now" state', () => {
    for (const offset of [0, 30_000, MINUTE, -30_000, -MINUTE]) {
      const copy = routines.nextRunCopyOf(plus(offset), NOW);
      assert.equal(copy.state, 'now', `offset ${offset}ms reads as the now state`);
      assert.equal(copy.sentence, 'Due now', 'the canonical product phrase');
      assert.equal(copy.text, 'due now');
    }
  });

  it('pins the now threshold exactly and inclusively (±60s)', () => {
    // The boundary is deterministic: exactly ±60s is still "now", one
    // millisecond past it is future/overdue with the smallest distance.
    assert.equal(routines.NOW_WINDOW_MS, 60_000, 'the canonical window is one minute');
    assert.equal(routines.nextRunCopyOf(plus(MINUTE), NOW).state, 'now');
    assert.equal(routines.nextRunCopyOf(plus(-MINUTE), NOW).state, 'now');
    assert.equal(routines.nextRunCopyOf(plus(MINUTE + 1), NOW).sentence, 'Next run in 1 minute');
    assert.equal(routines.nextRunCopyOf(plus(-(MINUTE + 1)), NOW).sentence, 'Overdue by 1 minute');

    // Both consumers read the same threshold: run history flips at the same
    // millisecond the next-run state does.
    assert.equal(routines.runDistanceOf(plus(-MINUTE), NOW).text, 'just now');
    assert.equal(routines.runDistanceOf(plus(-(MINUTE + 1)), NOW).text, '1 minute ago');
  });

  it('reads a slightly past schedule as overdue, never as a "Next" distance', () => {
    const copy = routines.nextRunCopyOf(plus(-90_000), NOW);
    assert.equal(copy.state, 'overdue');
    assert.equal(copy.sentence, 'Overdue by 1 minute');
    assert.equal(copy.text, 'overdue by 1 minute');
  });

  it('reads a substantially past schedule as overdue with the true magnitude', () => {
    assert.equal(routines.nextRunCopyOf(plus(-(5 * HOUR)), NOW).sentence, 'Overdue by 5 hours');
    assert.equal(routines.nextRunCopyOf(plus(-(2 * DAY)), NOW).sentence, 'Overdue by 2 days');
  });

  it('claims nothing for a missing or malformed timestamp', () => {
    for (const value of [null, undefined, '', '   ', 'not-a-timestamp']) {
      assert.equal(routines.nextRunCopyOf(value, NOW), null, `${String(value)} yields no next-run copy`);
    }
  });

  it('never produces a string that combines "Next" with "ago"', () => {
    const offsets = [
      -(30 * DAY), -(3 * DAY), -(5 * HOUR), -(2 * MINUTE), -(MINUTE + 1), -(MINUTE), 0,
      MINUTE, MINUTE + 1, 2 * MINUTE, 3 * HOUR, 5 * DAY,
    ];
    for (const offset of offsets) {
      const copy = routines.nextRunCopyOf(plus(offset), NOW);
      for (const text of [copy.sentence, copy.text]) {
        assert.equal(
          /Next/i.test(text) && /\bago\b/i.test(text),
          false,
          `"${text}" (offset ${offset}ms) must never mix Next with ago`,
        );
      }
    }
  });

  it('keeps distance and calendar text stable across equivalent timezone encodings', () => {
    // 14:00Z and 11:00-03:00 are the same instant; copy must not depend on
    // which encoding the backend happened to send.
    const utc = '2026-06-15T14:00:00Z';
    const offset = '2026-06-15T11:00:00-03:00';
    assert.equal(routines.nextRunCopyOf(utc, NOW).sentence, 'Next run in 2 hours');
    assert.equal(routines.nextRunCopyOf(offset, NOW).sentence, 'Next run in 2 hours');
    assert.equal(
      routines.nextRunCopyOf(utc, NOW).date,
      routines.nextRunCopyOf(offset, NOW).date,
      'one instant renders one calendar value',
    );
    assert.equal(routines.formatDate(utc), routines.formatDate(offset));
  });

  it('folds the state machine into the collapsed subtitle', () => {
    const stale = routines.collapsedSubtitleOf({
      ...BASE,
      next_run_at: '2020-01-01T09:00:00Z',
    });
    assert.match(stale, /^Daily at 09:00 {2}\| {2}Overdue by \d+ days$/, 'a stale schedule is overdue');
    assert.doesNotMatch(stale, /Next/, 'and never wears a "Next" label');

    const future = routines.collapsedSubtitleOf({
      ...BASE,
      next_run_at: '2030-01-01T09:00:00-03:00',
    });
    assert.match(future, /^Daily at 09:00 {2}\| {2}Next run in \d+ days$/, 'a future schedule stays future-oriented');

    const malformed = routines.collapsedSubtitleOf({ ...BASE, next_run_at: 'nope' });
    assert.equal(malformed, 'Daily at 09:00', 'an unparseable timestamp adds no claim');
  });
});

describe('run-history distance stays past-oriented (issue #75)', () => {
  it('reads elapsed time as "<distance> ago"', () => {
    assert.equal(routines.runDistanceOf(plus(-30_000), NOW).text, 'just now');
    assert.equal(routines.runDistanceOf(plus(-MINUTE), NOW).text, 'just now');
    assert.equal(routines.runDistanceOf(plus(-(5 * MINUTE)), NOW).text, '5 minutes ago');
    assert.equal(routines.runDistanceOf(plus(-(3 * HOUR)), NOW).text, '3 hours ago');
    assert.equal(routines.runDistanceOf(plus(-(2 * DAY)), NOW).text, '2 days ago');
  });

  it('clamps a timestamp ahead of the clock instead of claiming a run that has not happened', () => {
    for (const offset of [MINUTE + 1, HOUR, 2 * DAY]) {
      const distance = routines.runDistanceOf(plus(offset), NOW);
      assert.equal(distance.text, 'just now', 'skew reads as the canonical now state');
      assert.doesNotMatch(distance.text, /in \d/, 'a last run is never future-oriented');
    }
  });

  it('claims nothing for a missing or malformed timestamp', () => {
    for (const value of [null, undefined, '', 'nope']) {
      assert.equal(routines.runDistanceOf(value, NOW), null);
    }
  });
});

// ── Rendered surfaces ──────────────────────────────────────────────────

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loaded(routes, profile = 'p1', connectionId = 'c1') {
  return { type: 'routes-loaded', routes, profile, connectionId };
}

function readyWith(jobs) {
  return reduce([
    loaded([ROUTE]),
    { type: 'list-loaded', jobs, key: 'c1::p1' },
  ]);
}

function renderView() {
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const routes = items.filter((c) => c.area === 'routes');
  assert.equal(routes.length, 1, 'a single ROUTES_AREA render means no double-mount');
  let tree = routes[0].render();
  if (tree && typeof tree === 'object' && typeof tree.type === 'function') {
    tree = tree.type(tree.props);
  }
  return tree;
}

/** Paint the routines page for a state (RoutinesPage hooks: state, nonce). */
function paint(state) {
  const noop = () => {};
  reactStub.__presetStates([[state, noop], [0, noop]]);
  return renderView();
}

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

/**
 * Every string a user can read, one entry per rendered text leaf — so a
 * "Next" in one cell can never be checked against an "ago" from another.
 * Composed components hold their copy in the callee, not in props.
 */
function strings(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) strings(child, out);
    return out;
  }
  if (typeof node === 'object' && 'type' in node) {
    if (typeof node.type === 'function') {
      try {
        strings(node.type(node.props || {}), out);
      } catch {
        // leaf or non-evaluable
      }
      return out;
    }
    strings(node.props ? node.props.children : null, out);
  }
  return out;
}

/** The value cells of the detail row carrying `label`, joined; null when absent. */
function rowValue(tree, label) {
  for (const node of collect(tree)) {
    if (node.type !== 'div' || !node.props?.className?.includes('hr-detail')) continue;
    const cells = strings(node);
    if (cells.length > 0 && cells[0] === label) return cells.slice(1).join('');
  }
  return null;
}

function inspectorFor(job) {
  return routines.RoutineInspectorPanel({
    job,
    fallback: 'Routine',
    activeRoute: ROUTE,
    activeProfile: 'p1',
    busy: false,
    disabled: false,
    onClose: () => {},
    onPause: () => {},
    onResume: () => {},
  });
}

describe('rendered run-time copy (issue #75 acceptance)', () => {
  it('the card states future, due and overdue next runs without mixing grammar', () => {
    const cases = [
      [wallClock(2 * HOUR), 'Next run in 2 hours'],
      [wallClock(0), 'Due now'],
      [wallClock(-(5 * HOUR)), 'Overdue by 5 hours'],
    ];
    for (const [nextRunAt, expected] of cases) {
      const tree = paint(readyWith([{ ...BASE, next_run_at: nextRunAt }]));
      const next = collect(tree).find((n) => n.props?.className === 'hr-sub-next');
      assert.ok(next, `the card states the next run for ${nextRunAt}`);
      assert.equal(next.props.children, expected);
    }
  });

  it('drops a stale next run from a terminal row instead of dressing it as overdue', () => {
    const tree = paint(readyWith([{ ...BASE, state: 'completed', next_run_at: wallClock(-(2 * DAY)) }]));
    assert.equal(
      collect(tree).some((n) => n.props?.className === 'hr-sub-next'),
      false,
      'a completed routine has no future to announce',
    );
  });

  it('the expanded card and the inspector read overdue for a stale schedule', () => {
    const job = {
      ...BASE,
      last_run_at: wallClock(-(2 * DAY)),
      last_status: 'success',
      next_run_at: wallClock(-90_000),
    };
    const surfaces = [
      ['expanded card', routines.RoutineDetails({ job })],
      ['inspector', inspectorFor(job)],
    ];
    for (const [name, tree] of surfaces) {
      const next = rowValue(tree, 'Next run');
      assert.ok(next !== null, `${name} states the next run`);
      assert.match(next, /^overdue by 1 minute/, `${name} reads overdue, not a past distance`);
      assert.match(rowValue(tree, 'Last run'), /^2 days ago/, `${name} keeps run history past-oriented`);
    }
  });

  it('the expanded card and the inspector stay future-oriented for a pending schedule', () => {
    const job = { ...BASE, next_run_at: wallClock(2 * HOUR) };
    const surfaces = [
      ['expanded card', routines.RoutineDetails({ job })],
      ['inspector', inspectorFor(job)],
    ];
    for (const [name, tree] of surfaces) {
      assert.match(rowValue(tree, 'Next run'), /^in 2 hours/, `${name} states a future distance`);
    }
  });

  it('no surface renders "Next" and "ago" in the same string', () => {
    const jobs = [
      { ...BASE, job_id: 'a1', name: 'due', next_run_at: wallClock(0) },
      { ...BASE, job_id: 'a2', name: 'stale', next_run_at: wallClock(-(2 * DAY)) },
      {
        ...BASE,
        job_id: 'a3',
        name: 'history',
        last_run_at: wallClock(-(3 * HOUR)),
        last_status: 'failed',
        last_fire_error: 'upstream refused the connection',
        next_run_at: wallClock(-(3 * HOUR)),
      },
      { ...BASE, job_id: 'a4', name: 'pending', next_run_at: wallClock(3 * HOUR) },
    ];
    const surfaces = [
      ['page', paint(readyWith(jobs))],
      ['inspector', inspectorFor(jobs[2])],
      ['expanded card', routines.RoutineDetails({ job: jobs[2] })],
    ];
    for (const [name, tree] of surfaces) {
      const copied = strings(tree);
      assert.ok(copied.length > 0, `${name} renders copy`);
      for (const text of copied) {
        assert.equal(
          /Next/i.test(text) && /\bago\b/i.test(text),
          false,
          `${name} rendered "${text}", mixing Next with ago`,
        );
      }
    }
    // The composed rows say the same thing the domain says.
    const page = strings(paint(readyWith(jobs))).join(' | ');
    assert.match(page, /Due now/);
    assert.match(page, /Overdue by 2 days/);
    assert.match(page, /Next run in 3 hours/, 'a pending schedule stays future-oriented');
  });
});
