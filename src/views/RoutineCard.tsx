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
import { RoutineStatus, statusOf } from './RoutineStatus';

export interface RoutineCardProps {
  job: RoutineJob;
  fallback: string;
  inspected?: boolean;
  busy: boolean;
  disabled: boolean;
  /** Id of the panel the disclosure controls — the inspector, beside the list. */
  inspectorId: string;
  /**
   * Id for the row's own disclosure control, so dismissing the panel can
   * hand focus back to the row the user came from. Optional: a caller
   * without focus restoration simply omits it.
   */
  controlId?: string;
  onSelect: () => void;
  onPause: () => void;
  onResume: () => void;
}

/**
 * One list row: status, title, actions and a compact one-line summary.
 *
 * A row NEVER expands into a detail block (issue #77). Schedule, next run,
 * last run and last result have one primary home — the inspector — so
 * selecting a row cannot reflow the list, and no value is painted twice.
 * What the row keeps is the concise summary an operator scans for, on a
 * single line whose height is identical whether or not the row is selected.
 */
export function RoutineCard(props: RoutineCardProps): ReactElement {
  const { job, fallback, inspected = false, busy, disabled, inspectorId, controlId } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const { tone, failure } = statusOf(job);
  const schedule = humanScheduleOf(job) || '—';
  // State-aware copy from the domain: a past next_run_at reads "Overdue by
  // 2 hours", never a past distance behind a "Next" label. A terminal
  // routine has no future, so its stale field is dropped — the same way the
  // inspector drops it.
  const nextCopy = routineActive(job) ? nextRunCopyOf(nextRunIso(job)) : null;

  return (
    <li
      className={`hr-row hr-row-${tone}${inspected ? ' hr-row-selected' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, .hr-row-actions')) return;
        props.onSelect();
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
            aria-expanded={inspected}
            // Only while open: the panel is unmounted when nothing is
            // selected, so a collapsed disclosure must not reference a node
            // that does not exist (issue #77).
            aria-controls={inspected ? inspectorId : undefined}
            onClick={(e) => {
              e.stopPropagation();
              props.onSelect();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onSelect();
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
            id={controlId}
            className={`hr-icon-btn hr-icon-btn-edit${inspected ? ' hr-icon-btn-active' : ''}`}
            aria-expanded={inspected}
            aria-controls={inspected ? inspectorId : undefined}
            aria-label={`${inspected ? 'Close details for' : 'Show details for'} ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              props.onSelect();
            }}
            title="Details"
          >
            Details
          </button>
        </div>
      </div>

      {/* One line, always. The failure summary stays compactly visible here
          (issue #76) because a row that failed must say so while scanning —
          but it is a summary, not a restatement of the inspector's detail
          rows, and it never changes the row's height. */}
      <div className="hr-row-sub">
        <div className="hr-row-subtitle">
          {paused ? (
            <>
              <span className="hr-sub-paused">Paused</span>
              {failure !== null ? (
                <>
                  <span className="hr-sub-sep">|</span>
                  <span className="hr-sub-failed">{failure}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="hr-sub-schedule">{schedule}</span>
              {failure !== null ? (
                <>
                  <span className="hr-sub-sep">|</span>
                  <span className="hr-sub-failed">{failure}</span>
                </>
              ) : null}
              {nextCopy ? (
                <>
                  <span className="hr-sub-sep">|</span>
                  <span className="hr-sub-next">{nextCopy.sentence}</span>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
