// Attention budget (issue #92): quiet by default.
//
// Drives the BUILT bundle — the artifact the Desktop loads — and the
// stylesheet source, pinning that optional capabilities take no
// highlighted container while the primary action, failure/risk, and
// immediate-attention states keep theirs:
//
//   - the assisted path is a borderless secondary act plus exactly one
//     sentence, ordered with the final actions;
//   - the primary Create Routine action stays filled and distinct;
//   - the acknowledged fan-out guard keeps its bordered card while the
//     pre-opt-in ask is quiet;
//   - errors and the needs-attention band stay stronger than any optional
//     feature;
//   - desktop and the 820px narrow layout share the same DOM order.
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
const contributing = readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const LOCAL_ROUTE = { connectionId: 'local', mode: 'local', profile: 'matias', targetProfile: 'matias' };
const noop = () => {};
const CONFIG = routines.DEFAULT_SCHEDULE_CONFIG;
const SENTENCE = 'Let Hermes review this paused routine in chat before you enable it.';

function presetComposer({
  name,
  prompt,
  pendingPath = null,
  destinationChoice,
  advancedPlatform = '',
  advancedChatId = '',
  advancedThreadId = '',
  broadcastConfirmed = false,
  broadcastOptIn = false,
} = {}) {
  reactStub.__presetStates([
    [name ?? 'Ops Digest', noop],
    [prompt ?? 'Summarize yesterday.', noop],
    [true, noop],
    [CONFIG, noop],
    [pendingPath, noop],
    [null, noop],
    [destinationChoice ?? '', noop],
    [advancedPlatform, noop],
    [advancedChatId, noop],
    [advancedThreadId, noop],
    [broadcastConfirmed, noop],
    [broadcastOptIn, noop],
  ]);
}

function renderComposer({ onSubmit, onSubmitGuided } = {}) {
  return routines.RoutineComposerPanel({
    activeProfile: 'p1',
    activeRoute: ROUTE,
    disabled: false,
    onClose: noop,
    onSubmit:
      onSubmit ??
      (async () => {
        throw new Error('onSubmit must be stubbed per test');
      }),
    ...(onSubmitGuided ? { onSubmitGuided } : {}),
    destinationRoutes: [LOCAL_ROUTE],
  });
}

function renderGuided() {
  presetComposer();
  return renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
}

