# Contributing to hermes-routines

Thank you for helping improve `hermes-routines`. Contributions should keep
the plugin small, auditable, and compatible with the Hermes Desktop host.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For a security vulnerability, do not open a public issue. Follow
  [`SECURITY.md`](SECURITY.md).
- For a substantial behavior change, describe the user-facing outcome and the
  compatibility impact in the pull request.

## Development setup

Prerequisites:

- Linux is the only verified supported platform for building and testing;
  other operating systems are not yet verified and are unsupported.
- Node.js `>=22.18`. The floor is 22.18 because the test suite imports
  TypeScript source files, which needs native type stripping (available from
  Node.js 22.18); older releases cannot run `npm test`.
- Node.js `24` is recommended and is the version used by CI.
- npm.

Clone and run the local checks:

```sh
git clone https://github.com/crdesign8/hermes-routines.git
cd hermes-routines
npm ci
npm run typecheck
npm test
npm run check
npm run build
```

`npm run build` regenerates `desktop/plugin.js` from `src/`. That artifact is
checked in, but it is never the source of truth. Do not edit it manually.

## Development rules

- Edit TypeScript under `src/`; keep generated output in sync with
  `npm run build`.
- Preserve the strict typing and security boundaries enforced by
  `npm run check`.
- Do not add runtime dependencies without explaining why they are necessary.
  The shipped artifact is expected to externalize only the host-provided
  `@hermes/plugin-sdk` and React packages.
- Keep profile routing fail-closed. Do not add an implicit active-gateway
  fallback to a routed operation.
- Keep generated artifacts deterministic. Run the build and inspect
  `git diff -- desktop/plugin.js` before committing.
- Add or update tests for behavior changes. Tests should exercise the real
  shipped entry point where practical.

## Pull requests

1. Create a focused branch from `main`.
2. Make the smallest coherent change.
3. Run the verification commands above.
4. Commit with a concise Conventional Commit subject, for example
   `fix(routing): reject incomplete profile routes`.
5. Open a pull request against `main` using the repository PR template
   (`.github/pull_request_template.md`) and include:
   - the problem and intended behavior;
   - tests and commands run;
   - compatibility, security, or privacy impact;
   - any follow-up work that is intentionally out of scope.
6. Respond to review findings in the same branch. Do not open a separate
   follow-up pull request for a fix that belongs in the current change.

CI must be green before merge. The repository runs CI on a GitHub-hosted
runner (`ubuntu-24.04`), so a local green run does not replace the remote
CI result. Direct pushes to `main` are not allowed: all changes enter via
PR under the rules in
[`docs/BRANCH-PROTECTION.md`](docs/BRANCH-PROTECTION.md).
Review coverage is owned by [`CODEOWNERS`](CODEOWNERS) (`* @crdesign8`).
Automatic review is the `test` check (workflow `ci`) on the PR head SHA
and human review is the code-owner review; the reuse contract,
idempotency key, and fail-closed merge rules are defined in
[`docs/PR-REVIEWER.md`](docs/PR-REVIEWER.md).
Use the issue forms in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/)
for bug reports, feature requests, and chores.

## Scope and safety

- Do not commit secrets, tokens, profile data, generated logs, or private
  routine prompts.
- Do not modify another user's Hermes profile as part of a pull request.
- Do not change the MIT license or the project identity without an explicit
  maintainer decision.
- Report security concerns privately using the process in [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the
repository's MIT License, unless the maintainers state otherwise in the
specific contribution.
