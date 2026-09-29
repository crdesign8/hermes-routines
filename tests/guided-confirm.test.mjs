import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Contract for issue #64: a guided configuration must pass a review
// boundary before anything is mutated, and it must not claim an active
// routine on anything weaker than backend truth.
//
// The three properties this file pins, in the order the issue states them:
//
//   1. NOTHING MUTATES WITHOUT AN EXPLICIT DECISION. The reducer only
//      reaches `applying` through a `confirm` event, and the gateway
//      only reaches the backend through `confirmProposal`.
//   2. THE ORDER IS THE GUARANTEE. Stale guard, then apply, then
//      verify the persisted values, and only then resume — and only
//      when the person asked for it. The exact host-call sequence is
//      asserted per scenario, because a reordering here is silent: the
//      happy path would still pass.
//   3. FAILURES ARE STAGED AND RECOVERABLE. Each refusal names the
//      stage it happened in and a recovery that is safe to offer, and
//      no failure path removes the provisional job.
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// distinct human title on every row, so a name-addressed mutation could
// not pass unnoticed.

register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const sdk = await import('./stubs/sdk-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OTHER_ROUTE = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };
const OWNER = { connectionId: 'c1', profile: 't1' };
const OLD_ID = 'job-old-1';
const NEW_ID = 'job-new-2';
const TITLE = 'Morning Political Manager Brief';
const NEW_NAME = 'Evening Political Manager Brief';
const OLD_SCHEDULE = '0 9 * * *';
const NEW_SCHEDULE = '0 18 * * *';
const OLD_PROMPT = 'Summarize yesterday';
const NEW_PROMPT = 'Summarize today';

// The delivery channel is part of the base fingerprint, so every row
// carries it: a fixture that omitted it would report a stale target for
// reasons that have nothing to do with the scenario under test.
// #65: delivery is now a writable patch field, so the fixture must carry a
// value that passes the grammar — a placeholder that was never writable
// before now fails the apply for the wrong reason.
const DELIVERY = 'telegram:-1001234567890';

function oldRow(overrides = {}) {
  return {
    job_id: OLD_ID,
    name: TITLE,
    schedule: OLD_SCHEDULE,
    prompt: OLD_PROMPT,
    delivery: DELIVERY,
    enabled: false,
    ...overrides,
  };
}

/** The row a verified apply leaves behind: new id, new values, paused. */
function newRow(overrides = {}) {
  return {
    job_id: NEW_ID,
    name: NEW_NAME,
    schedule: NEW_SCHEDULE,
    prompt: NEW_PROMPT,
    delivery: DELIVERY,
    enabled: false,
    ...overrides,
  };
}

function proposalFor(row, patch, owner = OWNER, note) {
  const out = {
    version: 1,
    jobId: row.job_id,
    owner: { ...owner },
    base: { fingerprint: routines.fingerprintJob(row) },
    patch: { ...patch },
    desiredActive: false,
  };
  if (note !== undefined) out.note = note;
  return out;
}

const PATCH = { name: NEW_NAME, schedule: NEW_SCHEDULE, prompt: NEW_PROMPT };

/** A validated proposal for the OLD row with the NEW values. */
function validated(options = {}) {
  const patch = { ...PATCH, ...(options.patch || {}) };
  const out = routines.validateProposal(proposalFor(oldRow(), patch, options.owner, options.note));
  assert.equal(out.ok, true, `fixture rejected: ${out.ok === false && out.message}`);
  return out.proposal;
}

/** The authoritative snapshot of the paused OLD row, as a read returns it. */
function oldSnapshot() {
  return {
    name: TITLE,
    schedule: OLD_SCHEDULE,
    prompt: OLD_PROMPT,
    delivery: DELIVERY,
    modelOverride: '',
    paused: true,
  };
}

function actions() {
  return sdk.__calls().filter((c) => c.door === 'requestProfile').map((c) => c.args[2]);
}

function actionNames() {
  return actions().map((p) => p.action);
}

/**
 * Queue-driven host stub, copied from the #63 suite: each step is the
 * answer for exactly one `cron.manage` call, a function step asserts the
 * params it was called with, and an extra call fails loudly instead of
 * silently receiving `undefined`.
 */
function hostFor(steps) {
  sdk.__reset();
  const queue = [...steps];
  sdk.__setHost({
    requestProfile: async (route, method, params) => {
      const next = queue.shift();
      assert.ok(next !== undefined, `unexpected host call: ${JSON.stringify(params)}`);
      if (typeof next === 'function') return next(params);
      return next;
    },
  });
}

/** The pre-mutation stale guard + the primitive's own guard + the write. */
function appliedSteps(resumeAnswer) {
  return [
    { jobs: [oldRow()] },
    { jobs: [oldRow()] },
    (params) => {
      assert.deepEqual(params, {
        action: 'add',
        name: NEW_NAME,
        schedule: NEW_SCHEDULE,
        prompt: NEW_PROMPT,
        // #65: the stored delivery is carried forward onto the replacement.
        deliver: DELIVERY,
        profile: 't1',
      });
      return { success: true, job_id: NEW_ID, name: NEW_NAME, job: { job_id: NEW_ID, enabled: true } };
    },
    (params) => {
      assert.deepEqual(params, { action: 'pause', name: NEW_ID, profile: 't1' });
      return { success: true, job: { job_id: NEW_ID, enabled: false } };
    },
    (params) => {
      assert.equal(params.action, 'remove');
      assert.equal(params.name, OLD_ID, 'the superseded row is addressed by exact job_id');
      return { success: true };
    },
    { jobs: [newRow()] },
    { jobs: [newRow()] },
  ];
}

describe('guided workflow state model (pure, no host)', () => {
  const S = routines.GUIDED_WORKFLOW_STATE;

  it('starts provisional and paused, and never implies the routine can run', () => {
    const wf = routines.initialGuidedWorkflow(OLD_ID);
    assert.equal(wf.state, S.PROVISIONAL_PAUSED);
    assert.equal(wf.jobId, OLD_ID);
    assert.equal(wf.proposal, null);
    assert.equal(wf.failure, null);
    assert.equal(wf.desiredActive, false, 'activation is never the default');
    assert.equal(routines.guidedIndicator(wf.state, wf.failure), 'Paused · needs configuration');
  });

  it('publishes one table of legal successors and agrees with the reducer', () => {
    const states = Object.values(S);
    for (const from of states) {
      for (const to of states) {
        const listed = routines.GUIDED_TRANSITIONS[from].includes(to);
        assert.equal(
          routines.canGuidedTransition(from, to),
          listed,
          `transition table disagrees for ${from} -> ${to}`,
        );
      }
    }
  });

  it('a generated proposal alone never reaches a mutating state', () => {
    // The whole safety argument in one assertion: arriving at a proposal
    // and being told it is ready must not be enough to mutate.
    const ready = routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
      type: 'proposal-received',
      proposal: validated(),
      current: oldSnapshot(),
    });
    assert.equal(ready.state, S.PROPOSAL_READY);
    assert.equal(ready.state === S.APPLYING, false);
    // And it is not active, not applying, not activating.
    assert.ok(![S.APPLYING, S.ACTIVATING, S.ACTIVE].includes(ready.state));
  });

  it('only an explicit confirm event opens the door to mutation', () => {
    const ready = routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
      type: 'proposal-received',
      proposal: validated(),
      current: oldSnapshot(),
    });
    const applying = routines.guidedWorkflowReducer(ready, { type: 'confirm', desiredActive: true });
    assert.equal(applying.state, S.APPLYING);
    assert.equal(applying.desiredActive, true, 'the decision is the person\'s, recorded at confirm time');
  });

  it('records the activation decision and never infers it from the proposal', () => {
    const ready = routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
      type: 'proposal-received',
      proposal: validated(),
      current: oldSnapshot(),
    });
    const paused = routines.guidedWorkflowReducer(ready, { type: 'confirm', desiredActive: false });
    assert.equal(paused.state, S.APPLYING);
    const verified = routines.guidedWorkflowReducer(paused, { type: 'apply-verified', jobId: NEW_ID });
    assert.equal(verified.state, S.CONFIGURED_PAUSED, 'desiredActive=false finishes configured_paused');
    assert.equal(verified.appliedJobId, NEW_ID);
  });

  it('an applied configuration is only active after a verified activation', () => {
    const verified = routines.guidedWorkflowReducer(
      routines.guidedWorkflowReducer(
        routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
          type: 'proposal-received',
          proposal: validated(),
          current: oldSnapshot(),
        }),
        { type: 'confirm', desiredActive: true },
      ),
      { type: 'apply-verified', jobId: NEW_ID },
    );
    assert.equal(verified.state, S.ACTIVATING, 'applied+verified is not yet active');
    // An activation answer that was never verified must not promote it.
    assert.equal(routines.guidedWorkflowReducer(verified, { type: 'refresh-result', exists: true, paused: true, configured: true }).state, S.ACTIVATING);
    const active = routines.guidedWorkflowReducer(verified, { type: 'activation-verified', jobId: NEW_ID });
    assert.equal(active.state, S.ACTIVE);
    assert.equal(active.jobId, NEW_ID);
    assert.equal(routines.guidedIndicator(S.ACTIVE, active.failure), 'Active');
  });

  it('refuses illegal events by identity, so a late answer cannot corrupt a flow', () => {
    const ready = routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
      type: 'proposal-received',
      proposal: validated(),
      current: oldSnapshot(),
    });
    // confirm without a decision payload, activation from a review, a
    // handoff mid-write: all illegal, all must return the SAME object.
    assert.equal(routines.guidedWorkflowReducer(ready, { type: 'confirm-activation' }), ready);
    assert.equal(routines.guidedWorkflowReducer(ready, { type: 'continue-configuring' }).state, S.CONFIGURING);
    const applying = routines.guidedWorkflowReducer(ready, { type: 'confirm', desiredActive: false });
    assert.equal(routines.guidedWorkflowReducer(applying, { type: 'proposal-received', proposal: validated(), current: {} }), applying);
    assert.equal(routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), null).state, S.PROVISIONAL_PAUSED);
  });

  it('abandoning the review mutates nothing and never resumes', () => {
    const ready = routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
      type: 'proposal-received',
      proposal: validated(),
      current: oldSnapshot(),
    });
    const back = routines.guidedWorkflowReducer(ready, { type: 'continue-configuring' });
    assert.equal(back.state, S.CONFIGURING);
    assert.equal(back.proposal, null);
    assert.equal(back.desiredActive, false);
    assert.match(back.status, /stays paused/i);
  });

  it('a stale proposal returns to review; a partial write parks in needs_attention', () => {
    const applying = (desiredActive) =>
      routines.guidedWorkflowReducer(
        routines.guidedWorkflowReducer(routines.initialGuidedWorkflow(OLD_ID), {
          type: 'proposal-received',
          proposal: validated(),
          current: oldSnapshot(),
        }),
        { type: 'confirm', desiredActive },
      );
    const stale = routines.guidedWorkflowReducer(applying(false), {
      type: 'failed',
      stage: 'stale',
      reason: 'stale_base',
      message: 'the routine changed',
      recovery: 'review',
    });
    assert.equal(stale.state, S.PROPOSAL_READY, 'nothing was mutated, so the review is still the right place');
    assert.equal(stale.appliedJobId, '', 'a refused guard must not claim an applied id');

    const parked = routines.guidedWorkflowReducer(applying(false), {
      type: 'failed',
      stage: 'verify',
      reason: 'verification_failed',
      message: 'the re-read does not hold the proposal',
      recovery: 'refresh',
      jobId: NEW_ID,
    });
    assert.equal(parked.state, S.NEEDS_ATTENTION);
    assert.equal(parked.jobId, NEW_ID, 'the addressable id is tracked for the refresh recovery');
  });

  it('a refused resume keeps the verified configuration and offers activation again', () => {
    const activating = routines.guidedWorkflowReducer(
      { ...routines.initialGuidedWorkflow(OLD_ID), state: S.CONFIGURED_PAUSED, appliedJobId: NEW_ID },
      { type: 'confirm-activation' },
    );
    assert.equal(activating.state, S.ACTIVATING);
    const failed = routines.guidedWorkflowReducer(activating, {
      type: 'failed',
      stage: 'resume',
      reason: 'resume_rejected',
      message: 'the backend refused to resume',
      recovery: 'activation',
      jobId: NEW_ID,
    });
    assert.equal(failed.state, S.CONFIGURED_PAUSED, 'the configuration survives a failed activation');
    assert.equal(failed.appliedJobId, NEW_ID);
    assert.equal(failed.failure.recovery, 'activation', 'retry activation, never re-apply');
    assert.equal(routines.guidedIndicator(failed.state, failed.failure), 'Activation failed');

    // The retry resumes an already verified configuration: it does not
    // re-apply, so it cannot mint a second replacement.
    const retry = routines.guidedWorkflowReducer(failed, { type: 'confirm-activation' });
    assert.equal(retry.state, S.ACTIVATING);
    const recovered = routines.guidedWorkflowReducer(retry, { type: 'activation-verified', jobId: NEW_ID });
    assert.equal(recovered.state, S.ACTIVE);
  });

  it('an unreadable post-resume truth is uncertain, never active', () => {
    const uncertain = routines.guidedWorkflowReducer(
      { ...routines.initialGuidedWorkflow(OLD_ID), state: S.ACTIVATING, appliedJobId: NEW_ID },
      {
        type: 'failed',
        stage: 'activate-verify',
        reason: 'resume_unconfirmed',
        message: 'still reads as paused',
        recovery: 'refresh',
        jobId: NEW_ID,
      },
    );
    assert.equal(uncertain.state, S.NEEDS_ATTENTION);
    assert.notEqual(uncertain.state, S.ACTIVE);
    assert.equal(routines.guidedIndicator(uncertain.state, uncertain.failure), 'Activation failed');
  });

  it('a refresh re-read can only confirm or downgrade, never activate', () => {
    const parked = { ...routines.initialGuidedWorkflow(OLD_ID), state: S.NEEDS_ATTENTION, failure: { stage: 'verify', reason: 'x', message: 'm', recovery: 'refresh' }, appliedJobId: NEW_ID };
    // Truth says it is running.
    const live = routines.guidedWorkflowReducer(parked, { type: 'refresh-result', exists: true, paused: false, configured: true });
    assert.equal(live.state, S.ACTIVE);
    // Truth says it is configured and paused.
    const settled = routines.guidedWorkflowReducer(parked, { type: 'refresh-result', exists: true, paused: true, configured: true });
    assert.equal(settled.state, S.CONFIGURED_PAUSED);
    assert.equal(settled.failure, null);
    // An active routine paused from outside is a legitimate downgrade.
    const rePaused = routines.guidedWorkflowReducer({ ...routines.initialGuidedWorkflow(OLD_ID), state: S.ACTIVE }, { type: 'refresh-result', exists: true, paused: true, configured: true });
    assert.equal(rePaused.state, S.CONFIGURED_PAUSED);
  });
});

