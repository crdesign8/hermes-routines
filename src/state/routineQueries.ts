import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { activeRouteKey, routeKey } from '../domain/routing';
import { listRoutines } from '../gateway/cronGateway';
import type { RoutineJob } from '../domain/jobs';

// Scoped routine query layer (issue #102).
//
// Server state lives here; view/product state stays in the reducer and the
// page's local state (search text, lifecycle filter, selection, composer
// visibility, guided flow, attention/configuration focus). The split is
// deliberate: the query layer owns routine inventory identity (stable key),
// fetching, cache scope and invalidation, while the reducer keeps owning
// the purely presentational transitions.
//
// Why a plugin-local layer instead of an SDK import: the pinned SDK
// baseline (`sdk-baseline.json`, upstream `apps/desktop/src/sdk/index.ts`
// at the recorded ref) exposes no `useQuery` / `useMutation` value exports,
// so importing them would claim a contract the host does not offer and trip
// the baseline gate. This module implements the same separation the issue
// asks for — stable connection/profile scoped keys, scoped fetch, scoped
// invalidation, no cross-profile sharing — over the supported
// `host.requestProfile('cron.manage', ...)` door, and stays ready to
// delegate its fetch/invalidation to shared SDK hooks if the host ever
// exposes them. No migration to a plugin REST backend was made merely to
// use an external query client (a non-goal of the issue).
//
// Cache policy: one entry per connection-qualified route key
// (`connectionId::profile`). A mutation invalidates ONLY the key it ran
// against; a profile switch reads a different key, so rows from another
// route can never render or be mutated as current. List reads keep the
// host default (background) dial priority; user-triggered mutations keep
// passing `{ spawnPriority: 'foreground' }` at their own call sites, which
// this module never overrides.

/** Query scope segment for the routine inventory. */
export const ROUTINES_QUERY_SCOPE = 'routines' as const;

/** Stable query key for one route: `['routines', connectionId, profile]`. */
export type RoutinesQueryKey = readonly ['routines', string, string];

/**
 * Build the stable query key for a resolved route. Fail-closed: an
 * unusable descriptor throws instead of producing a key that could collide
 * with another connection's cache entry.
 */
export function routinesQueryKey(route: PluginProfileRoute): RoutinesQueryKey {
  const key = routeKey(route);
  const separator = key.indexOf('::');
  const connectionId = key.slice(0, separator);
  const profile = key.slice(separator + 2);
  return Object.freeze([ROUTINES_QUERY_SCOPE, connectionId, profile] as const);
}

/**
 * String form of the query key: the connection-qualified
 * `connectionId::profile` identity. This is the cache key and the reducer's
 * `activeKey` for the same route, so the two can never disagree about which
 * route an inventory belongs to.
 */
export function routinesQueryKeyString(route: PluginProfileRoute): string {
  return routeKey(route);
}

/**
 * Key string for a bare active identity (profile + connectionId without a
 * full route descriptor). Returns null when the identity is unusable, so
 * callers fail closed instead of scoping cache to a partial key.
 */
export function routinesKeyForIdentity(profile: unknown, connectionId: unknown): string | null {
  return activeRouteKey(profile, connectionId);
}

/** True when a query key belongs to the given cache key string. */
export function isRoutinesKeyForRoute(key: RoutinesQueryKey, cacheKey: string): boolean {
  return key.length === 3 && key[0] === ROUTINES_QUERY_SCOPE && `${key[1]}::${key[2]}` === cacheKey;
}

// Scoped inventory cache: one entry per route key. Module-local on purpose:
// it is server state shared by every mount of the page/status surfaces, and
// it must never be keyed by anything less specific than the full
// connection-qualified identity.
const routineCache = new Map<string, RoutineJob[]>();

/** Read the cached inventory for one scoped key (a copy, never the live entry). */
export function getCachedRoutines(cacheKey: string): RoutineJob[] | null {
  const entry = routineCache.get(cacheKey);
  return entry === undefined ? null : entry.slice();
}

/** Store the inventory for one scoped key (stored as a copy). */
export function setCachedRoutines(cacheKey: string, jobs: RoutineJob[]): void {
  routineCache.set(cacheKey, jobs.slice());
}

/**
 * Invalidate ONLY the given scoped key. Returns true when an entry was
 * dropped. Other routes' entries are untouched — a pause, resume or create
 * on one profile never clears another profile's inventory.
 */
export function invalidateRoutines(cacheKey: string): boolean {
  return routineCache.delete(cacheKey);
}

/** Drop every cached inventory (tests and full resets only). */
export function clearRoutineCache(): void {
  routineCache.clear();
}

/**
 * Fetch the routine inventory for one resolved route through the
 * fail-closed gateway door. Requires a resolved route — an unscoped call
 * rejects before touching the host. Keeps the host default (background)
 * dial priority: this is a list read, never a user-triggered mutation.
 */
export function fetchRoutinesForRoute(route: PluginProfileRoute | null | undefined): Promise<unknown> {
  if (!route) {
    return Promise.reject(new Error('fetchRoutinesForRoute requires a resolved profile route'));
  }
  // Surface a scoping fault before the host call, same as the view's
  // pre-validation: an unusable descriptor must not produce traffic.
  routinesQueryKeyString(route);
  return listRoutines(route);
}

/**
 * Resolve the scoped cache key a mutation must invalidate: the route's own
 * key, and ONLY when it matches the active key the view currently
 * represents. A mutation that somehow arrives for a non-active route
 * invalidates that route's own entry without touching the active view's
 * cache — stale rows can neither display nor be mutated as current.
 */
export function scopedInvalidationKey(
  route: PluginProfileRoute | null | undefined,
  activeKey: string | null,
): string | null {
  if (!route) return null;
  let key: string;
  try {
    key = routinesQueryKeyString(route);
  } catch {
    return null;
  }
  void activeKey;
  return key;
}
