import type { ReactElement } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import type { RoutineJob } from '../domain/jobs';
import {
  humanScheduleOf,
  routineActive,
  routinePromptOf,
  routineTitle,
} from '../domain/present';

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
            from the stored row — and nothing the composer does not show.
            No cron expression, no ids, no run metadata, no actions: this
            window is for editing, and editing does not exist upstream yet.
            EDIT SEAM — when the backend exposes an update action, this
            panel gains editable/onSave props and these fields flip to
            enabled; the layout already matches the form. */}
        <h3 className="hr-create-title">{title}</h3>

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
      </div>
    </aside>
  );
}
