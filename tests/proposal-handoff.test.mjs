import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Contract for issue #63: a guided session must hand back a typed,
// validated routine-configuration proposal through an explicit boundary —
// never through transcript prose — and a validated proposal must apply
// deterministically against exact job_id + owner route, staying paused.
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// human title on the same row, distinct from each other. A fixture like
// `{ name: 'j1' }` hides exactly the identity bug this guards.
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const sdk = await import('./stubs/sdk-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OTHER_ROUTE = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };
const OWNER = { connectionId: 'c1', profile: 't1' };
const OLD_ID = 'job-old-1';
const NEW_ID = 'job-new-2';
const TITLE = 'Morning Political Manager Brief';

function oldRow(overrides = {}) {
  return {
    job_id: OLD_ID,
    name: TITLE,
    schedule: '0 9 * * *',
    prompt: 'Do the thing',
    enabled: false,
    ...overrides,
  };
}

function proposalFor(row, patch, owner = OWNER) {
  return {
    version: 1,
    jobId: row.job_id,
    owner: { ...owner },
    base: { fingerprint: routines.fingerprintJob(row) },
    patch: { ...patch },
    desiredActive: false,
  };
}

function actions() {
  return sdk.__calls().filter((c) => c.door === 'requestProfile').map((c) => c.args[2]);
}

describe('proposal validation (pure, no host)', () => {
  it('accepts a minimal valid proposal and brands it validated', () => {
    const out = routines.validateProposal(proposalFor(oldRow(), { schedule: '0 10 * * *' }));
    assert.equal(out.ok, true);
    assert.equal(out.proposal.validated, true);
    assert.equal(out.proposal.jobId, OLD_ID);
    assert.equal(out.proposal.patch.schedule, '0 10 * * *');
  });

  it('refuses non-objects; the handoff boundary refuses strings without parsing them', () => {
    for (const bad of [null, undefined, 42, [], 'job-old-1']) {
      assert.equal(routines.validateProposal(bad).ok, false);
    }
    const prose = routines.submitProposalHandoff(
      '```json\n{"version": 1, "jobId": "job-old-1"}\n```',
    );
    assert.equal(prose.ok, false);
    assert.equal(prose.code, 'handoff_must_be_structured');
    // A real object through the same door validates.
    assert.equal(routines.submitProposalHandoff(proposalFor(oldRow(), { name: 'Evening Brief' })).ok, true);
  });

  it('rejects unsupported versions and unknown top-level fields', () => {
    const v2 = { ...proposalFor(oldRow(), { name: 'x' }), version: 2 };
    assert.match(routines.validateProposal(v2).message, /version 1/);
    const extra = { ...proposalFor(oldRow(), { name: 'x' }), cron: { action: 'add' } };
    const out = routines.validateProposal(extra);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'unknown_field');
  });

  it('rejects missing/unusable job ids and malformed owners', () => {
    const noId = proposalFor(oldRow(), { name: 'x' });
    delete noId.jobId;
    assert.equal(routines.validateProposal(noId).code, 'bad_job_id');
    const badId = proposalFor(oldRow(), { name: 'x' });
    badId.jobId = TITLE;
    assert.equal(routines.validateProposal(badId).code, 'bad_job_id');
    const noOwner = proposalFor(oldRow(), { name: 'x' });
    noOwner.owner = { connectionId: '', profile: '' };
    assert.equal(routines.validateProposal(noOwner).code, 'bad_owner');
  });

  it('rejects owner mismatch only when an expected owner is given', () => {
    const p = proposalFor(oldRow(), { name: 'x' });
    assert.equal(routines.validateProposal(p, OWNER).ok, true);
    const out = routines.validateProposal(p, { connectionId: 'c1', profile: 'other' });
    assert.equal(out.code, 'owner_mismatch');
  });

  it('rejects empty patches and unknown patch fields (delivery/model have no write path)', () => {
    assert.equal(routines.validateProposal(proposalFor(oldRow(), {})).code, 'empty_patch');
    const delivery = routines.validateProposal(proposalFor(oldRow(), { delivery: 'ops-channel' }));
    assert.equal(delivery.code, 'unknown_patch_field');
    assert.match(delivery.message, /no supported write path/);
    const model = routines.validateProposal(proposalFor(oldRow(), { modelOverride: 'opus' }));
    assert.equal(model.code, 'unknown_patch_field');
    const identity = routines.validateProposal(proposalFor(oldRow(), { jobId: 'job-other' }));
    assert.equal(identity.code, 'unknown_patch_field');
  });

  it('never trusts the validated brand: a forged brand on a bad object still fails', () => {
    const forged = { ...proposalFor(oldRow(), { delivery: 'ops-channel' }), validated: true };
    const out = routines.validateProposal(forged);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'unknown_patch_field');
  });

  it('rejects out-of-contract values with deterministic messages', () => {
    assert.equal(routines.validateProposal(proposalFor(oldRow(), { schedule: '   ' })).code, 'bad_schedule');
    assert.equal(routines.validateProposal(proposalFor(oldRow(), { schedule: 'x'.repeat(257) })).code, 'bad_schedule');
    assert.equal(routines.validateProposal(proposalFor(oldRow(), { name: 'x'.repeat(129) })).code, 'bad_name');
    assert.equal(routines.validateProposal(proposalFor(oldRow(), { prompt: 'x'.repeat(20001) })).code, 'bad_prompt');
    assert.equal(routines.validateProposal(proposalFor(oldRow(), { prompt: '' })).code, 'bad_prompt');
  });

  it('rejects any attempt to activate through a proposal', () => {
    const p = proposalFor(oldRow(), { name: 'x' });
    p.desiredActive = true;
    const out = routines.validateProposal(p);
    assert.equal(out.code, 'activation_not_supported');
    assert.match(out.message, /stays paused/);
  });
});

