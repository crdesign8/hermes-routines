# PR reviewer — reuse contract (issue #17)

Repo-side contract for PR review in `hermes-routines`.
It reuses the reviewers and checks already registered for this
repository instead of creating a new reviewer service: the same
pattern used by the issue labelizer (see `docs/LABELIZER.md` —
reuse the internal design without copying its code).

## SSOT

| Surface | Role | File |
| --- | --- | --- |
| Automatic review | `test` check per head SHA from workflow `ci` (`npm ci`, `npm test`, `npm run check`, Node 24, self-hosted `local-server`) | `.github/workflows/ci.yml` |
| Human review | Code-owner review (`* @crdesign8`) | `CODEOWNERS` |
| Merge gates | Green `test` check, up-to-date branch, resolved conversations, squash merge, no bypass | `docs/BRANCH-PROTECTION.md` |
| Contributor flow | Branch, PR template, same-branch fixes, green CI before merge | `CONTRIBUTING.md`, `.github/pull_request_template.md` |

No new reviewer app, webhook service, or workflow is created by
this contract. If a VPS-internal reviewer is onboarded later, it
attaches to the same gates (status check / review on the head
SHA) — it never replaces them.

## Entry events

| Event | Purpose |
| --- | --- |
| `push` | Re-runs the automatic review on every commit pushed to the PR branch. |
| `pull_request` | Runs the automatic review on the PR head SHA (`opened`, `synchronize`, `reopened`). |

Both events resolve to the same `test` job in the `ci` workflow, so a
test PR triggers a review on the correct head SHA and the result
appears on GitHub as the `test` check run plus the code-owner review
thread.

Manual failsafe: re-run the failed `test` job from the PR Checks tab,
or push a fix to the same branch. Fixes belong in the same PR —
never in a follow-up PR for the same change (`CONTRIBUTING.md`).

## Idempotency and fail-closed

- Idempotency key is `(repo, pr_number, head_sha, gate)` where gate
  is `test` (automatic, job in workflow `ci`) or `code-owner-review`
  (human). Re-runs on the same head SHA are no-ops when nothing
  changed; a new commit produces a new head SHA and a fresh review
  — stale reviews never attach to a new head.
- Automatic and human reviews are separate: a green `test` check
  never counts as an approval, and an approval never waives a red
  `test` check. `dismiss_stale_reviews_on_push` (defined in
  `docs/BRANCH-PROTECTION.md`) drops human approvals when a new
  head lands.
- Fail-closed: red or timed-out `test` blocks merge; unresolved
  review conversations block merge; empty `bypass_actors` closes
  the silent-bypass path. Emergencies still go through a minimal
  PR with green CI and resolved conversations — speed comes from
  scope, not from skipping the flow.
- The `ci` workflow's `test` job checks out the PR head and runs
  `npm ci`, `npm test`, `npm run check` with no secrets beyond the
  default `GITHUB_TOKEN`. It never merges, never pushes, and never
  executes untrusted code outside the checked-out head.
  `pull_request_target` is not used in this repository.

## Observability

- Each PR shows one `test` check run per head SHA (logs, conclusion,
  and duration are audit trail).
- Human review appears as code-owner review + resolved conversation
  threads on the same PR.
- Verify the current head state with:

```sh
gh pr view <N> --json number,headRefOid,statusCheckRollup,reviewDecision
gh pr checks <N>
```

## VPS reuse and dual-run

The registered human reviewer is `CODEOWNERS` (`* @crdesign8`).
The automatic reviewer is the existing `ci` workflow (`test` job) —
the same runner family as `issue-triage` (`self-hosted, Linux, X64,
local-server`).

Follow-up (out of scope here, VPS runtime — not this repo):
onboard `crdesign8/hermes-routines` to any VPS-internal PR
reviewer as an *additional* check/review on the head SHA, gated
by the same idempotency key and the same fail-closed merge rules.
Until that onboarding lands, this contract is the sole reviewer
definition. If both ever run concurrently, the VPS reviewer must
not duplicate or shadow the `test` context name, and a VPS failure
must never green-light a merge — it fails closed like `test`.

## Local verification

```sh
npm run typecheck
npm test                                    # tests/pr-reviewer-contract.test.mjs
npm run check
npm run build
```
