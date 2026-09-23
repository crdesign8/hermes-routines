# hermes-routines

Standalone Hermes Desktop plugin: a **Routines** page (`/routines` + sidebar row)
backed by per-profile `cron.manage` routing. Zero runtime dependencies.

## Layout

- `src/` — TypeScript source of truth (edit here):
  - `src/plugin.tsx` — plugin descriptor + `register` (routes + sidebar contributions).
  - `src/views/` — `RoutinesPage` and its view components (React/TSX).
  - `src/state/`, `src/domain/`, `src/gateway/`, `src/lib/` — reducer, pure
    shapes/routing, host gateway, error wrapping.
  - `src/types/plugin-sdk.d.ts` — local shim for `@hermes/plugin-sdk`
    (unpublished — npm 404; verified against the Desktop loader).
- `desktop/plugin.js` — **generated** artifact (`AUTO-GENERATED — DO NOT EDIT`),
  installed byte-identical as `plugin.js`. Produced by `scripts/build.mjs`
  (esbuild; externals: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`;
  non-minified and deterministic).
- `scripts/build.mjs` — build + `--check` freshness gate (fails if the
  artifact drifted from `src/`).
- `scripts/install.mjs` — atomic installer with sha256 verification.
- `scripts/check-allowlist.mjs` — import allowlist + `require`/`eval` ban
  over `src/` + `desktop/`.
- `scripts/check-version.mjs` — `package.json` version == descriptor
  version in `desktop/plugin.js`.
- `docs/INSTALL.md` — mapping, profile resolution, checks, troubleshooting.

`typescript` and `esbuild` live in `devDependencies` (build/typecheck only);
the shipped plugin imports nothing beyond the SDK/React externals.

## Quick start

```sh
npm install          # dev tooling only (no runtime deps)
npm run build        # regenerate desktop/plugin.js from src/
npm test
npm run check        # typecheck + allowlist + version + freshness
node scripts/install.mjs --profile=default
```

Requires Node `>=20` (see `engines`).
