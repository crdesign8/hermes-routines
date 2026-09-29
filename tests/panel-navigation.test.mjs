// Panel navigation follows the layout (issue #78).
//
// The routines list stays on screen beside the right-side panel in the
// split view, so "Back to routines" there promised a navigation that never
// happened: the user did not leave anything. That view needs a dismiss
// affordance. On a narrow viewport the panel DOES cover the list, so there
// the same control is honestly a back navigation.
//
// What this file pins:
//
//   split view   -> a labelled close icon, no misleading "Back"
//   narrow view  -> the Back affordance, and the icon gone
//   which wins   -> the stylesheet's 820px breakpoint, once, not a
//                   media-query handler duplicating the number
//   Escape       -> dismisses the open panel, and only then
//   focus        -> returns to the row the inspector belonged to
//   labels       -> explicit, per panel, never a bare "×"
//
// Fixtures carry a technical `job_id` AND a distinct human title (issue #45
// lesson), so a focus target can never be satisfied by a display name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

const JOB = {
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
 * `isCreating` is what makes the composer the open surface, so a composer
 * Escape test presets it here.
 */
function paint({ jobs = [JOB], selectedKey = null, isCreating = false } = {}) {
  reactStub.__presetStates([
    [loadedState(jobs), noop],
    [0, noop],
    ['', noop],
    [selectedKey, noop],
    [isCreating, noop],
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
      collect(node.type(node.props), out);
    } else {
      collect(node.props ? node.props.children : null, out);
    }
    return out;
  }
  return out;
}

function texts(tree) {
  const out = [];
  function walk(n) {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (typeof n === 'object' && n.props && n.props.children) walk(n.props.children);
  }
  walk(tree);
  return out;
}

function byClass(tree, className) {
  return collect(tree).filter((n) => typeof n.props?.className === 'string' && n.props.className.includes(className));
}

/** The dismiss (icon) control and the back (labelled) control, by class. */
function navControls(tree) {
  const nav = collect(tree).filter(
    (n) => n.type === 'button' && typeof n.props.className === 'string' && n.props.className.includes('hr-btn-nav'),
  );
  return {
    all: nav,
    back: nav.find((n) => n.props.className.includes('hr-nav-back')) ?? null,
    close: nav.find((n) => n.props.className.includes('hr-nav-close')) ?? null,
  };
}

function workspace(tree) {
  return collect(tree).find((n) => typeof n.props?.className === 'string' && n.props.className.includes('hr-workspace'));
}

function inspector(tree) {
  return collect(tree).find((n) => n.type === 'aside' && n.props.className.includes('hr-inspector'));
}

// ── split view: dismiss, not Back ───────────────────────────────────────

describe('the split view offers a dismiss control, not a back navigation (issue #78)', () => {
  it('the inspector header paints both controls, the dismiss one labelled for this routine', () => {
    const tree = paint({ selectedKey: JOB.job_id });
    const panel = inspector(tree);
    assert.ok(panel, 'the inspector is open');
    const nav = navControls(panel);
    assert.equal(nav.all.length, 2, 'the panel keeps one dismiss + one back control');

    // The icon button is the honest affordance here: the list is still on
    // screen. Its accessible name states the action, not a glyph.
    assert.equal(nav.close.props.type, 'button', 'a native button is keyboard reachable');
    assert.equal(
      nav.close.props['aria-label'],
      'Close details for Morning Political Manager Brief',
      'the control names the action and the routine it closes',
    );
    assert.match(texts(nav.close).join(''), /^$/, 'the control itself paints no words beside the icon');
    const glyph = Array.isArray(nav.close.props.children) ? nav.close.props.children : [nav.close.props.children];
    assert.equal(glyph.length, 1, 'just the glyph');
    assert.equal(glyph[0].type, 'svg');
    // The accessible name is on the button, so the glyph is decoration: a
    // screen reader must hear the action, not "graphic". Same literal form
    // the rest of the plugin's icons use.
    assert.equal(String(glyph[0].props['aria-hidden']), 'true', 'the glyph is decorative');
  });

  it('every panel offers a dismiss control with its own explicit label', () => {
    const inspectorNav = navControls(inspector(paint({ selectedKey: JOB.job_id })));
    assert.match(inspectorNav.close.props['aria-label'], /^Close details for /);

    const composer = routines.RoutineComposerPanel({
      activeProfile: 'p1',
      activeRoute: ROUTE,
      disabled: false,
      onClose: noop,
      onSubmit: async () => true,
    });
    const composerNav = navControls(composer);
    assert.ok(composerNav.close, 'the composer offers the same dismiss control');
    assert.equal(composerNav.close.props['aria-label'], 'Cancel and close the create form');

    const guided = routines.GuidedRoutinePanel({
      routine: {
        jobId: JOB.job_id,
        job: JOB,
        route: ROUTE,
        backendProfile: 'p1',
        targetProfile: 'p1',
      },
      submittedName: JOB.name,
      submittedSchedule: '0 9 * * *',
      submittedPrompt: JOB.prompt,
      activeRoute: ROUTE,
      onLaunch: async () => ({ ok: true }),
      onClose: noop,
    });
    const guidedNav = navControls(guided);
    assert.ok(guidedNav.close, 'the guided panel offers the same dismiss control');
    assert.equal(guidedNav.close.props['aria-label'], 'Close configuration and return to routines');
  });

  it('the dismiss control dismisses: it calls the panel close, never anything else', () => {
    let closed = 0;
    const panel = routines.RoutineInspectorPanel({
      job: JOB,
      fallback: 'Routine',
      activeRoute: ROUTE,
      activeProfile: 'p1',
      busy: false,
      disabled: false,
      onClose: () => {
        closed += 1;
      },
      onPause: noop,
      onResume: noop,
    });
    const nav = navControls(panel);
    for (const control of [nav.back, nav.close]) {
      control.props.onClick();
    }
    assert.equal(closed, 2, 'either affordance leaves the panel, and nothing else happens');
  });

  it('the narrow layout keeps the back control with the wording it needs', () => {
    // The back control exists in the markup for the narrow layout; what
    // would be wrong is if the split view ever showed it. The stylesheet
    // decides that, and it is asserted separately.
    const nav = navControls(inspector(paint({ selectedKey: JOB.job_id })));
    assert.ok(nav.back, 'the narrow-viewport back control is present');
    assert.equal(nav.back.props['aria-label'], 'Back to routines');
    assert.match(texts(nav.back).join(''), /Back to routines/, 'with the exact wording the narrow layout needs');
  });
});

// ── which control wins: the stylesheet's breakpoint ─────────────────────

describe('the stylesheet decides which control the layout can offer (issue #78)', () => {
  it('the split view hides Back and shows the dismiss icon', () => {
    const css = readFileSync(stylesPath, 'utf8');
    // Only the rules BEFORE the narrow query: inside it the roles are
    // swapped, and asserting against the whole file would pass for the
    // wrong layout.
    const split = css.split('@media (max-width: 820px)')[0];
    assert.match(split, /\.hr-nav \{/, 'the panel navigation is styled');
    assert.match(split, /\.hr-nav-back \{ display: none; \}/, 'Back is out of the split view');
    assert.equal(
      /\.hr-nav-close \{ display: none; \}/.test(split),
      false,
      'the dismiss icon is the control the split view shows',
    );
  });

  it('the narrow viewport swaps them inside the existing 820px query', () => {
    const css = readFileSync(stylesPath, 'utf8');
    // The stylesheet is an array of single-line strings, so the query's
    // closing brace is quoted: `'  }',`.
    const media = /@media \(max-width: 820px\) \{([\s\S]*?)\n\s*'\}',/.exec(css);
    assert.ok(media, 'the narrow-viewport query must exist');
    const block = media[1];
    assert.match(block, /\.hr-nav-back \{ display: inline-flex; \}/, 'the panel covers the list: Back is honest');
    assert.match(block, /\.hr-nav-close \{ display: none; \}/, 'and the dismiss icon steps aside');
  });

  it('the hidden control is display:none, never a focusable ghost', () => {
    const css = readFileSync(stylesPath, 'utf8');
    // visibility:hidden would remove the paint and keep the tab stop.
    for (const cls of ['hr-nav-back', 'hr-nav-close']) {
      const rules = [...css.matchAll(new RegExp(`\\.${cls} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
      assert.ok(rules.length > 0, `${cls} must be styled`);
      for (const body of rules) {
        if (/display:\s*none/.test(body)) {
          assert.equal(
            /visibility:\s*hidden/.test(body),
            false,
            `${cls} must leave the tab order, not just the paint`,
          );
        }
      }
    }
  });

  it('the breakpoint is not re-derived in TypeScript', () => {
    // A second copy of 820 could drift from the query the workspace already
    // uses and flip the two layouts apart.
    const base = path.resolve(here, '..', 'src');
    for (const rel of readdirSync(base, { recursive: true })) {
      const file = String(rel);
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const src = readFileSync(path.join(base, file), 'utf8');
      assert.equal(/matchMedia/.test(src), false, `${file} must not re-derive the breakpoint in JS`);
    }
  });
});

// ── Escape ─────────────────────────────────────────────────────────────

describe('Escape dismisses the open panel, and only the open panel (issue #78)', () => {
  function pressEscape(tree, target = null) {
    reactStub.__resetStateUpdates();
    const event = {
      key: 'Escape',
      target,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    workspace(tree).props.onKeyDown(event);
    return { event, updates: reactStub.__stateUpdates() };
  }

  it('the whole workspace handles the key, so focus can be anywhere inside it', () => {
    const ws = workspace(paint({ selectedKey: JOB.job_id }));
    assert.equal(typeof ws.props.onKeyDown, 'function', 'the split view owns the Escape handler');
  });

  it('Escape closes the inspector', () => {
    const { updates, event } = pressEscape(paint({ selectedKey: JOB.job_id }));
    assert.ok(updates.includes(null), 'the selection is cleared — the panel unmounts');
    assert.equal(event.defaultPrevented, true, 'and the key does not fall through to the host');
  });

  it('Escape closes the composer, and leaves the selection alone', () => {
    const { updates } = pressEscape(paint({ isCreating: true }));
    assert.ok(updates.includes(false), 'creating is off — the form unmounts');
    assert.equal(updates.includes(null), false, 'it never touches a selection it did not own');
  });

  it('with nothing open the key is not handled at all', () => {
    const { updates, event } = pressEscape(paint());
    assert.deepEqual(updates, [], 'no panel to dismiss');
    assert.equal(event.defaultPrevented, false, 'so the key stays available to the page and the host');
  });

  it('a focused field or open dropdown keeps its own Escape', () => {
    // The composer is built from dropdowns that close on Escape. A key that
    // also dismissed the form would resolve two intents at once, and only
    // the first is recoverable.
    const field = { tagName: 'INPUT', getAttribute: () => null };
    const combo = { tagName: 'DIV', getAttribute: (name) => (name === 'role' ? 'combobox' : null) };
    for (const target of [field, combo]) {
      const { updates, event } = pressEscape(paint({ isCreating: true }), target);
      assert.deepEqual(updates, [], 'the focused control owns the key');
      assert.equal(event.defaultPrevented, false, 'so the panel does not also close');
    }
  });

  it('the ownership rule is a decision, not a guess', () => {
    assert.equal(routines.escapeLeavesPanel(null), true, 'a body-level press leaves the panel');
    assert.equal(routines.escapeLeavesPanel({ tagName: 'TEXTAREA', getAttribute: () => null }), false);
    assert.equal(routines.escapeLeavesPanel({ tagName: 'SELECT', getAttribute: () => null }), false);
    assert.equal(
      routines.escapeLeavesPanel({ tagName: 'BUTTON', getAttribute: () => null }),
      true,
      'a control inside the panel still leaves the panel',
    );
    assert.equal(routines.escapeLeavesPanel({ tagName: 'div', getAttribute: () => null }), true);
  });
});

// ── focus restoration ──────────────────────────────────────────────────

describe('closing returns focus where the user would continue (issue #78)', () => {
  it('the inspector returns focus to the row it belonged to', () => {
    assert.equal(
      routines.dismissFocusId('inspector', JOB.job_id),
      routines.routineRowFocusId(JOB.job_id),
      'the target is the row control, derived from the same key the inspector used',
    );
  });

  it('the composer returns focus to the control that opened it', () => {
    assert.equal(routines.dismissFocusId('composer', null), routines.NEW_ROUTINE_CONTROL_ID);
  });

  it('the guided panel invents nothing, and an empty key is not a target', () => {
    assert.equal(routines.dismissFocusId('guided', JOB.job_id), null, 'its opener unmounts behind the panel');
    assert.equal(routines.dismissFocusId('inspector', null), null, 'no row means no focus guess');
    assert.equal(routines.dismissFocusId('inspector', ''), null);
  });

  it('the row control actually exists under that id, so the target resolves', () => {
    const row = byClass(paint(), 'hr-icon-btn-edit');
    assert.equal(row.length, 1, 'one Details control for the single row');
    assert.equal(
      row[0].props.id,
      routines.routineRowFocusId(JOB.job_id),
      'and it is addressable by the id focus restoration uses',
    );
  });

  it('the New routine control is addressable by the composer focus target', () => {
    const newBtn = collect(paint()).find((n) => n.type === 'button' && n.props['aria-label'] === 'New routine');
    assert.ok(newBtn, 'the opener exists');
    assert.equal(newBtn.props.id, routines.NEW_ROUTINE_CONTROL_ID);
  });

  it('focusById never claims a success it cannot have', () => {
    assert.equal(routines.focusById(null), false, 'no target is not an error');
    assert.equal(routines.focusById('hermes-routines-row--missing'), false, 'a node that is not there is not focused');
  });
});
