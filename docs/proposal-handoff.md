# Proposal handoff (issue #63)

How a guided Hermes session hands a routine configuration back to Hermes
Routines — and what upstream piece is still missing.

## The contract

`RoutineConfigurationProposalV1` (`src/domain/routineProposal.ts`):

- `version: 1`, `jobId` (authoritative backend id), `owner`
  (`connectionId` + `profile`), `base.fingerprint`, `patch`
  (`name` / `prompt` / `schedule` only), `desiredActive: false`
  (literal — a proposal can only describe "stays paused"), optional
  display-only `note`.

Entry boundary: `submitProposalHandoff(input)` accepts **only a plain
object**. Strings — prose, pasted transcripts, fenced JSON scraped from
chat — are refused with `handoff_must_be_structured`, never parsed.
Free-form LLM text is never authoritative routine state.

Validation (`validateProposal`) is strict and deterministic:
schema/version, non-empty authoritative `jobId`, exact owner match,
allowed patch fields only (unknown fields rejected — including
`delivery` / `modelOverride`, which are session-reported but have no
verified write key on this surface), wire-contract limits
(128 / 256 / 20000 chars), no activation.

Concurrency: `base.fingerprint` is a deterministic FNV-1a fingerprint of
the normalized configuration (name, schedule, prompt, delivery, model
override, paused flag). Run metadata is excluded — a firing routine must
not stale its own proposal. Apply re-fetches the authoritative row by
exact `job_id` on the retained owner route and refuses moved targets as
`stale_base`.

## Apply semantics

`applyValidatedProposal({ proposal, route })`
(`src/gateway/proposalApply.ts`) consumes only validated proposals
(type brand + runtime re-validation) and runs a supervised replacement,
because `cron.manage` exposes **no update verb**:

1. list on the retained route → find exact `job_id` (never by name);
2. fingerprint compare → stale refuses, zero mutations;
3. `add` the patched config (add-first: pre-remove failures leave the
   original untouched);
4. `pause` the replacement and prove `enabled === false`, else
   best-effort cleanup + report;
5. `remove` the superseded id (only destructive step, only after the
   replacement is proven paused) — a refusal is an explicit partial with
   both ids, nothing hidden;
6. re-list (backend truth after mutation, never the write echo).

Never resumes. Never matches by name. No-op patches return ok with
`changed: false` and zero mutations.

## Missing upstream capability

Verified 2026-09-28 (see #66): the declared `@hermes/plugin-sdk` shim
exposes exactly `host.newChat` and `host.composer.setDraft` / `submit` —
both outbound (plugin → chat). Upstream provides **no supported
agent→plugin structured return** (no tool-result callback, no
slash-command handler, no message action a plugin could subscribe to).

Until such a surface exists, proposals enter only through
`submitProposalHandoff` as explicit, user-confirmed objects. The surface
a future SDK needs to provide: a way for an agent turn to deliver a
structured payload to the plugin that opened its session, addressed to
the session's `job_id` + owner route. No transcript scraping, no DOM
reads — those are explicitly out, now and in that future.