describe('proposal handoff for review (pure, no host)', () => {
  it('refuses prose and anything that is not a bare proposal object', () => {
    for (const bad of ['', '   ', 'do the thing at 9am', '```json\n{"version":1}\n```', '[{"version":1}]', 42, null]) {
      const out = routines.submitProposalForRoutine(bad, { jobId: OLD_ID, connectionId: 'c1', profile: 't1' });
      assert.equal(out.ok, false, `expected refusal for ${JSON.stringify(bad)}`);
      assert.equal(out.code, 'handoff_must_be_structured');
    }
  });

  it('accepts a proposal bound to the exact routine on screen', () => {
    const out = routines.submitProposalForRoutine(JSON.stringify(proposalFor(oldRow(), PATCH)), {
      jobId: OLD_ID,
      connectionId: 'c1',
      profile: 't1',
    });
    assert.equal(out.ok, true);
    assert.equal(out.proposal.jobId, OLD_ID);
    assert.equal(out.proposal.desiredActive, false);
  });

  it('refuses a proposal minted for a different routine', () => {
    const out = routines.submitProposalForRoutine(proposalFor(oldRow({ job_id: 'job-other-9' }), PATCH), {
      jobId: OLD_ID,
      connectionId: 'c1',
      profile: 't1',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'job_mismatch');
    assert.match(out.message, /job-other-9/);
  });

  it('refuses a proposal owned by another profile', () => {
    const out = routines.submitProposalForRoutine(proposalFor(oldRow(), PATCH, { connectionId: 'c2', profile: 'p2' }), {
      jobId: OLD_ID,
      connectionId: 'c1',
      profile: 't1',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'owner_mismatch');
  });

  it('a proposal can never carry an activation request', () => {
    const p = proposalFor(oldRow(), PATCH);
    p.desiredActive = true;
    const out = routines.submitProposalForRoutine(p, { jobId: OLD_ID, connectionId: 'c1', profile: 't1' });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'activation_not_supported');
  });
});

describe('current-versus-proposed review (pure)', () => {
  const CURRENT = { name: TITLE, schedule: OLD_SCHEDULE, prompt: OLD_PROMPT, delivery: DELIVERY, modelOverride: '', paused: true };

  it('shows every field, marks only real changes, and hides nothing', () => {
    const review = routines.buildProposalReview(CURRENT, validated());
    assert.notEqual(review, null);
    const byField = Object.fromEntries(review.rows.map((r) => [r.field, r]));
    assert.equal(byField.name.changed, true);
    assert.equal(byField.name.current, TITLE);
    assert.equal(byField.name.proposed, NEW_NAME);
    assert.equal(byField.schedule.changed, true);
    assert.equal(byField.prompt.changed, true);
    // #65: delivery is writable now, so it is patchable — but a patch that
    // does not touch it is still "unchanged", never invented.
    assert.equal(byField.delivery.changed, false);
    assert.equal(byField.delivery.patchable, true);
    assert.equal(byField.delivery.current, DELIVERY);
    assert.equal(byField.delivery.proposed, DELIVERY);
    // A model override has no write path on this surface: shown, never
    // presented as something the reviewer can change.
    assert.equal(byField.modelOverride.changed, false);
    assert.equal(byField.modelOverride.patchable, false);
    assert.deepEqual(review.changedFields, ['name', 'schedule', 'prompt']);
    assert.equal(review.stale, false);
  });

  it('marks delivery as changed when the proposal actually changes it', () => {
    const review = routines.buildProposalReview(CURRENT, validated({ patch: { delivery: 'all' } }));
    const delivery = review.rows.find((r) => r.field === 'delivery');
    assert.equal(delivery.changed, true);
    assert.equal(delivery.current, DELIVERY);
    assert.equal(delivery.proposed, 'all');
    assert.deepEqual(review.changedFields, ['name', 'schedule', 'prompt', 'delivery']);
  });

  it('treats an explicit empty delivery patch as clearing the target', () => {
    const review = routines.buildProposalReview(CURRENT, validated({ patch: { delivery: '' } }));
    const delivery = review.rows.find((r) => r.field === 'delivery');
    assert.equal(delivery.changed, true);
    assert.equal(delivery.proposed, '');
  });

  it('separates the agent explanation from the authoritative values', () => {
    const review = routines.buildProposalReview(CURRENT, validated({ note: 'I picked 18:00 so it lands after the brief' }));
    assert.equal(review.note, 'I picked 18:00 so it lands after the brief');
    // The note never becomes a configuration value.
    assert.equal(review.proposed.prompt, NEW_PROMPT);
    assert.equal(review.current.prompt, OLD_PROMPT);
  });

  it('flags staleness when the routine moved since the proposal base', () => {
    const moved = { ...CURRENT, schedule: '30 7 * * *' };
    const review = routines.buildProposalReview(moved, validated());
    assert.equal(review.stale, true, 'a moved target must be visible before confirmation');
  });

  it('returns null without both a truth read and a proposal', () => {
    assert.equal(routines.buildProposalReview(null, validated()), null);
    assert.equal(routines.buildProposalReview(CURRENT, null), null);
  });

  it('projects the snapshot a verified apply would leave behind', () => {
    const projected = routines.proposedSnapshot(CURRENT, { name: NEW_NAME });
    assert.equal(projected.name, NEW_NAME);
    assert.equal(projected.schedule, OLD_SCHEDULE, 'an absent patch field is carried forward, not blanked');
    assert.equal(projected.paused, true);
  });
});

describe('confirmation: apply, verify, then activate', () => {
  it('applies, verifies, resumes and re-reads — in exactly that order', async () => {
    hostFor([
      ...appliedSteps(),
      (params) => {
        assert.deepEqual(params, { action: 'resume', name: NEW_ID, profile: 't1' });
        return { success: true, job: { job_id: NEW_ID, enabled: true } };
      },
      { jobs: [newRow({ enabled: true })] },
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.deepEqual(out, { ok: true, activated: true, jobId: NEW_ID, previousJobId: OLD_ID, changed: true });
    assert.deepEqual(actionNames(), [
      'list', // pre-mutation stale guard
      'list', // the primitive's own guard
      'add',
      'pause',
      'remove', // only after the replacement is proven paused
      'list', // truth after mutation
      'list', // post-apply verification of the persisted values
      'resume', // only because the person asked for activation
      'list', // post-resume verification of the active state
    ]);
  });

  it('never resumes when the person chose to keep it paused', async () => {
    hostFor(appliedSteps());
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: false });
    assert.deepEqual(out, { ok: true, activated: false, jobId: NEW_ID, previousJobId: OLD_ID, changed: true });
    assert.ok(!actionNames().includes('resume'), 'desiredActive=false must finish configured_paused');
    assert.deepEqual(actionNames(), ['list', 'list', 'add', 'pause', 'remove', 'list', 'list']);
  });

  it('a stale proposal is refused before any mutation is sent', async () => {
    hostFor([{ jobs: [oldRow({ schedule: '30 7 * * *' })] }]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'stale');
    assert.equal(out.reason, 'stale_base');
    assert.equal(out.recovery, 'review');
    assert.deepEqual(actionNames(), ['list'], 'one read, zero writes');
    assert.equal(out.replacementJobId, null);
  });

  it('refuses a routine that is no longer paused, without mutating it', async () => {
    // The active flag is part of the base fingerprint, so a resumed
    // routine is caught by the staleness guard first. That is the
    // stronger outcome: nothing is mutated and the user is sent back to
    // review. `not_paused` is the defence-in-depth branch behind it.
    hostFor([{ jobs: [oldRow({ enabled: true })] }]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'stale');
    assert.equal(out.reason, 'stale_base');
    assert.equal(out.recovery, 'review');
    assert.deepEqual(actionNames(), ['list'], 'one read, zero writes');
  });

  it('refuses a missing routine and a lost route without touching the backend', async () => {
    hostFor([{ jobs: [] }]);
    const gone = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(gone.reason, 'job_not_found');
    assert.equal(gone.recovery, 'review');
    assert.equal(gone.stage, 'stale');

    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => { throw new Error('the backend must not be reachable'); } });
    const noRoute = await routines.confirmProposal({ proposal: validated(), route: null, desiredActive: true });
    assert.equal(noRoute.ok, false);
    assert.equal(noRoute.reason, 'no_route');
    const foreign = await routines.confirmProposal({ proposal: validated(), route: OTHER_ROUTE, desiredActive: true });
    assert.equal(foreign.reason, 'owner_mismatch');
  });

  it('an applied configuration that does not verify is never resumed', async () => {
    hostFor([
      // Everything through the truth-after-mutation read, then a
      // post-apply re-read that disagrees with the proposal.
      ...appliedSteps().slice(0, 6),
      { jobs: [newRow({ prompt: 'something else entirely' })] },
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'verify');
    assert.equal(out.reason, 'verification_failed');
    assert.equal(out.recovery, 'refresh');
    assert.ok(!actionNames().includes('resume'), 'unverified configuration must not be activated');
  });

  it('an unpaused re-read after apply is refused before activation', async () => {
    hostFor([...appliedSteps().slice(0, 6), { jobs: [newRow({ enabled: true })] }]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'verify');
    assert.equal(out.reason, 'verification_unpaused');
    assert.equal(out.recovery, 'refresh');
    assert.ok(!actionNames().includes('resume'));
  });

  it('a refused resume keeps the routine configured and paused, and is retryable', async () => {
    hostFor([
      ...appliedSteps(),
      () => ({ success: false, error: 'the profile is offline' }),
      { jobs: [newRow()] },
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'resume');
    assert.equal(out.reason, 'resume_rejected');
    assert.equal(out.recovery, 'activation', 'the configuration is already applied: resume again, do not re-apply');
    assert.equal(out.jobId, NEW_ID);
    assert.match(out.message, /stays configured and paused/);
  });

  it('a resume that answers ok but does not take effect is not an activation', async () => {
    hostFor([
      ...appliedSteps(),
      { success: true, job: { job_id: NEW_ID, enabled: true } },
      { jobs: [newRow()] }, // still paused on the authoritative re-read
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'activate-verify');
    assert.equal(out.reason, 'resume_unconfirmed');
    assert.equal(out.recovery, 'refresh');
    assert.notEqual(out.activated, true);
  });

  it('a refused add is retryable because nothing was created', async () => {
    hostFor([
      { jobs: [oldRow()] },
      { jobs: [oldRow()] },
      () => ({ success: false, error: 'name already in use' }),
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'apply');
    assert.equal(out.reason, 'create_rejected');
    assert.equal(out.recovery, 'apply');
    assert.equal(out.replacementJobId, null);
    assert.deepEqual(actionNames(), ['list', 'list', 'add'], 'no removal of the original');
  });

  it('a partial write asks for a refresh instead of a blind retry', async () => {
    hostFor([
      { jobs: [oldRow()] },
      { jobs: [oldRow()] },
      () => ({ success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } }),
      { success: true, job: { job_id: NEW_ID, enabled: false } },
      () => ({ success: false, error: 'cannot remove' }),
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'apply');
    assert.equal(out.reason, 'supersede_incomplete');
    assert.equal(out.recovery, 'refresh', 'a replacement exists: re-applying could mint a second one');
    assert.equal(out.replacementJobId, NEW_ID, 'the addressable id is named so the refresh can find it');
    assert.ok(!actionNames().includes('resume'));
  });

  it('a replacement that cannot be parked is removed and the original survives', async () => {
    hostFor([
      { jobs: [oldRow()] },
      { jobs: [oldRow()] },
      () => ({ success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } }),
      { success: true }, // pause "succeeded" but proves nothing
      () => ({ success: true }),
    ]);
    const out = await routines.confirmProposal({ proposal: validated(), route: ROUTE, desiredActive: true });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'replacement_not_paused');
    assert.ok(!actionNames().includes('resume'), 'an unproven replacement must never run');
  });
});

describe('activation retry (already-verified configuration)', () => {
  it('resumes without re-applying: no add, no remove', async () => {
    hostFor([
      (params) => {
        assert.deepEqual(params, { action: 'resume', name: NEW_ID, profile: 't1' });
        return { success: true, job: { job_id: NEW_ID, enabled: true } };
      },
      { jobs: [newRow({ enabled: true })] },
    ]);
    const out = await routines.activateConfigured({ route: ROUTE, jobId: NEW_ID });
    assert.equal(out.ok, true);
    assert.equal(out.activated, true);
    assert.equal(out.jobId, NEW_ID);
    assert.deepEqual(actionNames(), ['resume', 'list'], 'a retry must not mint a second replacement');
  });

  it('truth decides: a refused resume with the row already running is still active', async () => {
    hostFor([
      () => ({ success: false, error: 'already resumed' }),
      { jobs: [newRow({ enabled: true })] },
    ]);
    const out = await routines.activateConfigured({ route: ROUTE, jobId: NEW_ID });
    assert.equal(out.ok, true);
    assert.equal(out.activated, true, 'backend truth outranks the door\'s answer');
  });

  it('claims nothing when the routine disappears during activation', async () => {
    hostFor([{ success: true }, { jobs: [] }]);
    const out = await routines.activateConfigured({ route: ROUTE, jobId: NEW_ID });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'activate-verify');
    assert.equal(out.reason, 'job_missing');
    assert.equal(out.recovery, 'refresh');
  });

  it('an unreadable list is uncertain, not active', async () => {
    hostFor([{ success: true }, () => { throw new Error('connection lost'); }]);
    const out = await routines.activateConfigured({ route: ROUTE, jobId: NEW_ID });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'activate-verify');
    assert.equal(out.reason, 'truth_unreadable');
    assert.equal(out.recovery, 'refresh');
  });

  it('refuses to activate without a route or an id', async () => {
    const out = await routines.activateConfigured({ route: null, jobId: NEW_ID });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no_route');
    const noId = await routines.activateConfigured({ route: ROUTE, jobId: '' });
    assert.equal(noId.ok, false);
    assert.equal(noId.recovery, 'activation');
  });
});

