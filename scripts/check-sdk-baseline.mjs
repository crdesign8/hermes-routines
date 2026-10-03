// @ts-check
// Upstream Desktop SDK compatibility baseline gate (issue #98).
//
// `@hermes/plugin-sdk` is a HOST-PROVIDED module: the Desktop app injects the
// live SDK namespace when it loads a plugin, and it publishes no consumable
// typings (re-verified 2026-10-03: `npm view @hermes/plugin-sdk` returns 404
// on the public registry). This repository therefore carries a hand-written
// shim (`src/types/plugin-sdk.d.ts`) plus `sdk-baseline.json` — the
// machine-readable record of the exact upstream contract the source is
// written against. `docs/SDK-BASELINE.md` is the human-facing half.
//
// This gate is what makes that record machine-checkable. It fails when:
//   1. src/ imports an SDK export the baseline does not record — a new import
//      must update `sdk-baseline.json` (and the pinned reference in
//      `docs/SDK-BASELINE.md` when the upstream contract moved);
//   2. the shim exports a name the baseline does not record — the local shim
//      may not silently grow beyond the recorded contract;
//   3. the shim stops declaring a baseline export the source still imports;
//   4. src/ calls a `host.<member>` path the baseline does not record;
//   5. the baseline records a symbol nothing in the repository consumes —
//      no speculative SDK declarations;
//   6. the pinned upstream reference is missing or malformed.
//
// Scanning is deliberately static and conservative: block comments and
// comment-only lines are stripped, so prose such as "see host.requestProfile"
// never counts as consumption, and a `.d.ts` file other than the shim is
// never treated as source.
//
// Usage:
//   node scripts/check-sdk-baseline.mjs   # exit 1 on drift (CI)
//
// Only node: builtins; no dependencies.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const BASELINE_REL = 'sdk-baseline.json';
const SDK_SPECIFIER = '@hermes/plugin-sdk';
const SRC_REL = 'src';
const SHIM_REL = path.join('src', 'types', 'plugin-sdk.d.ts');
const MAX_DEPTH = 25;
const SOURCE_RE = /\.(?:ts|tsx|mts|cts)$/;
/** Every symbol anchor is `<repo-relative path>:<line>` — prose is not an anchor. */
const ANCHOR_RE = /^[^\s:]+:\d+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

/** Kinds a baseline symbol may declare. */
const KINDS = ['value-export', 'type-export', 'host-member', 'shim-internal'];
/** Kinds that must be imported by src/ (exactly). */
const EXPORT_KINDS = ['value-export', 'type-export'];
/** Upstream block fields that must be non-empty strings. */
const UPSTREAM_STRINGS = ['repository', 'ref', 'sdkModule', 'docs', 'examplePlugins', 'firstPartyPlugins'];

/** @param {string} message @returns {never} */
function fatal(message) {
  console.error(`check-sdk-baseline: ${message}`);
  process.exit(1);
}

/** @param {string} rel @returns {string} */
function readRootText(rel) {
  try {
    return readFileSync(path.join(root, rel), 'utf8');
  } catch {
    fatal(`${rel} missing`);
  }
}

/**
 * Recursively collect scan targets under `dir`, failing closed on symlinks
 * (a symlinked source file could hide consumption from this gate).
 * @param {string} dir
 * @param {number} [depth]
 * @param {string[]} [out]
 * @returns {string[]} absolute file paths
 */
