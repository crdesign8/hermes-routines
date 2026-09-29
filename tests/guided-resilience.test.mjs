import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Contract for issue #65 Part B: the guided-configuration lifecycle must
// survive interruption, retries and cross-profile/state drift. Eight
// scenarios, each with focused coverage, plus the non-sensitive stage
// diagnostics from §Observability.
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// distinct human title on every row, so a name-addressed mutation could
// not pass unnoticed.

register('./stubs/sdk-loader.mjs', import.meta.url);

const sdk = await import('./stubs/sdk-stub.mjs');
const reactStub = await import('./stubs/react-stub.mjs');
const routines = await import('../desktop/plugin.js');
const diagnostics = await import('../src/domain/diagnostics.ts');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OTHER_ROUTE = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };
const OWNER = { connectionId: 'c1', profile: 't1' };
const OLD_ID = 'job-old-1';
const TWIN_ID = 'job-twin-9';
const NEW_ID = 'job-new-2';
const TITLE = 'Morning Political Manager Brief';
const NEW_NAME = 'Evening Political Manager Brief';
const OLD_SCHEDULE = '0 9 * * *';
const NEW_SCHEDULE = '0 18 * * *';
const OLD_PROMPT = 'Summarize yesterday';
const NEW_PROMPT = 'Summarize today';
const DELIVERY = 'telegram:-1001234567890';
const PATCH = { name: NEW_NAME, schedule: NEW_SCHEDULE, prompt: NEW_PROMPT };

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

/** A paused row holding exactly the proposed end state (a landed retry). */
function twinRow(overrides = {}) {
  return {
    job_id: TWIN_ID,
    name: NEW_NAME,
    schedule: NEW_SCHEDULE,
    prompt: NEW_PROMPT,
    delivery: DELIVERY,
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

function validated(options = {}) {
  const patch = { ...PATCH, ...(options.patch || {}) };
  const row = options.row || oldRow();
  const out = routines.validateProposal(proposalFor(row, patch, options.owner));
  assert.equal(out.ok, true, `fixture rejected: ${out.ok === false && out.message}`);
  return out.proposal;
}

function actions() {
  return sdk.__calls().filter((c) => c.door === 'requestProfile').map((c) => c.args[2]);
}

function actionNames() {
  return actions().map((p) => p.action);
}

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
    if (typeof n === 'object' && n.props && n.props.children) walk(n.props.children);
  }
  walk(tree);
  return out.join(' ');
}

function guidedHandle(overrides = {}) {
  return {
    jobId: OLD_ID,
    route: ROUTE,
    backendProfile: 't1',
    createdPaused: true,
    job: oldRow(),
    ...overrides,
  };
}

