// Composer hierarchy (issue #72) under the attention budget (issue #92).
//
// Drives the BUILT bundle — the artifact the Desktop loads — and pins the
// two questions the issue turns on:
//
//   1. HIERARCHY. The form starts with what the routine should do and when
//      it runs. Hermes-assisted configuration is a quiet secondary act
//      next to the final actions (a borderless button plus one sentence),
//      never a first control, never a card, and never a persistent on/off
//      property of the routine.
//   2. HONESTY. Choosing the assisted path is an ACT, so the single
//      sentence says what happens to the routine (paused until enabled),
//      and the same draft that feeds one path feeds the other without
//      redundant field completion.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const noop = () => {};
const CONFIG = routines.DEFAULT_SCHEDULE_CONFIG;
// The two acts are located by accessible name / host variant since issue
// #100 moved both onto the host Button (the hr-btn-* classes are gone).
// Naming the control is the stronger assertion anyway: it is what a user
// and a screen reader actually reach.
const HERMES_QUIET = 'hr-create-hermes-quiet';
const HERMES_NOTE = 'hr-create-hermes-note';
const HERMES_SENTENCE = 'Let Hermes review this paused routine in chat before you enable it.';

/** Composer useState order: name, prompt, startEnabled, scheduleConfig, pendingPath, error, deliveryChoice, deliveryCustom. */
function presetDraft({ name, prompt, pendingPath = null, deliveryChoice = '', deliveryCustom = '' } = {}) {
  reactStub.__presetStates([
    [name ?? 'Ops Digest', noop],
    [prompt ?? 'Summarize yesterday.', noop],
    [true, noop],
    [CONFIG, noop],
    [pendingPath, noop],
    [null, noop],
    [deliveryChoice, noop],
    [deliveryCustom, noop],
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
  });
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
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n === 'object' && n.props && n.props.children) walk(n.props.children);
  })(node);
  return out.join(' ');
}

function renderGuided() {
  presetDraft();
  return renderComposer({
    onSubmit: async () => true,
    onSubmitGuided: async () => true,
  });
}

function finishButton(element) {
  const found = documentOrder(element).find(
    (n) => n.type === 'button' && n.props['aria-label'] === 'Create this routine and finish the setup with Hermes',
  );
  assert.ok(found, 'the Finish with Hermes action must exist');
  return found;
}

/**
 * The direct act, located by host variant rather than by text: while the
 * guided path is pending its label reads "Creating...", so the text is not a
 * stable key.
 */
function directButton(element) {
  const found = documentOrder(element).find((n) => n.type === 'button' && n.props['data-variant'] === 'default');
  assert.ok(found, 'the Create Routine action must exist');
  return found;
}

