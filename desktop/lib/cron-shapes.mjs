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
  try {
    return structuredClone(value);
  } catch (err) {
    if (err?.name === 'DataCloneError') {
      throw new TypeError(`uncloneable value: ${err?.message || 'DataCloneError'}`, { cause: err });
    }
    throw err;
  }
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
// connectionId, profile, and targetProfile.
//
// Fail-closed: a caller that looks profile-scoped must never slide
// silently into the active gateway door. `requestCronForRoute` with no
// resolved route rejects unless the caller passes the explicit opt-in
// `{ allowActiveDoor: true }`; `scopedCronParams` with a route but no
// `profile` key in params throws unless the caller passes
// `{ allowUnscoped: true }`.
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

export function scopedCronParams(route, params = {}, options = {}) {
  if (!route) {
    return params;
  }
  assertRoutingOptions(options);
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('scopedCronParams params must be a plain object');
  }
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    if (options?.allowUnscoped === true) {
      return params;
    }
    throw new TypeError(
      `scopedCronParams requires params.profile for ${route.connectionId}::${route.profile} (pass { allowUnscoped: true } to send unscoped intentionally)`,
    );
  }
  return { ...params, profile: target };
}

function assertRoutingOptions(options) {
  if (options === undefined) return;
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }
  if (options.allowActiveDoor !== undefined && typeof options.allowActiveDoor !== 'boolean') {
    throw new TypeError('options.allowActiveDoor must be a boolean');
  }
  if (options.allowUnscoped !== undefined && typeof options.allowUnscoped !== 'boolean') {
    throw new TypeError('options.allowUnscoped must be a boolean');
  }
}

export function assertTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined) return;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative finite number');
  }
}

// Fail-closed dispatch. `target` is either a resolved route descriptor
// (has connectionId) or a scoping entry resolved via profileRoute().
// When no route resolves, the active gateway door (`host.request`) opens
// ONLY with the explicit opt-in `{ allowActiveDoor: true }` — a bare
// null/unscoped target rejects so a misdirected profile operation can
// never land silently on the active gateway. Profile-scoped params flow
// through scopedCronParams, so a routed call without params.profile
// throws unless `{ allowUnscoped: true }` is passed alongside.
export async function requestCronForRoute(host, target, method, params = {}, timeoutMs, options = {}) {
  assertTimeoutMs(timeoutMs);
  assertRoutingOptions(options);
  const route = target && target.connectionId ? target : profileRoute(target);
  if (route) {
    if (typeof host?.requestProfile !== 'function') {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params, { allowUnscoped: options?.allowUnscoped });
    return timeoutMs === undefined
      ? host.requestProfile(route, method, scoped)
      : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (options?.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`,
    );
  }
  if (typeof host?.request !== 'function') {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}
