// ── cron action shapes (phase 3: exactly 5 actions) ──
// list, add, remove, pause, resume. No update, no run.
// schedule is opaque pass-through from the desktop's perspective, but the
// desktop still trims border whitespace and enforces length/printability at
// the edge so malformed input fails fast instead of in the backend.

const MAX_JOB_ID_LENGTH = 128;
const JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MAX_SCHEDULE_LENGTH = 256;

function assertJobId(job_id) {
  if (typeof job_id !== 'string') {
    throw new TypeError('job_id must be a non-empty string');
  }
  const id = job_id.trim();
  if (!id) {
    throw new TypeError('job_id must be a non-empty string');
  }
  if (id.length > MAX_JOB_ID_LENGTH || !JOB_ID_RE.test(id)) {
    throw new TypeError('job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars');
  }
  return id;
}

function assertSchedule(schedule) {
  if (typeof schedule !== 'string') {
    throw new TypeError('schedule must be a non-empty string');
  }
  const s = schedule.trim();
  if (!s) {
    throw new TypeError('schedule must be a non-empty string');
  }
  if (s.length > MAX_SCHEDULE_LENGTH) {
    throw new TypeError('schedule must be at most 256 chars');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(s)) {
    throw new TypeError('schedule must not contain control characters');
  }
  return s;
}

function assertPayload(payload) {
  if (payload === undefined) return {};
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be a plain object');
  }
  return payload;
}

function cloneValue(value) {
  return structuredClone(value);
}

export function listJobs(jobs = []) {
  const items = Array.isArray(jobs) ? jobs.map((j) => cloneValue(j)) : [];
  return { action: 'list', jobs: items };
}

export function addJob({ job_id, schedule, payload = {} } = {}) {
  const id = assertJobId(job_id);
  const normalizedSchedule = assertSchedule(schedule);
  const cleanPayload = assertPayload(payload);
  return {
    action: 'add',
    name: id,
    schedule: normalizedSchedule,
    payload: cloneValue(cleanPayload),
  };
}

export function removeJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'remove', name: id };
}

export function pauseJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'pause', name: id };
}

export function resumeJob(job_id) {
  const id = assertJobId(job_id);
  return { action: 'resume', name: id };
}

// ── profile routing (mirrors cross-connection routing semantics) ──
// Pure helpers with zero imports. A route descriptor carries
// connectionId, profile, and targetProfile. Rows without scoping fall
// back to the active gateway door.
// NOTE (copy-identity): the five functions below must stay byte-identical
// with desktop/routines.js. Run `node scripts/sync-shapes.mjs --check`
// in CI; use `--write` to propagate this file (canonical) to routines.js.

export function routeKey(route) {
  if (!route || typeof route.connectionId !== 'string' || typeof route.profile !== 'string') {
    throw new TypeError('invalid route: connectionId and profile must be strings');
  }
  const connectionId = route.connectionId.trim();
  const profile = route.profile.trim();
  if (!connectionId || !profile) {
    throw new TypeError('invalid route: connectionId and profile must be non-empty');
  }
  return `${connectionId}::${profile}`;
}

export function resolveProfileRoute(entry) {
  if (!entry?.sourceScoped && !entry?.remoteSource) {
    return { status: 'not_scoped', route: null };
  }
  const candidate = entry.route || {
    connectionId: entry.connectionId,
    mode: entry.connectionKind === 'local' ? 'local' : 'remote',
    profile: entry.name,
    targetProfile: entry.targetProfile || entry.name,
  };
  if (candidate.mode !== undefined && candidate.mode !== 'local' && candidate.mode !== 'remote') {
    throw new TypeError(`invalid route mode: ${String(candidate.mode)}`);
  }
  const connectionId = String(candidate?.connectionId || '').trim();
  const profile = String(candidate?.profile || entry?.name || '').trim() || 'default';
  const targetProfile = String(candidate?.targetProfile || profile).trim() || profile;
  if (!connectionId) {
    return { status: 'owner_removed', route: null, profile };
  }
  const mode = candidate.mode === 'local' || connectionId === 'local' ? 'local' : 'remote';
  return {
    status: 'resolved',
    route: Object.freeze({ connectionId, mode, profile, targetProfile }),
  };
}

export function profileRoute(entry) {
  const resolved = resolveProfileRoute(entry);
  if (resolved.status === 'owner_removed') {
    throw new Error(`Profile ${resolved.profile} has no connection owner`);
  }
  return resolved.route;
}

export function backendTargetProfile(route, fallbackProfile = 'default') {
  if (!route) {
    return fallbackProfile;
  }
  return route.targetProfile || route.profile;
}

export function scopedCronParams(route, params = {}) {
  if (!route) {
    return params;
  }
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    return params;
  }
  return { ...params, profile: target };
}

export function assertTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined) return;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative finite number');
  }
}

export async function requestCronForRoute(host, target, method, params = {}, timeoutMs) {
  assertTimeoutMs(timeoutMs);
  const route = target && target.connectionId ? target : profileRoute(target);
  if (route) {
    if (typeof host?.requestProfile !== 'function') {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params);
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped)
      : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (typeof host?.request !== 'function') {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}
