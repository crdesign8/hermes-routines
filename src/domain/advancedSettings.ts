// ── advanced routine settings (issue #65, phase 1) ──
// Pure domain vocabulary for the settings the `cron.manage` surface the
// plugin calls can actually persist — verified against the real
// hermes-agent source (see reports/issue-65-contract-findings.md and the
// binding reports/issue-65-decisions.md; D1-D6 are settled, not re-litigated).
//
// Two settings, two opposite write contracts:
//
//   - `delivery` IS writable: the gateway RPC forwards `deliver` into the
//     create (D1). Values come from a CLOSED vocabulary (D3) — no RPC
//     enumerates connected platforms, so anything outside the grammar is
//     refused, never offered. `normalizeDelivery` is the ONE normalizer
//     both the manual UI path (`buildAddParams`) and the guided proposal
//     path (`validateProposal`) call, so they cannot diverge (D6).
//   - `modelOverride` is READ-ONLY: `model`/`provider` exist on the stored
//     row but the gateway RPC the plugin calls has no key for them and
//     would drop them silently (D2). There is deliberately NO writer here
//     — only `readStoredModelOverride`, so a model picker cannot be built
//     on this module by accident. The inspector shows the stored value
//     labelled as not settable on this surface.
//
// Everything in this module is pure: no host access, no clock, no throwing
// for domain refusals (every refusal is a `{ ok: false, code, message }`
// report with a user-readable, deterministic message). Gateway builders
// translate a refusal into the throw their contract already uses.

/** Closed delivery grammar (D3): the only values a proposal or create may carry. */
export const DELIVERY_GRAMMAR = 'local, all, bot-chat[:profile], or platform:chat_id[:thread_id]';

const MAX_DELIVERY_LENGTH = 256;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

/** Row keys that may carry the stored delivery target, in read priority. */
const DELIVERY_ROW_KEYS = ['deliver', 'delivery', 'deliver_to', 'deliverTo'] as const;

/** Row keys that may carry the stored model override, in read priority. */
const MODEL_ROW_KEYS = ['model', 'model_override', 'modelOverride', 'override_model'] as const;

/** Vocabulary keywords: the only first segments that take no `platform:` form. */
const RESERVED_FIRST_SEGMENTS = new Set(['local', 'all', 'bot-chat', 'origin']);

/** A candidate delivery value: absent, one canonical stored value, or a refusal. */
export type NormalizedDelivery =
  | { ok: true; present: false; delivery: null }
  | { ok: true; present: true; delivery: string }
  | { ok: false; code: 'bad_delivery'; message: string };

function absent(): NormalizedDelivery {
  return { ok: true, present: false, delivery: null };
}

function present(delivery: string): NormalizedDelivery {
  return { ok: true, present: true, delivery };
}

function refused(message: string): NormalizedDelivery {
  return { ok: false, code: 'bad_delivery', message };
}

function grammarRefusal(received: string): NormalizedDelivery {
  return refused(
    `unsupported delivery ${JSON.stringify(received)} — delivery is one of: ${DELIVERY_GRAMMAR}`,
  );
}

/**
 * Normalize a candidate delivery value to either absent or one canonical
 * stored value. Trims border whitespace; folds ONLY the vocabulary
 * keywords (`local`, `all`, `bot-chat`) to lowercase — platform names,
 * profile names, chat ids and thread ids keep their case, because the
 * backend resolves those verbatim.
 *
 * `origin` is refused explicitly: upstream resolves it to the *creating*
 * session's target, which is only concrete for cron-session creates — a
 * plugin create would leave it unresolved (D3).
 */
