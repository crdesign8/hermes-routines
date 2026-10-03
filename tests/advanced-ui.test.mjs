// Results destination UX (issue #65 phase 3 Part A + issue #73).
//
// Drives the BUILT bundle through the composer / inspector / review:
// a RESULTS section in the composer that asks where results should go and
// offers only destinations the profile really exposes, stored advanced
// values in the inspector described in the same human words, and review
// rows that read patchability off the row.
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
// The destination roster the page hands down. A LOCAL route resolves a
// `bot-chat:` token on the job's own machine; a REMOTE one does not, so it
// must not appear in the picker (dead destination, #73).
const LOCAL_ROUTE = { connectionId: 'local', mode: 'local', profile: 'matias', targetProfile: 'matias' };
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
 * Composer useState order (issue #72, extended by #73): name, prompt,
 * startEnabled, scheduleConfig, pendingPath, error, then the destination
 * slots — destinationChoice, advancedPlatform, advancedChatId,
 * advancedThreadId, broadcastConfirmed, broadcastOptIn. The creation path
 * is no longer a slot: it is the act each button performs.
 */
function presetComposer({
  name,
  prompt,
  destinationChoice,
  advancedPlatform = '',
  advancedChatId = '',
  advancedThreadId = '',
  broadcastConfirmed = false,
  broadcastOptIn = false,
  errorSlot,
} = {}) {
  reactStub.__presetStates([
    [name ?? 'Ops Digest', noop],
    [prompt ?? 'Summarize yesterday.', noop],
    [true, noop],
    [CONFIG, noop],
    [null, noop],
    [null, errorSlot ?? noop],
    [destinationChoice ?? '', noop],
    [advancedPlatform, noop],
    [advancedChatId, noop],
    [advancedThreadId, noop],
    [broadcastConfirmed, noop],
    [broadcastOptIn, noop],
  ]);
}

function renderComposer({ onSubmit, onSubmitGuided, destinationRoutes = [LOCAL_ROUTE] } = {}) {
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
    destinationRoutes,
  });
}

function submitButton(element) {
  const found = collect(element).find(
    (n) => n.type === 'button' && texts(n).join('').includes('Create Routine'),
  );
  assert.ok(found, 'submit button must exist');
  return found;
}

/**
 * The results-destination control. Since issue #100 it is the host Select
 * family over NativeSelect, so it is found by its visible label text and
 * its role=combobox trigger rather than by the retired component identity.
 */
function destinationSelect(element) {
  const found = collect(element).find(
    (n) => n.type === 'button' && n.props.role === 'combobox' && n.props['aria-label'] === 'Where should results go?',
  );
  assert.ok(found, 'the results destination control must exist');
  return found;
}

/**
 * The destination options, as `{ value, label }` pairs.
 *
 * Since issue #100 the options are host `SelectItem`s in the rendered tree,
 * not an array on a prop: the value is the serialized string the select
 * stores, and the label is the item's text. Values reach the domain as the
 * same strings the composer passes down, so comparing them is unchanged.
 */
