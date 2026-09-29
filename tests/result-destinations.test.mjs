// Where routine results go — the pure domain (issue #73).
//
// The picker is only as honest as its vocabulary, so this file tests the
// domain directly, without a DOM: which destinations are offered, which
// are refused as unreachable, and that the ONE mapper produces the same
// backend string the guided proposal path validates (D6).
//
// The discovery bound is load-bearing and pinned here: the Desktop RPC
// surface has no channel-enumeration method (see domain/destinations.ts),
// so the only destinations this plugin can honestly name come from the
// route roster. A test that let a platform list through would be testing
// an invention.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./stubs/sdk-loader.mjs', import.meta.url);

const {
  DESTINATION_ADVANCED,
  DESTINATION_BROADCAST,
  DESTINATION_DEFAULT,
  DESTINATION_HISTORY,
  advancedDestinationDelivery,
  botChatDestinations,
  buildAddParams,
  destinationDelivery,
  destinationOptions,
  describeDestination,
  findDestinationOption,
  validateProposal,
  fingerprintJob,
  snapshotJobConfig,
} = await import('../desktop/plugin.js');

const LOCAL = { connectionId: 'local', mode: 'local', profile: 'matias', targetProfile: 'matias' };
const REMOTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

describe('destination options', () => {
  it('offers the two outcomes that always exist, before anything discovered', () => {
    const options = destinationOptions([]);
    assert.deepEqual(options.map((o) => o.value), [DESTINATION_DEFAULT, DESTINATION_HISTORY, DESTINATION_BROADCAST]);
    assert.equal(options[0].label, 'Use my default destination');
    assert.equal(options[1].label, 'Keep in routine history only');
  });

  it('describes the default as an outcome, never as "no override"', () => {
    const [first] = destinationOptions([]);
    assert.doesNotMatch(first.label, /backend|override|no override/i);
    assert.doesNotMatch(first.detail, /backend/i);
  });

  it('names a resolvable Bot Chat destination in human terms', () => {
    const [option] = botChatDestinations([LOCAL]);
    assert.equal(option.value, 'bot-chat:matias');
    assert.equal(option.label, 'Bot Chat → matias');
    assert.equal(option.broadcast, false);
  });

  it('refuses a destination the profile cannot resolve', () => {
    // A remote route's backend profile lives on another machine, where
    // the `bot-chat:` token does not resolve — a dead destination.
    assert.deepEqual(botChatDestinations([REMOTE]), []);
    assert.deepEqual(botChatDestinations([{ mode: 'remote', profile: 'x', targetProfile: 'x' }]), []);
    // Unusable shapes are skipped, not repaired into a guess.
    assert.deepEqual(botChatDestinations([null, undefined, 42, 'x', {}, { mode: 'local' }]), []);
    assert.deepEqual(botChatDestinations(undefined), []);
  });

  it('collapses two routes naming the same backend profile into one destination', () => {
    const twin = { connectionId: 'local-2', mode: 'local', profile: 'alias', targetProfile: 'matias' };
    assert.deepEqual(botChatDestinations([LOCAL, twin]).map((o) => o.value), ['bot-chat:matias']);
  });

  it('orders the fan-out last, so it never reads as a quiet choice', () => {
    const options = destinationOptions([LOCAL]);
    assert.deepEqual(options.map((o) => o.value), [
      DESTINATION_DEFAULT,
      DESTINATION_HISTORY,
      'bot-chat:matias',
      DESTINATION_BROADCAST,
    ]);
    assert.equal(options[options.length - 1].broadcast, true);
    assert.ok(options.every((o, i) => (i === options.length - 1 ? o.broadcast : !o.broadcast)));
  });

  it('states the fan-out impact in the option itself', () => {
    const broadcast = destinationOptions([]).find((o) => o.value === DESTINATION_BROADCAST);
    assert.match(broadcast.detail, /every channel/i);
  });

  it('finds a chosen option, and reports an unoffered one as absent', () => {
    const options = destinationOptions([LOCAL]);
    assert.equal(findDestinationOption(options, 'bot-chat:matias').label, 'Bot Chat → matias');
    assert.equal(findDestinationOption(options, 'bot-chat:ghost'), null);
    assert.equal(findDestinationOption(options, DESTINATION_ADVANCED), null);
  });
});

