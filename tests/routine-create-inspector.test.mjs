import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loaded(routes, profile = 'p1', connectionId = 'c1') {
  return { type: 'routes-loaded', routes, profile, connectionId };
}

function readyWith(jobs = []) {
  return reduce([
    loaded([ROUTE], 'p1', 'c1'),
    { type: 'list-loaded', jobs, key: 'c1::p1' },
  ]);
}

function renderView() {
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const routes = items.filter((c) => c.area === 'routes');
  let tree = routes[0].render();
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
    if (typeof n === 'object' && n.props && n.props.children) {
      walk(n.props.children);
    }
  }
  walk(tree);
  return out;
}

function paint(state) {
  const noop = () => {};
  reactStub.__presetStates([[state, noop], [0, noop]]);
  return renderView();
}

describe('routine-create-inspector', () => {
  it('renders the minimalist + button in the header top with correct a11y label', () => {
    const tree = paint(readyWith([{ name: 'job-1' }]));
    const nodes = collect(tree);
    const newBtn = nodes.find((n) => n.type === 'button' && n.props['aria-label'] === 'New routine');
    assert.ok(newBtn, 'New routine button must exist in header');
    assert.equal(newBtn.props.className, 'hr-btn-new');
  });

  it('renders RoutineComposerPanel via export with full high-abstraction controls', async () => {
    assert.equal(typeof routines.RoutineComposerPanel, 'function');

    let submitted = null;
    const element = routines.RoutineComposerPanel({
      activeProfile: 'p1',
      activeRoute: ROUTE,
      disabled: false,
      onClose: () => {},
      onSubmit: async (name, schedule, payload, active) => {
        submitted = { name, schedule, payload, active };
        return true;
      },
    });

    const nodes = collect(element);
    assert.ok(nodes.some((n) => n.type === 'aside' && n.props.className.includes('hr-create-inspector')));

    // Title
    const allTexts = texts(element).join(' ');
    assert.match(allTexts, /Create Routine/);
    assert.match(allTexts, /WHEN TO RUN/);
    assert.match(allTexts, /Active/);
    assert.match(allTexts, /This routine will run on the schedule below/);

    // Active switch
    const switchBtn = nodes.find((n) => n.type === 'button' && n.props.role === 'switch');
    assert.ok(switchBtn, 'Active toggle switch must exist');
    assert.equal(switchBtn.props['aria-checked'], true);

    // Name input & Action prompt textarea
    const inputs = nodes.filter((n) => n.type === 'input');
    const nameInput = inputs.find((n) => n.props.placeholder === 'Name this Routine');
    assert.ok(nameInput, 'Name input must exist');

    const textareas = nodes.filter((n) => n.type === 'textarea');
    const promptArea = textareas.find((n) => n.props['aria-label'] === 'What should this routine do?');
    assert.ok(promptArea, 'Action prompt textarea must exist');

    // Action buttons
    const buttons = nodes.filter((n) => n.type === 'button');
    assert.ok(buttons.some((b) => texts(b).join('').includes('Back to routines')));
    assert.ok(buttons.some((b) => texts(b).join('').includes('Cancel')));
    assert.ok(buttons.some((b) => texts(b).join('').includes('Create Routine')));

    // Ensure zero native form and zero native select tags
    assert.equal(nodes.some((n) => n.type === 'form'), false, 'no form tag allowed');
    assert.equal(nodes.some((n) => n.type === 'select'), false, 'no select tag allowed');
  });
});
