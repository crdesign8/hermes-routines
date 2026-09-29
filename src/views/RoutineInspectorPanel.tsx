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
import { explainFailureOf } from '../domain/failureExplain';
import { guidedConfigCandidateOf } from '../domain/provisional';
import { ResultTone, RunWhen } from './RunOutcome';
import { PanelNav } from './PanelNav';

/**
 * Id of the detail surface the list rows disclose. Declared once here and
 * consumed by both the panel and the rows, so the disclosure relation can
 * never point at a node that does not exist (issue #77).
 */
export const INSPECTOR_PANEL_ID = 'hermes-routines-inspector';

export interface RoutineInspectorPanelProps {
  job: RoutineJob;
  fallback: string;
  /** Id the list rows' disclosures point at. */
  id?: string;
  activeRoute: PluginProfileRoute | null;
  activeProfile: string | null;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  /**
   * Reopen handler for an incomplete configuration (issue #93). Present
   * only so the page can wire its existing guided-reopen path; the panel
   * calls it with the candidate's canonical job_id and renders no action
   * at all when the inspected row is not a candidate.
   */
  onConfigure?: (jobId: string) => void;
}

export function RoutineInspectorPanel({
  job,
  fallback,
  id = INSPECTOR_PANEL_ID,
  onClose,
  onConfigure,
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
  // text plus, when the page wired one, the single reopen action that
  // lives in this detail context (issue #93) — never on the list, never
  // on the banner. The candidate carries the canonical job_id the
  // handler is called with.
  const configCandidate = guidedConfigCandidateOf(job);
  const needsConfiguration = configCandidate !== null;
  // Failure hierarchy (issue #76): the run's story reads what failed,
  // then the concise reason when one can be safely derived, then —
  // collapsed and visually secondary — the raw evidence. Null for every
  // row whose latest run did not fail, so success and pause stay free of
  // failure affordances.
  const failure = explainFailureOf(job);

  return (
    <aside className="hr-inspector" id={id} aria-label={`Details for ${title}`}>
      <header className="hr-inspector-header">
        {/* Split view: the list is still beside this panel, so the action is
            a dismiss, not a back navigation (issue #78). On a narrow
            viewport the same control reads as Back, because there the panel
            does cover the list. */}
        <PanelNav closeLabel={`Close details for ${title}`} onClose={onClose} />
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
            reload wiped the guided panel state. The single reopen action
            lives here, in the detail context of the one routine it acts
            on (issue #93) — never on the list, never on the banner. */}
        {needsConfiguration ? (
          <div className="hr-inspector-note">
            <span className="hr-create-active-title">Paused · needs configuration</span>
            <span className="hr-create-active-subtitle">
              This routine is paused and has never run — its configuration is incomplete.
            </span>
            {configCandidate !== null && onConfigure ? (
              <button
                type="button"
                className="hr-btn hr-btn-small"
                onClick={() => onConfigure(configCandidate.jobId)}
              >
                Continue configuration
              </button>
            ) : null}
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
          {/* Failure hierarchy (issue #76): WHAT failed comes first as a
              plain sentence, THEN the concise reason when the backend
              output can be safely summarized. The headline stays generic
              on purpose — a summary invented from output we cannot parse
              would be a worse lie than no summary at all. */}
          {failure !== null ? (
            <div className="hr-failure-summary">
              <span className="hr-failure-summary-head">{failure.summary}</span>
              {failure.reason !== null ? (
                <span className="hr-failure-summary-reason">{failure.reason}</span>
              ) : null}
            </div>
          ) : null}
          {/* Technical details: collapsed by default and visually
              secondary, but nothing inside is trimmed — the exit code,
              stderr, timestamps, raw message and identifiers stay
              reachable verbatim, and the native disclosure needs no
              control (the block stays read-only by construction). */}
          {failure !== null && failure.evidence.length > 0 ? (
            <details className="hr-tech-details">
              <summary className="hr-tech-summary">Technical details</summary>
              <div className="hr-tech-body">
                {failure.evidence.map((item) => (
                  <div className="hr-detail" key={item.label}>
                    <span className="hr-detail-label">{item.label}</span>
                    <span className="hr-detail-value hr-tech-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </details>
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
