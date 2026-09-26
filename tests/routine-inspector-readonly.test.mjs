import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inspectorPath = path.join(root, 'src', 'views', 'RoutineInspectorPanel.tsx');

const routines = await import('../desktop/plugin.js');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

const JOB = {
  job_id: 'abc123',
  name: 'morning-digest',
  schedule: '0 9 * * *',
  schedule_display: 'Daily at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
  next_run_at: '2030-01-01T09:00:00-03:00',
};

function renderInspector(job = JOB) {
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

describe('routine-inspector-readonly', () => {
  it('routinePromptOf prefers prompt, then preview, then payload.prompt', async () => {
    assert.equal(routines.routinePromptOf(JOB), 'Summarize yesterday.');
    assert.equal(
      routines.routinePromptOf({ job_id: 'x', prompt_preview: 'Prev.' }),
      'Prev.',
    );
    assert.equal(
      routines.routinePromptOf({ job_id: 'x', payload: { prompt: 'Legacy.' } }),
      'Legacy.',
    );
    assert.equal(routines.routinePromptOf({ job_id: 'x' }), null);
    assert.equal(routines.routinePromptOf(null), null);
  });

  it('view keys prefer job_id; a name-only row is keyed by the fallback', async () => {
    assert.equal(routines.routineKey(JOB, 'Routine'), 'abc123');
    assert.equal(routines.jobIdOf(JOB), 'abc123');
    // A row without a job_id has no identity: the view falls back to its
    // positional label, and the name is never promoted to an id.
    assert.equal(routines.routineKey({ name: 'only-name' }, 'Routine'), 'Routine');
    assert.equal(routines.jobIdOf({ name: 'only-name' }), '');
    assert.equal(routines.routineKey(null, 'Routine'), 'Routine');
  });

  it('mirrors the composer sections with every control disabled', async () => {
    assert.equal(typeof routines.RoutineInspectorPanel, 'function');
    const tree = renderInspector();
    const allTexts = texts(tree).join(' ');
    assert.match(allTexts, /WHEN TO RUN/);
    assert.match(allTexts, /What should this routine do\?/);
    assert.match(allTexts, /Active/);
    assert.match(allTexts, /Daily at 09:00/);

    const nodes = collect(tree);

    const inputs = nodes.filter((n) => n.type === 'input');
    assert.ok(inputs.length >= 1, 'name input must exist');
    for (const input of inputs) {
      assert.equal(input.props.disabled, true, 'every input must be disabled');
    }
    const nameInput = inputs.find((n) => n.props['aria-label'] === 'Routine name');
    assert.ok(nameInput, 'name input must exist');
    assert.equal(nameInput.props.value, 'morning-digest');

    const areas = nodes.filter((n) => n.type === 'textarea');
    assert.ok(areas.length >= 1, 'instruction textarea must exist');
    for (const area of areas) {
      assert.equal(area.props.disabled, true, 'every textarea must be disabled');
    }
    assert.equal(areas[0].props.value, 'Summarize yesterday.');

    const switchBtn = nodes.find((n) => n.type === 'button' && n.props.role === 'switch');
    assert.ok(switchBtn, 'active switch must exist');
    assert.equal(switchBtn.props.disabled, true, 'switch must be disabled');
    assert.equal(switchBtn.props['aria-checked'], true);
  });

  it('ships no save/submit affordance and nothing beyond the composer', async () => {
    const tree = renderInspector();
    const allTexts = texts(tree).join(' ');
    assert.doesNotMatch(allTexts, /0 9 \* \* \*/, 'no cron expression');
    assert.doesNotMatch(allTexts, /Cron Expression/, 'no expression label');
    assert.doesNotMatch(allTexts, /abc123/, 'no backend id');
    assert.doesNotMatch(allTexts, /Routine ID/, 'no id row');
    assert.doesNotMatch(allTexts, /Next Run/, 'no run metadata');
    assert.doesNotMatch(allTexts, /Last Run/, 'no run metadata');
    assert.doesNotMatch(allTexts, /Last Result/, 'no run metadata');
    assert.doesNotMatch(allTexts, /Profile/, 'no route scope');
    assert.doesNotMatch(allTexts, /Connection/, 'no route scope');
    assert.doesNotMatch(allTexts, /Target/, 'no route scope');
    assert.doesNotMatch(allTexts, /Payload/, 'no payload dump');
    assert.doesNotMatch(allTexts, /Actions/, 'no actions section');

    const nodes = collect(tree);
    const buttons = nodes.filter((n) => n.type === 'button');
    const labels = buttons.map((b) => texts(b).join(''));
    assert.equal(buttons.length, 2, 'only back + disabled switch exist');
    assert.ok(labels.some((t) => /back to routines/i.test(t)), 'back action stays');
    assert.ok(!labels.some((t) => /pause/i.test(t)), 'no pause affordance');
    assert.ok(!labels.some((t) => /resume/i.test(t)), 'no resume affordance');
    assert.ok(!labels.some((t) => /copy/i.test(t)), 'no copy affordance');
    assert.ok(!labels.some((t) => /create/i.test(t)), 'no create affordance');
    assert.ok(!labels.some((t) => /save/i.test(t)), 'no save affordance');
  });

  it('source pins the future-edit seam (no dead buttons)', () => {
    const src = readFileSync(inspectorPath, 'utf8');
    assert.match(src, /EDIT SEAM/, 'inspector must mark where editable/onSave will land');
  });
});
