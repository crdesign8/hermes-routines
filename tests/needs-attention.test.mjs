// Runtime health is a dimension of its own (issue #80).
//
// The list segmented by LIFECYCLE only — all / active / paused — which
// answers "can this routine fire?" and can never answer "is this routine
// working?". A routine can be Active + failing, Paused + previously failed,
// or Paused + healthy, and each combination is a different thing to do. The
// failure used to live inside the row as a small red icon, so a routine
// losing every run depended on someone scanning a longer list for it.
//
// This file pins the replacement contract:
//
//   domain       -> attentionOf decides, once, with an explicit precedence
//   summary      -> "N routines need attention" above the list, or NOTHING
//   focus        -> the summary focuses exactly those routines
//   quiet        -> a healthy list paints no warning band at all
//   recovery     -> a later verified success clears the attention state
//   paused       -> a pre-pause failure is history, excluded ON PURPOSE and
//                   still stated on the page rather than dropped silently
//   not color    -> the words carry the state; the glyph is decorative
//
// Fixtures mirror the upstream contract throughout: a technical `job_id` AND
// a distinct human title on the same row (the issue #45 lesson), so a focus
// can never be satisfied by a display name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) — the bundle the Desktop actually loads — can be
// exercised behaviorally under node:test (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stylesPath = path.resolve(root, 'src', 'views', 'routinesStyles.ts');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const noop = () => {};
const HOUR = 60 * 60 * 1000;
const wallClock = (ms) => new Date(Date.now() + ms).toISOString();

// ── fixtures ──────────────────────────────────────────────────────────

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

/** Active, and its latest run failed: the attention state. */
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

/** Paused AFTER a failed run: history, not pending work. */
const PAUSED_HISTORY = {
  job_id: '1a2b3c4d5e6f',
  name: 'Weekly report',
  schedule: '0 8 * * 1',
  schedule_display: 'Every Monday at 08:00',
  prompt: 'Compile the weekly report.',
  enabled: false,
  state: 'paused',
  last_run_at: '2026-06-08T08:00:00Z',
  last_status: 'failed',
  last_fire_error: 'the source spreadsheet was locked',
};

/** Failed, then recovered — with every stale failure field still attached. */
const RECOVERED = {
  job_id: '7a8b9c0d1e2f',
  name: 'Evening digest',
  schedule: '0 18 * * *',
  schedule_display: 'Every day at 18:00',
  prompt: 'Compile the evening digest.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-16T18:00:00Z',
  last_status: 'success',
  // The backend keeps these from the run that failed. They must not
  // resurrect the attention state.
  last_fire_error: 'the widget recalibrator exploded sideways',
  last_stderr: 'old stderr from the failed run',
  last_exit_code: 17,
};

/** Never ran: unknown is not failure. */
const NEVER_RAN = {
  job_id: '3c4d5e6f7a8b',
  name: 'Monthly audit',
  schedule: '0 1 1 * *',
  schedule_display: 'On the 1st of every month at 01:00',
  prompt: 'Run the monthly audit.',
  enabled: true,
  state: 'scheduled',
};

