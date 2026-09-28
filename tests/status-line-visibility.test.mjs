// Routine count must be stated once, but the polite live region must survive.
//
// Issue #52: the page showed the count twice — once in the toolbar
// (hr-count-right) and again as a permanent bottom line. The live region
// itself stays: assistive tech still hears the count, only the second
// painted copy is gone. Transient feedback (pause/resume/create, loading,
// errors) stays visible because it is the page's operational signal.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

// Stub the Desktop-only bare imports so the GENERATED artifact
// (desktop/plugin.js) can be exercised behaviorally under node:test
// (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const ROUTE_B = { connectionId: 'c2', mode: 'local', profile: 'p2', targetProfile: 'p2' };

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function loaded(routes, profile = 'p1', connectionId = 'c1') {
  return { type: 'routes-loaded', routes, profile, connectionId };
}

function renderView() {
  const items = [];
  routines.register({ register: (c) => items.push(c) });
  const routes = items.filter((c) => c.area === 'routes');
  assert.equal(routes.length, 1, 'a single ROUTES_AREA render means no double-mount');
  let tree = routes[0].render();
  if (tree && typeof tree === 'object' && typeof tree.type === 'function') {
    tree = tree.type(tree.props);
  }
  return tree;
}

function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    if (typeof node.type === 'function') collect(node.type(node.props), out);
    else collect(node.props ? node.props.children : null, out);
    return out;
  }
  return out;
}

function texts(node) {
  return collect(node)
    .map((n) => n.props.children)
    .flat(5)
    .filter((c) => typeof c === 'string');
}

function isSrOnly(node) {
  return Boolean(
    node &&
      typeof node === 'object' &&
      node.props &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('hr-sr-only'),
  );
}

/**
 * What a sighted user actually reads. The stub tree carries no CSS, so
 * visibility is modelled from the same utility class the stylesheet
 * clips: anything inside an `hr-sr-only` subtree is announced-only and
 * never counted as painted copy.
 */
function visibleTexts(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) visibleTexts(child, out);
    return out;
  }
  if (!node || typeof node !== 'object' || !('type' in node)) return out;
  if (isSrOnly(node)) return out;
  // Children may be a string, a node, or an array/fragment: recurse on
  // any non-null object so fragments (the toolbar lives in one) are walked.
  const children = node.props ? node.props.children : null;
  if (children !== null && children !== undefined) {
    if (typeof children === 'string') out.push(children);
    else visibleTexts(children, out);
  }
  if (typeof node.type === 'function') visibleTexts(node.type(node.props), out);
  return out;
}

function paint(state) {
  const noop = () => {};
  reactStub.__presetStates([[state, noop], [0, noop]]);
  return renderView();
}

function readyWith(jobs, extra = []) {
  return reduce([loaded([ROUTE, ROUTE_B], 'p1', 'c1'), { type: 'list-loaded', jobs, key: 'c1::p1' }, ...extra]);
}

/**
 * The bottom polite live region — the one StatusLine owns, not the
 * loading/stale banners that carry role="status" for their own sake.
 */
function liveRegion(tree) {
  return collect(tree).find((n) => n.type === 'p' && n.props.className && n.props.className.includes('hr-status'));
}

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

const JOBS = [
  { job_id: '84c47f11a2bd', name: 'Morning brief', schedule: '0 9 * * *' },
  { job_id: '19bd7c0a3f11', name: 'Evening digest', schedule: '0 18 * * *', disabled: true },
];

describe('status line: the count is announced once, painted once', () => {
  it('settled ready list keeps the count out of the persistent status line', () => {
    const tree = paint(readyWith(JOBS));
    const live = liveRegion(tree);
    assert.ok(live, 'the polite live region must still exist');
    // Still announced — the text is intact for screen readers.
    assert.equal(live.props.children, 'Showing 2 of 2 routines.');
    // But not painted: the sr-only utility keeps it out of the visual flow.
    assert.match(live.props.className, /hr-sr-only/, 'the restated count must be screen-reader only');
  });

  it('the toolbar keeps the single visible count', () => {
    const tree = paint(readyWith(JOBS));
    const toolbarCount = collect(tree).find((n) => n.type === 'span' && n.props.className === 'hr-count-right');
    assert.ok(toolbarCount, 'the primary visible count must stay in the toolbar');
    assert.equal(toolbarCount.props.children, 'Showing all 2 routines.');
  });

  it('a filtered list announces the reduced count without painting it', () => {
    const state = { ...readyWith(JOBS), filter: 'paused' };
    const live = liveRegion(paint(state));
    assert.equal(live.props.children, 'Showing 1 of 2 routines.');
    assert.match(live.props.className, /hr-sr-only/);
  });

  it('the empty state is announced once, not painted twice', () => {
    const tree = paint(readyWith([]));
    const live = liveRegion(tree);
    assert.equal(live.props.children, 'No routines yet.');
    assert.match(live.props.className, /hr-sr-only/);
    // The product empty state remains the visible copy.
    assert.ok(visibleTexts(tree).join(' ').includes('No routines yet'));
  });

  it('keeps role="status" and aria-live="polite" in every state', () => {
    const states = [
      paint(readyWith(JOBS)),
      paint(readyWith([])),
      paint(reduce([loaded([ROUTE], 'p1', 'c1')])),
      paint(reduce([{ type: 'routes-error', error: 'ctx: door shut' }])),
    ];
    for (const tree of states) {
      const live = liveRegion(tree);
      assert.ok(live, 'live region required in every state');
      assert.equal(live.props.role, 'status');
      assert.equal(live.props['aria-live'], 'polite');
      assert.equal(live.props.tabIndex, -1, 'the region stays a programmatic focus target');
    }
  });
});

