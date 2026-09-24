# INSTALL — hermes-routines

## Mapping

| Source (repo)         | Destination (app home)                                   |
|-----------------------|----------------------------------------------------------|
| `desktop/plugin.js`   | `<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` |

The plugin folder name equals the plugin id `hermes-routines`.
The installed file is always named
`plugin.js` and must be byte-identical to `desktop/plugin.js`
(the **generated** artifact — see Development);
`scripts/install.mjs` stages to a unique temp file
(`plugin.js.tmp.<pid>.<rand>`, 64-bit `crypto.randomBytes` suffix,
exclusive `wx` create so an existing temp is never truncated), verifies
sha256, `fsync`s the temp before an atomic rename, verifies sha256
after, and fails the install on mismatch (no half-copy is ever left
behind; concurrent installs use different temp names and both rename
over identical bytes, so last-writer-wins stays intact).

This is the official app-level door: ONE root,
`<HERMES_HOME>/desktop-plugins/`, with `<id>/plugin.js` for a
standalone desktop plugin. The plugin stays installed and loaded
whichever profile, gateway, or machine the window is pointed at —
nothing is installed per profile.

## Distribution manifest (`plugin.yaml`)

`plugin.yaml` lives at the package root and ships in the published
package (`files` in `package.json`), next to `desktop/plugin.js` — it is
**not** copied by the flat installer above. The installer maps exactly
one file (`desktop/plugin.js` →
`<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js`); the manifest is
distribution metadata for catalog/registry validation, resolved from
the package, not from the profile home.

Single source of truth stays `package.json`: `name` / `version` /
`description` must match across `package.json`, `plugin.yaml`,
`src/constants.ts` (`PLUGIN_ID`) and the `desktop/plugin.js`
descriptor (`description`, `defaultEnabled: false` opt-in, `version`
pin), with `provides_tools: []` / `provides_hooks: []` declared
explicitly empty. `node scripts/check-manifest.mjs` (part of
`npm run check`, pinned by `tests/manifest-sync.test.mjs`) fails on any
drift.

## App home resolution

Precedence (first match wins):

1. `--hermes-home=<dir>` CLI flag (must be non-empty; resolved to absolute).
2. `HERMES_HOME` environment variable (same rule).
3. `~/.hermes` (the local app home).

There is exactly one install location — no per-profile second source of
truth. The legacy profile inputs (`--profile-home`, `--profile`,
`HERMES_PROFILE_HOME`) are rejected with a migration pointer instead of
installing elsewhere (see Migration). `HERMES_PROFILE` alone is ignored:
the app-level door does not vary by profile.

## Development

`src/**/*.ts(x)` is the only editable source. `desktop/plugin.js` is
produced by `node scripts/build.mjs` (esbuild, deterministic output,
externals `@hermes/plugin-sdk` / `react` / `react/jsx-runtime`,
non-minified) and carries an `AUTO-GENERATED — DO NOT EDIT` banner.
There is no mirrored copy anywhere: the former
`desktop/lib/cron-shapes.mjs` + `sync-shapes` copy-identity guard are
gone. `requestCronForRoute` behavior (routing, scoping, `timeoutMs`
positioning, fail-closed errors, both opt-ins) is pinned against the
shipped artifact by `tests/gateway-semantics.test.mjs` with the SDK face
stubbed.

## Install

```sh
node scripts/install.mjs install --hermes-home="$HOME/.hermes"
# or (default command is install)
node scripts/install.mjs --hermes-home="$HOME/.hermes"
# or
HERMES_HOME="$HOME/.hermes" node scripts/install.mjs install
# or (default home is ~/.hermes)
node scripts/install.mjs install
```

Verify manually:

```sh
sha256sum desktop/plugin.js <HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js
```

Both hashes must match.

## Update

`update` is `install`: re-run with the refreshed artifact. Installs are
idempotent and atomic: when the installed bytes already match, nothing
is rewritten (`unchanged`); otherwise the new bytes are staged,
hash-verified, and renamed over
`<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js`, so the
previous version stays live until the swap completes. The replaced bytes
are kept as `plugin.js.prev` in the same directory for `rollback`. Then
reload the app runtime (see Reload) and re-check the two hashes.

```sh
npm run build          # refresh desktop/plugin.js from src/ first
node scripts/install.mjs update --hermes-home="$HOME/.hermes"
sha256sum desktop/plugin.js "$HOME/.hermes/desktop-plugins/hermes-routines/plugin.js"
```

There is no version check or migration step: the plugin file carries no
local state (jobs live in the backend via `cron.manage`), so overwriting
with the newer `desktop/plugin.js` is the whole upgrade.

## Uninstall

The installer creates or updates exactly:

```text
<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js
```

(plus `plugin.js.prev` after a differing update, and the parent dirs on
first install), so uninstall is a plain remove — idempotent when the
plugin is already gone:

```sh
node scripts/install.mjs uninstall --hermes-home="$HOME/.hermes"
```

or manually:

