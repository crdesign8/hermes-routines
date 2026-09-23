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
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped)
      : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (options.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`,
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
 * read never falls back to the active gateway door.
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
