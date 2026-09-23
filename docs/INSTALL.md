# INSTALL — hermes-routines

## Mapping

| Source (repo)         | Destination (profile home)                |
|-----------------------|-------------------------------------------|
| `desktop/routines.js` | `<profile-home>/plugins/routines/plugin.js` |

The plugin folder name equals the registered route id `routines`
(plugin id is `hermes-routines`). The installed file is always named
`plugin.js` and must be byte-identical to `desktop/routines.js`;
`scripts/install.mjs` verifies this with a sha256 comparison after copy
and fails the install on mismatch.

## Profile home resolution

Precedence (first match wins):

1. `--profile-home=<dir>` CLI flag.
2. `HERMES_PROFILE_HOME` environment variable.
3. `~/.hermes/profiles/<profile>`, where `<profile>` is `--profile=<name>`,
   else `HERMES_PROFILE`, else `default`.

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
