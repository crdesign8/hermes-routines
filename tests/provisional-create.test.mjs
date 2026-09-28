import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Contract for issue #61: a guided configuration conversation needs a
// routine identity before it starts, and that routine must not be
// runnable until the conversation confirms it.
//
// The two facts this pins, both verified against the backend contract:
//
//   1. `cron.manage add` ALWAYS creates a runnable job. Its wire params are
//      `extra="forbid"` and `CronManageParams` declares no paused/disabled
//      key, and the handler forwards only name/schedule/prompt/repeat/
//      continuity/deliver. There is no create-me-inert verb on this surface,
//      so the paused invariant is reached by pausing the id the backend
//      just minted — and then proving the pause took.
//   2. A refused mutation arrives INSIDE a successful JSON-RPC frame:
//      `cronjob` returns `{"success": false, "error": ...}` and the handler
//      wraps it with `_ok(...)`. "Did not throw" is therefore NOT a verdict.
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// human title on the same row, distinct from each other. A fixture like
// `{ name: 'j1' }` hides exactly the identity bug this guards.
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const sdk = await import('./stubs/sdk-stub.mjs');
const reactStub = await import('./stubs/react-stub.mjs');

/** Walk a jsx-stub tree collecting every node, expanding one component level. */
function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    if (typeof node.type === 'function') collect(node.type(node.props), out);
    else collect(node.props ? node.props.children : null, out);
  }
  return out;
}

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OTHER_ROUTE = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };
const JOB_ID = '84c47f11a2bd';
const TITLE = 'Morning Political Manager Brief';

/** Contract-realistic create answer: minted id + human title, distinct. */
const ADD_ANSWER = { success: true, job_id: JOB_ID, name: TITLE, job: { job_id: JOB_ID, name: TITLE, enabled: true } };
/** Contract-realistic pause answer: the backend's own `enabled: false`. */
const PAUSE_ANSWER = { success: true, job: { job_id: JOB_ID, name: TITLE, enabled: false, state: 'paused' } };

function answered(answer) {
  return { status: 'answered', answer };
}

function create(overrides = {}) {
  return routines.createProvisionalRoutine({
    route: ROUTE,
    name: TITLE,
    schedule: '0 9 * * *',
    prompt: 'Do the thing',
    ...overrides,
  });
}

describe('in-band mutation verdicts (cron.manage answers in a success frame)', () => {
  it('reads success:false as a failure, not as an applied mutation', () => {
    assert.deepEqual(routines.cronOutcomeOf({ success: true, job_id: JOB_ID }), { ok: true, error: '' });
    const refused = routines.cronOutcomeOf({ success: false, error: 'schedule is required for create' });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /schedule is required/);
    // An older gateway omits `success`; the load-bearing proofs are the
    // minted id and the paused snapshot, so absence is tolerated.
    assert.equal(routines.cronOutcomeOf({ job_id: JOB_ID }).ok, true);
    assert.equal(routines.cronOutcomeOf(null).ok, false);
    assert.equal(routines.cronOutcomeOf('nope').ok, false);
  });

  it('a refused answer with no message still fails closed with real text', () => {
    const out = routines.cronOutcomeOf({ success: false });
    assert.equal(out.ok, false);
    assert.ok(out.error.length > 0, 'never surfaces an empty error');
  });
});

