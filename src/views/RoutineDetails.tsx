import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import {
  formatDate,
  formatWhen,
  humanScheduleOf,
  lastResultOf,
  lastRunIso,
  nextRunIso,
  routineActive,
} from '../domain/present';

// Expanded details, ported from Crew's _expandedDetails: Schedule is
// always human language; Next/Last run pair distance with the absolute
// date inline; Last result carries success/error tone.

export function RoutineDetails({
  job,
}: {
  job: RoutineJob;
  fallback?: string;
}): ReactElement {
  const schedule = humanScheduleOf(job) || '—';
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const showRuns = routineActive(job);

  return (
    <div className="hr-details">
      <div className="hr-detail">
        <span className="hr-detail-label">Schedule</span>
        <span className="hr-detail-value">{schedule}</span>
      </div>
      {showRuns && nextIso !== null && formatWhen(nextIso) !== null ? (
        <div className="hr-detail">
          <span className="hr-detail-label">Next run</span>
          <RunValue iso={nextIso} strong />
        </div>
      ) : null}
      {showRuns && lastIso !== null && formatWhen(lastIso) !== null ? (
        <div className="hr-detail">
          <span className="hr-detail-label">Last run</span>
          <RunValue iso={lastIso} />
        </div>
      ) : null}
      <div className="hr-detail">
        <span className="hr-detail-label">Last result</span>
        <span className={`hr-result hr-result-${result.kind}`}>
          {result.kind === 'success' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 6 }}>
              <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z"/>
            </svg>
          ) : result.kind === 'error' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: -2, marginRight: 6 }}>
              <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z"/>
            </svg>
          ) : null}
          {result.text}
        </span>
      </div>
    </div>
  );
}

function RunValue({ iso, strong }: { iso: string; strong?: boolean }): ReactElement | null {
  const distance = formatWhen(iso);
  if (distance === null) return null;
  const date = formatDate(iso);
  return (
    <span className={strong ? 'hr-detail-value hr-next' : 'hr-detail-value'}>
      {distance}
      {date !== null ? <span className="hr-date"> ({date})</span> : null}
    </span>
  );
}
