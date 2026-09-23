import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const installDoc = path.join(root, 'docs', 'INSTALL.md');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

describe('coexistence', () => {
  it('routines mounts as routes (not panes) at /routines', () => {
    const src = readSrcTree();
    assert.match(src, /ROUTES_AREA/, 'must mount via ROUTES_AREA');
    assert.match(src, /SIDEBAR_NAV_AREA/, 'nav row via SIDEBAR_NAV_AREA');
    assert.equal(src.includes("'panes'"), false, 'must never register panes area');
    assert.equal(src.includes('"panes"'), false, 'must never register panes area');
    // Path flows from the ROUTE_PATH constant (single source of truth).
    assert.match(src, /const ROUTE_PATH = ['"]\/routines['"]/, 'ROUTE_PATH constant must be /routines');
    assert.match(src, /path:\s*ROUTE_PATH/, 'page path must use ROUTE_PATH');
  });

  it('does not collide with /cron and INSTALL.md documents coexistence', () => {
    const src = readSrcTree();
    assert.equal(/path:\s*['"]\/cron['"]/.test(src), false, 'must not register /cron path');
    assert.equal(/id:\s*['"]cron['"]/.test(src), false, 'must not register cron id');
    assert.equal(existsSync(installDoc), true, 'docs/INSTALL.md must exist');
    const doc = readFileSync(installDoc, 'utf8');
    assert.match(doc, /\/routines/, 'docs must state the /routines mapping');
    assert.match(doc, /\/cron/, 'docs must address /cron non-collision');
    assert.match(doc, /pane/i, 'docs must cover panes vs routes coexistence');
    assert.match(doc, /reload/i, 'docs must cover reload after install');
  });
});