describe('provisional create: paused routine with stable job identity', () => {
  it('creates, then pauses the minted job_id, and returns the proven handle', async () => {
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        return params.action === 'add' ? ADD_ANSWER : PAUSE_ANSWER;
      },
    });

    const result = await create();
    assert.equal(result.ok, true);
    assert.equal(result.routine.jobId, JOB_ID, 'identity comes from the backend, not the title');
    assert.equal(result.routine.route, ROUTE, 'the owner route is preserved');
    assert.equal(result.routine.backendProfile, 't1');
    assert.equal(result.routine.createdPaused, true);
    assert.equal(result.routine.job.enabled, false, 'the confirmed paused row rides along');

    assert.equal(posted.length, 2, 'create then pause, never more');
    assert.deepEqual(posted[0], {
      action: 'add',
      name: TITLE,
      schedule: '0 9 * * *',
      prompt: 'Do the thing',
      profile: 't1',
    });
    assert.deepEqual(
      posted[1],
      { action: 'pause', name: JOB_ID, profile: 't1' },
      'the pause addresses the backend job_id, never the submitted title',
    );
    sdk.__reset();
  });

  it('a create can never be sent with a paused flag the wire would reject', () => {
    // The params model is extra="forbid": an invented `paused`/`disabled`
    // key would be rejected by the backend as out-of-sync, so the create
    // payload must carry exactly the five contract keys plus `profile`.
    const params = routines.buildAddParams(ROUTE, { name: TITLE, schedule: '* * * * *', prompt: 'go' });
    assert.deepEqual(Object.keys(params).sort(), ['action', 'name', 'profile', 'prompt', 'schedule']);
    for (const forbidden of ['paused', 'disabled', 'enabled', 'paused_reason', 'job_id']) {
      assert.equal(forbidden in params, false, `${forbidden} must never ride the add payload`);
    }
  });

  it('never sends a pause when the create did not mint an addressable id', async () => {
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        // Backend answered without a usable id: something exists, but it
        // cannot be addressed, and the title is not a legal substitute.
        return { success: true, name: TITLE };
      },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'identity_unresolved');
    assert.equal(posted.length, 1, 'no pause may be aimed at an unresolved routine');
    assert.equal(posted[0].action, 'add');
    assert.ok(result.message.length > 0);
    sdk.__reset();
  });

  it('never sends a pause when the backend refused the create in-band', async () => {
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        return { success: false, error: 'schedule is required for create' };
      },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'create_rejected');
    assert.match(result.message, /refused to create the routine/);
    assert.equal(posted.length, 1, 'a refused create has no job to pause');
    sdk.__reset();
  });

  it('a thrown create is reported, and no pause is attempted', async () => {
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async () => {
        throw new Error('backend is down');
      },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.match(result.message, /refused to create the routine|backend is down/);
    assert.equal(posted.length, 0);
    sdk.__reset();
  });
});

describe('provisional create: a partial failure never reports a runnable routine as safe', () => {
  it('an accepted pause that never confirmed leaves the job addressable and unreported-safe', async () => {
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        // The backend took the call but answered no job row: nothing here
        // proves the job will not fire, so success must not be claimed.
        return params.action === 'add' ? ADD_ANSWER : { success: true };
      },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'pause_unconfirmed');
    assert.equal(result.createdPaused, false);
    assert.equal(result.jobId, JOB_ID, 'the minted job stays addressable for recovery');
    assert.match(result.message, /did not confirm it is paused/);
    assert.equal(posted.length, 2);
    sdk.__reset();
  });

  it('a pause the backend refused in-band is a failure with a recoverable id', async () => {
    sdk.__reset();
    sdk.__setHost({
      requestProfile: async (_route, _method, params) =>
        params.action === 'add'
          ? ADD_ANSWER
          : { success: false, error: "Job with ID or name 'x' not found." },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'pause_rejected');
    assert.equal(result.jobId, JOB_ID, 'never lose the id of a job that exists');
    assert.equal(result.route, ROUTE, 'the owner is retained for follow-up work');
    assert.equal(result.backendProfile, 't1');
    assert.match(result.message, /refused to pause it/);
    sdk.__reset();
  });

  it('a thrown pause reports the honest state instead of claiming provisional safety', async () => {
    sdk.__reset();
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        if (params.action === 'add') return ADD_ANSWER;
        throw new Error('connection reset');
      },
    });

    const result = await create();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'pause_rejected');
    assert.match(result.message, /pausing it failed/);
    assert.match(result.message, /may still run on its schedule/);
    assert.equal(result.jobId, JOB_ID);
    sdk.__reset();
  });
});