```sh
rm "$HOME/.hermes/desktop-plugins/hermes-routines/plugin.js"
rm "$HOME/.hermes/desktop-plugins/hermes-routines/plugin.js.prev" 2>/dev/null || true
rmdir "$HOME/.hermes/desktop-plugins/hermes-routines" 2>/dev/null || true
```

Then reload the app runtime so the `/routines` route and its
sidebar row disappear. Removing the whole `desktop-plugins` dir is
NOT required — other plugins share it. To reinstall later, run the
Install command again.

## Rollback

A differing `install`/`update` keeps the replaced bytes as
`plugin.js.prev`. Restore them atomically (same stage, hash-verify,
rename contract as install):

```sh
node scripts/install.mjs rollback --hermes-home="$HOME/.hermes"
```

Rollback without a backup fails closed (`no backup to roll back`). The
backup is kept after a rollback, so it stays repeatable.

## Migration from the legacy profile install (pre-#14)

Releases before this change installed per profile at
`<profile-home>/plugins/routines/plugin.js`. That layout is removed:
the Desktop loader reads only the app-level root, so a profile-scoped
file no longer loads and the installer refuses to write one.

1. Install app-level (see Install).
2. Delete the old file for every profile that had it:

```sh
rm "$HOME/.hermes/profiles/default/plugins/routines/plugin.js"
rmdir "$HOME/.hermes/profiles/default/plugins/routines" 2>/dev/null || true
```

3. Reload the app. The Routines page now loads from
   `<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` and stays
   available whichever profile is active.

Legacy invocations (`--profile-home=...`, `--profile=...`,
`HERMES_PROFILE_HOME=...`) fail with `legacy profile install removed`
and the same pointer — they never write to a second location.

## Checks

```sh
npm test                  # full suite (node:test)
node scripts/check-allowlist.mjs   # import allowlist + require/eval ban (src/ + desktop/)
node scripts/check-version.mjs     # package.json version == descriptor version in desktop/plugin.js
node scripts/check-manifest.mjs    # package.json == plugin.yaml == src/constants.ts == desktop/plugin.js (+ empty provides_*)
node scripts/build.mjs --check     # desktop/plugin.js is fresh (regenerate on drift)
npm run typecheck                  # tsc --noEmit (strict, src/ + scripts/)
npm run check             # all gates above
```

Freshness (`build.mjs --check`) is what binds the artifact to `src/`:
an edit to `src/` without a rebuild fails `npm run check` and
`tests/source-of-truth.test.mjs`.

## View (`RoutinesView`)

Page state machine (pure, exported for tests as `routinesViewReducer`):
`routes-loading` → `routes-error` (retry) or `list-loading` →
`list-error` (retry) or `ready`. Empty is derived: no routes, or a
loaded list with zero jobs. The first usable route is preselected;
unusable entries are skipped, never invented. Every dispatch rides
`host.requestProfile` for `cron.manage` — the view never passes the
active-door opt-in.

- Create: local shape validation first (`addJob` copy), then
  `cron.manage add` with the backend profile; the list reloads on
  confirm. Never optimistic (backend owns normalization; an
  unconfirmed row could duplicate on retry).
- Pause / resume: optimistic single-flag flip with snapshot rollback
  on host failure (idempotent, reversible). `isSafeOptimistic` pins
  this: only `pause`/`resume` return true.
- The current view has no delete, edit, or run-now control. The domain
  still exposes a `remove` request builder for backend compatibility, but
  the page does not expose a destructive action.
- While any mutation is in flight the other mutation buttons stay
  disabled, so optimistic snapshots never overlap.
- Errors are wrapped (`context: message`, original as `cause`); the
  view renders the message only, never a raw stack.

Accessibility (acceptance criteria, shipped in the view): landmark
`section` labelled by the `h2`, native `select`/`button` controls in a
`ul` list, labelled filter `nav` with `aria-current`, `role="status"`
plus `aria-live="polite"` region, `role="alert"` error boxes,
`tabIndex={-1}` focus targets with focus moved on confirm open,
delete and error retry, `:focus-visible` ring, text badges instead of
icons (ink 18.1, muted 7.0, primary 5.1, danger 6.6, active badge 7.1,
paused badge 14.7 — all above 4.5).

Mount note: the route surface is the single `ROUTES_AREA`
contribution (`id: routines`, `path: /routines`, `render` through the
contribution). The default-export descriptor carries `id` / `name` /
`version` / `register` only — there is no `component` and no
`definePlugin` (the real SDK exposes neither; the loader reads the
default export), so nothing can render the descriptor a second time.

The cron builders (`listJobs`, `addJob`, `removeJob`, `pauseJob`,
`resumeJob` plus validators) are compiled from
`src/domain/cronShapes.ts` — the single source bundled into
`desktop/plugin.js` at build time — pinned by
`tests/cron-actions.test.mjs` and the artifact export pins in
`tests/scaffold.test.mjs`.

## Edge behavior

- `job_id` is trimmed and must match `^[A-Za-z0-9._:-]+$` (max 128 chars).
- `schedule` is trimmed (max 256 chars, no control characters); cron
  semantics stay backend-owned, the desktop only fails fast on shape.
