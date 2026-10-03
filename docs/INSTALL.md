# INSTALL — hermes-routines

## One package, one install root

There is exactly one installation model. `hermes-routines` is a **unified
Hermes plugin package**: `plugin.yaml` and `desktop/plugin.js` live in the same
repository and are installed together by the Hermes plugin manager. Nothing in
this repository installs anything by itself.

```sh
hermes plugins install crdesign8/hermes-routines
```

What happens, and who owns each step:

| Step | Owner | What it does |
|---|---|---|
| Install | `hermes plugins install` (host) | clones/updates the package at `<home>/plugins/hermes-routines/` and writes the provenance record in `plugins/.install-metadata.json` |
| Enable | `hermes plugins enable` / Capabilities → Plugins | the desktop half is **opt-in** (`defaultEnabled: false`); it inventories immediately and stays disabled until the user toggles it |
| Project | Desktop Electron main (host) | copies `desktop/plugin.js` into `<home>/desktop-plugins/hermes-routines/plugin.js` beside a `.hermes-package.json` marker, and re-copies whenever the source changes |
| Load / hot reload | Desktop runtime (host) | loads the projected file through the same pipeline as any disk plugin, watching it for changes |

`plugin.yaml` and `desktop/plugin.js` are NOT two installations. The manifest
is the agent half (distribution metadata for catalog/registry validation) and
`desktop/plugin.js` is the desktop half; the host projects the latter out of
the same folder. There is no second install root to keep in sync and no second
supported way to install.

## The projection, and where the app root comes from

| Source (repo) | Projected to (app root) |
|---|---|
| `desktop/plugin.js` | `<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` |