const SECOND_FAILING = {
  job_id: 'd4e5f6a7b8c9',
  name: 'RSS ingestion',
  schedule: '0 */4 * * *',
  schedule_display: 'Every 4 hours',
  prompt: 'Ingest the feeds.',
  enabled: true,
  state: 'scheduled',
  last_run_at: '2026-06-15T12:00:00Z',
  last_status: 'error',
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

function renderView() {
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const route = items.filter((c) => c.area === 'routes')[0];
  let tree = route.render();
  if (tree && typeof tree === 'object' && typeof tree.type === 'function') {
    tree = tree.type(tree.props);
  }
  return tree;
}

/**
 * RoutinesPage hooks in order:
 *   [state, routesNonce, searchQuery, selectedJobKey, isCreating, guided, guidedRecent]
 * No state was added for the attention summary — it is derived per render
 * from the same rows the list paints, like the chip counts (issue #79) — so
 * the slot order every other contract test relies on is unchanged.
 */
function paint(state, { query = '' } = {}) {
  reactStub.__presetStates([
    [state, noop],
    [0, noop],
    [query, noop],
    [null, noop],
    [false, noop],
    [null, noop],
    [null, noop],
  ]);
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

function strings(node) {
  return collect(node)
    .map((n) => n.props.children)
    .flat(6)
    .filter((c) => typeof c === 'string');
}

function byClass(tree, className) {
  return collect(tree).filter((n) => n.props?.className === className);
}

/** Any node whose class list contains the given class. */
function withClass(tree, className) {
  return collect(tree).filter(
    (n) => typeof n.props?.className === 'string' && n.props.className.includes(className),
  );
}

/** The attention band (summary or focus bar), or null. */
function attentionBand(tree) {
  return withClass(tree, 'hr-attention')[0] ?? null;
}

function rowTitles(tree) {
  return collect(tree)
    .filter((n) => n.type === 'li')
    .map((row) =>
      strings(row).find((s) => ['Morning brief', 'Nightly backup', 'Weekly report', 'Evening digest', 'Monthly audit', 'RSS ingestion'].includes(s)) ??
      '?',
    );
}

function css() {
  return readFileSync(stylesPath, 'utf8');
}

// ── the domain precedence, decided once ───────────────────────────────

describe('attentionOf separates runtime health from lifecycle (issue #80)', () => {
  it('an active routine whose latest run failed needs attention', () => {
    assert.deepEqual(routines.attentionOf(FAILING), {
      needsAttention: true,
      reason: 'current-failure',
    });
    assert.equal(routines.needsAttention(FAILING), true);
  });

  it('a healthy active routine does not', () => {
    assert.deepEqual(routines.attentionOf(HEALTHY), { needsAttention: false, reason: null });
  });

  it('a paused routine that failed before it was paused does not', () => {
    // The intent is explicit, not incidental: nothing will retry it while it
    // stays paused, so the count is the number the user can act on now.
    // The row still states the failure, and the page names these separately.
    assert.deepEqual(routines.attentionOf(PAUSED_HISTORY), { needsAttention: false, reason: null });
    // The row-level status is unchanged by this rule: the history is not
    // erased from the row, it is only out of the attention slice.
    assert.equal(routines.routineHealthOf(PAUSED_HISTORY), 'paused');
  });

  it('a paused row whose LIFECYCLE token is error still qualifies', () => {
    // The two edges of the paused rule are deliberately NOT symmetric, and
    // this pins the asymmetry. The paused rule is about a recorded RUN
    // failure — history the user must resume into. An `error` lifecycle token
    // is a claim about the JOB, from the backend, about now: it needs a fix,
    // and resuming it would not fix a broken job. Without this ordering the
    // most broken row on the page would be the one the summary hides.
    assert.deepEqual(
      routines.attentionOf({ ...PAUSED_HISTORY, state: 'error' }),
      { needsAttention: true, reason: 'lifecycle-error' },
      'a paused job the backend calls broken is actionable, not history',
    );
    // The reverse stays excluded: a paused row whose only problem is the run
    // that already happened.
    assert.equal(routines.needsAttention(PAUSED_HISTORY), false);
  });

  it('a row with no usable job_id never qualifies, however it is failing', () => {
    // The focus is keyed on job_id, so an unaddressable row cannot be
    // revealed by "Show them". Counting it would make the band promise a row
    // the control cannot open, and clicking would dispatch a focus the
    // reducer refuses — a dead button on a page claiming to act.
    for (const job of [FAILING, SECOND_FAILING, { ...FAILING, state: 'error' }]) {
      assert.equal(
        routines.needsAttention({ ...job, job_id: undefined }),
        false,
        'no identity means no focusable attention',
      );
      assert.equal(routines.needsAttention({ ...job, job_id: '' }), false);
      // An id the backend sent in an unusable shape is equally unaddressable.
      assert.equal(routines.needsAttention({ ...job, job_id: '   ' }), false);
      assert.equal(routines.needsAttention({ ...job, job_id: 'has spaces' }), false);
    }
    assert.equal(routines.attentionCount([{ ...FAILING, job_id: undefined }]), 0);
    assert.deepEqual(routines.attentionTargets([{ ...FAILING, job_id: undefined }]), []);
  });

  it('a later verified success clears the attention state, stale fields notwithstanding', () => {
    // The recovery rule, stated as a precedence: a recorded success
    // outranks every failure token, so the error/stderr/exit-code fields the
    // backend leaves behind cannot repaint a healthy run as failing.
    assert.deepEqual(routines.attentionOf(RECOVERED), { needsAttention: false, reason: null });
  });

  it('a lifecycle error is an explicit current signal and outranks the run outcome', () => {
    // The backend says the JOB is broken, not that a run failed, so this is
    // actionable now even when the last recorded run succeeded.
    assert.deepEqual(routines.attentionOf({ ...HEALTHY, state: 'error' }), {
      needsAttention: true,
      reason: 'lifecycle-error',
    });
    assert.deepEqual(routines.attentionOf({ ...SECOND_FAILING, state: 'error' }), {
      needsAttention: true,
      reason: 'lifecycle-error',
    });
  });

  it('a completed routine has no next run to protect', () => {
    assert.equal(routines.needsAttention({ ...FAILING, state: 'completed' }), false);
  });

  it('never run is unknown, not failure', () => {
    assert.equal(routines.needsAttention(NEVER_RAN), false);
    // A pause reason is not a run outcome either.
    assert.equal(routines.needsAttention({ ...NEVER_RAN, state: 'paused', paused_reason: 'paused by user' }), false);
  });

  it('a null or malformed row claims nothing', () => {
    assert.equal(routines.needsAttention(null), false);
    assert.equal(routines.needsAttention(undefined), false);
  });

  it('attentionTargets and attentionCount read the same set, and refuse garbage', () => {
    const jobs = [HEALTHY, FAILING, PAUSED_HISTORY, RECOVERED, SECOND_FAILING, NEVER_RAN];
    assert.deepEqual(
      routines.attentionTargets(jobs).map((j) => j.job_id),
      [FAILING.job_id, SECOND_FAILING.job_id],
    );
    assert.equal(routines.attentionCount(jobs), 2);
    // A non-array must never produce a count a surface would paint.
    assert.deepEqual(routines.attentionTargets(null), []);
    assert.equal(routines.attentionCount(undefined), 0);
    assert.equal(routines.attentionCount('nope'), 0);
    // Source is not mutated.
    assert.equal(jobs.length, 6);
  });
});

// ── the summary on the page ───────────────────────────────────────────

describe('the page names the routines that need attention (issue #80)', () => {
  it('one failing routine states it in the singular', () => {
    const band = attentionBand(paint(readyWith([HEALTHY, FAILING])));
    assert.ok(band, 'a failing routine surfaces a summary above the list');
    assert.match(strings(band).join(' '), /1 routine needs attention/);
    assert.doesNotMatch(strings(band).join(' '), /1 routines/, 'singular, not plural');
  });

  it('multiple failures are counted, and every one is reachable', () => {
    const band = attentionBand(paint(readyWith([HEALTHY, FAILING, SECOND_FAILING])));
    assert.match(strings(band).join(' '), /2 routines need attention/);
  });

  it('a healthy list paints no attention band at all', () => {
    // The acceptance criterion "no empty/noisy warning section" is enforced
    // structurally: NeedsAttentionNotice returns null for a zero count, so
    // there is no empty box above a clean list to scroll past.
    for (const jobs of [[], [HEALTHY], [HEALTHY, NEVER_RAN, RECOVERED]]) {
      const tree = paint(readyWith(jobs));
      assert.equal(attentionBand(tree), null, 'nothing is painted when nothing is wrong');
      assert.equal(withClass(tree, 'hr-attention').length, 0, 'not even an empty container');
    }
  });

  it('the paused historical failure is named on the page, not dropped silently', () => {
    // Excluding paused failures from the count is a decision, so the page
    // states it: a routine that failed before it was paused is real history
    // and the user is told it exists.
    const band = attentionBand(paint(readyWith([FAILING, PAUSED_HISTORY])));
    const copy = strings(band).join(' ');
    assert.match(copy, /1 routine needs attention/, 'the count is the actionable one');
    assert.match(copy, /1 paused routine also failed before it was paused/);
  });

  it('a paused historical failure alone raises no band at all', () => {
    // Criterion 4 taken literally, and the honest reading of the paused
    // exclusion: a page whose only failure is a paused one has no actionable
    // work, so it paints nothing. The history is not lost — the row below
    // still states it, which the next test pins. The docs are worded to match:
    // the note is shown *when the band is shown*, not unconditionally.
    const tree = paint(readyWith([HEALTHY, PAUSED_HISTORY]));
    assert.equal(attentionBand(tree), null, 'no actionable failure, no band');
    assert.equal(routines.attentionCount([HEALTHY, PAUSED_HISTORY]), 0);
  });

  it('the state is carried by words, never by color alone', () => {
    const band = attentionBand(paint(readyWith([FAILING])));
    const headline = strings(band).filter((s) => /needs attention/.test(s));
    assert.equal(headline.length, 1, 'the sentence is real copy');
    // Painted, not announced-only: a screen-reader-only summary would fix
    // the accessibility case and break the sighted one.
    assert.equal(
      collect(band).some((n) => String(n.props?.className).includes('hr-sr-only')),
      false,
      'the summary is visible text',
    );
    // The glyph reinforces the words and adds nothing to the accessible name.
    const glyph = collect(band).find((n) => n.type === 'svg');
    assert.ok(glyph, 'the warning glyph stays');
    assert.equal(glyph.props['aria-hidden'], 'true', 'and is hidden from assistive tech');
  });

  it('the band is a polite status, not an alert', () => {
    // A routine failing is a condition to work through, not a blocked
    // operation: role="status" announces it without stealing focus.
    const band = attentionBand(paint(readyWith([FAILING])));
    assert.equal(band.props.role, 'status');
  });

  it('the summary counts the search matches, like the chips do', () => {
    // The number must answer "how many would I open?", not "how many exist
    // behind this search" — otherwise it promises rows the list cannot show.
    const tree = paint(readyWith([FAILING, SECOND_FAILING, HEALTHY]), { query: 'backup' });
    const band = attentionBand(tree);
    assert.match(strings(band).join(' '), /1 routine needs attention/);
    // And the focus it produces contains only that routine.
    assert.deepEqual(rowTitles(tree), ['Nightly backup']);
  });
});

// ── the focus affordance ──────────────────────────────────────────────

describe('the summary focuses the affected routines (issue #80)', () => {
  it('activating it focuses exactly the routines that need attention', () => {
    const state = readyWith([HEALTHY, FAILING, SECOND_FAILING, PAUSED_HISTORY]);
    const band = attentionBand(paint(state));
    const focus = collect(band).find(
      (n) => n.type === 'button' && n.props.children === 'Show them',
    );
    assert.ok(focus, 'the summary offers to focus the failing routines');

    reactStub.__resetStateUpdates();
    focus.props.onClick();
    const updates = reactStub.__stateUpdates();
    assert.equal(updates.length, 1, 'one state transition per click');
    const next = updates[0](state);
    assert.deepEqual(
      next.attentionFocus,
      [FAILING.job_id, SECOND_FAILING.job_id],
      'by canonical job_id — the focus is identity, not a display name',
    );
    assert.equal(next.filter, 'all', 'and the lifecycle slice is reset so nothing is hidden');
  });

  it('the focused list shows the failing routines and nothing else', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING, SECOND_FAILING, PAUSED_HISTORY], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING, SECOND_FAILING, PAUSED_HISTORY] },
    ]);
    const tree = paint(state);
    assert.deepEqual(
      rowTitles(tree).sort(),
      ['Nightly backup', 'RSS ingestion'],
      'exactly the routines that need attention, in either order',
    );
    // The paused historical failure is NOT dragged in: it is history, and the
    // focus carries the same rule the count does.
    assert.equal(
      rowTitles(tree).includes('Weekly report'),
      false,
      'a paused pre-pause failure stays out of the focus',
    );
  });

  it('a focus states itself and offers the way back', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING] },
    ]);
    const band = attentionBand(paint(state));
    assert.ok(band, 'the focused state is stated, not just implied by a shorter list');
    assert.match(strings(band).join(' '), /Showing 1 routine that needs attention/);

    const back = collect(band).find(
      (n) => n.type === 'button' && n.props.children === 'Show all routines',
    );
    assert.ok(back, 'and there is a way out of it');
    reactStub.__resetStateUpdates();
    back.props.onClick();
    assert.equal(reactStub.__stateUpdates()[0](state).attentionFocus, null);
  });

  it('a lifecycle chip answers a different question, so it drops the focus', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING] },
    ]);
    const next = routines.routinesViewReducer(state, { type: 'filter-changed', filter: 'paused' });
    assert.equal(next.filter, 'paused');
    assert.equal(
      next.attentionFocus,
      null,
      'choosing a lifecycle slice releases the focus, so the list can never be one question while claiming another',
    );
  });

  it('a focus on nothing is refused instead of emptying the list', () => {
    const state = readyWith([HEALTHY]);
    const next = routines.routinesViewReducer(state, {
      type: 'attention-focus',
      jobs: [HEALTHY],
    });
    assert.equal(next.attentionFocus, null, 'no failing routine means no focus to enter');
  });
});

