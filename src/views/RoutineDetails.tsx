import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import {
  formatDate,
  formatWhen,
  humanScheduleOf,
  lastResultOf,
  lastRunIso,
  nextRunIso,
  rawScheduleOf,
  routineActive,
  routineTitle,
} from '../domain/present';

// Expanded details, ported from Crew's _expandedDetails: Schedule is
// always human language; Next/Last run pair distance with the absolute
// date inline; Last result carries success/error tone. Raw cron lives
// one disclosure down so the human abstraction leads.

export function RoutineDetails({
  job,
  fallback,
}: {
  job: RoutineJob;
  fallback: string;
}): ReactElement {
  const schedule = humanScheduleOf(job) || '—';
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const raw = rawScheduleOf(job);
  const title = routineTitle(job, fallback);
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
        <span className={`hr-result hr-result-${result.kind}`}>{result.text}</span>
      </div>
      {raw !== null && raw !== schedule ? (
        <details className="hr-tech">
          <summary className="hr-tech-summary">Technical details</summary>
          <div className="hr-tech-body">
            <span className="hr-detail-label">Routine</span>
            <code className="hr-code">{title}</code>
            <span className="hr-detail-label">Cron</span>
            <code className="hr-code">{raw}</code>
          </div>
        </details>
      ) : null}
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
