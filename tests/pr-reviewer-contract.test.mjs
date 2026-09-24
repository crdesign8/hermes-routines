import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readRoot(...parts) {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

// PR reviewer reuse contract (issue #17): the repo reuses the
// registered ci check + CODEOWNERS human review instead of
// creating a new reviewer service. This test pins that mapping
// so a future "new reviewer" cannot land silently.
describe('pr-reviewer-contract', () => {
  it('contract doc exists and declares reuse (no new reviewer)', () => {
    const docPath = path.join(root, 'docs', 'PR-REVIEWER.md');
    assert.equal(existsSync(docPath), true, 'docs/PR-REVIEWER.md must exist');
    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /issue #17/, 'contract must reference issue #17');
    assert.match(doc, /CODEOWNERS/, 'contract must name the human reviewer surface');
    assert.match(doc, /`ci`/, 'contract must name the automatic ci gate');
    assert.match(doc, /head_sha|head SHA/, 'contract must define head-SHA idempotency');
    assert.match(doc, /Fail-closed|fail-closed/i, 'contract must state fail-closed merge blocking');
    assert.match(
      doc,
      /No new reviewer|not.*new reviewer|never replaces them/i,
      'contract must forbid creating a new reviewer service',
    );
  });

  it('ci is the automatic review: push + pull_request', () => {
    const ci = readRoot('.github', 'workflows', 'ci.yml');
    assert.match(ci, /^\s*push:/m, 'ci must trigger on push (commit event)');
    assert.match(ci, /^\s*pull_request:/m, 'ci must trigger on pull_request (PR event)');
  });

  it('ci runs the auditable gate sequence without pull_request_target', () => {
    const ci = readRoot('.github', 'workflows', 'ci.yml');
    assert.equal(
      ci.includes('pull_request_target'),
      false,
      'ci must not use pull_request_target (no fork-secret escalation)',
    );
    assert.match(ci, /npm ci/, 'ci must install deterministically');
    assert.match(ci, /npm test/, 'ci must run the test suite');
    assert.match(ci, /npm run check/, 'ci must run the repo gates');
    assert.match(ci, /self-hosted/, 'ci must target the self-hosted runner');
    assert.match(ci, /local-server/, 'ci must disambiguate the routines runner label');
    assert.match(ci, /node-version:\s*['"]?24['"]?/, 'ci must pin Node 24 for type-stripped tests');
  });

  it('human review is CODEOWNERS (* @crdesign8)', () => {
    const owners = readRoot('CODEOWNERS');
    assert.match(owners, /^\*\s+@crdesign8/m, 'CODEOWNERS must keep * @crdesign8');
  });

  it('merge gates separate auto review from human approval and fail closed', () => {
    const bp = readRoot('docs', 'BRANCH-PROTECTION.md');
    assert.match(bp, /\["ci"\]|contexts.*\bci\b/, 'required status checks must pin the ci context');
    assert.match(bp, /strict.*true/i, 'branch must be up to date before merge');
    assert.match(bp, /required_conversation_resolution.*true/i, 'review threads must resolve before merge');
    assert.match(bp, /enforce_admins.*true/i, 'admins must be subject to the same rules (no silent bypass)');
    assert.match(bp, /squash/i, 'merge method must stay squash');
    assert.match(bp, /No bypass|no silent bypass/i, 'bypass policy must stay closed');
  });

  it('contributing routes contributors through the reviewer contract', () => {
    const contributing = readRoot('CONTRIBUTING.md');
    assert.match(
      contributing,
      /docs\/PR-REVIEWER\.md/,
      'CONTRIBUTING must reference the reviewer contract',
    );
    assert.match(
      contributing,
      /docs\/BRANCH-PROTECTION\.md/,
      'CONTRIBUTING must keep the branch-protection reference',
    );
    assert.match(contributing, /CODEOWNERS/, 'CONTRIBUTING must keep the CODEOWNERS reference');
  });

  it('no new reviewer workflow or service is introduced', () => {
    const workflows = readdirSync(path.join(root, '.github', 'workflows')).sort();
    assert.deepEqual(
      workflows,
      ['ci.yml', 'issue-triage.yml'],
      'only ci + issue-triage workflows may exist (no pr-reviewer bot workflow)',
    );
    const tree = readdirSync(path.join(root, 'scripts')).join('\n');
    assert.equal(
      /reviewer/i.test(tree),
      false,
      'no reviewer service script may exist in scripts/ (reuse, do not create)',
    );
  });

  it('pr template keeps the audit trail fields', () => {
    const tpl = readRoot('.github', 'pull_request_template.md');
    assert.match(tpl, /Closes #/, 'PR template must keep the issue link field');
    assert.match(tpl, /Test plan/i, 'PR template must keep the test plan field');
    assert.match(
      tpl,
      /Compatibility, security, and privacy impact/,
      'PR template must keep the impact field',
    );
  });
});