// ── recovery ──────────────────────────────────────────────────────────

describe('a later verified success clears the attention state (issue #80)', () => {
  it('the summary goes quiet once the last failing routine recovers', () => {
    const before = paint(readyWith([HEALTHY, FAILING]));
    assert.ok(attentionBand(before), 'the failure is surfaced while it lasts');

    // The same routine after a successful run, with every stale field kept.
    const after = paint(readyWith([HEALTHY, { ...FAILING, ...RECOVERED, job_id: FAILING.job_id, name: FAILING.name }]));
    assert.equal(attentionBand(after), null, 'a recovered list is a healthy list again');
  });

  it('a focused routine that recovers leaves the focus, and an emptied focus is dropped', () => {
    const failing = { ...HEALTHY, ...FAILING };
    const alsoFailing = { ...HEALTHY, ...SECOND_FAILING };
    // A recovered copy of a row keeps its identity: only the run fields
    // change, so the focus can tell "this routine recovered" from "this is a
    // different routine".
    const recoveredFailing = { ...failing, ...RECOVERED, job_id: failing.job_id, name: failing.name };
    const recoveredAlso = { ...alsoFailing, ...RECOVERED, job_id: alsoFailing.job_id, name: alsoFailing.name };

    const focused = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, failing, alsoFailing], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, failing, alsoFailing] },
    ]);
    assert.deepEqual(focused.attentionFocus, [failing.job_id, alsoFailing.job_id]);

    // One recovery among several: the focus keeps the survivor.
    const partial = routines.routinesViewReducer(focused, {
      type: 'list-loaded',
      jobs: [HEALTHY, recoveredFailing, alsoFailing],
      key: 'c1::p1',
    });
    assert.deepEqual(
      partial.attentionFocus,
      [alsoFailing.job_id],
      'a recovered routine is no longer a target, and the rest stay',
    );

    // Every target recovered: the focus is dropped, not left as an empty set
    // that would filter the list to nothing with no control explaining why.
    const allRecovered = routines.routinesViewReducer(partial, {
      type: 'list-loaded',
      jobs: [HEALTHY, recoveredFailing, recoveredAlso],
      key: 'c1::p1',
    });
    assert.equal(allRecovered.attentionFocus, null);
    assert.notEqual(
      allRecovered.attentionFocus,
      [],
      'an empty array would filter the list to nothing while claiming a focus',
    );
  });

  it('a focus narrowed to nothing by a search says so, without blaming a filter', () => {
    // The only reachable empty focus: a search that no longer covers any
    // failing routine. (A recovery cannot produce it — `list-loaded`
    // re-derives the focus and releases it outright, which the case above
    // pins.) The copy must name the search, because the generic
    // "no routines match this filter" blames a filter the user never applied.
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING, SECOND_FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING, SECOND_FAILING] },
    ]);
    // The search matches only the healthy routine; the focus is still live.
    const tree = paint(state, { query: 'brief' });
    const copy = strings(tree).join(' ');
    assert.match(copy, /No failing routine matches this search/);
    assert.doesNotMatch(copy, /No routines match this filter/, 'it never blames a filter');
    assert.doesNotMatch(
      copy,
      /healthy latest run/,
      'nor claims every routine is healthy — this search is not showing them all',
    );
  });

  it('a search that keeps a failing routine still shows it under the focus', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING, SECOND_FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING, SECOND_FAILING] },
    ]);
    const tree = paint(state, { query: 'backup' });
    assert.deepEqual(rowTitles(tree), ['Nightly backup'], 'search and focus compose');
  });

  it('the focus bar counts the rows on screen, not the size of the focus', () => {
    // The lie this prevents: a focus of three with a search that keeps one
    // would announce "Showing 3 routines" above a list holding a single row.
    // The bar states what is actually shown, the same rule the chip counts
    // follow (issue #79).
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING, SECOND_FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING, SECOND_FAILING] },
    ]);
    const narrowed = paint(state, { query: 'backup' });
    assert.deepEqual(rowTitles(narrowed), ['Nightly backup'], 'one row survives the search');
    const copy = strings(attentionBand(narrowed)).join(' ');
    assert.match(copy, /Showing 1 routine that needs attention/, 'the bar agrees with the screen');
    assert.doesNotMatch(copy, /Showing 2|Showing 3/, 'and never with the focus size');

    // The unfocused view over the same search: still one, still honest.
    const unfocused = paint(readyWith([HEALTHY, FAILING, SECOND_FAILING]), { query: 'backup' });
    assert.match(
      strings(attentionBand(unfocused)).join(' '),
      /1 routine needs attention/,
      'the summary counts the search matches too',
    );
  });

  it('the focus bar is announced like the summary it replaces', () => {
    // Both band states are the same control in two states; if only the
    // summary carried role="status", leaving a focus would change the list
    // silently for anyone not watching it.
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [HEALTHY, FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [HEALTHY, FAILING] },
    ]);
    const band = attentionBand(paint(state));
    assert.equal(band.props.role, 'status', 'entering and leaving a focus are both announced');
    // A focus target, so the swap can hand focus here: the pressed control
    // unmounts with its band, and a keyboard user left on nothing has lost
    // their place on the page.
    assert.equal(band.props.tabIndex, -1);
    assert.equal(band.props.id, routines.ATTENTION_BAND_ID, 'and the id is a real focus target');
    // And the summary shares that id, so the focus restore works in both
    // directions rather than only on the way in.
    const summary = attentionBand(paint(readyWith([HEALTHY, FAILING])));
    assert.equal(summary.props.id, routines.ATTENTION_BAND_ID);
    assert.equal(summary.props.tabIndex, -1);
  });

  it('a failing routine with no job_id raises no band, so "Show them" is never dead', () => {
    // A control that cannot do what it says is worse than no control: the
    // band would claim a routine the focus cannot address, and every click
    // would dispatch a focus the reducer refuses.
    const tree = paint(readyWith([HEALTHY, { ...FAILING, job_id: undefined }]));
    assert.equal(attentionBand(tree), null, 'nothing focusable is failing, so nothing is claimed');
    // The row is still visible and still states its failure — excluded from
    // the focus, not hidden from the user.
    const copy = strings(tree).join(' ');
    assert.match(copy, /Nightly backup/, 'the row still renders');
    assert.match(copy, /Last run failed/, 'and still states the failure in words');
  });

  it('the page restores focus to the band that replaced the pressed control', () => {
    // The stub tree has no DOM, so the restore is pinned structurally: the
    // band is a real focus target (previous test), the page must call the
    // repo's own focus utility against that id when either control is
    // pressed, and it must not restore focus on a path that keeps the same
    // band mounted.
    const src = readFileSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx'), 'utf8');
    const restore = /function setAttentionFocus[\s\S]*?\n  }/.exec(src);
    assert.ok(restore, 'one place enters and leaves the focus');
    const body = restore[0];
    assert.match(
      body,
      /dispatch\(\{ type: 'attention-focus', jobs: searchMatches \}\)/,
      'focusing dispatches the focus',
    );
    assert.match(body, /dispatch\(\{ type: 'attention-focus-cleared' \}\)/, 'and leaving dispatches the clear');
    // The restore exists in ONE handler, so the two buttons cannot disagree
    // about it, and it targets the shared band id.
    assert.match(body, /focusById\(ATTENTION_BAND_ID\)/, 'focus lands on the replacement band');
    assert.equal(
      /focusById\(ATTENTION_BAND_ID\)/.test(src),
      true,
      'and it is the only focus restore for this band',
    );
    // Both controls route through that one handler.
    assert.match(src, /onFocus=\{\(\) => setAttentionFocus\('focus'\)\}/);
    assert.match(src, /onClick=\{\(\) => setAttentionFocus\('clear'\)\}/);
  });

  it('the band is a focus target in both states and both are polite statuses', () => {
    // One id, two mount points: the summary component (RoutineStates) and the
    // focus bar the page renders inline — it needs the visible row count and
    // the focus handler, so it cannot live in the stateless notice. The id is
    // what makes the focus restore work in BOTH directions, so both
    // mount points must use it, and neither may invent a second id.
    const states = readFileSync(path.join(root, 'src', 'views', 'RoutineStates.tsx'), 'utf8');
    const page = readFileSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx'), 'utf8');
    assert.equal(
      (states.match(/id=\{ATTENTION_BAND_ID\}/g) ?? []).length,
      1,
      'the summary mounts the band under the shared id',
    );
    assert.equal(
      (page.match(/id=\{ATTENTION_BAND_ID\}/g) ?? []).length,
      1,
      'and so does the focus bar',
    );
    assert.equal(
      /ATTENTION_BAND_ID = 'hermes-routines-attention'/.test(states),
      true,
      'the id is a stable, namespaced string',
    );
    // No second, ad-hoc band id that focus could never resolve.
    assert.equal(/id="hermes-routines-attention/.test(page + states), false);
  });
});

