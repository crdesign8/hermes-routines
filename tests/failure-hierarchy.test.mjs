// Failure hierarchy contract for issue #76.
//
// A failed routine used to lead with raw execution output: exit codes and
// stderr were the primary explanation, and the list signaled failure with
// icon/color alone. The hierarchy is now:
//
//   list row       -> "Last run failed" as TEXT, beside the icon
//   inspector      -> 1. what failed   (generic, never fabricated)
//                     2. the reason    (derived ONLY from known tokens)
//                     3. technical details — collapsed, verbatim evidence
//
// This file pins every acceptance criterion: parsed/known failure,
// unknown failure, long stderr, empty stderr, recovery on a later
// successful run, collapsed technical output, no pollution of success and
// paused states, and accessibility that does not rest on color alone.
// Everything is exercised through the GENERATED artifact
// (desktop/plugin.js), the bundle the Desktop actually loads.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Stub the Desktop-only bare imports so the GENERATED artifact can be
// exercised behaviorally under node:test (zero deps, node: builtins).
register('./stubs/sdk-loader.mjs', import.meta.url);

const routines = await import('../desktop/plugin.js');
const reactStub = await import('./stubs/react-stub.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.resolve(here, '..', 'src', 'views', 'routinesStyles.ts');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };
const HOUR = 60 * 60 * 1000;
const wallClock = (ms) => new Date(Date.now() + ms).toISOString();

const RUN_AT = '2026-06-15T09:00:00Z';
const RECOVERED_RUN_AT = '2026-06-16T09:00:00Z';

const BASE = {
  job_id: 'abc123',
  name: 'nightly-backup',
  schedule: '0 9 * * *',
  prompt: 'Back up the archive.',
  enabled: true,
  state: 'scheduled',
};

/** A run that failed with an unparseable message: the unknown-failure case. */
const UNKNOWN_FAILURE = {
  ...BASE,
  last_run_at: RUN_AT,
  last_status: 'failed',
  last_fire_error: 'the widget recalibrator exploded sideways',
};

/** A run that failed with a canonical machine token: the parsed case. */
const PARSED_FAILURE = {
  ...BASE,
  last_run_at: RUN_AT,
  last_status: 'failed',
  last_fire_error: 'process exited before backup: gpg: command not found',
};

// ── Rendering helpers (the same walkers the other contract tests use) ──

function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    if (typeof node.type === 'function') {
      try {
        collect(node.type(node.props || {}), out);
      } catch {
        // leaf or non-evaluable
      }
    } else {
      collect(node.props ? node.props.children : null, out);
    }
    return out;
  }
  return out;
}

/** Every readable string, one entry per text leaf, in document order. */
function strings(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) strings(child, out);
    return out;
  }
  if (typeof node === 'object' && 'type' in node) {
    if (typeof node.type === 'function') {
      try {
        strings(node.type(node.props || {}), out);
      } catch {
        // leaf or non-evaluable
      }
      return out;
    }
    strings(node.props ? node.props.children : null, out);
  }
  return out;
}

function renderInspector(job) {
  return routines.RoutineInspectorPanel({
    job,
    fallback: 'Routine',
    activeRoute: ROUTE,
    activeProfile: 'p1',
    busy: false,
    disabled: false,
    onClose: () => {},
    onPause: () => {},
    onResume: () => {},
  });
}

function lastRunBlock(job) {
  const block = collect(renderInspector(job)).find(
    (n) => n.props?.className === 'hr-inspector-last-run',
  );
  assert.ok(block, 'the inspector must always carry a LAST EXECUTION block');
  return block;
}

/** The value cells of the detail row carrying `label`, or null. */
function rowValue(block, label) {
  for (const node of collect(block)) {
    if (node.type !== 'div' || !node.props?.className?.includes('hr-detail')) continue;
    const kids = collect(node);
    const found = kids.find((k) => k.props?.className === 'hr-detail-label');
    if (found && strings(found).join('') === label) {
      return kids
        .filter((k) => k !== node && k.props?.className !== 'hr-detail-label')
        .map((k) => strings(k).join(''))
        .join('');
    }
  }
  return null;
}

/** The native disclosure holding the technical evidence, or null. */
function technicalDetails(job) {
  return collect(lastRunBlock(job)).find((n) => n.type === 'details') ?? null;
}

// ── Page harness (list rows) ──

function reduce(events) {
  let state = routines.initialRoutinesState();
  for (const event of events) state = routines.routinesViewReducer(state, event);
  return state;
}

