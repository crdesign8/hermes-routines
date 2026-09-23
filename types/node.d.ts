// Minimal node: ambient types so `tsc --noEmit` can check desktop/scripts
// without @types/node (zero-deps repo: no devDeps). Intentionally
// permissive (`any`): the static contract pins the SDK/host surface, not
// Node internals. Only the builtins imported by desktop/ + scripts/ are
// declared here.

declare module 'node:fs' {
  export function readFileSync(...args: any[]): any;
  export function writeFileSync(...args: any[]): any;
  export function existsSync(...args: any[]): any;
  export function mkdirSync(...args: any[]): any;
  export function renameSync(...args: any[]): any;
  export function unlinkSync(...args: any[]): any;
  export function readdirSync(...args: any[]): any;
  export function lstatSync(...args: any[]): any;
  export function openSync(...args: any[]): any;
  export function writeSync(...args: any[]): any;
  export function closeSync(...args: any[]): any;
  export function fsyncSync(...args: any[]): any;
}

declare module 'node:path' {
  const path: any;
  export default path;
  export function dirname(...args: any[]): any;
  export function resolve(...args: any[]): any;
  export function join(...args: any[]): any;
  export function relative(...args: any[]): any;
  export function basename(...args: any[]): any;
}

declare module 'node:url' {
  export function fileURLToPath(...args: any[]): any;
  export function pathToFileURL(...args: any[]): any;
}

declare module 'node:crypto' {
  export function createHash(...args: any[]): any;
  export function randomBytes(...args: any[]): any;
}

declare module 'node:os' {
  export function homedir(...args: any[]): any;
}

declare module 'node:child_process' {
  export function execFileSync(...args: any[]): any;
}

// Minimal process global used by scripts (argv/env/exit/stdout/stderr).
declare const process: any;

// structuredClone is available on Node >= 17 but missing from the default
// ES2022 lib without DOM; the cron builders rely on it (fail-closed wraps
// DataCloneError as TypeError).
declare function structuredClone(value: any, options?: any): any;
