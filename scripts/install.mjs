// Install mapping for hermes-routines (phase 4).
// Copies desktop/routines.js to <profile-home>/plugins/routines/plugin.js
// byte-identical, verified by sha256. Folder name equals the registered
// route id `routines`. Only node: builtins; zero relative imports,
// zero bare specifiers.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'hermes-routines';
export const PLUGIN_DIR_NAME = 'routines';
export const PLUGIN_FILE_NAME = 'plugin.js';
export const SOURCE_REL = path.join('desktop', 'routines.js');

// Profile names become a single path segment under ~/.hermes/profiles.
// Anything outside [A-Za-z0-9._-] (e.g. "../evil", absolute paths,
// separators) is rejected so --profile can never escape the base dir.
export const PROFILE_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

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

export function resolveInstallPaths(profileHome, root = DEFAULT_ROOT) {
  const home = resolveProfileHome({ profileHome });
  const src = path.join(path.resolve(root), SOURCE_REL);
  const destDir = path.join(home, 'plugins', PLUGIN_DIR_NAME);
  const dest = path.join(destDir, PLUGIN_FILE_NAME);
  return { src, destDir, dest };
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function sha256Bytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function install({ profileHome, profile, root = DEFAULT_ROOT } = {}) {
  const { src, destDir, dest } = resolveInstallPaths(profileHome ?? resolveProfileHome({ profile }), root);
  if (!existsSync(src)) {
    throw new Error(`install source missing: ${src}`);
  }
  mkdirSync(destDir, { recursive: true });
  // Atomic publish: write temp file in the destination dir, verify its
  // hash, then rename over the target so readers never see a half copy.
  const srcBytes = readFileSync(src);
  const srcHash = sha256Bytes(srcBytes);
  const tmp = `${dest}.tmp.${process.pid}`;
  writeFileSync(tmp, srcBytes, { mode: 0o644 });
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

function parseArgs(argv) {
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
