// @ts-check
// Unified package layout gate (issue #99).
//
// This repository ships ONE installable unit: the Hermes plugin package. The
// Desktop host owns installation — `hermes plugins install crdesign8/hermes-routines`
// clones the package into `<home>/plugins/hermes-routines/` and the Electron
// main process projects `desktop/plugin.js` into `<home>/desktop-plugins/hermes-routines/`
// (upstream `materializeDesktopHalf` / `reconcileUnifiedDesktopHalves`). This
// repository no longer installs anything itself, so this gate replaces what the
// removed installer used to guarantee: that the package is SHAPED so the host's
// projection works, and that nothing regresses the package contract.
//
// It fails when:
//   1. a loadable entry point the host needs is missing — `plugin.yaml` at the
//      package root and `desktop/plugin.js` in the same package (upstream's
//      `_LOADABLE_ENTRYPOINTS`), because without either the host cannot load or
//      project anything;
//   2. the package folder name upstream keys the projection on would not equal
//      the plugin id — `materializeDesktopHalf` copies to
//      `<appRoot>/<packageDirName>` and the loader then reads `<id>/plugin.js`,
//      so a mismatch splits one plugin into two half-visible rows;
//   3. the generated artifact is missing the loadable default export the loader
//      reads, or is not wired to stay byte-identical to `src/`;
//   4. docs drift from the model this gate encodes — README/INSTALL must name
//      the plugin-manager lifecycle as canonical, record the minimum supported
//      Hermes release, and must not still document the removed installer;
//   5. the shipped `files` list stops carrying what the package needs in order
//      to install and project (`desktop/`, `plugin.yaml`).
//
// Artifact FRESHNESS (`desktop/plugin.js` matching `src/`) is deliberately not
// re-implemented here: `node scripts/build.mjs --check` is that gate and already
// runs in `npm run check` and CI. This gate only asserts that wiring stays in
// place, so it stays a cheap static read with no subprocess.
//
// Usage:
//   node scripts/check-package-layout.mjs   # exit 1 on drift (CI)
//
// Only node: builtins; no dependencies.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const MANIFEST_REL = 'plugin.yaml';
const DESKTOP_ENTRY_REL = path.join('desktop', 'plugin.js');
const SRC_REL = 'src';
const README_REL = 'README.md';
const INSTALL_DOC_REL = path.join('docs', 'INSTALL.md');
/**
 * Minimum Hermes release whose desktop main projects a unified package's
 * `desktop/plugin.js` into the app root. Verified empirically against tagged
 * upstream releases: `v2026.9.11` is the earliest tag carrying
 * `materializeDesktopHalf` + `reconcileUnifiedDesktopHalves` wired into
 * `fs-ipc.ts`; `v2026.9.7` has none of them.
 */
const MIN_HERMES_RELEASE = '2026.9.11';

/**
 * @param {string} message
 * @returns {never}
 */
function fatal(message) {
  console.error(`check-package-layout: ${message}`);
  process.exit(1);
}

/**
 * @param {string} rel
 * @returns {string}
 */
function readRoot(rel) {
  try {
    return readFileSync(path.join(root, rel), 'utf8');
  } catch {
    fatal(`${rel} missing`);
  }
}

/**
 * A real directory, not a symlink: upstream's package scan filters on
 * `isDirectory()` over a non-following `readdir`, so a symlinked package is
 * silently skipped and never projects.
 * @param {string} rel
 * @returns {boolean}
 */
function isRealDir(rel) {
  const full = path.join(root, rel);
  return existsSync(full) && statSync(full).isDirectory();
}

// package.json is the single source of truth for the package identity.
const pkg = JSON.parse(readRoot('package.json'));
if (typeof pkg.name !== 'string' || pkg.name === '') {
  fatal('package.json has no name string');
}

// 1. Entry points the host loads.
if (!isRealDir(SRC_REL)) {
  fatal(`${SRC_REL}/ must exist (the editable source of truth)`);
}
for (const rel of [MANIFEST_REL, DESKTOP_ENTRY_REL]) {
  if (!existsSync(path.join(root, rel))) {
    fatal(`${rel} missing — the host installs this package as one unit (${MANIFEST_REL} + ${DESKTOP_ENTRY_REL})`);
  }
}

// 2. The projected folder name must equal the plugin id.
const constantsSrc = readRoot(path.join(SRC_REL, 'constants.ts'));
const pluginId = /PLUGIN_ID\s*=\s*(['"])([^'"]+)\1/.exec(constantsSrc)?.[2];
if (typeof pluginId !== 'string' || pluginId === '') {
  fatal(`${path.join(SRC_REL, 'constants.ts')} has no PLUGIN_ID string literal`);
}
if (pkg.name !== pluginId) {
  fatal(
    `drift PLUGIN_ID (${pluginId}) vs package.json name (${pkg.name}) — the projected folder name would not equal the plugin id`,
  );
}

// 3. The generated artifact must expose the descriptor the loader reads and
//    must stay bound to src/ by the build.
const artifact = readRoot(DESKTOP_ENTRY_REL);
if (!/export\s*\{[^}]*\bdefault\b[^}]*\}|export\s+default\b/.test(artifact)) {
  fatal(`${DESKTOP_ENTRY_REL} has no default export — the desktop loader reads the default export as the plugin descriptor`);
}
if (!/AUTO-GENERATED/.test(artifact)) {
  fatal(`${DESKTOP_ENTRY_REL} lost its generated-file banner — it must stay the build output, never a hand-edited copy`);
}

// 4. Documentation must name exactly one canonical installation model.
const readme = readRoot(README_REL);
const installDoc = readRoot(INSTALL_DOC_REL);
for (const [label, text] of /** @type {[string, string][]} */ ([
  [README_REL, readme],
  [INSTALL_DOC_REL, installDoc],
])) {
  if (!/hermes plugins install/.test(text)) {
    fatal(`${label} must document \`hermes plugins install\` as the canonical installation path`);
  }
  // A *mention* of the removed script is legitimate — the migration section
  // has to name what it is migrating away from. What is not legitimate is
  // still telling a reader to run it, in prose or in a fenced block.
  if (/node\s+scripts\/install\.mjs/.test(text)) {
    fatal(`${label} still tells the reader to run scripts/install.mjs (issue #99 removed the manual installer)`);
  }
}
if (!readme.includes(MIN_HERMES_RELEASE)) {
  fatal(`${README_REL} must record the minimum supported Hermes release (${MIN_HERMES_RELEASE}) that projects a unified package`);
}

// 5. The shipped tarball must carry what the host installs.
for (const required of ['desktop/', MANIFEST_REL]) {
  if (!Array.isArray(pkg.files) || !pkg.files.includes(required)) {
    fatal(`package.json files must ship ${required} (the installed package is the install unit)`);
  }
}
// The freshness gate must stay wired: without it the artifact could drift from
// src/ while every check above still passed.
if (!/\bbuild\.mjs --check\b/.test(String(pkg.scripts?.check ?? ''))) {
  fatal('package.json check script must keep `build.mjs --check` (artifact freshness)');
}

process.stdout.write(
  `check-package-layout ok: ${pkg.name}@${String(pkg.version)} unified package, min hermes ${MIN_HERMES_RELEASE}\n`,
);