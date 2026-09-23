// Build-time constant injected by scripts/build.mjs (esbuild `define`).
// The identifier is replaced with the package.json version literal, so the
// generated desktop/plugin.js carries the release pin while package.json
// stays the single source of truth (scripts/check-version.mjs fails on
// drift between the two).
declare const __PLUGIN_VERSION__: string;
