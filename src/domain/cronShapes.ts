// ── cron action shapes (exactly 5 actions) ──
// list, add, remove, pause, resume. No update, no run: `cron.manage`
// implements neither, and a builder shape for them would ship a button
// that cannot work.
//
// schedule is opaque pass-through from the desktop's perspective — the
// backend owns cron semantics. The edge only trims border whitespace and
// enforces length/printability so malformed input fails fast in the form
// instead of round-tripping to the backend.
//
// This module is the SINGLE source of truth for the shapes: src/plugin.tsx
// re-exports it and the build bundles it into desktop/plugin.js. There is
// no mirrored copy anywhere (the old copy-identity sync is gone).

const MAX_JOB_ID_LENGTH = 128;
const JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MAX_SCHEDULE_LENGTH = 256;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

export interface AddJobInput {
  job_id?: unknown;
  schedule?: unknown;
  payload?: unknown;
}

export interface AddJobShape {
  action: 'add';
  name: string;
  schedule: string;
  payload: Record<string, unknown>;
}

export interface JobRefShape {
  action: 'remove' | 'pause' | 'resume';
  name: string;
}

export interface ListJobsShape {
  action: 'list';
  jobs: unknown[];
}

function assertJobId(jobId: unknown): string {
  if (typeof jobId !== 'string') {
    throw new TypeError('job_id must be a non-empty string');
  }
  const id = jobId.trim();
  if (!id) {
    throw new TypeError('job_id must be a non-empty string');
  }
  if (id.length > MAX_JOB_ID_LENGTH || !JOB_ID_RE.test(id)) {
    throw new TypeError('job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars');
  }
  return id;
}

function assertSchedule(schedule: unknown): string {
  if (typeof schedule !== 'string') {
    throw new TypeError('schedule must be a non-empty string');
  }
  const trimmed = schedule.trim();
  if (!trimmed) {
    throw new TypeError('schedule must be a non-empty string');
  }
  if (trimmed.length > MAX_SCHEDULE_LENGTH) {
    throw new TypeError('schedule must be at most 256 chars');
  }
  if (CONTROL_CHARS_RE.test(trimmed)) {
    throw new TypeError('schedule must not contain control characters');
  }
  return trimmed;
}

function assertPayload(payload: unknown): Record<string, unknown> {
  if (payload === undefined) return {};
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be a plain object');
  }
  return payload as Record<string, unknown>;
}

// Deep-clone so queued shapes cannot be mutated by callers. Values
// `structuredClone` rejects (functions, symbols) surface as a domain
// TypeError carrying the original DOMException as `cause`, never the raw
// DataCloneError.
function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (err) {
    if (err instanceof Error && err.name === 'DataCloneError') {
      throw new TypeError(`uncloneable value: ${err.message || 'DataCloneError'}`, { cause: err });
    }
    throw err;
  }
}

export function listJobs(jobs: unknown = []): ListJobsShape {
  const items = Array.isArray(jobs) ? jobs.map((job) => cloneValue(job)) : [];
  return { action: 'list', jobs: items };
}

export function addJob(input: AddJobInput = {}): AddJobShape {
  const name = assertJobId(input.job_id);
  const schedule = assertSchedule(input.schedule);
  const payload = cloneValue(assertPayload(input.payload));
  return { action: 'add', name, schedule, payload };
}

export function removeJob(jobId: unknown): JobRefShape {
  return { action: 'remove', name: assertJobId(jobId) };
}

export function pauseJob(jobId: unknown): JobRefShape {
  return { action: 'pause', name: assertJobId(jobId) };
}

export function resumeJob(jobId: unknown): JobRefShape {
  return { action: 'resume', name: assertJobId(jobId) };
}
