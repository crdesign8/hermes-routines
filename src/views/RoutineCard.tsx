import type { RoutineJob } from '../domain/jobs';
import {
  collapsedSubtitleOf,
  routinePausedOf,
  routineTerminal,
  routineTitle,
} from '../domain/present';
import { RoutineDetails } from './RoutineDetails';
import { RoutineStatus } from './RoutineStatus';

// One routine card, ported from Crew's _JobCard: status glyph + title,
// human schedule + next run as the collapsed subtitle, details on demand.
// Actions are pause/resume only — terminal jobs (completed/error) expose
// no mutation, and create/edit/run/delete are not part of this surface.

export interface RoutineCardProps {
  job: RoutineJob;
  fallback: string;
  expanded: boolean;
  busy: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RoutineCard(props: RoutineCardProps) {
  const { job, fallback, expanded, busy, disabled } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const subtitle = collapsedSubtitleOf(job);
  const controlsId = `hr-details-${fallback.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;

  return (
    <li className={'hr-card' + (paused && !terminal ? ' hr-card-paused' : '')}>
      <div className="hr-card-head">
        <button
          type="button"
          className="hr-card-toggle"
          aria-expanded={expanded}
          aria-controls={controlsId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${title}`}
          onClick={props.onToggleExpand}
        >
          <span className={'hr-caret' + (expanded ? ' hr-caret-open' : '')} aria-hidden="true">
            ▸
          </span>
        </button>
        <div className="hr-card-title">
          <strong className="hr-row-id">{title}</strong>
          <RoutineStatus job={job} />
        </div>
        <div className="hr-row-actions">
          {!terminal ? (
            paused ? (
              <button
                type="button"
                className="hr-btn"
                disabled={disabled}
                onClick={props.onResume}
                aria-label={`Resume ${title}`}
              >
                {busy ? 'Resuming…' : 'Resume'}
              </button>
            ) : (
              <button
                type="button"
                className="hr-btn"
                disabled={disabled}
                onClick={props.onPause}
                aria-label={`Pause ${title}`}
              >
                {busy ? 'Pausing…' : 'Pause'}
              </button>
            )
          ) : null}
        </div>
      </div>
      {!expanded ? <p className="hr-subtitle">{subtitle}</p> : null}
      {expanded ? (
        <div id={controlsId}>
          <RoutineDetails job={job} fallback={fallback} />
        </div>
      ) : null}
    </li>
  );
}
