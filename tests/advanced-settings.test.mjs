// Advanced routine settings domain contract (issue #65, phase 1).
//
// Pins src/domain/advancedSettings.ts directly plus its two wired callers —
// the proposal validator and the add-params builder — through the shipped
// bundle. One closed delivery vocabulary, one normalizer, two callers (D6);
// model override stays read-only with no writer anywhere (D2).
//
// Fixtures are contract-realistic throughout: a technical `job_id` AND a
// distinct human title on the same row (issue #45 lesson).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

// Pure module first: zero host surface, no stub needed beyond the loader.
const advanced = await import('../src/domain/advancedSettings.ts');
// Wired callers through the generated artifact the Desktop loads.
const routines = await import('../desktop/plugin.js');

const { normalizeDelivery, readStoredDelivery, readStoredModelOverride, DELIVERY_GRAMMAR } =
  advanced;

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const OWNER = { connectionId: 'c1', profile: 't1' };
const JOB_ID = 'job-adv-90210';
const TITLE = 'Overnight Deploy Watch';

function row(overrides = {}) {
  return {
    job_id: JOB_ID,
    name: TITLE,
    schedule: '0 9 * * *',
    prompt: 'Watch the overnight deploys',
    enabled: false,
    ...overrides,
  };
}

function proposalFor(r, patch, owner = OWNER) {
  return {
    version: 1,
    jobId: r.job_id,
    owner: { ...owner },
    base: { fingerprint: routines.fingerprintJob(r) },
    patch: { ...patch },
    desiredActive: false,
  };
}

function handle(overrides = {}) {
  return {
    jobId: JOB_ID,
    route: ROUTE,
    backendProfile: 't1',
    createdPaused: true,
    job: row(),
    ...overrides,
  };
}

describe('advanced delivery vocabulary (pure normalizer)', () => {
  it('accepts the closed vocabulary verbatim', () => {
    for (const value of ['local', 'all', 'bot-chat', 'bot-chat:ops', 'telegram:4515', 'telegram:4515:7']) {
      const out = normalizeDelivery(value);
      assert.equal(out.ok, true, `${value} must validate`);
      assert.equal(out.present, true);
      assert.equal(out.delivery, value);
    }
  });

  it('trims and folds only the vocabulary keywords, never the identifiers', () => {
    assert.equal(normalizeDelivery(' Local ').delivery, 'local');
    assert.equal(normalizeDelivery('BOT-CHAT').delivery, 'bot-chat');
    assert.equal(normalizeDelivery('BOT-CHAT:Ops').delivery, 'bot-chat:Ops');
    assert.equal(normalizeDelivery('  telegram:4515  ').delivery, 'telegram:4515');
  });

  it('treats missing and blank as absent, never as a value', () => {
    for (const value of [undefined, null, '', '   ']) {
      const out = normalizeDelivery(value);
      assert.equal(out.ok, true, `${JSON.stringify(value)} must not be refused`);
      assert.equal(out.present, false);
      assert.equal(out.delivery, null);
    }
  });

  it('refuses anything outside the grammar with a message that names it', () => {
    for (const value of [
      'ops-channel',
      'x',
      'telegram:',
      ':123',
      'telegram:123:',
      'a:b:c:d',
      'local:extra',
      'all:extra',
      'bot-chat:',
      'bot-chat:a:b',
      42,
    ]) {
      const out = normalizeDelivery(value);
      assert.equal(out.ok, false, `${JSON.stringify(value)} must be refused`);
      assert.equal(out.code, 'bad_delivery');
      assert.match(out.message, /one of:|bot-chat.*profile/);
    }
    assert.match(DELIVERY_GRAMMAR, /bot-chat/);
    assert.match(DELIVERY_GRAMMAR, /platform:chat_id/);
  });

  it('refuses origin explicitly: it cannot resolve for a plugin create', () => {
    for (const value of ['origin', 'Origin', ' ORIGIN ']) {
      const out = normalizeDelivery(value);
      assert.equal(out.ok, false);
      assert.equal(out.code, 'bad_delivery');
      assert.match(out.message, /origin/i);
      assert.match(out.message, /plugin creates/);
    }
  });
});