describe('guided-resilience scenario 1: abandon keeps the job paused and re-openable', () => {
  it('abandoning the review returns to clarification with nothing applied', () => {
    const S = routines.GUIDED_WORKFLOW_STATE;
    let wf = routines.initialGuidedWorkflow(OLD_ID);
    wf = routines.guidedWorkflowReducer(wf, { type: 'chat-launched' });
    wf = routines.guidedWorkflowReducer(wf, {
      type: 'proposal-received',
      proposal: validated(),
      current: oldRow(),
    });
    assert.equal(wf.state, S.PROPOSAL_READY);
    const abandoned = routines.guidedWorkflowReducer(wf, { type: 'continue-configuring' });
    assert.equal(abandoned.state, S.CONFIGURING);
    assert.equal(abandoned.proposal, null);
    assert.match(abandoned.status, /stays paused/);
  });

  it('a lost session only ever returns to clarification, never to a mutation', () => {
    const S = routines.GUIDED_WORKFLOW_STATE;
    const fresh = routines.initialGuidedWorkflow(OLD_ID);
    const relost = routines.guidedWorkflowReducer(fresh, { type: 'session-lost' });
    assert.equal(relost.state, S.CONFIGURING);
    assert.equal(relost.jobId, OLD_ID);
    assert.match(relost.status, /stays paused/);
    // Mid-write the event is a no-op: a dead chat must not disturb a flow
    // that already moved on (same reference back).
    let wf = routines.guidedWorkflowReducer(fresh, { type: 'chat-launched' });
    wf = routines.guidedWorkflowReducer(wf, {
      type: 'proposal-received',
      proposal: validated(),
      current: oldRow(),
    });
    wf = routines.guidedWorkflowReducer(wf, { type: 'confirm', desiredActive: false });
    assert.equal(wf.state, S.APPLYING);
    assert.equal(routines.guidedWorkflowReducer(wf, { type: 'session-lost' }), wf);
  });

  it('the guided panel owns no effect, so unmount/close cannot mutate', () => {
    const src = readFileSync(path.join(root, 'src', 'views', 'GuidedRoutinePanel.tsx'), 'utf8');
    assert.equal(/useEffect/.test(src), false, 'abandon safety rests on having no effect to run');
  });

  it('the inspector states incomplete configuration for a paused-never-ran row', () => {
    const noop = () => {};
    const element = routines.RoutineInspectorPanel({
      job: oldRow(),
      fallback: 'Routine',
      activeRoute: null,
      activeProfile: null,
      busy: false,
      disabled: false,
      onClose: noop,
      onPause: noop,
      onResume: noop,
    });
    assert.match(texts(element), /needs configuration/);
    const ran = routines.RoutineInspectorPanel({
      job: oldRow({ enabled: true, last_run_at: '2026-09-28T08:00:00Z', last_status: 'ok' }),
      fallback: 'Routine',
      activeRoute: null,
      activeProfile: null,
      busy: false,
      disabled: false,
      onClose: noop,
      onPause: noop,
      onResume: noop,
    });
    assert.equal(/needs configuration/.test(texts(ran)), false);
  });
});

describe('guided-resilience scenario 2: reload rehydrates from the durable row', () => {
  it('a paused, never-ran row is a reopen candidate from the row alone', () => {
    const candidate = routines.guidedConfigCandidateOf(oldRow());
    assert.deepEqual(candidate, { jobId: OLD_ID });
  });

  it('active, ran, or id-less rows are never candidates', () => {
    assert.equal(routines.guidedConfigCandidateOf(oldRow({ enabled: true })), null);
    assert.equal(
      routines.guidedConfigCandidateOf(oldRow({ last_run_at: '2026-09-28T08:00:00Z' })),
      null,
    );
    assert.equal(routines.guidedConfigCandidateOf(oldRow({ last_status: 'ok' })), null);
    assert.equal(routines.guidedConfigCandidateOf(oldRow({ job_id: '  ' })), null);
    assert.equal(routines.guidedConfigCandidateOf(null), null);
  });

  it('honest seam: the plugin surface cannot stamp a distinct paused reason', () => {
    // pause_job stores paused_reason None when it receives none, and the
    // cron.manage RPC forwards only the job_id on pause — so a rehydrated
    // candidate is a paused-never-ran row, NOT a provably-guided one. The
    // reopen therefore re-reads truth and never auto-resumes.
    const handle = routines.buildReopenHandle(ROUTE, oldRow());
    assert.ok(handle);
    assert.equal(handle.jobId, OLD_ID);
    assert.equal(handle.createdPaused, true);
    assert.equal(routines.buildReopenHandle(null, oldRow()), null);
    assert.equal(routines.buildReopenHandle(ROUTE, oldRow({ enabled: true })), null);
  });
});

