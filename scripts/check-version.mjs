// @ts-check
// Version sync check: package.json <-> definePlugin({ version }) in
// desktop/routines.js.
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

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (typeof pkg.version !== 'string' || !pkg.version) {
  console.error('check-version: package.json has no version string');
  process.exit(1);
}

const routinesSrc = readFileSync(path.join(root, 'desktop', 'routines.js'), 'utf8');
const match = routinesSrc.match(/definePlugin\(\{[^}]*?version:\s*['"]([^'"]+)['"]/s);
if (!match) {
  console.error('check-version: version not found in definePlugin({ version })');
  process.exit(1);
}

if (pkg.version !== match[1]) {
  console.error(`check-version: drift package.json (${pkg.version}) vs routines.js (${match[1]})`);
  process.exit(1);
}

process.stdout.write(`check-version ok: ${pkg.version}\n`);