describe('composer hierarchy (issue #72)', () => {
  it('starts with user intent and keeps the assisted path down by the actions', () => {
    const order = documentOrder(renderGuided());
    const indexOf = (predicate, what) => {
      const at = order.findIndex(predicate);
      assert.notEqual(at, -1, `${what} must render`);
      return at;
    };

    const name = indexOf((n) => n.type === 'input' && n.props['aria-label'] === 'Name this Routine', 'name field');
    const instruction = indexOf(
      (n) => n.type === 'textarea' && n.props['aria-label'] === 'What should this routine do?',
      'instruction field',
    );
    const schedule = indexOf(
      (n) =>
        n.type === 'div' &&
        n.props.className === 'hr-create-section-label' &&
        textOf(n).trim() === 'WHEN TO RUN',
      'schedule section',
    );
    const startEnabled = indexOf(
      (n) => n.type === 'button' && n.props['aria-label'] === 'Start the routine enabled',
      'start-enabled switch',
    );
    const hermes = indexOf((n) => n.props && n.props.className === HERMES_QUIET, 'Hermes quiet act');
    const actions = indexOf(
      (n) => n.type === 'div' && n.props.className === 'hr-create-actions',
      'final actions',
    );

    // Intent first, mechanism last: the user is asked what to automate
    // before being asked how the configuration mechanism works.
    assert.ok(name < instruction, 'the name comes before the instruction');
    assert.ok(instruction < schedule, 'the instruction comes before the schedule');
    assert.ok(schedule < startEnabled, 'creation-time state comes after the schedule');
    assert.ok(startEnabled < hermes, 'the assisted path is not a form setting above the fields');
    assert.ok(hermes < actions, 'the assisted path sits with the final actions');
  });

  it('is not a persistent on/off property: no second switch, no toggle affordance', () => {
    const nodes = documentOrder(renderGuided());
    const switches = nodes.filter((n) => n.type === 'button' && n.props.role === 'switch');
    assert.equal(switches.length, 1, 'exactly one switch: the creation-time enabled state');
    assert.equal(switches[0].props['aria-label'], 'Start the routine enabled');

    const finish = finishButton(renderGuided());
    assert.equal(finish.props.role, undefined, 'an act is a button, not a switch');
    assert.equal(finish.props['aria-checked'], undefined, 'nothing to check: the path is not a state');
    assert.doesNotMatch(textOf(renderGuided()), /Configure with Hermes/);
  });

  it('explains the assisted path in exactly one sentence, and stays quiet', () => {
    const element = renderGuided();
    const copy = textOf(element);
    assert.match(copy, /Finish with Hermes/);
    // The one supporting sentence: paused, in chat, before enabling.
    assert.match(copy, /Let Hermes review this paused routine in chat before you enable it\./);
    // No card chrome and no second explanation: the retired card, subtitle,
    // and per-draft hint must all be gone.
    const nodes = documentOrder(element);
    assert.equal(
      nodes.some((n) => n.props && n.props.className === 'hr-create-hermes-card'),
      false,
      'no highlighted card around the assisted path',
    );
    assert.doesNotMatch(copy, /Hermes reviews this draft in a chat/);
    assert.doesNotMatch(copy, /Nothing here has to be finished first/);
    assert.doesNotMatch(copy, /stays paused until you review what Hermes proposes/);
    assert.doesNotMatch(copy, /Add a name and an instruction/);
    // Never a claim of activation.
    assert.doesNotMatch(copy, /will be active|starts running|runs immediately/i);
    // Exactly one supporting sentence node.
    const notes = nodes.filter((n) => n.props && n.props.className === HERMES_NOTE);
    assert.equal(notes.length, 1, 'exactly one supporting sentence');
    assert.equal(textOf(notes[0]).trim(), HERMES_SENTENCE);
  });

  it('offers the assisted path on a partial draft, without redundant completion', () => {
    // A draft that has only the backend-required pair: no delivery override,
    // no model pin, and the enabled state left untouched.
    presetDraft({ deliveryChoice: '', deliveryCustom: '' });
    const finish = finishButton(
      renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true }),
    );
    assert.equal(finish.props.disabled, false, 'a name and an instruction are enough to ask Hermes');
  });

  it('refuses an incomplete draft on both paths, quietly', () => {
    for (const draft of [{ name: '', prompt: 'Do the thing' }, { name: 'Ops Digest', prompt: '  ' }]) {
      presetDraft(draft);
      const element = renderComposer({ onSubmit: async () => true, onSubmitGuided: async () => true });
      const finish = finishButton(element);
      const create = directButton(element);
      assert.ok(create, 'the direct action must exist');
      assert.equal(finish.props.disabled, true, 'an unusable draft cannot enter the assisted path');
      assert.equal(create.props.disabled, true, 'and cannot be created either');
      // The budget allows no second hint here: the single sentence stays,
      // and the disabled acts refuse the draft without explaining twice.
      assert.match(textOf(element), /Let Hermes review this paused routine in chat before you enable it\./);
      assert.doesNotMatch(textOf(element), /Add a name and an instruction/);
    }
  });

  it('routes one draft to both paths, each by pressing the act itself', async () => {
    const direct = [];
    const guided = [];
    presetDraft();
    const element = renderComposer({
      onSubmit: async (...args) => {
        direct.push(args);
        return true;
      },
      onSubmitGuided: async (...args) => {
        guided.push(args);
        return true;
      },
    });
    const order = documentOrder(element);

    await finishButton(element).props.onClick();
    assert.equal(guided.length, 1, 'the card performs the guided create');
    assert.equal(direct.length, 0, 'and never the ordinary one');
    assert.deepEqual(guided[0], [
      'Ops Digest',
      routines.buildCronExpression(CONFIG),
      'Summarize yesterday.',
      undefined,
    ]);

    const create = order.find((n) => n.type === 'button' && n.props['data-variant'] === 'default');
    assert.ok(create, 'the direct action must exist');
    await create.props.onClick();
    assert.equal(direct.length, 1, 'the direct action performs the ordinary create');
    assert.equal(guided.length, 1, 'and never the guided one');
    assert.deepEqual(direct[0], [
      'Ops Digest',
      routines.buildCronExpression(CONFIG),
      'Summarize yesterday.',
      true,
      undefined,
    ]);
  });

  it('never lets the guided create inherit the creation-time enabled state', async () => {
    // Start enabled is TRUE here, and the switch is right there: the guided
    // act must still create paused, and the handler must not even be
    // offered an active flag to misuse.
    for (const startEnabled of [true, false]) {
      reactStub.__presetStates([
        ['Ops Digest', noop],
        ['Summarize yesterday.', noop],
        [startEnabled, noop],
        [CONFIG, noop],
        [null, noop],
        [null, noop],
        ['', noop],
        ['', noop],
      ]);
      const calls = [];
      const element = renderComposer({
        onSubmit: async (...args) => {
          calls.push(['direct', args]);
          return true;
        },
        onSubmitGuided: async (...args) => {
          calls.push(['guided', args]);
          return true;
        },
      });
      await finishButton(element).props.onClick();
      assert.equal(calls.length, 1, 'exactly one create happened');
      assert.equal(calls[0][0], 'guided');
      assert.equal(calls[0][1].length, 4, 'name, schedule, prompt, delivery — no active flag');
      assert.equal(calls[0][1].includes(true), false);
      assert.equal(calls[0][1].includes(false), false);
    }
  });

  it('keeps each action reachable and self-describing while in flight', () => {
    for (const [pendingPath, label] of [
      ['guided', 'Starting…'],
      ['direct', 'Creating…'],
    ]) {
      presetDraft({ pendingPath });
      const element = renderComposer({
        onSubmit: async () => true,
        onSubmitGuided: async () => true,
      });
      const finish = finishButton(element);
      const create = directButton(element);
      // The in-flight act states its own outcome; the other stays at its
      // resting label, and neither is clickable again.
      assert.match(textOf(finish), pendingPath === 'guided' ? new RegExp(label) : /Finish with Hermes →/);
      assert.match(textOf(create), pendingPath === 'direct' ? new RegExp(label) : /Create Routine/);
      assert.equal(finish.props.disabled, true, 'an in-flight form takes no second submit');
      assert.equal(create.props.disabled, true);
    }
  });

  it('creates the routine once even when the act is pressed twice in one tick', async () => {
    // `setPendingPath` paints on the next render, so a state-only guard
    // still lets a second click through in the same tick — and a create
    // mints a new job every time. The ref is what closes that window.
    for (const [first, second] of [
      ['guided', 'guided'],
      ['direct', 'direct'],
      ['guided', 'direct'],
    ]) {
      presetDraft();
      const direct = [];
      const guided = [];
      const element = renderComposer({
        onSubmit: async (...args) => {
          direct.push(args);
          // The direct handler resolves immediately, so the second press
          // is only blocked by the in-flight claim, not by a pending
          // await keeping the promise open.
          return true;
        },
        onSubmitGuided: async (...args) => {
          guided.push(args);
          return true;
        },
      });
      const press = (path) =>
        (path === 'guided' ? finishButton(element) : directButton(element)).props.onClick();
      // Not awaited in between: both clicks run before any re-render.
      const firstClick = press(first);
      const secondClick = press(second);
      await Promise.all([firstClick, secondClick]);
      const total = direct.length + guided.length;
      assert.equal(total, 1, `pressing ${first} then ${second} must create exactly one routine`);
      assert.equal(guided.length, first === 'guided' ? 1 : 0, 'the first press decides the path');
    }
  });

  it('offers no reachable way to fall through from the assisted act', () => {
    // The handler is the only thing that makes the assisted act exist, and
    // `handleSubmit('guided')` refuses when it is absent rather than
    // running the direct create. The refusal is not reachable through the
    // UI — so the guarantee is pinned where it IS reachable: no handler
    // means no act on screen, and no create happened in the process.
    presetDraft();
    let directCalls = 0;
    const element = renderComposer({
      onSubmit: async () => {
        directCalls += 1;
        return true;
      },
    });
    assert.equal(
      documentOrder(element).some((n) => n.props && n.props.className === HERMES_QUIET),
      false,
      'no assisted act without a handler, so no fallthrough to reach',
    );
    assert.equal(directCalls, 0, 'and nothing was created along the way');
  });

  it('stays keyboard-reachable: named controls, no focus traps, no disabled form', () => {
    const nodes = documentOrder(renderGuided());
    // The assisted act is a real button with an accessible name, so it is
    // in the tab order by construction and is not carried by a div click.
    const finish = finishButton(nodes);
    assert.equal(finish.type, 'button');
    assert.equal(finish.props['aria-label'], 'Create this routine and finish the setup with Hermes');
    // The quiet block is a labelled region, so a screen reader can reach
    // the explanation as a whole instead of loose strings. The visible
    // label lives on the button; the title stays screen-reader-only so the
    // name is not painted twice.
    const card = nodes.find((n) => n.props && n.props.className === HERMES_QUIET);
    assert.equal(card.type, 'section');
    assert.equal(card.props['aria-labelledby'], 'hr-create-hermes-title');
    const title = nodes.find((n) => n.props && n.props.id === 'hr-create-hermes-title');
    assert.ok(title, 'the quiet block title must be the labelled target');
    assert.match(String(title.props.className || ''), /hr-sr-only/, 'the title adds no visible copy');
    // No positive tabindex anywhere: focus order stays the document order
    // the hierarchy above already defines.
    for (const node of nodes) {
      const tabindex = node.props ? node.props.tabIndex ?? node.props.tabindex : undefined;
      assert.ok(
        tabindex === undefined || Number(tabindex) <= 0,
        'a positive tabindex would break the reading order',
      );
    }
    // Still a plugin, not a document: no form element to trap submission.
    assert.equal(nodes.some((n) => n.type === 'form'), false, 'no form tag allowed');
  });

  it('offers no assisted path where the page has no guided handler', () => {
    presetDraft();
    const element = renderComposer();
    const nodes = documentOrder(element);
    assert.equal(nodes.some((n) => n.props && n.props.className === HERMES_QUIET), false);
    assert.doesNotMatch(textOf(element), /Finish with Hermes/);
    // The direct path is untouched, including the creation-time state.
    assert.match(textOf(element), /Start enabled/);
    const create = nodes.find((n) => n.type === 'button' && n.props['data-variant'] === 'default');
    assert.equal(create.props.disabled, false, 'a complete draft is still directly creatable');
  });
});