describe('authoritative read', () => {
  it('addresses rows by exact job_id, never by title', async () => {
    const twin = oldRow({ job_id: 'job-twin-9', schedule: '30 7 * * *' });
    hostFor([{ jobs: [twin, oldRow()] }]);
    const read = await routines.readJobConfig({ route: ROUTE, jobId: OLD_ID });
    assert.equal(read.ok, true);
    assert.equal(read.exists, true);
    assert.equal(read.snapshot.schedule, OLD_SCHEDULE, 'the duplicate title must not divert the read');
    assert.equal(read.paused, true);
    assert.equal(read.fingerprint, routines.fingerprintJob(oldRow()));
  });

  it('reports a missing row as absent rather than throwing', async () => {
    hostFor([{ jobs: [] }]);
    const read = await routines.readJobConfig({ route: ROUTE, jobId: 'job-gone' });
    assert.equal(read.ok, true);
    assert.equal(read.exists, false);
    assert.equal(read.fingerprint, '');
  });

  it('needs the owning route and an id', async () => {
    const noRoute = await routines.readJobConfig({ route: null, jobId: OLD_ID });
    assert.equal(noRoute.ok, false);
    const noId = await routines.readJobConfig({ route: ROUTE, jobId: '' });
    assert.equal(noId.ok, false);
  });
});

