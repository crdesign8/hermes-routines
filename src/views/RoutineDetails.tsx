import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import {
  humanScheduleOf,
  lastResultOf,
  lastRunIso,
  nextRunIso,
  routineActive,
  runDistanceOf,
  type LastResult,
  type RunDistance,
} from '../domain/present';

// Expanded details, ported from Crew's _expandedDetails: Schedule is
// always human language; Next/Last run pair distance with the absolute
// date inline; Last result carries success/error tone.
//
// The run values live in domain/present.ts and render here, so the lateral
// inspector can show the same outcome without restating a single rule.

export function RoutineDetails({
  job,
}: {
  job: RoutineJob;
  fallback?: string;
}): ReactElement {
  const schedule = humanScheduleOf(job) || '—';
  const nextRun = routineActive(job) ? runDistanceOf(nextRunIso(job)) : null;
  const lastRun = runDistanceOf(lastRunIso(job));
  const result = lastResultOf(job);

  return (
    <div className="hr-details">
      <div className="hr-detail">
        <span className="hr-detail-label">Schedule</span>
        <span className="hr-detail-value">{schedule}</span>
      </div>
      {nextRun !== null ? (
        <div className="hr-detail">
          <span className="hr-detail-label">Next run</span>
          <RunWhen distance={nextRun} strong />
        </div>
      ) : null}
      {lastRun !== null ? (
        <div className="hr-detail">
          <span className="hr-detail-label">Last run</span>
          <RunWhen distance={lastRun} />
        </div>
      ) : null}
      <div className="hr-detail">
        <span className="hr-detail-label">Last result</span>
        <ResultTone kind={result.kind} text={result.text} />
      </div>
    </div>
  );
}

/** A run distance paired with its absolute date. */
export function RunWhen({
  distance,
  strong,
}: {
  distance: RunDistance;
  strong?: boolean;
}): ReactElement {
  return (
    <span className={strong ? 'hr-detail-value hr-next' : 'hr-detail-value'}>
      {distance.text}
      {distance.date !== null ? <span className="hr-date"> ({distance.date})</span> : null}
    </span>
  );
}

/** Outcome text plus its tone glyph — meaning never rests on color alone. */
export function ResultTone({
  kind,
  text,
}: {
  kind: LastResult['kind'];
  text: string;
}): ReactElement {
  return (
    <span className={`hr-result hr-result-${kind}`}>
      {kind === 'success' ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 6 }}>
          <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z"/>
        </svg>
      ) : kind === 'error' ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 6 }}>
          <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z"/>
        </svg>
      ) : null}
      {text}
    </span>
  );
}