/** Host nodes in document order; function components stay unexpanded. */
function documentOrder(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) documentOrder(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    documentOrder(node.props ? node.props.children : null, out);
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

/** Collect through function components (needed for the inspector/notice). */
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

/** The stylesheet rule block for one selector, without its braces. */
function ruleBlock(selector) {
  const start = cssSource.indexOf(`'${selector} {`);
  assert.notEqual(start, -1, `${selector} must be styled`);
  const end = cssSource.indexOf(`'}'`, start);
  return cssSource.slice(start, end);
}

describe('attention budget (issue #92)', () => {
  it('orders intent before mechanism and the quiet act with the actions', () => {
    const order = documentOrder(renderGuided());
    const indexOf = (predicate, what) => {
      const at = order.findIndex(predicate);
      assert.notEqual(at, -1, `${what} must render`);
      return at;
    };
    const name = indexOf((n) => n.type === 'input' && n.props['aria-label'] === 'Name this Routine', 'name');
    const instruction = indexOf(
      (n) => n.type === 'textarea' && n.props['aria-label'] === 'What should this routine do?',
      'instruction',
    );
    const schedule = indexOf(
      (n) =>
        n.type === 'div' &&
        n.props.className === 'hr-create-section-label' &&
        textOf(n).trim() === 'WHEN TO RUN',
      'schedule',
    );
    const startEnabled = indexOf(
      (n) => n.type === 'button' && n.props['aria-label'] === 'Start the routine enabled',
      'start-enabled',
    );
    const quiet = indexOf((n) => n.props && n.props.className === 'hr-create-hermes-quiet', 'quiet act');
    const actions = indexOf((n) => n.type === 'div' && n.props.className === 'hr-create-actions', 'actions');
    assert.ok(name < instruction, 'name before instruction');
    assert.ok(instruction < schedule, 'instruction before schedule');
    assert.ok(schedule < startEnabled, 'schedule before creation-time state');
    assert.ok(startEnabled < quiet, 'quiet act after the fields');
    assert.ok(quiet < actions, 'quiet act with the final actions');
  });

  it('carries the assisted path on one button plus exactly one sentence', () => {
    const element = renderGuided();
    const nodes = documentOrder(element);
    const button = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-hermes');
    assert.ok(button, 'the secondary act must exist');
    assert.equal(textOf(button).trim(), 'Finish with Hermes →');
    assert.equal(button.props['aria-label'], 'Create this routine and finish the setup with Hermes');
    const notes = nodes.filter((n) => n.props && n.props.className === 'hr-create-hermes-note');
    assert.equal(notes.length, 1, 'exactly one supporting sentence');
    assert.equal(textOf(notes[0]).trim(), SENTENCE);
    assert.equal(
      nodes.some((n) => n.props && /hr-create-hermes-card|hr-create-hermes-subtitle|hr-create-hermes-hint/.test(String(n.props.className || ''))),
      false,
      'no retired card, subtitle, or hint chrome',
    );
  });

  it('keeps the primary action filled and the secondary act borderless', () => {
    const element = renderGuided();
    const nodes = documentOrder(element);
    const primary = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-submit');
    assert.ok(primary, 'the primary action must exist');
    assert.match(textOf(primary), /Create Routine/);
    const submitRule = ruleBlock('.hr-btn-create-submit');
    assert.match(submitRule, /background: var\(--dt-primary/, 'the primary action stays filled');
    const secondaryRule = ruleBlock('.hr-btn-create-hermes');
    assert.match(secondaryRule, /background: transparent/, 'the secondary act takes no fill');
    assert.match(secondaryRule, /border: none/, 'the secondary act takes no border');
    const quietRule = ruleBlock('.hr-create-hermes-quiet');
    assert.equal(/border/.test(quietRule), false, 'the quiet wrapper takes no border');
    assert.equal(/background/.test(quietRule), false, 'the quiet wrapper takes no fill');
  });

  it('keeps the same gating and pending labels on the quiet act', () => {
    for (const draft of [{ name: '', prompt: 'Do the thing' }, { name: 'Ops Digest', prompt: '  ' }]) {
      presetComposer(draft);
      const element = renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
      const nodes = documentOrder(element);
      const finish = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-hermes');
      const create = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-submit');
      assert.equal(finish.props.disabled, true, 'quiet act refused on an incomplete draft');
      assert.equal(create.props.disabled, true, 'primary refused on an incomplete draft');
    }
    for (const [pendingPath, label] of [
      ['guided', 'Starting…'],
      ['direct', 'Creating…'],
    ]) {
      presetComposer({ pendingPath });
      const element = renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
      const nodes = documentOrder(element);
      const finish = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-hermes');
      const create = nodes.find((n) => n.type === 'button' && n.props.className === 'hr-btn hr-btn-create-submit');
      assert.match(textOf(finish), pendingPath === 'guided' ? /Starting…/ : /Finish with Hermes →/);
      assert.match(textOf(create), pendingPath === 'direct' ? /Creating…/ : /Create Routine/);
      assert.equal(finish.props.disabled, true);
      assert.equal(create.props.disabled, true);
    }
  });

  it('keeps the fan-out guard bordered while the pre-opt-in ask is quiet', () => {
    presetComposer({ destinationChoice: 'advanced', advancedPlatform: 'telegram', advancedChatId: 'ops' });
    const before = renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
    const beforeNodes = documentOrder(before);
    assert.ok(
      beforeNodes.some((n) => n.props && n.props.className === 'hr-create-broadcast-quiet'),
      'the pre-opt-in ask is quiet',
    );

    presetComposer({
      destinationChoice: 'advanced',
      advancedPlatform: 'telegram',
      advancedChatId: 'ops',
      broadcastOptIn: true,
    });
    const after = renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
    const afterNodes = documentOrder(after);
    const guard = afterNodes.find((n) => n.props && n.props.className === 'hr-create-broadcast-card');
    assert.ok(guard, 'the acknowledged fan-out state keeps its bordered card');
    const check = afterNodes.find((n) => n.type === 'input' && n.props.type === 'checkbox');
    assert.ok(check, 'the acknowledgement control survives the audit');
    assert.match(textOf(after), /every connected channel/i, 'the risk reads in words');
  });

  it('keeps failure and attention stronger than any optional feature', () => {
    const errorRule = ruleBlock('.hr-create-error');
    assert.match(errorRule, /--ui-red/, 'errors keep the red treatment');
    const attentionRule = ruleBlock('.hr-attention');
    assert.match(attentionRule, /--ui-red/, 'the attention band keeps the red treatment');
    const quietRule = ruleBlock('.hr-create-hermes-quiet');
    assert.equal(/--ui-red|--ui-yellow/.test(quietRule), false, 'the quiet act takes no alarm color');
  });

  it('shares one DOM order on desktop and the 820px narrow layout', () => {
    assert.ok(cssSource.includes('@media (max-width: 820px)'), 'the narrow breakpoint must exist');
    const narrowStart = cssSource.indexOf('@media (max-width: 820px)');
    const narrowBlock = cssSource.slice(narrowStart);
    assert.equal(/(^|[^a-z-])order:/.test(narrowBlock), false, 'narrow layout never reorders');
    assert.equal(/(^|[^a-z-])order:/.test(cssSource), false, 'no layout reorders by CSS anywhere');
  });

  it('keeps the list header quiet', () => {
    const headerRule = ruleBlock('.hr-header');
    assert.equal(/background/.test(headerRule), false, 'the list header takes no fill');
  });

  it('states the inspector configuration note quietly, with the mirror intact', () => {
    const job = { job_id: 'j1', name: 'Ops Digest', prompt: 'Summarize.', enabled: false };
    const element = routines.RoutineInspectorPanel({
      job,
      fallback: 'Routine',
      activeRoute: ROUTE,
      activeProfile: 'p1',
      busy: false,
      disabled: false,
      onClose: noop,
      onPause: noop,
      onResume: noop,
    });
    const nodes = collect(element);
    const note = nodes.find((n) => n.props && n.props.className === 'hr-inspector-note');
    assert.ok(note, 'the configuration note is quiet');
    assert.match(textOf(element), /Paused · needs configuration/);
    assert.match(textOf(element), /its configuration is incomplete/);
    const mirror = nodes.find((n) => n.type === 'button' && n.props.role === 'switch');
    assert.ok(mirror, 'the disabled active mirror survives the audit');
    assert.equal(mirror.props.disabled, true);
    assert.equal(mirror.props['aria-checked'], false);
  });

  it('states the list configuration notice quietly, with working actions', () => {
    const seen = [];
    const element = routines.NeedsConfigurationNotice({
      targets: [
        { jobId: 'j1', title: 'Ops Digest', resumed: false },
        { jobId: 'j2', title: 'Nightly', resumed: true },
      ],
      onConfigure: (jobId) => seen.push(jobId),
    });
    const nodes = collect(element);
    const note = nodes.find((n) => n.props && n.props.className === 'hr-config-note');
    assert.ok(note, 'the notice takes no borrowed banner');
    assert.equal(note.props.role, 'status');
    assert.match(textOf(element), /2 paused routines need configuration/);
    const buttons = nodes.filter((n) => n.type === 'button');
    assert.equal(buttons.length, 2, 'one action per target');
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    assert.deepEqual(seen, ['j1', 'j2']);
    assert.equal(
      nodes.some((n) => n.props && n.props.className === 'hr-stale'),
      false,
      'the stale band stays reserved for stale states',
    );
  });

  it('documents the rule and the keep/drop audit', () => {
    assert.match(contributing, /Attention budget/);
    assert.match(contributing, /primary page\/form action/);
    assert.match(contributing, /real failure or risk state/);
    assert.match(contributing, /immediate user attention/);
    assert.match(contributing, /Keep\/drop audit/);
  });
});
