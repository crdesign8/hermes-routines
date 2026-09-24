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

- Node.js `>=20`.
- Node.js `24` is recommended and is the version used by CI. The test suite
  imports TypeScript source files with native type stripping, which requires
  a sufficiently recent Node.js release.
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
5. Open a pull request against `main` and include:
   - the problem and intended behavior;
   - tests and commands run;
   - compatibility, security, or privacy impact;
   - any follow-up work that is intentionally out of scope.
6. Respond to review findings in the same branch. Do not open a separate
   follow-up pull request for a fix that belongs in the current change.

CI must be green before merge. The repository currently uses a self-hosted
runner, so a local green run does not replace the remote CI result.

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
