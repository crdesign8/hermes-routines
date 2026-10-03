// Host UI-kit adoption (issue #100).
//
// Drives the BUILT bundle and pins the migration contract, so a future
// edit cannot quietly reintroduce a hand-rolled primitive or drop the
// accessibility behavior the host components are there to provide:
//
//   - the composer, inspector, guided panel, states and panels all paint
//     through host Button/Input/Textarea/Select primitives, and the custom
//     SelectField combobox is gone from the artifact entirely;
//   - every migrated control is still a REAL element: a button is a <button>
//     with type=button, a field is an <input>/<textarea>, so Enter/Space
//     activate and Tab reaches them;
//   - the select keeps role=combobox/listbox/option, which is what
//     `escapeLeavesPanel` inspects — an open dropdown still owns Escape
//     before the panel does;
//   - emphasis is still expressed: the primary act is the filled `default`
//     variant and the quiet assisted path is `ghost`, so the attention
//     hierarchy from the UX work survives the migration;
//   - the stylesheet carries no control chrome for the retired classes,
//     while the layout that a primitive cannot decide (the actions row
//     split, the search field height) is still declared somewhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const routines = await import('../desktop/plugin.js');
const artifact = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8');
const stylesheet = readFileSync(path.join(root, 'src', 'views', 'routinesStyles.ts'), 'utf8');
// Named so the assertions below read as what they mean rather than as a
// positional index into the view list.
const VIEW_NAMES = [
  'RoutineComposerPanel',
  'RoutineInspectorPanel',
  'GuidedRoutinePanel',
  'RoutineStates',
  'panels',
  'RoutineCard',
  'FilterNav',
  'PanelNav',
  'RoutinesPage',
];
const COMPOSER_INDEX = VIEW_NAMES.indexOf('RoutineComposerPanel');
const viewSources = VIEW_NAMES.map((name) => readFileSync(path.join(root, 'src', 'views', `${name}.tsx`), 'utf8'));

const CONFIG = routines.DEFAULT_SCHEDULE_CONFIG;


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
  return out.join(' ').trim();
}

