import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const libPath = path.join(root, 'desktop', 'lib', 'cron-shapes.mjs');

// Phase 3: lib sharing is copy-identity only. The pure routing helpers are
// duplicated verbatim between desktop/routines.js and
// desktop/lib/cron-shapes.mjs; there is no runtime import between them.
// requestCronForRoute is excluded: it binds `host` differently on each side
// (imported host vs host parameter) as required by the bare-only /
// zero-import constraints.
const IDENTITY_FNS = [
  'routeKey',
  'resolveProfileRoute',
  'profileRoute',
  'backendTargetProfile',
  'scopedCronParams',
];

function extractFunction(src, name) {
  const i = src.indexOf(`function ${name}`);
  assert.notEqual(i, -1, `function ${name} must exist`);
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
  assert.notEqual(q, -1, `function ${name} must have balanced params`);
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
  it('pure routing helpers are byte-identical copies (extract-and-diff)', () => {
    const a = readFileSync(routinesPath, 'utf8');
    const b = readFileSync(libPath, 'utf8');
    for (const fn of IDENTITY_FNS) {
      assert.equal(extractFunction(b, fn), extractFunction(a, fn), `${fn} must be copy-identical`);
    }
  });

  it('routines.js has no runtime relative import of the lib', () => {
    const src = readFileSync(routinesPath, 'utf8');
    const rel = extractSpecifiers(src).filter(
      (s) => s.startsWith('./') || s.startsWith('../') || s.startsWith('/'),
    );
    assert.deepEqual(rel, [], 'routines.js must use no relative specifiers');
    assert.equal(src.includes('cron-shapes'), false, 'routines.js must not reference cron-shapes');
  });

  it('cron-shapes.mjs keeps zero imports (copy target stays dependency free)', () => {
    const src = readFileSync(libPath, 'utf8');
    assert.deepEqual(extractSpecifiers(src), [], 'cron-shapes.mjs must have zero imports');
  });
});
