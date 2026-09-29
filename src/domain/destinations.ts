// ── where routine results go (issue #73) ──
// Pure vocabulary for the destination picker: what the user is actually
// asked, and the single mapping from that answer to the backend's
// `deliver` string.
//
// The old control asked a backend question ("which delivery override
// should I send?") and made the user compose implementation syntax such
// as `platform:chat_id`. This module inverts that: the picker value IS
// the backend representation — chosen from a closed, intention-named
// set — so the ordinary flow cannot produce a hand-typed protocol
// string, and no translation table can drift from `normalizeDelivery`.
//
// Discovery is bounded by what this plugin can actually READ, and that
// is decided upstream, not here: the Desktop gateway RPC surface
// (`tui_gateway/methods_*.py`, verified 2026-09-29 @ d0288be5b3) has no
// method that enumerates connected chat platforms — the whole set is
// `command.resolve, commands.catalog, config.show, cron.manage,
// insights.get, learning.frames, mcp.catalog, plugins.manage, process.kill,
// reload.mcp, rollback.{diff,list,restore}, skills.{manage,reload},
// tools.{configure,show}`. `config.show` returns model/agent/environment
// sections only. So a platform/channel list could not be built from
// anything honest: it would have to be invented, and an invented
// destination is a dead destination (decision D3 of issue #65, re-verified
// here). What the profile DOES expose is its route roster
// (`host.profileRoutes()`), which is real and is what the Bot Chat
// entries below are built from.
//
// Bot Chat entries are offered for LOCAL routes only, and that filter is
// a backend fact, not a preference: `cron/scheduler_delivery.py`
// `_resolve_bot_chat_target` resolves a `bot-chat:`-prefixed token against
// `hermes_cli.profiles` on the machine that RUNS the job and skips the
// target when the profile does not exist there. A remote route's backend
// profile lives on another machine, so naming it would resolve to nothing
// — the "unsupported destination" this module refuses to display.

import { normalizeDelivery, type NormalizedDelivery } from './advancedSettings';

/** Picker value for "use whatever this profile normally does" (delivery absent). */
export const DESTINATION_DEFAULT = '';

/** Picker value for "keep the result with the routine, send nothing". */
export const DESTINATION_HISTORY = 'local';

/** Picker value for "deliver to every channel this profile is connected to". */
export const DESTINATION_BROADCAST = 'all';

/**
 * Picker value for the developer-oriented structured override. It is NOT
 * a delivery value and deliberately cannot become one: it has no `:`, so
 * `normalizeDelivery` refuses it, which means the sentinel can never leak
 * to the backend even if the composer stopped translating it.
 */
export const DESTINATION_ADVANCED = 'advanced';

/** One human-named choice in the destination picker. */
export interface DestinationOption {
  /** Backend delivery string, or `''` for the profile default. */
  value: string;
  /** Short, intention-first label. Never a protocol string. */
  label: string;
  /** One sentence on what actually happens to the result. */
  detail: string;
  /**
   * True only for a fan-out choice. The picker paints these apart and the
   * composer requires an explicit acknowledgement, because delivering to
   * every connected channel is not equivalent in risk to keeping the
   * result locally.
   */
  broadcast: boolean;
}

const DEFAULT_OPTION: DestinationOption = Object.freeze({
  value: DESTINATION_DEFAULT,
  label: 'Use my default destination',
  detail: 'Results go wherever this profile normally sends its results.',
  broadcast: false,
});

const HISTORY_OPTION: DestinationOption = Object.freeze({
  value: DESTINATION_HISTORY,
  label: 'Keep in routine history only',
  detail: 'Results are saved with the routine and are not sent anywhere.',
  broadcast: false,
});

const BROADCAST_OPTION: DestinationOption = Object.freeze({
  value: DESTINATION_BROADCAST,
  label: 'Send to every connected channel',
  detail:
    'Results are delivered to every channel this profile is connected to. ' +
    'Nothing narrows this later, so pick it only when that is the intent.',
  broadcast: true,
});

/** Copy for the acknowledgement the broadcast choice must be confirmed with. */
export const BROADCAST_ACKNOWLEDGEMENT =
  'I understand this delivers results to every connected channel.';

/**
 * Secondary act that opts into fan-out. It is not a primary picker label:
 * the words appear only after the user has opened the advanced path
 * (issue #90).
 */
export const BROADCAST_ADVANCED_ACTION = 'Send to every connected channel instead';

/** Leave the fan-out path and return to a specific address. */
export const BROADCAST_ADDRESS_ACTION = 'Use a specific address instead';

/** Shown when a proposal would deliver to every connected channel. */
export const BROADCAST_REVIEW_WARNING =
  'This proposal delivers results to every connected channel. Apply it only if that is what you asked for.';