- `payload` must be a plain object and is deep-cloned; `listJobs` clones
  items so callers cannot mutate queued shapes. Values that
  `structuredClone` cannot clone (e.g. functions) surface as `TypeError`
  (`uncloneable value`, with the original `DataCloneError` as `cause`)
  instead of leaking the raw DOMException.
- Fail-closed routing (never silently on the active gateway):
  - `listRoutines` requires a resolved profile route with a
    profile/targetProfile — never falls back to the active gateway.
  - `requestCronForRoute(null|unscoped, ...)` rejects with
    `Cannot dispatch <method> without a resolved profile route` unless the
    caller passes the explicit opt-in `{ allowActiveDoor: true }` (last
    parameter, after `timeoutMs`), in which case `host.request` is used.
    A truthy-but-not-`true` flag does NOT open the door.
  - `scopedCronParams(route, params)` with a route but no own `profile`
    key in `params` throws
    `TypeError: scopedCronParams requires params.profile ...` instead of
    sending unscoped; pass `{ allowUnscoped: true }` (last parameter) only
    for an intentionally unscoped call. With no route (`null`/`undefined`)
    params pass through untouched. A routed `requestCronForRoute` forwards
    `allowUnscoped` to `scopedCronParams`, so routed calls also require
    `params.profile` by default.
- `timeoutMs`, when given, must be a non-negative finite number.
- `options`, when given, must be a plain object; `allowActiveDoor` and
  `allowUnscoped` must be booleans when present.
- Version pin: `package.json` `version` equals the descriptor
  `version` in `desktop/plugin.js` (injected from `package.json` at
  build time via esbuild `define`, so the artifact cannot drift);
  `node scripts/check-version.mjs` (part of `npm run check`) fails on
  drift. Statically, the descriptor type (`RoutinesPlugin`) requires
  `version: string`, so `tsc` fails if the pin is missing or mistyped;
  equality stays enforced by `check-version` +
  `tests/version-sync.test.mjs`.

## Static contract (strict TypeScript, no runtime deps)

`tsconfig.json` enforces `strict` + `noEmit` + `jsx: react-jsx` over
`src/**/*.ts(x)` and `checkJs` over `scripts/*.mjs`; the gate is
`npm run typecheck` (`tsc --noEmit`), wired into `npm run check`.
`desktop/plugin.js` is generated output and intentionally not
type-checked (it is banner-marked and rebuilt from the typed source).

SDK decision (recorded): `@hermes/plugin-sdk` is NOT added as a
devDependency. Verification 2026-09-23: `npm view @hermes/plugin-sdk`
returns 404 on the public registry, so the published package cannot
represent the SDK the Desktop host loads; adding it would be false
safety. The contract instead uses the local shim
`src/types/plugin-sdk.d.ts` mirroring the verified loader
(`tests/stubs/sdk-stub.mjs`: `profileRoutes` / `requestProfile` /
`request`, `ROUTES_AREA`, `SIDEBAR_NAV_AREA` — no `definePlugin`,
which does not exist upstream) plus the mount note above (single
`ROUTES_AREA` mount, descriptor as entry metadata only). `typescript`,
`esbuild`, `@types/node` and `@types/react` are devDependencies only —
no runtime dep. `tests/types-contract.test.mjs` pins the wiring
(tsconfig flags, shim names, `@ts-check` presence, no SDK/runtime deps,
`npm run check` gates, version typing).

## Reload

After install, reload the app runtime so the plugin host picks up
`desktop-plugins/hermes-routines/plugin.js` (restart the desktop app or trigger a
runtime plugin reload). The Routines page then mounts at
`/routines` with its sidebar row, and stays mounted whichever profile
or gateway the window is pointed at.

## Coexistence

- **Routes, not panes.** Routines mounts one page via `ROUTES_AREA`
  (`id: routines`, `path: /routines`) plus one nav row via
  `SIDEBAR_NAV_AREA` (`id: sidebar-nav`). It never registers the
  `panes` area, so it cannot steal pane layout from other plugins.
- **No collision with `/cron`.** Routines registers only `/routines`;
  it registers no `/cron` path and no `cron` id, so side-by-side
  installs with cron plugins keep working.

## Troubleshooting

- `legacy profile install removed ...` → the pre-#14 per-profile inputs
  (`--profile-home`, `--profile`, `HERMES_PROFILE_HOME`) are rejected on
  purpose. Install app-level with `--hermes-home` and delete the old
  `<profile-home>/plugins/routines/plugin.js` (see Migration).
- `sha256 mismatch ...` → disk error or the source changed mid-install;
  concurrent installs no longer collide (unique `wx` temp per process),
  so just re-run install and compare hashes manually. The staging temp
  is cleaned up on failure.
- `build: desktop/plugin.js is stale` → run `npm run build` after
  editing `src/` (freshness gate compares hashes).
- `allowlist: ...` → only `@hermes/plugin-sdk` + `react/jsx-runtime`
  (+ pre-approved `react`, `react/jsx-dev-runtime`) and `node:` builtins
  are allowed; `require`/`eval`/`new Function` are banned.
