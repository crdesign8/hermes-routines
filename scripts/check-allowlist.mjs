// @ts-check
// Import allowlist + code-generation ban.
//
// What is scanned, and under which rules:
//   desktop/  GENERATED artifact that ships to the Desktop: bare
//             specifiers must stay inside the host allowlist, NO relative
//             imports (the build must have inlined them), no node:.
//   src/      editable TypeScript source: same bare allowlist, relative
//             imports allowed (esbuild inlines them), no node: (the
//             plugin runs in the renderer, not in Node).
//   scripts/  repo tooling: node: builtins plus the esbuild devDependency.
// Every directory: no CJS loading, no eval-style code generation, no
// dynamic import with a non-literal argument.
//
// REQUIRED specifiers are asserted on the desktop artifact only: they
// prove the bundle still leans on the host-provided SDK and JSX runtime
// instead of carrying its own copy.
//
// Only node: builtins plus the devDependency `esbuild` (imported by
// scripts/build.mjs); messages below deliberately avoid the trigger
// substrings so this self-scan stays green.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Desktop host resolves exactly these specifiers for a disk plugin.
const HOST_ALLOW = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime', 'react/jsx-dev-runtime']);
// Build tooling may be imported by repo scripts only.
const SCRIPT_ALLOW = new Set(['esbuild']);
// Must be present in the shipped artifact today.
const REQUIRED_DESKTOP = ['@hermes/plugin-sdk', 'react/jsx-runtime'];

/** @type {{ dir: string, bare: Set<string>, allowRelative: boolean, allowNode: boolean, required: string[] }[]} */
const RULES = [
  { dir: 'desktop', bare: HOST_ALLOW, allowRelative: false, allowNode: false, required: REQUIRED_DESKTOP },
  { dir: 'src', bare: HOST_ALLOW, allowRelative: true, allowNode: false, required: [] },
  { dir: 'scripts', bare: SCRIPT_ALLOW, allowRelative: false, allowNode: true, required: [] },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const MAX_DEPTH = 25;
const SOURCE_FILE_RE = /\.(m|c)?[jt]sx?$/;

/**
 * @param {string} dir
 * @param {number} [depth]
 * @param {Set<string>} [seen]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectSourceFiles(dir, depth = 0, seen = new Set(), out = []) {
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
      collectSourceFiles(full, depth + 1, seen, out);
    } else if (SOURCE_FILE_RE.test(entry)) {
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
      found.push(/** @type {string} */ (m[1]));
    }
  }
  return found;
}

// Patterns the specifier allowlist cannot see: CJS loading, eval-style
// code generation, and dynamic loading with a non-literal argument.
/** @type {[RegExp, string][]} */
const FORBIDDEN_PATTERNS = [
  [/\brequire\s*\(/, 'CJS require call forbidden — ESM only'],
  [/\beval\s*\(/, 'eval use forbidden'],
  [/new\s+Function\s*\(/, 'Function constructor use forbidden'],
  [/import\s*\(\s*[^'\"`\s]/, 'dynamic import with non-literal argument forbidden'],
];

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../');
}

/**
 * @param {string} spec
 * @returns {boolean}
 */
function isAbsolute(spec) {
  return spec.startsWith('/');
}

const errors = [];
const desktopSpecifiers = new Set();

for (const rule of RULES) {
  const base = path.join(root, rule.dir);
  const files = collectSourceFiles(base);
  const seen = new Set();

  for (const file of files) {
    const rel = path.relative(root, file);
    const src = readFileSync(file, 'utf8');
    for (const [re, msg] of FORBIDDEN_PATTERNS) {
      if (re.test(src)) {
        errors.push(`${rel}: ${msg}`);
      }
    }
    for (const spec of extractSpecifiers(src)) {
      if (isAbsolute(spec) || (isRelative(spec) && !rule.allowRelative)) {
        errors.push(`${rel}: relative specifier forbidden: ${spec}`);
        continue;
      }
      if (spec.startsWith('node:')) {
        if (!rule.allowNode) {
          errors.push(`${rel}: node builtin forbidden here: ${spec}`);
        }
        continue;
      }
      if (isRelative(spec)) continue;
      seen.add(spec);
      if (rule.dir === 'desktop') desktopSpecifiers.add(spec);
      if (!rule.bare.has(spec)) {
        errors.push(`${rel}: disallowed bare specifier: ${spec}`);
      }
    }
  }

  for (const req of rule.required) {
    if (!seen.has(req)) {
      errors.push(`desktop artifact: missing required bare specifier: ${req}`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`allowlist: ${e}`);
  process.exit(1);
}

console.log(
  `allowlist ok: ${RULES.length} rules, ${desktopSpecifiers.size} bare specifier(s) in the artifact`,
);
