// @ts-check
// Static contract gate: `tsc --noEmit` over jsconfig.json (checkJs).
//
// Covers desktop/ + scripts/ (see jsconfig.json include). Runs the pinned
// TypeScript via npx so the repo keeps zero dependencies (scaffold test
// pins no dependencies/devDependencies): no runtime dep, no devDep on
// typescript or @hermes/plugin-sdk.
//
// Usage:
//   node scripts/check-types.mjs   # exit 1 on type errors (CI)
//
// Only node: builtins; zero relative imports, zero bare specifiers.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned for reproducibility: bump deliberately, then re-run `npm run check`.
export const TYPESCRIPT_PIN = '5.6.3';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const out = run('npx', ['--yes', '-p', `typescript@${TYPESCRIPT_PIN}`, 'tsc', '--noEmit', '-p', 'jsconfig.json']);
    if (out && out.trim()) process.stdout.write(out);
    process.stdout.write(`check-types ok: tsc --noEmit (typescript@${TYPESCRIPT_PIN})\n`);
  } catch (/** @type {any} */ err) {
    const stdout = err && err.stdout ? String(err.stdout) : '';
    const stderr = err && err.stderr ? String(err.stderr) : '';
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
    else if (err && err.message) process.stderr.write(`check-types: ${err.message}\n`);
    process.exit(1);
  }
}
