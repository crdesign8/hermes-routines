import type { ReactElement } from 'react';
import { BROADCAST_REVIEW_WARNING, isBroadcastDelivery } from '../domain/destinations';
import type { ProposalReview } from '../domain/guidedWorkflow';

// Current-vs-proposed review of one validated proposal (issue #64).
//
// This is the review BOUNDARY: nothing rendered here mutates anything,
// and the three actions below are the only way out of it. The table is
// built from `buildProposalReview`, which reads authoritative truth for
// the "current" column and the validated patch for the "proposed" one —
// so what the user compares is what the backend holds versus what a
// confirmed apply would persist, not two opinions.
//
// Deliberate choices:
//   - a real <table> with scoped headers, so the comparison is
//     navigable and readable by assistive tech rather than a stack of
//     divs that happen to line up;
//   - a change is marked with the word "changed", never with color
//     alone;
//   - the agent's `note` renders in its own block, visually and
//     semantically separate from the authoritative values, so prose can
//     never be mistaken for configuration;
//   - fields no proposal can write (the model override) are shown as
//     current values instead of being hidden — a review that quietly
//     drops a column is not a review; `delivery` IS writable (issue
//     #65: the gateway RPC forwards `deliver` on create), so its row
//     reads as editable exactly like name/schedule/prompt;
//   - long instructions scroll inside their cell instead of being
//     truncated: the full text stays reachable and honest.

export interface GuidedProposalReviewProps {
  review: ProposalReview;
  /** An apply/activation is in flight: every control is inert meanwhile. */
  busy: boolean;
  /** true = apply and activate; false = apply and stay paused. */
  onConfirm: (desiredActive: boolean) => void;
  /** Abandon the review and return to clarification. No mutation. */
  onContinueConfiguring: () => void;
}

function cellText(value: string): string {
  return value.trim() ? value : '—';
}

export function GuidedProposalReview({
  review,
  busy,
  onConfirm,
  onContinueConfiguring,
}: GuidedProposalReviewProps): ReactElement {
  return (
    <div className="hr-review">
      <div className="hr-create-section-label">REVIEW THE PROPOSAL</div>

      <table className="hr-review-table">
        <caption className="hr-sr-only">
          Current configuration compared with the proposed configuration for this routine.
        </caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Current</th>
            <th scope="col">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {review.rows.map((row) => (
            <tr key={row.field} className={row.changed ? 'hr-review-row-changed' : undefined}>
              <th scope="row">
                {row.label}
                {row.changed ? <span className="hr-review-flag">changed</span> : null}
                {/* Patchability is read off the row, never hardcoded:
                    a patchable change reads as editable, a field no
                    proposal can write (the model) reads as read-only —
                    the one row in this table an apply cannot touch
                    (issue #74). */}
                {row.patchable ? (
                  row.changed ? (
                    <span className="hr-review-editable">editable</span>
                  ) : null
                ) : (
                  <span className="hr-review-readonly">not editable</span>
                )}
              </th>
              <td className="hr-review-cell">
                <span className="hr-review-cell-text">{cellText(row.current)}</span>
              </td>
              <td className="hr-review-cell hr-review-proposed">
                <span className="hr-review-cell-text">
                  {row.changed ? cellText(row.proposed) : cellText(row.current)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {review.note ? (
        <div className="hr-review-note">
          <span className="hr-review-note-label">From Hermes (explanation, not configuration)</span>
          <p className="hr-review-note-text">{review.note}</p>
        </div>
      ) : null}

      {isBroadcastDelivery(review.proposed.delivery) ? (
        <div className="hr-create-broadcast-card" role="status">
          <p className="hr-create-broadcast-note">{BROADCAST_REVIEW_WARNING}</p>
        </div>
      ) : null}

      {review.stale ? (
        <div className="hr-create-error" role="alert">
          The routine changed after this proposal was built. Applying it will be refused — ask Hermes
          for a new proposal before confirming.
        </div>
      ) : null}

      <div className="hr-review-outcomes">
        <div className="hr-detail">
          <span className="hr-detail-label">Apply and activate</span>
          <span className="hr-detail-value">This routine ends active.</span>
        </div>
        <div className="hr-detail">
          <span className="hr-detail-label">Keep paused</span>
          <span className="hr-detail-value">This routine ends configured and paused.</span>
        </div>
      </div>

      <div className="hr-create-actions">
        <button
          type="button"
          className="hr-btn hr-btn-back-routines"
          disabled={busy}
          onClick={onContinueConfiguring}
        >
          Continue configuring
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-back-routines"
          disabled={busy}
          onClick={() => onConfirm(false)}
        >
          Keep paused
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-create-submit"
          disabled={busy}
          onClick={() => onConfirm(true)}
        >
          Apply and activate
        </button>
      </div>
    </div>
  );
}