describe('destination mapping', () => {
  it('maps the profile default to absent, so the key is omitted entirely', () => {
    const result = destinationDelivery(DESTINATION_DEFAULT);
    assert.deepEqual(result, { ok: true, present: false, delivery: null });
  });

  it('maps the quiet choices to their backend representation', () => {
    assert.equal(destinationDelivery(DESTINATION_HISTORY).delivery, 'local');
    assert.equal(destinationDelivery(DESTINATION_BROADCAST).delivery, 'all');
    assert.equal(destinationDelivery('bot-chat:matias').delivery, 'bot-chat:matias');
  });

  it('never lets the advanced sentinel reach the backend', () => {
    // The sentinel has no colon, so the ONE normalizer refuses it: it
    // cannot be sent even by a caller that forgot to translate it. Proved
    // on the real create builder rather than on the normalizer alone, so
    // the guarantee is about the wire payload.
    const route = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
    assert.throws(
      () =>
        buildAddParams(route, {
          name: 'Ops Digest',
          schedule: '0 9 * * *',
          prompt: 'Summarize yesterday.',
          delivery: DESTINATION_ADVANCED,
        }),
      /unsupported delivery/,
      'the sentinel must never become a deliver key',
    );
    const unmapped = destinationDelivery(DESTINATION_ADVANCED, {
      platform: '',
      chatId: '',
      threadId: '',
    });
    assert.equal(unmapped.ok, false);
    assert.match(unmapped.message, /platform and an address/);
  });

  it('composes the structured override into the grammar the backend accepts', () => {
    assert.equal(
      advancedDestinationDelivery({ platform: 'telegram', chatId: '-100123', threadId: '' }).delivery,
      'telegram:-100123',
    );
    assert.equal(
      advancedDestinationDelivery({ platform: 'slack', chatId: 'C0123', threadId: '1710000000.01' })
        .delivery,
      'slack:C0123:1710000000.01',
    );
  });

  it('refuses an incomplete override rather than silently falling back to the default', () => {
    for (const input of [
      { platform: '', chatId: '', threadId: '' },
      { platform: '', chatId: 'ops', threadId: '' },
      { platform: 'telegram', chatId: '', threadId: '' },
    ]) {
      const result = advancedDestinationDelivery(input);
      assert.equal(result.ok, false, `expected a refusal for ${JSON.stringify(input)}`);
      assert.equal(result.code, 'bad_delivery');
    }
  });

  it('refuses a structured field that would change the target by smuggling a separator', () => {
    for (const input of [
      { platform: 'telegram:-1', chatId: 'ops', threadId: '' },
      { platform: 'telegram', chatId: 'ops:extra', threadId: '' },
      { platform: 'telegram', chatId: 'ops', threadId: '1:2' },
      { platform: 'local', chatId: 'ops', threadId: '' },
    ]) {
      assert.equal(
        advancedDestinationDelivery(input).ok,
        false,
        `expected a refusal for ${JSON.stringify(input)}`,
      );
    }
  });

  it('refuses a non-string choice instead of coercing it', () => {
    for (const choice of [null, undefined, 42, {}, ['all']]) {
      const result = destinationDelivery(choice);
      assert.equal(result.ok, false, `expected a refusal for ${JSON.stringify(choice)}`);
    }
  });

  it('agrees with the guided proposal path on the same target (D6)', () => {
    const row = {
      job_id: 'job-dest-1',
      name: 'Ops Digest',
      schedule: '0 9 * * *',
      prompt: 'Summarize yesterday.',
      deliver: 'local',
      enabled: false,
    };
    for (const value of ['all', 'bot-chat:matias', 'telegram:-100123']) {
      const fromPicker = destinationDelivery(value);
      assert.equal(fromPicker.ok, true, `picker refused ${value}`);
      // The same value, arriving from the guided proposal, must be
      // accepted and stored byte-identically.
      const proposal = validateProposal({
        version: 1,
        jobId: row.job_id,
        owner: { connectionId: 'c1', profile: 't1' },
        base: { fingerprint: fingerprintJob(row) },
        patch: { delivery: value },
        desiredActive: false,
      });
      assert.equal(proposal.ok, true, `proposal refused ${value}`);
      assert.equal(proposal.proposal.patch.delivery, fromPicker.delivery);
      // And it round-trips through the stored snapshot the review reads.
      assert.equal(snapshotJobConfig({ ...row, deliver: value }).delivery, fromPicker.delivery);
    }
  });

  it('accepts exactly what the picker produces and nothing more', () => {
    // Fuzzing the boundary: any value the domain can emit is a value the
    // one normalizer accepts, so no picker answer becomes a refusal on the
    // way to the backend.
    for (const routes of [[], [LOCAL], [REMOTE, LOCAL]]) {
      for (const option of destinationOptions(routes)) {
        const mapped = destinationDelivery(option.value);
        assert.equal(mapped.ok, true, `option ${option.value} did not normalize`);
      }
    }
  });
});

describe('destination description', () => {
  it('describes every value the picker can produce', () => {
    assert.equal(describeDestination('').label, 'Use my default destination');
    assert.equal(describeDestination('local').label, 'Keep in routine history only');
    assert.equal(describeDestination('all').label, 'Send to every connected channel');
    assert.equal(describeDestination('all').broadcast, true);
    assert.equal(describeDestination('bot-chat:matias').label, 'Bot Chat → matias');
    assert.equal(describeDestination('bot-chat:matias').broadcast, false);
    // A bare bot-chat is the owning profile's own chat.
    assert.match(describeDestination('bot-chat').label, /this profile/);
  });

  it('keeps an unnameable target verbatim and marks it unresolved', () => {
    const described = describeDestination('telegram:-100123');
    assert.equal(described.resolved, false);
    assert.equal(described.label, 'telegram:-100123');
    // A multi-target value is a list, not a single channel: it must not
    // claim to be resolved either.
    assert.equal(describeDestination('telegram:-1,slack:C1').resolved, false);
  });

  it('refuses to describe a non-string', () => {
    assert.equal(describeDestination(null), null);
    assert.equal(describeDestination(7), null);
  });

  it('tolerates a bot-chat token with no profile segment', () => {
    const described = describeDestination('bot-chat:');
    assert.equal(described.resolved, false);
  });
});
