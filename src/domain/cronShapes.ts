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
// add carries the upstream `cron.manage` create contract: the user supplies
// the human-readable `name`, plus `schedule` and top-level `prompt` (the run
// instruction). Hermes mints the technical `job_id` itself, so a create
// never carries one. The backend rejects creates without a prompt, so the
// edge requires a non-empty prompt instead of round-tripping an error.
// Extra keys are never sent: the gateway only forwards known fields.
//
// Identity rule: `job_id` is the ONLY mutation identity (pause/resume/
// remove). `name` is presentation text — never validated as a technical
// identifier and never used to address a job.
//
// This module is the SINGLE source of truth for the shapes: src/plugin.tsx
// re-exports it and the build bundles it into desktop/plugin.js. There is
// no mirrored copy anywhere (the old copy-identity sync is gone).

const MAX_JOB_ID_LENGTH = 128;
const JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MAX_NAME_LENGTH = 128;
const MAX_SCHEDULE_LENGTH = 256;
const MAX_PROMPT_LENGTH = 20000;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

export interface AddJobInput {
  name?: unknown;
  schedule?: unknown;
  prompt?: unknown;
  /**
   * Optional delivery target (domain name). Validated and canonicalized by
   * the shared advanced-settings normalizer in gateway/cronParams.ts and
   * sent on the wire as `deliver`; absent means the key is omitted.
   */
  delivery?: unknown;
}

export interface AddJobShape {
  action: 'add';
  name: string;
  schedule: string;
  prompt: string;
}

export interface JobRefShape {
  action: 'remove' | 'pause' | 'resume';
  name: string;
}

export interface ListJobsShape {
  action: 'list';
  jobs: unknown[];
}

/**
 * True when `value` is usable as the backend job_id. The single definition
 * of the id charset: identity readers (domain/jobs.ts) and the validators
 * below share it, so no row can look addressable to one and not the other.
 */
export function isValidJobId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_JOB_ID_LENGTH &&
    JOB_ID_RE.test(value)
  );
}

function assertJobId(jobId: unknown): string {
  if (typeof jobId !== 'string') {
    throw new TypeError('job_id must be a non-empty string');
  }
  const id = jobId.trim();
  if (!id) {
    throw new TypeError('job_id must be a non-empty string');
  }
  if (!isValidJobId(id)) {
    throw new TypeError('job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars');
  }
  return id;
}

/**
 * Human-readable routine name: trimmed text, no control characters. Spaces,
 * accents and Hermes `[bot:...]` prefixes are all legal — this is a title,
 * not a technical identifier (the backend mints the `job_id`).
 */
function assertName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new TypeError('name must be a non-empty string');
  }
  const text = name.trim();
  if (!text) {
    throw new TypeError('name must be a non-empty string');
  }
  if (text.length > MAX_NAME_LENGTH) {
    throw new TypeError('name must be at most 128 chars');
  }
  if (CONTROL_CHARS_RE.test(text)) {
    throw new TypeError('name must not contain control characters');
  }
  return text;
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

function assertPrompt(prompt: unknown): string {
  if (typeof prompt !== 'string') {
    throw new TypeError('prompt must be a non-empty string');
  }
  const text = prompt.trim();
  if (!text) {
    throw new TypeError('prompt must be a non-empty string');
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    throw new TypeError('prompt must be at most 20000 chars');
  }
  return text;
}

// Deep-clone so queued list rows cannot be mutated by callers. Values
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
  // Create carries the human-readable name; Hermes generates the job_id.
  const name = assertName(input.name);
  const schedule = assertSchedule(input.schedule);
  const prompt = assertPrompt(input.prompt);
  return { action: 'add', name, schedule, prompt };
}

/** Job reference for remove/pause/resume: the canonical `job_id`. */
export function removeJob(jobId: unknown): JobRefShape {
  return { action: 'remove', name: assertJobId(jobId) };
}

export function pauseJob(jobId: unknown): JobRefShape {
  return { action: 'pause', name: assertJobId(jobId) };
}

export function resumeJob(jobId: unknown): JobRefShape {
  return { action: 'resume', name: assertJobId(jobId) };
}