function paint(jobs) {
  const state = reduce([
    { type: 'routes-loaded', routes: [ROUTE], profile: 'p1', connectionId: 'c1' },
    { type: 'list-loaded', jobs, key: 'c1::p1' },
  ]);
  // RoutinesPage hooks: [state, routesNonce]. Preset before the render so
  // the first paint already sees the loaded list.
  const noop = () => {};
  reactStub.__presetStates([[state, noop], [0, noop]]);
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

/** The collapsed subtitle text of the single row on the page. */
function subtitleText(page) {
  const sub = collect(page).find((n) => n.props?.className === 'hr-row-subtitle');
  assert.ok(sub, 'the row must render a subtitle');
  return strings(sub);
}

// ── List row: failure as text, never color alone ──

describe('list row states the failure in text (issue #76)', () => {
  it('a failed row spells the failure out beside the icon, not instead of the schedule', () => {
    const page = paint([
      {
        ...BASE,
        last_run_at: RUN_AT,
        last_status: 'failed',
        last_fire_error: 'upstream refused the connection',
        next_run_at: wallClock(2 * HOUR),
      },
    ]);
    const parts = subtitleText(page);
    const joined = parts.join(' ');
    assert.match(joined, /Last run failed/, 'the failure is stated in words');
    assert.match(joined, /Every day at 09:00/, 'the schedule stays visible');
    assert.match(joined, /Next run in 2 hours/, 'the next run stays visible');

    // Reading order: schedule, then the failure, then the next run.
    const at = (needle) => parts.findIndex((p) => p.includes(needle));
    assert.ok(at('Every day') < at('Last run failed'), 'the failure follows the schedule');
    assert.ok(at('Last run failed') < at('Next run'), 'and precedes the next run');

    // The words are painted, not announced-only: color is never the signal.
    const failedSpan = collect(page).find((n) => n.props?.className === 'hr-sub-failed');
    assert.ok(failedSpan, 'the failure copy carries its own class');
    assert.equal(
      failedSpan.props.className.includes('hr-sr-only'),
      false,
      'the failure copy is visible, not screen-reader-only',
    );
    // The icon stays: text is added, not substituted.
    const indicators = collect(page).filter((n) =>
      typeof n.props?.className === 'string' && n.props.className.includes('hr-status-indicator'),
    );
    assert.equal(indicators.length, 1);
    assert.match(indicators[0].props.className, /hr-status-failed/);
  });

  it('a healthy row grows no failure affordance at all', () => {
    const page = paint([
      { ...BASE, last_run_at: RUN_AT, last_status: 'success', next_run_at: wallClock(2 * HOUR) },
    ]);
    // Scoped to the row's copy: the page also carries the stylesheet as a
    // text node, and that is not something a user reads as a claim.
    assert.equal(
      subtitleText(page).some((p) => /failed/i.test(p)),
      false,
      'a successful run claims no failure',
    );
    assert.equal(
      collect(page).some((n) => n.props?.className === 'hr-sub-failed'),
      false,
      'no failure span is rendered',
    );
    const indicators = collect(page).filter((n) =>
      typeof n.props?.className === 'string' && n.props.className.includes('hr-status-indicator'),
    );
    assert.match(indicators[0].props.className, /hr-status-active/, 'and no failed indicator');
    assert.ok(
      collect(page).some((n) => n.props?.className === 'hr-sub-next'),
      'the schedule copy is untouched',
    );
  });

  it('a success carrying a stale error string is not repainted as failed', () => {
    // The outcome belongs to the run: a leftover last_fire_error from an
    // earlier failure cannot repaint a successful row (issue #76 — success
    // states must not be polluted with error affordances).
    const job = {
      ...BASE,
      last_run_at: RUN_AT,
      last_status: 'success',
      last_fire_error: 'stale failure from the previous run',
      next_run_at: wallClock(2 * HOUR),
    };
    assert.equal(routines.routineHealthOf(job), 'healthy', 'a recorded success wins');
    const page = paint([job]);
    assert.equal(
      subtitleText(page).some((p) => /failed/i.test(p)),
      false,
      'no red words for a green run',
    );
    assert.equal(
      collect(page).some((n) => n.props?.className === 'hr-sub-failed'),
      false,
      'no failure span is rendered',
    );
    const indicators = collect(page).filter((n) =>
      typeof n.props?.className === 'string' && n.props.className.includes('hr-status-indicator'),
    );
    assert.match(indicators[0].props.className, /hr-status-active/, 'the icon agrees');
  });

  it('a clean pause stays pure Paused', () => {
    const page = paint([
      { ...BASE, enabled: false, state: 'paused', paused_reason: 'paused by user' },
    ]);
    const joined = subtitleText(page).join(' ');
    assert.match(joined, /Paused/);
    assert.doesNotMatch(joined, /failed/i, 'a clean pause carries no failure copy');
  });

  it('a paused row whose last run failed says so in words too', () => {
    const page = paint([
      { ...BASE, enabled: false, state: 'paused', last_run_at: RUN_AT, last_status: 'failed' },
    ]);
    const parts = subtitleText(page);
    const joined = parts.join(' ');
    assert.match(joined, /Paused/);
    assert.match(joined, /Last run failed/, 'the hidden indicator label becomes visible copy');
  });

  it('the failure copy rule is text plus color, defined in the stylesheet', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const rule = /\.hr-sub-failed \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'the failure copy must have its own style rule');
    assert.match(rule[1], /color:/, 'it is painted with a failure color');
    assert.match(rule[1], /font-weight:/, 'and with weight, so it does not rest on hue alone');
  });
});