`<HERMES_HOME>` is the **app home** — `~/.hermes` by default, or whatever home
the Desktop window is pointed at. The projected folder name equals the plugin
id `hermes-routines`, which is what the host loader requires (the folder name
must match the descriptor's `id`).

The projection is a **copy**, and that is deliberate: it is what makes the
desktop half app-level. It exists once, however many profiles carry the package,
and it never appears or disappears when the profile selector changes. Upstream
stamps a `.hermes-package.json` marker into the projected folder recording the
package name and its origin; that marker is what lets the Plugins page pair the
desktop half back to the agent package and refresh it. **Do not hand-edit the
projected file** — the next reconcile replaces it. A `desktop-plugins/` folder
without a marker that does contain a `plugin.js` is treated upstream as a
standalone plugin you installed by hand and is never overwritten.

Verify a projection by hash, if you want to:

```sh
sha256sum desktop/plugin.js \
  "$HERMES_HOME/desktop-plugins/hermes-routines/plugin.js"
```

The two hashes must match. This is a **verification**, not an install step —
the host did the copy.

## Minimum supported Hermes release

The unified package model requires a Desktop host that projects
`plugins/<id>/desktop/plugin.js` into the app root:

| Field | Value |
|---|---|
| Minimum release | **`2026.9.11`** (upstream tag `v2026.9.11`) |
| What it added | `materializeDesktopHalf` + `reconcileUnifiedDesktopHalves` in `apps/desktop/electron/desktop-plugins-root.ts`, wired into `fs-ipc.ts` |

Verified by probing every tagged upstream release: `v2026.9.11` is the earliest
tag carrying that projection; `v2026.9.7` has none of it. On a host older than
that, `hermes plugins install` still installs the agent half, but nothing
projects the desktop half and the Routines page never appears. Check with
`hermes --version`. The plugin's SDK-side contract is pinned separately in
[`docs/SDK-BASELINE.md`](SDK-BASELINE.md).

## Update

```sh
hermes plugins update hermes-routines
```

Update is a pull of the tracked install. The host then refreshes the projected
copy on the next root resolution (or **Rescan** in the Plugins page); the app
picks it up through the same hot-reload path as any save. There is no version
check or migration step here: the plugin file carries no local state (jobs live
in the backend via `cron.manage`), so the newer `desktop/plugin.js` is the whole
upgrade.

If you installed from a clone you made yourself (no provenance record), adopt it
once and it becomes a normal tracked install with `update`:

```sh
hermes plugins adopt hermes-routines
```

## Uninstall

```sh
hermes plugins remove hermes-routines
```

This removes the package folder. The host drops the projected desktop half on
the next reconcile because its marker records a source that no longer exists —
**do not delete `desktop-plugins/hermes-routines/` by hand**, and never remove
the shared `desktop-plugins/` root, which other plugins share. Uninstalling this
plugin does not delete routines stored by the Hermes host; manage those through
the host's own cron interface.

## Development fallback (and its limit)

Developers who want to exercise a local checkout in the app can clone it into a
scratch home and let the host do the work:

```sh
# a throwaway home, so the real one is untouched
export HERMES_HOME="$PWD/.hermes-dev"
hermes plugins adopt hermes-routines   # after cloning into $HERMES_HOME/plugins/
```

Then `npm run build` and trigger a **Rescan** (or reload the window) to refresh
the projected copy.

The limit, verified against the host's own package scan: **a symlinked
`plugins/<id>` is skipped.** The reconciler enumerates package folders with a
non-following directory filter, so a symlink into your working tree never
projects and produces a silent no-op. Use a real clone (or a copy) inside the
scratch home; a bind mount is fine.

This is a development convenience only. It is not a supported installation
path, it is not covered by any stability promise, and it does not create a
second install root — the scratch home is simply a throwaway `HERMES_HOME`.

## Migrating from the manual installer (removed)

Releases before this change shipped `scripts/install.mjs`, a hand-rolled
installer that copied `desktop/plugin.js` into
`<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` with its own sha256
verification, staging, backup and rollback. That script is **removed**: it
duplicated package-manager responsibilities the host now owns, and a projected
folder the host manages would fight it.

There is nothing to migrate *to* — installing via `hermes plugins install` is
already the documented path, and the desktop half is identical either way. To
clean up an old manual install:

1. `hermes plugins install crdesign8/hermes-routines` (or keep your existing
   package install).
2. Remove any leftover hand-installed folder that has no
   `.hermes-package.json` marker **and** whose `plugin.js` is not
   byte-identical to your package's `desktop/plugin.js` — the host treats a
   marker-less folder with differing bytes as yours and never overwrites it, so
   it would shadow the managed projection. Delete the whole
   `desktop-plugins/hermes-routines/` folder and let the host re-project.

An even older pre-#14 layout installed per profile at
`<profile-home>/plugins/routines/plugin.js`. The Desktop loader reads only the
app-level root, so such a file no longer loads. Delete it for every profile
that has one, then install through the plugin manager.

## Checks

```sh
npm test                            # full suite (node:test)
npm run typecheck                   # tsc --noEmit (strict, src/ + scripts/)
npm run check:allowlist             # import allowlist + require/eval ban
npm run check:version               # package.json version == descriptor version
npm run check:manifest              # package.json == plugin.yaml == src/constants.ts == desktop/plugin.js
npm run check:sdk-baseline          # SDK contract vs sdk-baseline.json
npm run check:package-layout        # unified package shape the host installs
npm run build -- --check            # desktop/plugin.js is fresh (npm run check-generated)
npm run check                       # all gates above
```

`npm run check:package-layout` is what replaces the removed installer's
guarantees: it asserts the entry points the host loads are present, that the
projected folder name would equal the plugin id, that the generated artifact
still exposes the default export the loader reads, and that README/INSTALL name
the plugin-manager lifecycle and the minimum supported release. Freshness of
`desktop/plugin.js` against `src/` stays `node scripts/build.mjs --check`.

## Single source of truth

`package.json` is the single source of truth: `name` / `version` /
`description` must match across `package.json`, `plugin.yaml`,
`src/constants.ts` (`PLUGIN_ID`) and the `desktop/plugin.js` descriptor
(`description`, `defaultEnabled: false` opt-in, `version` pin), with
`provides_tools: []` / `provides_hooks: []` declared explicitly empty.
`node scripts/check-manifest.mjs` (part of `npm run check`, pinned by
`tests/manifest-sync.test.mjs`) fails on any drift.

## Development

`src/**/*.ts(x)` is the only editable source. `desktop/plugin.js` is
produced by `node scripts/build.mjs` (esbuild, deterministic output,
externals `@hermes/plugin-sdk` / `react` / `react/jsx-runtime`,
non-minified) and carries an `AUTO-GENERATED — DO NOT EDIT` banner.
There is no mirrored copy anywhere: the former
`desktop/lib/cron-shapes.mjs` + `sync-shapes` copy-identity guard are
gone. `requestCronForRoute` behavior (routing, scoping, `timeoutMs`
positioning, `spawnPriority` dial options, fail-closed errors, opt-ins)
is pinned against the shipped artifact by `tests/gateway-semantics.test.mjs`
with the SDK face stubbed.

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

Affordance (issue #79): the primary creation action paints the words
*New routine* beside its glyph instead of being a bare `+`, and its
accessible name is derived from that visible text (no competing
`aria-label`). Icon-only row controls keep per-row accessible names
(*Pause <routine>*, *Show details for <routine>*) plus a tooltip, and
their targets are 28x28 CSS px around a 13px glyph — over the WCAG 2.2
minimum of 24x24 — while the row stays exactly as compact as issue #77
made it. The filter chips are 28px tall with 6px side padding, the search
box and its clear control are 28px and 24px, and the labeled primary
action keeps a 32px minimum height. Every filter chip carries its own
count (`All 15 / Active 10 / Paused 5`), computed over the SEARCH matches
with no status filter applied, so each chip reports what it would really
open; the count is announced once through the chip's accessible name and
the settled count is still announced by the polite live region, so no
number is both painted twice and read twice. The redundant *Showing all
N routines.* toolbar line is removed entirely.

Runtime health (issue #80): lifecycle and execution health are separate
dimensions, and the health one is modeled on its own in
`src/domain/attention.ts`. The chips still answer "can this routine
fire?"; the needs-attention band answers "is this routine working?".

- Precedence, decided once: an unaddressable row (no `job_id`) → never
  qualifies, since the focus is keyed on `job_id` and a number must not
  promise a row the *Show them* control cannot reveal; completed → never
  qualifies; lifecycle `error` → qualifies (an explicit current claim,
  even with a successful last run, and even while paused — resuming a
  broken job does not fix it); a recorded success → clears the state,
  so the `last_fire_error` / `last_stderr` / `last_exit_code` left by
  the run that failed cannot repaint a healthy routine; paused → a
  pre-pause failure is history and does not qualify; a failed status
  token on a live routine → qualifies; anything else (never ran, or a
  token this plugin does not read as failure) → does not qualify.
  Unknown is not failure.
- The band renders `null` at a zero count, so a healthy list has no
  empty warning section at all — it is not a fourth permanent tab. A
  page whose only failure is a paused one is therefore quiet; the
  history is still on the row.
- It is a `role="status"` band, not a `role="alert"`: a failing routine
  is work to get through, not a blocked operation. The count is painted
  text and the glyph is `aria-hidden`, so the state is never carried by
  color alone. Both band states share `ATTENTION_BAND_ID` and a
  `tabIndex={-1}` focus target.
- *Show them* dispatches an attention focus keyed on canonical `job_id`s
  (never a display name). The focus intersects the lifecycle filter
  rather than replacing it, is re-derived on every `list-loaded` so a
  recovered or vanished routine drops out, and is released entirely when
  no target survives. Choosing a lifecycle chip releases it too. The
  only empty state a live focus can still reach is a search that no
  longer covers a failing routine, and it names the search rather than
  blaming the filter.
- The focus bar counts the rows actually on screen, not the size of
  the focus, so a narrowing search cannot announce three rows above a
  list holding one. Entering or leaving a focus swaps the band for its
  other state, which unmounts the pressed control, so focus is handed to
  the replacement band on the next tick (`focusById(ATTENTION_BAND_ID)`).
- Paused failures are named on the page when the band is shown ("1
  paused routine also failed before it was paused") and the row always
  states its own failure, so excluding them from the count is visible
  rather than silent.

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

- Identity: `job_id` is the only mutation identity. Pause, resume and
  remove address a routine by its trimmed `job_id`
  (`^[A-Za-z0-9._:-]+$`, max 128 chars); a row without a usable id fails
  closed (transitional rows render, but their mutation controls stay
  disabled and the builder raises `TypeError`) instead of falling back to
  the display name. `name` is presentation text (trimmed, max 128 chars,
  no control characters) — spaces, accents and `[bot:...]` prefixes are
  legal there.
- Create follows the upstream `cron.manage add` contract: the user
  supplies `name`, `schedule` and `prompt`; Hermes generates the `job_id`.
  Creating a routine on hold pauses the row the backend just minted, using
  the `job_id` from the add answer — never the submitted title.
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
  `allowUnscoped` must be booleans when present, and `spawnPriority` must
  be `'foreground'` or `'background'`.
- `spawnPriority: 'foreground'` marks a call as a user action and rides
  `host.requestProfile`'s 5th argument, so a cold-started profile backend
  takes the pool's reserved interactive slot instead of waiting out the
  30s background slot. Pause, resume and create pass it; the list load
  keeps the background default (polling). The active gateway door has no
  options bag, so combining it with `allowActiveDoor` rejects instead of
  silently dropping the intent.
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
devDependency. Verification 2026-10-03: `npm view @hermes/plugin-sdk`
returns 404 on the public registry, so the published package cannot
represent the SDK the Desktop host loads; adding it would be false
safety. The contract instead uses the local shim
`src/types/plugin-sdk.d.ts`, which is deliberately minimal and bound to
`sdk-baseline.json` — the machine-readable record of the upstream
symbols this repository consumes (`NousResearch/hermes-agent`
`apps/desktop/src/sdk/index.ts` at the pinned commit). The ruling gate is
`node scripts/check-sdk-baseline.mjs` (part of `npm run check`):
`tests/stubs/sdk-stub.mjs` mirrors the same surface (`profileRoutes` /
`requestProfile` / `request`, `ROUTES_AREA`, `SIDEBAR_NAV_AREA` — no
`definePlugin`, which does not exist upstream) plus the mount note above
(single `ROUTES_AREA` mount, descriptor as entry metadata only).
`typescript`, `esbuild`, `@types/node` and `@types/react` are
devDependencies only — no runtime dep. `tests/types-contract.test.mjs`
pins the wiring (tsconfig flags, shim names, `@ts-check` presence, no
SDK/runtime deps, `npm run check` gates, version typing) and
`tests/sdk-baseline.test.mjs` pins the compatibility baseline
(documentation, exact exported/consumed surfaces, and fail-closed
behaviour on a new SDK symbol). See `docs/SDK-BASELINE.md` for the pinned
upstream reference and the refresh procedure.

## Reload

After installing, go to Capabilities → Plugins and enable hermes-routines
(opt-in, `defaultEnabled: false`; it does not self-enable), then trigger a
runtime plugin reload — the app watches the projected folder and hot-reloads
each save, and ⌘K → **Reload desktop plugins** forces it. The Routines page
mounts at `/routines` with its sidebar row, and stays mounted whichever
profile or gateway the window is pointed at.

## Coexistence

- **Routes, not panes.** Routines mounts one page via `ROUTES_AREA`
  (`id: routines`, `path: /routines`) plus one nav row via
  `SIDEBAR_NAV_AREA` (`id: sidebar-nav`). It never registers the
  `panes` area, so it cannot steal pane layout from other plugins.
- **No collision with `/cron`.** Routines registers only `/routines`;
  it registers no `/cron` path and no `cron` id, so side-by-side
  installs with cron plugins keep working.
- **Shared app root.** Every desktop plugin projects into the same
  `<HERMES_HOME>/desktop-plugins/<id>/`, keyed by plugin id, so adding
  or removing this package never touches another plugin's folder.

## Troubleshooting

- **`plugin.yaml missing required field` / plugin never appears in
  Capabilities → Plugins:** confirm the install is through
  `hermes plugins install crdesign8/hermes-routines` and that
  `<home>/plugins/hermes-routines/plugin.yaml` exists. Run
  `hermes plugins validate <path>` for the host's own admission report.
- **The agent half installs but the Routines page never appears:** the
  host is older than `2026.9.11` (no unified-package projection) or the
  desktop half is still disabled. Check `hermes --version` and the
  plugin's toggle in Capabilities → Plugins.
- **A symlinked checkout in `plugins/<id>` does nothing:** the host's
  package scan skips symlinked folders by design. Clone (or copy) a real
  directory into the home — see Development fallback above.
- **The Routines page serves older bytes:** something hand-installed a
  marker-less `desktop-plugins/hermes-routines/` with different content,
  which the host deliberately never overwrites. Delete that folder and
  let the host re-project.
- **`build: desktop/plugin.js is stale` → run `npm run build` after
  editing `src/` (freshness gate compares hashes).
- **`check-package-layout:` →** run the gate for the exact message; it
  names the entry point, the id drift, or the doc that drifted from the
  unified package model.
- **`allowlist: ...` →** only `@hermes/plugin-sdk` + `react/jsx-runtime`
  (+ pre-approved `react`, `react/jsx-dev-runtime`) and `node:` builtins
  are allowed; `require`/`eval`/`new Function` are banned.