function collectSourceFiles(dir, depth = 0, out = []) {
  if (depth > MAX_DEPTH) {
    fatal(`max scan depth exceeded at ${dir}`);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      fatal(`symlink not allowed in scanned tree: ${path.relative(root, full)}`);
    }
    if (entry.isDirectory()) {
      collectSourceFiles(full, depth + 1, out);
    } else if (SOURCE_RE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove block comments and comment-only lines so documented usage in prose
 * is never mistaken for real consumption.
 * @param {string} source @returns {string}
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n');
}

/**
 * Every top-level symbol `src/**` imports from the SDK, split by value/type.
 * Namespace imports, default imports and side-effect imports are rejected —
 * the baseline records named exports only.
 * @param {string} source @param {string} rel
 * @returns {{ values: Set<string>, types: Set<string>, errors: string[] }}
 */
function extractSdkImports(source, rel) {
  const values = new Set();
  const types = new Set();
  const errors = [];
  const importRe = /import\s+([^;]*?)\s*from\s*['"](?:@hermes\/plugin-sdk)['"]/g;
  let match;
  while ((match = importRe.exec(stripComments(source))) !== null) {
    const clause = (match[1] || '').trim();
    if (clause === '') {
      errors.push(`${rel}: side-effect import of ${SDK_SPECIFIER} is not a recorded contract`);
      continue;
    }
    let rest = clause;
    let clauseIsTypeOnly = false;
    if (rest.startsWith('type ')) {
      clauseIsTypeOnly = true;
      rest = rest.slice('type '.length).trim();
    }
    const brace = rest.indexOf('{');
    if (brace === -1) {
      errors.push(
        `${rel}: only named SDK bindings are allowed, got \`${clause}\` — record the symbol in ${BASELINE_REL}`,
      );
      continue;
    }
    const defaultPart = rest.slice(0, brace).replace(/,$/, '').trim();
    if (defaultPart !== '') {
      errors.push(`${rel}: SDK default binding \`${defaultPart}\` is not part of the contract`);
    }
    if (rest.includes('*')) {
      errors.push(`${rel}: SDK namespace import is not part of the contract`);
    }
    const named = rest.slice(brace + 1, rest.lastIndexOf('}'));
    for (const raw of named.split(',')) {
      const spec = raw.trim();
      if (spec === '') continue;
      let name = spec;
      let isType = clauseIsTypeOnly;
      if (name.startsWith('type ')) {
        isType = true;
        name = name.slice('type '.length).trim();
      }
      const asIndex = name.search(/\s+as\s+/);
      if (asIndex !== -1) {
        name = name.slice(0, asIndex).trim();
      }
      if (!NAME_RE.test(name)) {
        errors.push(`${rel}: cannot read SDK import specifier ${JSON.stringify(spec)}`);
        continue;
      }
      (isType ? types : values).add(name);
    }
  }
  return { values, types, errors };
}

/**
 * Every `host.<member>` / `host.<member>.<member>` path `src/**` calls,
 * mapped to the first file that calls it. Only the first two segments are
 * recorded (`host.composer?.setDraft` -> `composer.setDraft`), which is the
 * granularity `PluginHost` is declared at.
 * @param {string} source @param {string} rel @param {Map<string, string>} into
 */
function collectHostPaths(source, rel, into) {
  const hostRe = /(?<![\w$.])host((?:\??\.[A-Za-z_$][A-Za-z0-9_$]*)+)/g;
  const clean = stripComments(source);
  let match;
  while ((match = hostRe.exec(clean)) !== null) {
    const segments = (match[1] || '')
      .split('.')
      .map((segment) => segment.replace(/\?$/, ''))
      .filter((segment) => segment !== '');
    const first = segments[0];
    if (first === undefined) continue;
    const dotted = segments.length > 1 ? `${first}.${segments[1]}` : first;
    if (!into.has(dotted)) into.set(dotted, rel);
  }
}

/**
 * Names the shim exports, plus every declaration it holds (exported or not,
 * so identical helpers can be audited as `shim-internal`).
 * @param {string} source
 * @returns {{ exported: Set<string>, declared: Set<string> }}
 */
function extractShimSymbols(source) {
  const exported = new Set();
  const declared = new Set();
  const declarationRe = /(?:^|\n)\s*export\s+(?:declare\s+)?(?:interface|type|const|function|class|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match;
  while ((match = declarationRe.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) {
      exported.add(name);
      declared.add(name);
    }
  }
  const nameRe = /(?:^|\n)\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|const|function|class|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = nameRe.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) declared.add(name);
  }
  const exportListRe = /(?:^|\n)\s*export\s*\{([^}]*)\}/g;
  while ((match = exportListRe.exec(source)) !== null) {
    for (const raw of (match[1] || '').split(',')) {
      const spec = raw.trim();
      if (spec === '') continue;
      const asIndex = spec.search(/\s+as\s+/);
      const name = (asIndex === -1 ? spec : spec.slice(asIndex + 4)).trim();
      if (NAME_RE.test(name)) {
        exported.add(name);
        declared.add(name);
      }
    }
  }
  return { exported, declared };
}

