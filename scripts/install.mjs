// Install mapping for hermes-routines (phase 4).
// Copies desktop/routines.js to <profile-home>/plugins/routines/plugin.js
// byte-identical, verified by sha256. Folder name equals the registered
// route id `routines`. Only node: builtins; zero relative imports,
// zero bare specifiers.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'hermes-routines';
export const PLUGIN_DIR_NAME = 'routines';
export const PLUGIN_FILE_NAME = 'plugin.js';
export const SOURCE_REL = path.join('desktop', 'routines.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

export function resolveProfileHome({ profileHome, profile } = {}) {
  if (profileHome && String(profileHome).trim()) return String(profileHome);
  const envHome = process.env.HERMES_PROFILE_HOME;
  if (envHome && String(envHome).trim()) return String(envHome);
  const name = profile || process.env.HERMES_PROFILE || 'default';
  return path.join(homedir(), '.hermes', 'profiles', String(name));
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

export function install({ profileHome, profile, root = DEFAULT_ROOT } = {}) {
  const { src, destDir, dest } = resolveInstallPaths(profileHome ?? resolveProfileHome({ profile }), root);
  if (!existsSync(src)) {
    throw new Error(`install source missing: ${src}`);
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  const srcHash = sha256File(src);
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

