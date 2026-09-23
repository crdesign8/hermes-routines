import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import { routineCompleted, routineErrored, routinePausedOf } from '../domain/present';

// Status badge ported from Crew's _statusGlyph + collapsed copy: four
// explicit states, unknown renders as scheduled (honest "still scheduled").

export type StatusTone = 'active' | 'paused' | 'completed' | 'error';

export function statusOf(job: RoutineJob | null | undefined): { label: string; tone: StatusTone } {
  if (routineCompleted(job)) return { label: 'Completed', tone: 'completed' };
  if (routineErrored(job)) return { label: 'Error', tone: 'error' };
  if (routinePausedOf(job)) return { label: 'Paused', tone: 'paused' };
  return { label: 'Active', tone: 'active' };
}

export function RoutineStatus({ job }: { job: RoutineJob }): ReactElement {
  const { label, tone } = statusOf(job);
  return (
    <span className={`hr-badge hr-badge-${tone}`}>
      <span className="hr-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
