# Release process — hermes-routines `0.1.0`

This is the canonical release document. It is published inside the
distributed tarball (see "Tarball contents" below); the root `CHANGELOG.md`
is the development changelog and is intentionally **not** packed.

## 1. Semantic Versioning

- This project follows [SemVer](https://semver.org/spec/v2.0.0.html):
  `MAJOR.MINOR.PATCH`.
- Current version: `0.1.0` (`package.json` <-> generated `desktop/plugin.js`,
  enforced by
  `npm run check:version`).
- While `MAJOR` is `0`, anything may change at any time; the API and the
  desktop contract should be considered unstable.
- After `1.0.0`: `MAJOR` for incompatible changes, `MINOR` for backwards
  compatible features, `PATCH` for backwards compatible fixes.

## 2. Breaking-change policy

- A breaking change is any change that requires consumers, installers, or
  the Desktop host to do something different: manifest/plugin contract
  changes, route changes, installation lifecycle changes (issue #99 removed
  the manual installer — the plugin manager owns install/update/remove),
  cron-shape semantics changes, or dropped Node-engine support.
- Breaking changes require, at minimum:
  1. A `CHANGELOG.md` entry under `Unreleased` (or the release section)
     describing the break and the migration path.
  2. A SemVer-appropriate version bump (`MAJOR` once `>= 1.0.0`; `MINOR`
     while `0.x`).
  3. Updated docs (`README.md` / `docs/INSTALL.md` as applicable).
- Fail-closed behavior changes (validator rejecting previously accepted
  input) count as breaking and must be called out explicitly, even when the
  previous acceptance was a bug.

## 3. Gate order (must run green, in this order)

Release candidate validation for `0.1.0`:

1. `npm test` — unit/contract suite (`tests/*.test.mjs`).
2. `npm run check`, which expands in order to:
   1. `npm run typecheck` (`tsc --noEmit`)
   2. `npm run check:allowlist`
   3. `npm run check:version`
   4. `npm run check:manifest`
   5. `npm run check:sdk-baseline`
   6. `npm run check:package-layout` (unified package shape the host
      installs; the gate that replaced the removed installer, issue #99)
   7. `npm run check:label-policy`
      (`scripts/issue-triage.mjs --validate`)
   8. `node scripts/build.mjs --check` (generated `desktop/plugin.js`
      is in sync)
3. Remote CI (`.github/workflows/ci.yml`, GitHub-hosted runner
   `ubuntu-24.04`) must be green on the PR. Local green runs do not
   replace the remote CI result.
4. The host's own admission check must be green for the package
   (`hermes plugins validate .`, which reports the manifest, the desktop
   surface lint and the security scan). Installation is performed by the
   host, so a release that the host would reject is not releasable.

No release is cut with any gate red or skipped.

## 4. Tag / GitHub Release / SHA / catalog (post-merge)

Perform these steps only **after** the release PR has merged into `main`:

1. Update the local `main`: `git checkout main && git pull`.
2. Create the annotated tag: `git tag -a v0.1.0 -m "hermes-routines v0.1.0"`
   and push it: `git push origin v0.1.0`.
3. Create the GitHub Release from tag `v0.1.0`, attaching the packed
   tarball (`npm pack`) and pasting the `CHANGELOG.md` `## [0.1.0]` section
   into the release notes.
4. Record the merge commit SHA and the tag SHA in the release issue for
   traceability.
5. Update the plugin catalog entry only after the Release exists, so the
   catalog never points at an unpublished artifact. The catalog entry
   identifies the plugin by `repo` plus the exact 40-character commit
   `sha` of the `v0.1.0` tag — there is no tarball URL field.

## 5. Anonymous clone while PRIVATE (expected-fail)

- Repository visibility is currently **private** (see
  `docs/BRANCH-PROTECTION.md`).
- Anonymous `git clone https://github.com/crdesign8/hermes-routines.git`
  and anonymous tarball downloads **must fail** while the repository is
  private. That failure is expected and is not a release defect.
- Public availability verification (clone/tarball without credentials) is
  valid only after the repository becomes public.

## 6. Merge by convention (no branch protection on private repos)

- GitHub does not enforce branch protection or repository rulesets on
  this private repository without a qualifying plan:
  `GET /branches/main/protection` and `GET /repos/.../rulesets` return
  HTTP 403 (`Upgrade to GitHub Pro or make this repository public to
  enable this feature`). See `docs/BRANCH-PROTECTION.md`.
- Until protection is enforceable, the rules in
  `docs/BRANCH-PROTECTION.md` apply **by convention**: no direct push to
  `main`, PR from a focused branch, squash merge with branch deletion
  (`gh pr merge --squash --delete-branch`), green remote `test` check,
  resolved conversations, `CODEOWNERS` review routing.
- This release followed that convention; enforcement becomes automatic once
  the repository is public (or otherwise eligible).

## 7. Tarball contents

- The packed `files` list in `package.json` ships `desktop/`, `docs/`,
  `src/`, `scripts/`, `plugin.yaml`, `LICENSE`, `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.
- The root `CHANGELOG.md` is **not** in the tarball. The canonical release
  notes inside the published artifact are this file (`docs/RELEASE.md`).
- Verify with `npm pack --dry-run` before cutting the release.
