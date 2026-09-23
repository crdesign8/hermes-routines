import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');
const installDoc = path.join(root, 'docs', 'INSTALL.md');

describe('coexistence', () => {
  it('routines mounts as routes (not panes) at /routines', () => {
    const src = readFileSync(routinesPath, 'utf8');
    assert.match(src, /ROUTES_AREA/, 'must mount via ROUTES_AREA');
    assert.match(src, /SIDEBAR_NAV_AREA/, 'nav row via SIDEBAR_NAV_AREA');
    assert.equal(src.includes("'panes'"), false, 'must never register panes area');
    assert.equal(src.includes('"panes"'), false, 'must never register panes area');
    assert.match(src, /path:\s*['"]\/routines['"]/, 'page path must be /routines');
  });

  it('does not collide with /cron and INSTALL.md documents coexistence', () => {
    const src = readFileSync(routinesPath, 'utf8');
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
