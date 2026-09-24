// @ts-check
// Manifest/package/artifact parity gate: plugin.yaml <-> package.json
// <-> src/constants.ts <-> the GENERATED desktop/plugin.js.
//
// package.json is the single source of truth for name/version/description.
// plugin.yaml carries the same triple plus explicit empty
// provides_tools/provides_hooks (no tools, no hooks: the plugin only
// registers routes + sidebar.nav and calls the backend through the host
// gateway). src/constants.ts carries PLUGIN_ID, and the generated
// artifact wires id/name through those constants with description /
// defaultEnabled / version literals injected from the source of truth.
//
// Usage:
//   node scripts/check-manifest.mjs   # exit 1 on drift (CI)
//
// Only node: builtins; no dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** @param {string} file @returns {string} */
function readRoot(file) {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    console.error(`check-manifest: ${file} missing`);
    process.exit(1);
  }
}

/**
 * Minimal fail-closed YAML reader for the flat string/list manifest
 * shape used by plugin.yaml. Supports `key: value` lines where the key
 * starts at column 0 (no indentation) and value is a non-empty
 * single/double-quoted string, `[]`, or a bare scalar on the same line.
 * Anything else (indented/nested lines, empty values, nested maps,
 * multi-line blocks, duplicate keys, unterminated strings) is rejected
 * so drift can never hide behind syntax this reader does not understand.
 * @param {string} text
 * @returns {Map<string, string>}
 */
function parseFlatManifest(text) {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (raw.charAt(0) === ' ' || raw.charAt(0) === '\t') {
      console.error(`check-manifest: plugin.yaml line ${i + 1} must start at column 0 (indented/nested lines rejected)`);
      process.exit(1);
    }
    const colon = line.indexOf(':');
    if (colon < 0) {
      console.error(`check-manifest: plugin.yaml line ${i + 1} is not a key: value pair`);
      process.exit(1);
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (key === '') {
      console.error(`check-manifest: plugin.yaml line ${i + 1} has an empty key`);
      process.exit(1);
    }
    if (out.has(key)) {
      console.error(`check-manifest: plugin.yaml duplicates key ${JSON.stringify(key)}`);
      process.exit(1);
    }
    if (value === '') {
      console.error(`check-manifest: plugin.yaml key ${JSON.stringify(key)} has an empty value`);
      process.exit(1);
    }
    if (value.charAt(0) === "'" || value.charAt(0) === '"') {
      const quote = value.charAt(0);
      if (value.length < 2 || !value.endsWith(quote)) {
        console.error(`check-manifest: plugin.yaml key ${JSON.stringify(key)} has an unterminated string`);
        process.exit(1);
      }
      const unquoted = value.slice(1, -1);
      if (unquoted === '') {
        console.error(`check-manifest: plugin.yaml key ${JSON.stringify(key)} has an empty value`);
        process.exit(1);
      }
      out.set(key, unquoted);
      continue;
    }
    out.set(key, value);
  }
  return out;
}

/**
 * Extract a `const NAME = 'value'` string literal from TS source.
 * @param {string} src @param {string} constName @param {string} label
 * @returns {string}
 */
function extractConstString(src, constName, label) {
  const re = new RegExp(`${constName}\\s*=\\s*(['"])([^'"]+)\\1`);
  const m = re.exec(src);
  if (!m || typeof m[2] !== 'string' || m[2] === '') {
    console.error(`check-manifest: ${label} has no ${constName} string literal`);
    process.exit(1);
  }
  return m[2];
}

/**
 * Extract the `var plugin = { ... };` descriptor block from the generated
 * artifact. Field pins below are scoped to this block so similarly named
 * keys elsewhere in the bundle can never satisfy the gate; a
 * whole-artifact uniqueness guard then rejects stray duplicates outside
 * the descriptor.
 * @param {string} src
 * @returns {string}
 */
function extractDescriptor(src) {
  const m = /var\s+plugin\s*=\s*\{[\s\S]*?\n\};/.exec(src);
  if (!m) {
    console.error('check-manifest: desktop/plugin.js has no var plugin = { ... }; descriptor');
    process.exit(1);
  }
  return m[0];
}

const pkgRaw = readRoot('package.json');
/** @type {{ name?: unknown, version?: unknown, description?: unknown }} */
let pkg;
try {
  pkg = JSON.parse(pkgRaw);
} catch {
  console.error('check-manifest: package.json is not valid JSON');
  process.exit(1);
}
if (typeof pkg.name !== 'string' || pkg.name === '') {
  console.error('check-manifest: package.json has no name string');
  process.exit(1);
}
if (typeof pkg.version !== 'string' || pkg.version === '') {
  console.error('check-manifest: package.json has no version string');
  process.exit(1);
}
if (typeof pkg.description !== 'string' || pkg.description === '') {
  console.error('check-manifest: package.json has no description string');
  process.exit(1);
}
const pkgName = pkg.name;
const pkgVersion = pkg.version;
const pkgDescription = pkg.description;