describe('guided-resilience scenario 3: profile switch stays bound and fails closed', () => {
  it('detects connection and profile drift, and stays silent when unknown', () => {
    const same = routines.guidedRouteDrift(ROUTE, { ...ROUTE });
    assert.equal(same.drifted, false);
    const switched = routines.guidedRouteDrift(ROUTE, OTHER_ROUTE);
    assert.equal(switched.drifted, true);
    assert.match(switched.retained, /c1/);
    assert.match(switched.current, /c2/);
    const profileOnly = routines.guidedRouteDrift(ROUTE, {
      connectionId: 'c1',
      mode: 'remote',
      profile: 'other',
      targetProfile: 'other',
    });
    assert.equal(profileOnly.drifted, true);
    assert.equal(routines.guidedRouteDrift(ROUTE, null).drifted, false);
  });

  it('apply on a drifted route is refused before any mutation', async () => {
    hostFor([]);
    const result = await routines.confirmProposal({
      proposal: validated(),
      route: OTHER_ROUTE,
      desiredActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'owner_mismatch');
    assert.deepEqual(actions(), [], 'an owner mismatch must cost zero backend calls');
  });

  it('the panel names the drift instead of silently re-targeting', () => {
    const noop = () => {};
    reactStub.__presetStates([
      [false, noop],
      [null, noop],
      [false, noop],
    ]);
    const element = routines.GuidedRoutinePanel({
      routine: guidedHandle(),
      submittedName: TITLE,
      submittedSchedule: OLD_SCHEDULE,
      submittedPrompt: OLD_PROMPT,
      activeRoute: OTHER_ROUTE,
      onLaunch: async () => ({ ok: true, routeKey: 'c1::t1', jobId: OLD_ID, autoSubmitted: false, prompt: 'p' }),
      onClose: noop,
    });
    assert.match(texts(element), /stays bound to c1::t1/);
  });
});

describe('guided-resilience scenario 4: externally deleted jobs are reported, never recreated', () => {
  it('confirm refuses a gone target with exactly one backend read', async () => {
    hostFor([{ jobs: [twinRow()] }]);
    const result = await routines.confirmProposal({
      proposal: validated(),
      route: ROUTE,
      desiredActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'job_not_found');
    assert.equal(result.recovery, 'review');
    assert.deepEqual(actionNames(), ['list']);
  });

  it('a truth re-read reports the missing row instead of guessing', async () => {
    hostFor([{ jobs: [] }]);
    const read = await routines.readJobConfig({ route: ROUTE, jobId: OLD_ID });
    assert.equal(read.ok, true);
    assert.equal(read.exists, false);
  });
});

describe('guided-resilience scenario 5: externally changed jobs hit the stale guard', () => {
  it('confirm refuses a moved target with zero mutations', async () => {
    hostFor([{ jobs: [oldRow({ prompt: 'Someone edited this meanwhile' })] }]);
    const result = await routines.confirmProposal({
      proposal: validated(),
      route: ROUTE,
      desiredActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'stale_base');
    assert.equal(result.recovery, 'review');
    assert.deepEqual(actionNames(), ['list']);
  });
});

describe('guided-resilience scenario 6: duplicate apply is impossible by retry', () => {
  it('finds a paused twin and ignores active twins and the target itself', () => {
    const expected = {
      name: NEW_NAME,
      schedule: NEW_SCHEDULE,
      prompt: NEW_PROMPT,
      delivery: DELIVERY,
      modelOverride: '',
      paused: true,
    };
    assert.deepEqual(routines.findAppliedDuplicate([oldRow(), twinRow()], OLD_ID, expected), {
      jobId: TWIN_ID,
    });
    assert.equal(
      routines.findAppliedDuplicate([oldRow(), twinRow({ enabled: true })], OLD_ID, expected),
      null,
    );
    assert.equal(routines.findAppliedDuplicate([oldRow()], OLD_ID, expected), null);
  });

  it('a retry after a landed apply is refused with no second replacement', async () => {
    hostFor([{ jobs: [oldRow(), twinRow()] }, { jobs: [oldRow(), twinRow()] }]);
    const result = await routines.confirmProposal({
      proposal: validated(),
      route: ROUTE,
      desiredActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'duplicate_suspected');
    assert.equal(result.recovery, 'refresh');
    assert.match(result.message, new RegExp(TWIN_ID));
    assert.deepEqual(actionNames(), ['list', 'list']);
  });

  it('activation retries address the SAME job id, never a replacement', async () => {
    const activeRow = twinRow({ enabled: true });
    const seen = [];
    hostFor([
      (params) => {
        seen.push(params.name);
        return { success: true, job: { job_id: TWIN_ID, enabled: false } };
      },
      { jobs: [activeRow] },
      (params) => {
        seen.push(params.name);
        return { success: true, job: { job_id: TWIN_ID, enabled: false } };
      },
      { jobs: [activeRow] },
    ]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await routines.activateConfigured({ route: ROUTE, jobId: TWIN_ID });
      assert.equal(result.ok, true);
      assert.equal(result.jobId, TWIN_ID);
    }
    assert.deepEqual(seen, [TWIN_ID, TWIN_ID]);
  });

  it('a duplicate confirm while applying is a reducer no-op', () => {
    const S = routines.GUIDED_WORKFLOW_STATE;
    let wf = routines.initialGuidedWorkflow(OLD_ID);
    wf = routines.guidedWorkflowReducer(wf, { type: 'chat-launched' });
    wf = routines.guidedWorkflowReducer(wf, {
      type: 'proposal-received',
      proposal: validated(),
      current: oldRow(),
    });
    wf = routines.guidedWorkflowReducer(wf, { type: 'confirm', desiredActive: false });
    assert.equal(wf.state, S.APPLYING);
    assert.equal(routines.guidedWorkflowReducer(wf, { type: 'confirm', desiredActive: false }), wf);
  });
});

describe('guided-resilience scenario 7: gateway interruption stays recoverable', () => {
  it('an unreadable list fails closed with the job left paused', async () => {
    hostFor([
      () => {
        throw new Error('socket hang up');
      },
    ]);
    const result = await routines.confirmProposal({
      proposal: validated(),
      route: ROUTE,
      desiredActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'list_failed');
    assert.equal(result.recovery, 'review');
    assert.deepEqual(actionNames(), ['list']);
  });

  it('transport failures classify retriable; refusals do not', () => {
    assert.equal(routines.isRetriableGatewayError('socket hang up'), true);
    assert.equal(routines.isRetriableGatewayError('request timed out after 5000ms'), true);
    assert.equal(routines.isRetriableGatewayError('service unavailable'), true);
    assert.equal(routines.isRetriableGatewayError('the backend refused to pause it'), false);
    assert.equal(routines.isRetriableGatewayError(''), false);
    assert.equal(routines.isRetriableGatewayError(null), false);
  });

  it('a refused launch keeps the job id and offers a retry, never a success', async () => {
    sdk.__reset();
    sdk.__dropDoor('composer.setDraft');
    const result = await routines.launchGuidedConfiguration({
      routine: guidedHandle(),
      submitted: { name: TITLE, schedule: OLD_SCHEDULE, prompt: OLD_PROMPT },
    });
    assert.equal(result.ok, false);
    assert.equal(result.jobId, OLD_ID);
    assert.match(result.message, /Update Hermes Desktop/);
    sdk.__reset();
  });
});

describe('guided-resilience scenario 8: a dead session restarts fresh on the same job', () => {
  it('relaunch carries a NEW authoritative snapshot and fingerprint', async () => {
    hostFor([{ jobs: [oldRow()] }]);
    const result = await routines.relaunchGuidedConfiguration({
      routine: guidedHandle(),
      submitted: { name: TITLE, schedule: OLD_SCHEDULE, prompt: OLD_PROMPT },
    });
    assert.equal(result.ok, true);
    assert.equal(result.jobId, OLD_ID);
    assert.equal(result.snapshot.name, TITLE);
    assert.equal(result.snapshot.schedule, OLD_SCHEDULE);
    assert.equal(result.fingerprint, routines.fingerprintJob(oldRow()));
    assert.deepEqual(actionNames(), ['list']);
  });

  it('relaunch of a gone job opens no chat and recreates nothing', async () => {
    hostFor([{ jobs: [] }]);
    sdk.__reset();
    const callsBefore = sdk.__calls().length;
    const queue = [{ jobs: [] }];
    sdk.__setHost({
      requestProfile: async () => queue.shift(),
    });
    const result = await routines.relaunchGuidedConfiguration({
      routine: guidedHandle(),
      submitted: { name: TITLE, schedule: OLD_SCHEDULE, prompt: OLD_PROMPT },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_target_gone');
    assert.equal(
      sdk.__calls().slice(callsBefore).some((c) => c.door === 'newChat'),
      false,
    );
  });

  it('relaunch of an active routine is refused: it needs no session', async () => {
    hostFor([{ jobs: [oldRow({ enabled: true })] }]);
    const result = await routines.relaunchGuidedConfiguration({
      routine: guidedHandle(),
      submitted: { name: TITLE, schedule: OLD_SCHEDULE, prompt: OLD_PROMPT },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'session_target_active');
  });
});

describe('guided-resilience observability: stage-only diagnostics', () => {
  it('pins the seven stages and freezes the record', () => {
    assert.deepEqual(Object.values(diagnostics.GUIDED_DIAG_STAGES).sort(), [
      'activation',
      'apply',
      'proposal-validation',
      'provisional-create',
      'session-launch',
      'stale-rejection',
      'verification',
    ]);
    const record = diagnostics.recordGuidedDiag('apply', 'create_rejected');
    assert.deepEqual(record, { stage: 'apply', reason: 'create_rejected', retriable: true });
    assert.equal(Object.isFrozen(record), true);
    assert.equal(diagnostics.formatGuidedDiag(record), 'apply/create_rejected (retriable)');
    assert.equal(
      diagnostics.formatGuidedDiag(diagnostics.recordGuidedDiag('activation', 'resume_rejected')),
      'activation/resume_rejected',
    );
    assert.throws(() => diagnostics.recordGuidedDiag('nope', 'x'), TypeError);
    assert.throws(() => diagnostics.recordGuidedDiag('apply', '  '), TypeError);
  });

  it('carries no payload: stage and reason code only', () => {
    const record = diagnostics.recordGuidedDiag('verification', 'verification_failed');
    assert.deepEqual(Object.keys(record).sort(), ['reason', 'retriable', 'stage']);
    assert.equal(typeof record.reason, 'string');
    assert.equal(record.reason.includes(NEW_PROMPT), false);
  });

  it('maps every confirm stage, the launch, and the create', async () => {
    assert.deepEqual(routines.diagOfConfirmResult({ ok: true, activated: false, jobId: OLD_ID, previousJobId: '', changed: true }), {
      stage: 'verification',
      reason: 'ok',
      retriable: false,
    });
    assert.equal(
      routines.diagOfConfirmResult({ ok: true, activated: true, jobId: NEW_ID, previousJobId: OLD_ID, changed: true }).stage,
      'activation',
    );
    for (const [stage, reason, diagStage] of [
      ['stale', 'stale_base', 'stale-rejection'],
      ['apply', 'duplicate_suspected', 'apply'],
      ['verify', 'verification_failed', 'verification'],
      ['resume', 'resume_rejected', 'activation'],
      ['activate-verify', 'resume_unconfirmed', 'activation'],
      ['handoff', 'read_failed', 'proposal-validation'],
    ]) {
      const mapped = routines.diagOfConfirmResult({
        ok: false,
        stage,
        reason,
        message: 'm',
        jobId: OLD_ID,
        recovery: 'refresh',
        replacementJobId: null,
      });
      assert.equal(mapped.stage, diagStage, `stage ${stage}`);
      assert.equal(mapped.reason, reason);
    }
    assert.equal(routines.diagOfLaunchResult({ ok: false, reason: 'no_route', message: 'm', jobId: '' }).stage, 'session-launch');
    assert.equal(
      routines.diagOfProvisionalResult({ ok: false, reason: 'pause_rejected', message: 'm', jobId: OLD_ID, route: ROUTE, backendProfile: 't1', createdPaused: false }).reason,
      'pause_rejected',
    );
  });
});
