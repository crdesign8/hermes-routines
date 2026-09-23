import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');

const ALLOWED = new Set([
  '@hermes/plugin-sdk',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]);

function extractBareSpecifiers(source) {
  const found = [];
  const patterns = [
    /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/')) continue;
      found.push(spec);
    }
  }
  return found;
}

describe('allowlist', () => {
  it('routines.js uses only allowed bare specifiers', () => {
    assert.equal(existsSync(routinesPath), true, 'desktop/routines.js must exist');
    const src = readFileSync(routinesPath, 'utf8');
    const bare = extractBareSpecifiers(src);
    for (const spec of bare) {
      assert.equal(ALLOWED.has(spec), true, `disallowed bare specifier: ${spec}`);
    }
  });

  it('routines.js includes both required specifiers', () => {
    const src = readFileSync(routinesPath, 'utf8');
    const bare = new Set(extractBareSpecifiers(src));
    assert.equal(bare.has('@hermes/plugin-sdk'), true, 'missing @hermes/plugin-sdk');
    assert.equal(bare.has('react/jsx-runtime'), true, 'missing react/jsx-runtime');
  });

  it('routines.js has zero relative specifiers', () => {
    const src = readFileSync(routinesPath, 'utf8');
    const rel = [];
    const patterns = [
      /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
      /export\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
          rel.push(spec);
        }
      }
    }
    assert.deepEqual(rel, []);
  });

  it('check-allowlist script passes on the scaffold', async () => {
    const { execFile } = await import('node:child_process');
    const script = path.join(root, 'scripts', 'check-allowlist.mjs');
    assert.equal(existsSync(script), true, 'scripts/check-allowlist.mjs must exist');
    const code = await new Promise((resolve, reject) => {
      execFile('node', [script], { cwd: root }, (err, _stdout, _stderr) => {
        if (err && typeof err.code === 'number') resolve(err.code);
        else if (err) reject(err);
        else resolve(0);
      });
    });
    assert.equal(code, 0, 'check-allowlist must exit 0 on the scaffold');
  });
});
