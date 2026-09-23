// @ts-check
// Version sync check: package.json <-> the `version` field of the
// GENERATED desktop/plugin.js.
//
// scripts/build.mjs injects the package.json version (esbuild `define`),
// so package.json is the single source of truth and the artifact can only
// drift if someone edits it by hand — which this gate rejects together
// with a missing or duplicated version pin.
//
// Usage:
//   node scripts/check-version.mjs   # exit 1 on drift (CI)
//
// Only node: builtins; no dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ARTIFACT = path.join(root, 'desktop', 'plugin.js');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (typeof pkg.version !== 'string' || !pkg.version) {
  console.error('check-version: package.json has no version string');
  process.exit(1);
}

let artifact;
try {
  artifact = readFileSync(ARTIFACT, 'utf8');
} catch {
  console.error('check-version: desktop/plugin.js missing — run: npm run build');
  process.exit(1);
}

const pins = [...artifact.matchAll(/\bversion:\s*(['"])([^'"]+)\1/g)];
if (pins.length === 0) {
  console.error('check-version: no version field found in the generated artifact');
  process.exit(1);
}
if (pins.length > 1) {
  console.error(`check-version: expected exactly one version field, found ${pins.length}`);
  process.exit(1);
}
const first = pins.at(0);
const found = first?.[2];
if (typeof found !== 'string') {
  console.error('check-version: malformed version field in the generated artifact');
  process.exit(1);
}
if (found !== pkg.version) {
  console.error(`check-version: drift package.json (${pkg.version}) vs artifact (${found})`);
  process.exit(1);
}

process.stdout.write(`check-version ok: ${pkg.version}\n`);
