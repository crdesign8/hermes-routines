import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import {
  isFailedStatus,
  routineErrored,
  routineHealthOf,
} from '../domain/present';

export type StatusTone = 'active' | 'paused' | 'completed' | 'error' | 'failed' | 'unknown';

export interface StatusView {
  label: string;
  tone: StatusTone;
  /**
   * Compact failure copy for the list row (issue #76), or null when the
   * row claims no failure. One derivation serves both the sr-only label
   * and the visible text, so the words and the icon can never disagree —
   * and a success or a clean pause never grows an error affordance.
   */
  failure: string | null;
}

export function statusOf(job: RoutineJob | null | undefined): StatusView {
  const health = routineHealthOf(job);
  switch (health) {
    case 'completed':
      return { label: 'Completed', tone: 'completed', failure: null };
    case 'failed':
      // Error lifecycle state keeps its own copy even when the health token
      // is a plain failure.
      if (routineErrored(job)) return { label: 'Error', tone: 'error', failure: 'Error' };
      return { label: 'Active — last run failed', tone: 'failed', failure: 'Last run failed' };
    case 'paused':
      // Status-token-only gate: a clean pause carrying a benign
      // paused_reason is 'Paused', never 'Paused — last run failed'.
      if (isFailedStatus(job)) {
        return { label: 'Paused — last run failed', tone: 'paused', failure: 'Last run failed' };
      }
      return { label: 'Paused', tone: 'paused', failure: null };
    case 'unknown':
      return { label: 'Active', tone: 'unknown', failure: null };
    case 'healthy':
      return { label: 'Active', tone: 'active', failure: null };
  }
}

export function RoutineStatus({ job }: { job: RoutineJob }): ReactElement {
  const { label, tone } = statusOf(job);
  return (
    <span className={`hr-status-indicator hr-status-${tone}`} title={label} aria-label={label}>
      {tone === 'active' ? (
        <svg className="hr-status-svg hr-status-svg-active" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <polyline points="8 4.2 8 8 10.8 8" />
        </svg>
      ) : tone === 'paused' ? (
        <svg className="hr-status-svg hr-status-svg-paused" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <line x1="6.5" y1="5.5" x2="6.5" y2="10.5" />
          <line x1="9.5" y1="5.5" x2="9.5" y2="10.5" />
        </svg>
      ) : tone === 'failed' ? (
        <svg className="hr-status-svg hr-status-svg-failed" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
          <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
        </svg>
      ) : tone === 'unknown' ? (
        <svg className="hr-status-svg hr-status-svg-unknown" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
        </svg>
      ) : (
        <svg className="hr-status-svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      )}
      <span className="hr-sr-only">{label}</span>
    </span>
  );
}
