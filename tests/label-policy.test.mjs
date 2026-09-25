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
  it('policy validates: version 2 with 19 managed labels (4 human-owned)', () => {
    const { policy, managed } = loadPolicy();
    assert.equal(policy.version, 2);
    assert.equal(managed.size, 19);
    assert.deepEqual(
      [...validatePolicy(policy).manual].sort(),
      ['priority:p0', 'priority:p1', 'priority:p2', 'status:blocked'],
    );
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
      ['source:human', 'contrib:mine', 'type:chore'],
      ['source:human', 'type:bug'],
      managed,
    );
    assert.deepEqual(additions, ['type:bug']);
    assert.deepEqual(removals, ['type:chore']);
  });

  it('compute-and-diff never removes human-owned (manual) labels', () => {
    const { policy, managed } = loadPolicy();
    const { manual } = validatePolicy(policy);
    const desired = classifyIssue({ title: 'chore: x', body: '' }, policy);
    const { removals } = computeDiff(
      ['source:human', 'type:chore', 'priority:p1', 'status:blocked'],
      desired,
      managed,
      manual,
    );
    assert.deepEqual(removals, []);
  });

  it('body rule match:word rejects mid-word substrings', () => {
    const { policy } = loadPolicy();
    const midWord = { title: 'fix: spawnPriority', body: 'em `src/gateway/cronGateway.ts` e no cronograma' };
    assert.equal(classifyIssue(midWord, policy).includes('area:automation'), false);
    for (const body of ['rodar via cron diario', 'tool `cron.manage`', 'cron']) {
      assert.equal(
        classifyIssue({ title: 'fix: x', body }, policy).includes('area:automation'),
        true,
        `standalone cron must project area:automation (body: ${body})`,
      );
    }
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

  it('fail-closed: manual_labels may only reference declared labels', () => {
    const { policy } = loadPolicy();
    const bad = JSON.parse(JSON.stringify(policy));
    bad.manual_labels.push('priority:p9');
    assert.throws(() => validatePolicy(bad), LabelizerError);
  });

  it('fail-closed: body rule match must be word or substring', () => {
    const { policy } = loadPolicy();
    const bad = JSON.parse(JSON.stringify(policy));
    bad.issue.body_rules.push({ contains: 'x', match: 'fuzzy', labels: ['area:ci'] });
    assert.throws(() => validatePolicy(bad), LabelizerError);
  });

  it('fail-closed: no rule may project a human-owned label', () => {
    const { policy } = loadPolicy();
    const badBody = JSON.parse(JSON.stringify(policy));
    badBody.issue.body_rules.push({ contains: 'x', labels: ['priority:p1'] });
    assert.throws(() => validatePolicy(badBody), /human-owned/);
    const badTitle = JSON.parse(JSON.stringify(policy));
    badTitle.issue.title_rules.push({ prefixes: ['urgent:'], labels: ['status:blocked'] });
    assert.throws(() => validatePolicy(badTitle), /human-owned/);
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
