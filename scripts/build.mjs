// @ts-check
// Build the distributable Desktop plugin artifact.
//
//   node scripts/build.mjs            write desktop/plugin.js
//   node scripts/build.mjs --check    rebuild in memory and fail if the
//                                     committed artifact is stale
//
// src/**/*.{ts,tsx} is the only editable source of truth; desktop/plugin.js
// is GENERATED, unminified (auditable before catalog submission) and
// deterministic — same inputs + same pinned esbuild produce byte-identical
// output, which is what --check verifies.
//
// Externalized (never bundled): '@hermes/plugin-sdk', 'react' and
// 'react/jsx-runtime' — the Desktop host provides them, and a second React
// copy would break hooks. __PLUGIN_VERSION__ is replaced with the
// package.json version literal so the artifact carries the release pin.
//
// Only node: builtins plus the devDependency `esbuild`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const ENTRY = path.join('src', 'plugin.tsx');
export const OUTFILE = path.join('desktop', 'plugin.js');
/** Specifiers the Desktop host provides; anything else must never ship. */
export const EXTERNALS = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/**
 * @param {string} version package.json version to inject
 * @returns {import('esbuild').BuildOptions}
 */
export function buildOptions(version) {
  return {
    entryPoints: [path.join(root, ENTRY)],
    outfile: path.join(root, OUTFILE),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    jsxDev: false,
    external: EXTERNALS,
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'error',
    define: { __PLUGIN_VERSION__: JSON.stringify(version) },
    banner: { js: banner(version) },
  };
}

/**
 * Header of the generated artifact: unmistakable, and it names the real
 * source plus the two commands (build / check) a human needs.
 *
 * @param {string} version
 * @returns {string}
 */
export function banner(version) {
  return [
    `// AUTO-GENERATED FILE - DO NOT EDIT.`,
    `// hermes-routines v${version} | source of truth: src/**.ts(x)`,
    `// Regenerate with: npm run build   |   Verify freshness: npm run check-generated`,
  ].join('\n');
}

/**
 * @param {import('esbuild').BuildOptions} options
 * @returns {Promise<Uint8Array>}
 */
async function bundle(options) {
  const result = await build({ ...options, write: false });
  const outputs = result.outputFiles ?? [];
  const output = outputs.at(0);
  if (outputs.length !== 1 || output === undefined) {
    throw new Error(`build produced ${outputs.length} outputs, expected exactly 1`);
  }
  return output.contents;
}

async function main() {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const checkOnly = process.argv.includes('--check');
  const bytes = await bundle(buildOptions(String(pkg.version)));
  const target = path.join(root, OUTFILE);

  if (checkOnly) {
    let current = null;
    try {
      current = readFileSync(target);
    } catch {
      // Missing artifact is reported below as a staleness failure.
    }
    if (current === null || !current.equals(bytes)) {
      process.stderr.write(
        `${OUTFILE} is stale or missing: src/ changed without a rebuild.\n` +
          `Run: npm run build\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`check-generated ok: ${OUTFILE} matches src/\n`);
    return;
  }

  writeFileSync(target, bytes);
  process.stdout.write(`build ok: ${ENTRY} -> ${OUTFILE} (${bytes.length} bytes)\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`build failed: ${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