describe('the review surface', () => {
  const CURRENT = oldSnapshot();

  function renderReview(props = {}) {
    return routines.GuidedProposalReview({
      review: routines.buildProposalReview(CURRENT, validated()),
      busy: false,
      onConfirm: () => {},
      onContinueConfiguring: () => {},
      ...props,
    });
  }

  function walk(node, out = []) {
    if (node === null || node === undefined || node === false || node === true) return out;
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, out));
      return out;
    }
    if (typeof node === 'object') {
      out.push(node);
      walk(node.props && node.props.children, out);
    } else {
      out.push({ text: String(node) });
    }
    return out;
  }

  function texts(tree) {
    return walk(tree)
      .map((n) => (typeof n.text === 'string' ? n.text : ''))
      .filter(Boolean)
      .join(' ');
  }

  function buttons(tree) {
    return walk(tree).filter((n) => n.type === 'button');
  }

  it('renders a real comparison table with both sides', () => {
    const tree = renderReview();
    const table = walk(tree).find((n) => n.type === 'table');
    assert.notEqual(table, undefined, 'a real <table> keeps the comparison navigable');
    const headers = walk(table).filter((n) => n.type === 'th').map((n) => texts(n));
    assert.ok(headers.some((h) => h.includes('Current')));
    assert.ok(headers.some((h) => h.includes('Proposed')));
    const body = texts(tree);
    assert.ok(body.includes(TITLE), 'the current value is shown');
    assert.ok(body.includes(NEW_NAME), 'the proposed value is shown');
  });

  it('marks a change with a word, not with color alone', () => {
    const tree = renderReview();
    const body = texts(tree);
    assert.ok(body.includes('changed'), 'the change is announced in text');
    const changed = walk(tree).filter((n) => typeof n.props?.className === 'string' && n.props.className.includes('hr-review-row-changed'));
    assert.equal(changed.length, 3, 'exactly the three patchable fields changed');
  });

  it('shows both outcomes before the user commits', () => {
    const body = texts(renderReview());
    assert.ok(body.includes('This routine ends active'));
    assert.ok(body.includes('This routine ends configured and paused'));
  });

  it('offers the three decisions the issue requires, and nothing mutates without one', () => {
    const seen = [];
    const tree = renderReview({
      onConfirm: (desiredActive) => seen.push(['confirm', desiredActive]),
      onContinueConfiguring: () => seen.push(['continue']),
    });
    const labels = buttons(tree).map((b) => texts(b));
    assert.deepEqual(labels, ['Continue configuring', 'Keep paused', 'Apply and activate']);
    for (const button of buttons(tree)) {
      assert.equal(button.props.type, 'button', 'a native button is keyboard reachable and cannot submit a form');
    }
    await0(buttons(tree)[1].props.onClick());
    await0(buttons(tree)[2].props.onClick());
    await0(buttons(tree)[0].props.onClick());
    assert.deepEqual(seen, [['confirm', false], ['confirm', true], ['continue']]);
  });

  it('makes every control inert while a mutation is in flight', () => {
    const tree = renderReview({ busy: true });
    for (const button of buttons(tree)) {
      assert.equal(button.props.disabled, true, 'a second click cannot start a second write');
    }
  });

  it('warns before confirming when the routine already moved', () => {
    const review = routines.buildProposalReview({ ...CURRENT, schedule: '30 7 * * *' }, validated());
    const tree = renderReview({ review });
    assert.equal(review.stale, true);
    assert.ok(texts(tree).includes('changed after this proposal was built'));
  });

  it('keeps the agent note visually and semantically separate from the values', () => {
    const review = routines.buildProposalReview(CURRENT, validated({ note: 'I moved it to 18:00' }));
    const tree = renderReview({ review });
    const note = walk(tree).find((n) => typeof n.props?.className === 'string' && n.props.className.includes('hr-review-note'));
    assert.notEqual(note, undefined);
    assert.ok(texts(note).includes('explanation, not configuration'));
  });
});

// The review controls are plain callbacks, not promises; flush any that
// return one so an unhandled rejection would still fail the test.
function await0(value) {
  if (value && typeof value.then === 'function') return value;
  return undefined;
}