/**
 * Standing rule for the guided configuration prompt. `all` stays a backend
 * capability; the agent may propose it only when the user was explicit.
 */
export const GUIDED_BROADCAST_CONSTRAINT = [
  'Delivery:',
  'Prefer the profile default, routine history, or one specific destination.',
  'Propose delivery "all" (results to every connected channel) only when the user stated that every connected channel should receive them.',
  'A request to send, notify, or deliver the results is not that statement.',
].join('\n');

/** The exceptional fan-out option. Not part of `destinationOptions`. */
export function broadcastDestinationOption(): DestinationOption {
  return BROADCAST_OPTION;
}

/** True for the backend fan-out token, in any casing the normalizer accepts. */
export function isBroadcastDelivery(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === DESTINATION_BROADCAST;
}

/** The fixed, always-available choices in picker order. */
export function baseDestinationOptions(): DestinationOption[] {
  return [DEFAULT_OPTION, HISTORY_OPTION];
}

function botChatLabel(profile: string): string {
  return `Bot Chat → ${profile}`;
}

/**
 * Resolved Bot Chat destinations for the routes the profile exposes.
 * A route qualifies only when it is a LOCAL route with a non-empty
 * backend profile name — the exact shape the `bot-chat:` token resolves
 * against on the job's own machine. Everything else is dropped rather
 * than offered: a destination that cannot resolve is a dead one.
 */
export function botChatDestinations(routes: unknown): DestinationOption[] {
  if (!Array.isArray(routes)) return [];
  const out: DestinationOption[] = [];
  const seen = new Set<string>();
  for (const candidate of routes) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const route = candidate as { mode?: unknown; profile?: unknown; targetProfile?: unknown };
    if (route.mode !== 'local') continue;
    const profile =
      typeof route.targetProfile === 'string' && route.targetProfile.trim()
        ? route.targetProfile.trim()
        : typeof route.profile === 'string' && route.profile.trim()
          ? route.profile.trim()
          : '';
    if (!profile) continue;
    const value = `bot-chat:${profile}`;
    // Two routes can name the same backend profile; one entry is the
    // truth, and a duplicate row would suggest two distinct destinations.
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: botChatLabel(profile),
      detail: 'Results arrive in that profile’s own Hermes Bot Chat.',
      broadcast: false,
    });
  }
  return out;
}

/**
 * The primary picker, in the order the user reads it: the two outcomes that
 * always exist, then the destinations this profile actually exposes.
 * Fan-out is deliberately absent (issue #90): delivering to every connected
 * channel is an exceptional act, offered only from the advanced path.
 */
export function destinationOptions(routes: unknown): DestinationOption[] {
  return [...baseDestinationOptions(), ...botChatDestinations(routes)];
}

/** The option matching a stored/selected value, or null when it is not offered. */
export function findDestinationOption(
  options: readonly DestinationOption[],
  value: unknown,
): DestinationOption | null {
  if (typeof value !== 'string') return null;
  for (const option of options) {
    if (option.value === value) return option;
  }
  return null;
}

/**
 * A human description of what a stored delivery value does. `resolved` is
 * false for a value the profile cannot name (an explicit platform target
 * written by hand or by another surface): the caller then shows the value
 * verbatim, because hiding an unexplained target is worse than showing an
 * unpretty one.
 */
export interface DescribedDestination {
  label: string;
  detail: string;
  /** True when the label is an honest human name rather than a fallback. */
  resolved: boolean;
  /** True for a fan-out destination, so a stored one paints the same guard. */
  broadcast: boolean;
}

/** Describe one stored delivery value (issue #73: no raw protocol in the UI). */
export function describeDestination(value: unknown): DescribedDestination | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) {
    return {
      label: DEFAULT_OPTION.label,
      detail: DEFAULT_OPTION.detail,
      resolved: true,
      broadcast: false,
    };
  }
  if (text === DESTINATION_HISTORY) {
    return {
      label: HISTORY_OPTION.label,
      detail: HISTORY_OPTION.detail,
      resolved: true,
      broadcast: false,
    };
  }
  if (text === DESTINATION_BROADCAST) {
    return {
      label: BROADCAST_OPTION.label,
      detail: BROADCAST_OPTION.detail,
      resolved: true,
      broadcast: true,
    };
  }
  const botChat = /^bot-chat:([^:]+)$/i.exec(text);
  if (botChat !== null) {
    const profile = (botChat[1] ?? '').trim();
    if (profile) {
      return {
        label: botChatLabel(profile),
        detail: 'Results arrive in that profile’s own Hermes Bot Chat.',
        resolved: true,
        broadcast: false,
      };
    }
  }
  if (/^bot-chat$/i.test(text)) {
    return {
      label: botChatLabel('this profile'),
      detail: 'Results arrive in this profile’s own Hermes Bot Chat.',
      resolved: true,
      broadcast: false,
    };
  }
  // An explicit platform target, possibly a comma-separated list. Nothing
  // on the RPC surface can turn it into a channel name, so it stays
  // verbatim and is flagged as unresolved.
  return { label: text, detail: '', resolved: false, broadcast: false };
}

