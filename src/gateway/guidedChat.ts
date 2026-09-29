import { host, type PluginProfileRoute } from '@hermes/plugin-sdk';
import { routeKey } from '../domain/routing';

// Guided routine-configuration chat: the ONE door to Desktop's
// session/composer surface for this plugin. UI code calls
// `openGuidedRoutineChat` and never learns that a fresh chat is addressed by
// the literal `'new'`, that the prompt rides the composer's setDraft/submit
// buses, or how the route decides the profile.
//
// Only upstream `host` methods are used — no DOM traversal, no React fiber
// inspection, no private globals, no direct composer element manipulation.
//
// Fail-closed, like the cron gateway: a configuration chat must never
// silently fall back to the active/ambient profile. `host.newChat` resolves
// an absent profile argument to the ACTIVE gateway profile, so a chat
// launched for a job on another connection would land on the wrong backend.
// That is why a concrete route is required, and why every failure mode
// throws instead of degrading to an ambiguous open.

/**
 * Address of the fresh draft `host.newChat` just opened: the composer
 * targeting the literal `'new'` — the primary surface while it shows no
 * session. Upstream (`sdk/composer.ts` `resolveComposerAddress`) NEVER falls
 * through from `'new'` to the active composer, so a write can only reach the
 * draft this call created.
 */
export const GUIDED_CHAT_DRAFT = 'new';

/** What the caller asked for; resolved to a report by `openGuidedRoutineChat`. */
export interface GuidedRoutineChatRequest {
  /** Concrete route the chat must run on. Required — no ambient fallback. */
  route: PluginProfileRoute;
  /** Opening prompt seated in the fresh composer. Required, non-blank. */
  initialPrompt: string;
  /**
   * false (default) seats the prompt without sending; true makes the
   * explicit button press submit the kickoff. A refused submission is a
   * failure, not a successful launch with autoSubmitted=false.
   */
  autoSubmit?: boolean;
}

/** Outcome of a guided chat launch. `ok: false` never opens anything. */
export type GuidedRoutineChatResult =
  | { ok: true; routeKey: string; autoSubmitted: boolean }
  | { ok: false; reason: GuidedRoutineChatFailure; message: string };

export type GuidedRoutineChatFailure =
  | 'no_route'
  | 'blank_prompt'
  | 'no_new_chat'
  | 'no_composer'
  | 'session_open_failed'
  | 'draft_not_claimed'
  | 'submit_not_accepted';

function failure(reason: GuidedRoutineChatFailure, message: string): GuidedRoutineChatResult {
  return { ok: false, reason, message };
}

/**
 * Open a guided routine-configuration chat on `request.route` and seat
 * `request.initialPrompt` in its fresh composer.
 *
 * The only supported sequence is newChat → composer setDraft (→ composer
 * submit when `autoSubmit`): the prompt must land in the draft the new chat
 * owns, so it can never be written into a session that was already open.
 */
export async function openGuidedRoutineChat(
  request: GuidedRoutineChatRequest,
): Promise<GuidedRoutineChatResult> {
  // routeKey validates the descriptor (both halves non-empty strings) and
  // throws on a broken one; a descriptor that cannot be keyed is a
  // descriptor we refuse to open a chat on.
  let key: string;
  try {
    key = routeKey(request?.route);
  } catch {
    return failure('no_route', 'Guided chat requires a concrete profile route');
  }

  const prompt = typeof request.initialPrompt === 'string' ? request.initialPrompt.trim() : '';
  if (!prompt) {
    return failure('blank_prompt', 'Guided chat requires an opening prompt');
  }

  // Older desktops may present a host without these doors; feature-detect
  // instead of calling blind, so the caller gets a report, not a TypeError.
  if (typeof host.newChat !== 'function') {
    return failure('no_new_chat', 'Update Hermes Desktop to start a configuration chat');
  }
  if (typeof host.composer?.setDraft !== 'function') {
    return failure('no_composer', 'Update Hermes Desktop to start a configuration chat');
  }

  if (request.autoSubmit === true && typeof host.composer.submit !== 'function') {
    return failure('no_composer', 'Update Hermes Desktop to submit a configuration chat');
  }

  // The route — not a profile name — is the argument, so a cross-connection
  // chat is created on the connection that owns the job.
  try {
    host.newChat(request.route);
  } catch {
    return failure('session_open_failed', 'The configuration chat could not be opened. Retry from this routine.');
  }

  // A rejected draft or submission never counts as a successful kickoff.
  // Retry opens a fresh chat for the SAME job, without recreating it.
  try {
    const seated = await host.composer.setDraft(GUIDED_CHAT_DRAFT, prompt);
    if (!seated) {
      return failure('draft_not_claimed', 'The new chat did not accept the prompt');
    }
    if (request.autoSubmit !== true) {
      return { ok: true, routeKey: key, autoSubmitted: false };
    }
    const sent = host.composer.submit(GUIDED_CHAT_DRAFT, prompt);
    return sent
      ? { ok: true, routeKey: key, autoSubmitted: true }
      : failure('submit_not_accepted', 'The new chat did not submit the prompt. Retry to start configuration.');
  } catch {
    return failure('submit_not_accepted', 'The configuration prompt could not be submitted. Retry from this routine.');
  }
}
