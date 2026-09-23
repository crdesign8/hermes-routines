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
    // Single source of truth: constants declared once, used in register().
    assert.match(src, /const ROUTE_ID = ['"]routines['"]/, 'ROUTE_ID constant must be routines');
    assert.match(src, /const ROUTE_PATH = ['"]\/routines['"]/, 'ROUTE_PATH constant must be /routines');
    assert.match(src, /id:\s*ROUTE_ID/, 'route registration must use ROUTE_ID (no hardcoded literal)');
    assert.match(src, /path:\s*ROUTE_PATH/, 'route path must use ROUTE_PATH (no hardcoded literal)');
  });

  it('registers sidebar row id sidebar-nav via SIDEBAR_NAV_AREA and never registers layout zones', () => {
    const src = readRoutines();
    assert.match(src, /SIDEBAR_NAV_AREA/, 'must reference SIDEBAR_NAV_AREA');
    assert.match(src, /['"]sidebar\.nav['"]/, 'must use sidebar.nav area value');
    assert.match(src, /const SIDEBAR_ID = ['"]sidebar-nav['"]/, 'SIDEBAR_ID constant must be sidebar-nav');
    assert.match(src, /id:\s*SIDEBAR_ID/, 'sidebar registration must use SIDEBAR_ID (no hardcoded literal)');
    assert.match(src, /label:\s*['"]Routines['"]/, 'sidebar row label must be Routines');
    assert.equal(src.includes("'panes'"), false, 'must never register panes area');
    assert.equal(src.includes('"panes"'), false, 'must never register panes area');
  });
});