describe('status line: transient feedback stays visible', () => {
  function feedbackTree(state) {
    const live = liveRegion(paint(state));
    assert.ok(live);
    return live;
  }

  it('a pause confirmation is painted, not hidden', () => {
    const live = feedbackTree(readyWith(JOBS, [{ type: 'notice', notice: 'routine Morning brief paused' }]));
    assert.equal(live.props.children, 'routine Morning brief paused');
    assert.doesNotMatch(live.props.className, /hr-sr-only/, 'operational feedback must remain visible');
  });

  it('a resume confirmation is painted, not hidden', () => {
    const live = feedbackTree(readyWith(JOBS, [{ type: 'notice', notice: 'routine Evening digest resumed' }]));
    assert.equal(live.props.children, 'routine Evening digest resumed');
    assert.doesNotMatch(live.props.className, /hr-sr-only/);
  });

  it('a create confirmation is painted, not hidden', () => {
    const live = feedbackTree(readyWith(JOBS, [{ type: 'notice', notice: 'routine Morning brief created' }]));
    assert.equal(live.props.children, 'routine Morning brief created');
    assert.doesNotMatch(live.props.className, /hr-sr-only/);
  });

  it('a mutation failure is painted, not hidden', () => {
    const live = feedbackTree(readyWith(JOBS, [{ type: 'mutation-error', error: 'failed to pause routine: door shut' }]));
    assert.equal(live.props.children, 'failed to pause routine: door shut');
    assert.doesNotMatch(live.props.className, /hr-sr-only/);
  });

  it('loading is painted, not hidden', () => {
    const live = feedbackTree(reduce([loaded([ROUTE], 'p1', 'c1')]));
    assert.equal(live.props.children, 'Loading routines.');
    assert.doesNotMatch(live.props.className, /hr-sr-only/);
  });

  it('transient feedback outranks a settled count still in state', () => {
    // The notice must win the live region even while the list is READY
    // with rows, so a pause confirmation is never replaced by the count.
    // (In production runMutation dispatches `notice` and then
    // `retry-list`, which nulls the notice — this covers the precedence
    // itself, not that wipe; see the notice/retry ordering issue.)
    const live = feedbackTree(readyWith(JOBS, [{ type: 'notice', notice: 'routine Morning brief paused' }]));
    assert.equal(live.props.children, 'routine Morning brief paused');
    assert.doesNotMatch(live.props.className, /hr-sr-only/);
  });
});

describe('status line: source contract', () => {
  it('the count is painted exactly once for a settled list', () => {
    // The real invariant, checked on the rendered tree rather than on
    // source text: the count appears as visible copy in the toolbar and
    // nowhere else. The live region still holds the same string, but
    // under the sr-only utility, so it is announced and not painted.
    for (const state of [readyWith(JOBS), { ...readyWith(JOBS), filter: 'paused' }]) {
      const tree = paint(state);
      const visibleCount = visibleTexts(tree).filter((t) => /\bShowing\b.*routines\./.test(t));
      assert.equal(visibleCount.length, 1, 'exactly one visible count line, in the toolbar');
      const live = liveRegion(tree);
      assert.match(live.props.children, /\bShowing\b.*routines\./, 'the count is still announced');
      assert.match(live.props.className, /hr-sr-only/, 'the announced copy is not the painted one');
    }
  });

  it('the live region stays a polite status and the count stays announced', () => {
    const src = readSrcTree();
    assert.match(src, /aria-live.*polite/, 'polite live region for updates');
    assert.match(src, /role.*status/, 'status role preserved');
    // Hiding is via the shared sr-only utility, never display:none or removal.
    assert.match(src, /hr-sr-only/, 'the sr-only utility is the hiding mechanism');
  });

  it('the sr-only utility is a real screen-reader-only clip, not display:none', () => {
    const src = readSrcTree();
    assert.match(src, /\.hr-sr-only/, 'utility class defined');
    assert.doesNotMatch(src, /\.hr-sr-only[^{]*\{[^}]*display:\s*none/, 'sr-only must not use display:none');
  });

  it('the restated status line takes no visual footprint of its own', () => {
    const src = readSrcTree();
    // The status line's own margin-top would otherwise outlive the clip
    // and leave an invisible gap at the bottom of the page. The override
    // must be declared after .hr-status and must not reintroduce spacing.
    const statusAt = src.indexOf('.hr-status {');
    const overrideAt = src.indexOf('.hr-status.hr-sr-only');
    assert.ok(statusAt !== -1, '.hr-status rule exists');
    assert.ok(overrideAt !== -1, 'the restated status line has an explicit override');
    assert.ok(overrideAt > statusAt, 'the override must win the cascade (declared after .hr-status)');
    assert.doesNotMatch(
      src.slice(overrideAt, overrideAt + 80),
      /margin-top:\s*\d/,
      'the restated status line must not keep top spacing',
    );
  });
});
