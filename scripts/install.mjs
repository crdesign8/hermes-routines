// @ts-check
// Install mapping for hermes-routines (app-level).
// Copies desktop/plugin.js (the generated artifact) to
// <HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js byte-identical,
// verified by sha256. Folder name equals the plugin id `hermes-routines`.
// Only node: builtins; zero relative imports, zero bare specifiers.
//
// This matches the official Desktop runtime door: ONE app-level root,
// `<hermes home>/desktop-plugins/` (`<id>/plugin.js` for a standalone
// desktop plugin). The pre-#14 profile-scoped layout
// (`<profile-home>/plugins/routines/plugin.js`) is removed — legacy flags
// and env vars fail closed with a migration pointer instead of installing
// to a second location.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'hermes-routines';
export const PLUGIN_DIR_NAME = 'hermes-routines';
export const PLUGIN_FILE_NAME = 'plugin.js';
export const PREV_FILE_NAME = 'plugin.js.prev';
export const DESKTOP_PLUGINS_DIR = 'desktop-plugins';
// The generated artifact (built from src/ by scripts/build.mjs).
export const SOURCE_REL = path.join('desktop', 'plugin.js');

export const LEGACY_MIGRATION_HINT =
  'legacy profile install removed (issue #14): use --hermes-home="$HOME/.hermes" (or HERMES_HOME=...) ' +
  'to install app-level at <HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js; ' +
  'remove the old file with rm "<profile-home>/plugins/routines/plugin.js". See docs/INSTALL.md (Migration).';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

/**
 * @param {{ hermesHome?: unknown }} [opts]
 * @returns {string}
 */
export function resolveHermesHome({ hermesHome } = {}) {
  if (hermesHome !== undefined && hermesHome !== null) {
    const trimmed = String(hermesHome).trim();
    if (!trimmed) {
      throw new Error('invalid hermesHome: must be a non-empty path');
    }
    return path.resolve(trimmed);
  }
  if (process.env.HERMES_PROFILE_HOME !== undefined && String(process.env.HERMES_PROFILE_HOME).trim() !== '') {
    // Fail closed: a legacy profile-home env must never silently select a
    // second install location — not even when HERMES_HOME is also set
    // (Hermes sessions inject HERMES_HOME pointing at the active profile).
    // Pass --hermes-home explicitly when both are set.
    throw new Error(LEGACY_MIGRATION_HINT);
  }
  const envHome = process.env.HERMES_HOME;
  if (envHome !== undefined && envHome !== null && String(envHome).trim() !== '') {
    // Explicit env override: honored as-is (resolved to absolute).
    return path.resolve(String(envHome).trim());
  }
  return path.join(homedir(), '.hermes');
}

/**
 * @param {unknown} hermesHome
 * @param {string} [root]
 * @returns {{ src: string, destDir: string, dest: string, prev: string }}
 */