describe('proposal fingerprint (pure)', () => {
  it('is stable for the same row and moves on any material change', () => {
    const a = routines.fingerprintJob(oldRow());
    assert.equal(routines.fingerprintJob(oldRow()), a);
    assert.match(a, /^[0-9a-f]{8}$/);
    assert.notEqual(routines.fingerprintJob(oldRow({ schedule: '0 10 * * *' })), a);
    assert.notEqual(routines.fingerprintJob(oldRow({ prompt: 'Do another thing' })), a);
    assert.notEqual(routines.fingerprintJob(oldRow({ name: 'Evening Brief' })), a);
    assert.notEqual(routines.fingerprintJob(oldRow({ enabled: true })), a);
  });

  it('ignores run metadata: a firing routine does not stale its own proposal', () => {
    const a = routines.fingerprintJob(oldRow());
    const ran = oldRow({ last_run_at: '2026-09-28T12:00:00Z', last_status: 'ok', next_run_at: '2026-09-29T09:00:00Z' });
    assert.equal(routines.fingerprintJob(ran), a);
    assert.equal(routines.isProposalStale(routines.validateProposal(proposalFor(oldRow(), { name: 'x' })).proposal, ran), false);
  });
});

describe('proposal apply (ordered replacement, exact job_id)', () => {
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

  const NEW_ROW = { job_id: NEW_ID, name: 'Evening Brief', schedule: '0 10 * * *', prompt: 'Do the thing', enabled: false };

  it('happy path: list, add, pause, remove, re-list — replacement stays paused, never resumes', async () => {
    const row = oldRow();
    hostFor([
      { jobs: [row] },
      (params) => {
        assert.deepEqual(params, { action: 'add', name: 'Evening Brief', schedule: '0 10 * * *', prompt: 'Do the thing', profile: 't1' });
        return { success: true, job_id: NEW_ID, name: 'Evening Brief', job: { job_id: NEW_ID, enabled: true } };
      },
      (params) => {
        assert.deepEqual(params, { action: 'pause', name: NEW_ID, profile: 't1' });
        return { success: true, job: { job_id: NEW_ID, enabled: false } };
      },
      (params) => {
        assert.deepEqual(params, { action: 'remove', name: OLD_ID, profile: 't1' });
        return { success: true };
      },
      { jobs: [NEW_ROW] },
    ]);
    const checked = routines.validateProposal(proposalFor(row, { name: 'Evening Brief', schedule: '0 10 * * *' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.deepEqual(out, { ok: true, jobId: NEW_ID, previousJobId: OLD_ID, changed: true, backendProfile: 't1' });
    assert.deepEqual(actions().map((p) => p.action), ['list', 'add', 'pause', 'remove', 'list']);
    assert.ok(!actions().some((p) => p.action === 'resume'), 'apply must never resume');
  });

  it('duplicate titles cannot divert the apply: the exact id is addressed', async () => {
    const row = oldRow();
    const twin = oldRow({ job_id: 'job-twin-9' });
    hostFor([
      { jobs: [twin, row] },
      { success: true, job_id: NEW_ID, name: 'Evening Brief', job: { job_id: NEW_ID, enabled: true } },
      { success: true, job: { job_id: NEW_ID, enabled: false } },
      { success: true },
      { jobs: [twin, { job_id: NEW_ID, name: 'Evening Brief', schedule: '0 9 * * *', prompt: 'Do the thing', enabled: false }] },
    ]);
    const checked = routines.validateProposal(proposalFor(row, { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.ok, true);
    assert.equal(out.jobId, NEW_ID);
    const remove = actions().find((p) => p.action === 'remove');
    assert.equal(remove.name, OLD_ID);
  });

  it('stale base refuses with one list call and zero mutations', async () => {
    hostFor([{ jobs: [oldRow({ schedule: '0 11 * * *' })] }]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'stale_base');
    assert.deepEqual(actions().map((p) => p.action), ['list']);
  });

  it('wrong job (id absent from the owner list) refuses without mutating', async () => {
    hostFor([{ jobs: [oldRow({ job_id: 'job-other-7', name: TITLE })] }]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.reason, 'job_not_found');
    assert.deepEqual(actions().map((p) => p.action), ['list']);
  });

  it('wrong route refuses before any host door is touched', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => { throw new Error('must not be called'); } });
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: OTHER_ROUTE });
    assert.equal(out.reason, 'owner_mismatch');
    assert.equal(sdk.__calls().length, 0);
  });

  it('unchanged patch returns ok without sending any mutation', async () => {
    hostFor([{ jobs: [oldRow()] }]);
    // Patch restates current truth: name/schedule/prompt all equal.
    const checked = routines.validateProposal(
      proposalFor(oldRow(), { name: TITLE, schedule: '0 9 * * *', prompt: 'Do the thing' }),
    );
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.deepEqual(out, { ok: true, jobId: OLD_ID, previousJobId: '', changed: false, backendProfile: 't1' });
    assert.deepEqual(actions().map((p) => p.action), ['list']);
  });

  it('refused add leaves the original untouched (list + add only)', async () => {
    hostFor([{ jobs: [oldRow()] }, { success: false, error: 'schedule is required for create' }]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.reason, 'create_rejected');
    assert.match(out.message, /untouched/);
    assert.deepEqual(actions().map((p) => p.action), ['list', 'add']);
  });

  it('unpausable replacement is cleaned up and the original is never removed', async () => {
    hostFor([
      { jobs: [oldRow()] },
      { success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } },
      { success: false, error: 'cannot pause' },
      { success: true },
    ]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.reason, 'replacement_not_paused');
    const ops = actions();
    assert.deepEqual(ops.map((p) => p.action), ['list', 'add', 'pause', 'remove']);
    assert.equal(ops[3].name, NEW_ID, 'cleanup removes the replacement, never the original');
  });

  it('refused remove is an explicit partial: replacement id returned, nothing hidden', async () => {
    hostFor([
      { jobs: [oldRow()] },
      { success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } },
      { success: true, job: { job_id: NEW_ID, enabled: false } },
      { success: false, error: 'AmbiguousJobReference' },
    ]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const out = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(out.reason, 'supersede_incomplete');
    assert.equal(out.replacementJobId, NEW_ID);
    assert.match(out.message, /nothing was lost/);
  });

  it('re-validates at runtime: a hand-forged object never reaches the host', async () => {
    sdk.__reset();
    sdk.__setHost({ requestProfile: async () => { throw new Error('must not be called'); } });
    const forged = { ...proposalFor(oldRow(), { name: 'Evening Brief' }), patch: { name: 'Evening Brief', delivery: 'x' } };
    const out = await routines.applyValidatedProposal({ proposal: forged, route: ROUTE });
    assert.equal(out.reason, 'invalid_proposal');
    assert.equal(sdk.__calls().length, 0);
  });

  it('null route, failed list, active row and uncarryable base refuse cleanly', async () => {
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    assert.equal((await routines.applyValidatedProposal({ proposal: checked.proposal, route: null })).reason, 'no_route');

    hostFor([]);
    sdk.__setHost({ requestProfile: async () => { throw new Error('door exploded'); } });
    const listed = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(listed.reason, 'list_failed');

    const active = oldRow({ enabled: true });
    hostFor([{ jobs: [active] }]);
    const forActive = routines.validateProposal(proposalFor(active, { name: 'Evening Brief' }));
    const paused = await routines.applyValidatedProposal({ proposal: forActive.proposal, route: ROUTE });
    assert.equal(paused.reason, 'not_paused');

    const nameless = { job_id: OLD_ID, schedule: '0 9 * * *', prompt: 'Do the thing', enabled: false };
    hostFor([{ jobs: [nameless] }]);
    const thin = routines.validateProposal(proposalFor(nameless, { schedule: '0 10 * * *' }));
    assert.equal(thin.ok, true);
    const uncarryable = await routines.applyValidatedProposal({ proposal: thin.proposal, route: ROUTE });
    assert.equal(uncarryable.reason, 'unapplyable_base');
  });

  it('add without an id and add that throws both leave the original untouched', async () => {
    hostFor([{ jobs: [oldRow()] }, { success: true, name: TITLE }]);
    const checked = routines.validateProposal(proposalFor(oldRow(), { name: 'Evening Brief' }));
    const noid = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(noid.reason, 'identity_unresolved');
    assert.deepEqual(actions().map((p) => p.action), ['list', 'add']);

    sdk.__reset();
    sdk.__setHost({ requestProfile: async (route, method, params) => {
      if (params.action === 'list') return { jobs: [oldRow()] };
      throw new Error('transport down');
    } });
    const down = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(down.reason, 'create_rejected');
    assert.match(down.message, /untouched/);
  });

  it('truth re-read that cannot confirm is truth_unconfirmed with the replacement id', async () => {
    const row = oldRow();
    const checked = routines.validateProposal(proposalFor(row, { name: 'Evening Brief' }));
    // Re-list loses the replacement entirely.
    hostFor([
      { jobs: [row] },
      { success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } },
      { success: true, job: { job_id: NEW_ID, enabled: false } },
      { success: true },
      { jobs: [] },
    ]);
    const lost = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(lost.reason, 'truth_unconfirmed');
    assert.equal(lost.replacementJobId, NEW_ID);
    // Re-list shows the replacement with different values than requested.
    hostFor([
      { jobs: [row] },
      { success: true, job_id: NEW_ID, job: { job_id: NEW_ID, enabled: true } },
      { success: true, job: { job_id: NEW_ID, enabled: false } },
      { success: true },
      { jobs: [{ job_id: NEW_ID, name: 'Something Else', schedule: '0 10 * * *', prompt: 'Do the thing', enabled: false }] },
    ]);
    const drifted = await routines.applyValidatedProposal({ proposal: checked.proposal, route: ROUTE });
    assert.equal(drifted.reason, 'truth_unconfirmed');
    assert.match(drifted.message, /different values/);
  });
});
