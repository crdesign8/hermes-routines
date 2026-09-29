// ── routine configuration proposal (issue #63) ──
// Versioned, typed handoff from a guided Hermes session back to Hermes
// Routines, plus the pure validation and concurrency guards around it.
//
// Non-negotiable invariant: free-form LLM text is NEVER authoritative
// routine state. A proposal arrives ONLY as a structured object through
// `submitProposalHandoff` — never as prose, a transcript excerpt, a DOM
// read, or a model-invented `cron.manage` payload. Strings are refused at
// the boundary with `handoff_must_be_structured`, not parsed.
//
// Round-trip seam status (verified 2026-09-28, see #66): the declared
// `@hermes/plugin-sdk` shim exposes exactly two upstream surfaces —
// `host.newChat` and `host.composer.setDraft/submit` — both outbound
// (plugin → chat). Upstream provides NO supported agent→plugin structured
// return (no tool-result callback, no slash-command handler, no message
// action the plugin could subscribe to). This module is therefore the
// narrow, reviewable contract the future seam will carry: the versioned
// type, the strict parser/validator, the stale guard, and the
// validated-only shape the apply primitive consumes. No transcript
// scraping was added to complete the issue.
//
// Patch scope (inspected, not copied blindly): the only fields this
// package's wire contract can persist are the three `cron.manage add`
// carries (`name`/`schedule`/`prompt`, see domain/cronShapes.ts).
// `delivery` and `modelOverride` are read-only here — the envelope reports
// them, but no verified write key exists on this surface (the backend
// handler forwards `deliver`, yet the edge intentionally sends only known
// fields). Inventing `deliver`/`model` keys would be the unsupported
// bridge the issue forbids, so a patch carrying them is rejected as an
// unknown field with a message that says so.
//
// Everything in this module is pure: no host access, no throwing for
// domain refusals (every refusal is a `{ ok: false, code, message }`
// report with a user-readable, deterministic message).

import { isValidJobId } from './cronShapes';
import { type RoutineJob } from './jobs';
import { rawScheduleOf, routinePausedOf, routinePromptOf } from './present';

// Limits mirror the wire contract (domain/cronShapes.ts `addJob` edge):
// the proposal can never promise what the create path would reject.
const MAX_NAME_LENGTH = 128;
const MAX_SCHEDULE_LENGTH = 256;
const MAX_PROMPT_LENGTH = 20000;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

/** The only proposal version this code reads or writes. */
export const ROUTINE_PROPOSAL_VERSION = 1;

/** Fields a proposal patch may carry — exactly what `add` can persist. */
const PATCH_FIELDS = ['name', 'prompt', 'schedule'] as const;
export type ProposalPatchField = (typeof PATCH_FIELDS)[number];

/** Top-level keys a proposal object may carry. `validated` is the brand
 * `validateProposal` stamps on success: accepted here so a validated
 * proposal re-validates cleanly, but never trusted — validation recomputes
 * everything, so presence of the brand implies nothing. */
const PROPOSAL_FIELDS = ['version', 'jobId', 'owner', 'base', 'patch', 'desiredActive', 'note', 'validated'] as const;

/**
 * Typed routine-configuration proposal, v1.
 *
 * `desiredActive` is the literal `false`: a proposal can only ever
 * describe "stays paused". Anything asking for activation is rejected —
 * activation is a separate, explicit user act, never a side effect of
 * configuring. `note` is display-only explanatory text; it is ignored by
 * validation, fingerprinting and apply.
 */
export interface RoutineConfigurationProposalV1 {
  version: 1;
  jobId: string;
  owner: {
    connectionId: string;
    profile: string;
  };
  base: {
    fingerprint: string;
  };
  patch: {
    name?: string;
    prompt?: string;
    schedule?: string;
  };
  desiredActive: false;
  note?: string;
}

/**
 * A proposal that passed `validateProposal`. The `validated` brand keeps
 * raw input out of the apply primitive at the type level; the gateway
 * re-validates at runtime, so the brand is belt-and-braces, not the lock.
 */
export interface ValidatedProposal extends RoutineConfigurationProposalV1 {
  readonly validated: true;
}

