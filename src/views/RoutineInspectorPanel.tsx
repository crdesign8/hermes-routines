import { useState, type ReactElement } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import type { RoutineJob } from '../domain/jobs';
import { jobPaused } from '../domain/jobs';
import {
  formatDate,
  formatWhen,
  humanScheduleOf,
  lastResultOf,
  lastRunIso,
  nextRunIso,
  rawScheduleOf,
  routineActive,
  routinePromptOf,
  routineStableIdOf,
  routineTerminal,
  routineTitle,
} from '../domain/present';
import { RoutineStatus } from './RoutineStatus';

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
  activeRoute,
  activeProfile,
  busy,
  disabled,
  onClose,
  onPause,
  onResume,
}: RoutineInspectorPanelProps): ReactElement {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCron, setCopiedCron] = useState(false);

  const title = routineTitle(job, fallback);
  const id = routineStableIdOf(job, fallback);
  const paused = jobPaused(job);
  const terminal = routineTerminal(job);
  const schedule = humanScheduleOf(job) || '—';
  const rawCron = rawScheduleOf(job);
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const showRuns = routineActive(job);

  function copyText(text: string, setCopied: (v: boolean) => void): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  }

  return (
    <aside className="hr-inspector" aria-label={`Details for ${title}`}>
      <header className="hr-inspector-header">
        <button
          type="button"
          className="hr-btn-action hr-btn-back"
          onClick={onClose}
          aria-label="Back to list"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          <span>Back to list</span>
        </button>
        <div className="hr-inspector-header-badges">
          {activeRoute?.mode ? (
            <span className="hr-badge-subtle">
              {activeRoute.mode === 'remote' ? 'VPS' : 'Local'}
            </span>
          ) : null}
          <RoutineStatus job={job} />
        </div>
      </header>

      <div className="hr-inspector-body">
        {/* Read-only mirror of the composer: the same sections and classes
            as RoutineComposerPanel with every control disabled, populated
            from the stored row. EDIT SEAM — when the backend exposes an
            update action, this panel gains editable/onSave props and these
            fields flip to enabled; the layout already matches the form. */}
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

        {/* WHEN TO RUN (disabled mirror: sentence + stored expression) */}
        <div className="hr-create-when-section">
          <div className="hr-create-section-label">WHEN TO RUN</div>
          <div className="hr-create-preview-sentence">{schedule}</div>
          {rawCron ? (
            <div className="hr-tech-entry">
              <div className="hr-tech-entry-head">
                <span className="hr-kv-label">Cron Expression</span>
                <button
                  type="button"
                  className="hr-btn-mini"
                  onClick={() => copyText(rawCron, setCopiedCron)}
                  aria-label="Copy cron expression"
                >
                  {copiedCron ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="hr-code-block">{rawCron}</code>
            </div>
          ) : null}
          <div className="hr-kv-grid">
            <span className="hr-kv-label">Routine ID</span>
            <span className="hr-kv-value hr-code-inline">
              {id}{' '}
              <button
                type="button"
                className="hr-btn-mini"
                onClick={() => copyText(id, setCopiedId)}
                aria-label="Copy routine ID"
              >
                {copiedId ? 'Copied' : 'Copy'}
              </button>
            </span>

            {showRuns && nextIso !== null && formatWhen(nextIso) !== null ? (
              <>
                <span className="hr-kv-label">Next Run</span>
                <span className="hr-kv-value hr-next">
                  {formatWhen(nextIso)}
                  {formatDate(nextIso) ? <span className="hr-date"> ({formatDate(nextIso)})</span> : null}
                </span>
              </>
            ) : null}

            {showRuns && lastIso !== null && formatWhen(lastIso) !== null ? (
              <>
                <span className="hr-kv-label">Last Run</span>
                <span className="hr-kv-value">
                  {formatWhen(lastIso)}
                  {formatDate(lastIso) ? <span className="hr-date"> ({formatDate(lastIso)})</span> : null}
                </span>
              </>
            ) : null}

            <span className="hr-kv-label">Last Result</span>
            <span className={`hr-kv-value hr-result hr-result-${result.kind}`}>
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

        {/* Section: Route & Scope */}
        <section className="hr-inspector-section">
          <h4 className="hr-section-title">Route & Target</h4>
          <div className="hr-kv-grid">
            <span className="hr-kv-label">Profile</span>
            <span className="hr-kv-value">{activeProfile || '—'}</span>

            {activeRoute ? (
              <>
                <span className="hr-kv-label">Connection</span>
                <span className="hr-kv-value hr-code-inline">{activeRoute.connectionId} ({activeRoute.mode})</span>

                <span className="hr-kv-label">Target</span>
                <span className="hr-kv-value hr-code-inline">{activeRoute.targetProfile}</span>
              </>
            ) : null}
          </div>
        </section>

        {/* Section: Actions */}
        {!terminal ? (
          <section className="hr-inspector-section hr-inspector-actions-section">
            <h4 className="hr-section-title">Actions</h4>
            <div className="hr-inspector-actions-bar">
              {paused ? (
                <button
                  type="button"
                  className="hr-btn hr-btn-resume"
                  disabled={disabled || busy}
                  onClick={onResume}
                  aria-label={`Resume ${title}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6 }}>
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {busy ? 'Resuming…' : 'Resume Routine'}
                </button>
              ) : (
                <button
                  type="button"
                  className="hr-btn hr-btn-pause"
                  disabled={disabled || busy}
                  onClick={onPause}
                  aria-label={`Pause ${title}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6 }}>
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                  {busy ? 'Pausing…' : 'Pause Routine'}
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
