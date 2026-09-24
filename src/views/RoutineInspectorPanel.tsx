import { useState, type ReactElement } from 'react';
import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import type { RoutineJob } from '../domain/jobs';
import { jobIdOf, jobPaused } from '../domain/jobs';
import {
  formatDate,
  formatWhen,
  humanScheduleOf,
  lastResultOf,
  lastRunIso,
  nextRunIso,
  rawScheduleOf,
  routineActive,
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
  const id = jobIdOf(job) || fallback;
  const paused = jobPaused(job);
  const terminal = routineTerminal(job);
  const schedule = humanScheduleOf(job) || '—';
  const rawCron = rawScheduleOf(job);
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const showRuns = routineActive(job);
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : null;

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
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -1 }}>
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          Back to list
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
        {/* Title & Identity */}
        <div className="hr-inspector-ident">
          <h3 className="hr-inspector-title">{title}</h3>
          <div className="hr-inspector-id-row">
            <span className="hr-inspector-id-label">ID:</span>
            <code className="hr-inspector-id-code">{id}</code>
            <button
              type="button"
              className="hr-btn-mini"
              onClick={() => copyText(id, setCopiedId)}
              aria-label="Copy routine ID"
            >
              {copiedId ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Section: Cadence & Timing */}
        <section className="hr-inspector-section">
          <h4 className="hr-section-title">Cadence & Timing</h4>
          <div className="hr-kv-grid">
            <span className="hr-kv-label">Schedule</span>
            <span className="hr-kv-value hr-kv-highlight">{schedule}</span>

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
        </section>

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

        {/* Section: Technical Details */}
        <section className="hr-inspector-section">
          <h4 className="hr-section-title">Technical Details</h4>
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

          {payload && Object.keys(payload).length > 0 ? (
            <div className="hr-tech-entry">
              <span className="hr-kv-label">Payload Parameters</span>
              <pre className="hr-code-block">{JSON.stringify(payload, null, 2)}</pre>
            </div>
          ) : null}
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
