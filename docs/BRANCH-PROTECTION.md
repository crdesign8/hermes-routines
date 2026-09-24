# Branch protection — `main` (hermes-routines)

Governance source of truth for the `main` branch (issue #15).
Enforcement is via GitHub branch protection; this file defines the
required rules so they are reviewable and verifiable in git.

## Status

| Item | State |
| --- | --- |
| Repository visibility | Private (2026-09-24) |
| Branch protection via API | **Not enforceable yet** — `GET /branches/main/protection` returns HTTP 403 `Upgrade to GitHub Pro or make this repository public to enable this feature` |
| Rule definition | Defined below; activation is pending the repository becoming public (or a plan that supports protection on private repos) |

Verify the current state:

```sh
gh api repos/crdesign8/hermes-routines/branches/main/protection
```

Expected while private without Pro: HTTP 403 as above. After the
repository becomes public (or eligible), the same call must return the
ruleset matching the definition below.

## Required PR flow for `main`

- No direct push to `main`. All changes enter via pull request from a
  focused branch (`fix/*`, `feat/*`, `chore/*`, `docs/*`, `test/*`,
  `refactor/*`, `ci/*`).
- Branch must be up to date with `main` before merge (`strict: true`).
- Merge method: squash, then delete the branch
  (`gh pr merge --squash --delete-branch`).
- CI must be green before merge. Local green runs do not replace the
  remote CI result (self-hosted runner).
- All review conversations must be resolved before merge.
- `CODEOWNERS` review is required (`* @crdesign8`).
- Force-pushes to `main` are blocked; deletion of `main` is blocked.
- Admins are also subject to these rules (no silent bypass).

Required approvals: `0` while this is a solo-maintainer repository —
the maintainer self-merges their own PR after green CI, resolved
conversations, and code-owner coverage. When a second maintainer with
merge rights joins, raise `required_approving_review_count` to `1`
without changing anything else.

## Required definition (to activate once eligible)

Apply with a single call after the repository becomes public/eligible:

```sh
gh api repos/crdesign8/hermes-routines/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"required_approving_review_count":0,"require_last_push_approval":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field block_creations=false \
  --field required_conversation_resolution=true \
  --field lock_branch=false
```

Field-by-field meaning:

| Field | Value | Why |
| --- | --- | --- |
| `required_status_checks.strict` | `true` | PR branch must be up to date with `main` |
| `required_status_checks.contexts` | `["ci"]` | Workflow `ci` (`.github/workflows/ci.yml`, job `test`: `npm test` + `npm run check`) must be green |
| `enforce_admins` | `true` | Rules apply to admins too; see bypass policy |
| `required_pull_request_reviews.dismiss_stale_reviews` | `true` | New pushes dismiss old approvals |
| `required_pull_request_reviews.require_code_owner_reviews` | `true` | `CODEOWNERS` (`* @crdesign8`) must review |
| `required_pull_request_reviews.required_approving_review_count` | `0` | Solo maintainer; raise to `1` with a second maintainer |
| `required_pull_request_reviews.require_last_push_approval` | `false` | Solo flow; re-evaluate with a second maintainer |
| `restrictions` | `null` | No push allowlist — PR only, no direct push by anyone |
| `allow_force_pushes` | `false` | Block force-push on `main` |
| `allow_deletions` | `false` | Block deletion of `main` |
| `block_creations` | `false` | Branch already exists; creation guard not applicable |
| `required_conversation_resolution` | `true` | All review threads resolved before merge |
| `lock_branch` | `false` | Branch stays writable via PR flow |

Verify after activation:

```sh
gh api repos/crdesign8/hermes-routines/branches/main/protection --jq '{required_status_checks, enforce_admins: .enforce_admins.enabled, required_pull_request_reviews, allow_force_pushes: .allow_force_pushes.enabled, allow_deletions: .allow_deletions.enabled, required_conversation_resolution: .required_conversation_resolution.enabled}'
```

## Bypass policy

- No bypass users, teams, or apps. `enforce_admins: true` closes the
  admin-bypass path.
- Emergencies (e.g. secret leak, broken `main`) still go through a PR:
  open a minimal PR, get green CI, resolve conversations, squash-merge.
  Speed comes from scope, not from skipping the flow.
- Any future bypass grant must be recorded here with who, why, expiry,
  and the follow-up issue — never as an undocumented setting change.

## Forks and external contributors

Settings path: `Settings → Actions → General → Fork pull request
workflows` (applies once the repository is public and forks exist).

- First-time/external contributors: **require approval** before fork
  PR workflows run.
- Secrets are never passed to fork PR runs; `pull_request_target` is
  not used in this repository.
- External PRs follow the same `main` flow: green `ci`, resolved
  conversations, code-owner review, squash merge.

## What changes when the repo goes public

1. Re-run the verify command; confirm the 403 is gone.
2. Apply the definition call above (one step).
3. Re-run the post-activation verify and paste the output in the
   tracking issue (#15) before closing it.
4. Set the Actions fork-approval option above.
5. Keep this file as the source of truth: any future rule change lands
   here first, then in the GitHub setting, with the verify output as
   evidence.
