// Host/error message helpers shared by the gateway and the view.
// Displayed text never carries a raw stack: the message is clipped and the
// original error stays attached as `cause` for debugging.

/** Extract a human-readable message from anything a host call may reject with. */
export function messageOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return String(value);
}

/**
 * Wrap a host failure for display: `context: message`, original error kept as
 * `cause`, message clipped to 300 chars so a huge payload never floods the
 * view. A raw stack never reaches the UI.
 */
export function wrapHostError(err: unknown, context: string): Error {
  const detail = messageOf(err);
  const clipped = detail.length > 300 ? detail.slice(0, 300) : detail;
  return new Error(`${context}: ${clipped}`, { cause: err });
}