const manifest = parseFlatManifest(readRoot('plugin.yaml'));
for (const field of ['name', 'version', 'description']) {
  const value = manifest.get(field);
  if (typeof value !== 'string' || value === '') {
    console.error(`check-manifest: plugin.yaml missing required field ${field}`);
    process.exit(1);
  }
}
const manifestName = /** @type {string} */ (manifest.get('name'));
const manifestVersion = /** @type {string} */ (manifest.get('version'));
const manifestDescription = /** @type {string} */ (manifest.get('description'));

if (manifestName !== pkgName) {
  console.error(`check-manifest: drift name package.json (${pkgName}) vs plugin.yaml (${manifestName})`);
  process.exit(1);
}
if (manifestVersion !== pkgVersion) {
  console.error(`check-manifest: drift version package.json (${pkgVersion}) vs plugin.yaml (${manifestVersion})`);
  process.exit(1);
}
if (manifestDescription !== pkgDescription) {
  console.error('check-manifest: drift description package.json vs plugin.yaml');
  process.exit(1);
}

for (const listField of ['provides_tools', 'provides_hooks']) {
  const value = manifest.get(listField);
  if (value === undefined) {
    console.error(`check-manifest: plugin.yaml must declare explicit empty ${listField}`);
    process.exit(1);
  }
  if (value !== '[]') {
    console.error(`check-manifest: plugin.yaml ${listField} must be empty, got ${JSON.stringify(value)}`);
    process.exit(1);
  }
}

const declaredHermes = manifest.get('requires_hermes');
if (declaredHermes !== undefined) {
  // Fail-closed: the sealed contract omits requires_hermes entirely.
  // Any declared value (even a plausible version pin) is rejected so
  // drift can never pass a gate that `hermes plugins validate` would fail.
  console.error('check-manifest: plugin.yaml must not declare requires_hermes (omit the key)');
  process.exit(1);
}

const constantsSrc = readRoot(path.join('src', 'constants.ts'));
const pluginId = extractConstString(constantsSrc, 'PLUGIN_ID', 'src/constants.ts');
if (pluginId !== pkgName) {
  console.error(`check-manifest: drift PLUGIN_ID (${pluginId}) vs package.json name (${pkgName})`);
  process.exit(1);
}

const artifact = readRoot(path.join('desktop', 'plugin.js'));
const descriptor = extractDescriptor(artifact);
const artifactPluginId = extractConstString(artifact, 'PLUGIN_ID', 'desktop/plugin.js');
if (artifactPluginId !== pkgName) {
  console.error(`check-manifest: drift artifact PLUGIN_ID (${artifactPluginId}) vs package.json name (${pkgName})`);
  process.exit(1);
}
if (!/\bid\s*:\s*PLUGIN_ID\b/.test(descriptor)) {
  console.error('check-manifest: artifact descriptor must wire id through PLUGIN_ID');
  process.exit(1);
}
if (!/\bname\s*:\s*PLUGIN_NAME\b/.test(descriptor)) {
  console.error('check-manifest: artifact descriptor must wire name through PLUGIN_NAME');
  process.exit(1);
}

const descPins = [...descriptor.matchAll(/\bdescription\s*:\s*(['"])([^'"]+)\1/g)];
if (descPins.length !== 1) {
  console.error(`check-manifest: expected exactly one description field in the artifact descriptor, found ${descPins.length}`);
  process.exit(1);
}
if ([...artifact.matchAll(/\bdescription\s*:\s*(['"])([^'"]+)\1/g)].length !== 1) {
  console.error('check-manifest: stray duplicate description field outside the artifact descriptor');
  process.exit(1);
}
const descFound = descPins[0]?.[2];
if (descFound !== pkgDescription) {
  console.error('check-manifest: drift description package.json vs desktop/plugin.js');
  process.exit(1);
}

const enabledPins = [...descriptor.matchAll(/\bdefaultEnabled\s*:\s*(true|false)/g)];
if (enabledPins.length !== 1) {
  console.error(`check-manifest: expected exactly one defaultEnabled field in the artifact descriptor, found ${enabledPins.length}`);
  process.exit(1);
}
if ([...artifact.matchAll(/\bdefaultEnabled\s*:\s*(true|false)/g)].length !== 1) {
  console.error('check-manifest: stray duplicate defaultEnabled field outside the artifact descriptor');
  process.exit(1);
}
if (enabledPins[0]?.[1] !== 'false') {
  console.error(`check-manifest: artifact defaultEnabled must be false (opt-in), got ${enabledPins[0]?.[1]}`);
  process.exit(1);
}

const versionPins = [...descriptor.matchAll(/\bversion\s*:\s*(['"])([^'"]+)\1/g)];
if (versionPins.length !== 1) {
  console.error(`check-manifest: expected exactly one version field in the artifact descriptor, found ${versionPins.length}`);
  process.exit(1);
}
if ([...artifact.matchAll(/\bversion\s*:\s*(['"])([^'"]+)\1/g)].length !== 1) {
  console.error('check-manifest: stray duplicate version field outside the artifact descriptor');
  process.exit(1);
}
if (versionPins[0]?.[2] !== pkgVersion) {
  console.error(`check-manifest: drift version package.json (${pkgVersion}) vs artifact (${versionPins[0]?.[2]})`);
  process.exit(1);
}

process.stdout.write(`check-manifest ok: ${pkgName}@${pkgVersion}\n`);
