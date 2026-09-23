# INSTALL — hermes-routines

## Mapping

| Source (repo)         | Destination (profile home)                |
|-----------------------|-------------------------------------------|
| `desktop/routines.js` | `<profile-home>/plugins/routines/plugin.js` |

The plugin folder name equals the registered route id `routines`
(plugin id is `hermes-routines`). The installed file is always named
`plugin.js` and must be byte-identical to `desktop/routines.js`;
`scripts/install.mjs` stages to a unique temp file
(`plugin.js.tmp.<pid>.<rand>`, 64-bit `crypto.randomBytes` suffix,
exclusive `wx` create so an existing temp is never truncated), verifies
sha256, `fsync`s the temp before an atomic rename, verifies sha256
after, and fails the install on mismatch (no half-copy is ever left
behind; concurrent installs use different temp names and both rename
over identical bytes, so last-writer-wins stays intact).

## Profile home resolution

Precedence (first match wins):

1. `--profile-home=<dir>` CLI flag (must be non-empty; resolved to absolute).
2. `HERMES_PROFILE_HOME` environment variable (same rule).
3. `~/.hermes/profiles/<profile>`, where `<profile>` is `--profile=<name>`,
   else `HERMES_PROFILE`, else `default`.

`<profile>` is restricted to `^[A-Za-z0-9._-]{1,64}$`. Traversal
(`../evil`), absolute paths, separators and blank names are rejected, so
`--profile` can never escape `~/.hermes/profiles/`. An explicit
`--profile-home` / `HERMES_PROFILE_HOME` is honored as given (resolved to
an absolute path) because it is an explicit operator choice.

Canonicalization / symlink note: the explicit home is resolved with
`path.resolve` (absolute + normalized `.` / `..`), but NOT with
`realpath` — symlinks are intentionally left unresolved. The OS follows
them at open/rename time, so installing through a symlinked home writes
to the symlink target, exactly like installing through the canonical
path; concurrent installs via either spelling share the same `dest`
file and stay safe (distinct temp names, atomic rename, identical
bytes, hash-verified). When scripting, prefer the canonical path
(`realpath "$HERMES_PROFILE_HOME"` / `pwd -P`) so logs and hashes are
easy to compare — but both spellings install the same bytes.

## Install

```sh
node scripts/install.mjs --profile-home="$HOME/.hermes/profiles/default"
# or
HERMES_PROFILE_HOME="$HOME/.hermes/profiles/default" node scripts/install.mjs
# or
node scripts/install.mjs --profile=default
```

Verify manually:

```sh
sha256sum desktop/routines.js <profile-home>/plugins/routines/plugin.js
```

Both hashes must match.

## Upgrade

Re-run the same install command. Installs are idempotent and atomic:
the new bytes are staged, hash-verified, and renamed over
`<profile-home>/plugins/routines/plugin.js`, so the previous version
stays live until the swap completes. Then reload the desktop profile
(see Reload below) and re-check the two hashes.

```sh
node scripts/install.mjs --profile-home="$HOME/.hermes/profiles/default"
sha256sum desktop/routines.js "$HOME/.hermes/profiles/default/plugins/routines/plugin.js"
```

There is no version check or migration step: the plugin file carries no
local state (jobs live in the backend via `cron.manage`), so overwriting
with the newer `desktop/routines.js` is the whole upgrade.

## Uninstall

The installer touches exactly one file
(`<profile-home>/plugins/routines/plugin.js`, plus its parent dirs on
first install) and tracks nothing else, so uninstall is a plain remove:

```sh
rm "$HOME/.hermes/profiles/default/plugins/routines/plugin.js"
rmdir "$HOME/.hermes/profiles/default/plugins/routines" 2>/dev/null || true
```

Then reload the desktop profile so the `/routines` route and its
sidebar row disappear. Removing the whole profile-home plugins dir is
NOT required — other plugins share it. To reinstall later, run the
Install command again.

## Checks

```sh
npm test                  # full suite (node:test)
node scripts/check-allowlist.mjs        # import allowlist + require/eval ban (desktop + scripts)
node scripts/sync-shapes.mjs --check    # copy-identity lib -> routines.js
node scripts/check-version.mjs          # package.json version == definePlugin({ version })
node scripts/check-types.mjs            # tsc --noEmit over jsconfig.json (checkJs, desktop + scripts)
npm run check             # all four checks
```

The five pure routing helpers (`routeKey`, `resolveProfileRoute`,
`profileRoute`, `backendTargetProfile`, `scopedCronParams`) are
copy-identical between `desktop/lib/cron-shapes.mjs` (canonical) and
`desktop/routines.js`. Edit the lib, then run
`node scripts/sync-shapes.mjs --write` to propagate.

Copy-identity is by marked region + sha256 hash, never by parsing JS.
Two regions stay byte-identical (lib canonical, `routines.js` cannot
import relatively per the allowlist):

- `cron-shapes-routing` — the five helpers above plus the private
  `assertRoutingOptions` and `assertTimeoutMs` (exported on both sides
  since P1-3 so the region hashes identically).
- `cron-shapes-builders` — `MAX_*` consts, `assertJobId`,
  `assertSchedule`, `assertPayload`, `cloneValue`, `listJobs`, `addJob`,
  `removeJob`, `pauseJob`, `resumeJob` (builders exported on both sides
  for the same reason).

