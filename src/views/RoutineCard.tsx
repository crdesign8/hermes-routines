import type { ReactElement } from 'react';
import type { RoutineJob } from '../domain/jobs';
import {
  humanScheduleOf,
  nextRunCopyOf,
  nextRunIso,
  routineActive,
  routinePausedOf,
  routineTerminal,
  routineTitle,
} from '../domain/present';
import { RoutineDetails } from './RoutineDetails';
import { RoutineStatus, statusOf } from './RoutineStatus';

export interface RoutineCardProps {
  job: RoutineJob;
  fallback: string;
  expanded: boolean;
  inspected?: boolean;
  busy: boolean;
  disabled: boolean;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RoutineCard(props: RoutineCardProps): ReactElement {
  const { job, fallback, expanded, inspected = false, busy, disabled } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const { tone } = statusOf(job);
  const schedule = humanScheduleOf(job) || '—';
  // State-aware copy from the domain: a past next_run_at reads "Overdue by
  // 2 hours", never a past distance behind a "Next" label. A terminal
  // routine has no future, so its stale field is dropped the same way the
  // expanded card and the inspector drop it.
  const nextCopy = routineActive(job) ? nextRunCopyOf(nextRunIso(job)) : null;
  const controlsId = `hr-details-${fallback.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;

  return (
    <li
      className={`hr-row hr-row-${tone}${expanded ? ' hr-row-expanded' : ''}${inspected ? ' hr-row-selected' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, .hr-row-actions')) return;
        props.onToggleExpand();
      }}
      style={{ cursor: 'pointer' }}
    >
      <div className="hr-row-top">
        <div className="hr-row-left">
          <RoutineStatus job={job} />
          <span
            className="hr-row-title"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleExpand();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onToggleExpand();
              }
            }}
          >
            {title}
          </span>
        </div>

        <div className="hr-row-actions">
          {!terminal ? (
            paused ? (
              <button
                type="button"
                className="hr-icon-btn hr-icon-btn-resume"
                disabled={disabled || busy}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onResume();
                }}
                aria-label={`Resume ${title}`}
                title="Resume routine"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className="hr-icon-btn hr-icon-btn-pause"
                disabled={disabled || busy}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onPause();
                }}
                aria-label={`Pause ${title}`}
                title="Pause routine"
              >
                Pause
              </button>
            )
          ) : null}

          <button
            type="button"
            className={`hr-icon-btn hr-icon-btn-edit${inspected ? ' hr-icon-btn-active' : ''}`}
            aria-expanded={expanded}
            aria-controls={controlsId}
            aria-label={`${inspected ? 'Close inspector' : 'Edit'} details for ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              if (props.onEdit) props.onEdit();
              else props.onToggleExpand();
            }}
            title="Edit routine"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="hr-row-sub">
        {!expanded ? (
          <div className="hr-row-subtitle">
            {paused ? (
              <span className="hr-sub-paused">Paused</span>
            ) : (
              <>
                <span className="hr-sub-schedule">{schedule}</span>
                {nextCopy ? (
                  <>
                    <span className="hr-sub-sep">|</span>
                    <span className="hr-sub-next">{nextCopy.sentence}</span>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div id={controlsId} className="hr-row-details">
            <RoutineDetails job={job} fallback={fallback} />
          </div>
        )}
      </div>
    </li>
  );
}