/** Machine-readable reason a proposal was refused. */
export type ProposalRefusalCode =
  | 'not_an_object'
  | 'unknown_field'
  | 'unsupported_version'
  | 'bad_job_id'
  | 'bad_owner'
  | 'owner_mismatch'
  | 'job_mismatch'
  | 'bad_base'
  | 'empty_patch'
  | 'unknown_patch_field'
  | 'bad_name'
  | 'bad_schedule'
  | 'bad_prompt'
  | 'activation_not_supported'
  | 'bad_note'
  | 'handoff_must_be_structured';

/** A refused proposal: the code for machines, the message for users. */
export interface ProposalRefusal {
  ok: false;
  code: ProposalRefusalCode;
  message: string;
}

export type ProposalValidation = { ok: true; proposal: ValidatedProposal } | ProposalRefusal;

/** Normalized configuration a fingerprint is computed over. */
export interface ProposalBaseSnapshot {
  name: string;
  schedule: string;
  prompt: string;
  delivery: string;
  modelOverride: string;
  paused: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** First non-empty trimmed string among row fields, else ''. */
function rowField(row: Record<string, unknown> | null, keys: string[]): string {
  if (row === null) return '';
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Normalize one authoritative row to the configuration that matters.
 *
 * Read contract mirrors the envelope (domain/guidedEnvelope.ts): the same
 * schedule/prompt readers and the same delivery/model candidate keys, so
 * the fingerprint and the session prompt can never disagree about what
 * "current" means. Run metadata (last run, errors, next-run ETA) is
 * deliberately excluded — a run happening mid-session is not a
 * configuration change and must not stale a proposal.
 */
export function snapshotJobConfig(job: unknown): ProposalBaseSnapshot {
  const row = asRecord(job);
  return {
    name: rowField(row, ['name']),
    schedule: (rawScheduleOf((job ?? null) as RoutineJob) ?? '').trim(),
    prompt: (routinePromptOf((job ?? null) as RoutineJob) ?? '').trim(),
    // Same candidate keys the envelope reports (guidedEnvelope.ts) —
    // absent reads as absent, never invented.
    delivery: rowField(row, ['deliver', 'delivery', 'deliver_to', 'deliverTo']),
    modelOverride: rowField(row, ['model', 'model_override', 'modelOverride', 'override_model']),
    paused: routinePausedOf((job ?? null) as RoutineJob),
  };
}

/**
 * Deterministic fingerprint of a normalized snapshot (8 lowercase hex
 * chars). FNV-1a over a JSON array encoding — key order fixed, values
 * length-delimited by construction, so no field boundary can collide.
 */
export function fingerprintSnapshot(snapshot: ProposalBaseSnapshot): string {
  const encoded = JSON.stringify([
    'routine-proposal-base-v1',
    snapshot.name,
    snapshot.schedule,
    snapshot.prompt,
    snapshot.delivery,
    snapshot.modelOverride,
    snapshot.paused ? 'paused' : 'active',
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < encoded.length; i += 1) {
    hash ^= encoded.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Fingerprint of the authoritative row a session started from. */
export function fingerprintJob(job: unknown): string {
  return fingerprintSnapshot(snapshotJobConfig(job));
}

/**
 * Has the authoritative row moved since the proposal's base was taken?
 * Compares fingerprints only — never timestamps, which the backend does
 * not guarantee with the semantics a guard needs.
 */
export function isProposalStale(proposal: ValidatedProposal, job: unknown): boolean {
  return fingerprintJob(job) !== proposal.base.fingerprint;
}

function refusal(code: ProposalRefusalCode, message: string): ProposalRefusal {
  return { ok: false, code, message };
}

function checkName(value: unknown): string | null {
  if (typeof value !== 'string') return 'proposal name must be text';
  const text = value.trim();
  if (!text) return 'proposal name must not be empty';
  if (text.length > MAX_NAME_LENGTH) return 'proposal name must be at most 128 chars';
  if (CONTROL_CHARS_RE.test(text)) return 'proposal name must not contain control characters';
  return null;
}

function checkSchedule(value: unknown): string | null {
  if (typeof value !== 'string') return 'proposal schedule must be text';
  const text = value.trim();
  if (!text) return 'proposal schedule must not be empty';
  if (text.length > MAX_SCHEDULE_LENGTH) return 'proposal schedule must be at most 256 chars';
  if (CONTROL_CHARS_RE.test(text)) return 'proposal schedule must not contain control characters';
  return null;
}

function checkPrompt(value: unknown): string | null {
  if (typeof value !== 'string') return 'proposal instruction must be text';
  const text = value.trim();
  if (!text) return 'proposal instruction must not be empty';
  if (text.length > MAX_PROMPT_LENGTH) return 'proposal instruction must be at most 20000 chars';
  return null;
}

/**
 * Strictly validate a candidate proposal object.
 *
 * Fail-closed throughout: unknown top-level or patch fields are rejected
 * (never ignored), values are never coerced, and an empty patch is
 * refused — a proposal that changes nothing is not a proposal.
 * Normalized (trimmed) values are stored on success, matching the
 * normalization the wire edge applies.
 *
 * `expectedOwner`, when given, must match exactly — a proposal bound to
 * one connection/profile can never validate against another.
 */
export function validateProposal(
  input: unknown,
  expectedOwner: { connectionId: string; profile: string } | null = null,
): ProposalValidation {
  const root = asRecord(input);
  if (root === null) {
    return refusal('not_an_object', 'the proposal must be a structured object, not text or a list');
  }
  for (const key of Object.keys(root)) {
    if (!(PROPOSAL_FIELDS as readonly string[]).includes(key)) {
      return refusal('unknown_field', `unknown proposal field "${key}" — proposals carry only ${PROPOSAL_FIELDS.join(', ')}`);
    }
  }
  if (root.version !== ROUTINE_PROPOSAL_VERSION) {
    return refusal(
      'unsupported_version',
      `unsupported proposal version ${JSON.stringify(root.version)} — this plugin reads version 1`,
    );
  }
  if (!isValidJobId(root.jobId)) {
    return refusal('bad_job_id', 'the proposal must carry the authoritative job_id of the routine it configures');
  }
  const owner = asRecord(root.owner);
  const connectionId = owner === null ? '' : trimmedText(owner.connectionId);
  const profile = owner === null ? '' : trimmedText(owner.profile);
  if (!connectionId || !profile || Object.keys(owner ?? {}).some((k) => k !== 'connectionId' && k !== 'profile')) {
    return refusal(
      'bad_owner',
      'the proposal must name its owning connection and profile as { connectionId, profile }',
    );
  }
  if (expectedOwner !== null && (expectedOwner.connectionId !== connectionId || expectedOwner.profile !== profile)) {
    return refusal(
      'owner_mismatch',
      `the proposal belongs to ${connectionId}::${profile} and cannot be applied elsewhere`,
    );
  }
  const base = asRecord(root.base);
  if (base === null || typeof base.fingerprint !== 'string' || !base.fingerprint) {
    return refusal(
      'bad_base',
      'the proposal must carry the base fingerprint of the configuration it was built from',
    );
  }
  const patch = asRecord(root.patch);
  if (patch === null) {
    return refusal('empty_patch', 'the proposal must carry a patch object with at least one change');
  }
  const patchKeys = Object.keys(patch);
  if (patchKeys.length === 0) {
    return refusal('empty_patch', 'the proposal patch is empty — a proposal that changes nothing is not a proposal');
  }
  for (const key of patchKeys) {
    if (!(PATCH_FIELDS as readonly string[]).includes(key)) {
      return refusal(
        'unknown_patch_field',
        `unknown patch field "${key}" — only ${PATCH_FIELDS.join(', ')} can be reconfigured` +
          (key === 'delivery' ||
            key === 'deliver' ||
            key === 'modelOverride' ||
            key === 'model_override' ||
            key === 'model'
            ? '; delivery and model overrides are reported by the session but have no supported write path on this surface'
            : ''),
      );
    }
  }
  const normalized: { name?: string; prompt?: string; schedule?: string } = {};
  if ('name' in patch) {
    const bad = checkName(patch.name);
    if (bad !== null) return refusal('bad_name', bad);
    normalized.name = (patch.name as string).trim();
  }
  if ('schedule' in patch) {
    const bad = checkSchedule(patch.schedule);
    if (bad !== null) return refusal('bad_schedule', bad);
    normalized.schedule = (patch.schedule as string).trim();
  }
  if ('prompt' in patch) {
    const bad = checkPrompt(patch.prompt);
    if (bad !== null) return refusal('bad_prompt', bad);
    normalized.prompt = (patch.prompt as string).trim();
  }
  if (root.desiredActive !== false) {
    return refusal(
      'activation_not_supported',
      'proposals never activate a routine — the configured routine stays paused until it is resumed explicitly',
    );
  }
  let note: string | undefined;
  if (root.note !== undefined) {
    if (typeof root.note !== 'string') {
      return refusal('bad_note', 'the proposal note is display-only text or absent');
    }
    note = root.note;
  }
  return {
    ok: true,
    proposal: {
      version: 1,
      jobId: root.jobId as string,
      owner: { connectionId, profile },
      base: { fingerprint: base.fingerprint as string },
      patch: normalized,
      desiredActive: false,
      ...(note === undefined ? {} : { note }),
      validated: true,
    },
  };
}

/**
 * The supported, explicit integration boundary: the ONE door through which
 * a structured payload enters the proposal flow.
 *
 * Accepts only a plain object. A string — prose, a pasted transcript, a
 * fenced JSON block scraped from chat — is refused, never parsed: parsing
 * text would make free-form LLM output authoritative state, which the
 * issue forbids. The future upstream agent→plugin return seam will target
 * this function; until it exists, the object arrives via an explicit,
 * user-confirmed handoff (never scraped).
 */
export function submitProposalHandoff(input: unknown): ProposalValidation {
  if (typeof input === 'string' || asRecord(input) === null) {
    return refusal(
      'handoff_must_be_structured',
      'the handoff is a structured proposal object — free-form text is never parsed into routine configuration',
    );
  }
  return validateProposal(input, null);
}

/** The routine a pasted handoff must be bound to before it may be reviewed. */
export interface ProposalRoutineTarget {
  /** Authoritative id of the routine under configuration. */
  jobId: string;
  connectionId: string;
  profile: string;
}

/**
 * The review surface's single entry point for an explicit,
 * user-confirmed handoff (issue #64).
 *
 * Two gates, in order:
 *
 *   1. STRUCTURE. An already-structured value passes straight through. A
 *      string — the text a person pasted — is read as ONE JSON object
 *      literal and nothing else: prose, a transcript excerpt or a fenced
 *      chat block that is not a bare JSON object is refused with
 *      `handoff_must_be_structured`, never repaired, never coerced, never
 *      searched for a payload. So free-form LLM output still cannot
 *      become routine state; only a well-formed object can, and it still
 *      has to survive strict validation.
 *   2. IDENTITY. `target` binds the proposal to the exact routine on
 *      screen: owner connection/profile AND `jobId` must match, so a
 *      proposal minted for another routine is refused with
 *      `job_mismatch` instead of being shown as this routine's review.
 *
 * Both gates are pure and cost zero host calls; the caller still applies
 * the stale guard against backend truth before any mutation.
 */
export function submitProposalForRoutine(
  input: unknown,
  target: ProposalRoutineTarget | null,
): ProposalValidation {
  let candidate: unknown = input;
  if (typeof candidate === 'string') {
    const text = candidate.trim();
    if (!text) {
      return refusal(
        'handoff_must_be_structured',
        'paste the proposal object Hermes returned — an empty handoff is not a proposal',
      );
    }
    try {
      candidate = JSON.parse(text);
    } catch {
      return refusal(
        'handoff_must_be_structured',
        'the handoff could not be read as a JSON object — paste the proposal exactly as Hermes returned it',
      );
    }
  }
  if (asRecord(candidate) === null) {
    return refusal(
      'handoff_must_be_structured',
      'the handoff must be a structured proposal object — free-form text is never parsed into routine configuration',
    );
  }
  const expectedOwner =
    target === null
      ? null
      : { connectionId: trimmedText(target.connectionId), profile: trimmedText(target.profile) };
  const validated = validateProposal(candidate, expectedOwner);
  if (validated.ok === false) return validated;
  if (target !== null && validated.proposal.jobId !== target.jobId) {
    return refusal(
      'job_mismatch',
      `this proposal configures ${validated.proposal.jobId}, not ${target.jobId} — ask Hermes for a proposal bound to this routine`,
    );
  }
  return validated;
}
