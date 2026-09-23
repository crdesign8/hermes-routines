import type { RefObject } from 'react';
import type { RoutineJob } from '../domain/jobs';

// One routine row: identity + status badge + its actions. Pure — every
// handler comes in as a prop, so the row holds no state of its own.
// Removing is two-step: `Remove` opens a labelled confirm group, then
// `Confirm remove` / `Cancel`. Row actions stay disabled while a mutation
// is in flight (the parent owns that lock), so optimistic snapshots never
// overlap.

export interface RoutineRowProps {
  job: RoutineJob;
  name: string;
  paused: boolean;
  busy: boolean;
  confirming: boolean;
  disabled: boolean;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onPause: () => void;
  onResume: () => void;
  onRemoveOpen: () => void;
  onConfirmRemove: () => void;
  onCancel: () => void;
}

export function RoutineRow(props: RoutineRowProps) {
  const { job, name, paused, busy, confirming, disabled } = props;
  return (
    <li className="hr-row-item">
      <div>
        <span>
          <strong className="hr-row-id">{name}</strong>
          <span className={paused ? 'hr-badge hr-badge-paused' : 'hr-badge hr-badge-active'}>
            {paused ? 'Paused' : 'Active'}
          </span>
        </span>
        <div className="hr-row-meta">
          {'Schedule: ' + String(job.schedule || 'not set') + (busy ? ' — Working…' : '')}
        </div>
      </div>
      {confirming ? (
        <div className="hr-confirm" role="group" aria-label={`Confirm removal of ${name}`}>
          <span className="hr-row-meta">{`Remove ${name}?`}</span>
          <button
            ref={props.confirmRef}
            type="button"
            className="hr-btn hr-btn-danger"
            disabled={disabled}
            onClick={props.onConfirmRemove}
          >
            Confirm remove
          </button>
          <button type="button" className="hr-btn" disabled={disabled} onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="hr-row-actions">
          {paused ? (
            <button
              type="button"
              className="hr-btn"
              disabled={disabled}
              onClick={props.onResume}
              aria-label={`Resume ${name}`}
            >
              {busy ? 'Resuming…' : 'Resume'}
            </button>
          ) : (
            <button
              type="button"
              className="hr-btn"
              disabled={disabled}
              onClick={props.onPause}
              aria-label={`Pause ${name}`}
            >
              {busy ? 'Pausing…' : 'Pause'}
            </button>
          )}
          <button
            type="button"
            className="hr-btn hr-btn-danger"
            disabled={disabled}
            onClick={props.onRemoveOpen}
            aria-label={`Remove ${name}`}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      )}
    </li>
  );
}
