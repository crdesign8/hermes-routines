import type { RefObject } from 'react';

// Feedback panels shared by the page's branches: an error box (message +
// retry) and an empty box (message, optional action). Pure — copy and
// callbacks come in as props.

export interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry: () => void;
}

export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <div className="hr-error" role="alert">
      <strong>{title}</strong>
      <p className="hr-row-meta">{message}</p>
      <button type="button" className="hr-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export interface EmptyPanelProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyPanel({ message, actionLabel, onAction }: EmptyPanelProps) {
  return (
    <div className="hr-empty">
      {actionLabel && onAction ? (
        <>
          <p>{message}</p>
          <button type="button" className="hr-btn" onClick={onAction}>
            {actionLabel}
          </button>
        </>
      ) : (
        message
      )}
    </div>
  );
}

export interface StatusLineProps {
  text: string;
  statusRef: RefObject<HTMLParagraphElement | null>;
}

/** Polite live region: every state change reaches assistive tech here. */
export function StatusLine({ text, statusRef }: StatusLineProps) {
  return (
    <p ref={statusRef} tabIndex={-1} className="hr-status" role="status" aria-live="polite">
      {text || 'Routines ready.'}
    </p>
  );
}