/** Structured fields of the developer-oriented override. */
export interface AdvancedDestinationInput {
  platform: string;
  chatId: string;
  threadId: string;
}

/** An empty override; also the shape tests and the composer reset to. */
export const EMPTY_ADVANCED_DESTINATION: AdvancedDestinationInput = Object.freeze({
  platform: '',
  chatId: '',
  threadId: '',
});

const MAX_PART_LENGTH = 128;

/**
 * Compose the structured override into the one backend string the
 * grammar accepts. Structured fields, never a typed protocol string:
 * the user picks a platform and types only the address.
 *
 * A blank field is NOT ignored — an override with no address would
 * silently become the profile default, so it is refused. Same normalizer
 * as every other path (D6), so the composed value is byte-identical to
 * one that arrived from the guided proposal path.
 */
export function advancedDestinationDelivery(
  input: AdvancedDestinationInput | null | undefined,
): NormalizedDelivery {
  const platform = (input?.platform ?? '').trim();
  const chatId = (input?.chatId ?? '').trim();
  const threadId = (input?.threadId ?? '').trim();
  if (!platform) {
    return {
      ok: false,
      code: 'bad_delivery',
      message: 'an advanced destination needs a platform and an address',
    };
  }
  if (!chatId) {
    return {
      ok: false,
      code: 'bad_delivery',
      message: 'an advanced destination needs an address for the selected platform',
    };
  }
  for (const part of [platform, chatId, threadId]) {
    if (part.length > MAX_PART_LENGTH) {
      return {
        ok: false,
        code: 'bad_delivery',
        message: 'an advanced destination field must be at most 128 chars',
      };
    }
    if (part.includes(':')) {
      return {
        ok: false,
        code: 'bad_delivery',
        message: 'an advanced destination field must not contain ":"',
      };
    }
  }
  return normalizeDelivery(threadId ? `${platform}:${chatId}:${threadId}` : `${platform}:${chatId}`);
}

/**
 * Resolve one picker answer to the backend delivery string, or a refusal.
 * The ONLY place a picker value becomes a `deliver`: both creation paths
 * call it, so a manual choice and a guided proposal cannot normalize
 * differently.
 */
export function destinationDelivery(
  choice: unknown,
  advanced: AdvancedDestinationInput | null | undefined = EMPTY_ADVANCED_DESTINATION,
): NormalizedDelivery {
  if (choice === DESTINATION_ADVANCED) return advancedDestinationDelivery(advanced);
  if (typeof choice !== 'string') {
    return {
      ok: false,
      code: 'bad_delivery',
      message: 'choose where results should go',
    };
  }
  return normalizeDelivery(choice);
}

/** How the composer records an explicit fan-out opt-in. Both flags required. */
export interface BroadcastOptIn {
  /** True only after the user opened advanced delivery and chose fan-out. */
  optedIn: boolean;
  /** True only after the explicit acknowledgement. */
  confirmed: boolean;
}

const BROADCAST_NOT_PRIMARY: NormalizedDelivery = {
  ok: false,
  code: 'bad_delivery',
  message:
    'Sending to every connected channel is not a primary destination. Open advanced delivery and confirm it there.',
};

const BROADCAST_UNCONFIRMED: NormalizedDelivery = {
  ok: false,
  code: 'bad_delivery',
  message: 'Confirm the delivery to every connected channel before creating the routine.',
};

/**
 * Resolve a composer answer. Ordinary choices use `destinationDelivery`.
 * Fan-out is accepted only from the advanced path, and only after the
 * acknowledgement — a primary value of `all` is refused even if the flags
 * are set, so the token cannot sneak back into the common flow.
 */
export function composerDestinationDelivery(
  choice: unknown,
  advanced: AdvancedDestinationInput | null | undefined = EMPTY_ADVANCED_DESTINATION,
  broadcast: BroadcastOptIn = { optedIn: false, confirmed: false },
): NormalizedDelivery {
  const optedIn = broadcast.optedIn === true;
  const confirmed = broadcast.confirmed === true;
  if (choice === DESTINATION_ADVANCED && optedIn) {
    return confirmed ? destinationDelivery(DESTINATION_BROADCAST) : BROADCAST_UNCONFIRMED;
  }
  if (isBroadcastDelivery(choice)) return BROADCAST_NOT_PRIMARY;
  return destinationDelivery(choice, advanced);
}