// ── transient state cannot survive an inventory change ────────────────

describe('a focus never outlives the rows it names (issue #80)', () => {
  it('a profile switch clears it', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [FAILING] },
    ]);
    assert.deepEqual(state.attentionFocus, [FAILING.job_id]);
    const next = routines.routinesViewReducer(state, {
      type: 'active-changed',
      profile: 'p2',
      connectionId: 'c1',
    });
    assert.equal(
      next.attentionFocus,
      null,
      "another profile's rows can never be filtered by this one's focus",
    );
  });

  it('a routes reload clears it', () => {
    const state = reduce([
      { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
      { type: 'list-loaded', jobs: [FAILING], key: 'c1::p1' },
      { type: 'attention-focus', jobs: [FAILING] },
    ]);
    assert.equal(routines.routinesViewReducer(state, { type: 'routes-loading' }).attentionFocus, null);
    assert.equal(routines.routinesViewReducer(state, { type: 'retry-routes' }).attentionFocus, null);
    assert.equal(
      routines.routinesViewReducer(state, { type: 'routes-error', error: 'door shut' }).attentionFocus,
      null,
    );
  });

  it('the initial state has no focus', () => {
    assert.equal(routines.initialRoutinesState().attentionFocus, null);
  });
});

// ── the row still tells the truth ─────────────────────────────────────

