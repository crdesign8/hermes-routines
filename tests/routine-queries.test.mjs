import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

register('./stubs/sdk-loader.mjs', import.meta.url);
const sdk = await import('./stubs/sdk-stub.mjs');
const shapes = await import('../desktop/plugin.js');

const ROUTE_A = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const ROUTE_B = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };
const ROUTE_A_SAME_PROFILE_OTHER_CONN = { connectionId: 'c9', mode: 'remote', profile: 'p1', targetProfile: 'p1' };

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

function job(jobId, name) {
  return { job_id: jobId, name, schedule: '0 * * * *', prompt: `${name} prompt`, paused: false };
}

describe('routine-queries scoped query layer (issue #102)', () => {
  it('exports the scoped query layer from the bundle', () => {
    for (const fn of [
      'routinesQueryKey',
      'routinesQueryKeyString',
      'routinesKeyForIdentity',
      'isRoutinesKeyForRoute',
      'getCachedRoutines',
      'setCachedRoutines',
      'invalidateRoutines',
      'clearRoutineCache',
      'fetchRoutinesForRoute',
      'scopedInvalidationKey',
      'ROUTINES_QUERY_SCOPE',
    ]) {
      assert.ok(shapes[fn] !== undefined, `${fn} must be exported from the bundle`);
    }
    assert.equal(shapes.ROUTINES_QUERY_SCOPE, 'routines');
  });

  it('query keys are stable and connection/profile scoped', () => {
    const first = shapes.routinesQueryKey(ROUTE_A);
    const second = shapes.routinesQueryKey(ROUTE_A);
    assert.deepEqual(first, ['routines', 'c1', 'p1']);
    assert.deepEqual(second, first, 'same route must produce the same key');
    assert.notDeepEqual(
      shapes.routinesQueryKey(ROUTE_B),
      shapes.routinesQueryKey(ROUTE_A),
      'different routes must not share a key',
    );
    assert.notDeepEqual(
      shapes.routinesQueryKey(ROUTE_A_SAME_PROFILE_OTHER_CONN),
      shapes.routinesQueryKey(ROUTE_A),
      'same profile on another connection must not share a key',
    );
    assert.equal(shapes.routinesQueryKeyString(ROUTE_A), 'c1::p1');
    assert.equal(shapes.routinesQueryKeyString(ROUTE_B), 'c2::p2');
    assert.ok(
      shapes.isRoutinesKeyForRoute(shapes.routinesQueryKey(ROUTE_A), 'c1::p1'),
      'key must match its own cache string',
    );
    assert.equal(
      shapes.isRoutinesKeyForRoute(shapes.routinesQueryKey(ROUTE_A), 'c2::p2'),
      false,
      'key must not match another route cache string',
    );
  });

  it('query keys fail closed on unusable descriptors', () => {
    for (const bad of [null, undefined, {}, { connectionId: '', profile: 'p1' }, { connectionId: 'c1', profile: '  ' }]) {
      assert.throws(() => shapes.routinesQueryKey(bad), TypeError, `must throw for ${JSON.stringify(bad)}`);
      assert.throws(
        () => shapes.routinesQueryKeyString(bad),
        TypeError,
        `string key must throw for ${JSON.stringify(bad)}`,
      );
    }
    assert.equal(shapes.routinesKeyForIdentity('p1', 'c1'), 'c1::p1');
    assert.equal(shapes.routinesKeyForIdentity('ghost', null), null);
    assert.equal(shapes.routinesKeyForIdentity('', 'c1'), null);
  });

  it('cache entries are scoped per route: invalidating one leaves the other intact', () => {
    shapes.clearRoutineCache();
    shapes.setCachedRoutines('c1::p1', [job('job-a-1', 'Alpha one')]);
    shapes.setCachedRoutines('c2::p2', [job('job-b-1', 'Beta one')]);
    assert.equal(shapes.invalidateRoutines('c1::p1'), true);
    assert.equal(shapes.getCachedRoutines('c1::p1'), null, 'invalidated route must read empty');
    assert.deepEqual(
      shapes.getCachedRoutines('c2::p2'),
      [job('job-b-1', 'Beta one')],
      'other route entry must survive a scoped invalidation',
    );
    assert.equal(shapes.invalidateRoutines('c1::p1'), false, 'second invalidation must report nothing dropped');
    shapes.clearRoutineCache();
    assert.equal(shapes.getCachedRoutines('c2::p2'), null);
  });

  it('cache stores copies: mutating a read or the input never corrupts the entry', () => {
    shapes.clearRoutineCache();
    const input = [job('job-a-1', 'Alpha one')];
    shapes.setCachedRoutines('c1::p1', input);
    input.push(job('job-a-2', 'Alpha two'));
    assert.equal(shapes.getCachedRoutines('c1::p1').length, 1, 'stored entry must not follow the input array');
    const read = shapes.getCachedRoutines('c1::p1');
    read.push(job('job-a-3', 'Alpha three'));
    assert.equal(shapes.getCachedRoutines('c1::p1').length, 1, 'reads must not expose the live entry');
    shapes.clearRoutineCache();
  });

  it('scopedInvalidationKey resolves the mutated route only and never throws', () => {
    assert.equal(shapes.scopedInvalidationKey(ROUTE_A, 'c1::p1'), 'c1::p1');
    assert.equal(
      shapes.scopedInvalidationKey(ROUTE_A, 'c2::p2'),
      'c1::p1',
      'a mutation invalidates its own route entry, not the active view key',
    );
    assert.equal(shapes.scopedInvalidationKey(null, 'c1::p1'), null);
    assert.equal(shapes.scopedInvalidationKey(undefined, 'c1::p1'), null);
    assert.equal(shapes.scopedInvalidationKey({ nope: true }, 'c1::p1'), null);
  });

  it('fetch rejects fail-closed without a route and without touching the host', async () => {
    sdk.__reset();
    await assert.rejects(() => shapes.fetchRoutinesForRoute(null), /resolved profile route/);
    await assert.rejects(() => shapes.fetchRoutinesForRoute(undefined), /resolved profile route/);
    assert.equal(sdk.__calls().length, 0, 'no host door may be touched on reject');
  });

  it('fetch rides the routed list door at the host background default', async () => {
    sdk.__reset();
    sdk.__setHost({
      requestProfile: async () => ({ jobs: [job('job-a-1', 'Alpha one')] }),
    });
    const out = await shapes.fetchRoutinesForRoute(ROUTE_A);
    assert.deepEqual(out, { jobs: [job('job-a-1', 'Alpha one')] });
    const logged = sdk.__calls();
    assert.equal(logged[0].door, 'requestProfile');
    assert.equal(logged[0].args[1], 'cron.manage');
    assert.equal(logged[0].args.length, 3, 'list reads must keep the plain 3-arg shape (host background default)');
  });

  it('profile switches cannot leak: stale keys are ignored and caches stay separated', () => {
    shapes.clearRoutineCache();
    let state = shapes.initialRoutinesState();
    state = shapes.routinesViewReducer(state, { type: 'routes-loaded', routes: [ROUTE_A, ROUTE_B], profile: 'p1', connectionId: 'c1' });
    assert.equal(state.activeKey, 'c1::p1');
    state = shapes.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [{ job_id: 'job-a-1', name: 'Alpha one' }],
      key: 'c1::p1',
    });
    shapes.setCachedRoutines('c1::p1', state.jobs);
    state = shapes.routinesViewReducer(state, { type: 'active-changed', profile: 'p2', connectionId: 'c2' });
    assert.equal(state.activeKey, 'c2::p2');
    assert.deepEqual(state.jobs, [], 'previous profile rows must not read as current');
    const stale = shapes.routinesViewReducer(state, {
      type: 'list-loaded',
      jobs: [{ job_id: 'job-a-1', name: 'Alpha one' }],
      key: 'c1::p1',
    });
    assert.equal(stale, state, 'late response for the previous route must be dropped');
    assert.deepEqual(
      shapes.getCachedRoutines('c1::p1'),
      [{ job_id: 'job-a-1', name: 'Alpha one' }],
      'previous route cache entry must remain under its own key',
    );
    assert.equal(shapes.getCachedRoutines('c2::p2'), null, 'new route must not read the previous cache entry');
    shapes.clearRoutineCache();
  });

  it('source separation: page owns view state, the query layer owns server state', () => {
    const src = readSrcTree();
    assert.match(src, /from '\.\.\/state\/routineQueries'/, 'RoutinesPage must drive the scoped query layer');
    assert.match(src, /fetchRoutinesForRoute/, 'list fetch must ride the scoped query layer');
    assert.match(src, /invalidateRoutines/, 'mutations must invalidate the scoped cache');
    assert.equal(
      src.includes('generationRef'),
      false,
      'redundant generation-guard machinery must be gone (key scoping + cancellation own the race)',
    );
    assert.match(src, /spawnPriority: 'foreground'/, 'user-triggered calls must keep foreground spawn priority');
    assert.match(src, /buildListParams\(route\)/, 'fail-closed route scoping must stay before any host call');
    const layer = readFileSync(path.join(root, 'src', 'state', 'routineQueries.ts'), 'utf8');
    for (const viewState of ['searchQuery', 'selectedJobKey', 'isCreating', 'attentionFocus', 'configFocus']) {
      assert.equal(
        layer.includes(viewState),
        false,
        `query layer must not hold view state (${viewState})`,
      );
    }
  });
});
