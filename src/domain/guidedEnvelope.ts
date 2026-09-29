import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { isValidJobId } from './cronShapes';
import { readStoredDelivery, readStoredModelOverride } from './advancedSettings';
import type { RoutineJob } from './jobs';
import { rawScheduleOf, routinePromptOf, routineTitle } from './present';
import { routeKey } from './routing';
import type { ProvisionalRoutine } from './provisional';

// The configuration envelope: everything a guided-configuration session
// needs to know about ONE routine, serialized deterministically so the
// agent is bound to an authoritative identity instead of a topic.
//
// Two invariants make this a gate rather than a formatter:
//
//   1. Identity is the `job_id` the backend minted, plus the route the
//      create was scoped to. A title is never an identity — names are not
//      unique upstream, so two profiles can hold the same "Daily digest"
//      and only the minted id separates them. No usable id, or no route to
//      key, means NO envelope: a session launched on a guess would
//      configure the wrong routine.
//   2. Every value is a single line. A name or instruction containing a
//      newline could otherwise forge `state: active` in the middle of the
//      envelope and talk the agent into resuming a paused routine, so the
//      serializer flattens control characters instead of escaping.
//
// The envelope states `paused` as a LITERAL type, not a string read off
// the row: it is only ever built from a provisional handle that came back
// proven paused (see domain/provisional.ts), so an active routine cannot
// be described here even by mistake. Nothing in this module resumes,
// mutates or opens anything — it is pure text.

/** Marker line that makes the payload versioned and machine-checkable. */
export const GUIDED_ENVELOPE_MARKER = 'HERMES_ROUTINE_CONFIG_V1';

/**
 * The authoritative facts about the routine under configuration.
 *
 * Read from the stored row first (what the backend actually holds) and
 * from the submitted form only as a fallback for a row that carries no
 * such field — the backend normalizes, so a value it kept is the truth
 * and the submitted text is merely what we asked for.
 */
export interface GuidedEnvelope {
  jobId: string;
  connectionId: string;
  profile: string;
  name: string;
  schedule: string;
  instruction: string;
  /** Delivery target, or null when the routine has none. */
  delivery: string | null;
  /** Model override, or null when the routine runs on the profile default. */
  modelOverride: string | null;
  /** Always 'paused': the routine exists and cannot run. */
  state: 'paused';
}

/** Why no envelope could be built — never a reason to launch anyway. */
export type EnvelopeFailureReason = 'no_job_id' | 'no_route';

export type EnvelopeResult =
  | { ok: true; envelope: GuidedEnvelope }
  | { ok: false; reason: EnvelopeFailureReason; message: string };

