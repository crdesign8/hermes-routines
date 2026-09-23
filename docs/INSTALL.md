# INSTALL — hermes-routines

## Mapping

| Source (repo)         | Destination (profile home)                |
|-----------------------|-------------------------------------------|
| `desktop/routines.js` | `<profile-home>/plugins/routines/plugin.js` |

The plugin folder name equals the registered route id `routines`
(plugin id is `hermes-routines`). The installed file is always named
`plugin.js` and must be byte-identical to `desktop/routines.js`;
`scripts/install.mjs` stages to a temp file, verifies sha256 before and
after an atomic rename, and fails the install on mismatch (no half-copy
is ever left behind).

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

## Checks

```sh
npm test                  # full suite (node:test)
node scripts/check-allowlist.mjs        # import allowlist + require/eval ban (desktop + scripts)
node scripts/sync-shapes.mjs --check    # copy-identity lib -> routines.js
node scripts/check-version.mjs          # package.json version == definePlugin({ version })
npm run check             # all three checks
```

The five pure routing helpers (`routeKey`, `resolveProfileRoute`,
`profileRoute`, `backendTargetProfile`, `scopedCronParams`) are
copy-identical between `desktop/lib/cron-shapes.mjs` (canonical) and
`desktop/routines.js`. Edit the lib, then run
`node scripts/sync-shapes.mjs --write` to propagate.

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
- `sha256 mismatch ...` → disk error or concurrent writer; the temp file
  is cleaned up, just re-run install and compare hashes manually.
- `sync-shapes: drift in ...` → run `node scripts/sync-shapes.mjs --write`.
- `allowlist: ...` → only `@hermes/plugin-sdk` + `react/jsx-runtime`
  (+ pre-approved `react`, `react/jsx-dev-runtime`) and `node:` builtins
  are allowed; `require`/`eval`/`new Function` are banned.
