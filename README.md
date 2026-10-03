# hermes-routines

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: v0.1.0](https://img.shields.io/badge/release-v0.1.0-blue.svg)](../../releases/tag/v0.1.0)

> **Community plugin.** This is an independent, community-maintained plugin.
> It is not an official Nous Research product and is not endorsed by them.
> It installs through the Hermes Desktop plugin surface; review the source
> and the [security notes](#security-and-privacy) before installing.

A standalone Hermes Desktop plugin that adds a **Routines** page at `/routines` — with a matching sidebar entry — for managing scheduled routines through the host's per-profile `cron.manage` API. Routine data stays in the Hermes host; this package ships no separate service, database, or update mechanism.

![Cover image: the Hermes Routines wordmark above the tagline "Scheduled jobs for recurring tasks"](docs/assets/hr-cover-04.png)

*Cover image — hermes-routines for Hermes Desktop.*

## Quick navigation

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Quick install](#quick-install)
- [Usage](#usage)
- [Requirements](#requirements)
- [Installation](#installation)
- [Upgrade](#upgrade)
- [Uninstall](#uninstall)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project layout](#project-layout)
- [License](#license)

## What it does

Manage scheduled routines for the active Hermes profile from inside Hermes Desktop — no separate service or dashboard.

Supported:

- View routines for the active Hermes profile.
- Search and filter the routine list.
- See, at a glance, which routines need attention because their last run
  failed, and focus exactly those rows.
- Inspect the schedule and stored run instruction for each routine.
- Create a routine from a name, schedule, and prompt.
- Pause and resume existing routines.
- Use fail-closed profile routing: calls without a resolved profile route are
  rejected instead of being sent to an unintended gateway.
- Build a deterministic, auditable `desktop/plugin.js` artifact with no
  bundled runtime dependencies.

Limits:

- The current page intentionally provides no delete, edit-mutation, or run-now
  actions — the row Details control only opens the read-only inspector.
- Routine rows never expand. Selecting one marks it and opens the inspector,
  which is the single home for schedule, next run, last run and last result;
  the row keeps a one-line summary that never wraps.
- The routine backend exposes exactly five `cron.manage` actions — list, add,
  remove, pause, and resume — with no update and no run action.
- The inspector panel is a disabled, read-only mirror of the composer: it
  reflects the selected routine but offers no editable controls. Below the
  configuration it shows a separated, read-only `LAST EXECUTION` block with
  the latest run, its outcome, the failure reason when the run failed, and
  the next run while the routine can still fire.
- Panel navigation follows the layout. In the split view the routines list
  stays on screen beside the panel, so the header control is an explicit
  dismiss (labelled for what it closes) rather than a "Back to routines"
  that promises a navigation the user never made. Below 820px the panel
  covers the list, and the same control reads as **Back to routines**.
  Escape dismisses whichever panel is open — and a focused text field or an
  open dropdown keeps its own Escape. Closing returns focus to the row the
  inspector belonged to, or to the control that opened the panel.

## Screenshots

The images below are captures of the plugin running inside Hermes Desktop. Routine names, schedules, and prompts shown are examples.

![Routines page: a search field, All/Active/Paused filters, and routine cards showing each routine's schedule, next run, last run, and last result](docs/assets/hermes-routines-01.png)

*Routines list — browse, search, and filter routines for the active profile.*

![Create Routine panel: a toggle, a Name field, a prompt field, and a Trigger set to Weekdays at 07:45](docs/assets/hermes-routines-02.png)

*Composer — create a routine from a name, schedule, and prompt, where results go, or hand the draft to Hermes to finish. This capture predates the composer reframe in issue #72, where **Finish with Hermes** became a card beside the final actions and creation-time state was worded **Start enabled**, and the **Advanced → Delivery** override in issue #73, which became **Results** — a picker that asks where results should go and offers only destinations the profile can actually reach.*

![Routines page with the routine inspector open beside the list, showing the selected routine's schedule and stored instruction](docs/assets/hermes-routines-03.png)

*Inspector — the selected routine's schedule and stored instruction, shown read-only beside the list.*

## Quick install

Install it with the Hermes plugin manager:

```sh
hermes plugins install crdesign8/hermes-routines
```

That is the whole installation story. This repository ships one unified plugin
package: `plugin.yaml` and `desktop/plugin.js` are in the same package, and the
plugin manager installs both. The host then projects the desktop half into
`<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` (app home `~/.hermes`)
and the app loads it through the normal disk-plugin pipeline, hot reload
included.

It is marked as a custom, unreviewed source until it is listed in the official
catalog, so the security scan runs and the install may ask you to confirm. To
pin an exact commit, add `--ref` followed by a full 40-character commit SHA.

The plugin is opt-in (`defaultEnabled: false`): after installing, go to
Capabilities → Plugins and enable hermes-routines (or `hermes plugins enable
hermes-routines`). The Routines page is then available at `/routines`, whichever
profile is active.

Requires Hermes **`2026.9.11`** or newer — the earliest release that projects a
unified package's desktop half into the app root (see
[`docs/INSTALL.md`](docs/INSTALL.md)). Check yours with `hermes --version`.
There is no manual installer and no second install path: development against a
local checkout is documented as an explicitly non-supported fallback in
[`docs/INSTALL.md`](docs/INSTALL.md) (Development fallback).

## Usage

1. Install the plugin, reload the profile, then go to Capabilities →
   Plugins and enable hermes-routines (opt-in; it does not self-enable).
2. Open **Routines** from the sidebar, or navigate to `/routines`.
3. The page follows the active Desktop profile. It requires the host to expose
   a complete route for that profile; there is no profile picker in this view.
4. Use the list to inspect routines. The **All / Active / Paused** tabs each
   show how many routines that slice holds; the filter tabs and the search box
   narrow the list together. When a routine's last run failed, a band above
   the list says how many **need attention** and **Show them** focuses exactly
   those rows. A paused routine that failed before it was paused is kept out
   of that count, since nothing will retry it until you resume it; when the
   band is shown it also names those routines, and their row always states
   the failure. Then use the **New routine** control to submit a name,
   schedule, and prompt. The prompt is the instruction that the host will
   execute when the routine runs. **Start enabled** decides whether that
   routine can run as soon as it is created.
5. Or, with a name and an instruction already in the form, use **Finish
   with Hermes**: the routine is created paused, then the owning profile's
   chat opens and automatically receives its job ID, goal, schedule, and
   destination. If the chat or kickoff fails, return to the paused routine
   and use **Retry chat** (or reopen configuration from the list after a
   reload); retry does not create another routine. It stays paused until you
   review and apply what Hermes proposes.
6. Use the pause/resume controls to change a routine's active state.

All list and mutation requests are scoped to the active profile. The plugin
requires a resolved route with a backend profile and fails closed when that
route is unavailable. It does not fall back to the active gateway.

## Requirements

Supported platforms: Linux is the only verified supported platform for
building, testing, and installing. Other operating systems are not yet
verified and are unsupported.

- Hermes Desktop **`2026.9.11`** or newer. That is the minimum release that
  projects a unified plugin package's `desktop/plugin.js` into the app root;
  on an older host the plugin manager installs the package but the Routines
  page never appears.
- Hermes Desktop with a profile that exposes the plugin host and `cron.manage`.
- Node.js `>=22.18` for building and testing the repository. The floor is
  22.18 because the test suite imports TypeScript source files using native
  type stripping, which is only available from Node.js 22.18 — older
  releases cannot run `npm test`.
- Node.js `24` is recommended and is the version used by CI.
- npm (included with supported Node.js distributions).

The repository does not declare a separate minimum Desktop SDK release for the
plugin API itself. Verify that the host implements the plugin descriptor and
`@hermes/plugin-sdk` surface recorded in
[`docs/SDK-BASELINE.md`](docs/SDK-BASELINE.md) (machine-readable:
[`sdk-baseline.json`](sdk-baseline.json)) before installing. `npm run check`
verifies that record against the source on every run.

## Installation

There is exactly one installation model, and the host owns all of it:

```sh
hermes plugins install crdesign8/hermes-routines
```

The plugin manager clones the package into `<HERMES_HOME>/plugins/hermes-routines/`
and records its provenance; the Desktop main process then copies
`desktop/plugin.js` out to
`<HERMES_HOME>/desktop-plugins/hermes-routines/plugin.js` beside a
`.hermes-package.json` marker, and refreshes that copy whenever the source
changes. Nothing in this repository writes into your Hermes home, and there is
no manual copy step, no backup file, and no second install root.

The projected copy is app-level: it exists once, however many profiles carry
the package, and it does not appear or disappear when the profile selector
changes. Never hand-edit it — the host replaces it. To exercise a local
checkout in the app instead, see the development fallback in
[`docs/INSTALL.md`](docs/INSTALL.md); it is a throwaway home, not a second
supported path.

After installation, go to Capabilities → Plugins and enable hermes-routines.
The plugin is opt-in (`defaultEnabled: false`) and does not self-enable.
Once enabled, the Routines page is available at `/routines`, whichever
profile is active.

### Verify the projected artifact

Optional — the host did the copy, so this is a check, not a step:

```sh
sha256sum desktop/plugin.js \
  "$HERMES_HOME/desktop-plugins/hermes-routines/plugin.js"
```

The two hashes must match.

## Upgrade

```sh
hermes plugins update hermes-routines
```

Then trigger a runtime plugin reload (⌘K → **Reload desktop plugins**, or the
Plugins page's **Rescan**). There is no local migration step; routine state
remains in the host's `cron.manage` backend.

## Uninstall

```sh
hermes plugins remove hermes-routines
```

The host drops the projected desktop half on the next reconcile because its
marker records a source that no longer exists — do not delete
`desktop-plugins/hermes-routines/` by hand, and never remove the shared
`desktop-plugins/` root. Uninstalling this plugin does not delete routines
stored by the Hermes host; manage those through the host's own cron interface.

Migrating from a release that shipped the removed manual installer? See
[`docs/INSTALL.md`](docs/INSTALL.md) (Migrating from the manual installer) —
you only need to delete a stale hand-installed folder if its bytes differ from
your package's `desktop/plugin.js`.

## Security and privacy

- The shipped artifact imports only the host-provided `@hermes/plugin-sdk`
  and React externals. Build and test tooling is kept in `devDependencies`.
- The plugin has no standalone network client, telemetry, analytics, updater,
  or credential storage of its own.
- It reads and sends routine operations through the Desktop host's
  `cron.manage` API. The host remains responsible for authentication,
  authorization, and the data-retention policy for those routines.
- Routed requests fail closed when a profile route is missing or incomplete;
  the view never opts into the active-gateway fallback.
- Prompt and schedule values are sent to the host as part of the routine
  operation. Review them before creating a routine, especially when the host
  is connected to a shared or remote profile.
- The repository is MIT-licensed. See [`LICENSE`](LICENSE) and
  [`SECURITY.md`](SECURITY.md) for reporting instructions.

For installation details, app-home resolution, and edge cases, see
[`docs/INSTALL.md`](docs/INSTALL.md).

## Troubleshooting

- **`npm ci` or the build reports a Node version error:** use Node.js `24`,
  or another version satisfying both `engines.node` and the test runner's
  native TypeScript requirements.
- **`desktop/plugin.js is stale`:** run `npm run build`; never edit the
  generated file by hand.
- **The plugin installs but the Routines page never appears:** your host is
  older than `2026.9.11` (nothing projects the package's desktop half), or the
  desktop half is still disabled. Check `hermes --version` and the toggle in
  Capabilities → Plugins.
- **A symlinked checkout under `plugins/<id>` does nothing:** the host skips
  symlinked package folders by design. Use a real clone or copy in a throwaway
  `HERMES_HOME` — see the development fallback in
  [`docs/INSTALL.md`](docs/INSTALL.md).
- **The page serves older bytes than your package:** a hand-installed,
  marker-less `desktop-plugins/hermes-routines/` is never overwritten by the
  host. Delete that folder and let the host re-project.
- **The page is unavailable after install:** confirm that the target profile
  has a usable route and the required `cron.manage` tool.
- **The route is present but operations fail closed:** the host did not
  provide a complete profile route. Check the host's profile configuration;
  do not bypass the route guard.

## Development

The editable source is `src/**/*.ts(x)`. `desktop/plugin.js` is generated and
must not be edited directly.

```sh
npm ci
npm run typecheck
npm test
npm run check
npm run build
```

`npm run check` runs the typecheck, import/allowlist and dynamic-evaluation
checks, version synchronization check, the Desktop SDK compatibility baseline
check (`docs/SDK-BASELINE.md`), the unified package layout check, and
generated-artifact freshness check. Consuming a new `@hermes/plugin-sdk` symbol
therefore means recording it in `sdk-baseline.json` first; the gate fails
otherwise. Before opening a pull request, run all commands above and review the
staged diff. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution
workflow and [`docs/INSTALL.md`](docs/INSTALL.md) for the deeper install
reference.

## Project layout

- `src/` — TypeScript source of truth.
- `desktop/plugin.js` — deterministic generated Desktop artifact.
- `scripts/` — build and static check gates (no installer; the host installs).
- `tests/` — Node test suite and SDK/host stubs.
- `sdk-baseline.json` — machine-readable upstream SDK contract this plugin
  consumes.
- `docs/INSTALL.md` — the unified package lifecycle: install, update, remove,
  and troubleshooting reference.
- `docs/SDK-BASELINE.md` — the SDK compatibility baseline and its refresh
  procedure.

## License

Copyright (c) 2026 crdesign8. Released under the MIT License.
