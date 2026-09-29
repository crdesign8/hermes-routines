import { host, type PluginProfileRoute } from '@hermes/plugin-sdk';
import { messageOf } from '../lib/errors';
import {
  assertRoutingOptions,
  assertTimeoutMs,
  backendTargetProfile,
  profileRoute,
  scopedCronParams,
  type RoutingOptions,
} from '../domain/routing';

// Gateway RPC for cron.manage on the entry owning connection. Entries with
// a resolved route descriptor ride host.requestProfile. Fail-closed: with
// no resolved route the active gateway door (`host.request`) opens ONLY
// with the explicit opt-in — a bare null/unscoped target rejects so a
// misdirected profile operation can never land silently on the active
// gateway. Profile-scoped params flow through scopedCronParams, so a
// routed call without params.profile throws unless the unscoped opt-in is
// passed alongside.
//
// The active-door opt-in is deliberately absent from the view layer: the
// view never opts in (tests pin that).

/** True when target already looks like a route descriptor (has connectionId). */
function isRouteTarget(target: unknown): target is PluginProfileRoute {
  if (typeof target !== 'object' || target === null) return false;
  const connectionId = (target as { connectionId?: unknown }).connectionId;
  return typeof connectionId === 'string' && connectionId !== '';
}

export async function requestCronForRoute(
  target: unknown,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
  options: RoutingOptions = {},
): Promise<unknown> {
  assertTimeoutMs(timeoutMs);
  assertRoutingOptions(options);
  const route = isRouteTarget(target) ? target : profileRoute(target);
  if (route) {
    if (typeof host.requestProfile !== 'function') {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params, { allowUnscoped: options.allowUnscoped });
    // Dial options ride host.requestProfile's 5th argument (SDK
    // PluginProfileRequestOptions). A user action asks for 'foreground' so
    // its possible cold-start takes the pool's reserved interactive slot;
    // polling/list calls omit the bag and keep the host default, so the
    // plain (3-arg) and timeout-only (4-arg) shapes stay untouched.
    const dialOptions =
      options.spawnPriority === undefined ? undefined : { spawnPriority: options.spawnPriority };
    if (dialOptions === undefined) {
      return timeoutMs === undefined
        ? host.requestProfile(route, method, scoped)
        : host.requestProfile(route, method, scoped, timeoutMs);
    }
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped, undefined, dialOptions)
      : host.requestProfile(route, method, scoped, timeoutMs, dialOptions);
  }
  if (options.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`,
    );
  }
  if (options.spawnPriority !== undefined) {
    // host.request takes (method, params, timeoutMs) only — there is no
    // options bag to carry the priority, so the intent cannot be honored.
    throw new TypeError(
      `spawnPriority requires a resolved profile route (host.request takes no options bag)`,
    );
  }
  if (typeof host.request !== 'function') {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === undefined ? host.request(method, params) : host.request(method, params, timeoutMs);
}

/** Inventory every credential-free route of the current connection. */
export async function listProfileRoutes(): Promise<PluginProfileRoute[]> {
  try {
    return await host.profileRoutes();
  } catch (err) {
    throw new Error(`failed to list profile routes: ${messageOf(err)}`, { cause: err });
  }
}

/**
 * List helper scoped to one profile route via cron.manage. Fail-closed: a
 * resolved route with a backend profile is required — an explicitly scoped
 * read never falls back to the active gateway door. Polling, so it keeps
 * the host's default (background) spawn priority.
 */
export async function listRoutines(
  route: PluginProfileRoute | null | undefined,
): Promise<unknown> {
  if (!route?.connectionId) {
    throw new Error('listRoutines requires a resolved profile route');
  }
  const target = backendTargetProfile(route, '');
  if (!target) {
    throw new Error('listRoutines requires a route with profile/targetProfile');
  }
  return requestCronForRoute(route, 'cron.manage', {
    action: 'list',
    include_disabled: true,
    profile: target,
  });
}

// ── gateway-failure classification (issue #65 Part B, scenario 7) ──
// A network/gateway interruption must retain a recoverable paused state,
// show an actionable error, and offer a retry — and success must never be
// inferred from dispatch alone (every gateway in this file already reads
// the backend's in-band verdict). What was missing is telling a transient
// transport failure ("retry the same read") apart from a refusal ("go look
// at the list"). This pure classifier is that distinction.
//
// Deliberately no automatic retry/backoff here: re-sending a MUTATION on
// a timer risks a duplicate the caller cannot see, while the workflow's
// explicit recoveries (retry chat, refresh status, re-confirm a
// never-started write) already retry with the user's intent behind them.
// The classifier only labels; the UI decides.
//
// Heuristic by necessity: transport errors arrive as free-text messages,
// so this matches stable substrings. Unknown text is NOT retriable — a
// failure we cannot recognize fails closed toward human review.

const RETRIABLE_GATEWAY_PATTERNS: readonly RegExp[] = [
  /timed?\s?out/i,
  /\btimeout\b/i,
  /\beconn\w*/i,
  /\beai_again\b/i,
  /\bsocket\b/i,
  /\bnetwork\b/i,
  /fetch\s+failed/i,
  /temporar\w*\s+unavailable/i,
  /service\s+unavailable/i,
  /\b503\b/,
  /\b502\b/,
  /\b504\b/,
  /rate[\s_-]?limit/i,
  /overloaded/i,
  /try\s+again/i,
  /connection\s+(reset|refused|closed|aborted)/i,
];

/** True when `message` looks like a transient transport failure. */
export function isRetriableGatewayError(message: unknown): boolean {
  if (typeof message !== 'string' || !message.trim()) return false;
  return RETRIABLE_GATEWAY_PATTERNS.some((pattern) => pattern.test(message));
}