describe('provisional create: identity is never the display name, and scoping is preserved', () => {
  it('two routines sharing a title resolve to their own distinct ids', async () => {
    sdk.__reset();
    // Duplicate titles are legal upstream and the backend raises
    // AmbiguousJobReference on a name lookup, so a name-derived id could
    // only ever be a guess. Each create must bind to the id its own
    // answer minted.
    const ids = ['aaa111', 'bbb222'];
    let seen = 0;
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        if (params.action === 'add') {
          const id = ids[seen++];
          return { success: true, job_id: id, name: TITLE };
        }
        return { success: true, job: { job_id: posted.at(-2).name, name: TITLE, enabled: false } };
      },
    });

    const first = await create();
    const second = await create();
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.routine.jobId, 'aaa111');
    assert.equal(second.routine.jobId, 'bbb222', 'the sibling id is not collapsed onto the first');
    assert.notEqual(first.routine.jobId, second.routine.jobId);
    // Neither pause ever carried the shared title.
    const pauses = posted.filter((p) => p.action === 'pause');
    assert.deepEqual(pauses.map((p) => p.name), ['aaa111', 'bbb222']);
    for (const pause of pauses) {
      assert.equal(pause.name === TITLE, false, 'a pause must never address a title');
    }
    sdk.__reset();
  });

  it('each create is scoped to its own route and backend profile', async () => {
    sdk.__reset();
    const routes = [];
    sdk.__setHost({
      requestProfile: async (route, _method, params) => {
        routes.push({ route, params });
        return params.action === 'add' ? ADD_ANSWER : PAUSE_ANSWER;
      },
    });

    const onA = await create({ route: ROUTE });
    const onB = await create({ route: OTHER_ROUTE });
    assert.equal(onA.ok, true);
    assert.equal(onB.ok, true);
    // Same profile name on another connection is a different owner.
    assert.equal(onA.routine.route.connectionId, 'c1');
    assert.equal(onB.routine.route.connectionId, 'c2');
    assert.equal(onA.routine.backendProfile, 't1');
    assert.equal(onB.routine.backendProfile, 'p2');
    for (const { route, params } of routes) {
      assert.equal(params.profile, route.targetProfile, 'each payload carries its own backend profile');
      assert.equal(params.profile === 'c1::p1' || params.profile === 'c2::p2', false, 'never the route key');
    }
    assert.deepEqual(routes.map((r) => r.route), [ROUTE, ROUTE, OTHER_ROUTE, OTHER_ROUTE]);
    sdk.__reset();
  });

  it('an unscoped route is refused before any backend door is touched', async () => {
    sdk.__reset();
    for (const route of [null, undefined, {}, { profile: 'p1' }]) {
      const result = await create({ route });
      assert.equal(result.ok, false, `route ${JSON.stringify(route)} must not create`);
      assert.equal(result.reason, 'no_route');
    }
    assert.deepEqual(sdk.__calls(), [], 'fail-closed costs zero round trips');
    sdk.__reset();
  });
});

describe('provisional create: non-guided creation stays available and truthful', () => {
  // The epic keeps the ordinary form submit. This change must not silently
  // move it onto the provisional path, but it MUST stop reporting a
  // backend-refused create as a success.
  function reduce(events) {
    let state = routines.initialRoutinesState();
    for (const event of events) state = routines.routinesViewReducer(state, event);
    return state;
  }

  function paintCreating() {
    const state = reduce([
      {
        type: 'routes-loaded',
        routes: [ROUTE],
        profile: 'p1',
        connectionId: 'c1',
      },
      { type: 'list-loaded', jobs: [], key: 'c1::p1' },
    ]);
    const noop = () => {};
    const { __presetStates } = reactStub;
    __presetStates([[state, noop], [0, noop], ['', noop], [null, noop], [true, noop]]);
    const items = [];
    routines.register({ register: (c) => items.push(c) });
    const tree = items.filter((c) => c.area === 'routes')[0].render();
    return tree.type(tree.props);
  }

  function composerSubmit(tree) {
    const panel = collect(tree).find((n) => n.type === routines.RoutineComposerPanel);
    assert.ok(panel, 'the composer panel must still render while creating');
    return panel.props.onSubmit;
  }

  it('an ordinary create is reported as created and the list refreshes from the backend', async () => {
    const submit = composerSubmit(paintCreating());
    sdk.__reset();
    const posted = [];
    sdk.__setHost({
      requestProfile: async (_route, _method, params) => {
        posted.push(params);
        return { success: true, job_id: JOB_ID, name: TITLE, job: { job_id: JOB_ID, enabled: true } };
      },
    });
    const ok = await submit(TITLE, '0 9 * * *', 'Do the thing', true);
    assert.equal(ok, true, 'ordinary creation stays available');
    assert.equal(posted.length, 1, 'an active create is a single round trip');
    assert.equal(posted[0].action, 'add');
    sdk.__reset();
  });

  it('a backend-refused ordinary create is a failure, not a "created" notice', async () => {
    const submit = composerSubmit(paintCreating());
    sdk.__reset();
    sdk.__setHost({
      requestProfile: async () => ({ success: false, error: 'schedule is required for create' }),
    });
    // The in-band refusal arrives inside a resolved frame, so this is the
    // regression: it used to resolve true and announce "created".
    const ok = await submit(TITLE, '0 9 * * *', 'Do the thing', true);
    assert.equal(ok, false, 'a refused create must not report success');
    sdk.__reset();
  });
});
