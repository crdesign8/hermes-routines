// Job-row helpers. The backend owns the row shape (cron.manage), so these
// functions only rely on the identity/presence fields below and treat
// everything else as unknown data that passes through untouched.

/** One opaque backend row, as far as this plugin reads it. */
export interface RoutineJob {
  name?: unknown;
  job_id?: unknown;
  schedule?: unknown;
  disabled?: unknown;
  enabled?: unknown;
  [field: string]: unknown;
}

/** Which slice of the list the view is showing. */
export type RoutineFilter = 'all' | 'active' | 'paused';

/**
 * The list endpoint may answer with a jobs envelope or a bare array;
 * anything else normalizes to an empty list (an honest empty state, never
 * a render crash on garbage).
 */
export function normalizeJobs(payload: unknown): RoutineJob[] {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === 'object') {
    const jobs = (payload as { jobs?: unknown }).jobs;
    if (Array.isArray(jobs)) return jobs;
  }
  return [];
}

/** Row identity: `name`, else `job_id`, else '' (callers synthesize a label). */
export function jobIdOf(job: unknown): string {
  const row = job as Partial<RoutineJob> | null | undefined;
  if (row && typeof row.name === 'string' && row.name) return row.name;
  if (row && typeof row.job_id === 'string' && row.job_id) return row.job_id;
  return '';
}

/** A row is paused when the backend flags it disabled or un-enabled. */
export function jobPaused(job: RoutineJob | null | undefined): boolean {
  if (job?.disabled === true) return true;
  if (job?.enabled === false) return true;
  return false;
}

/** Return a copy of the row with the paused flag flipped (never mutates). */
export function withPausedFlag(job: RoutineJob, paused: boolean): RoutineJob {
  const next: RoutineJob = { ...job };
  if (paused) {
    next.disabled = true;
    if ('enabled' in next) next.enabled = false;
  } else {
    next.disabled = false;
    if ('enabled' in next) next.enabled = true;
  }
  return next;
}

/** Apply the active filter without mutating the source array. */
export function visibleJobs(jobs: unknown, filter: RoutineFilter): RoutineJob[] {
  const list = Array.isArray(jobs) ? (jobs as RoutineJob[]) : [];
  if (filter === 'active') return list.filter((job) => !jobPaused(job));
  if (filter === 'paused') return list.filter((job) => jobPaused(job));
  return list.slice();
}
