// @ts-check
// Sync check for copy-identity between desktop/lib/cron-shapes.mjs
// (canonical) and desktop/routines.js.
//
// Identity is by marked region + deterministic hash, never by parsing
// JavaScript. Each synced block is delimited by:
//
//   // @begin-sync <region>
//   ... verbatim lines (canonical in the lib) ...
//   // @end-sync <region>
//
// Regions (lib -> routines.js, verbatim including `export` keywords):
//   - cron-shapes-routing  (routeKey, resolveProfileRoute, profileRoute,
//     backendTargetProfile, scopedCronParams + assertRoutingOptions,
//     assertTimeoutMs)
//   - cron-shapes-builders (MAX_* consts + assertJobId, assertSchedule,
//     assertPayload, cloneValue, listJobs, addJob, removeJob, pauseJob,
//     resumeJob)
//
// Usage:
//   node scripts/sync-shapes.mjs --check   # exit 1 on drift (CI)
//   node scripts/sync-shapes.mjs --write   # propagate lib -> routines.js
//
// Hash algorithm: sha256 over the region inner text (the lines strictly
// between the marker lines) after normalizing CRLF -> LF. The markers
// themselves are not hashed. --check compares hash(lib region) against
// hash(routines region); --write replaces the routines inner text with
// the lib inner text verbatim.
//
// Only node: builtins; no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SYNC_REGIONS = ['cron-shapes-routing', 'cron-shapes-builders'];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

/**
 * @param {string} src
 * @param {string} needle
 * @returns {number}
 */
function countOccurrences(src, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = src.indexOf(needle, from);
    if (i === -1) return count;
    count += 1;
    from = i + needle.length;
  }
}

/**
 * @param {string} src
 * @param {string} name
 * @param {string} label
 * @returns {{ inner: string, innerStart: number, endLineStart: number, endLineEnd: number }}
 */
function extractRegion(src, name, label) {
  const beginNeedle = `// @begin-sync ${name}`;
  const endNeedle = `// @end-sync ${name}`;
  const beginCount = countOccurrences(src, beginNeedle);
  const endCount = countOccurrences(src, endNeedle);
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(
      `${label}: region ${name} must have exactly one begin and one end marker ` +
        `(found begin x${beginCount}, end x${endCount})`,
    );
  }
  const beginIdx = src.indexOf(beginNeedle);
  const endIdx = src.indexOf(endNeedle);
  if (endIdx < beginIdx) {
    throw new Error(`${label}: region ${name} end marker precedes begin marker`);
  }
  const beginLineEnd = src.indexOf('\n', beginIdx);
  if (beginLineEnd === -1) {
    throw new Error(`${label}: region ${name} begin marker has no trailing newline`);
  }
  const innerStart = beginLineEnd + 1;
  const endLineStart = src.slice(0, endIdx).lastIndexOf('\n') + 1;
  const endLineEndIdx = src.indexOf('\n', endIdx);
  const endLineEnd = endLineEndIdx === -1 ? src.length : endLineEndIdx + 1;
  const inner = src.slice(innerStart, endLineStart);
  return { inner, innerStart, endLineStart, endLineEnd };
}

/**
 * @param {string} inner
 * @returns {string}
 */
function hashRegion(inner) {
  const normalized = inner.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

const mode = process.argv.includes('--write') ? 'write' : 'check';

const libSrc = readFileSync(libPath, 'utf8');
let routinesSrc = readFileSync(routinesPath, 'utf8');
const drift = [];

for (const name of SYNC_REGIONS) {
  const fromLib = extractRegion(libSrc, name, 'cron-shapes.mjs');
  const fromRoutines = extractRegion(routinesSrc, name, 'routines.js');
  const libHash = hashRegion(fromLib.inner);
  const routinesHash = hashRegion(fromRoutines.inner);
  if (libHash !== routinesHash) {
    drift.push({ name, libHash, routinesHash });
    if (mode === 'write') {
      routinesSrc =
        routinesSrc.slice(0, fromRoutines.innerStart) +
        fromLib.inner +
        routinesSrc.slice(fromRoutines.endLineStart);
    }
  } else if (mode === 'check') {
    process.stdout.write(`sync-shapes ok: ${name} ${libHash.slice(0, 12)}\n`);
  }
}

if (mode === 'write') {
  if (drift.length > 0) {
    writeFileSync(routinesPath, routinesSrc);
    for (const d of drift) {
      process.stdout.write(
        `sync-shapes: propagated ${d.name} lib -> routines.js (${d.routinesHash.slice(0, 12)} -> ${d.libHash.slice(0, 12)})\n`,
      );
    }
  } else {
    process.stdout.write('sync-shapes: already in sync\n');
  }
} else {
  if (drift.length > 0) {
    for (const d of drift) {
      console.error(
        `sync-shapes: drift in ${d.name} (lib ${d.libHash.slice(0, 12)} != routines ${d.routinesHash.slice(0, 12)}, run --write)`,
      );
    }
    process.exit(1);
  }
  process.stdout.write(`sync-shapes ok: ${SYNC_REGIONS.length} region(s) identical\n`);
}