Each region is delimited by `// @begin-sync <name>` /
`// @end-sync <name>` in both files. `--check` hashes the inner lines
(CRLF-normalized sha256) and fails on drift; `--write` propagates
lib → `routines.js` verbatim. `npm test` pins the same hashes
(`copy-identity`, plus the builders region in `routines-view`), so
textual drift breaks both gates.

`requestCronForRoute` is intentionally NOT in a sync region: the lib
takes `host` as a parameter while `routines.js` binds the imported
`host`. Parity is behavioral instead — `tests/sync-semantics.test.mjs`
drives both overloads against a mock host (routing, scoping,
`timeoutMs` positioning, fail-closed errors, both opt-ins) and pins
`assertTimeoutMs` export + behavior on each side.

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
- Remove: two-step inline confirmation (`Remove` → `Confirm remove` /
  `Cancel`, focus moves to Confirm). Never optimistic: the row stays
  visible and busy until the host confirms; focus returns to the
  heading on success, to the status region on failure.
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
contribution (`id: routines`, `path: /routines`, `render:
RoutinesView`). `definePlugin({ component })` stays as entry metadata
plus the release marker pinned by `check-version`; the shipped
Desktop plugins expose pages only through `ROUTES_AREA` render with
no second render of `component`, so keeping both preserves loader
compatibility without a double mount.

The cron builders (`listJobs`, `addJob`, `removeJob`, `pauseJob`,
`resumeJob` plus validators) are verbatim copies of the canonical lib
— `routines.js` cannot import relatively (allowlist) — pinned by the
`cron-shapes-builders` sync region (`sync-shapes` guard plus
`tests/routines-view.test.mjs`).

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
  - `requestCronForRoute(host, null|unscoped, ...)` rejects with
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
- Version pin: `package.json` `version` must equal
  `definePlugin({ version })` in `desktop/routines.js`;
  `node scripts/check-version.mjs` (part of `npm run check`) fails on drift.
  Statically, `PluginDefinition` requires `version: string`, so `tsc`
  fails if the pin is missing or mistyped; equality stays enforced by
  `check-version` + `tests/version-sync.test.mjs`.

## Static contract (checkJs, no runtime deps)

`// @ts-check` + JSDoc typedefs in `desktop/` + `scripts/`, enforced by
`node scripts/check-types.mjs` (`tsc --noEmit` over `jsconfig.json` with
`checkJs` + `strict`, covering `desktop/**/*.js|mjs`,
`scripts/**/*.mjs`, `types/**/*.d.ts`). The gate runs the pinned
TypeScript via npx (`typescript@5.6.3`) so the repo keeps zero
dependencies — no runtime dep, no devDep on `typescript`.

SDK decision (recorded): `@hermes/plugin-sdk` is NOT added as a
devDependency. Verification 2026-09-23: `npm view @hermes/plugin-sdk`
returns 404 on the public registry, so the published package cannot
represent the SDK the Desktop host loads; adding it would be false
safety. The contract instead uses local typedefs in `types/sdk.d.ts`
mirroring the verified loader (`tests/stubs/sdk-stub.mjs`:
`profileRoutes` / `requestProfile` / `request`, `ROUTES_AREA`,
`SIDEBAR_NAV_AREA`, `definePlugin` identity) plus the mount note above
(single `ROUTES_AREA` mount, `component` as entry metadata only).
`types/react.d.ts` and `types/node.d.ts` are permissive ambient stubs
(`any`) so the check pins the SDK/host surface without pulling
`@types/react` / `@types/node`. `tests/types-contract.test.mjs` pins the
wiring (jsconfig flags, typedef names, `@ts-check` presence, no SDK/TS
deps, `npm run check` gate, version typing).

## Reload

After install, reload the desktop profile so the plugin host picks up
`plugins/routines/plugin.js` (restart the desktop app or trigger a
plugin reload for the profile). The Routines page then mounts at
`/routines` with its sidebar row.

## Coexistence

- **Routes, not panes.** Routines mounts one page via `ROUTES_AREA`
  (`id: routines`, `path: /routines`) plus one nav row via
  `SIDEBAR_NAV_AREA` (`id: sidebar-nav`). It never registers the
  `panes` area, so it cannot steal pane layout from other plugins.
- **No collision with `/cron`.** Routines registers only `/routines`;
  it registers no `/cron` path and no `cron` id, so side-by-side
  installs with cron plugins keep working.

## Troubleshooting

- `invalid profile: ...` → profile names allow only letters, digits,
  `.` `_` `-` (max 64). Use `--profile-home` for exotic paths.
- `sha256 mismatch ...` → disk error or the source changed mid-install;
  concurrent installs no longer collide (unique `wx` temp per process),
  so just re-run install and compare hashes manually. The staging temp
  is cleaned up on failure.
- `sync-shapes: drift in ...` → run `node scripts/sync-shapes.mjs --write`.
- `allowlist: ...` → only `@hermes/plugin-sdk` + `react/jsx-runtime`
  (+ pre-approved `react`, `react/jsx-dev-runtime`) and `node:` builtins
  are allowed; `require`/`eval`/`new Function` are banned.
