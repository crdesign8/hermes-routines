import type { RefObject } from 'react';
import { Button } from '@hermes/plugin-sdk';

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
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
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
          <Button variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
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
  /**
   * The page already states this text persistently somewhere else (the
   * toolbar count, the empty state). The live region keeps its node, its
   * role and its text so assistive tech still hears the announcement, but
   * it stops painting a second, permanent copy on screen. Transient
   * feedback (loading, errors, pause/resume/create results) must not set
   * this — it is the page's visible operational signal.
   */
  restatesVisibleState?: boolean;
}

/** Polite live region: every state change reaches assistive tech here. */
export function StatusLine({ text, statusRef, restatesVisibleState }: StatusLineProps) {
  return (
    <p
      ref={statusRef}
      tabIndex={-1}
      className={restatesVisibleState ? 'hr-status hr-sr-only' : 'hr-status'}
      role="status"
      aria-live="polite"
    >
      {text || 'Routines ready.'}
    </p>
  );
}
