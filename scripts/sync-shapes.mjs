// Sync check for copy-identity between desktop/lib/cron-shapes.mjs
// (canonical) and desktop/routines.js.
//
// Usage:
//   node scripts/sync-shapes.mjs --check   # exit 1 on drift (CI)
//   node scripts/sync-shapes.mjs --write   # propagate lib -> routines.js
//
// Only node: builtins; no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IDENTITY_FNS = [
  'routeKey',
  'resolveProfileRoute',
  'profileRoute',
  'backendTargetProfile',
  'scopedCronParams',
];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

function extractFunction(src, name) {
  const i = src.indexOf(`function ${name}`);
  if (i === -1) throw new Error(`function ${name} must exist`);
  const p = src.indexOf('(', i);
  let pd = 0;
  let q = -1;
  for (let k = p; k < src.length; k++) {
    if (src[k] === '(') pd++;
    else if (src[k] === ')') {
      pd--;
      if (pd === 0) {
        q = k;
        break;
      }
    }
  }
  if (q === -1) throw new Error(`function ${name} must have balanced params`);
  const j = src.indexOf('{', q);
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') {
      d--;
      if (d === 0) return src.slice(i, k + 1);
    }
  }
  throw new Error(`function ${name} has unbalanced braces`);
}

const mode = process.argv.includes('--write') ? 'write' : 'check';

const libSrc = readFileSync(libPath, 'utf8');
let routinesSrc = readFileSync(routinesPath, 'utf8');
let drift = [];

for (const fn of IDENTITY_FNS) {
  const fromLib = extractFunction(libSrc, fn);
  const fromRoutines = extractFunction(routinesSrc, fn);
  if (fromLib !== fromRoutines) {
    drift.push(fn);
    if (mode === 'write') {
      routinesSrc = routinesSrc.replace(fromRoutines, fromLib);
    }
  }
}

if (mode === 'write') {
  if (drift.length > 0) {
    writeFileSync(routinesPath, routinesSrc);
    process.stdout.write(`sync-shapes: propagated ${drift.join(', ')} lib -> routines.js\n`);
  } else {
    process.stdout.write('sync-shapes: already in sync\n');
  }
} else {
  if (drift.length > 0) {
    for (const fn of drift) console.error(`sync-shapes: drift in ${fn} (run --write)`);
    process.exit(1);
  }
  process.stdout.write(`sync-shapes ok: ${IDENTITY_FNS.length} function(s) identical\n`);
}
