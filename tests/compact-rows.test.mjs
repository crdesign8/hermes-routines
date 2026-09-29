// Compact list rows; the inspector owns the detail metadata (issue #77).
//
// The routine list used to expand the selected row into a full detail block
// (Schedule / Next run / Last run / Last result) that duplicated the lateral
// inspector verbatim and reflowed the whole list on every selection. This
// file pins the replacement contract:
//
//   selection    -> marks the row (tint + accent bar, same box)
//   detail       -> the inspector alone, at a real aria-controls target
//   row height   -> identical selected or not, one truncated summary line
//   narrow view  -> the inspector is the primary, full-width surface
//
// Fixtures mirror the upstream contract throughout: a technical `job_id` AND
// a distinct human title on the same row (issue #45 lesson), so a selection
// can never be satisfied by a display name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.resolve(here, '..', 'src', 'views', 'routinesStyles.ts');

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const noop = () => {};
const HOUR = 60 * 60_000;
const wallClock = (ms) => new Date(Date.now() + ms).toISOString();

const BASE = {
  job_id: '84c47f11a2bd',
  name: 'Morning Political Manager Brief',
  schedule: '0 9 * * *',
  schedule_display: 'Every day at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
};

// ── harness ────────────────────────────────────────────────────────────

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loadedState(jobs) {
  return reduce([
    { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
    { type: 'list-loaded', jobs, key: 'c1::p1' },
  ]);
}

/**
 * RoutinesPage hooks in order:
 *   [state, routesNonce, searchQuery, selectedJobKey, isCreating, guided, guidedRecent]
 * The selected key is what a click on a row sets, so the whole list+inspector
 * page can be painted in the selected state.
 */
function paint(jobs, selectedKey = null) {
  reactStub.__presetStates([
    [loadedState(jobs), noop],
    [0, noop],
    ['', noop],
    [selectedKey, noop],
    [false, noop],
    [null, noop],
    [null, noop],
  ]);
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const route = items.filter((c) => c.area === 'routes')[0];
  let tree = route.render();
  if (tree && typeof tree === 'object' && typeof tree.type === 'function') {
    tree = tree.type(tree.props);
  }
  return tree;
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

function texts(node) {
  return collect(node)
    .map((n) => n.props.children)
    .flat(6)
    .filter((c) => typeof c === 'string');
}

/** The `li` rows, in document order. */
function rows(tree) {
  return collect(tree).filter((n) => n.type === 'li');
}

/** The nodes carrying exactly `className`. */
function byClass(tree, className) {
  return collect(tree).filter((n) => n.props?.className === className);
}

/** The inspector, or null when nothing is selected. */
function inspector(tree) {
  return collect(tree).find((n) => n.props?.className === 'hr-inspector') ?? null;
}

/** Every user-readable string on the page, joined. */
function copy(tree) {
  return texts(tree).join(' | ');
}

// ── selection ──────────────────────────────────────────────────────────

describe('selecting a routine marks the row and opens the inspector (issue #77)', () => {
  it('a selected row is marked, and the inspector owns the detail metadata', () => {
    const jobs = [{ ...BASE, last_run_at: wallClock(-2 * HOUR), last_status: 'success' }];
    const tree = paint(jobs, '84c47f11a2bd');

    const selected = rows(tree).filter((n) => String(n.props.className).includes('hr-row-selected'));
    assert.equal(selected.length, 1, 'exactly one row carries the selected state');
    assert.equal(
      rows(tree).length,
      1,
      'and the list did not grow a second row to host the detail block',
    );

    const panel = inspector(tree);
    assert.ok(panel, 'the inspector is the detail surface');
    assert.equal(
      panel.props.id,
      routines.INSPECTOR_PANEL_ID,
      'the panel carries the id the rows disclose',
    );
  });

  it('with nothing selected the rows are unmarked and no inspector exists', () => {
    const tree = paint([BASE]);
    assert.equal(
      rows(tree).some((n) => String(n.props.className).includes('hr-row-selected')),
      false,
      'an unselected list marks no row',
    );
    assert.equal(inspector(tree), null, 'and shows no detail surface');
  });

  it('selection is a toggle: the control that opened the inspector closes it', () => {
    // A row is a disclosure, so activating the row that already owns the
    // inspector must hand the surface back rather than being a one-way door.
    const jobs = [{ ...BASE }, { job_id: '19bd7c0a3f11', name: 'Evening digest', schedule: '0 21 * * *' }];
    const calls = [];
    const list = routines.RoutineList({
      jobs,
      pending: [],
      locked: false,
      inspectedId: '84c47f11a2bd',
      inspectorId: routines.INSPECTOR_PANEL_ID,
      onInspect: (key) => calls.push(key),
      onPause: noop,
      onResume: noop,
    });
    const cards = collect(list).filter((n) => n.type === 'li' && n.props?.className);
    assert.equal(cards.length, 2);
    // The selected row closes the inspector; a different row takes it over.
    cards[0].props.onClick({ target: { closest: () => null } });
    cards[1].props.onClick({ target: { closest: () => null } });
    assert.deepEqual(calls, [null, '19bd7c0a3f11'], 're-selecting closes, selecting another takes over');
  });
});

// ── no expansion, no reflow ────────────────────────────────────────────

describe('a row never expands into a detail block (issue #77)', () => {
  it('the list renders no in-place detail block, selected or not', () => {
    const jobs = [{ ...BASE, last_run_at: wallClock(-2 * HOUR), last_status: 'success' }];
    for (const selected of [null, '84c47f11a2bd']) {
      const tree = paint(jobs, selected);
      assert.equal(byClass(tree, 'hr-row-details').length, 0, 'no in-place detail container exists');
      assert.equal(byClass(tree, 'hr-details').length, 0, 'no expanded detail list exists');
      assert.equal(
        byClass(tree, 'hr-row-subtitle').length,
        1,
        'the row keeps exactly one summary line, selected or not',
      );
    }
  });

  it('a selected row and an idle row render the same structure', () => {
    const jobs = [
      { ...BASE, job_id: 'aaaaaaaaaaaa', name: 'Selected routine' },
      { job_id: 'bbbbbbbbbbbb', name: 'Idle routine' },
    ];
    const tree = paint(jobs, 'aaaaaaaaaaaa');
    const [first, second] = rows(tree);
    // Height stability is structural: the selected row carries one more
    // class and nothing else — no extra children, no detail subtree.
    assert.equal(first.props.children.length, second.props.children.length, 'same child count');
    assert.equal(
      String(second.props.className).split(' ').length + 1,
      String(first.props.className).split(' ').length,
      'the only difference is the selected marker class',
    );
  });

  it('the subtitle is a single line that truncates instead of wrapping', () => {
    // A long schedule must not stack a row into a taller block; the full
    // sentence is the inspector's job.
    const css = readFileSync(stylesPath, 'utf8');
    const rule = /\.hr-row-subtitle \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'the subtitle must have its own style rule');
    assert.match(rule[1], /white-space:\s*nowrap/, 'the summary stays on one line');
    assert.match(rule[1], /text-overflow:\s*ellipsis/, 'overflow truncates instead of growing');
    // text-overflow:ellipsis has NO effect on a flex container — it would
    // clip at the edge with no glyph and no hint that the line continues.
    assert.match(
      rule[1],
      /display:\s*block/,
      'truncation must live on a block container, or the ellipsis never paints',
    );
    assert.doesNotMatch(
      rule[1],
      /display:\s*flex/,
      'a flex subtitle would silently clip instead of truncating',
    );
    assert.doesNotMatch(
      rule[1],
      /flex-wrap:\s*wrap/,
      'a wrapping subtitle is what reflowed the list',
    );
  });

  it('the list owns no expansion state, so it cannot grow a row', () => {
    // The rendered-shape assertions above hold at rest, but the pre-fix
    // defect only appeared AFTER a click (the list kept a per-row expansion
    // set). The invariant that actually prevents it is structural: the list
    // has no expansion state and the row has no grown state to feed.
    const listSrc = readFileSync(path.resolve(here, '..', 'src', 'views', 'RoutineList.tsx'), 'utf8');
    assert.equal(
      /expandedNames|onToggleExpand|hr-row-expanded/.test(listSrc),
      false,
      'the list must not keep a per-row expansion set',
    );

    const cardSrc = readFileSync(path.resolve(here, '..', 'src', 'views', 'RoutineCard.tsx'), 'utf8');
    assert.equal(
      /expanded[\s:]*[?:]|RoutineDetails|hr-row-details/.test(cardSrc),
      false,
      'the row must take no expanded prop and render no detail block',
    );
  });

  it('the selected marker paints on the row box, never around it', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const bar = /\.hr-row-selected::before \{([^}]*)\}/.exec(css);
    assert.ok(bar, 'selection must have a visible marker');
    assert.match(bar[1], /position:\s*absolute/, 'the marker cannot take layout space');
    assert.match(bar[1], /background:/, 'and it must actually paint something');
    assert.equal(
      /\.hr-row-expanded/.test(css),
      false,
      'the expanded-row class is gone: a row has no grown state to style',
    );
  });
});

