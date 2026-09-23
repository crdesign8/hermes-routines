// @ts-check
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Allowlist for plugin runtime files (desktop/).
// Currently used: '@hermes/plugin-sdk' + 'react/jsx-runtime'.
// 'react' (bare) and 'react/jsx-dev-runtime' are pre-approved for future
// component work and dev builds so adding them later needs no tooling
// change; REQUIRED below pins what must be present today.
const ALLOWED = new Set([
  '@hermes/plugin-sdk',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]);

const REQUIRED = ['@hermes/plugin-sdk', 'react/jsx-runtime'];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// Plugin runtime code (desktop) plus installer scripts. Tests are
// intentionally excluded: they run under node:test with node: builtins.
const SCAN_DIRS = [path.join(root, 'desktop'), path.join(root, 'scripts')];

const MAX_DEPTH = 25;

/**
 * @param {string} dir
 * @param {number} [depth]
 * @param {Set<string>} [seen]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectJsFiles(dir, depth = 0, seen = new Set(), out = []) {
  if (depth > MAX_DEPTH) {
    throw new Error(`max scan depth exceeded at ${dir}`);
  }
  let real = dir;
  try {
    real = path.resolve(dir);
  } catch {
    // keep original
  }
  if (seen.has(real)) return out;
  seen.add(real);
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      throw new Error(`symlink not allowed in scanned tree: ${path.relative(root, full)}`);
    }
    if (st.isDirectory()) {
      collectJsFiles(full, depth + 1, seen, out);
    } else if (/\.m?js$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function extractSpecifiers(source) {
  const found = [];
  const patterns = [
    /import\s+(?:[^'\"]*?\sfrom\s+)?['\"]([^'\"]+)['\"]/g,
    /export\s+[^'\"]*?\sfrom\s+['\"]([^'\"]+)['\"]/g,
    /import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      found.push(m[1]);
    }
  }
  return found;
}

// Patterns the specifier allowlist cannot see: CJS loading, eval-style
// code generation, and dynamic loading with a non-literal argument.
// NOTE: messages below deliberately avoid the trigger substrings
// so this self-scan stays green.
/** @type {[RegExp, string][]} */
const FORBIDDEN_PATTERNS = [
  [/\brequire\s*\(/, 'CJS require call forbidden — ESM only'],
  [/\beval\s*\(/, 'eval use forbidden'],
  [/new\s+Function\s*\(/, 'Function constructor use forbidden'],
  [/import\s*\(\s*[^'"`\s]/, 'dynamic import with non-literal argument forbidden'],
];

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

const files = SCAN_DIRS.flatMap((d) => collectJsFiles(d));
const seen = new Set();
const errors = [];

for (const file of files) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, 'utf8');
  for (const [re, msg] of FORBIDDEN_PATTERNS) {
    if (re.test(src)) {
      errors.push(`${rel}: ${msg}`);
    }
  }
  for (const spec of extractSpecifiers(src)) {
    if (isRelative(spec)) {
      errors.push(`${rel}: relative specifier forbidden: ${spec}`);
      continue;
    }
    if (spec.startsWith('node:')) continue;
    seen.add(spec);
    if (!ALLOWED.has(spec)) {
      errors.push(`${rel}: disallowed bare specifier: ${spec}`);
    }
  }
}

for (const req of REQUIRED) {
  if (!seen.has(req)) {
    errors.push(`missing required bare specifier: ${req}`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`allowlist: ${e}`);
  process.exit(1);
}

console.log(`allowlist ok: ${files.length} file(s), ${seen.size} bare specifier(s)`);
