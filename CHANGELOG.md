# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The routines list now labels its primary action and states each filter's
  size. The creation control was a bare `+` whose meaning lived only in an
  `aria-label`, so a sighted user had to already know what the glyph meant;
  it now paints **New routine** beside the glyph, and its accessible name
  comes from that visible text rather than a second label that could drift
  from it.

  Row action targets grew from 24x24 to 28x28 around an unchanged 13px
  glyph — past the WCAG 2.2 minimum of 24x24 — and the search box and its
  clear control (16x16, the smallest target on the page) moved to 28px and
  24px. The filter chips went from a 24px underline with 2px of padding to
  a 28px band with 6px. Row height is unchanged, so the compact list from
  issue #77 stays compact. Every icon-only control keeps its per-routine
  accessible name and tooltip, and the disabled/pending states are as they
  were.

  Each filter chip now carries its own count (`All 15 · Active 10 · Paused
  5`), which replaces the *Showing all N routines.* toolbar line: that
  sentence only ever restated the chip already marked as current, while the
  chip counts say something it never did — how large every slice is. The
  counts are computed over the search matches with NO status filter applied,
  because a count taken from the already-filtered rows would report *Paused
  0* while paused routines exist. The count is announced once through the
  chip's accessible name, the settled count is still announced by the polite
  live region, and neither is painted twice.

  The labeled action is wider than the glyph it replaced, so the header row
  is allowed to wrap, and below the existing 820px breakpoint the pill
  tightens its padding rather than dropping its label.

- Panel navigation now follows the layout. The routines list stays on screen
  beside the right-side panel in the split view, so the header control no
  longer reads **Back to routines** there — that wording promised a
  navigation the user never made, because nothing was ever left. The split
  view gets an explicit **dismiss** control: a close icon whose accessible
  name says what it closes (*Close details for _routine_*, *Cancel and close
  the create form*, *Close configuration and return to routines*), never a
  bare "×".

  Below the existing 820px breakpoint the panel takes the full width and
  covers the list, and there the same control is honestly a back navigation
  — so **Back to routines** is kept exactly where it is true. Which control
  is offered is decided by the stylesheet, in the one media query the
  workspace already used: no `matchMedia` handler duplicates the number in
  JS, so the two layouts cannot drift apart. The control that a layout does
  not offer is `display: none`, which takes it out of the accessibility tree
  *and* out of the tab order — `visibility: hidden` would have left a
  focusable ghost behind.

  **Escape** now dismisses the open panel, and only the open panel: with
  nothing open the key is not handled at all, so it cannot steal a
  keystroke from the search box. A focused text field or an open dropdown
  keeps its own Escape (the composer is built from dropdowns) — a key that
  closed the form the instant it closed a menu inside it would resolve two
  intents at once, and only the first is recoverable. The handler lives on
  the split workspace, so focus may be anywhere inside it.

  Closing hands focus back where the user would continue: the row the
  inspector belonged to (its Details control now carries a stable id derived
  from the same key the inspector uses), or the control that opened the
  panel. The guided configuration panel returns focus to nothing, because
  the notice action that opened it unmounts behind the panel — "where
  practical", never a guess.

  The same header control shape replaces three hand-copied back buttons
  (inspector, composer, guided panel), so the four panel surfaces can no
  longer drift apart in wording, icon or behavior.

