# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Declared Linux as the only verified supported platform for building,
  testing, and installing; other operating systems are not yet verified
  and are unsupported.

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
