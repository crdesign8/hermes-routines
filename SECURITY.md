# Security Policy

## Supported versions

The project is currently pre-release. Security fixes are applied to the
latest `main` branch. There is no published release with a separate support
window.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older commits and unversioned copies | No |

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Open a
[GitHub security advisory](https://github.com/crdesign8/hermes-routines/security/advisories/new)
for this repository, or contact the maintainer through the repository owner
profile at [github.com/crdesign8](https://github.com/crdesign8).

Do not include secrets, real profile data, routine prompts, or exploit details
that are not necessary to reproduce the issue. If a report contains sensitive
material, provide a minimal reproduction and share the remaining details only
after a safe channel is agreed.

Please include, when possible:

- affected commit, release, or file;
- impact and prerequisites;
- reproduction steps or a minimal proof of concept;
- suggested mitigation.

The maintainer will acknowledge a report, assess severity, and coordinate a
fix and disclosure timeline. There is no guaranteed response-time SLA while
the project is pre-release.

## Security and privacy model

This repository contains a Desktop plugin, not a standalone service. The
plugin delegates authentication, authorization, profile routing, and routine
execution to the Hermes Desktop host and its `cron.manage` API.

The plugin's local boundary includes:

- fail-closed profile routing: incomplete or missing routes are rejected;
- no implicit fallback to an unscoped active gateway for view operations;
- no bundled runtime dependency beyond host-provided SDK/React externals;
- no plugin-owned updater, telemetry, analytics, or credential store;
- generated-artifact freshness and import/dynamic-evaluation checks.

Routine names, schedules, and prompts are sent to the host when a user
creates or changes a routine. Their storage, execution, logging, and retention
are therefore part of the host's security and privacy model. Review the host
configuration before entering sensitive instructions.

## Out of scope

The following are normally host or deployment issues rather than vulnerabilities
in this repository:

- weaknesses in Hermes Desktop, its plugin loader, or its `cron.manage`
  implementation;
- a compromised or misconfigured user account or profile;
- routine content that the user intentionally asks the host to execute;
- denial of service caused by an untrusted, intentionally configured remote
  host, unless the plugin fails to enforce its documented profile boundary;
- reports without a reproducible impact or a credible security boundary.

Still report unexpected behavior through a private advisory when it may
expose data, bypass profile scoping, or compromise the installed artifact.
