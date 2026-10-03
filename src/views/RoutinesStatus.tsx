import { useEffect, useState, type ReactElement } from 'react';
import { host, useValue } from '@hermes/plugin-sdk';
import { ROUTE_PATH, STATUS_POLL_MS } from '../constants';
import { attentionCount } from '../domain/attention';
import { normalizeJobs } from '../domain/jobs';
import { resolveActiveRoute } from '../domain/routing';
import { listProfileRoutes, listRoutines } from '../gateway/cronGateway';
import { requestAttentionFocus } from '../state/shellRequests';

// Conditional status-bar contribution for routine health.
//
// Healthy silence is the point: with nothing actionable the component
// returns null, so the bar carries no permanent "N routines" noise. When one
// or more routines need attention it renders a compact count affordance
// that navigates to the page and parks an attention-focus request for it.
//
// The count derives from the shared domain verdict (`attentionCount`, which
// reads `attentionOf` per row) — the same verdict the page summary and the
// focus slice read — so the bar, the summary and the focused list can never
// disagree about which routines are in trouble. It fetches its own
// inventory through the same fail-closed gateway doors as the page and never
// reads rendered page state, so it stays correct while the page is closed.
//
// Lifecycle: one poller per mount (immediate read plus `STATUS_POLL_MS`
// interval, re-read on active-profile switch). The effect cleanup cancels
// the in-flight read and clears the interval, so disabling or reloading the
// plugin removes the contribution and its timer together.

export interface RoutinesStatusItemViewProps {
  /** Actionable failure count, or null while unknown. Null and 0 render nothing. */
  count: number | null;
  /** Called when the user activates the status affordance. */
  onOpen: () => void;
}

/**
 * Pure presentation of the status state. Returns null for null/0 (healthy
 * silence) and a compact activating button otherwise. Split out so tests can
 * drive the healthy/failure contract without gateway or timers.
 */
export function RoutinesStatusItemView({ count, onOpen }: RoutinesStatusItemViewProps): ReactElement | null {
  if (count === null || count <= 0) return null;
  const label =
    count === 1 ? '1 routine needs attention — open Routines' : `${count} routines need attention — open Routines`;
  return (
    <button
      type="button"
      className="hr-status"
      onClick={onOpen}
      aria-label={label}
      title="Open Routines needing attention"
    >
      <span aria-hidden="true">!</span>
      <span>{count}</span>
    </button>
  );
}

function openAttention(): void {
  requestAttentionFocus();
  if (typeof host.navigate === 'function') {
    host.navigate(ROUTE_PATH);
  }
}

export function RoutinesStatusItem(): ReactElement | null {
  const activeProfile = useValue(host.state.profile);
  const activeConnectionId = useValue(host.state.connectionId);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async (): Promise<void> => {
      try {
        const routes = await listProfileRoutes();
        if (cancelled) return;
        const route = resolveActiveRoute(routes, activeProfile, activeConnectionId);
        if (route === null) {
          if (!cancelled) setCount(null);
          return;
        }
        const payload = await listRoutines(route);
        if (cancelled) return;
        setCount(attentionCount(normalizeJobs(payload)));
      } catch {
        if (!cancelled) setCount(null);
      }
    };
    void read();
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      void read();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProfile, activeConnectionId]);

  return <RoutinesStatusItemView count={count} onOpen={openAttention} />;
}
