import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

// Region + hash identity (no JS parsing, no brace counting). The sync
// script owns propagation (lib -> routines.js); this test fails the suite
// on the same drift so `npm test` and `npm run check` agree.
const SYNC_REGIONS = ['cron-shapes-routing', 'cron-shapes-builders'];

function extractRegion(src, name, label) {
  const beginNeedle = `// @begin-sync ${name}`;
  const endNeedle = `// @end-sync ${name}`;
  const beginIdx = src.indexOf(beginNeedle);
  const endIdx = src.indexOf(endNeedle);
  assert.notEqual(beginIdx, -1, `${label}: missing ${beginNeedle}`);
  assert.notEqual(endIdx, -1, `${label}: missing ${endNeedle}`);
  assert.ok(endIdx > beginIdx, `${label}: ${name} end precedes begin`);
  assert.equal(
    src.indexOf(beginNeedle, beginIdx + beginNeedle.length),
    -1,
    `${label}: duplicate ${beginNeedle}`,
  );
  assert.equal(
    src.indexOf(endNeedle, endIdx + endNeedle.length),
    -1,
    `${label}: duplicate ${endNeedle}`,
  );
  const innerStart = src.indexOf('\n', beginIdx) + 1;
  const endLineStart = src.slice(0, endIdx).lastIndexOf('\n') + 1;
  return src.slice(innerStart, endLineStart);
}

function hashRegion(inner) {
  return createHash('sha256').update(inner.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function stripSyncMarkers(source) {
  return source
    .split('\n')
    .filter((line) => !line.includes('@begin-sync') && !line.includes('@end-sync'))
    .join('\n');
}

function extractSpecifiers(source) {
  const found = [];
  const patterns = [
    /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) found.push(m[1]);
  }
  return found;
}

describe('copy-identity', () => {
  it('sync regions are byte-identical with matching sha256 (lib canonical)', () => {
    const a = readFileSync(routinesPath, 'utf8');
    const b = readFileSync(libPath, 'utf8');
    for (const name of SYNC_REGIONS) {
      const fromLib = extractRegion(b, name, 'cron-shapes.mjs');
      const fromRoutines = extractRegion(a, name, 'routines.js');
      assert.equal(
        hashRegion(fromRoutines),
        hashRegion(fromLib),
        `${name} hash mismatch (run node scripts/sync-shapes.mjs --write)`,
      );
      assert.equal(fromRoutines, fromLib, `${name} must be copy-identical`);
    }
  });

  it('both files carry each region marker exactly once', () => {
    const a = readFileSync(routinesPath, 'utf8');
    const b = readFileSync(libPath, 'utf8');
    for (const name of SYNC_REGIONS) {
      for (const [src, label] of [
        [a, 'routines.js'],
        [b, 'cron-shapes.mjs'],
      ]) {
        assert.equal(
          src.split(`// @begin-sync ${name}`).length - 1,
          1,
          `${label} must contain exactly one begin marker for ${name}`,
        );
        assert.equal(
          src.split(`// @end-sync ${name}`).length - 1,
          1,
          `${label} must contain exactly one end marker for ${name}`,
        );
      }
    }
  });

  it('routines.js has no runtime relative import of the lib', () => {
    const src = readFileSync(routinesPath, 'utf8');
    const rel = extractSpecifiers(src).filter(
      (s) => s.startsWith('./') || s.startsWith('../') || s.startsWith('/'),
    );
    assert.deepEqual(rel, [], 'routines.js must use no relative specifiers');
    // Sync markers name the canonical lib; they are comments, not imports.
    // Anything else mentioning the lib file is a forbidden runtime coupling.
    assert.equal(
      stripSyncMarkers(src).includes('cron-shapes'),
      false,
      'routines.js must not reference cron-shapes outside sync markers',
    );
  });

  it('cron-shapes.mjs keeps zero imports (copy target stays dependency free)', () => {
    const src = readFileSync(libPath, 'utf8');
    assert.deepEqual(extractSpecifiers(src), [], 'cron-shapes.mjs must have zero imports');
  });
});
