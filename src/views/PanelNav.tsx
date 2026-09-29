import type { ReactElement } from 'react';

// Panel navigation for every right-side panel (inspector, composer, guided
// configuration) — the responsive split the issue demands (issue #78).
//
// The routines list stays on screen beside the panel in the split view, so
// "Back to routines" there promises a navigation that never happened: the
// user did not leave anything. That view gets a DISMISS control instead —
// an explicit close icon, which is what the action is. On a narrow
// viewport the panel takes the full width, the list is no longer beside
// it, and going back to the list IS the navigation, so the Back wording
// is then honest and is kept.
//
// One control per layout, decided in ONE place: the stylesheet's
// 820px breakpoint (the same query the workspace already uses), not a
// media-query handler in JS duplicating the number. The control that is
// not displayed is `display: none`, so it is neither announced by a
// screen reader nor reachable by Tab — the two affordances can coexist in
// the markup without the user ever meeting the wrong one.

/** Focused id of the create button: where focus lands after the composer closes. */
export const NEW_ROUTINE_CONTROL_ID = 'hermes-routines-new';

/**
 * Id of the row control that owns the inspector, so dismissing the panel
 * can hand focus back to the row the user came from. Derived from the
 * view key, which is already the row's identity for the inspector.
 */
export function routineRowFocusId(key: string): string {
  return `hermes-routines-row--${key}`;
}

/**
 * The control focus returns to when a panel is dismissed. The guided
 * panel returns null: the notice action that opened it unmounts behind
 * the panel, so there is nothing there to return to. An inspector with no
 * key returns null too — "where practical", never a guess.
 */
export function dismissFocusId(surface: 'inspector' | 'composer' | 'guided', key: string | null): string | null {
  if (surface === 'inspector') {
    if (typeof key !== 'string' || key === '') return null;
    return routineRowFocusId(key);
  }
  if (surface === 'composer') return NEW_ROUTINE_CONTROL_ID;
  return null;
}

/**
 * Whether Escape means "leave the panel" for the element that received the
 * key. An open dropdown owns Escape first (SelectField closes its menu on
 * Escape, and the composer is built from dropdowns): a key that dismisses
 * the form the instant it dismisses a menu inside it is two clicks of
 * intent resolved by one keystroke, and the second one is unrecoverable.
 *
 * True for anything else — including a body-level key press, which is the
 * normal case for a user who never focused a control.
 */
export function escapeLeavesPanel(target: EventTarget | null): boolean {
  const node = target as Element | null;
  if (node === null || typeof node !== 'object') return true;
  const element = node as Element;
  if (typeof element.tagName !== 'string') return true;
  const tag = element.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  const role = typeof element.getAttribute === 'function' ? element.getAttribute('role') : null;
  if (role === 'combobox' || role === 'listbox' || role === 'option') return false;
  return true;
}

/**
 * Move focus to a control by id. Returns false when the node is gone or
 * focus is unavailable, so a caller can fall back instead of assuming it
 * worked. `preventScroll` keeps the list exactly where the user left it —
 * dismissing a side panel must not scroll the surface it did not change.
 */
export function focusById(id: string | null): boolean {
  if (id === null) return false;
  if (typeof document === 'undefined') return false;
  const node = document.getElementById(id);
  if (node === null || typeof node.focus !== 'function') return false;
  node.focus({ preventScroll: true });
  return true;
}

export interface PanelNavProps {
  /** What this control dismisses, named explicitly for the screen reader. */
  closeLabel: string;
  onClose: () => void;
}

export function PanelNav({ closeLabel, onClose }: PanelNavProps): ReactElement {
  return (
    <div className="hr-nav">
      {/* Narrow viewport only: the panel covers the list, so leaving it is a back navigation. */}
      <button
        type="button"
        className="hr-btn-nav hr-nav-back"
        onClick={onClose}
        aria-label="Back to routines"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
        </svg>
        <span>Back to routines</span>
      </button>
      {/* Split view only: the list is still on screen, so this dismisses the panel beside it. */}
      <button
        type="button"
        className="hr-btn-nav hr-nav-close"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path fillRule="evenodd" d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  );
}