- Routine rows stay compact, and the inspector owns the detail. Selecting a
  routine used to expand the list row into a full detail block — Schedule,
  Next run, Last run, Last result — that restated the lateral inspector
  verbatim and reflowed the whole list on every click. Rows no longer
  expand: selection now *marks* the row (a background tint plus an accent
  bar painted on the existing box, so it takes no layout space) and opens
  the inspector, which is the one primary home for that metadata.

  The row keeps only what an operator scans for on one line —
  `Every day at 09:00 | Last run failed | Next run in 19 hours` — and that
  line never wraps, so a long schedule truncates instead of growing the row.
  The failure summary stays visible while scanning; the failure *story*
  (what failed, why, and the raw evidence) is the inspector's alone.

  Selection is a toggle rather than a one-way door: the row that owns the
  inspector closes it again. Both the row title and its Details control
  carry `aria-expanded`, and `aria-controls` names the panel *only while it
  is open* — the previous relation pointed at a block inside the row, which
  no longer exists, and naming an unmounted panel would be a second kind of
  dangling reference. Keyboard operation is unchanged (Enter and Space on
  the focused row title).

  On a narrow viewport the inspector is the primary surface: it takes the
  full width and its own scroll instead of sharing a cramped column, while
  the list keeps its compact rows.

  The `RoutineDetails` component is deleted rather than left as an unused
  second renderer of the same values; its `RunWhen` and `ResultTone`
  primitives move to `RunOutcome`, the inspector's only caller, so an
  outcome tone is still derived in exactly one place. The row's Details
  control is now labelled **Details** — it opens a read-only detail
  surface, which is what it always did.

- Failures are now explained before they are dumped. The list row states
  the failure in words — `Every day at 09:00 | Last run failed | Next run
  in 19 hours` — beside the icon instead of behind its color, and a paused
  row whose last run failed says so too. The inspector reads a failure in
  hierarchy: what failed (**The last run failed.**), then the concise
  reason *when one can be safely derived*, and only then the raw output,
  collapsed behind **Technical details**.

  The reason comes from a closed table of machine tokens the backend
  actually emitted (`command not found`, `ENOENT`, `EACCES`, `timeout`,
  `ECONNREFUSED`, rate-limit wording, and a few more), and each mapped
  sentence restates the token rather than diagnosing it. Output that
  matches nothing derives nothing: an unparseable failure keeps the
  generic headline and its raw evidence, never an invented explanation.
  Evidence (exit code, stderr, timestamps, the raw runner/backend message,
  identifiers) is copied verbatim into the collapsed block — long stderr
  is wrapped and scrollable, never ellipsized — and an absent field paints
  no row at all, so an empty stderr is absent rather than an empty claim.
  The disclosure is a native `details`/`summary` pair, so the block stays
  free of controls and keeps its keyboard behavior for free.

  A recorded success now outranks a stale `last_fire_error`: the outcome
  belongs to the run, so a successful row carrying an earlier run's error
  string no longer repaints itself (and its indicator) as failed.

- The **Model override** block is gone from the create form. It was a
  labelled field with no control behind it, followed by a sentence
  explaining that the model cannot be set there — non-actionable
  information inside an action form, in vocabulary the user had to
  interpret to make no decision. The composer no longer spends
  attention on a setting it cannot take, and the note that defended it
  is deleted rather than reworded.

  The create path's behavior is unchanged: routines still run on the
  profile default, and no `model`/`provider` key ever reaches the
  `cron.manage` payload. The gateway RPC the plugin calls has no such
  key (D2), so there was never a write path to restore.

  A model pin the backend actually holds is still **reported** where it
  is true rather than hidden: the inspector's ADVANCED block now shows
  it as a plain read-only **Model** row instead of a disabled text input
  with the "cannot be set from this surface" note — a disabled input
  still reads as a form field the user failed to fill in. The proposal
  review keeps its row for the same reason it keeps every other row: a
  review that quietly drops a value the backend applies is not a
  review. That row is labelled **Model**, and the existing `not editable`
  badge is now the only statement about it, instead of the field name
  plus a badge plus an explanation.