function composer(overrides = {}) {
  return routines.RoutineComposerPanel({
    name: 'Ops Digest',
    prompt: 'Summarize yesterday.',
    activeRoute: { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' },
    busy: false,
    onClose() {},
    scheduleConfig: CONFIG,
    onSubmitGuided: async () => true,
    onSubmitDirect: async () => true,
    ...overrides,
  });
}

describe('host UI kit adoption (issue #100)', () => {
  it('the custom SelectField combobox no longer ships', () => {
    assert.equal(routines.SelectField, undefined, 'the retired component is not exported');
    assert.equal(
      artifact.includes('role="combobox"') && artifact.includes('hr-select-trigger'),
      false,
      'the hand-rolled combobox markup is gone from the artifact',
    );
    // NativeSelect is the single labelled entry point to the host select.
    assert.equal(typeof routines.NativeSelect, 'function');
    assert.equal(collect(routines.NativeSelect({
      label: 'Trigger',
      value: CONFIG.trigger,
      options: routines.TRIGGER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      onChange() {},
    })).some((n) => n.type === 'button' && n.props.role === 'combobox'), true);
  });

  it('the composer paints its fields and acts through host primitives', () => {
    const nodes = collect(composer());
    // Real elements, so Enter/Space and Tab keep working without extra code.
    assert.ok(nodes.some((n) => n.type === 'input' && n.props['data-slot'] === 'input'), 'name is a host Input');
    assert.ok(
      nodes.some((n) => n.type === 'textarea' && n.props['data-slot'] === 'textarea'),
      'the instruction is a host Textarea',
    );
    const acts = nodes.filter((n) => n.type === 'button' && n.props['data-slot'] === 'button');
    assert.ok(acts.length > 0, 'the acts are host Buttons');
    assert.ok(
      acts.every((n) => n.props.type === 'button'),
      'a host Button bakes in type=button, so none can submit the page by accident',
    );
    assert.equal(
      nodes.some((n) => n.type === 'button' && n.props.type === undefined && n.props['data-slot'] === 'button'),
      false,
    );
  });

  it('every action keeps an accessible name', () => {
    const nodes = collect(composer());
    const nameless = nodes.filter(
      (n) =>
        n.type === 'button' &&
        n.props['data-slot'] === 'button' &&
        !n.props['aria-label'] &&
        textOf(n) === '',
    );
    assert.deepEqual(nameless.map((n) => n.props.className), [], 'no icon-only action lost its name');
  });

  it('the select keeps the roles the Escape contract inspects', () => {
    const nodes = collect(composer());
    const trigger = nodes.find((n) => n.type === 'button' && n.props.role === 'combobox');
    assert.ok(trigger, 'the select exposes a combobox');
    assert.equal(trigger.props['aria-haspopup'], 'listbox');
    const items = nodes.filter((n) => n.props.role === 'option');
    assert.ok(items.length > 0, 'options are exposed as options');
    // `escapeLeavesPanel` returns false for these roles, so an open dropdown
    // still consumes Escape before the panel is dismissed.
    for (const role of ['combobox', 'listbox', 'option']) {
      assert.equal(
        routines.escapeLeavesPanel({ tagName: 'DIV', getAttribute: (name) => (name === 'role' ? role : null) }),
        false,
        `role=${role} keeps Escape for the dropdown`,
      );
    }
  });

  it('keeps the attention hierarchy: one filled primary act, one quiet secondary', () => {
    const nodes = collect(composer());
    const filled = nodes.filter((n) => n.type === 'button' && n.props['data-variant'] === 'default');
    assert.equal(filled.length, 1, 'exactly one filled act');
    assert.match(textOf(filled[0]), /Create Routine/);
    const quiet = nodes.find(
      (n) =>
        n.type === 'button' &&
        n.props['aria-label'] === 'Create this routine and finish the setup with Hermes',
    );
    assert.ok(quiet, 'the assisted path still exists');
    assert.equal(quiet.props['data-variant'], 'ghost', 'and stays quiet, not filled');
  });

  it('the states and panels use host Buttons for their actions', () => {
    for (const element of [
      routines.ErrorState({ title: 'x', message: 'y', onRetry() {} }),
      routines.UnavailableState({ profile: 'p1', onRetry() {} }),
      routines.StaleBanner({ onRetry() {} }),
      routines.NeedsAttentionNotice({ count: 2, onFocus() {} }),
      routines.NeedsConfigurationNotice({ count: 1, onView() {} }),
      routines.NeedsConfigurationFocusBar({ visibleCount: 1, onClear() {} }),
    ]) {
      const nodes = collect(element);
      const actions = nodes.filter((n) => n.type === 'button');
      assert.ok(actions.length > 0, 'each state offers at least one action');
      assert.ok(
        actions.every((n) => n.props['data-slot'] === 'button'),
        'every action is a host Button',
      );
      assert.ok(
        actions.every((n) => n.props['aria-label'] || textOf(n) !== ''),
        'every action still names itself',
      );
    }
  });

  it('the filter chips keep their own name and current state', () => {
    const nodes = collect(
      routines.FilterNav({ filter: 'active', disabled: false, counts: { all: 3, active: 2, paused: 1 }, onSelect() {} }),
    );
    const chips = nodes.filter((n) => n.type === 'button');
    assert.equal(chips.length, 3);
    for (const chip of chips) {
      assert.equal(chip.props['data-variant'], 'chip');
      assert.ok(chip.props['aria-label'], 'each chip names its slice');
    }
    const current = chips.filter((n) => n.props['aria-current'] === 'true');
    assert.equal(current.length, 1, 'exactly one chip is the current slice');
  });

  it('the stylesheet carries no chrome for the retired primitives', () => {
    for (const selector of [
      '.hr-select-container',
      '.hr-select-trigger',
      '.hr-select-menu',
      '.hr-select-option',
      '.hr-select-value',
      '.hr-select-arrow',
      '.hr-btn-create-submit',
      '.hr-btn-create-hermes',
      '.hr-btn-back-routines',
      '.hr-create-input',
      '.hr-create-textarea',
      '.hr-search-input',
    ]) {
      assert.equal(
        stylesheet.includes(`'${selector} {`),
        false,
        `${selector} is host chrome now and must be gone`,
      );
    }
    // Layout the primitive does not decide is still declared, on a container.
    assert.match(stylesheet, /\.hr-create-actions > \* \{/, 'the actions row still splits its two acts');
    assert.match(stylesheet, /\.hr-search-wrap > input \{/, 'the search field still owns its height');
    // The select's vertical rhythm rode along on the retired
    // .hr-select-container rule. The host control brings its own box, so the
    // spacing has to be re-declared or the WHEN TO RUN selects collide with
    // the sentence preview below them.
    assert.match(stylesheet, /\.hr-select \{[^}]*margin-bottom: 12px;/, 'selects keep their vertical rhythm');
  });

  it('no view re-implements a primitive with raw markup', () => {
    const rawButtons = viewSources.reduce((hits, source, index) => (/<button[\s>]/.test(source) ? hits.concat(index) : hits), []);
    assert.deepEqual(rawButtons, [], 'every action goes through the host Button');
    const rawFields = viewSources.reduce(
      (hits, source, index) => (/<(input|textarea)[\s>]/.test(source) ? hits.concat(index) : hits),
      [],
    );
    // Exactly one raw field remains, and it is a deliberate exception: the
    // fan-out acknowledgement is a native <input type="checkbox"> inside a
    // <label>. The host Checkbox is a Radix BUTTON, which a <label> cannot
    // wrap — migrating it would silently drop the click-the-text affordance
    // and change the element type assistive tech expects. That is the issue's
    // own "do not replace when the primitive cannot preserve the behavior".
    assert.deepEqual(
      rawFields,
      [COMPOSER_INDEX],
      'only the composer keeps a raw field: the native checkbox in a label',
    );
    const composerSource = viewSources[COMPOSER_INDEX];
    assert.match(composerSource, /type="checkbox"/, 'and it is the checkbox, not a text field');
  });
});
