import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Run the real installer CLI in a child process (separate pid, separate
 * temp name) so two parallel runs exercise the same race real operators hit.
 */
function runInstallCli(home) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(root, 'scripts', 'install.mjs'), 'install', `--hermes-home=${home}`, `--root=${root}`],
      { encoding: 'utf8', timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`install cli failed: ${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

function parseSha(stdout) {
  const m = /sha256\s+([0-9a-f]{64})/.exec(stdout);
  assert.ok(m, `cli output must report sha256, got: ${stdout}`);
  return m[1];
}

describe('install-concurrency', () => {
  it('two parallel installs: no collision, no half-copy, hash intact, no tmp leftovers', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'routines-conc-'));
    const [a, b] = await Promise.all([runInstallCli(home), runInstallCli(home)]);

    const hashA = parseSha(a.stdout);
    const hashB = parseSha(b.stdout);
    assert.equal(hashA, hashB, 'parallel installs must agree on content hash');

    // src is the GENERATED artifact (scripts/install.mjs SOURCE_REL).
    // Byte-identity is pinned via length + sha256: a strict deepEqual
    // over two large Buffers of differing length busy-loops the event
    // loop on Node 24 (observed while migrating off desktop/routines.js).
    const srcBytes = readFileSync(path.join(root, 'desktop', 'plugin.js'));
    const dest = path.join(home, 'desktop-plugins', 'hermes-routines', 'plugin.js');
    const destBytes = readFileSync(dest);
    assert.equal(destBytes.length, srcBytes.length, 'dest must be byte-identical (no half-copy)');
    assert.equal(sha256(destBytes), sha256(srcBytes), 'dest sha256 must match src');
    assert.equal(hashA, sha256(srcBytes), 'reported sha256 must match src');

    const entries = readdirSync(path.join(home, 'desktop-plugins', 'hermes-routines'));
    assert.deepEqual(
      entries.filter((e) => e.includes('.tmp.')),
      [],
      'no staging temp files may be left behind',
    );
  });

  it('installer stages via random temp + exclusive create + fsync (static pin)', () => {
    const src = readFileSync(path.join(root, 'scripts', 'install.mjs'), 'utf8');
    assert.match(src, /randomBytes/, 'temp name must use crypto.randomBytes');
    assert.match(src, /['"]wx['"]/, 'staging must use exclusive wx create');
    assert.match(src, /fsyncSync/, 'staging must fsync before rename');
    assert.match(src, /\.tmp\.\$\{process\.pid\}/, 'temp name must still carry the pid');
  });
});
