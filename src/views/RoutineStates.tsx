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

/**
 * No-rows-in-this-slice state. The copy is overridable because a slice can
 * be empty for genuinely different reasons (issue #80): an empty "Paused"
 * filter and a focus narrowed to nothing by a search say different things,
 * and blaming "this filter" for a focus the user never applied is a small
 * lie on a page whose whole point is honest state.
 */
export function EmptyFilterState({
  title = 'No routines match this filter',
  hint = 'Try a different filter to see more routines.',
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="hr-state">
      <p className="hr-state-title">{title}</p>
      <p className="hr-state-text">{hint}</p>
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
 * Shared id of the needs-attention band, in both of its states (the summary
 * and the focus bar). The two replace each other, so the element that
 * replaces the one the user just pressed is where focus has to land: the
 * pressed control unmounts with its band, and a keyboard user left on
 * nothing has lost their place in the page. Restored on the next tick,
 * because the replacement band does not exist yet when the click runs — the
 * same reason `closeSurface` restores panel focus that way.
 */
export const ATTENTION_BAND_ID = 'hermes-routines-attention';

/**
 * Needs-attention summary (issue #80).
 *
 * Lifecycle (active/paused) and runtime health are different dimensions: a
 * user cannot find a routine that is failing right now by scanning a longer
 * list for a small icon. This names how many routines are in trouble and
 * offers to focus exactly those, so the work is surfaced instead of
 * discovered.
 *
 * Quiet by construction, not by condition: a healthy list renders NOTHING
 * here (null), so there is no empty warning band to scroll past. A paused
 * routine with an old failure is excluded on purpose — nothing will retry it
 * until the user resumes it, and its row still states the failure in words —
 * so the count is the number of routines the user can actually fix now, and
 * `paused` names the excluded ones so the decision is visible on the page.
 *
 * The words carry the state; color and the glyph only reinforce it.
 */
export function NeedsAttentionNotice({
  count,
  paused = 0,
  onFocus,
}: {
  count: number;
  /** Paused routines carrying an old failure, stated so none of it is lost. */
  paused?: number;
  onFocus: () => void;
}) {
  if (count === 0) return null;
  return (
    <div id={ATTENTION_BAND_ID} className="hr-attention" role="status" tabIndex={-1}>
      <svg
        className="hr-attention-glyph"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.5" />
        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
      </svg>
      <span className="hr-attention-text">
        {count === 1 ? '1 routine needs attention' : `${count} routines need attention`}
      </span>
      {paused > 0 ? (
        <span className="hr-attention-note">
          {paused === 1
            ? '1 paused routine also failed before it was paused'
            : `${paused} paused routines also failed before they were paused`}
        </span>
      ) : null}
      <button type="button" className="hr-btn hr-btn-small" onClick={onFocus}>
        Show them
      </button>
    </div>
  );
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
  // Quiet by the attention-budget rule: this names paused rows that can be
  // (re)opened, not a failure. Spacing and typography group the actions;
  // the bordered bands stay reserved for stale/error/attention states.
  return (
    <div className="hr-config-note" role="status">
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