// ── one primary home for the metadata ──────────────────────────────────

describe('detailed metadata lives in the inspector alone (issue #77)', () => {
  it('the row states a failure compactly and the inspector owns the detail rows', () => {
    const tree = paint(
      [
        {
          ...BASE,
          last_run_at: wallClock(-2 * HOUR),
          last_status: 'failed',
          last_fire_error: 'command not found: hermes',
          next_run_at: wallClock(3 * HOUR),
        },
      ],
      '84c47f11a2bd',
    );
    // The row keeps the summary an operator scans for (issue #76), on one line.
    const sub = byClass(tree, 'hr-row-subtitle')[0];
    const rowCopy = texts(sub).join(' ');
    assert.match(rowCopy, /Every day at 09:00/);
    assert.match(rowCopy, /Last run failed/, 'the failure stays compactly visible in the row');
    assert.match(rowCopy, /Next run in 3 hours/);
    assert.equal(byClass(sub, 'hr-detail').length, 0, 'no label/value detail row in the list');

    // The inspector carries the full story.
    const panel = texts(inspector(tree)).join(' ');
    assert.match(panel, /LAST EXECUTION/);
    assert.match(panel, /command not found/, 'the reason is in the detail surface');
  });

  it('the expanded detail component is deleted, not left as a second renderer', () => {
    assert.equal(routines.RoutineDetails, undefined, 'the in-place detail component is gone');
    const entry = readFileSync(path.resolve(here, '..', 'src', 'plugin.tsx'), 'utf8');
    assert.equal(
      entry.includes('RoutineDetails'),
      false,
      'and it is no longer exported for a second surface to use',
    );
  });
});

