# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A guided routine-configuration chat boundary,
  `openGuidedRoutineChat({ route, initialPrompt, autoSubmit })`. It opens a
  fresh Desktop chat on a concrete profile route and seats the opening
  prompt in that chat's own composer, so downstream UI never has to know
  how Desktop session focus and drafts are wired. Only supported `host`
  doors are used — no DOM traversal, no fiber inspection, no direct
  composer element manipulation. The behavior is explicit: by default the
  prompt is drafted and the user sends it, and `autoSubmit` makes the
  button press itself start the conversation. The helper fails closed —
  a request without a concrete route, a blank prompt, or a host without
  the composer surface opens nothing rather than falling back to the
  active profile. The local SDK shim gained only the two upstream
  signatures this uses (`host.newChat`, `host.composer.setDraft` /
  `submit`), each verified against the Desktop SDK and developer guide.

- The routine inspector gained a `LAST EXECUTION` block below the
  configuration: the last run as relative distance plus absolute date, the
  outcome with its tone, the failure reason on its own row when the run
  failed, and the next run while the routine can still fire. A routine with
  no run history states so in words instead of showing a placeholder. Every
  value comes from the new presentation-only `lastExecutionOf`, so the
  block, the expanded card and the health indicator cannot disagree. The
  block is read-only by construction — it carries no control — and a
  successful run never surfaces a stale `last_fire_error`. No backend or
  gateway contract change.

### Changed

- Declared Linux as the only verified supported platform for building,
  testing, and installing; other operating systems are not yet verified
  and are unsupported.
- Corrected the `main` protection definition: required check context is
  `test` (not `ci`), solo flow disables required code-owner reviews, and
  activation uses a repository ruleset (`docs/main-ruleset.json`).
- CI and issue triage moved from the dedicated self-hosted runner
  (`hermes-node-01-routines`) to the GitHub-hosted `ubuntu-24.04`. No
  maintainer node runs repository code anymore, so the fork-skip guard
  the self-hosted runner required is gone and fork pull requests are
  tested normally.

### Fixed

- Pause/resume addressed routines by their human-readable name, so any
  routine whose title was not a valid technical id was rejected locally
  (`Invalid routine resume: job_id must match ...`). `job_id` is now the
  only mutation identity: optimistic state, pending/busy keys and the
  `cron.manage` payload all use the backend id, rows without one fail
  closed, and create supplies a `name` while Hermes generates the
  `job_id`.

## [0.1.0] - 2026-09-24

Initial releasable state of the standalone Hermes Desktop plugin for
scheduled routines.

### Added

- Standalone Desktop plugin scaffold with routes and cron pins.
- Scoped cron view with fail-closed routing and atomic installer.
- TypeScript scaffold with generated artifact (`desktop/plugin.js` via
  `scripts/build.mjs`).
- Routine composer panel (high-abstraction create trigger) and minimalist
  layout with inspector panel.
- Inspector read-only mirror of the composer; opaque composer mirror with
  zero technical surface.
- Fail-closed + version-sync coverage and edge-behavior docs.
- Version sync gate (`package.json` <-> generated `desktop/plugin.js`).
- Deterministic issue triage with repo policy (`scripts/issue-triage.mjs`).
- PR reviewer reuse contract with head-SHA gates.
- Contribution governance docs (`CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`) and `main` branch-protection definition
  (`docs/BRANCH-PROTECTION.md`).
- Public repository guidance docs.

### Changed

- Migrated installer to the app-level `desktop-plugins` contract.
- Added official desktop manifest contract (`plugin.yaml`).
- Consolidated schedule semantics into the canonical domain.
- Bound routines view to the active profile with Crew-derived cards.
- Adapted inspector, toggle switch, dropdown and actions to theme tokens.
- Switched CI to a dedicated self-hosted runner
  (`hermes-node-01-routines` via `local-server` label).

### Fixed

- Fail-closed profile routing with explicit opt-ins.
- Hardened edge validation, fail-closed routing, traversal-safe install.
- `ScheduleConfig` validation is genuinely fail-closed.
- Cron shapes that cannot be proven equivalent fail closed in the humanizer.
- Intervals serialize with Hermes native interval syntax.
- `cron.manage add` sends the top-level prompt.

### Notes

- Derived from `git log` at `v0.1.0` preparation (branch
  `fix/issue-18-release-v010`); see `docs/RELEASE.md` for the release
  process (SemVer, gates, tag/Release/SHA/catalog).
- The canonical release notes published inside the distributed tarball are
  `docs/RELEASE.md`. This root `CHANGELOG.md` is the development changelog
  and is intentionally excluded from the packed `files` list in
  `package.json`.
