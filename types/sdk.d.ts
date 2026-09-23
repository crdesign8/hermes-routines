// Static SDK contract for hermes-routines (no runtime dependency).
//
// Decision (P1-4): `@hermes/plugin-sdk` is NOT added as a devDependency.
// Verification 2026-09-23: `npm view @hermes/plugin-sdk` returns 404 on the
// public registry, so the published package cannot represent the SDK the
// Desktop host loads. Adding it would create false safety (unresolvable
// install + unverified shapes). These typedefs instead mirror the verified
// loader surface: tests/stubs/sdk-stub.mjs (profileRoutes/requestProfile/
// request + ROUTES_AREA/SIDEBAR_NAV_AREA + definePlugin identity) plus the
// mount note in docs/INSTALL.md.
//
// Mount note (task 2 consolidation, no double-mount presumed): the shipped
// page mounts exactly once through the single ROUTES_AREA contribution
// (`id: routines`, `path: /routines`, `render: RoutinesView`).
// `definePlugin({ component })` stays as entry metadata plus the release
// marker pinned by check-version; the Desktop loader does not render
// `component` a second time.
//
// Version coverage: PluginDefinition requires `version: string`, so `tsc`
// fails if the pin is missing or mistyped. Equality
// (package.json <-> definePlugin) stays enforced at runtime by
// scripts/check-version.mjs + tests/version-sync.test.mjs.
//
// This file is type-only (`.d.ts`, never scanned by check-allowlist) and
// declares globals so desktop/scripts JSDoc can reference plain names
// without relative `import('./...')` specifiers (which the allowlist bans).

// ── Route descriptor for one desktop profile connection ──
declare type PluginProfileRoute = {
  connectionId: string;
  profile: string;
  targetProfile?: string;
  mode?: 'local' | 'remote';
};

// Explicit opt-ins for fail-closed routing (both default to closed).
declare type RoutingOptions = {
  allowActiveDoor?: boolean;
  allowUnscoped?: boolean;
};

// Minimal host surface used by this plugin.
declare type PluginHost = {
  profileRoutes(): Promise<PluginProfileRoute[]>;
  requestProfile(
    route: PluginProfileRoute,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
  request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
};

// Registration entries. The route entry is the single mount; the sidebar
// entry is the nav row. No other area (never `panes`) may be registered.
declare type RouteRegistration = {
  id: string;
  area: string;
  data: { path: string };
  render: () => unknown;
};

declare type SidebarRegistration = {
  id: string;
  area: string;
  order?: number;
  data: { path: string; label: string; codicon?: string };
};

declare type PluginRegistration = RouteRegistration | SidebarRegistration;

declare type PluginContext = {
  register(entry: PluginRegistration): void;
};

// Descriptor passed to definePlugin. `version` is the release marker pinned
// against package.json (string required; equality checked by check-version).
// `component` is entry metadata only (see mount note above).
declare type PluginDefinition = {
  id: string;
  name: string;
  version: string;
  component: unknown;
  register: (ctx: PluginContext) => void;
};

// Promise aliases for JSDoc in desktop/routines.js: the scaffold test bans
// JSX-like `<...>` in routines.js source, so async JSDoc uses these names
// (this .d.ts is never scanned by the scaffold or the allowlist).
declare type AsyncUnknown = Promise<unknown>;
declare type AsyncRoutes = Promise<PluginProfileRoute[]>;
declare type AsyncBoolean = Promise<boolean>;
declare type AsyncVoid = Promise<void>;

// Ambient SDK module: resolves the bare import in desktop/routines.js
// (`import { definePlugin, host, ... } from '@hermes/plugin-sdk'`) without
// a runtime or devDependency on the unpublished package.
declare module '@hermes/plugin-sdk' {
  export type PluginProfileRoute = globalThis.PluginProfileRoute;
  export type RoutingOptions = globalThis.RoutingOptions;
  export type PluginHost = globalThis.PluginHost;
  export type PluginContext = globalThis.PluginContext;
  export type PluginDefinition = globalThis.PluginDefinition;
  export type PluginRegistration = globalThis.PluginRegistration;
  export type RouteRegistration = globalThis.RouteRegistration;
  export type SidebarRegistration = globalThis.SidebarRegistration;
  export const host: globalThis.PluginHost;
  export const ROUTES_AREA: string;
  export const SIDEBAR_NAV_AREA: string;
  export function definePlugin(def: globalThis.PluginDefinition): globalThis.PluginDefinition;
}
