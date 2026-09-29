// ── guided-configuration diagnostics (issue #65 Part B, §Observability) ──
// Lightweight, NON-SENSITIVE stage records that let an operator tell apart
// the seven named failure stages: provisional-create failure, session-launch
// failure, proposal-validation rejection, stale-proposal rejection, apply
// failure, verification failure, activation failure.
//
// Stage + reason code ONLY. Never a prompt, a secret, a delivery payload,
// or any row content: `recordGuidedDiag` takes two short strings and
// returns a frozen record. There is nothing to redact because nothing
// sensitive ever enters.
//
// Pure and host-free: no imports, no clock, no throwing for domain values
// (an unknown stage IS a programmer error and throws — a misspelled stage
// must fail loudly at the call site, never ship as a mystery label).

/** The seven observable stages of the guided-configuration lifecycle. */
export const GUIDED_DIAG_STAGES = Object.freeze({
  /** The provisional create did not reach the paused invariant. */
  PROVISIONAL_CREATE: 'provisional-create',
  /** The configuration chat could not be opened. */
  SESSION_LAUNCH: 'session-launch',
  /** A pasted proposal failed validation before any backend read. */
  PROPOSAL_VALIDATION: 'proposal-validation',
  /** A proposal was refused because its target moved or vanished. */
  STALE_REJECTION: 'stale-rejection',
  /** The deterministic write did not reach replaced-and-paused. */
  APPLY: 'apply',
  /** The write happened but backend truth could not confirm it. */
  VERIFICATION: 'verification',
  /** A verified configuration could not be resumed and proven active. */
  ACTIVATION: 'activation',
} as const);

export type GuidedDiagStage = (typeof GUIDED_DIAG_STAGES)[keyof typeof GUIDED_DIAG_STAGES];

/** One operator-facing fact: where it stopped, and the machine-readable why. */
export interface GuidedDiagRecord {
  stage: GuidedDiagStage;
  /** Reason code — the gateway's refusal code, never free text with data. */
  reason: string;
  /**
   * True when pressing the offered recovery (retry/refresh) is safe to
   * suggest without human review: nothing was destroyed, or the failure
   * is a transport error rather than a backend refusal. Derived from the
   * reason code, never from a message string.
   */
  retriable: boolean;
}

function isStage(value: unknown): value is GuidedDiagStage {
  return (
    typeof value === 'string' &&
    (Object.values(GUIDED_DIAG_STAGES) as string[]).indexOf(value) !== -1
  );
}

/**
 * Reason codes that describe a transport or readability failure rather
 * than a backend refusal or a content problem. A retry there re-reads or
 * re-sends without risking a duplicate or an overwrite — which is exactly
 * what `retriable` promises.
 */
const RETRIABLE_REASONS: ReadonlySet<string> = new Set([
  'list_failed',
  'read_failed',
  'refresh_failed',
  'verification_unreadable',
  'verification_missing',
  'truth_unconfirmed',
  'truth_unreadable',
  'session_target_unreadable',
  'create_rejected',
  'pause_rejected',
  'no_new_chat',
  'no_composer',
  'draft_not_claimed',
]);

/** True when `reason` names a failure a blind retry may safely re-attempt. */
export function isRetriableDiagReason(reason: unknown): boolean {
  return typeof reason === 'string' && RETRIABLE_REASONS.has(reason);
}

/**
 * Build one frozen stage record. Stage + reason code only — callers must
 * not smuggle prompts, payloads or row content into `reason`.
 */
export function recordGuidedDiag(stage: GuidedDiagStage, reason: string): GuidedDiagRecord {
  if (!isStage(stage)) {
    throw new TypeError(`unknown guided diagnostics stage: ${String(stage)}`);
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new TypeError('a guided diagnostics record requires a non-empty reason code');
  }
  const code = reason.trim();
  return Object.freeze({ stage, reason: code, retriable: isRetriableDiagReason(code) });
}

/** One line an operator can grep: `apply/create_rejected (retriable)`. */
export function formatGuidedDiag(record: GuidedDiagRecord): string {
  return `${record.stage}/${record.reason}${record.retriable ? ' (retriable)' : ''}`;
}
