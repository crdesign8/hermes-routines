import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  LabelizerError,
  parsePolicyYaml,
  validatePolicy,
  classifyIssue,
  computeDiff,
  decisionKey,
} from '../scripts/issue-triage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function loadPolicy() {
  const policy = parsePolicyYaml(readFileSync(path.join(root, '.github', 'label-policy.yml'), 'utf8'));
  const { managed } = validatePolicy(policy);
  return { policy, managed };
}

describe('label-policy', () => {
  it('policy validates: version 1 with 15 managed labels', () => {
    const { policy, managed } = loadPolicy();
    assert.equal(policy.version, 1);
    assert.equal(managed.size, 15);
  });

  it('title prefixes project the type (case-insensitive)', () => {
    const { policy } = loadPolicy();
    assert.ok(classifyIssue({ title: 'fix: crash on empty list', body: '' }, policy).includes('type:bug'));
    assert.ok(classifyIssue({ title: 'Feat: new filter', body: '' }, policy).includes('type:feature'));
    assert.ok(classifyIssue({ title: 'docs: rewrite install', body: '' }, policy).includes('type:docs'));
    assert.ok(classifyIssue({ title: 'ci: pin runner image', body: '' }, policy).includes('type:ci'));
  });

  it('type is exclusive: highest-precedence prefix wins', () => {
    const { policy } = loadPolicy();
    const desired = classifyIssue({ title: 'fix: feat: ambiguous', body: '' }, policy);
    assert.deepEqual(
      desired.filter((l) => l.startsWith('type:')),
      ['type:bug'],
    );
  });

  it('scope rules project area labels only', () => {
    const { policy } = loadPolicy();
    const desired = classifyIssue({ title: 'fix(plugin): stale inspector', body: '' }, policy);
    assert.ok(desired.includes('area:plugin'));
    assert.ok(desired.includes('type:bug'));
  });

  it('every issue gets source:human by default and nothing else invents priority', () => {
    const { policy } = loadPolicy();
    const desired = classifyIssue({ title: 'Some free-form report', body: 'hello' }, policy);
    assert.ok(desired.includes('source:human'));
    assert.equal(
      desired.some((l) => l.startsWith('priority:') || l.startsWith('status:')),
      false,
    );
  });

  it('compute-and-diff never removes unmanaged labels', () => {
    const { managed } = loadPolicy();
    const { additions, removals } = computeDiff(
      ['source:human', 'priority:p1', 'status:blocked', 'type:chore'],
      ['source:human', 'type:bug'],
      managed,
    );
    assert.deepEqual(additions, ['type:bug']);
    assert.deepEqual(removals, ['type:chore']);
  });

  it('reprocessing is a no-op: diff(desired, desired) is empty', () => {
    const { policy, managed } = loadPolicy();
    const desired = classifyIssue(
      { title: 'Integrar triagem automática de Issues com o labelizer interno', body: 'labelizer webhook cron' },
      policy,
    );
    assert.deepEqual(computeDiff(desired, desired, managed), { additions: [], removals: [] });
  });

  it('decision keys are stable per content and change with content', () => {
    const { policy } = loadPolicy();
    const item = { title: 'fix: x', body: 'src/' };
    assert.equal(decisionKey('o/r', 16, item, policy), decisionKey('o/r', 16, { ...item }, policy));
    assert.notEqual(decisionKey('o/r', 16, item, policy), decisionKey('o/r', 16, { ...item, body: 'other' }, policy));
  });

  it('fail-closed: rule with an undeclared label is rejected', () => {
    const { policy } = loadPolicy();
    const bad = JSON.parse(JSON.stringify(policy));
    bad.issue.body_rules.push({ contains: 'x', labels: ['type:nope'] });
    assert.throws(() => validatePolicy(bad), LabelizerError);
  });

  it('fail-closed: scope rules may not project non-area labels', () => {
    const { policy } = loadPolicy();
    const bad = JSON.parse(JSON.stringify(policy));
    bad.issue.title_scope_rules.push({ contains: '(x)', labels: ['type:bug'] });
    assert.throws(() => validatePolicy(bad), LabelizerError);
  });

  it('fail-closed: classifier never emits names outside managed_labels', () => {
    const { policy, managed } = loadPolicy();
    for (const title of ['fix: a', 'feat(b): c', 'chore: d', 'free text']) {
      for (const label of classifyIssue({ title, body: 'src/ SECURITY.md runner CHANGELOG catalog webhook cron reviewer labelizer' }, policy)) {
        assert.equal(managed.has(label), true, `undeclared label projected: ${label}`);
      }
    }
  });
});
