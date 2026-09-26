import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Regression contract for issue #45: pause/resume must address a routine by
// the canonical upstream `job_id`, while `name` stays display-only. The
// fixtures below are contract-realistic (a technical id AND a human title on
// the same row) — fixtures like `{ name: 'j1' }` hid this defect.
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const sdk = await import('./stubs/sdk-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const JOB_ID = '84c47f11a2bd';
const NAME = 'Morning Political Manager Brief';

/** Contract-realistic row: technical id + human-readable title. */
const ROW = { job_id: JOB_ID, name: NAME, disabled: true };

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loaded(routes = [ROUTE], profile = 'p1', connectionId = 'c1') {
  return { type: 'routes-loaded', routes, profile, connectionId };
}

function readyWith(jobs) {
  return reduce([loaded(), { type: 'list-loaded', jobs, key: 'c1::p1' }]);
}

describe('job identity: job_id is the only mutation identity', () => {
  it('jobIdOf returns job_id, never the human-readable name', () => {
    assert.equal(routines.jobIdOf(ROW), JOB_ID);
    assert.equal(routines.jobIdOf({ name: NAME }), '', 'a row with only a name has no identity');
    assert.equal(routines.jobIdOf({ job_id: '   ' }), '');
    assert.equal(routines.jobIdOf({ job_id: 'not an id' }), '', 'a name-shaped job_id is not addressable');
    assert.equal(routines.jobIdOf({ job_id: 42 }), '');
    assert.equal(routines.jobIdOf(null), '');
    assert.equal(routines.jobIdOf(undefined), '');
  });

  it('pause with a human-readable name sends the canonical job_id', () => {
    assert.deepEqual(routines.buildPauseParams(ROUTE, routines.jobIdOf(ROW)), {
      action: 'pause',
      name: JOB_ID,
      profile: 't1',
    });
  });

  it('resume with a human-readable name sends the canonical job_id', () => {
    assert.deepEqual(routines.buildResumeParams(ROUTE, routines.jobIdOf(ROW)), {
      action: 'resume',
      name: JOB_ID,
      profile: 't1',
    });
  });

  it('names with spaces, accents and Hermes prefixes survive the create path', () => {
    const names = [
      NAME,
      'Resumo diário do Political Manager',
      '[bot:news] Morning brief',
      'Weekly ops review (Friday!)',
    ];
    for (const name of names) {
      assert.deepEqual(routines.addJob({ name, schedule: '0 9 * * *', prompt: 'go' }), {
        action: 'add',
        name,
        schedule: '0 9 * * *',
        prompt: 'go',
      });
      const params = routines.buildAddParams(ROUTE, { name, schedule: '0 9 * * *', prompt: 'go' });
      assert.equal(params.name, name, `create must carry the name verbatim: ${name}`);
      assert.equal(params.action, 'add');
      assert.equal(params.profile, 't1', 'create stays profile-scoped');
      assert.equal('job_id' in params, false, 'create never invents a job_id');
    }
  });

  it('optimistic pause targets the row by job_id; duplicate titles do not collide', () => {
    const jobs = [
      { job_id: 'aaa111', name: 'Shared title', disabled: false },
      { job_id: 'bbb222', name: 'Shared title', disabled: false },
    ];
    const state = reduce([
      loaded(),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-pause', jobId: 'bbb222' },
    ]);
    assert.equal(state.jobs[0].disabled, false, 'the sibling with the same title is untouched');
    assert.equal(state.jobs[1].disabled, true);
  });

  it('optimistic resume targets the row by job_id', () => {
    const jobs = [
      { job_id: 'aaa111', name: 'Shared title', disabled: true },
      { job_id: 'bbb222', name: 'Shared title', disabled: true },
    ];
    const state = reduce([
      loaded(),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-resume', jobId: 'aaa111' },
    ]);
    assert.equal(state.jobs[0].disabled, false);
    assert.equal(state.jobs[1].disabled, true);
  });

  it('the display name never matches identity', () => {
    const jobs = [ROW];
    const state = reduce([
      loaded(),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-pause', jobId: NAME },
    ]);
    assert.deepEqual(state.jobs, jobs, 'pausing by title must not flip anything');
  });

  it('an empty identity never flips a row (not even an id-less one)', () => {
    const jobs = [{ name: 'row without id', disabled: false }];
    let state = reduce([
      loaded(),
      { type: 'list-loaded', jobs, key: 'c1::p1' },
      { type: 'optimistic-pause', jobId: '' },
    ]);
    assert.deepEqual(state.jobs, jobs);
    assert.equal(state.snapshot, null, 'no snapshot is taken for an empty identity');
    state = routines.routinesViewReducer(state, { type: 'optimistic-resume', jobId: '' });
    assert.deepEqual(state.jobs, jobs);
    assert.equal(state.snapshot, null);
  });

  it('pending/busy state is keyed by job_id, not the display name', () => {
    let state = reduce([
      loaded(),
      { type: 'list-loaded', jobs: [ROW], key: 'c1::p1' },
      { type: 'mutate-start', jobId: JOB_ID },
    ]);
    assert.deepEqual(state.pending, [JOB_ID]);
    assert.equal(state.pending.includes(NAME), false);
    state = routines.routinesViewReducer(state, { type: 'mutate-end', jobId: JOB_ID });
    assert.deepEqual(state.pending, []);
    // A name is not a mutation key: the lock must stay engaged.
    state = routines.routinesViewReducer(state, { type: 'mutate-start', jobId: NAME });
    state = routines.routinesViewReducer(state, { type: 'mutate-end', jobId: JOB_ID });
    assert.deepEqual(state.pending, [NAME], 'only the exact key is released');
  });

  it('missing job_id refuses mutation fail-closed', () => {
    const nameless = { name: 'No id at all', schedule: '0 9 * * *' };
    assert.equal(routines.jobIdOf(nameless), '');
    assert.throws(() => routines.buildPauseParams(ROUTE, routines.jobIdOf(nameless)), TypeError);
    assert.throws(() => routines.buildResumeParams(ROUTE, routines.jobIdOf(nameless)), TypeError);
    assert.throws(() => routines.pauseJob(routines.jobIdOf(nameless)), TypeError);
  });

  it('create does not pretend the user-supplied name is a job_id', () => {
    assert.throws(
      () => routines.addJob({ job_id: 'Resumo diario', schedule: '0 9 * * *', prompt: 'go' }),
      /name must be a non-empty string/,
    );
  });

  it('the id of a created routine comes from the backend answer', () => {
    assert.equal(routines.jobIdFromResponse({ success: true, job_id: JOB_ID, name: NAME }), JOB_ID);
    assert.equal(routines.jobIdFromResponse({ job: { job_id: JOB_ID, name: NAME } }), JOB_ID);
    for (const bad of [null, undefined, {}, 'nope', 42, { job_id: '' }, { job_id: '  ' }, { name: NAME }]) {
      assert.equal(
        routines.jobIdFromResponse(bad),
        '',
        `${JSON.stringify(bad)} carries no usable id -> fail closed`,
      );
    }
  });

  it('existing routing and fail-closed guarantees remain intact', async () => {
    sdk.__reset();
    assert.throws(() => routines.buildPauseParams(null, JOB_ID), /resolved profile route/);
    assert.throws(() => routines.buildResumeParams({}, JOB_ID), /resolved profile route/);
    assert.throws(() => routines.buildAddParams(null, { name: NAME, schedule: '* * * * *', prompt: 'go' }), /resolved profile route/);
    await assert.rejects(
      () => routines.requestCronForRoute(null, 'cron.manage', { action: 'pause', name: JOB_ID }),
      /without a resolved profile route/,
    );
    assert.equal(sdk.__calls().length, 0, 'no host door may be touched on rejection');
  });
});