// ── keyboard accessibility ─────────────────────────────────────────────

describe('selection stays obvious and keyboard reachable (issue #77)', () => {
  it('the row title is focusable and toggles selection with Enter and Space', () => {
    const calls = [];
    const list = routines.RoutineList({
      jobs: [{ ...BASE }],
      pending: [],
      locked: false,
      inspectedId: null,
      inspectorId: routines.INSPECTOR_PANEL_ID,
      onInspect: (key) => calls.push(key),
      onPause: noop,
      onResume: noop,
    });
    const title = collect(list).find(
      (n) => typeof n.props?.className === 'string' && n.props.className === 'hr-row-title',
    );
    assert.ok(title, 'the row title is the selection affordance');
    assert.equal(title.props.tabIndex, 0, 'it must be reachable by keyboard');
    assert.equal(title.props.role, 'button', 'and announced as an activatable control');
    assert.equal(title.props['aria-expanded'], false, 'disclosure state at rest');
    // Collapsed: no relation, because the panel is not mounted.
    assert.equal(title.props['aria-controls'], undefined);

    const stop = () => {};
    title.props.onKeyDown({ key: 'Enter', preventDefault: stop });
    title.props.onKeyDown({ key: ' ', preventDefault: stop });
    assert.deepEqual(calls, ['84c47f11a2bd', '84c47f11a2bd'], 'Enter and Space both select');

    // A key that is neither must not select.
    calls.length = 0;
    title.props.onKeyDown({ key: 'a', preventDefault: stop });
    assert.deepEqual(calls, [], 'other keys are left to the browser');

    // The relation is derived from the selection, so it cannot dangle: an
    // open row names the panel, a closed row names nothing.
    const open = collect(
      routines.RoutineCard({
        job: { ...BASE },
        fallback: 'Routine',
        inspected: true,
        busy: false,
        disabled: false,
        inspectorId: routines.INSPECTOR_PANEL_ID,
        onSelect: noop,
        onPause: noop,
        onResume: noop,
      }),
    ).find((n) => n.props?.className === 'hr-row-title');
    assert.equal(open.props['aria-expanded'], true);
    assert.equal(open.props['aria-controls'], routines.INSPECTOR_PANEL_ID, 'an open row names the panel');
  });

  it('the details button carries the same disclosure relation as the title', () => {
    const tree = paint([BASE]);
    const toggles = collect(tree).filter(
      (n) => n.type === 'button' && n.props['aria-expanded'] !== undefined,
    );
    assert.ok(toggles.length >= 1, 'the details button discloses the inspector');
    for (const toggle of toggles) {
      assert.equal(toggle.props['aria-expanded'], false);
      assert.equal(
        toggle.props['aria-controls'],
        undefined,
        'a collapsed row references no panel, exactly like the row title',
      );
    }

    const open = paint([BASE], '84c47f11a2bd');
    const opened = collect(open).filter(
      (n) => n.type === 'button' && n.props['aria-expanded'] === true,
    );
    assert.ok(opened.length >= 1, 'the selected row opens the relation');
    for (const toggle of opened) {
      assert.equal(toggle.props['aria-controls'], routines.INSPECTOR_PANEL_ID);
    }
  });

  it('a caller that omits the inspector id still gets the panel id', () => {
    // The prop is optional and defaults to the panel's own id, so a caller
    // cannot silently hand every row an undefined relation.
    const list = routines.RoutineList({
      jobs: [{ ...BASE }],
      pending: [],
      locked: false,
      inspectedId: '84c47f11a2bd',
      onInspect: noop,
      onPause: noop,
      onResume: noop,
    });
    const card = collect(list).find((n) => n.type === 'li');
    const title = collect(card).find((n) => n.props?.className === 'hr-row-title');
    assert.equal(title.props['aria-controls'], routines.INSPECTOR_PANEL_ID);
  });
});