export function resolveInstallPaths(hermesHome, root = DEFAULT_ROOT) {
  const home = resolveHermesHome({ hermesHome });
  const src = path.join(path.resolve(root), SOURCE_REL);
  const destDir = path.join(home, DESKTOP_PLUGINS_DIR, PLUGIN_DIR_NAME);
  const dest = path.join(destDir, PLUGIN_FILE_NAME);
  const prev = path.join(destDir, PREV_FILE_NAME);
  return { src, destDir, dest, prev };
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * @param {any} buf
 * @returns {string}
 */
export function sha256Bytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Attempts to claim a fresh temp name before giving up. Collisions are
// ~2^-64 per attempt (64-bit random suffix plus pid), so a retry here is
// a correctness backstop for the `wx` exclusive-create below, not a hot
// path — five tries is plenty without growing retry/backoff machinery.
const TMP_ATTEMPTS = 5;

/**
 * Stage bytes to a uniquely-named temp file next to the destination.
 * Uses exclusive create (`wx`: fails with EEXIST instead of truncating
 * an existing temp) plus `fsync` before the caller renames.
 *
 * Why `fsync` before `rename`: `rename` is atomic (readers see the old
 * or the new file, never a partial one), but on most filesystems file
 * data can linger in the page cache while the rename metadata is
 * already durable. A crash in that window could leave the destination
 * name pointing at unwritten blocks. Flushing the temp file first makes
 * the renamed contents durable. A directory `fsync` after `rename`
 * (durable directory entry) is deliberately out of scope: it needs
 * platform-specific dir-fd handling and pushes this script toward a
 * parallel package manager, which the install design explicitly avoids.
 * Hash verification after the copy catches any undurable state on the
 * next install instead.
 *
 * @param {string} dest final destination path (temp lives beside it, same filesystem so rename stays atomic)
 * @param {any} srcBytes bytes to stage
 * @returns {string} staged temp path (caller renames on success, unlinks on error)
 */
export function stageTempExclusive(dest, srcBytes) {
  /** @type {any} */
  let lastErr = null;
  for (let attempt = 0; attempt < TMP_ATTEMPTS; attempt++) {
    const suffix = randomBytes(8).toString('hex');
    const tmp = `${dest}.tmp.${process.pid}.${suffix}`;
    /** @type {any} */
    let fd = null;
    try {
      fd = openSync(tmp, 'wx', 0o644);
    } catch (err) {
      lastErr = err;
      const code = err && (/** @type {any} */ (err).code);
      if (code === 'EEXIST' && attempt + 1 < TMP_ATTEMPTS) {
        continue;
      }
      throw err;
    }
    try {
      let offset = 0;
      const total = srcBytes.length;
      while (offset < total) {
        const written = writeSync(fd, srcBytes, offset);
        if (written <= 0) {
          throw new Error(`short write staging copy: ${tmp}`);
        }
        offset += written;
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return tmp;
  }
  throw lastErr ?? new Error('could not stage temp file: attempts exhausted');
}

/**
 * Atomically publish bytes over dest (stage, hash-verify, rename,
 * hash-verify). Shared by install and rollback so both doors keep the
 * same durability contract.
 *
 * @param {string} dest
 * @param {any} bytes
 * @returns {string} sha256 of the published bytes
 */
function publishBytes(dest, bytes) {
  const hash = sha256Bytes(bytes);
  const tmp = stageTempExclusive(dest, bytes);
  try {
    const tmpHash = sha256File(tmp);
    if (tmpHash !== hash) {
      throw new Error(`sha256 mismatch staging copy: src=${hash} tmp=${tmpHash}`);
    }
    renameSync(tmp, dest);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best effort cleanup
    }
    throw err;
  }
  const destHash = sha256File(dest);
  if (hash !== destHash) {
    throw new Error(`sha256 mismatch after copy: src=${hash} dest=${destHash}`);
  }
  return hash;
}

/**
 * Install (or re-install) the generated artifact at the app-level door.
 * Idempotent: when dest already carries the same bytes, nothing is
 * rewritten and no backup is taken. Otherwise the previous dest bytes
 * are kept as `<destDir>/plugin.js.prev` for `rollback`.
 *
 * @param {{ hermesHome?: unknown, root?: string }} [opts]
 * @returns {{ src: string, dest: string, sha256: string, backedUp: boolean, unchanged: boolean }}
 */
export function install({ hermesHome, root = DEFAULT_ROOT } = {}) {
  const { src, destDir, dest, prev } = resolveInstallPaths(hermesHome, root);
  if (!existsSync(src)) {
    throw new Error(`install source missing: ${src}`);
  }
  mkdirSync(destDir, { recursive: true });
  // Atomic publish: stage to a unique temp file in the destination dir
  // (`<dest>.tmp.<pid>.<rand>`), verify its hash, then rename over the
  // target so readers never see a half copy. Two concurrent installs use
  // different temp names (pid + 64-bit random suffix) and rename
  // atomically over identical bytes, so last-writer-wins is still intact.
  const srcBytes = readFileSync(src);
  const srcHash = sha256Bytes(srcBytes);
  let backedUp = false;
  if (existsSync(dest)) {
    const currentHash = sha256File(dest);
    if (currentHash === srcHash) {
      return { src, dest, sha256: srcHash, backedUp, unchanged: true };
    }
    writeFileSync(prev, readFileSync(dest));
    backedUp = true;
  }
  const published = publishBytes(dest, srcBytes);
  return { src, dest, sha256: published, backedUp, unchanged: false };
}

/**
 * Update is install: the plugin file carries no local state (jobs live in
 * the backend via `cron.manage`), so overwriting with the newer
 * `desktop/plugin.js` is the whole upgrade. The previous bytes are kept
 * for `rollback`.
 *
 * @param {{ hermesHome?: unknown, root?: string }} [opts]
 * @returns {{ src: string, dest: string, sha256: string, backedUp: boolean, unchanged: boolean }}
 */
export function update(opts = {}) {
  return install(opts);
}

/**
 * Uninstall: remove the app-level plugin file (and its backup, if any),
 * then remove the plugin dir when empty. Idempotent — a missing install
 * reports `removed: false` instead of failing.
 *
 * @param {{ hermesHome?: unknown, root?: string }} [opts]
 * @returns {{ dest: string, destDir: string, removed: boolean, removedPrev: boolean }}
 */
export function uninstall({ hermesHome, root = DEFAULT_ROOT } = {}) {
  const { destDir, dest, prev } = resolveInstallPaths(hermesHome, root);
  let removed = false;
  let removedPrev = false;
  try {
    unlinkSync(dest);
    removed = true;
  } catch (err) {
    const code = err && (/** @type {any} */ (err).code);
    if (code !== 'ENOENT') throw err;
  }
  try {
    unlinkSync(prev);
    removedPrev = true;
  } catch (err) {
    const code = err && (/** @type {any} */ (err).code);
    if (code !== 'ENOENT') throw err;
  }
  try {
    rmdirSync(destDir);
  } catch {
    // best effort: dir missing or non-empty (other files) stays in place
  }
  return { dest, destDir, removed, removedPrev };
}

/**
 * Rollback: restore the `<destDir>/plugin.js.prev` backup taken by the
 * last differing install over dest, atomically and hash-verified. The
 * backup is kept so rollback stays repeatable.
 *
 * @param {{ hermesHome?: unknown, root?: string }} [opts]
 * @returns {{ dest: string, sha256: string }}
 */
export function rollback({ hermesHome, root = DEFAULT_ROOT } = {}) {
  const { destDir, dest, prev } = resolveInstallPaths(hermesHome, root);
  if (!existsSync(prev)) {
    throw new Error(`no backup to roll back: ${prev} (install a new version first)`);
  }
  mkdirSync(destDir, { recursive: true });
  const prevBytes = readFileSync(prev);
  const published = publishBytes(dest, prevBytes);
  return { dest, sha256: published };
}

/**
 * @param {string[]} argv
 * @returns {{ command: string, hermesHome?: string, root?: string }}
 */
function parseArgs(argv) {
  /** @type {{ command: string, hermesHome?: string, root?: string }} */
  const out = { command: 'install' };
  for (const arg of argv) {
    if (arg === 'install' || arg === 'update' || arg === 'uninstall' || arg === 'rollback') {
      out.command = arg;
    } else if (arg.startsWith('--hermes-home=')) out.hermesHome = arg.slice('--hermes-home='.length);
    else if (arg.startsWith('--root=')) out.root = arg.slice('--root='.length);
    else if (arg.startsWith('--profile-home') || arg.startsWith('--profile=')) {
      throw new Error(`${LEGACY_MIGRATION_HINT} (got ${arg})`);
    }
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'uninstall') {
    const result = uninstall(opts);
    process.stdout.write(result.removed ? `removed ${result.dest}\n` : `not installed ${result.dest}\n`);
  } else if (opts.command === 'rollback') {
    const result = rollback(opts);
    process.stdout.write(`rolled back ${result.dest}\nsha256 ${result.sha256}\n`);
  } else if (opts.command === 'update') {
    const result = update(opts);
    process.stdout.write(`installed ${result.src} -> ${result.dest}\nsha256 ${result.sha256}\n`);
    if (result.unchanged) process.stdout.write(`unchanged ${result.dest} (already current)\n`);
    else if (result.backedUp) process.stdout.write(`backup ${result.dest}.prev\n`);
  } else {
    const result = install(opts);
    process.stdout.write(`installed ${result.src} -> ${result.dest}\nsha256 ${result.sha256}\n`);
    if (result.unchanged) process.stdout.write(`unchanged ${result.dest} (already current)\n`);
    else if (result.backedUp) process.stdout.write(`backup ${result.dest}.prev\n`);
  }
}