// ── Inspector: summary first, raw evidence collapsed ──

describe('inspector failure hierarchy (issue #76)', () => {
  it('shows the concise summary and derived reason BEFORE any raw evidence', () => {
    const job = PARSED_FAILURE;
    const flat = strings(lastRunBlock(job));
    const at = (needle) => flat.findIndex((s) => s.includes(needle));

    const summary = at('The last run failed.');
    assert.ok(summary >= 0, 'the generic summary is always stated');
    const reason = at('A required command or file was not found.');
    assert.ok(reason >= 0, 'a known token derives a concise reason');
    const tech = at('Technical details');
    assert.ok(tech >= 0, 'the technical block exists');
    const raw = at('gpg: command not found');
    assert.ok(raw >= 0, 'the raw evidence survives');

    assert.ok(summary < reason, 'what failed comes before why');
    assert.ok(reason < tech, 'the reason comes before the technical detail');
    assert.ok(tech < raw, 'and the raw output comes last');

    // The block itself is collapsed by default: a native disclosure, no
    // `open` attribute until the user asks for it.
    const details = technicalDetails(job);
    assert.ok(details, 'a failed run exposes its technical details');
    assert.equal(Boolean(details.props.open), false, 'technical details start collapsed');
    assert.equal(details.type, 'details', 'the disclosure is native (keyboard accessible)');
    assert.ok(
      collect(lastRunBlock(job)).some((n) => n.type === 'summary'),
      'the disclosure carries a real summary element',
    );
  });

  it('an unknown failure falls back safely without a fabricated explanation', () => {
    const job = UNKNOWN_FAILURE;
    const explanation = routines.explainFailureOf(job);
    assert.ok(explanation !== null, 'a failed run is explained');
    assert.equal(explanation.summary, routines.GENERIC_FAILURE_SUMMARY);
    assert.equal(explanation.reason, null, 'unparseable output derives no reason');

    const block = lastRunBlock(job);
    assert.equal(
      collect(block).some((n) => n.props?.className === 'hr-failure-summary-reason'),
      false,
      'no derived sentence is painted for an unknown failure',
    );
    const flat = strings(block);
    assert.ok(flat.some((s) => s.includes('The last run failed.')), 'the generic headline shows');
    // The raw evidence is still there, verbatim, behind the disclosure.
    assert.ok(
      flat.some((s) => s.includes('the widget recalibrator exploded sideways')),
      'the raw message is preserved, never replaced by a guess',
    );
    // And the domain refuses to guess for arbitrary prose.
    assert.equal(routines.deriveFailureReason('the widget recalibrator exploded sideways'), null);
  });

  it('keeps a long stderr verbatim, without truncating diagnostic output', () => {
    const longStderr = Array.from(
      { length: 40 },
      (_, i) => `line ${String(i).padStart(2, '0')}: ${'x'.repeat(90)}`,
    ).join('\n');
    const job = {
      ...PARSED_FAILURE,
      last_stderr: longStderr,
      last_exit_code: 17,
    };

    const explanation = routines.explainFailureOf(job);
    const stderr = explanation.evidence.find((item) => item.label === 'Stderr');
    assert.ok(stderr, 'the stderr is evidence');
    assert.equal(stderr.value, longStderr, 'the domain never trims or ellipsizes it');

    const rendered = strings(lastRunBlock(job)).join('\n');
    assert.ok(rendered.includes(longStderr), 'the inspector renders every byte of it');
    assert.doesNotMatch(rendered, /…/, 'no ellipsis stands in for dropped output');

    // Wrapped and scrollable, never clipped by CSS.
    const css = readFileSync(stylesPath, 'utf8');
    const rule = /\.hr-tech-value \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'evidence cells have their own rule');
    assert.match(rule[1], /white-space: pre-wrap/, 'newlines survive');
    assert.doesNotMatch(rule[1], /text-overflow: ellipsis/, 'nothing is ellipsized');
    assert.match(rule[1], /overflow-y: auto/, 'long output scrolls inside its own cell');
  });

  it('paints no empty stderr row when the backend sent none', () => {
    for (const last_stderr of ['', '   ', undefined]) {
      const job = { ...UNKNOWN_FAILURE, ...(last_stderr === undefined ? {} : { last_stderr }) };
      const explanation = routines.explainFailureOf(job);
      assert.equal(
        explanation.evidence.some((item) => item.label === 'Stderr'),
        false,
        `absent/empty stderr (${JSON.stringify(last_stderr)}) paints no row`,
      );
      assert.equal(rowValue(lastRunBlock(job), 'Stderr'), null, 'and no label without a value');
    }
    // The rest of the evidence is unaffected.
    const job = { ...UNKNOWN_FAILURE, last_stderr: '' };
    assert.ok(rowValue(lastRunBlock(job), 'Issue') !== null, 'the raw message still shows');
  });

  it('reads exit code, timestamp, message and identifier as evidence rows', () => {
    const job = {
      ...PARSED_FAILURE,
      last_stderr: 'bash: gpg: command not found',
      last_exit_code: 17,
      last_run_id: 'run-42',
    };
    const explanation = routines.explainFailureOf(job);
    assert.deepEqual(
      explanation.evidence.map((item) => item.label),
      ['Exit code', 'Stderr', 'Run timestamp', 'Issue', 'Run id'],
      'evidence reads in disclosure order',
    );
    assert.deepEqual(
      explanation.evidence.map((item) => item.value),
      ['17', 'bash: gpg: command not found', RUN_AT, 'process exited before backup: gpg: command not found', 'run-42'],
    );

    const block = lastRunBlock(job);
    assert.equal(rowValue(block, 'Exit code'), '17');
    assert.equal(rowValue(block, 'Issue'), 'process exited before backup: gpg: command not found');
  });

  it('recovers completely on a later successful run', () => {
    // The backend keeps the previous failure string around; the outcome of
    // the LATEST run is what every surface reports.
    const recovered = {
      ...BASE,
      last_run_at: RECOVERED_RUN_AT,
      last_status: 'success',
      last_fire_error: 'the widget recalibrator exploded sideways',
      last_stderr: 'old stderr from the failed run',
      last_exit_code: 17,
    };
    assert.equal(routines.explainFailureOf(recovered), null, 'no failure left to explain');

    const block = lastRunBlock(recovered);
    const flat = strings(block);
    assert.equal(
      collect(block).some((n) => n.props?.className === 'hr-failure-summary'),
      false,
      'the summary disappears with the failure',
    );
    assert.equal(technicalDetails(recovered), null, 'and so does the technical block');
    assert.ok(flat.some((s) => s.includes('Success')), 'the outcome reads Success');
    assert.doesNotMatch(flat.join(' '), /The last run failed/, 'no stale failure headline');
    assert.doesNotMatch(flat.join(' '), /old stderr/, 'no stale evidence either');
  });

  it('never runs the hierarchy for rows with no failed run to report', () => {
    const cases = [
      ['success', { ...BASE, last_run_at: RUN_AT, last_status: 'success' }],
      ['never run', { ...BASE }],
      [
        'clean pause with a parked reason',
        { ...BASE, state: 'paused', paused_reason: 'paused by user' },
      ],
      ['lifecycle error without a run', { ...BASE, state: 'error' }],
    ];
    for (const [name, job] of cases) {
      assert.equal(routines.explainFailureOf(job), null, `${name} earns no explanation`);
      const block = lastRunBlock(job);
      assert.equal(
        collect(block).some((n) => n.props?.className === 'hr-failure-summary'),
        false,
        `${name} paints no failure summary`,
      );
      assert.equal(technicalDetails(job), null, `${name} paints no technical block`);
    }
    // The never-run row still states its own empty case in words.
    assert.match(strings(lastRunBlock({ ...BASE })).join(' '), /No runs yet\./);
  });

  it('adds no control to the read-only last-execution section', () => {
    // The disclosure is a native details/summary pair — markup, not a
    // widget — so the block stays free of buttons and inputs.
    const block = lastRunBlock(PARSED_FAILURE);
    const controls = collect(block).filter((n) =>
      ['button', 'input', 'textarea', 'select', 'form'].includes(n.type),
    );
    assert.deepEqual(controls, [], 'the last-execution block carries no control');
  });

  it('the stylesheet paints the summary louder than the collapsed evidence', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const head = /\.hr-failure-summary-head \{([^}]*)\}/.exec(css);
    assert.ok(head, 'the headline has its own rule');
    assert.match(head[1], /font-weight: 600/, 'the headline reads first');
    assert.match(head[1], /var\(--ui-text-primary/, 'and in primary text color');

    const details = /\.hr-tech-details \{([^}]*)\}/.exec(css);
    assert.ok(details, 'the technical block has its own rule');
    const summaryRule = /\.hr-tech-summary \{([^}]*)\}/.exec(css);
    assert.ok(summaryRule, 'the disclosure trigger has its own rule');
    assert.match(summaryRule[1], /var\(--ui-text-tertiary/, 'and in tertiary (secondary) color');
  });
});