function destinationOptions(element) {
  const trigger = destinationSelect(element);
  // Scoped to THIS trigger's own Select root: the composer renders other
  // selects (the WHEN TO RUN trigger), and collecting every select-item on
  // the page would blend their options into the destination list.
  // Compared on the trigger's own key, not by object identity: each walk
  // rebuilds the tree, so `includes(trigger)` can never match.
  const key = trigger.props['aria-label'];
  const root = collect(element).find(
    (n) =>
      n.type === 'ui-select' &&
      collect(n).some((c) => c.type === 'button' && c.props['aria-label'] === key),
  );
  assert.ok(root, `the destination trigger ${key} must belong to a select`);
  const items = collect(root).filter(
    (n) => n.type === 'ui-select-item' && n.props['data-slot'] === 'select-item',
  );
  assert.ok(items.length > 0, 'the destination select must offer options');
  return items.map((n) => ({
    value: n.props.value,
    label: texts(n).join('').trim(),
    selected: n.props['aria-selected'] === true,
  }));
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
  it('keeps the primary composer focused; the destination defaults to the profile default', async () => {
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
    assert.match(body, /RESULTS/);
    // Issue #74: the create form carries no model block at all. A field
    // with no control, and the note explaining why, were both noise the
    // user had to interpret to make no decision.
    assert.doesNotMatch(body, /Model override/);
    assert.doesNotMatch(body, /cannot be set from this surface/);
    assert.doesNotMatch(body, /profile default/);
    assert.doesNotMatch(body, /every connected channel/i);
    assert.doesNotMatch(body, /Send to every connected channel/);
    // The destination control is the host select; its trigger names the
    // question in its accessible name rather than in text children.
    destinationSelect(element);
    await submitButton(element).props.onClick();
    assert.deepEqual(submitted, {
      name: 'Ops Digest',
      schedule: routines.buildCronExpression(CONFIG),
      prompt: 'Summarize yesterday.',
      active: true,
      delivery: undefined,
    });
  });

  it('refuses a primary broadcast token instead of submitting it', async () => {
    let reported = null;
    presetComposer({
      destinationChoice: 'all',
      broadcastConfirmed: true,
      broadcastOptIn: true,
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
    const labels = destinationOptions(element).map((o) => o.label);
    assert.ok(!labels.includes('Send to every connected channel'));
    await submitButton(element).props.onClick();
    assert.equal(calls, 0, 'a primary broadcast value must never reach submit');
    assert.match(reported, /not a primary destination/i);
  });

  it('resolves a chosen Bot Chat into the backend representation the guided path also uses', async () => {
    presetComposer({ destinationChoice: 'bot-chat:matias' });
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
      delivery: 'bot-chat:matias',
    });
  });

  it('builds a specific destination from the structured override, never a typed protocol string', async () => {
    presetComposer({
      destinationChoice: 'advanced',
      advancedPlatform: 'telegram',
      advancedChatId: '-1001234567890',
    });
    let submitted = null;
    const element = renderComposer({
      onSubmit: async (name, schedule, prompt, active, delivery) => {
        submitted = { name, schedule, prompt, active, delivery };
        return true;
      },
    });
    await submitButton(element).props.onClick();
    assert.equal(submitted.delivery, 'telegram:-1001234567890');
  });

  it('refuses an incomplete structured override with a visible error and never submits', async () => {
    let reported = null;
    presetComposer({
      destinationChoice: 'advanced',
      advancedPlatform: 'telegram',
      advancedChatId: '',
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
    assert.equal(calls, 0, 'an invalid destination must never reach submit');
    assert.ok(reported, 'the refusal must surface a visible error');
    assert.match(reported, /address/i);
  });

  it('refuses a structured field that smuggles a separator instead of splitting on it', async () => {
    let reported = null;
    presetComposer({
      destinationChoice: 'advanced',
      advancedPlatform: 'telegram:-1',
      advancedChatId: 'ops',
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
    assert.equal(calls, 0, 'a malformed override must never reach submit');
    assert.ok(reported, 'the refusal must surface a visible error');
  });

  it('does not offer origin, invents no destination, and ships no model picker', async () => {
    presetComposer();
    const element = renderComposer({ onSubmit: async () => true });
    const select = destinationSelect(element);
    const options = destinationOptions(element);
    assert.ok(Array.isArray(options) && options.length >= 3);
    for (const opt of options) {
      assert.doesNotMatch(String(opt.value), /origin/i);
      assert.doesNotMatch(String(opt.label), /origin/i);
    }
    const nodes = collect(element);
    assert.ok(
      !nodes.some(
        (n) =>
          n.type === 'button' &&
          n.props.role === 'combobox' &&
          /model/i.test(n.props['aria-label'] ?? ''),
      ),
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

  it('offers no typed-protocol input in the ordinary flow (#73)', async () => {
    presetComposer();
    const nodes = collect(renderComposer({ onSubmit: async () => true }));
    assert.ok(
      !nodes.some((n) => n.type === 'input' && /chat_id|bot-chat:/i.test(n.props.placeholder ?? '')),
      'no free-text protocol-slot may exist outside the advanced override',
    );
    // The override itself is structured: one field per part, no single
    // string that must be typed as a protocol.
    presetComposer({ destinationChoice: 'advanced' });
    const advanced = collect(renderComposer({ onSubmit: async () => true }));
    const labels = advanced
      .filter((n) => n.type === 'input')
      .map((n) => n.props['aria-label'] ?? '');
    assert.deepEqual(labels.filter((l) => /advanced destination/i.test(l)).sort(), [
      'Advanced destination channel or chat id',
      'Advanced destination platform',
      'Advanced destination thread id',
    ]);
  });

  it('reveals the structured override only for the advanced choice', async () => {
    presetComposer();
    const element = renderComposer({ onSubmit: async () => true });
    destinationSelect(element);
    assert.deepEqual(
      destinationOptions(element).map((o) => o.value),
      ['', 'local', 'bot-chat:matias', 'advanced'],
    );
    assert.ok(
      !destinationOptions(element).some((o) => o.value === 'all' || /every connected channel/i.test(o.label)),
      'broadcast must not be a primary destination',
    );
    presetComposer({ destinationChoice: 'advanced' });
    const custom = collect(renderComposer({ onSubmit: async () => true })).find(
      (n) => n.type === 'input' && n.props['aria-label'] === 'Advanced destination platform',
    );
    assert.ok(custom, 'the advanced choice must reveal the structured fields');
  });

  it('hides an unreachable destination and lists a resolvable one by name (#73)', async () => {
    presetComposer();
    const element = renderComposer({
      onSubmit: async () => true,
      // The active route is remote: its backend profile lives on another
      // machine, where the token cannot resolve.
      destinationRoutes: [ROUTE, LOCAL_ROUTE],
    });
    const labels = destinationOptions(element).map((o) => o.label);
    assert.ok(labels.includes('Bot Chat → matias'), 'a local destination is offered by name');
    assert.ok(
      !labels.some((l) => /t1/.test(l)),
      'a remote route must not be offered as a destination',
    );
    assert.ok(
      !labels.some((l) => /Backend default|no override|Custom target/i.test(l)),
      'backend vocabulary must be gone from the picker',
    );
  });

  it('offers only the always-available choices when nothing was discovered', async () => {
    presetComposer();
    const element = renderComposer({ onSubmit: async () => true, destinationRoutes: [] });
    assert.deepEqual(
      destinationOptions(element).map((o) => o.value),
      ['', 'local', 'advanced'],
    );
    assert.ok(
      !destinationOptions(element).some((o) => o.value === 'all'),
      'an empty roster still must not offer broadcast',
    );
  });
});

describe('advanced-ui broadcast guard', () => {
  it('hides fan-out until the advanced path is opened, and does not select it there', async () => {
    presetComposer();
    const quiet = renderComposer({ onSubmit: async () => true });
    assert.equal(
      collect(quiet).some((n) => texts(n).join('').includes('Send to every connected channel')),
      false,
      'the primary flow must not name fan-out',
    );

    presetComposer({ destinationChoice: 'advanced' });
    const advanced = renderComposer({ onSubmit: async () => true });
    const optIn = collect(advanced).find(
      (n) => n.type === 'button' && texts(n).join('').includes('Send to every connected channel instead'),
    );
    assert.ok(optIn, 'the advanced path must offer fan-out as a separate act');
    assert.equal(
      collect(advanced).some((n) => n.type === 'input' && n.props.type === 'checkbox'),
      false,
      'opening advanced must not select fan-out',
    );
    assert.equal(submitButton(advanced).props.disabled, false);
  });

  it('requires an explicit acknowledgement before any create can proceed', async () => {
    presetComposer({ destinationChoice: 'advanced', broadcastOptIn: true });
    let calls = 0;
    const element = renderComposer({
      onSubmit: async () => {
        calls += 1;
        return true;
      },
      onSubmitGuided: async () => {
        calls += 1;
        return true;
      },
    });
    // The acknowledgement is painted and states the impact in words.
    const check = collect(element).find(
      (n) => n.type === 'input' && n.type !== undefined && n.props.type === 'checkbox',
    );
    assert.ok(check, 'the fan-out choice must render an acknowledgement');
    assert.match(texts(element).join(' '), /every connected channel/i);
    // Every create act is disabled while it is unacknowledged...
    for (const label of ['Create Routine', 'Finish with Hermes']) {
      const button = collect(element).find(
        (n) => n.type === 'button' && texts(n).join('').includes(label),
      );
      assert.equal(button.props.disabled, true, `${label} must be blocked`);
    }
    // ...and the handler refuses too, so the guard is not only a disabled
    // button that some other route could bypass.
    let reported = null;
    presetComposer({
      destinationChoice: 'advanced',
      broadcastOptIn: true,
      errorSlot: (message) => {
        reported = message;
      },
    });
    const guard = renderComposer({
      onSubmit: async () => {
        calls += 1;
        return true;
      },
    });
    await submitButton(guard).props.onClick();
    assert.equal(calls, 0, 'an unacknowledged fan-out must never reach submit');
    assert.match(reported, /every connected channel/i);
  });

  it('lets the create through once the fan-out is acknowledged', async () => {
    presetComposer({
      destinationChoice: 'advanced',
      broadcastOptIn: true,
      broadcastConfirmed: true,
      advancedPlatform: 'telegram',
      advancedChatId: 'ops',
    });
    let submitted = null;
    const element = renderComposer({
      onSubmit: async (name, schedule, prompt, active, delivery) => {
        submitted = { name, schedule, prompt, active, delivery };
        return true;
      },
    });
    assert.equal(submitButton(element).props.disabled, false);
    await submitButton(element).props.onClick();
    assert.equal(submitted.delivery, 'all');
  });

  it('shows no acknowledgement for a quiet destination', async () => {
    presetComposer({ destinationChoice: 'local' });
    const element = renderComposer({ onSubmit: async () => true });
    assert.ok(
      !collect(element).some((n) => n.type === 'input' && n.props.type === 'checkbox'),
      'keeping results local must not demand a fan-out acknowledgement',
    );
    assert.equal(submitButton(element).props.disabled, false);
  });
});

describe('advanced-ui inspector', () => {
  it('describes a stored non-default destination in human words', async () => {
    const tree = renderInspector({ ...BASE_JOB, deliver: 'bot-chat:matias' });
    const body = texts(tree).join(' ');
    assert.match(body, /ADVANCED/);
    assert.match(body, /Results go to/);
    assert.match(body, /Bot Chat → matias/);
    // The backend value stays readable, so an unexplained target is
    // falsifiable rather than merely hidden.
    const input = collect(tree).find((n) => n.type === 'input' && n.props['aria-label'] === 'Stored delivery');
    assert.ok(input, 'stored delivery must render');
    assert.equal(input.props.value, 'bot-chat:matias');
    assert.equal(input.props.disabled, true);
  });

  it('names a stored fan-out destination and keeps it marked as a fan-out', async () => {
    const body = texts(renderInspector({ ...BASE_JOB, deliver: 'all' })).join(' ');
    assert.match(body, /every connected channel/i);
    assert.doesNotMatch(body, /\bplatform:chat_id\b/);
  });

  it('reports a stored model pin as a read-only line, never as a field', async () => {
    const tree = renderInspector({ ...BASE_JOB, model: 'custom-pin-1' });
    const body = texts(tree).join(' ');
    assert.match(body, /ADVANCED/);
    assert.match(body, /Model/);
    assert.match(body, /custom-pin-1/);
    // Issue #74: a disabled input is still a form field the user looks
    // like they failed to fill in, and the "cannot be set from this
    // surface" note is the dead text the issue asks to remove. The pin
    // stays reported — the backend applies it, so it must stay
    // falsifiable — as a plain read-only row with no control and no
    // explanation to interpret.
    assert.doesNotMatch(body, /Model override/);
    assert.doesNotMatch(body, /cannot be set from this surface/);
    assert.equal(
      collect(tree).some((n) => n.type === 'input' && n.props['aria-label'] === 'Stored model override'),
      false,
      'the stored model must not render as an input',
    );
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
    // The label asks the user's question; the cells keep the backend
    // truth, because this table IS the comparison against stored values.
    assert.match(body, /Results go to/);
    assert.match(body, /editable/);
    assert.match(body, /every connected channel/i);
  });

  it('reports the model as read-only, driven by the row rather than hardcoded', async () => {
    const current = snapshotOf(ROW);
    const proposal = validatedFor(ROW, { name: 'Evening Political Manager Brief' });
    const review = routines.buildProposalReview(current, proposal);
    const model = review.rows.find((r) => r.field === 'modelOverride');
    assert.equal(model.patchable, false);
    const tree = renderReview(review);
    const headers = reviewWalk(tree).filter((n) => n.type === 'th');
    // Issue #74: the row stays — a review that quietly drops a value the
    // backend applies is not a review — but it is no longer a "Model
    // override" field, only a reported value an apply cannot touch.
    const modelHeader = headers.find((h) => reviewTexts(h).includes('Model'));
    assert.ok(modelHeader, 'model row must exist');
    assert.match(reviewTexts(modelHeader), /not editable/);
    assert.doesNotMatch(reviewTexts(modelHeader), /Model override/);
    const nameHeader = headers.find((h) => reviewTexts(h).includes('Name'));
    assert.ok(nameHeader, 'name row must exist');
    assert.match(reviewTexts(nameHeader), /editable/);
    assert.doesNotMatch(reviewTexts(nameHeader), /not editable/);
    assert.doesNotMatch(
      reviewTexts(tree),
      /every connected channel/i,
      'an ordinary proposal must not warn about fan-out',
    );
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

  it('shows a submitted non-default destination in human words and hides the default', async () => {
    assert.match(texts(renderGuided('bot-chat:matias')).join(' '), /Bot Chat → matias/);
    assert.doesNotMatch(texts(renderGuided(undefined)).join(' '), /Results go to/);
  });
});
