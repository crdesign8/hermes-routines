import { definePlugin, host, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk';
import { jsx } from 'react/jsx-runtime';

const ID = 'hermes-routines';
const ROUTE_ID = 'routines';
const ROUTE_PATH = '/routines';
const SIDEBAR_ID = 'sidebar-nav';

// Areas: 'routes' for the page and 'sidebar.nav' for the nav row.
// The page mounts in the workspace at ROUTE_PATH; the nav row points
// at the same path and highlights while the app is there.

function RoutinesView() {
  return jsx('div', { id: 'hermes-routines-root', children: 'Routines' });
}

// Route descriptor for one desktop profile connection.
// Shape follows PluginProfileRoute: connectionId plus profile pair.
// NOTE (copy-identity): the five functions below must stay byte-identical
// with the canonical lib copy. Do not edit by hand —
// edit the lib and run the sync script with --write.
export function routeKey(route) {
  if (!route || typeof route.connectionId !== 'string' || typeof route.profile !== 'string') {
    throw new TypeError('invalid route: connectionId and profile must be strings');
  }
  const connectionId = route.connectionId.trim();
  const profile = route.profile.trim();
  if (!connectionId || !profile) {
    throw new TypeError('invalid route: connectionId and profile must be non-empty');
  }
  return `${connectionId}::${profile}`;
}

export function resolveProfileRoute(entry) {
  if (!entry?.sourceScoped && !entry?.remoteSource) {
    return { status: 'not_scoped', route: null };
  }
  const candidate = entry.route || {
    connectionId: entry.connectionId,
    mode: entry.connectionKind === 'local' ? 'local' : 'remote',
    profile: entry.name,
    targetProfile: entry.targetProfile || entry.name,
  };
  if (candidate.mode !== undefined && candidate.mode !== 'local' && candidate.mode !== 'remote') {
    throw new TypeError(`invalid route mode: ${String(candidate.mode)}`);
  }
  const connectionId = String(candidate?.connectionId || '').trim();
  const profile = String(candidate?.profile || entry?.name || '').trim() || 'default';
  const targetProfile = String(candidate?.targetProfile || profile).trim() || profile;
  if (!connectionId) {
    return { status: 'owner_removed', route: null, profile };
  }
  const mode = candidate.mode === 'local' || connectionId === 'local' ? 'local' : 'remote';
  return {
    status: 'resolved',
    route: Object.freeze({ connectionId, mode, profile, targetProfile }),
  };
}

export function profileRoute(entry) {
  const resolved = resolveProfileRoute(entry);
  if (resolved.status === 'owner_removed') {
    throw new Error(`Profile ${resolved.profile} has no connection owner`);
  }
  return resolved.route;
}

export function backendTargetProfile(route, fallbackProfile = 'default') {
  if (!route) {
    return fallbackProfile;
  }
  return route.targetProfile || route.profile;
}

export function scopedCronParams(route, params = {}) {
  if (!route) {
    return params;
  }
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    return params;
  }
  return { ...params, profile: target };
}

function assertTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined) return;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative finite number');
  }
}

// Gateway RPC on the entry owning connection. Entries with a resolved
// route descriptor ride host.requestProfile; unscoped entries keep the
// active gateway door. Same dispatch shape as cross-connection routing
// elsewhere, reimplemented here so this file stays dependency free.
// Route type: PluginProfileRoute from the host registry.
// NOTE: this overload binds the imported `host`, unlike the lib version
// which takes `host` as a parameter (see copy-identity test).
export async function requestCronForRoute(target, method, params = {}, timeoutMs) {
  assertTimeoutMs(timeoutMs);
  const route = target && target.connectionId ? target : profileRoute(target);
  if (route) {
    if (typeof host.requestProfile !== 'function') {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params);
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped)
      : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (typeof host.request !== 'function') {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}

// Inventory every credential free route, then read that profile own
// cron store. Route type: PluginProfileRoute from host.profileRoutes.
export async function listProfileRoutes() {
  try {
    return await host.profileRoutes();
  } catch (err) {
    throw new Error(`failed to list profile routes: ${err?.message || err}`, { cause: err });
  }
}

// List helper scoped to one profile route via cron.manage.
// Route type: PluginProfileRoute; backend field profile carries target.
// Fail-closed: a resolved route is required — never fall back to the
// active gateway door for an explicitly scoped read.
export async function listRoutines(route) {
  if (!route?.connectionId) {
    throw new Error('listRoutines requires a resolved profile route');
  }
  const target = backendTargetProfile(route, '');
  const scope = target ? { profile: target } : {};
  return requestCronForRoute(route, 'cron.manage', {
    action: 'list',
    include_disabled: true,
    ...scope,
  });
}

export function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => jsx(RoutinesView, {}),
  });
  ctx.register({
    id: SIDEBAR_ID,
    area: SIDEBAR_NAV_AREA,
    order: 50,
    data: { path: ROUTE_PATH, label: 'Routines', codicon: 'history' },
  });
}

export const plugin = definePlugin({
  id: ID,
  name: 'Routines',
  version: '0.1.0',
  component: RoutinesView,
  register,
});

export default plugin;
