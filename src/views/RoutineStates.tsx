// Product states for the Routines page: honest loading, empty, error and
// fail-closed unavailable — never raw text. Mirrors the Crew distinction
// between loading / empty / compact error / stale banner.

export function LoadingState({ text }: { text: string }) {
  return (
    <div className="hr-state" role="status" aria-live="polite" aria-busy="true">
      <span className="hr-spinner" aria-hidden="true" />
      <p className="hr-state-text">{text}</p>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="hr-state">
      <p className="hr-state-title">No routines yet</p>
      <p className="hr-state-text">
        Scheduled jobs for this profile will appear here.
      </p>
    </div>
  );
}

export function EmptyFilterState() {
  return (
    <div className="hr-state">
      <p className="hr-state-title">No routines match this filter</p>
      <p className="hr-state-text">Try a different filter to see more routines.</p>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="hr-error" role="alert">
      <strong>{title}</strong>
      <p className="hr-row-meta">{message}</p>
      <button type="button" className="hr-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function UnavailableState({
  profile,
  onRetry,
}: {
  profile: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="hr-error" role="alert">
      <strong>Routines unavailable for this profile.</strong>
      <p className="hr-row-meta">
        {profile
          ? `The Desktop profile “${profile}” has no routines route right now. Connect the profile, then retry.`
          : 'The active Desktop profile has no routines route right now. Select a profile, then retry.'}
      </p>
      <button type="button" className="hr-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="hr-stale" role="status">
      <span>Showing last loaded jobs.</span>
      <button type="button" className="hr-btn hr-btn-small" onClick={onRetry}>
        Refresh
      </button>
    </div>
  );
}

/** One paused-never-ran routine the user may (re)open for configuration. */
export interface GuidedReopenTarget {
  jobId: string;
  title: string;
  /** True when this is the session the user just closed (in-session resume). */
  resumed: boolean;
}

/**
 * Incomplete-configuration notice (issue #65 Part B, scenarios 1–2): the
 * list names paused routines whose configuration is incomplete and offers
 * to (re)open each one. Opening only rebuilds an addressable handle and
 * re-reads truth — it never resumes, applies, or recreates anything.
 */
export function NeedsConfigurationNotice({
  targets,
  onConfigure,
}: {
  targets: GuidedReopenTarget[];
  onConfigure: (jobId: string) => void;
}) {
  if (targets.length === 0) return null;
  return (
    <div className="hr-stale" role="status">
      <span>
        {targets.length === 1
          ? 'One paused routine needs configuration.'
          : `${targets.length} paused routines need configuration.`}
      </span>
      {targets.map((target) => (
        <button
          key={target.jobId}
          type="button"
          className="hr-btn hr-btn-small"
          onClick={() => onConfigure(target.jobId)}
        >
          {target.resumed ? `Resume configuration of ${target.title}` : `Configure ${target.title}`}
        </button>
      ))}
    </div>
  );
}
