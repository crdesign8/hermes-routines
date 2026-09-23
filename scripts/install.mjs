// @ts-check
// Install mapping for hermes-routines (phase 4).
// Copies desktop/plugin.js (the generated artifact) to <profile-home>/plugins/routines/plugin.js
// byte-identical, verified by sha256. Folder name equals the registered
// route id `routines`. Only node: builtins; zero relative imports,
// zero bare specifiers.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'hermes-routines';
export const PLUGIN_DIR_NAME = 'routines';
export const PLUGIN_FILE_NAME = 'plugin.js';
// The generated artifact (built from src/ by scripts/build.mjs).
export const SOURCE_REL = path.join('desktop', 'plugin.js');

// Profile names become a single path segment under ~/.hermes/profiles.
// Anything outside [A-Za-z0-9._-] (e.g. "../evil", absolute paths,
// separators) is rejected so --profile can never escape the base dir.
export const PROFILE_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

/**
 * @param {{ profileHome?: unknown, profile?: unknown }} [opts]
 * @returns {string}
 */
export function resolveProfileHome({ profileHome, profile } = {}) {
  if (profileHome !== undefined && profileHome !== null) {
    const trimmed = String(profileHome).trim();
    if (!trimmed) {
      throw new Error('invalid profileHome: must be a non-empty path');
    }
    return path.resolve(trimmed);
  }
  const envHome = process.env.HERMES_PROFILE_HOME;
  if (envHome !== undefined && envHome !== null && String(envHome).trim() !== '') {
    // Explicit env override: honored as-is (resolved to absolute).
    return path.resolve(String(envHome).trim());
  }
  const raw = profile !== undefined && profile !== null ? String(profile) : process.env.HERMES_PROFILE || 'default';
  const name = String(raw).trim() || 'default';
  // The char class alone would still admit "." and "..", which escape the
  // base dir via path.join — reject them explicitly.
  if (name === '.' || name === '..' || !PROFILE_NAME_RE.test(name)) {
    throw new Error(`invalid profile: ${JSON.stringify(name)} (must match ${PROFILE_NAME_RE})`);
  }
  return path.join(homedir(), '.hermes', 'profiles', name);
}

/**
 * @param {unknown} profileHome
 * @param {string} [root]
 * @returns {{ src: string, destDir: string, dest: string }}
 */
export function resolveInstallPaths(profileHome, root = DEFAULT_ROOT) {
  const home = resolveProfileHome({ profileHome });
  const src = path.join(path.resolve(root), SOURCE_REL);
  const destDir = path.join(home, 'plugins', PLUGIN_DIR_NAME);
  const dest = path.join(destDir, PLUGIN_FILE_NAME);
  return { src, destDir, dest };
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
 * @param {{ profileHome?: unknown, profile?: unknown, root?: string }} [opts]
 * @returns {{ src: string, dest: string, sha256: string }}
 */
export function install({ profileHome, profile, root = DEFAULT_ROOT } = {}) {
  const { src, destDir, dest } = resolveInstallPaths(profileHome ?? resolveProfileHome({ profile }), root);
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
  const tmp = stageTempExclusive(dest, srcBytes);
  try {
    const tmpHash = sha256File(tmp);
    if (tmpHash !== srcHash) {
      throw new Error(`sha256 mismatch staging copy: src=${srcHash} tmp=${tmpHash}`);
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
  if (srcHash !== destHash) {
    throw new Error(`sha256 mismatch after copy: src=${srcHash} dest=${destHash}`);
  }
  return { src, dest, sha256: srcHash };
}

/**
 * @param {string[]} argv
 * @returns {{ profileHome?: string, profile?: string, root?: string }}
 */
function parseArgs(argv) {
  /** @type {{ profileHome?: string, profile?: string, root?: string }} */
  const out = {};
  for (const arg of argv) {
    if (arg.startsWith('--profile-home=')) out.profileHome = arg.slice('--profile-home='.length);
    else if (arg.startsWith('--profile=')) out.profile = arg.slice('--profile='.length);
    else if (arg.startsWith('--root=')) out.root = arg.slice('--root='.length);
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const result = install(opts);
  process.stdout.write(`installed ${result.src} -> ${result.dest}\nsha256 ${result.sha256}\n`);
}