// ── narrow viewport ────────────────────────────────────────────────────

describe('the inspector is the primary detail surface on a narrow viewport (issue #77)', () => {
  it('the narrow media query widens the inspector and keeps the row compact', () => {
    const css = readFileSync(stylesPath, 'utf8');
    // The stylesheet is an array of single-line strings, so the query's
    // closing brace is quoted: `'  }',`.
    const media = /@media \(max-width: 820px\) \{([\s\S]*?)\n\s*'\}',/.exec(css);
    assert.ok(media, 'the narrow-viewport query must exist');
    const block = media[1];

    const inspectorRule = /\.hr-inspector \{([^}]*)\}/.exec(block);
    assert.ok(inspectorRule, 'the inspector is restyled on a narrow viewport');
    assert.match(inspectorRule[1], /width:\s*100%/, 'it takes the full width');
    assert.match(inspectorRule[1], /flex:\s*1 1 auto/, 'and grows into the space the list does not need');
    assert.match(inspectorRule[1], /border-left:\s*none/, 'the lateral divider is dropped');

    const rowRule = /\.hr-row \{([^}]*)\}/.exec(block);
    assert.ok(rowRule, 'the row is restyled on a narrow viewport');
    assert.match(rowRule[1], /padding:\s*12px 4px/, 'the row tightens rather than growing');
  });
});

// ── pause / terminal rows still behave ─────────────────────────────────

describe('paused and terminal rows keep their compact shape (issue #77)', () => {
  it('a paused row states Paused plus its failure, without a detail block', () => {
    const tree = paint(
      [{ ...BASE, enabled: false, state: 'paused', last_run_at: wallClock(-2 * HOUR), last_status: 'failed' }],
      '84c47f11a2bd',
    );
    const rowCopy = texts(byClass(tree, 'hr-row-subtitle')[0]).join(' ');
    assert.match(rowCopy, /Paused/);
    assert.match(rowCopy, /Last run failed/);
    assert.equal(byClass(tree, 'hr-row-details').length, 0, 'a paused row expands no further');
  });

  it('a terminal row has no pause/resume control and still reads its summary', () => {
    const tree = paint([{ ...BASE, state: 'completed', last_status: 'success' }]);
    const actions = collect(tree)
      .filter((n) => n.type === 'button')
      .map((n) => n.props.children);
    assert.equal(actions.includes('Pause'), false, 'a completed routine cannot be paused');
    assert.equal(actions.includes('Resume'), false, 'nor resumed');
    assert.ok(actions.includes('Details'), 'the detail surface stays reachable');
    assert.match(
      texts(byClass(tree, 'hr-row-subtitle')[0]).join(' '),
      /Every day at 09:00/,
      'and the summary line is still painted',
    );
  });
});
