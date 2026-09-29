import type { ReactElement } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import type { RoutineJob } from '../domain/jobs';
import {
  humanScheduleOf,
  lastExecutionOf,
  routineActive,
  routinePromptOf,
  routineTitle,
} from '../domain/present';
import { readStoredDelivery, readStoredModelOverride } from '../domain/advancedSettings';
import { describeDestination } from '../domain/destinations';
import { guidedConfigCandidateOf } from '../domain/provisional';
import { ResultTone, RunWhen } from './RoutineDetails';

export interface RoutineInspectorPanelProps {
  job: RoutineJob;
  fallback: string;
  activeRoute: PluginProfileRoute | null;
  activeProfile: string | null;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RoutineInspectorPanel({
  job,
  fallback,
  onClose,
}: RoutineInspectorPanelProps): ReactElement {
  const title = routineTitle(job, fallback);
  const schedule = humanScheduleOf(job) || '—';
  const execution = lastExecutionOf(job);
  // Stored advanced values, shown ONLY when they differ from the
  // defaults (issue #65 Part A): an absent delivery is the backend
  // default and an absent model override is the profile default, so
  // neither is painted. Stored truth reads back verbatim — never
  // re-validated, because the backend owns what is stored.
  const row = (job ?? null) as unknown as Record<string, unknown> | null;
  const storedDelivery = readStoredDelivery(row);
  const storedModelOverride = readStoredModelOverride(row);
  // The stored target is DESCRIBED, not echoed (issue #73): the panel
  // answers "where do this routine's results go" the way the composer
  // asked it. A value this profile cannot name (an explicit platform
  // target written elsewhere) keeps its verbatim form rather than being
  // hidden — an unexplained destination is honest, a missing one is not.
  const describedDelivery = describeDestination(storedDelivery);
  // Incomplete configuration (issue #65 Part B, scenario 1): paused and
  // never run means no complete configuration to preserve. Read-only
  // text — never a control, never a resume: the reopen action lives on
  // the list, where the owning route is known.
  const needsConfiguration = guidedConfigCandidateOf(job) !== null;

  return (
    <aside className="hr-inspector" aria-label={`Details for ${title}`}>
      <header className="hr-inspector-header">
        <button
          type="button"
          className="hr-btn-action hr-btn-back"
          onClick={onClose}
          aria-label="Back to routines"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          <span>Back to routines</span>
        </button>
      </header>

      <div className="hr-inspector-body">
        {/* Opaque mirror of the composer: the same sections and classes
            as RoutineComposerPanel with every control disabled, populated
            from the stored row. No cron expression, no ids, no route
            scope, no actions: this window is for editing, and editing does
            not exist upstream yet.
            EDIT SEAM — when the backend exposes an update action, this
            panel gains editable/onSave props and these fields flip to
            enabled; the layout already matches the form.

            The LAST EXECUTION block below is the one exception, and it is
            read-only by construction: it carries no control, only the
            latest run's outcome, so it can never become an edit seam. */}
        <h3 className="hr-create-title">{title}</h3>

        {/* Paused and never run: its configuration is incomplete. Stated
            in words so the list/inspector answer scenario 1 even after a
            reload wiped the guided panel state. */}
        {needsConfiguration ? (
          <div className="hr-create-active-card">
            <div className="hr-create-active-info">
              <span className="hr-create-active-title">Paused · needs configuration</span>
              <span className="hr-create-active-subtitle">
                This routine is paused and has never run — its configuration is incomplete.
              </span>
            </div>
          </div>
        ) : null}

        {/* Active Toggle Card (disabled mirror) */}
        <div className="hr-create-active-card">
          <div className="hr-create-active-info">
            <span className="hr-create-active-title">Active</span>
            <span className="hr-create-active-subtitle">This routine will run on the schedule below.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={routineActive(job)}
            aria-label="Routine active state"
            disabled
            className={`hr-switch-pill ${routineActive(job) ? 'hr-switch-active' : ''}`}
          >
            <span className="hr-switch-thumb" />
          </button>
        </div>

        {/* Name (disabled mirror) */}
        <div className="hr-create-field">
          <label className="hr-field-label">Name</label>
          <input
            type="text"
            className="hr-create-input"
            value={title}
            disabled
            readOnly
            aria-label="Routine name"
          />
        </div>

        {/* Instruction (disabled mirror) */}
        <div className="hr-create-field">
          <label className="hr-field-label">What should this routine do?</label>
          <textarea
            className="hr-create-textarea"
            rows={3}
            value={routinePromptOf(job) ?? ''}
            disabled
            readOnly
            aria-label="What this routine does"
            placeholder="No instruction stored for this routine."
          />
        </div>

        {/* WHEN TO RUN (disabled mirror: human sentence only — the same
            abstraction the composer previews; never the raw expression) */}
        <div className="hr-create-when-section">
          <div className="hr-create-section-label">WHEN TO RUN</div>
          <div className="hr-create-preview-sentence">{schedule}</div>
        </div>

        {/* ADVANCED (stored values only, and only when they differ from
            the defaults). Mirrors the composer's secondary section with
            every value read-only: where the results go, in the same human
            words the composer offered. No control, no button — this block
            can never become an edit seam by accident.

            A stored model pin stays here as a plain read-only line
            (issue #74): the composer no longer pretends it is a setting,
            and hiding a pin the backend actually applies would make an
            unexplained model unfalsifiable. It is a report, not a field. */}
        {describedDelivery !== null || storedModelOverride !== null ? (
          <div className="hr-create-when-section">
            <div className="hr-create-section-label">ADVANCED</div>
            {describedDelivery !== null ? (
              <div className="hr-create-field">
                <label className="hr-field-label">Results go to</label>
                <div className="hr-create-preview-sentence">
                  {describedDelivery.resolved ? describedDelivery.label : storedDelivery}
                </div>
                {describedDelivery.detail ? (
                  <div className="hr-create-preview-sentence">{describedDelivery.detail}</div>
                ) : null}
                {/* The raw backend value stays available, read-only: it
                    is what the backend actually holds, and hiding it
                    would make an unexplained target unfalsifiable. */}
                <input
                  type="text"
                  className="hr-create-input"
                  value={storedDelivery ?? ''}
                  disabled
                  readOnly
                  aria-label="Stored delivery"
                />
              </div>
            ) : null}
            {storedModelOverride !== null ? (
              // A report of stored truth, not a setting: a plain read-only
              // line, never an input. A disabled input still reads as a
              // form field the user failed to fill in (issue #74).
              <div className="hr-detail">
                <span className="hr-detail-label">Model</span>
                <span className="hr-detail-value">{storedModelOverride}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* LAST EXECUTION (read-only run outcome, separated from the
            editable/configuration content above). Values come from
            lastExecutionOf and render through the same components as the
            expanded card, so the two surfaces cannot disagree. */}
        <div className="hr-inspector-last-run">
          <div className="hr-create-section-label">LAST EXECUTION</div>
          {execution.lastRun !== null ? (
            <div className="hr-detail">
              <span className="hr-detail-label">Last run</span>
              <RunWhen distance={execution.lastRun} />
            </div>
          ) : null}
          <div className="hr-detail">
            <span className="hr-detail-label">Last result</span>
            {execution.known ? (
              <ResultTone kind={execution.resultKind} text={execution.resultText} />
            ) : (
              // Stated in words, never as a placeholder that reads as data.
              <span className="hr-muted">No runs yet.</span>
            )}
          </div>
          {execution.issue !== null ? (
            <div className="hr-detail">
              <span className="hr-detail-label">Issue</span>
              <span className="hr-detail-value hr-inspector-issue">{execution.issue}</span>
            </div>
          ) : null}
          {execution.nextRun !== null ? (
            <div className="hr-detail">
              <span className="hr-detail-label">Next run</span>
              <RunWhen distance={execution.nextRun} strong />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