describe('excluding paused failures from the count does not hide them (issue #80)', () => {
  it('the paused row keeps stating its own failure in words', () => {
    // The attention count is the actionable slice; the ROW is where the
    // history is read (issue #76's hierarchy, unchanged here). If this ever
    // stopped, excluding paused failures would have become hiding them.
    const tree = paint(readyWith([PAUSED_HISTORY]));
    const subtitle = byClass(tree, 'hr-row-subtitle')[0];
    assert.ok(subtitle, 'the row renders a summary line');
    const copy = strings(subtitle).join(' ');
    assert.match(copy, /Paused/);
    assert.match(copy, /Last run failed/, 'the historical failure is still stated on the row');
  });
});

// ── source contract ───────────────────────────────────────────────────

describe('the health dimension is modeled, not re-derived by the view (issue #80)', () => {
  it('the verdict lives in one domain module and is exported by the artifact', () => {
    const src = readFileSync(path.join(root, 'src', 'domain', 'attention.ts'), 'utf8');
    assert.match(src, /export function attentionOf/, 'one place decides what needs attention');
    assert.equal(typeof routines.attentionOf, 'function', 'and the artifact exports it');
    assert.equal(typeof routines.needsAttention, 'function');
    assert.equal(typeof routines.attentionTargets, 'function');
    assert.equal(typeof routines.attentionCount, 'function');
  });

  it('the page reads the verdict instead of asking the row tokens again', () => {
    const page = readFileSync(path.join(root, 'src', 'views', 'RoutinesPage.tsx'), 'utf8');
    assert.match(page, /attentionTargets|needsAttention/, 'the summary is fed by the domain');
    // The precedence must live in the domain, not be re-derived per surface.
    assert.doesNotMatch(
      page,
      /last_status\s*===\s*'failed'/,
      'the page must not re-implement the failure token test',
    );
  });

  it('the band is styled as a quiet band, not an alarm', () => {
    const styles = css();
    const band = /\.hr-attention \{([^}]*)\}/.exec(styles);
    assert.ok(band, 'the attention band needs its own rule');
    assert.match(band[1], /flex-wrap:\s*wrap/, 'it wraps instead of pushing the list off-screen');
    assert.match(band[1], /font-size:\s*12px/, 'and it stays in the page’s secondary scale');
    // The state is written, so the red accent reinforces rather than carries.
    assert.match(band[1], /var\(--ui-red/, 'the accent color');
    assert.match(band[1], /var\(--ui-text-primary/, 'and the text keeps its own contrast');
    assert.match(/\.hr-attention-text \{([^}]*)\}/.exec(styles)[1], /font-weight:\s*600/, 'the headline reads first');
  });
});
