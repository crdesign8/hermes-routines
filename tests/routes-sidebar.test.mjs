import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routinesPath = path.join(root, 'desktop', 'routines.js');

function readRoutines() {
  return readFileSync(routinesPath, 'utf8');
}

describe('routes-sidebar', () => {
  it('registers route id routines at path /routines via ROUTES_AREA', () => {
    const src = readRoutines();
    assert.match(src, /ROUTES_AREA/, 'must reference ROUTES_AREA');
    assert.match(src, /['"]routes['"]/, 'must use routes area value');
    assert.match(src, /id:\s*['"]routines['"]/, 'route id must be routines');
    assert.match(src, /path:\s*['"]\/routines['"]/, 'route path must be /routines');
  });

  it('registers sidebar row id sidebar-nav via SIDEBAR_NAV_AREA and never registers layout zones', () => {
    const src = readRoutines();
    assert.match(src, /SIDEBAR_NAV_AREA/, 'must reference SIDEBAR_NAV_AREA');
    assert.match(src, /['"]sidebar\.nav['"]/, 'must use sidebar.nav area value');
    assert.match(src, /id:\s*['"]sidebar-nav['"]/, 'sidebar row id must be sidebar-nav');
    assert.match(src, /label:\s*['"]Routines['"]/, 'sidebar row label must be Routines');
    assert.equal(src.includes("'panes'"), false, 'must never register panes area');
    assert.equal(src.includes('"panes"'), false, 'must never register panes area');
  });
});
