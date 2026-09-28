import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./stubs/sdk-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.resolve(here, '..', 'src', 'views', 'routinesStyles.ts');

const routines = await import('../desktop/plugin.js');

const ROUTE = { connectionId: 'c1', mode: 'remote', profile: 'p1', targetProfile: 't1' };

// Fixture mirrors the upstream contract: a technical job_id and a human
// name are distinct, so an id never leaks into the run block by accident.
const BASE = {
  job_id: 'abc123',
  name: 'morning-digest',
  schedule: '0 9 * * *',
  schedule_display: 'Daily at 09:00',
  prompt: 'Summarize yesterday.',
  enabled: true,
  state: 'scheduled',
};

// formatWhen/formatDate read the wall clock, so a relative time is asserted
// by shape and the absolute date by the value the helpers produce for the
// same input — never by a hardcoded distance that rots with the calendar.
const SUCCESS_RUN = '2020-01-01T09:00:00Z';
const FAILURE_RUN = '2020-01-01T09:00:00Z';

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

function texts(tree) {
  const out = [];
  function walk(n) {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (typeof n === 'object' && 'type' in n) {
      // A composed component holds its copy in the callee, not in props, so
      // walking props alone would drop it from the render.
      if (typeof n.type === 'function') {
        try {
          walk(n.type(n.props || {}));
        } catch {
          // leaf or non-evaluable
        }
        return;
      }
      walk(n.props ? n.props.children : null);
    }
  }
  walk(tree);
  return out;
}

function lastRunBlock(job) {
  const nodes = collect(renderInspector(job));
  const block = nodes.find((n) => n.props?.className === 'hr-inspector-last-run');
  assert.ok(block, 'the inspector must always carry a LAST EXECUTION block');
  return block;
}

/** The value nodes of the row carrying `label`, or null when absent. */
function rowFor(job, label) {
  for (const node of collect(lastRunBlock(job))) {
    if (node.type !== 'div' || !node.props?.className?.includes('hr-detail')) continue;
    const kids = collect(node);
    const found = kids.find((k) => k.props?.className === 'hr-detail-label');
    if (found && texts(found).join('') === label) {
      return kids.filter((k) => k !== node && k.props?.className !== 'hr-detail-label');
    }
  }
  return null;
}

