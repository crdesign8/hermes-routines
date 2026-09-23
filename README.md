# hermes-routines

Standalone Hermes Desktop plugin: a **Routines** page (`/routines` + sidebar row)
backed by per-profile `cron.manage` routing. Zero runtime dependencies.

- `desktop/routines.js` — plugin entry (installed byte-identical as `plugin.js`).
- `desktop/lib/cron-shapes.mjs` — canonical cron action shapes (list/add/remove/pause/resume)
  plus pure profile-routing helpers; zero imports.
- `scripts/install.mjs` — atomic installer with sha256 verification.
- `scripts/check-allowlist.mjs` — import allowlist + `require`/`eval` ban.
- `scripts/sync-shapes.mjs` — copy-identity guard lib → `routines.js`.
- `docs/INSTALL.md` — mapping, profile resolution, checks, troubleshooting.

## Quick start

```sh
npm test
npm run check
node scripts/install.mjs --profile=default
```

Requires Node `>=20` (see `engines`).
