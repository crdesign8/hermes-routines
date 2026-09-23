import type { PluginProfileRoute } from '@hermes/plugin-sdk';
import { addJob, pauseJob, removeJob, resumeJob, type AddJobInput } from '../domain/cronShapes';
import { backendTargetProfile } from '../domain/routing';

// cron.manage parameter builders. Every builder is fail-closed: it needs a
// resolved route (connectionId) plus a backend profile, and it stamps that
// profile onto the payload so a scoped operation can never leave the
// plugin unscoped by accident.

/** Backend profile for a mutation, or a domain error when the route can't scope one. */
function targetProfileOf(route: PluginProfileRoute | null | undefined): string {
  if (!route || typeof route.connectionId !== 'string' || !route.connectionId) {
    throw new Error('routine mutation requires a resolved profile route');
  }
  const target = backendTargetProfile(route, '');
  if (!target) {
    throw new Error('routine mutation requires a route with profile/targetProfile');
  }
  return target;
}

export function buildListParams(route: PluginProfileRoute | null | undefined): Record<string, unknown> {
  return { action: 'list', include_disabled: true, profile: targetProfileOf(route) };
}

export function buildAddParams(
  route: PluginProfileRoute | null | undefined,
  input: AddJobInput | null | undefined,
): Record<string, unknown> {
  const target = targetProfileOf(route);
  const shaped = addJob(input || {});
  return { ...shaped, profile: target };
}

export function buildPauseParams(
  route: PluginProfileRoute | null | undefined,
  jobId: unknown,
): Record<string, unknown> {
  return { ...pauseJob(jobId), profile: targetProfileOf(route) };
}

export function buildResumeParams(
  route: PluginProfileRoute | null | undefined,
  jobId: unknown,
): Record<string, unknown> {
  return { ...resumeJob(jobId), profile: targetProfileOf(route) };
}

export function buildRemoveParams(
  route: PluginProfileRoute | null | undefined,
  jobId: unknown,
): Record<string, unknown> {
  return { ...removeJob(jobId), profile: targetProfileOf(route) };
}

/**
 * Optimism gate: only pause and resume may paint ahead of the host answer.
 * They flip one reversible, idempotent flag with snapshot rollback; create
 * (backend owns normalization — an unconfirmed row could duplicate on
 * retry) and remove (destroys data) wait for confirmation.
 */
export function isSafeOptimistic(action: unknown): boolean {
  return action === 'pause' || action === 'resume';
}
