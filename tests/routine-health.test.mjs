// Routine health indicator matrix for issue #51.
//
// Covers routineHealthOf(job) from the GENERATED artifact
// (desktop/plugin.js): lifecycle state combined with the last-run outcome.
// Precedence: completed > error(state) > paused > failed > healthy > unknown.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) can be exercised behaviorally under node:test
// (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const { routineHealthOf } = await import('../desktop/plugin.js');

assert.equal(typeof routineHealthOf, 'function', 'routineHealthOf is exported from desktop/plugin.js');

describe('routineHealthOf', () => {
  it('active + success => healthy', () => {
    assert.equal(routineHealthOf({ state: 'scheduled', last_status: 'success' }), 'healthy');
  });

  it('active + failed => failed', () => {
    assert.equal(routineHealthOf({ state: 'scheduled', last_status: 'failed' }), 'failed');
  });

  it('paused + failed => paused (pause wins over last-run outcome)', () => {
    assert.equal(routineHealthOf({ state: 'paused', last_status: 'failed' }), 'paused');
    assert.equal(routineHealthOf({ state: 'scheduled', enabled: false, last_status: 'failed' }), 'paused');
  });

  it('completed => completed (terminal token wins, even with a failed last run or disabled flag)', () => {
    assert.equal(routineHealthOf({ state: 'completed', last_status: 'success' }), 'completed');
    assert.equal(routineHealthOf({ state: 'completed', last_status: 'failed' }), 'completed');
    assert.equal(routineHealthOf({ state: 'completed', enabled: false }), 'completed');
  });

  it('error state => failed (even with a success last run)', () => {
    assert.equal(routineHealthOf({ state: 'error' }), 'failed');
    assert.equal(routineHealthOf({ state: 'error', last_status: 'success' }), 'failed');
  });

  it('paused + benign paused_reason without a failed last_status => pure paused', () => {
    assert.equal(
      routineHealthOf({ state: 'paused', paused_reason: 'paused by user' }),
      'paused',
    );
    assert.equal(
      routineHealthOf({ state: 'scheduled', enabled: false, pausedReason: 'paused by user' }),
      'paused',
    );
  });

  it('active with no run => unknown', () => {
    assert.equal(routineHealthOf({ state: 'scheduled' }), 'unknown');
  });

  it('null => unknown', () => {
    assert.equal(routineHealthOf(null), 'unknown');
    assert.equal(routineHealthOf(undefined), 'unknown');
  });
});
