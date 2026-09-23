import type { PluginProfileRoute } from '@hermes/plugin-sdk';

// ── profile routing (mirrors cross-connection routing semantics) ──
// Pure helpers. A route descriptor carries connectionId, profile and
// targetProfile (all required in the SDK contract).
//
// Fail-closed: a caller that looks profile-scoped must never slide
// silently into the active gateway door. `requestCronForRoute` with no
// resolved route rejects unless the caller passes the explicit opt-in
// option; `scopedCronParams` with a route but no own `profile` key throws
// unless the caller passes the unscoped option. Both opt-ins default to
// closed.

/** Explicit opt-ins for fail-closed routing (both default to closed). */
export interface RoutingOptions {
  /** Open the active gateway door when no route resolves. Default closed. */
  allowActiveDoor?: boolean;
  /** Send a routed call without a params.profile key. Default closed. */
  allowUnscoped?: boolean;
}

/** Result of resolving a scoping entry to a route descriptor. */
export type RouteResolution =
  | { status: 'not_scoped'; route: null }
  | { status: 'owner_removed'; route: null; profile: string }
  | { status: 'resolved'; route: PluginProfileRoute };

/** Loose shape of a registry/scoping entry before it becomes a route. */
export interface RouteEntry {
  sourceScoped?: boolean;
  remoteSource?: boolean;
  route?: Partial<PluginProfileRoute>;
  connectionId?: string;
  connectionKind?: string;
  name?: string;
  targetProfile?: string;
}

/** Validate a plain object at runtime (callers may pass JS values). */
function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label);
  }
  return value as Record<string, unknown>;
}

/**
 * Stable key for one route: `connectionId::profile`. Both halves must be
 * non-empty strings — an unusable descriptor throws instead of producing
 * a key that silently collides with another connection.
 */
export function routeKey(route: unknown): string {
  const candidate = route as Partial<PluginProfileRoute> | null | undefined;
  if (!candidate || typeof candidate.connectionId !== 'string' || typeof candidate.profile !== 'string') {
    throw new TypeError('invalid route: connectionId and profile must be strings');
  }
  const connectionId = candidate.connectionId.trim();
  const profile = candidate.profile.trim();
  if (!connectionId || !profile) {
    throw new TypeError('invalid route: connectionId and profile must be non-empty');
  }
  return `${connectionId}::${profile}`;
}

/**
 * Resolve a scoping entry to a route descriptor. Unscoped entries report
 * `not_scoped`; an entry whose connection owner vanished reports
 * `owner_removed` (with the profile for messaging) instead of inventing a
 * connection id.
 */
export function resolveProfileRoute(entry: unknown): RouteResolution {
  const source = (entry ?? {}) as RouteEntry;
  if (!source.sourceScoped && !source.remoteSource) {
    return { status: 'not_scoped', route: null };
  }
  const candidate: Partial<PluginProfileRoute> = source.route ?? {
    connectionId: source.connectionId,
    mode: source.connectionKind === 'local' ? 'local' : 'remote',
    profile: source.name,
    targetProfile: source.targetProfile || source.name,
  };
  if (candidate.mode !== undefined && candidate.mode !== 'local' && candidate.mode !== 'remote') {
    throw new TypeError(`invalid route mode: ${String(candidate.mode)}`);
  }
  const connectionId = String(candidate.connectionId || '').trim();
  const profile = String(candidate.profile || source.name || '').trim() || 'default';
  const targetProfile = String(candidate.targetProfile || profile).trim() || profile;
  if (!connectionId) {
    return { status: 'owner_removed', route: null, profile };
  }
  const mode: 'local' | 'remote' = candidate.mode === 'local' || connectionId === 'local' ? 'local' : 'remote';
  return {
    status: 'resolved',
    route: Object.freeze({ connectionId, mode, profile, targetProfile }),
  };
}

/** Resolve an entry, throwing when its connection owner is gone. */
export function profileRoute(entry: unknown): PluginProfileRoute | null {
  const resolved = resolveProfileRoute(entry);
  if (resolved.status === 'owner_removed') {
    throw new Error(`Profile ${resolved.profile} has no connection owner`);
  }
  return resolved.route;
}

/** Backend profile a route talks to: targetProfile, else the logical profile. */
export function backendTargetProfile(
  route: PluginProfileRoute | null | undefined,
  fallbackProfile = 'default',
): string {
  if (!route) {
    return fallbackProfile;
  }
  return route.targetProfile || route.profile;
}

/**
 * Force a routed call to carry its backend profile. With a route present
 * but no own `profile` key in params this throws instead of sending the
 * call unscoped; `allowUnscoped: true` is the explicit opt-in for an
 * intentionally unscoped routed call. With no route, params pass through
 * untouched.
 */
export function scopedCronParams(
  route: PluginProfileRoute | null | undefined,
  params: Record<string, unknown> = {},
  options: RoutingOptions = {},
): Record<string, unknown> {
  if (!route) {
    return params;
  }
  assertRoutingOptions(options);
  const plain = assertPlainObject(params, 'scopedCronParams params must be a plain object');
  const target = backendTargetProfile(route, route.profile);
  if (!Object.prototype.hasOwnProperty.call(plain, 'profile')) {
    if (options.allowUnscoped === true) {
      return params;
    }
    throw new TypeError(
      `scopedCronParams requires params.profile for ${route.connectionId}::${route.profile} (pass { allowUnscoped: true } to send unscoped intentionally)`,
    );
  }
  return { ...plain, profile: target };
}

/** Validate the routing options bag: plain object, boolean flags only. */
export function assertRoutingOptions(options: RoutingOptions | undefined): void {
  if (options === undefined) return;
  const plain = assertPlainObject(options, 'options must be a plain object');
  if (plain.allowActiveDoor !== undefined && typeof plain.allowActiveDoor !== 'boolean') {
    throw new TypeError('options.allowActiveDoor must be a boolean');
  }
  if (plain.allowUnscoped !== undefined && typeof plain.allowUnscoped !== 'boolean') {
    throw new TypeError('options.allowUnscoped must be a boolean');
  }
}

/** `timeoutMs` must be a non-negative finite number when given. */
export function assertTimeoutMs(timeoutMs: number | undefined): void {
  if (timeoutMs === undefined) return;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative finite number');
  }
}

// ── route list helpers (view-facing) ──

/**
 * Keep only entries that describe a real connection plus profile: each
 * candidate must survive `routeKey` validation. Unusable entries are
 * skipped, never repaired — an empty result is an honest empty state, not
 * a reason to invent a route.
 */
export function coerceRoutes(routes: unknown): PluginProfileRoute[] {
  if (!Array.isArray(routes)) return [];
  const usable: PluginProfileRoute[] = [];
  for (const route of routes) {
    try {
      routeKey(route);
      usable.push(route as PluginProfileRoute);
    } catch {
      continue;
    }
  }
  return usable;
}

/** Look up a coerced route by its `connectionId::profile` key. */
export function findRouteByKey(
  routes: PluginProfileRoute[],
  key: string | null,
): PluginProfileRoute | null {
  if (!Array.isArray(routes) || typeof key !== 'string' || !key) return null;
  for (const route of routes) {
    try {
      if (routeKey(route) === key) return route;
    } catch {
      continue;
    }
  }
  return null;
}
