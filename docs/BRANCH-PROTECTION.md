# Branch protection — `main` (hermes-routines)

Governance source of truth for the `main` branch (issue #15).
Enforcement is via a GitHub **repository ruleset**; this file plus
`docs/main-ruleset.json` define the required rules so they are
reviewable and verifiable in git.

## Status

| Item | State |
| --- | --- |
| Repository visibility | Private |
| Classic branch protection API | **Not enforceable** — `GET /branches/main/protection` returns HTTP 403 `Upgrade to GitHub Pro or make this repository public to enable this feature` |
| Repository rulesets API | **Not enforceable yet** — `GET /repos/.../rulesets` returns the same HTTP 403 |
| Rule definition | `docs/main-ruleset.json`; activation is pending the repository becoming public (gate #35) |

Do **not** apply `PUT /branches/main/protection`. That legacy recipe is
rejected: it is less auditable, and the previous draft pinned the wrong
check context and a solo-maintainer deadlock.

Verify the current (ineligible) state:

```sh
gh api repos/crdesign8/hermes-routines/rulesets
gh api repos/crdesign8/hermes-routines/branches/main/protection
```

Expected while private without Pro: HTTP 403 as above. After the
repository becomes public (or eligible), `GET /repos/.../rulesets` must
return the ruleset matching `docs/main-ruleset.json`.

## Required PR flow for `main`

- No direct push to `main`. All changes enter via pull request from a
  focused branch (`fix/*`, `feat/*`, `chore/*`, `docs/*`, `test/*`,
  `refactor/*`, `ci/*`).
- Branch must be up to date with `main` before merge
  (`strict_required_status_checks_policy: true`).
- Merge method: squash, then delete the branch
  (`gh pr merge --squash --delete-branch`).
- The required status check is **`test`** (job `test` in workflow `ci`,
  `.github/workflows/ci.yml`: `npm test` + `npm run check`). The
  workflow *name* `ci` is not a check context. Local green runs do not
  replace the remote CI result (GitHub-hosted runner `ubuntu-24.04`).
- All review conversations must be resolved before merge.
- `CODEOWNERS` (`* @crdesign8`) still routes review requests. Required
  code-owner reviews stay **off** while this is a solo-maintainer
  repository: `require_code_owner_review: false` plus
  `required_approving_review_count: 0`. GitHub does not let the PR
  author satisfy a required code-owner review on their own PR, so
  `require_code_owner_review: true` with `* @crdesign8` deadlocks every
  maintainer PR.
- When a second maintainer with merge rights joins, change only
  `require_code_owner_review` to `true` and
  `required_approving_review_count` to `1`, then `PUT` the ruleset.
- Force-pushes to `main` are blocked (`non_fast_forward`); deletion of
  `main` is blocked (`deletion`).
- No bypass actors. Admins are subject to the same rules.

## Required definition (to activate once eligible)

Apply with a single call after the repository becomes public/eligible,
using the committed payload (do not hand-edit flags at apply time):

```sh
gh api repos/crdesign8/hermes-routines/rulesets \
  --method POST \
  --input docs/main-ruleset.json
```

Field-by-field meaning:

| Field | Value | Why |
| --- | --- | --- |
| `name` | `protect-main` | Stable ruleset name for verify queries |
| `target` | `branch` | Protects git branches, not tags |
| `enforcement` | `active` | Rules are live, not evaluate-only |
| `bypass_actors` | `[]` | No users, teams, or apps skip the rules; see bypass policy |
| `conditions.ref_name.include` | `refs/heads/main` | Only `main` |
| `pull_request.required_approving_review_count` | `0` | Solo maintainer; raise to `1` with a second maintainer |
| `pull_request.dismiss_stale_reviews_on_push` | `true` | New pushes dismiss old approvals |
| `pull_request.require_code_owner_review` | `false` | Avoids solo deadlock; set `true` with a second maintainer |
| `pull_request.require_last_push_approval` | `false` | Solo flow; re-evaluate with a second maintainer |
| `pull_request.required_review_thread_resolution` | `true` | All review threads resolved before merge |
| `required_status_checks.strict_required_status_checks_policy` | `true` | PR branch must be up to date with `main` |
| `required_status_checks.required_status_checks[].context` | `test` | Job `test` (not workflow name `ci`) must be green |
| `non_fast_forward` | present | Block force-push on `main` |
| `deletion` | present | Block deletion of `main` |

Verify after activation:

```sh
gh api repos/crdesign8/hermes-routines/rulesets --jq '.[] | {id,name,enforcement,target}'
gh api repos/crdesign8/hermes-routines/rulesets/<ID> --jq '{name,enforcement,bypass_actors,conditions,rules}'
```

The second payload must match `docs/main-ruleset.json` (ruleset `id` and
GitHub metadata fields may be extra).

## Bypass policy

- No bypass users, teams, or apps. Empty `bypass_actors` closes the
  admin-bypass path.
- Emergencies (e.g. secret leak, broken `main`) still go through a PR:
  open a minimal PR, get a green `test` check, resolve conversations,
  squash-merge. Speed comes from scope, not from skipping the flow.
- Any future bypass grant must be recorded here with who, why, expiry,
  and the follow-up issue — never as an undocumented setting change.

## Forks and external contributors

Settings path: `Settings → Actions → General → Fork pull request
workflows` (applies once the repository is public and forks exist).

- First-time/external contributors: **require approval** before fork
  PR workflows run.
- Secrets are never passed to fork PR runs; `pull_request_target` is
  not used in this repository.
- The `test` job runs on a GitHub-hosted runner (`ubuntu-24.04`), an
  ephemeral VM per run, and does **not** skip fork `pull_request` heads.
  Fork contributions are tested normally and may satisfy the required
  `test` check, so external PRs are mergeable once green.
- Review is still required for outside contributions: code-owner review
  is not *required* by the ruleset (solo-maintainer setting), so an
  outside PR must be reviewed manually by the maintainer before merge.
  The fork-PR approval setting above applies to workflows, not to
  `test`.

## What changes when the repo goes public

Activation is gated on issue #35 (Public Readiness). After that gate
approves opening the repository:

1. Re-run the verify commands; confirm the 403 is gone.
2. Apply `POST /repos/.../rulesets` with `docs/main-ruleset.json`.
3. Re-run the post-activation verify and paste the output in the
   tracking issue (#15) before closing it. Record the same evidence on
   #35.
4. Set the Actions fork-approval option above.
5. Keep this file and `docs/main-ruleset.json` as the source of truth:
   any future rule change lands here first, then in the GitHub setting,
   with the verify output as evidence.
