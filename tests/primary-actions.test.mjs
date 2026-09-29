// Primary actions are labeled, hit targets are real, and the count is
// painted once (issue #79).
//
// Three defects, one contract:
//
//   create action -> a labeled pill, not a bare "+" glyph
//   row actions   -> a target you can hit, not a 24px box round a 13px icon
//   counts        -> one number per filter chip, no "Showing all N routines."
//
// The counts are the subtle one. Each chip must report what IT would open,
// so the counts are taken over the search matches with NO status filter
// applied. Computing them from the already-filtered rows is the bug this
// file exists to prevent: on the Paused filter that makes "Paused 0" while
// five paused routines exist, because the active filter removed them before
// anybody counted.
//
// Fixtures mirror the upstream contract: a technical `job_id` AND a distinct
// human title on the same row, so nothing here can be satisfied by a name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) can be exercised behaviorally under node:test
// (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stylesPath = path.join(root, 'src', 'views', 'routinesStyles.ts');
const pagePath = path.join(root, 'src', 'views', 'RoutinesPage.tsx');

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const noop = () => {};

// ── harness ────────────────────────────────────────────────────────────

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

function renderView(state) {
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
 * The search query sits in the third slot, which is what lets a test paint
 * the chip counts under an active search.
 */
function paint(jobs, { query = '', filter = 'all' } = {}) {
  const state = { ...readyWith(jobs), filter };
  reactStub.__presetStates([
    [state, noop],
    [0, noop],
    [query, noop],
    [null, noop],
    [false, noop],
    [null, noop],
    [null, noop],
  ]);
  return renderView(state);
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
 * Every rendered string on the page. The <style> element is skipped: the
 * stub tree carries ROUTINES_CSS as a text child, and a stylesheet is not
 * copy a user reads.
 */
function texts(node) {
  return collect(node)
    .filter((n) => n.type !== 'style')
    .map((n) => n.props.children)
    .flat(6)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .map(String);
}

function byClass(tree, className) {
  return collect(tree).filter((n) => n.props?.className === className);
}

function buttons(tree) {
  return collect(tree).filter((n) => n.type === 'button');
}

/** Every visible string on the page, joined. */
function copy(tree) {
  return texts(tree).join(' | ');
}

/**
 * The counts painted on the filter chips, keyed by chip label.
 * Reads what a user reads, not the DOM order.
 */
function chipCounts(tree) {
  const chips = collect(tree).filter(
    (n) => n.type === 'button' && String(n.props.className).includes('hr-filter-chip'),
  );
  assert.equal(chips.length, 3, 'All / Active / Paused chips must exist');
  const out = {};
  for (const chip of chips) {
    const [label, count] = chip.props.children;
    out[label] = Number(count.props.children);
  }
  return out;
}

const JOBS = [
  { job_id: '84c47f11a2bd', name: 'Morning brief', schedule: '0 9 * * *' },
  { job_id: '19bd7c0a3f11', name: 'Evening digest', schedule: '0 18 * * *' },
  { job_id: '7a2b91c40d13', name: 'Paused sweep', schedule: '0 7 * * *', disabled: true },
  { job_id: '5c1f0a77b2e4', name: 'Weekly report', schedule: '0 8 * * 1', enabled: false },
];

function css() {
  return readFileSync(stylesPath, 'utf8');
}

/** The body of a single-line-styled rule, e.g. '.hr-icon-btn {…}'. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`'(?:[^'\\\\]|\\\\.)*${escaped.replace(/\\ /g, ' ')}\\s*\\{'`).exec(css());
  assert.ok(found, `the ${selector} rule must exist`);
  const start = found.index + found[0].length;
  const end = css().indexOf("}',", start);
  return css().slice(start, end);
}

// ── the labeled primary action ─────────────────────────────────────────

describe('the creation action is labeled, not a bare glyph (issue #79)', () => {
  it('the header control paints the words "New routine"', () => {
    const newBtn = byClass(paint(JOBS), 'hr-btn-new')[0];
    assert.ok(newBtn, 'the primary action must exist in the header');
    assert.match(
      texts(newBtn).join(' '),
      /New routine/,
      'the primary action cannot require knowing what the glyph means',
    );
  });

  it('its accessible name comes from that text, not a competing aria-label', () => {
    const newBtn = byClass(paint(JOBS), 'hr-btn-new')[0];
    // With visible text present, the name is derived from the content. An
    // aria-label would override it, so it is left off entirely rather than
    // risking a label that drifts from the visible one.
    assert.equal(newBtn.props['aria-label'], undefined);
    assert.equal(newBtn.props.title, undefined, 'and no tooltip restating the visible label');
  });

  it('the decorative plus glyph is still hidden from assistive tech', () => {
    const newBtn = byClass(paint(JOBS), 'hr-btn-new')[0];
    const glyph = collect(newBtn).find((n) => n.type === 'svg');
    assert.ok(glyph, 'the plus glyph stays');
    assert.equal(glyph.props['aria-hidden'], 'true', 'it adds nothing the label does not say');
  });

  it('the pill is a real control box, not a glyph-sized square', () => {
    const body = rule('.hr-btn-new');
    // A fixed width would clip the label; min-height keeps the target at
    // least as tall as the old 32px square.
    assert.doesNotMatch(body, /(?<![-\w])width:\s*\d+px/, 'a fixed width would truncate the label');
    assert.match(body, /min-height:\s*32px/, 'and the target keeps its 32px height');
    assert.match(body, /padding:\s*0 12px/, 'with room for the label beside the glyph');
    assert.match(body, /white-space:\s*nowrap/, 'the label never wraps inside the control');
  });

  it('the primary action stops scaling on hover, so the header never shifts', () => {
    const styles = css();
    const hover = /\.hr-btn-new:hover \{([^}]*)\}/.exec(styles);
    assert.ok(hover, 'the hover rule must exist');
    assert.doesNotMatch(hover[1], /transform:\s*scale/, 'a growing primary action moves the layout');
    assert.match(hover[1], /background:/, 'and still reads as interactive');
  });
});

// ── hit targets ────────────────────────────────────────────────────────

describe('interactive controls meet a real hit-target size (issue #79)', () => {
  // WCAG 2.2 target size (minimum) is 24x24 CSS px. The old row action was
  // exactly 24x24 with a 13px glyph inside, and the search clear was
  // 16x16 — below the floor.
  const MIN = 24;

  function px(body, prop) {
    const found = new RegExp(`${prop}:\\s*(\\d+)px`).exec(body);
    assert.ok(found, `${prop} must be declared in px so it can be measured`);
    return Number(found[1]);
  }

  it('row actions are at least the minimum target on both axes', () => {
    const body = rule('.hr-icon-btn');
    assert.ok(px(body, 'width') >= MIN, `row action width ${px(body, 'width')}px is under the target floor`);
    assert.ok(px(body, 'height') >= MIN, `row action height ${px(body, 'height')}px is under the target floor`);
    assert.ok(px(body, 'width') >= 28, 'the target grew beyond the bare minimum, not just to it');
  });

  it('the search clear control is no longer the smallest target on the page', () => {
    const body = rule('.hr-search-clear');
    assert.ok(px(body, 'width') >= MIN, `clear width ${px(body, 'width')}px is under the target floor`);
    assert.ok(px(body, 'height') >= MIN, `clear height ${px(body, 'height')}px is under the target floor`);
  });

  it('the filter chips are a clickable band, not the glyph', () => {
    const body = rule('.hr-filter-chip');
    assert.ok(px(body, 'min-height') >= 28, 'the chips must be reachable by thumb or finger');
    const pad = /padding:\s*0 (\d+)px/.exec(body);
    assert.ok(pad && Number(pad[1]) >= 6, 'side padding gives the target area around the label');
    assert.doesNotMatch(body, /(?<![-\w])height:\s*\d+px/, 'a fixed height caps the target');
  });

  it('every icon-only control still names itself for assistive tech', () => {
    const tree = paint(JOBS);
    for (const node of buttons(tree)) {
      const name = node.props['aria-label'];
      if (name === undefined) continue; // a labeled control names itself
      assert.equal(
        typeof name,
        'string',
        `${String(node.props.className)} must carry an explicit accessible name`,
      );
      assert.ok(name.trim().length > 0, 'an empty accessible name names nothing');
    }
    // The icon-only row actions specifically: each one says which routine
    // it acts on, so a screen reader never hears a bare "Pause".
    const pause = buttons(tree).find((n) => String(n.props.className).includes('hr-icon-btn-pause'));
    assert.ok(pause, 'the pause control must exist');
    assert.match(pause.props['aria-label'], /^Pause .+/, 'and name the routine it acts on');
    assert.equal(pause.props.title, 'Pause routine', 'with a tooltip for pointer users');
  });

  it('the enlarged targets survive the narrow viewport', () => {
    // A media query is exactly where a hit target silently regresses.
    const styles = css();
    const media = /@media \(max-width: 820px\) \{([\s\S]*?)\n\s*'\}',/.exec(styles);
    assert.ok(media, 'the narrow-viewport query must exist');
    const iconBtn = /\.hr-icon-btn \{([^}]*)\}/.exec(media[1]);
    if (iconBtn) {
      assert.match(iconBtn[1], /width:\s*28px/, 'the narrow view must not shrink the target back');
      assert.match(iconBtn[1], /height:\s*28px/);
    }
    // And the pill tightens its padding rather than dropping its label.
    const pill = /\.hr-btn-new \{([^}]*)\}/.exec(media[1]);
    if (pill) {
      assert.doesNotMatch(pill[1], /display:\s*none/, 'the primary action never disappears');
      assert.match(pill[1], /padding:\s*0 10px/, 'it tightens instead');
    }
  });
});

// ── counts ─────────────────────────────────────────────────────────────

describe('each filter chip carries its own count (issue #79)', () => {
  it('the counts split the inventory across the three slices', () => {
    assert.deepEqual(chipCounts(paint(JOBS)), { All: 4, Active: 2, Paused: 2 });
  });

  it('no chip is counted down by the filter the user already applied', () => {
    // The bug this guards: counts taken from the already-filtered rows read
    // "Paused 0" while paused routines exist, because the active filter
    // removed them before anybody counted.
    const tree = paint(JOBS, { filter: 'paused' });
    assert.deepEqual(chipCounts(tree), { All: 4, Active: 2, Paused: 2 });
    const paused = buttons(tree).find((n) => n.props['aria-current'] === 'true');
    assert.equal(paused.props['aria-label'], 'Paused — 2 routines', 'the current slice states its real size');
  });

  it('a search narrows every chip, because each would open fewer rows', () => {
    const tree = paint(JOBS, { query: 'digest' });
    assert.deepEqual(chipCounts(tree), { All: 1, Active: 1, Paused: 0 });
  });

  it('a search matching nothing reads zero everywhere, never the inventory', () => {
    assert.deepEqual(chipCounts(paint(JOBS, { query: 'zzz' })), { All: 0, Active: 0, Paused: 0 });
  });

  it('the counts sum to the slice each chip opens', () => {
    const counts = chipCounts(paint(JOBS));
    assert.equal(counts.All, counts.Active + counts.Paused, 'no routine is counted twice or lost');
  });

  it('the empty inventory counts zero on every chip', () => {
    assert.deepEqual(chipCounts(paint([])), { All: 0, Active: 0, Paused: 0 });
  });

  it('a count is announced once per chip, with correct singular and plural', () => {
    const tree = paint([JOBS[0]]);
    const all = buttons(tree).find((n) => n.props.children[0] === 'All');
    assert.equal(all.props['aria-label'], 'All — 1 routine', 'one routine is singular');
    const paused = buttons(tree).find((n) => n.props.children[0] === 'Paused');
    assert.equal(paused.props['aria-label'], 'Paused — 0 routines', 'zero is plural');
    // The visible number is not read twice: it is aria-hidden, because the
    // chip's accessible name already carries it.
    const [, countNode] = all.props.children;
    assert.equal(countNode.props['aria-hidden'], 'true', 'the painted count is not announced separately');
  });

  it('the redundant "Showing all N routines." line is gone, not merely hidden', () => {
    const tree = paint(JOBS);
    assert.doesNotMatch(copy(tree), /Showing all/, 'the sentence restated the current chip');
    const src = readFileSync(pagePath, 'utf8');
    assert.doesNotMatch(src, /hr-count-right/, 'and no dead class survives it');
    assert.doesNotMatch(css(), /hr-count-right/, 'including in the stylesheet');
  });

  it('the empty and no-results states still explain themselves', () => {
    assert.match(copy(paint([])), /No routines yet/, 'an empty inventory says so');
    // The Paused slice with a search that hits no paused row: rows exist,
    // so this is the no-results panel and not the empty inventory.
    assert.match(
      copy(paint(JOBS, { filter: 'paused', query: 'brief' })),
      /No routines match this filter/,
      'a filter with nothing in it says so too',
    );
    // And the counts that produced it are visible zeros, not a lie.
    assert.deepEqual(chipCounts(paint(JOBS, { filter: 'paused', query: 'brief' })), {
      All: 1,
      Active: 1,
      Paused: 0,
    });
  });
});

// ── keyboard ───────────────────────────────────────────────────────────

describe('the labeled action and the chips stay keyboard reachable (issue #79)', () => {
  it('the primary action is a real button in the tab order', () => {
    const newBtn = byClass(paint(JOBS), 'hr-btn-new')[0];
    assert.equal(newBtn.type, 'button', 'a native button, so Enter and Space activate it');
    assert.equal(newBtn.props.tabIndex, undefined, 'and nothing takes it out of the tab order');
  });

  it('the chips are real buttons, each with its own name and current state', () => {
    const tree = paint(JOBS);
    const chips = buttons(tree).filter((n) => String(n.props.className).includes('hr-filter-chip'));
    assert.equal(chips.length, 3);
    for (const chip of chips) {
      assert.equal(chip.type, 'button');
      assert.ok(chip.props['aria-label'], 'each chip names its slice');
    }
    const current = chips.filter((n) => n.props['aria-current'] === 'true');
    assert.equal(current.length, 1, 'exactly one chip claims the current slice');
  });

  it('a chip click dispatches the filter it advertises', () => {
    const state = readyWith(JOBS);
    reactStub.__presetStates([
      [state, noop],
      [0, noop],
      ['', noop],
      [null, noop],
      [false, noop],
      [null, noop],
      [null, noop],
    ]);
    const tree = renderView(state);
    const paused = buttons(tree).find((n) => n.props.children[0] === 'Paused');
    assert.match(paused.props['aria-label'], /Paused — 2 routines/);

    reactStub.__resetStateUpdates();
    paused.props.onClick();
    // The stub records the state UPDATER, so the transition is observed by
    // applying it: the assertion is that the click really selects the slice
    // whose count the user just read, not that some event was constructed.
    const updates = reactStub.__stateUpdates();
    assert.equal(updates.length, 1, 'one state transition per click');
    const next = updates[0](state);
    assert.equal(next.filter, 'paused', 'the chip moved the user to the slice it advertised');
  });

  it('the primary action opens the composer on click', () => {
    const newBtn = byClass(paint(JOBS), 'hr-btn-new')[0];
    reactStub.__resetStateUpdates();
    newBtn.props.onClick();
    assert.ok(
      reactStub.__stateUpdates().includes(true),
      'activating the labeled control opens the create form',
    );
  });

  it('the chip counts are the only numbers painted on the page', () => {
    const tree = paint(JOBS);
    const numbers = texts(tree).filter((t) => /^\d+$/.test(t)).sort();
    assert.deepEqual(numbers, ['2', '2', '4'], 'three chip numbers and nothing else');
  });
});

// ── responsive layout ──────────────────────────────────────────────────

describe('the header stays balanced at desktop and narrow widths (issue #79)', () => {
  it('the header row is allowed to wrap instead of crushing the heading', () => {
    // The labeled pill is wider than the bare glyph it replaced; without
    // this the heading and the action fight over a single narrow line.
    const styles = css();
    const header = /\.hr-header-top \{([^}]*)\}/.exec(styles);
    assert.ok(header, '.hr-header-top must exist');
    assert.match(header[1], /flex-wrap:\s*wrap/, 'the header must wrap rather than squeeze');
    assert.match(header[1], /justify-content:\s*space-between/, 'and keep the action at the far edge');
  });

  it('the toolbar still wraps its search and filter row', () => {
    const toolbar = /\.hr-toolbar \{([^}]*)\}/.exec(css());
    assert.ok(toolbar);
    assert.match(toolbar[1], /flex-wrap:\s*wrap/);
  });

  it('the counts do not force the filter row wider than its column', () => {
    // Three labels plus three numbers is a wider row than three labels. The
    // filters column must be allowed to stay right-aligned and shrinkable
    // instead of pushing the search field off the toolbar.
    const styles = css();
    const col = /\.hr-filters-col \{([^}]*)\}/.exec(styles);
    assert.ok(col);
    assert.match(col[1], /flex-direction:\s*column/, 'chips and counts stack under one another');
    const search = /\.hr-search-wrap \{([^}]*)\}/.exec(styles);
    assert.ok(search);
    assert.match(search[1], /max-width:\s*280px/, 'the search field stays bounded');
    assert.match(search[1], /width:\s*100%/, 'and shrinkable');
  });

  it('the chip count is styled as a number beside the label, never as the label', () => {
    const styles = css();
    const count = /\.hr-filter-count \{([^}]*)\}/.exec(styles);
    assert.ok(count, 'the count needs its own rule');
    assert.match(count[1], /font-size:\s*11px/, 'smaller than the 13px label, so the label leads');
    assert.match(count[1], /margin-left:\s*5px/, 'and clearly separated from it');
    assert.match(count[1], /font-variant-numeric:\s*tabular-nums/, 'so digits line up as they change');
  });
});

// ── source contract ────────────────────────────────────────────────────

describe('the affordance contract is wired end to end (issue #79)', () => {
  it('the counts come from a domain function, not from the view guessing', () => {
    const jobs = readFileSync(path.join(root, 'src', 'domain', 'jobs.ts'), 'utf8');
    assert.match(jobs, /export function filterCounts/, 'one place decides what a count means');
    assert.equal(typeof routines.filterCounts, 'function', 'and the artifact exports it');
  });

  it('filterCounts refuses a non-array instead of inventing a count', () => {
    assert.deepEqual(routines.filterCounts(null), { all: 0, active: 0, paused: 0 });
    assert.deepEqual(routines.filterCounts(undefined), { all: 0, active: 0, paused: 0 });
    assert.deepEqual(routines.filterCounts('nope'), { all: 0, active: 0, paused: 0 });
  });

  it('filterCounts reads both spellings of paused, like the filter itself', () => {
    // A routine the backend reports as disabled, and one it reports as
    // not-enabled, are the same slice. A count that split them would show
    // Paused 1 while the Paused filter opens two rows.
    const counts = routines.filterCounts([
      { job_id: 'a', name: 'disabled flag', disabled: true },
      { job_id: 'b', name: 'not enabled', enabled: false },
      { job_id: 'c', name: 'live', enabled: true },
      { job_id: 'd', name: 'silent', enabled: undefined },
    ]);
    assert.deepEqual(counts, { all: 4, active: 2, paused: 2 });
  });

  it('a nav without counts renders labels alone rather than a wrong zero', () => {
    // The counts prop is optional. A caller that has no counts must get the
    // bare labels: painting a "0" it never computed would be a lie, and
    // announcing one the user cannot see is worse.
    const nav = routines.FilterNav({ filter: 'all', disabled: false, onSelect: noop });
    const chips = collect(nav).filter((n) => n.type === 'button');
    assert.equal(chips.length, 3);
    for (const chip of chips) {
      const [label, count] = chip.props.children;
      assert.equal(typeof label, 'string', 'the label is still there');
      assert.equal(count, null, 'and no count element is invented');
      assert.equal(chip.props['aria-label'], undefined, 'and no number is announced that is not painted');
    }
  });

  it('the enlarged targets are declared, not only implied by the glyph', () => {
    const styles = css();
    assert.match(styles, /\.hr-icon-btn \{/, 'row actions keep their own box');
    assert.doesNotMatch(
      /\.hr-icon-btn \{([^}]*)\}/.exec(styles)[1],
      /width:\s*24px/,
      'the old 24px box must be gone',
    );
    assert.match(styles, /\.hr-icon-btn::before \{([^}]*)\}/, 'the glyph is drawn by the mask');
    // The glyph did not grow with the target — that is what kept the row
    // compact under issue #77.
    assert.match(/\.hr-icon-btn::before \{([^}]*)\}/.exec(styles)[1], /width:\s*13px/);
  });
});