export function normalizeDelivery(value: unknown): NormalizedDelivery {
  if (value === undefined || value === null) return absent();
  if (typeof value !== 'string') return grammarRefusal(JSON.stringify(value) ?? String(value));
  const text = value.trim();
  if (text === '') return absent();
  if (text.length > MAX_DELIVERY_LENGTH) {
    return refused('delivery must be at most 256 chars');
  }
  if (CONTROL_CHARS_RE.test(text)) {
    return refused('delivery must not contain control characters');
  }
  const lowered = text.toLowerCase();
  if (lowered === 'origin') {
    return refused(
      'delivery "origin" is not supported for plugin creates — ' +
        'it resolves to the creating session target, which only exists for cron-session creates; ' +
        `use one of: ${DELIVERY_GRAMMAR}`,
    );
  }
  if (lowered === 'local') return present('local');
  if (lowered === 'all') return present('all');
  if (lowered === 'bot-chat') return present('bot-chat');
  if (text.startsWith('bot-chat:') || lowered.startsWith('bot-chat:')) {
    // Match the prefix case-insensitively but keep the profile name's case:
    // the backend resolves a profile name verbatim.
    const profile = text.slice(text.indexOf(':') + 1).trim();
    if (!profile || profile.includes(':') || CONTROL_CHARS_RE.test(profile)) {
      return grammarRefusal(text);
    }
    return present(`bot-chat:${profile}`);
  }
  const parts = text.split(':');
  if (parts.length === 2 || parts.length === 3) {
    const platform = (parts[0] ?? '').trim();
    const chatId = (parts[1] ?? '').trim();
    if (!platform || !chatId) return grammarRefusal(text);
    if (RESERVED_FIRST_SEGMENTS.has(platform.toLowerCase())) return grammarRefusal(text);
    if (parts.length === 3) {
      const thread = (parts[2] ?? '').trim();
      if (!thread) return grammarRefusal(text);
      return present(`${platform}:${chatId}:${thread}`);
    }
    return present(`${platform}:${chatId}`);
  }
  return grammarRefusal(text);
}

/** First non-empty trimmed string among candidate row fields, else null. */
function firstStoredText(
  row: Record<string, unknown> | null,
  keys: readonly string[],
): string | null {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Read the delivery target a stored row actually holds. Stored truth is
 * reported verbatim (trimmed) — never validated against the vocabulary:
 * the backend owns what is stored, and a row written elsewhere must still
 * read back honestly.
 */
export function readStoredDelivery(row: Record<string, unknown> | null): string | null {
  return firstStoredText(row, DELIVERY_ROW_KEYS);
}

/**
 * Read the model override a stored row actually holds, or null when the
 * routine runs on the profile default. READ-ONLY by construction: no
 * writer is exported because the gateway RPC the plugin calls has no
 * `model`/`provider` key (D2) — anything built here could only pretend
 * to set it.
 */
export function readStoredModelOverride(row: Record<string, unknown> | null): string | null {
  return firstStoredText(row, MODEL_ROW_KEYS);
}

// ── composer/inspector-facing helpers (issue #65, phase 3) ──
// Pure display vocabulary for the secondary Advanced section. The presets
// below are the closed D3 set minus `origin` (unresolvable for a plugin
// create) — `custom` is the UI's free-text slot for the explicit
// `platform:chat_id[:thread_id]` (or `bot-chat:profile`) form, never a
// value sent to the backend as-is.

/** One preset choice in the composer delivery control. */
export interface DeliveryPresetOption {
  value: string;
  label: string;
}

/**
 * Preset delivery choices. The empty value is the backend/global default
 * (absent — the `deliver` key is omitted entirely). `origin` is
 * deliberately absent: it cannot resolve for a plugin create (D3).
 */
export const DELIVERY_PRESET_OPTIONS: ReadonlyArray<DeliveryPresetOption> = Object.freeze([
  { value: '', label: 'Backend default (no override)' },
  { value: 'local', label: 'Local — save results locally, no delivery' },
  { value: 'all', label: 'All — every connected home channel, resolved at run time' },
  { value: 'bot-chat', label: 'Bot Chat — a Hermes Bot Chat' },
  { value: 'custom', label: 'Custom target…' },
]);

/** Sentinel for the composer's free-text delivery slot. Never normalized directly. */
export const DELIVERY_CUSTOM_SENTINEL = 'custom';

/**
 * Read-only model line for surfaces that cannot set it (D2). Names the
 * default plainly so an absent picker never reads as a missing feature.
 */
export const MODEL_OVERRIDE_READONLY_NOTE =
  'Model override: routines run on the profile default — it cannot be set from this surface.';
