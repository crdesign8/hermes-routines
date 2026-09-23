import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set([
  '@hermes/plugin-sdk',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]);

const REQUIRED = ['@hermes/plugin-sdk', 'react/jsx-runtime'];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const desktopDir = path.join(root, 'desktop');

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (/\.m?js$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
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
    while ((m = re.exec(source)) !== null) {
      found.push(m[1]);
    }
  }
  return found;
}

function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

const files = collectJsFiles(desktopDir);
const seen = new Set();
const errors = [];

for (const file of files) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, 'utf8');
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
