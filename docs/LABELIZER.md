# Issue triage — deterministic labelizer (issue #16)

Repo-side contract for automatic issue triage in `hermes-routines`.
It reuses the deterministic design of the internal VPS labelizer
(profile `issue-labelizer`, engine `pm-labelizer`) without copying its
code: same semantics (YAML policy → compute-and-diff), same invariants,
repo-local execution.

## SSOT

`.github/label-policy.yml` (versioned, currently `v2`) declares:

- `managed_labels` — the only names the triage may project (19 labels:
  `type:*`, `area:*`, `source:human`, `priority:*`, `status:blocked`).
  Title/body are untrusted input; label names never interpolate user text.
- `manual_labels` — the human-owned subset of `managed_labels`
  (`priority:p0/p1/p2`, `status:blocked`): declared here for taxonomy
  governance, never projected by a rule, never removed as stale.
- `exclusive_groups` — `type:` resolves to a single label by precedence.
- `issue.defaults` (`source:human`), `title_rules` (conventional-commit
  prefix, case-insensitive), `title_scope_rules` (`(scope)` → `area:*`
  only, never risk/security), `body_rules` (case-sensitive substring; a rule
  may set `match: word` to require word boundaries, so `cron` does not fire
  inside `cronGateway.ts` or "cronograma").

Anything the policy does not desire is not projected. `priority:*` and
`status:blocked` are human-owned: never auto-assigned, never removed.

## Entry events

| Event | Purpose |
| --- | --- |
| `issues: opened/edited/reopened` | Passive reaction to issue activity (`.github/workflows/issue-triage.yml`). |
| `workflow_dispatch` (+ optional `issue_number`) | Manual failsafe: reprocess one issue or every open issue (cap 30). |

Pull requests are skipped without writes (triage owns issues only).
`labeled`/`unlabeled` are intentionally not triggers: the job never
chases its own writes.

## Idempotency and fail-closed

- Compute-and-diff: adds desired managed labels, removes stale managed
  labels (never `manual_labels`), never touches unmanaged labels. Re-runs
  are no-ops (`decision_key = repo:issue:number:content_sha:policy_vN`).
- Fail-closed: invalid policy, unknown labels, missing token, or API
  errors abort with exit 1 and no partial writes. Scope rules may only
  project `area:*` (enforced by the validator).
- The job checks out the base commit only and calls the
  issues-labels API. It never edits code, never merges, never executes
  issue content. Permissions are `issues: write` + `contents: read`.

## Observability and reprocessing

- Each run prints one JSON decision per issue and appends a short
  `### Issue triage` section to the job summary
  (`desired / +additions / -removals`, dry-run flagged).
- Reprocess manually: Actions → `issue-triage` → Run workflow
  (with or without `issue_number`). Editing an issue body also
  retriggers via `edited`.

## VPS reuse and dual-run

The long-term owner is the VPS profile `issue-labelizer` (overlay
`hermes-routines`, entry in `config/repos.yml`), which reconciles all
enabled repos on its cron. Until that onboarding lands, this workflow
is the sole executor. If both ever run concurrently, the overlay must
mirror this policy version before activation, or the older executor
re-adds removed labels (dual-run invariant from the internal engine).
Policy `v2` additionally requires the overlay engine to honour
`manual_labels` (never strip `priority:*` / `status:blocked`) and
`match: word` (word-boundary `body_rules`); a substring-only engine
would keep re-adding `area:automation` from mid-word matches.

Follow-up (out of scope here, VPS runtime — not this repo):
onboard `crdesign8/hermes-routines` to the VPS labelizer with an
overlay mirroring this policy.

## Local verification

```sh
node scripts/issue-triage.mjs --validate   # policy + template cross-check (also in npm run check)
npm test                                    # tests/label-policy.test.mjs: 15 cases
```