/** Submitted form values, the fallback source when a row omits a field. */
export interface GuidedEnvelopeFallback {
  name: string;
  schedule: string;
  prompt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Flatten to one line. Control characters (newlines, tabs, CR, NUL) become
 * spaces and runs of whitespace collapse, so a value can never break out
 * of its own envelope field. The text is otherwise preserved verbatim:
 * truncating here would silently hand the agent a different instruction
 * than the routine will run.
 */
export function singleLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function orNull(value: string): string | null {
  return value === '' ? null : value;
}

/** How a field is rendered: `(none)` says "absent" without reading as data. */
function field(value: string | null): string {
  return value === null ? '(none)' : value;
}

/**
 * Build the envelope for a provisional routine. Fails closed: without a
 * usable `job_id` or a route that can be keyed there is nothing to launch.
 */
export function buildGuidedEnvelope(
  routine: ProvisionalRoutine,
  submitted?: GuidedEnvelopeFallback | null,
): EnvelopeResult {
  const jobId = singleLine(routine?.jobId);
  if (!isValidJobId(jobId)) {
    return {
      ok: false,
      reason: 'no_job_id',
      message:
        'This routine has no authoritative job id, so a configuration chat cannot be bound to it — ' +
        'check the routines list before configuring it',
    };
  }

  // Validate the descriptor BEFORE reading any field off it.
  const route = routine.route as PluginProfileRoute | null | undefined;
  try {
    // routeKey is the validator for a descriptor AND the proof that two
    // connections exposing the same profile name stay distinguishable. It
    // throws on anything unusable, which is the refusal below.
    routeKey(route);
  } catch {
    return {
      ok: false,
      reason: 'no_route',
      message: 'This routine has no owning profile route, so its chat cannot be routed — it stays paused',
    };
  }
  const connectionId = singleLine(route?.connectionId);

  const row = asRecord(routine.job) as RoutineJob | null;
  const record = row as Record<string, unknown> | null;
  const fallbackName = singleLine(submitted?.name);
  const fallbackSchedule = singleLine(submitted?.schedule);
  const fallbackPrompt = singleLine(submitted?.prompt);

  const name = singleLine(
    // The row's `name` only. NOT routineTitle's full chain: that falls back
    // to `job_id` when a row carries no name, which would hand the agent a
    // technical id in the `name:` field and hide the title the user typed.
    // With no stored name, the submitted title is the truthful answer.
    routineTitle(record && typeof record.name === 'string' ? { name: record.name } : null, fallbackName),
  );
  const schedule = singleLine(rawScheduleOf(row)) || fallbackSchedule;
  const instruction = singleLine(routinePromptOf(row)) || fallbackPrompt;
  const profile = singleLine(routine.backendProfile) || singleLine(route?.targetProfile) || singleLine(route?.profile);

  if (!connectionId || !profile) {
    return {
      ok: false,
      reason: 'no_route',
      message: 'This routine has no owning profile route, so its chat cannot be routed — it stays paused',
    };
  }

  return {
    ok: true,
    envelope: {
      jobId,
      connectionId,
      profile,
      name,
      schedule,
      instruction,
      // Delivery and model override read from the stored row through the
      // shared advanced-settings readers (domain/advancedSettings.ts) — the
      // same source the proposal fingerprint reads, so the session prompt
      // and the stale guard agree. Delivery is writable (see
      // routineProposal.ts); modelOverride stays read-only display, and
      // absent is reported as absent, never invented.
      delivery: orNull(singleLine(readStoredDelivery(record))),
      modelOverride: orNull(singleLine(readStoredModelOverride(record))),
      state: 'paused',
    },
  };
}

/**
 * Render the envelope plus the agent's standing instructions.
 *
 * Field order is FIXED (identity, ownership, configuration, state) so the
 * output is byte-stable for a given routine and assertable in tests. The
 * guidance block is a checklist, not a questionnaire: an already-specific
 * routine must be able to go straight to review.
 */
export function serializeGuidedEnvelope(envelope: GuidedEnvelope): string {
  return [
    GUIDED_ENVELOPE_MARKER,
    'You are configuring an existing Hermes Routine.',
    '',
    `job_id: ${envelope.jobId}`,
    `connection_id: ${envelope.connectionId}`,
    `profile: ${envelope.profile}`,
    `name: ${field(singleLine(envelope.name) || null)}`,
    `schedule: ${field(singleLine(envelope.schedule) || null)}`,
    `instruction: ${field(singleLine(envelope.instruction) || null)}`,
    `delivery: ${field(envelope.delivery === null ? null : singleLine(envelope.delivery))}`,
    `model_override: ${field(envelope.modelOverride === null ? null : singleLine(envelope.modelOverride))}`,
    `state: ${envelope.state}`,
    '',
    'Goal:',
    'Clarify the missing execution requirements with the user.',
    'Do not activate this routine.',
    'Do not treat free-form prose as persisted configuration.',
    'When the configuration is complete, produce the structured handoff expected by Hermes Routines.',
    '',
    'Ask only for what this routine needs in order to be executable and safe:',
    '- source, account, repository or channel scope;',
    '- read-only vs mutation authority;',
    '- delivery destination;',
    '- model override, when it is materially useful;',
    '- what to do when there is nothing to report;',
    '- retry and failure expectations;',
    '- thresholds such as "material" or "urgent";',
    '- expected output format;',
    '- any missing schedule or timezone detail.',
    '',
    'Do not force a questionnaire: if what is recorded above is already specific enough to run safely,',
    'go straight to reviewing the configuration instead of asking anyway.',
  ].join('\n');
}
