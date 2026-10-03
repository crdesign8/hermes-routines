// Requests parked by shell surfaces (palette, status bar) for the page.
//
// The palette and status contributions run outside React: their `run` and
// `onClick` handlers cannot set page state directly, and the page may not
// even be mounted when they fire (the handler navigates first). This module
// is the narrow bridge between those two moments: a shell handler parks one
// pending request here, then navigates to the page; the page consumes it on
// mount (and while mounted) and carries out the matching transition.
//
// Host-free and DOM-free on purpose: no SDK import, no document access, no
// polling. One pending slot is enough because each request navigates to the
// same page, so the latest intent wins and a stale one must never queue
// behind it.
export type ShellRequestKind = 'create' | 'attention';

let pending: ShellRequestKind | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // A throwing subscriber must not block the remaining ones.
    }
  }
}

function park(kind: ShellRequestKind): void {
  pending = kind;
  notify();
}

/** Park a request to open the routine creation flow on the page. */
export function requestRoutineCreate(): void {
  park('create');
}

/** Park a request to open the page focused on the attention slice. */
export function requestAttentionFocus(): void {
  park('attention');
}

/** Read the parked request without consuming it. */
export function peekShellRequest(): ShellRequestKind | null {
  return pending;
}

/**
 * Take the parked request, clearing the slot. Returns null when nothing is
 * parked. The page calls this on mount and from its subscription, so a
 * request parked before navigation is still honored after it.
 */
export function takeShellRequest(): ShellRequestKind | null {
  const next = pending;
  pending = null;
  return next;
}

/**
 * Subscribe to newly parked requests. Returns a disposer that removes the
 * listener. The page unsubscribes on unmount, so a parked request can never
 * leak a subscription past the plugin's lifetime.
 */
export function subscribeShellRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