/**
 * Validate the baseline document itself. Fail-closed: a malformed baseline is
 * an error, never something this gate tries to interpret generously.
 * @param {unknown} raw
 * @returns {{ upstream: Record<string, unknown>, symbols: Array<Record<string, unknown>> }}
 */
function validateBaseline(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fatal(`${BASELINE_REL} must be a JSON object`);
  }
  const doc = /** @type {Record<string, unknown>} */ (raw);
  if (doc.version !== 1) {
    fatal(`${BASELINE_REL} version must be 1`);
  }
  const upstream = doc.upstream;
  if (typeof upstream !== 'object' || upstream === null || Array.isArray(upstream)) {
    fatal(`${BASELINE_REL} must carry an upstream object`);
  }
  const upstreamRecord = /** @type {Record<string, unknown>} */ (upstream);
  for (const field of UPSTREAM_STRINGS) {
    const value = upstreamRecord[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fatal(`${BASELINE_REL} upstream.${field} must be a non-empty string`);
    }
  }
  const ref = upstreamRecord.ref;
  if (typeof ref !== 'string' || !SHA_RE.test(ref)) {
    fatal(`${BASELINE_REL} upstream.ref must pin a full 40-character commit sha`);
  }
  for (const field of ['repository', 'examplePlugins']) {
    const value = upstreamRecord[field];
    if (typeof value !== 'string' || !REPO_RE.test(value)) {
      fatal(`${BASELINE_REL} upstream.${field} must be an owner/repository slug`);
    }
  }
  const sdkModule = upstreamRecord.sdkModule;
  if (typeof sdkModule !== 'string' || sdkModule.startsWith('/')) {
    fatal(`${BASELINE_REL} upstream.sdkModule must be repository-relative`);
  }
  const packageRecord = upstreamRecord.package;
  if (typeof packageRecord !== 'object' || packageRecord === null || Array.isArray(packageRecord)) {
    fatal(`${BASELINE_REL} must carry an upstream.package object`);
  }
  const pkg = /** @type {Record<string, unknown>} */ (packageRecord);
  if (typeof pkg.name !== 'string' || pkg.name.trim() === '') {
    fatal(`${BASELINE_REL} upstream.package.name must be a non-empty string`);
  }
  if (typeof pkg.published !== 'boolean') {
    fatal(`${BASELINE_REL} upstream.package.published must be a boolean`);
  }
  const symbols = doc.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    fatal(`${BASELINE_REL} must record at least one symbol`);
  }
  /** @type {Array<Record<string, unknown>>} */
  const entries = [];
  const seen = new Set();
  for (const rawEntry of symbols) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      fatal(`${BASELINE_REL} every symbol must be an object`);
    }
    const entry = /** @type {Record<string, unknown>} */ (rawEntry);
    const name = entry.name;
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      fatal(`${BASELINE_REL} has a symbol without a valid name`);
    }
    if (seen.has(name)) {
      fatal(`${BASELINE_REL} duplicates symbol ${name}`);
    }
    seen.add(name);
    const kind = entry.kind;
    if (typeof kind !== 'string' || !KINDS.includes(kind)) {
      fatal(`${BASELINE_REL} symbol ${name} must declare one of: ${KINDS.join(', ')}`);
    }
    const anchor = entry.upstream;
    if (typeof anchor !== 'string' || !ANCHOR_RE.test(anchor)) {
      fatal(`${BASELINE_REL} symbol ${name} must point at an upstream file:line anchor`);
    }
    if (kind === 'host-member') {
      const surface = entry.surface;
      if (typeof surface !== 'string' || !NAME_RE.test(surface) || !surface.startsWith('host.')) {
        fatal(`${BASELINE_REL} host member ${name} must declare surface "host.<member>"`);
      }
    }
    entries.push(entry);
  }
  return { upstream: upstreamRecord, symbols: entries };
}

const baseline = validateBaseline(JSON.parse(readRootText(BASELINE_REL)));

/** @param {string} kind @returns {Set<string>} */
function namesOfKind(kind) {
  return new Set(
    baseline.symbols
      .filter((entry) => entry.kind === kind)
      .map((entry) => /** @type {string} */ (entry.name)),
  );
}

