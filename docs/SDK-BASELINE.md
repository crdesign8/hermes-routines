# Hermes Desktop SDK compatibility baseline

This repository consumes the host-provided `@hermes/plugin-sdk` module. This
document is the human-facing half of the compatibility contract; the
machine-readable half is [`sdk-baseline.json`](../sdk-baseline.json), enforced
by [`scripts/check-sdk-baseline.mjs`](../scripts/check-sdk-baseline.mjs) inside
`npm run check` and therefore inside CI.

## Minimum supported baseline

| Field | Value |
|---|---|
| Upstream repository | `NousResearch/hermes-agent` |
| Baseline commit | `89937f86858a2d7826f783cd77c5a24b1d56dc4e` (2026-10-02) |
| SDK module (canonical surface) | `apps/desktop/src/sdk/index.ts` |
| SDK documentation | [`website/docs/developer-guide/desktop-plugin-sdk.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/desktop-plugin-sdk.md) |
| First-party plugin implementations | `apps/desktop/src/plugins/` |
| Companion examples repository | [`NousResearch/hermes-example-plugins`](https://github.com/NousResearch/hermes-example-plugins) |
| npm package | `@hermes/plugin-sdk` is **not published** (`npm view @hermes/plugin-sdk` → 404, re-verified 2026-10-03) |

A Desktop host at or after that commit is a supported host for this plugin. The
baseline is the *minimum*: it records the symbols this plugin consumes and the
upstream anchor each one was verified against, never the whole SDK.

The shim (`src/types/plugin-sdk.d.ts`) does **not** implement the SDK. It types
exactly the surface above because the SDK is injected by the Desktop host at
load time and has no consumable typings to depend on. Coupling this standalone
repository to a local `hermes-agent` checkout through a tsconfig `paths`
mapping is explicitly rejected: it would require an absolute path outside the
repository and pull the entire SDK type graph in for a handful of imports.

## Recorded contract

`kind` is the baseline kind, `surface` the object path the plugin actually
calls (`host.*` for host members). Every entry points at the upstream
`path:line` it was verified against.

| Symbol | Kind | Surface | Upstream anchor |
|---|---|---|---|
| `host` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:668` |
| `useValue` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:2089` |
| `ROUTES_AREA` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/app/routes.ts:88` |
| `SIDEBAR_NAV_AREA` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/app/routes.ts:128` |
| `PluginProfileRoute` | type-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:210` |
| `PluginContext` | type-export | `@hermes/plugin-sdk` | `apps/desktop/src/contrib/plugin.ts:76` |
| `HermesPlugin` | type-export | `@hermes/plugin-sdk` | `apps/desktop/src/contrib/plugin.ts:128` |
| `Button` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1802` |
| `Input` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1850` |
| `Textarea` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1873` |
| `Select` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1868` |
| `SelectTrigger` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1868` |
| `SelectValue` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1868` |
| `SelectContent` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1868` |
| `SelectItem` | value-export | `@hermes/plugin-sdk` | `apps/desktop/src/sdk/index.ts:1868` |
| `profileRoutes` | host-member | `host.profileRoutes` | `apps/desktop/src/sdk/index.ts:1476` |
| `requestProfile` | host-member | `host.requestProfile` | `apps/desktop/src/sdk/index.ts:1512` |
| `request` | host-member | `host.request` | `apps/desktop/src/sdk/index.ts:1621` |
| `newChat` | host-member | `host.newChat` | `apps/desktop/src/sdk/index.ts:1371` |
| `composer.setDraft` | host-member | `host.composer.setDraft` | `apps/desktop/src/sdk/composer.ts:93` |
| `composer.submit` | host-member | `host.composer.submit` | `apps/desktop/src/sdk/composer.ts:123` |
| `state.profile` | host-member | `host.state.profile` | `apps/desktop/src/sdk/index.ts:712` |
| `state.connectionId` | host-member | `host.state.connectionId` | `apps/desktop/src/sdk/index.ts:684` |
| `PluginContribution` | shim-internal | shim declaration only | `apps/desktop/src/contrib/plugin.ts:30` |
| `ReadableAtom` | shim-internal | shim declaration only | `apps/desktop/src/sdk/index.ts:21` |

The UI-kit entries (`Button`, `Input`, `Textarea`, `Select*`) were added for
issue #100. They are ordinary value exports like the rest, but they carry two
contracts worth naming here:

- **String-valued select.** Upstream's `Select` is a Radix select whose
  `value` is a string. `NativeSelect` therefore serializes each option value
  on the way in and resolves it against the option list on the way out, so a
  number or union-typed value never has to round-trip through `String()`.
- **`variant` / `size` are cva VariantProps.** The upstream button types its
  emphasis as `class-variance-authority` variants. The shim declares the
  literal union this plugin uses, because cva types do not exist in the shim;
  an unlisted value still typechecks, so this cannot drift into a false gate.

`shim-internal` entries are structural helpers the shim needs to describe its
own shape (`ctx.register`'s argument, the readonly atom face). They are
declared inside the shim and never exported, so they cannot be imported by the
plugin and never claim an SDK import.

`host.request` / `host.requestProfile` are treated as upstream-owned capability
boundaries. This repository adds no ACL, grants model, or wrapper that could
diverge from the host's own routing and fail-closed semantics.

## What CI enforces

`node scripts/check-sdk-baseline.mjs` scans `src/**` (`.d.ts` files excluded,
comments stripped, symlinks rejected) together with the shim and fails on:

1. an SDK value/type import `src/` uses but the baseline does not record — a
   new SDK import requires a baseline entry first;
2. a name the shim exports that the baseline does not record — the shim may not
   silently grow;
3. a baseline export the shim no longer declares while `src/` still imports it;
4. a `host.<member>` path `src/` calls that the baseline does not record;
5. a baseline symbol (export, host member, or shim-internal) that nothing in
   the repository consumes — no speculative declarations, and a removed usage
   must remove its entry;
6. a malformed baseline: missing upstream fields, a `ref` that is not a full
   40-character commit sha, an unknown `kind`, or an anchor that is not a
   `path:line`.

Consumption is read statically from the source. Block comments and
comment-only lines are stripped, so prose that merely mentions a symbol never
counts as usage; conversely an alias (`const h = host`) would evade the scan,
which is why the plugin drives every SDK call through the module import
directly.

## Refreshing the baseline when upstream changes

1. Check out the new upstream `hermes-agent` commit and read the canonical
   surface: `apps/desktop/src/sdk/index.ts` (plus `sdk/composer.ts` and
   `contrib/plugin.ts` for the members listed above) and the SDK page
   `website/docs/developer-guide/desktop-plugin-sdk.md`.
2. Re-verify each anchor in `sdk-baseline.json` — a moved symbol means a moved
   line, and a changed signature means the shim must change with it.
3. Diff the recorded surface against the source's actual imports and host
   calls. Add an entry *before* consuming a new symbol; delete an entry when a
   usage disappears.
4. Update `src/types/plugin-sdk.d.ts` to match: one exported declaration per
   recorded export, unexported helpers for `shim-internal` entries.
5. Update `upstream.ref` (full sha) and the date in this document, then run
   `npm run check` and `npm test`. `npm run build` must be re-run whenever the
   typed source changes so `desktop/plugin.js` stays fresh.
6. Re-confirm the package question when touching the baseline:
   `npm view @hermes/plugin-sdk`. If official consumable typings are ever
   published, they replace the shim and this section changes with them — the
   shim exists only because that command returns 404.

## Compatibility references

- **Normative**: the upstream SDK module (`apps/desktop/src/sdk/index.ts`) and
  its documentation page, both pinned by `upstream.ref` above.
- **Normative**: first-party Desktop plugin implementations under
  `apps/desktop/src/plugins/` — e.g.
  `apps/desktop/src/plugins/kanban/plugin.tsx:24` (imports), `:110`
  (`ROUTES_AREA` page) and `:126` (`SIDEBAR_NAV_AREA` row) show the same
  route + sidebar registration this plugin performs.
- **Named for reference**: `NousResearch/hermes-example-plugins`, the companion
  catalog for examples that do not belong in the shipped app tree. Its current
  catalog is dashboard/agent-plugin examples, so the first-party bundled
  plugins above remain the desktop-SDK reference implementations.

## Non-goals

- No local reimplementation of SDK APIs and no parallel plugin-permissions
  model.
- No dependency on an absolute local `hermes-agent` checkout, from CI or from
  the build.
- No speculative declarations for SDK APIs this plugin does not consume.
