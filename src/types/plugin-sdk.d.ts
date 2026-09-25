// Minimal, strict type surface for `@hermes/plugin-sdk`.
//
// Why a local shim instead of real types: `npm view @hermes/plugin-sdk`
// returns 404 on the public registry (re-verified 2026-09-23), so the
// package the Desktop host loads cannot be consumed as a devDependency.
// A tsconfig `paths` mapping into a hermes-agent checkout would couple
// this standalone repo to an absolute path outside it and drag the whole
// SDK type graph (nanostores, React Query, the UI kit) along for three
// imported values.
//
// Every declaration mirrors a surface this plugin actually calls, verified
// against `hermes-agent/apps/desktop/src/sdk/index.ts` plus the documented
// contract in `hermes-agent/website/docs/developer-guide/desktop-plugin-sdk.md`
// on 2026-09-23:
//   - HermesPlugin / PluginContext / PluginContribution: contrib/plugin.ts
//     (`createPluginContext`, `register` returns a disposer)
//   - PluginProfileRoute — connectionId, mode, profile, targetProfile are
//     ALL required: sdk/index.ts
//   - host.profileRoutes / host.requestProfile(route, method, params,
//     timeoutMs?, { spawnPriority? }) / host.request(method, params?,
//     timeoutMs?): sdk/index.ts (`PluginProfileRequestOptions` carries
//     `spawnPriority?: 'foreground' | 'background'`; see the desktop docs,
//     desktop-plugin-sdk.md § requestProfile)
//   - host.state.profile / host.state.connectionId: sdk/index.ts (`profile:
//     readonlyAtom<string>($activeGatewayProfile)`, `connectionId:
//     readonlyAtom<null | string>($activeConnectionId)`)
//   - useValue: sdk/index.ts (`export { useStore as useValue }`)
//   - ROUTES_AREA = 'routes', SIDEBAR_NAV_AREA = 'sidebar.nav': app/routes.ts
//
// Do NOT add a symbol here without checking it exists upstream: the Desktop
// builds the runtime import shim from `Object.keys` of the live SDK module
// namespace (apps/desktop/src/sdk/runtime.ts), so importing an export that
// does not exist fails the plugin at ESM link time — it never loads.
declare module '@hermes/plugin-sdk' {
  import type { ReactNode } from 'react';

  /** One desktop profile connection, as returned by `host.profileRoutes()`. */
  export interface PluginProfileRoute {
    connectionId: string;
    mode: 'local' | 'remote';
    /** Desktop profile used to select the connection route. */
    profile: string;
    /** Backend Hermes profile served by that route. */
    targetProfile: string;
  }

  /** One registry contribution; the host namespaces `id` and stamps `source`. */
  export interface PluginContribution {
    id: string;
    area: string;
    title?: string;
    order?: number;
    when?: () => boolean;
    enabled?: boolean;
    render?: () => ReactNode;
    data?: unknown;
  }

  /** Scoped context handed to `register()`. Only the door this plugin uses. */
  export interface PluginContext {
    readonly source: string;
    register: (contribution: PluginContribution) => () => void;
  }

  /** Descriptor a Desktop plugin default-exports (the loader contract). */
  export interface HermesPlugin {
    id: string;
    name?: string;
    description?: string;
    defaultEnabled?: boolean;
    register: (ctx: PluginContext) => void;
  }

  /** Gateway doors this plugin calls. Module-local: the SDK exports `host`,
   *  not this name. */
  interface PluginHost {
    profileRoutes(): Promise<PluginProfileRoute[]>;
    /**
     * Registry-routed RPC. `options` is `PluginProfileRequestOptions`: a
     * call that may cold-start the profile dials at background priority by
     * default, so a user action (save, button, dialog) must pass
     * `{ spawnPriority: 'foreground' }` to take the pool's reserved
     * interactive slot; polling and roster warming keep the default.
     * When no `timeoutMs` is needed the placeholder `undefined` holds the
     * position so the bag still lands 5th.
     */
    requestProfile<T = unknown>(
      route: PluginProfileRoute,
      method: string,
      params: Record<string, unknown>,
      timeoutMs?: number,
      options?: { spawnPriority?: 'foreground' | 'background' },
    ): Promise<T>;
    request<T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      timeoutMs?: number,
    ): Promise<T>;
    /**
     * Readonly live app state (nanostore atoms). This plugin subscribes to
     * `profile` + `connectionId` only — the active-profile binding.
     * Verified in sdk/index.ts: `profile: readonlyAtom<string>
     * ($activeGatewayProfile)`, `connectionId: readonlyAtom<null | string>
     * ($activeConnectionId)`.
     */
    readonly state: {
      readonly profile: ReadableAtom<string>;
      readonly connectionId: ReadableAtom<null | string>;
    };
  }

  /** Minimal readable atom face: `.get()` in handlers, `useValue` in React. */
  export interface ReadableAtom<T> {
    get(): T;
    subscribe(listener: (value: T) => void): () => void;
  }

  export const host: PluginHost;
  export const ROUTES_AREA: 'routes';
  export const SIDEBAR_NAV_AREA: 'sidebar.nav';
  /**
   * Subscribe to a readonly atom in React (the SDK's useValue binding over
   * nanostores' useStore). Verified in sdk/index.ts (useStore aliased as
   * useValue, sourced from the nanostores React binding).
   */
  export function useValue<T>(atom: ReadableAtom<T>): T;
}