describe('stored readers (pure, read-only)', () => {
  it('reads stored delivery across the row key aliases, trimmed', () => {
    assert.equal(readStoredDelivery({ deliver: 'telegram:4515' }), 'telegram:4515');
    assert.equal(readStoredDelivery({ delivery: '  all  ' }), 'all');
    assert.equal(readStoredDelivery({ deliver_to: 'local' }), 'local');
    assert.equal(readStoredDelivery({}), null);
    assert.equal(readStoredDelivery({ deliver: '   ' }), null);
    assert.equal(readStoredDelivery(null), null);
  });

  it('reads the stored model override and exposes no writer for it', () => {
    assert.equal(readStoredModelOverride({ model: 'opus-4' }), 'opus-4');
    assert.equal(readStoredModelOverride({ model_override: '  gpt-5  ' }), 'gpt-5');
    assert.equal(readStoredModelOverride({ modelOverride: 'sonnet' }), 'sonnet');
    assert.equal(readStoredModelOverride({}), null);
    assert.equal(readStoredModelOverride(null), null);
    // D2 enforcement at the module surface: read-only means there is no
    // function here a model picker could call — not even a refused one.
    assert.equal(advanced.normalizeModelOverride, undefined);
    assert.equal(advanced.writeModelOverride, undefined);
    assert.equal(advanced.normalizeModel, undefined);
  });
});

describe('proposal validator: delivery is a patch field, model is not', () => {
  it('accepts a canonical delivery patch and canonicalizes on the way in', () => {
    const out = routines.validateProposal(proposalFor(row(), { delivery: 'all' }));
    assert.equal(out.ok, true);
    assert.equal(out.proposal.patch.delivery, 'all');
    const folded = routines.validateProposal(proposalFor(row(), { delivery: ' Local ' }));
    assert.equal(folded.ok, true);
    assert.equal(folded.proposal.patch.delivery, 'local');
    const explicit = routines.validateProposal(proposalFor(row(), { delivery: 'telegram:4515' }));
    assert.equal(explicit.ok, true);
    assert.equal(explicit.proposal.patch.delivery, 'telegram:4515');
  });

  it('refuses an out-of-grammar delivery with bad_delivery, never silently', () => {
    const out = routines.validateProposal(proposalFor(row(), { delivery: 'ops-channel' }));
    assert.equal(out.ok, false);
    assert.equal(out.code, 'bad_delivery');
    assert.match(out.message, /delivery is one of:/);
    const origin = routines.validateProposal(proposalFor(row(), { delivery: 'origin' }));
    assert.equal(origin.ok, false);
    assert.equal(origin.code, 'bad_delivery');
    assert.match(origin.message, /origin/i);
  });

  it('normalizes a blank delivery patch to cleared, not to absent-key', () => {
    const out = routines.validateProposal(proposalFor(row(), { delivery: '' }));
    assert.equal(out.ok, true);
    assert.equal(out.proposal.patch.delivery, '');
  });

  it('keeps model keys out of the patch with a message accurate for model only', () => {
    for (const key of ['modelOverride', 'model_override', 'model']) {
      const out = routines.validateProposal(proposalFor(row(), { [key]: 'opus' }));
      assert.equal(out.ok, false, `${key} must stay unwritable`);
      assert.equal(out.code, 'unknown_patch_field');
      assert.match(out.message, /model overrides are reported/);
      assert.doesNotMatch(out.message, /delivery and model/);
    }
    // The wire alias is not a patch field either.
    const alias = routines.validateProposal(proposalFor(row(), { deliver: 'all' }));
    assert.equal(alias.ok, false);
    assert.equal(alias.code, 'unknown_patch_field');
  });
});

