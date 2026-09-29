// Advanced settings UX (issue #65, phase 3, Part A).
//
// Drives the BUILT bundle through the composer / inspector / review:
// a secondary Advanced section in the composer (delivery only, no model
// picker), stored advanced values in the inspector only when they differ
// from the defaults, and review rows that read patchability off the row.
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// distinct human title on the same row (issue #45 lesson).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OWNER = { connectionId: 'c1', profile: 't1' };
const noop = () => {};
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

/**
 * Composer useState order (issue #72): name, prompt, startEnabled,
 * scheduleConfig, pendingPath, error, deliveryChoice, deliveryCustom.
 * The creation path is no longer a slot: it is the act each button performs.
 */
function presetComposer({ name, prompt, deliveryChoice, deliveryCustom, errorSlot } = {}) {
  reactStub.__presetStates([
    [name ?? 'Ops Digest', noop],
    [prompt ?? 'Summarize yesterday.', noop],
    [true, noop],
    [CONFIG, noop],
    [null, noop],
    [null, errorSlot ?? noop],
    [deliveryChoice ?? '', noop],
    [deliveryCustom ?? '', noop],
  ]);
}

/** The same slots, with one creation act in flight (or none at null). */
function presetComposerPending(pendingPath, overrides = {}) {
  const { name = 'Ops Digest', prompt = 'Summarize yesterday.', deliveryChoice = '', deliveryCustom = '' } = overrides;
  reactStub.__presetStates([
    [name, noop],
    [prompt, noop],
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

function submitButton(element) {
  const found = collect(element).find(
    (n) => n.type === 'button' && texts(n).join('').includes('Create Routine'),
  );
  assert.ok(found, 'submit button must exist');
  return found;
}

function deliverySelect(element) {
  const found = collect(element).find(
    (n) => n.type === routines.SelectField && n.props.label === 'Delivery',
  );
  assert.ok(found, 'Delivery control must exist');
  return found;
}

function renderInspector(job) {
  return routines.RoutineInspectorPanel({
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
}

const BASE_JOB = {
  job_id: 'job-ops-digest-7',
  name: 'Ops Digest',
  schedule: '0 9 * * *',
  schedule_display: 'Daily at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
};

function validatedFor(row, patch) {
  const out = routines.validateProposal({
    version: 1,
    jobId: row.job_id,
    owner: { ...OWNER },
    base: { fingerprint: routines.fingerprintJob(row) },
    patch: { ...patch },
    desiredActive: false,
  });
  assert.equal(out.ok, true, `fixture rejected: ${out.ok === false && out.message}`);
  return out.proposal;
}

function snapshotOf(row) {
  return routines.snapshotJobConfig(row);
}

function reviewWalk(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out;
  if (Array.isArray(node)) {
    node.forEach((child) => reviewWalk(child, out));
    return out;
  }
  if (typeof node === 'object') {
    out.push(node);
    reviewWalk(node.props && node.props.children, out);
  } else {
    out.push({ text: String(node) });
  }
  return out;
}

function reviewTexts(tree) {
  return reviewWalk(tree)
    .map((n) => (typeof n.text === 'string' ? n.text : ''))
    .filter(Boolean)
    .join(' ');
}

describe('advanced-ui composer', () => {
  it('keeps the primary composer focused; delivery defaults to absent', async () => {
    presetComposer();
    let submitted = null;
    const element = renderComposer({
      onSubmit: async (name, schedule, prompt, active, delivery) => {
        submitted = { name, schedule, prompt, active, delivery };
        return true;
      },
    });
    const body = texts(element).join(' ');
    assert.match(body, /Name/);
    assert.match(body, /What should this routine do\?/);
    assert.match(body, /WHEN TO RUN/);
    assert.match(body, /ADVANCED/);
    assert.match(body, /cannot be set from this surface/);
    // The Delivery preset control is a SelectField: its label lives in
    // props (expanded by collect), not in text children.
    deliverySelect(element);
    await submitButton(element).props.onClick();
    assert.deepEqual(submitted, {
      name: 'Ops Digest',
      schedule: routines.buildCronExpression(CONFIG),
      prompt: 'Summarize yesterday.',
      active: true,
      delivery: undefined,
    });
  });

  it('passes an explicit delivery override to submit', async () => {
    presetComposer({ deliveryChoice: 'all' });
    let submitted = null;
    const element = renderComposer({
      onSubmit: async (name, schedule, prompt, active, delivery) => {
        submitted = { name, schedule, prompt, active, delivery };
        return true;
      },
    });
    await submitButton(element).props.onClick();
    assert.equal(submitted.delivery, 'all');
  });

  it('passes a custom explicit target to the guided submit', async () => {
    presetComposerPending(null, { deliveryChoice: 'custom', deliveryCustom: 'telegram:-1001234567890' });
    let submitted = null;
    const element = renderComposer({
      onSubmit: async () => true,
      onSubmitGuided: async (name, schedule, prompt, delivery) => {
        submitted = { name, schedule, prompt, delivery };
        return true;
      },
    });
    const guided = collect(element).find(
      (n) => n.type === 'button' && texts(n).join('').includes('Finish with Hermes'),
    );
    assert.ok(guided, 'guided submit button must exist');
    await guided.props.onClick();
    assert.deepEqual(submitted, {
      name: 'Ops Digest',
      schedule: routines.buildCronExpression(CONFIG),
      prompt: 'Summarize yesterday.',
      delivery: 'telegram:-1001234567890',
    });
  });

  it('refuses an unsupported typed value with a visible error and never submits', async () => {
    let reported = null;
    presetComposer({
      deliveryChoice: 'custom',
      deliveryCustom: '!!! not a target !!!',
      errorSlot: (message) => {
        reported = message;
      },
    });
    let calls = 0;
    const element = renderComposer({
      onSubmit: async () => {
        calls += 1;
        return true;
      },
    });
    await submitButton(element).props.onClick();
    assert.equal(calls, 0, 'an invalid delivery must never reach submit');
    assert.ok(reported, 'the refusal must surface a visible error');
    assert.match(reported, /unsupported delivery/);
    assert.match(reported, /local/);
  });

  it('does not offer origin and ships no model picker', async () => {
    presetComposer();
    const element = renderComposer({ onSubmit: async () => true });
    const select = deliverySelect(element);
    const options = select.props.options;
    assert.ok(Array.isArray(options) && options.length >= 4);
    for (const opt of options) {
      assert.doesNotMatch(String(opt.value), /origin/i);
      assert.doesNotMatch(String(opt.label), /origin/i);
    }
    const nodes = collect(element);
    assert.ok(
      !nodes.some((n) => n.type === routines.SelectField && /model/i.test(n.props.label ?? '')),
      'no model picker may exist',
    );
    assert.ok(
      !nodes.some(
        (n) =>
          (n.type === 'input' || n.type === 'textarea') && /model/i.test(n.props['aria-label'] ?? ''),
      ),
      'no model input may exist',
    );
  });

  it('reveals the free-text slot only for a custom target', async () => {
    presetComposer();
    const preset = deliverySelect(renderComposer({ onSubmit: async () => true }));
    assert.deepEqual(
      preset.props.options.map((o) => o.value),
      ['', 'local', 'all', 'bot-chat', 'custom'],
    );
    presetComposer({ deliveryChoice: 'custom' });
    const custom = collect(renderComposer({ onSubmit: async () => true })).find(
      (n) => n.type === 'input' && n.props['aria-label'] === 'Custom delivery target',
    );
    assert.ok(custom, 'custom choice must reveal the free-text slot');
  });
});

describe('advanced-ui inspector', () => {
  it('shows a stored non-default delivery', async () => {
    const tree = renderInspector({ ...BASE_JOB, deliver: 'all' });
    const body = texts(tree).join(' ');
    assert.match(body, /ADVANCED/);
    assert.match(body, /Delivery/);
    const input = collect(tree).find((n) => n.type === 'input' && n.props['aria-label'] === 'Stored delivery');
    assert.ok(input, 'stored delivery must render');
    assert.equal(input.props.value, 'all');
    assert.equal(input.props.disabled, true);
  });

  it('shows a stored model override as read-only with the not-settable wording', async () => {
    const tree = renderInspector({ ...BASE_JOB, model: 'custom-pin-1' });
    const body = texts(tree).join(' ');
    assert.match(body, /ADVANCED/);
    assert.match(body, /Model override/);
    assert.match(body, /cannot be set from this surface/);
    const input = collect(tree).find(
      (n) => n.type === 'input' && n.props['aria-label'] === 'Stored model override',
    );
    assert.ok(input, 'stored model override must render');
    assert.equal(input.props.value, 'custom-pin-1');
    assert.equal(input.props.disabled, true);
  });

  it('hides the advanced block when everything is the default', async () => {
    const body = texts(renderInspector({ ...BASE_JOB })).join(' ');
    assert.doesNotMatch(body, /ADVANCED/);
  });
});

describe('advanced-ui review', () => {
  const ROW = {
    job_id: 'job-review-9',
    name: 'Morning Political Manager Brief',
    schedule: '0 9 * * *',
    prompt: 'Summarize yesterday',
    deliver: 'local',
    enabled: false,
  };

  function renderReview(review) {
    return routines.GuidedProposalReview({
      review,
      busy: false,
      onConfirm: noop,
      onContinueConfiguring: noop,
    });
  }

  it('reads a patchable delivery change as editable', async () => {
    const current = snapshotOf(ROW);
    const proposal = validatedFor(ROW, { delivery: 'all' });
    const review = routines.buildProposalReview(current, proposal);
    const delivery = review.rows.find((r) => r.field === 'delivery');
    assert.equal(delivery.patchable, true);
    assert.equal(delivery.changed, true);
    const body = reviewTexts(renderReview(review));
    assert.match(body, /Delivery/);
    assert.match(body, /editable/);
  });

  it('reads the model override as read-only, driven by the row rather than hardcoded', async () => {
    const current = snapshotOf(ROW);
    const proposal = validatedFor(ROW, { name: 'Evening Political Manager Brief' });
    const review = routines.buildProposalReview(current, proposal);
    const model = review.rows.find((r) => r.field === 'modelOverride');
    assert.equal(model.patchable, false);
    const tree = renderReview(review);
    const headers = reviewWalk(tree).filter((n) => n.type === 'th');
    const modelHeader = headers.find((h) => reviewTexts(h).includes('Model override'));
    assert.ok(modelHeader, 'model override row must exist');
    assert.match(reviewTexts(modelHeader), /not editable/);
    const nameHeader = headers.find((h) => reviewTexts(h).includes('Name'));
    assert.ok(nameHeader, 'name row must exist');
    assert.match(reviewTexts(nameHeader), /editable/);
    assert.doesNotMatch(reviewTexts(nameHeader), /not editable/);
  });
});

describe('advanced-ui guided panel', () => {
  function renderGuided(submittedDelivery) {
    return routines.GuidedRoutinePanel({
      routine: {
        jobId: 'job-guided-3',
        route: ROUTE,
        backendProfile: 't1',
        createdPaused: true,
        job: { ...BASE_JOB, job_id: 'job-guided-3', name: 'Guided Digest' },
      },
      submittedName: 'Guided Digest',
      submittedSchedule: 'Daily at 09:00',
      submittedPrompt: 'Summarize yesterday.',
      ...(submittedDelivery === undefined ? {} : { submittedDelivery }),
      onLaunch: async () => ({ ok: false, message: 'not launched in test' }),
      onClose: noop,
    });
  }

  it('shows a submitted non-default delivery and hides the default', async () => {
    assert.match(texts(renderGuided('all')).join(' '), /all/);
    assert.doesNotMatch(texts(renderGuided(undefined)).join(' '), /Delivery/);
  });
});