- The composer's **Advanced → Delivery** control is now **Results**, and it
  asks the question the user actually has: *where should this routine's
  results go?* The backend-centric vocabulary is gone from the ordinary
  flow — there is no "Backend default (no override)", no "Local", and no
  "Custom target…". The picker offers **Use my default destination**,
  **Keep in routine history only**, one entry per destination the profile
  can genuinely reach (**Bot Chat → _profile_**), and **Send to every
  connected channel** as the last, separated entry. The backend `deliver`
  string is generated by the domain (`domain/destinations.ts`); the user
  never composes `platform:chat_id` or `bot-chat:profile` any more.

  Destinations are discovered from the route roster the page already
  resolves, and **only local routes qualify**: `bot-chat:` tokens resolve
  against the profiles on the machine that runs the job
  (`cron/scheduler_delivery.py::_resolve_bot_chat_target`), so a remote
  route's backend profile would name a target that silently delivers
  nothing. Nothing is invented to fill the gap — the Desktop RPC surface
  has no channel-enumeration method, so an invented destination would be a
  dead one, and an empty roster yields the two always-available choices
  plus the override.

  **Send to every connected channel** states its impact in words and
  requires an explicit acknowledgement before either create act proceeds;
  the guard is re-checked inside the submit handler, so it is not merely a
  disabled button some other path could bypass. An explicit platform target
  remains reachable behind a developer-oriented **Advanced override…**,
  which takes structured fields (platform, channel or chat id, optional
  thread id) instead of one protocol string, and refuses a blank address
  rather than silently becoming the default.

  The inspector and the guided panel now describe a stored destination in
  the same human words ("Bot Chat → matias", "Send to every connected
  channel") instead of echoing the raw token, while the review table keeps
  showing backend truth in its cells — that table is a comparison against
  what the backend holds, so prettifying it would make it untrue. An
  explicit platform target written elsewhere keeps its verbatim form
  rather than being hidden.

  The picker, both create paths, and the guided proposal path all resolve
  through the same `destinationDelivery` mapper, so a manual choice and a
  Hermes proposal cannot normalize differently.

### Added

- A review → confirm → apply → verify → activate path for guided routine
  configuration, closing the loop opened by **Configure with Hermes**. The
  flow is driven by an explicit state machine
  (`domain/guidedWorkflow.ts`): `provisional_paused`, `configuring`,
  `proposal_ready`, `applying`, `configured_paused`, `activating`, `active`
  and `needs_attention`, with `GUIDED_TRANSITIONS` as the single table of
  legal successors and a reducer that refuses anything else — so the
  question "may I mutate now?" is answered by the state, not by a
  combination of component booleans.

  The proposal arrives through an explicit, user-confirmed handoff
  (`submitProposalForRoutine`): a string is read as ONE bare JSON object
  literal and nothing else, so prose is refused rather than repaired, and
  the object must be bound to the exact routine on screen (owner
  connection/profile **and** `job_id`) or refused with `job_mismatch`.
  The review itself (`GuidedProposalReview`) is a real table of current
  versus proposed values built from backend truth read at review time, not
  from the typed form; changed fields are marked with the word "changed"
  rather than color alone, the agent's explanation renders separately from
  the authoritative values, and fields no proposal can write (delivery,
  model override) are shown as current values instead of being hidden.

  `confirmProposal` is the only door to the backend, and its order is the
  guarantee: re-run the stale guard immediately before the mutation, apply
  through the deterministic primitive, re-read and verify the persisted
  values, and only then — and only when the person asked for activation —
  call the official resume path and re-read once more. Success is claimed
  only after backend truth confirms the transition, so a generated
  proposal, a patch request that returned, or a resume that answered ok
  are each individually insufficient. Activation is deliberately not part
  of the proposal contract: a validated proposal always carries
  `desiredActive: false`, so a proposal can never turn a routine on.

  Failures are staged (`handoff`, `stale`, `apply`, `verify`, `resume`,
  `activate-verify`) and each one names the recovery that is safe to
  offer: `review` where nothing was mutated, `apply` only where
  re-confirming cannot mint a second job, `refresh` wherever an
  addressable row may already exist, and `activation` for a resume of a
  configuration that is already applied and verified. A routine that is
  configured but failed to activate therefore stays paused and retries
  activation without restarting clarification. No failure path deletes
  the provisional job, and closing the panel resumes nothing — the
  component owns no cleanup effect that can mutate.

- A guided configuration handoff: a routine created with **Finish with
  Hermes** is created **paused**, and from that state the page can open a
  Hermes Desktop chat already bound to that exact routine. The path is
  `createProvisionalRoutine` → `launchGuidedConfiguration` →
  `openGuidedRoutineChat`, composed by `GuidedRoutinePanel`.

  The composer offers the assisted path as a **Finish with Hermes** card
  next to the final actions, not as a switch above the fields (issue #72).
  It is a button because choosing it is an act — create paused, then open a
  configuration chat — and a switch would promise a durable property of the
  routine that the guided path does not have. The card explains what Hermes
  does, and a partial draft is a valid input: a name and an instruction are
  the only floor, because those are what the backend's create requires, and
  anything still vague is exactly what the session asks about. The direct
  create is unchanged, and the assisted path is absent entirely where the
  page has no guided handler.

  The opening prompt is a versioned configuration envelope
  (`HERMES_ROUTINE_CONFIG_V1`) carrying the authoritative `job_id`, the
  owning `connection_id`, the backend `profile`, the current name,
  schedule, instruction, delivery and model override, and the literal
  state `paused` — followed by standing instructions to clarify what is
  missing, not to activate the routine, and not to treat prose as persisted
  configuration. Field order is fixed, so the serialization is byte-stable
  and assertable; `delivery` and `model_override` render as `(none)` when
  absent rather than being invented.

  Two invariants make the envelope a gate rather than a formatter. Without
  a usable `job_id`, or without a route that can be keyed, there is no
  envelope and no chat: a session not bound to an authoritative identity
  could configure the wrong routine, and names are not unique upstream, so
  duplicate names across profiles cannot collide. And every value is
  flattened to a single line — a name or instruction containing a newline
  would otherwise be able to forge a `state: active` or a second `job_id:`
  line in the middle of the envelope. `state` is a literal type on top of
  that, built only from a handle that came back proven paused.

  Routing uses the `PluginProfileRoute` retained by the provisional create,
  never the profile active at click time, so a chat for a job on another
  connection lands on the connection that owns it. The panel states the
  routine is **Paused · needs configuration** and shows its `job_id`; it
  never implies the configuration is complete because a chat opened. A
  refused launch is a report that keeps the `job_id`, and the retry reopens
  a chat for that same job instead of creating another routine. The first
  launch may auto-send; a retry always drafts.

- A provisional creation path,
  `createProvisionalRoutine({ route, name, schedule, prompt })`, for a
  guided configuration conversation that needs a routine identity before
  it starts. It returns a handle carrying the authoritative `job_id` the
  backend minted, the owning route, the backend profile, and
  `createdPaused: true` — the invariant being that a routine exists, is
  addressable, and is proven unable to run while clarification is still
  incomplete. The route is preserved with the identity so later session
  and mutation work targets the same owner.

  It is two round trips, and the second is not optional. The `cron.manage`
  wire declares its params with unknown keys rejected and carries no
  paused/disabled key, so `add` always creates a runnable job: this
  surface has no create-me-inert verb. The paused state is therefore
  reached by pausing the id the backend just minted and then PROVING the
  pause took, since an accepted call is not the same as a paused job.

  Identity stays `job_id`-only and comes from the backend's own answer,
  never from the submitted title — names are not unique upstream, so a
  name lookup could only ever be a guess. An answer with no usable id is a
  blocking failure rather than a reason to search by name. Every failure
  mode is a report, not a throw, and a partial failure keeps the minted
  `job_id` and route so the job stays addressable and recoverable: a
  refused create, a refused or unconfirmed pause, an unusable route, and a
  thrown round trip all report honestly that the routine was created but
  may still run. Ordinary form creation is unchanged and still available.

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

- A structured routine-configuration proposal contract plus deterministic
  apply (`RoutineConfigurationProposalV1`, `validateProposal` /
  `submitProposalHandoff`, `applyValidatedProposal`). The proposal is a
  versioned object carrying the authoritative `job_id`, the exact owner
  (`connectionId` + `profile`), a base fingerprint of the configuration
  the session started from, a patch limited to `name` / `prompt` /
  `schedule`, and the literal `desiredActive: false` — proposals can only
  ever describe "stays paused". Free-form text is never authoritative
  state: the handoff boundary accepts only structured objects and refuses
  strings without parsing them, and no transcript/DOM scraping was added.
  `delivery` and `modelOverride` stay read-only (reported by the session,
  rejected in a patch) because no verified write key exists on this
  surface. Validation is strict and deterministic (schema/version, exact
  owner, allowed fields only, wire-contract limits, no activation); the
  stale guard compares a deterministic fingerprint of the normalized
  configuration, ignoring run metadata. Apply is a supervised replacement
  — the backend exposes no update verb — ordered add → prove paused →
  remove superseded → re-read truth, add-first so any pre-remove failure
  leaves the original untouched, never resumes, never matches by name,
  and reports partial states with both ids. Round-trip seam status: the
  declared SDK exposes only outbound doors (`host.newChat`,
  `host.composer`), so no agent→plugin structured return exists upstream
  yet; this contract is the narrow prerequisite that seam will carry (see
  `docs/proposal-handoff.md`).

### Changed

- The create form no longer asks how the configuration mechanism works
  before asking what the routine should do. **Configure with Hermes** is
  gone as a first control and as an on/off property: it is now a **Finish
  with Hermes** card beside the final actions, a distinct act with a plain
  description of what Hermes does and of the fact that the routine is
  created paused. A partial draft is accepted — a name and an instruction
  are the only floor, matching what the backend's create actually requires,
  and the rest is the conversation's job. Creation-time state is worded as
  **Start enabled**, describing the outcome of this creation instead of
  reusing the state label an existing routine carries. The guided safety
  invariants are unchanged: the assisted create still never receives an
  active flag, and nothing on that path resumes or activates a routine.

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

- A mutation the backend refused was reported as applied. `cron.manage`
  reports a tool-level failure INSIDE a successful JSON-RPC frame
  (`{"success": false, "error": ...}`), so a rejected create resolved
  exactly like a successful one and the composer announced
  "routine X created" for a routine that did not exist. Create and
  create-on-hold now read the backend's own verdict, and a pause that was
  refused is reported as the real state it left behind instead of being
  folded into a success notice. A missing `success` flag from an older
  gateway is still tolerated, since the load-bearing proofs are the minted
  `job_id` and the paused snapshot.

- Pause/resume addressed routines by their human-readable name, so any
  routine whose title was not a valid technical id was rejected locally
  (`Invalid routine resume: job_id must match ...`). `job_id` is now the
  only mutation identity: optimistic state, pending/busy keys and the
  `cron.manage` payload all use the backend id, rows without one fail
  closed, and create supplies a `name` while Hermes generates the
  `job_id`.

- Next-run copy could contradict itself. The list built one generic
  relative-time string and prepended "Next", so a `next_run_at` that had
  already passed rendered "Next in 2 minutes ago" — future-oriented grammar
  glued to a past-oriented distance — and a just-due one rendered "Next in
  just now". Copy is now a state machine over the timestamp's relation to
  the clock, with a single canonical "now" window (±1 minute, symmetric,
  inclusive and pinned by tests): a future schedule reads "Next run in 2
  minutes", the near-now band reads "Due now", a stale schedule reads
  "Overdue by 2 minutes", and run history stays past-oriented ("2 minutes
  ago", "just now" — a timestamp ahead of the clock is skew and never
  claims a run that has not happened). A terminal routine no longer
  announces a next run at all, and the zero-padded "Next in 06 days" form
  is gone with the vocabulary. The generic formatter that made the
  concatenation possible was removed instead of left as an unused
  footgun; the rendered copy now comes from one domain state machine, so
  the collapsed row, the expanded card and the inspector can never
  disagree about what a timestamp means.

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