describe('add-params builder: delivery threading', () => {
  it('omits the wire key entirely when delivery is absent', () => {
    for (const input of [
      { name: TITLE, schedule: '0 9 * * *', prompt: 'go' },
      { name: TITLE, schedule: '0 9 * * *', prompt: 'go', delivery: undefined },
      { name: TITLE, schedule: '0 9 * * *', prompt: 'go', delivery: null },
      { name: TITLE, schedule: '0 9 * * *', prompt: 'go', delivery: '   ' },
    ]) {
      const params = routines.buildAddParams(ROUTE, input);
      assert.equal('deliver' in params, false, 'absent must mean absent, never an empty string');
      assert.equal(params.action, 'add');
      assert.equal(params.profile, 't1');
    }
  });

  it('sends the canonical value on the wire key when present', () => {
    const params = routines.buildAddParams(ROUTE, {
      name: TITLE,
      schedule: '0 9 * * *',
      prompt: 'go',
      delivery: ' All ',
    });
    assert.equal(params.deliver, 'all');
    const explicit = routines.buildAddParams(ROUTE, {
      name: TITLE,
      schedule: '0 9 * * *',
      prompt: 'go',
      delivery: 'bot-chat:Ops',
    });
    assert.equal(explicit.deliver, 'bot-chat:Ops');
  });

  it('throws the shared refusal message instead of sending a bad value', () => {
    assert.throws(
      () =>
        routines.buildAddParams(ROUTE, {
          name: TITLE,
          schedule: '0 9 * * *',
          prompt: 'go',
          delivery: 'ops-channel',
        }),
      /delivery is one of:/,
    );
    assert.throws(
      () =>
        routines.buildAddParams(ROUTE, {
          name: TITLE,
          schedule: '0 9 * * *',
          prompt: 'go',
          delivery: 'origin',
        }),
      /origin/i,
    );
  });

  it('never emits a model key: the builder has no model write path', () => {
    const params = routines.buildAddParams(ROUTE, {
      name: TITLE,
      schedule: '0 9 * * *',
      prompt: 'go',
      delivery: 'local',
    });
    for (const key of ['model', 'modelOverride', 'model_override', 'provider']) {
      assert.equal(key in params, false, `${key} must never ride the add payload`);
    }
  });
});

describe('one normalization, two callers (D6)', () => {
  it('manual create and guided proposal produce the identical representation', () => {
    for (const value of [
      'local',
      ' Local ',
      'all',
      'bot-chat',
      'BOT-CHAT:Night',
      'telegram:4515',
      'telegram:4515:7',
    ]) {
      const direct = normalizeDelivery(value);
      assert.equal(direct.present, true);
      const proposal = routines.validateProposal(proposalFor(row(), { delivery: value }));
      assert.equal(proposal.ok, true);
      assert.equal(proposal.proposal.patch.delivery, direct.delivery);
      const params = routines.buildAddParams(ROUTE, {
        name: TITLE,
        schedule: '0 9 * * *',
        prompt: 'go',
        delivery: value,
      });
      assert.equal(params.deliver, direct.delivery);
    }
  });
});

describe('envelope reports stored settings from the same readers', () => {
  it('reports stored delivery and model override verbatim, absent as absent', () => {
    const bare = routines.buildGuidedEnvelope(handle(), {
      name: TITLE,
      schedule: '0 9 * * *',
      prompt: 'Watch the overnight deploys',
    });
    assert.equal(bare.ok, true);
    assert.equal(bare.envelope.delivery, null);
    assert.equal(bare.envelope.modelOverride, null);

    const stored = routines.buildGuidedEnvelope(
      handle({ job: row({ deliver: 'telegram:4515', model: 'opus-4' }) }),
      null,
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.envelope.delivery, 'telegram:4515');
    assert.equal(stored.envelope.modelOverride, 'opus-4');
  });

  it('agrees with the proposal snapshot about what current means', () => {
    const r = row({ deliver: 'bot-chat:night', model_override: 'gpt-5' });
    const built = routines.buildGuidedEnvelope(handle({ job: r }), null);
    const snapshot = routines.snapshotJobConfig(r);
    assert.equal(built.envelope.delivery, snapshot.delivery);
    assert.equal(built.envelope.modelOverride, snapshot.modelOverride);
    assert.equal(snapshot.delivery, 'bot-chat:night');
  });
});
