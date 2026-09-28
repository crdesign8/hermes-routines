import { useState, type ReactElement } from 'react';
import type { GuidedLaunchResult } from '../gateway/guidedLaunch';
import type { ProvisionalRoutine } from '../domain/provisional';
import { backendTargetProfile } from '../domain/routing';
import { humanScheduleOf, routinePromptOf, routineTitle } from '../domain/present';

// The post-create state for a guided routine: the job EXISTS and is
// PROVEN PAUSED, and this window is the only place that says so.
//
// It is deliberately not a success screen. Opening a chat proves nothing
// about the configuration — the agent may still need the user to answer
// questions, and nothing here is persisted — so the copy names the state
// ("Paused · needs configuration") instead of implying the routine is
// ready. The launch can fail, and a failed launch must not leave the user
// stuck: the identity is kept in local state and every failure renders the
// same retry, which re-opens a chat bound to the SAME job_id rather than
// creating another routine.

export interface GuidedRoutinePanelProps {
  routine: ProvisionalRoutine;
  /** The submitted form values, for a field the stored row does not carry. */
  submittedName: string;
  submittedSchedule: string;
  submittedPrompt: string;
  /** Auto-send on the first launch only; a retry always drafts. */
  autoSubmitOnFirstLaunch?: boolean;
  onLaunch: (
    routine: ProvisionalRoutine,
    submitted: { name: string; schedule: string; prompt: string },
    autoSubmit: boolean,
  ) => Promise<GuidedLaunchResult>;
  onClose: () => void;
}

export function GuidedRoutinePanel({
  routine,
  submittedName,
  submittedSchedule,
  submittedPrompt,
  autoSubmitOnFirstLaunch,
  onLaunch,
  onClose,
}: GuidedRoutinePanelProps): ReactElement {
  const [launching, setLaunching] = useState(false);
  // Launch outcome lives here, not in page state: a retry must reuse the
  // same handle, and a page-level reset would lose the job_id.
  const [launch, setLaunch] = useState<GuidedLaunchResult | null>(null);
  const [autoSubmit] = useState<boolean>(autoSubmitOnFirstLaunch === true);
  const firstLaunch = launch === null;

  const title = routineTitle(routine.job, submittedName || 'Routine');
  const schedule = humanScheduleOf(routine.job) || submittedSchedule || '—';
  const instruction = routinePromptOf(routine.job) ?? submittedPrompt;

  async function handleLaunch(): Promise<void> {
    if (launching) return;
    setLaunching(true);
    try {
      const result = await onLaunch(
        routine,
        { name: submittedName, schedule: submittedSchedule, prompt: submittedPrompt },
        // Auto-send is a property of the FIRST launch only. A retry means
        // the user is present and re-deciding, so it drafts and lets them
        // send — a hidden second auto-send would start a conversation the
        // user never asked for.
        autoSubmit && firstLaunch,
      );
      setLaunch(result);
    } finally {
      setLaunching(false);
    }
  }

  const failed = launch !== null && launch.ok === false;
  const opened = launch !== null && launch.ok === true;

  return (
    <aside className="hr-inspector hr-create-inspector" aria-label="Configure routine with Hermes">
      <header className="hr-inspector-header">
        <button
          type="button"
          className="hr-btn-action hr-btn-back"
          onClick={onClose}
          aria-label="Back to routines"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              fillRule="evenodd"
              d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
            />
          </svg>
          <span>Back to routines</span>
        </button>
      </header>

      <div className="hr-inspector-body">
        <h3 className="hr-create-title">{title}</h3>

        {/* The state, stated in words: the routine exists and cannot run. */}
        <div className="hr-create-active-card">
          <div className="hr-create-active-info">
            <span className="hr-create-active-title">Paused · needs configuration</span>
            <span className="hr-create-active-subtitle">
              The routine was created on {backendTargetProfile(routine.route, routine.backendProfile)} and will not
              run until its configuration is finished.
            </span>
          </div>
        </div>

        <div className="hr-create-field">
          <label className="hr-field-label">Job id</label>
          <input
            type="text"
            className="hr-create-input"
            value={routine.jobId}
            disabled
            readOnly
            aria-label="Routine job id"
          />
        </div>

        <div className="hr-create-field">
          <label className="hr-field-label">What should this routine do?</label>
          <textarea
            className="hr-create-textarea"
            rows={3}
            value={instruction ?? ''}
            disabled
            readOnly
            aria-label="What this routine does"
            placeholder="No instruction stored for this routine."
          />
        </div>

        <div className="hr-create-when-section">
          <div className="hr-create-section-label">WHEN TO RUN</div>
          <div className="hr-create-preview-sentence">{schedule}</div>
        </div>

        {failed ? (
          <div className="hr-create-error" role="alert">
            {launch.message}
            {launch.jobId ? ' The routine is still paused.' : ''}
          </div>
        ) : null}

        {opened ? (
          <div className="hr-create-preview-sentence" role="status">
            {launch.autoSubmitted
              ? 'Chat opened on this profile and the configuration envelope was sent.'
              : 'Chat opened on this profile with the configuration envelope ready to send.'}
          </div>
        ) : null}

        <div className="hr-create-actions">
          <button type="button" className="hr-btn hr-btn-back-routines" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="hr-btn hr-btn-create-submit"
            disabled={launching}
            onClick={() => void handleLaunch()}
          >
            {launching ? 'Opening…' : failed ? 'Retry chat' : 'Configure with Hermes'}
          </button>
        </div>
      </div>
    </aside>
  );
}