const baselineExports = new Set([...namesOfKind('value-export'), ...namesOfKind('type-export')]);
const baselineHostMembers = namesOfKind('host-member');
const baselineShimInternal = namesOfKind('shim-internal');
const baselineNames = new Set(baseline.symbols.map((entry) => /** @type {string} */ (entry.name)));

const errors = [];
const consumedValues = new Map();
const consumedTypes = new Map();
/** @type {Map<string, string>} */
const hostPaths = new Map();

for (const file of collectSourceFiles(path.join(root, SRC_REL))) {
  const rel = path.relative(root, file);
  const source = readFileSync(file, 'utf8');
  const imports = extractSdkImports(source, rel);
  errors.push(...imports.errors);
  for (const name of imports.values) if (!consumedValues.has(name)) consumedValues.set(name, rel);
  for (const name of imports.types) if (!consumedTypes.has(name)) consumedTypes.set(name, rel);
  collectHostPaths(source, rel, hostPaths);
}

const shim = extractShimSymbols(readRootText(SHIM_REL));

// 1. Every imported SDK export must be recorded, with the right kind.
for (const [name, rel] of consumedValues) {
  if (!baselineExports.has(name)) {
    errors.push(
      `${rel}: SDK value binding \`${name}\` is not in ${BASELINE_REL} — record it (with its upstream anchor) before using it`,
    );
  } else if (!namesOfKind('value-export').has(name)) {
    errors.push(`${rel}: SDK value binding \`${name}\` is recorded as a type, not a value`);
  }
}
for (const [name, rel] of consumedTypes) {
  if (!baselineExports.has(name)) {
    errors.push(
      `${rel}: SDK type binding \`${name}\` is not in ${BASELINE_REL} — record it (with its upstream anchor) before using it`,
    );
  } else if (!namesOfKind('type-export').has(name)) {
    errors.push(`${rel}: SDK type binding \`${name}\` is recorded as a value, not a type`);
  }
}

// 2/3. Exports are consumed exactly once each: no speculative entry, no
// undeclared shim growth, no silently dropped shim declaration.
for (const name of baselineExports) {
  if (!consumedValues.has(name) && !consumedTypes.has(name)) {
    errors.push(`${BASELINE_REL} records SDK export "${name}" but src/ never imports it — remove it or re-verify upstream`);
  }
  if (!shim.exported.has(name)) {
    errors.push(`${SHIM_REL} no longer exports "${name}" although src/ imports it`);
  }
}
for (const name of shim.exported) {
  if (!baselineNames.has(name)) {
    errors.push(`${SHIM_REL} exports "${name}", which ${BASELINE_REL} does not record — a new SDK surface needs a baseline entry`);
  }
}

// 4/5. Host members are used exactly once each.
for (const [name, rel] of hostPaths) {
  if (!baselineHostMembers.has(name)) {
    errors.push(`${rel}: calls host.${name}, which is not in ${BASELINE_REL} — record it before depending on it`);
  }
}
for (const name of baselineHostMembers) {
  if (!hostPaths.has(name)) {
    errors.push(`${BASELINE_REL} records host.${name} but src/ never calls it — remove it or re-verify upstream`);
  }
}

// 5b. A shim-internal symbol must exist in the shim, and must not be
// exported (an exported one belongs to the consumed-export set instead).
for (const name of baselineShimInternal) {
  if (!shim.declared.has(name)) {
    errors.push(`${SHIM_REL} does not declare "${name}" although ${BASELINE_REL} records it as shim-internal`);
  }
  if (shim.exported.has(name)) {
    errors.push(`${SHIM_REL} exports shim-internal "${name}" — src/ must import it, or the baseline kind is wrong`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`check-sdk-baseline: ${error}`);
  process.exit(1);
}

const upstreamRepository = baseline.upstream.repository;
const upstreamRef = /** @type {string} */ (baseline.upstream.ref);
process.stdout.write(
  `check-sdk-baseline ok: ${baseline.symbols.length} symbols against ${String(upstreamRepository)}@${upstreamRef.slice(0, 12)}\n`,
);
