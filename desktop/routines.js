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
export function routeKey(route) {
  return `${route.connectionId}::${route.profile}`;
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
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    return params;
  }
  return { ...params, profile: target };
}

// Gateway RPC on the entry owning connection. Entries with a resolved
// route descriptor ride host.requestProfile; unscoped entries keep the
// active gateway door. Same dispatch shape as cross-connection routing
// elsewhere, reimplemented here so this file stays dependency free.
// Route type: PluginProfileRoute from the host registry.
export async function requestCronForRoute(target, method, params = {}, timeoutMs) {
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
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}

// Inventory every credential free route, then read that profile own
// cron store. Route type: PluginProfileRoute from host.profileRoutes.
export async function listProfileRoutes() {
  return host.profileRoutes();
}

// List helper scoped to one profile route via cron.manage.
// Route type: PluginProfileRoute; backend field profile carries target.
export async function listRoutines(route) {
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
    id: 'routines',
    area: ROUTES_AREA,
    data: { path: '/routines' },
    render: () => jsx(RoutinesView, {}),
  });
  ctx.register({
    id: 'sidebar-nav',
    area: SIDEBAR_NAV_AREA,
    order: 50,
    data: { path: '/routines', label: 'Routines', codicon: 'history' },
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