describe('inspector last-execution block', () => {
  it('is visually separated from the editable composer content', () => {
    // routinesStyles.ts is not on the exported surface, so the rule is read
    // from source — the same way the other contract tests pin conventions.
    const css = readFileSync(stylesPath, 'utf8');
    const rule = /\.hr-inspector-last-run \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'the block must have its own style rule');
    assert.match(rule[1], /border-top:/, 'a separator keeps it out of the field stack');
    assert.match(rule[1], /padding-top:/, 'the separator needs breathing room');
  });

  it('renders the outcome of a successful run without stale error text', () => {
    // A success row that still carries a leftover last_fire_error must not
    // surface it: the error belongs to the failed run, not to this one.
    const job = {
      ...BASE,
      last_run_at: SUCCESS_RUN,
      last_status: 'success',
      last_fire_error: 'stale failure from the previous run',
    };
    const all = texts(renderInspector(job)).join(' ');
    assert.match(all, /LAST EXECUTION/);
    assert.match(all, /Success/);
    assert.doesNotMatch(all, /stale failure from the previous run/, 'no stale error text on a success');
    assert.doesNotMatch(all, /Issue/, 'no issue row without a failure');
    assert.doesNotMatch(all, /Failed/, 'no failure label on a success');

    const kind = routines.lastExecutionOf(job).resultKind;
    assert.equal(kind, 'success', 'the tone must be the success tone');

    const runRow = rowFor(job, 'Last run');
    assert.ok(runRow !== null, 'a routine with history states when it last ran');
    assert.match(
      runRow.map((n) => n.props?.className).filter(Boolean).join(' '),
      /hr-detail-value/,
      'the run row reuses the shared detail styling',
    );
  });

  it('shows the failure reason on its own row, distinct from the outcome', () => {
    const job = {
      ...BASE,
      last_run_at: FAILURE_RUN,
      last_status: 'failed',
      last_fire_error: 'upstream refused the connection',
    };
    const all = texts(renderInspector(job)).join(' ');
    assert.match(all, /LAST EXECUTION/);
    assert.match(all, /Failed/, 'the outcome stays a short label');
    assert.match(all, /upstream refused the connection/, 'the reason is shown verbatim');

    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.resultKind, 'error', 'the tone must be the error tone');
    assert.equal(execution.issue, 'upstream refused the connection', 'issue carries the detail');
    assert.equal(execution.resultText, 'Failed', 'the detail never replaces the outcome label');

    // The failure reason is a distinct row, not the outcome cell: the badge
    // keeps the short 'Failed' label and the reason reads on its own line.
    assert.ok(rowFor(job, 'Issue') !== null, 'the failure needs its own row');
    const outcome = rowFor(job, 'Last result');
    assert.ok(outcome !== null, 'the outcome keeps its row');
    assert.match(
      outcome.map((n) => n.props?.className).filter(Boolean).join(' '),
      /hr-result-error/,
      'the outcome carries the error tone',
    );
  });

  it('states the empty case explicitly instead of rendering a placeholder as data', () => {
    const job = { ...BASE };
    const all = texts(renderInspector(job)).join(' ');
    assert.match(all, /LAST EXECUTION/, 'the block is always present');
    assert.match(all, /No runs yet\./, 'the no-run state is stated in words');

    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.known, false, 'a row without run history is unknown');
    assert.equal(execution.lastRun, null);
    assert.equal(execution.issue, null);
    assert.equal(execution.nextRun, null);
  });

  it('never shows a run distance for a malformed timestamp', () => {
    const job = { ...BASE, last_run_at: 'not-a-timestamp', last_status: 'success' };
    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.lastRun, null, 'unparseable input yields no claim');
    assert.equal(execution.resultText, 'Success', 'the outcome still comes from the status');

    // The row must disappear with its value: a label with nothing after it
    // reads as a broken field, not as absent data.
    assert.equal(rowFor(job, 'Last run'), null, 'no label without a value');
    const all = texts(renderInspector(job)).join(' ');
    assert.doesNotMatch(all, /Last run/, 'the malformed timestamp paints no run row');
    assert.match(all, /Success/, 'the outcome still shows');
  });

  it('keeps the outcome readable when the backend omits the status token', () => {
    const job = { ...BASE, last_run_at: SUCCESS_RUN };
    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.known, true, 'a timestamp alone is run history');
    assert.equal(execution.resultKind, 'neutral');
    assert.equal(execution.resultText, '—', 'no status means no invented outcome');
  });

  it('does not call a never-run routine failed on a benign pause reason', () => {
    // issueOf also reads non-run fields. A routine that never fired and was
    // paused by the user has no execution to report, so the block must state
    // the empty case instead of rendering a failure nobody observed.
    const job = { ...BASE, state: 'paused', paused_reason: 'paused by user' };
    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.known, false, 'a paused reason is not run history');
    assert.equal(execution.issue, null, 'no issue is claimed');
    assert.match(texts(renderInspector(job)).join(' '), /No runs yet\./);
  });

  it('leaves the empty state to a job whose error never produced a run', () => {
    // A lifecycle `error` with no recorded run is a job-level condition, not
    // an execution: the row's status indicator already says Error with its
    // own vocabulary. This block reports executions, so claiming one would
    // be data the backend never gave.
    const job = { ...BASE, state: 'error' };
    const execution = routines.lastExecutionOf(job);
    assert.equal(execution.known, false, 'no run was recorded');
    assert.equal(execution.issue, null, 'no failure reason is claimed');

    const all = texts(renderInspector(job)).join(' ');
    assert.match(all, /No runs yet\./, 'the block states the empty case');
    assert.doesNotMatch(all, /Failed/, 'and invents no outcome');
  });

  it('offers next run only while the routine can still fire', () => {
    const next = '2030-01-01T09:00:00-03:00';
    const active = routines.lastExecutionOf({ ...BASE, next_run_at: next });
    assert.ok(active.nextRun !== null, 'an active routine keeps its next run');
    assert.ok(rowFor({ ...BASE, next_run_at: next }, 'Next run') !== null, 'and the inspector shows it');

    // A terminal routine has no future: showing a next run would be a lie
    // the expanded card already refuses to tell.
    const completed = routines.lastExecutionOf({ ...BASE, next_run_at: next, state: 'completed' });
    assert.equal(completed.nextRun, null, 'a completed routine has no next run');
    assert.equal(rowFor({ ...BASE, next_run_at: next, state: 'completed' }, 'Next run'), null, 'nor a rendered row');

    const paused = routines.lastExecutionOf({ ...BASE, next_run_at: next, state: 'paused' });
    assert.equal(paused.nextRun, null, 'a paused routine has no next run');
    assert.equal(rowFor({ ...BASE, next_run_at: next, state: 'paused' }, 'Next run'), null, 'nor a rendered row');
  });

  it('reads the run outcome from camelCase rows too', () => {
    // The backend owns the row shape; the block must not be snake_case-only.
    const job = {
      ...BASE,
      lastRunAt: FAILURE_RUN,
      lastStatus: 'failed',
      lastFireError: 'camelCase failure detail',
    };
    const all = texts(renderInspector(job)).join(' ');
    assert.match(all, /camelCase failure detail/);
  });

  it('agrees with the expanded card and the health indicator', () => {
    const job = { ...BASE, last_run_at: FAILURE_RUN, last_status: 'failed', last_fire_error: 'boom' };

    // Compared at the rendered surface, not helper against helper: the card
    // and the inspector must paint the same outcome for the same row.
    const card = collect(routines.RoutineDetails({ job }));
    const block = collect(lastRunBlock(job));

    const toneOf = (nodes) => nodes
      .map((n) => n.props?.className)
      .filter((c) => typeof c === 'string' && c.startsWith('hr-result'))
      .join('');
    assert.ok(toneOf(card).includes('hr-result-error'), 'the card paints the error tone');
    assert.equal(toneOf(block), toneOf(card), 'the inspector paints the same tone');

    // The card inlines the reason in its outcome cell; the inspector gives it
    // its own row. The words reaching the user must be identical either way.
    assert.equal(
      texts(card).join(' ').includes('boom'),
      texts(block).join(' ').includes('boom'),
      'the failure reason reaches both surfaces',
    );

    assert.equal(routines.routineHealthOf(job), 'failed', 'the indicator still reports the failure');
    assert.equal(routines.lastExecutionOf(job).known, true);
  });
});
