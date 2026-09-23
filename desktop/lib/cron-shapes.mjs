export function listJobs(jobs = []) {
  const items = Array.isArray(jobs) ? [...jobs] : [];
  return { action: 'list', jobs: items };
}

export function addJob({ job_id, schedule, payload = {} } = {}) {
  if (typeof job_id !== 'string' || job_id.length === 0) {
    throw new TypeError('job_id must be a non-empty string');
  }
  if (typeof schedule !== 'string' || schedule.length === 0) {
    throw new TypeError('schedule must be a non-empty string');
  }
  return { action: 'add', name: job_id, schedule, payload };
}

export function removeJob(job_id) {
  if (typeof job_id !== 'string' || job_id.length === 0) {
    throw new TypeError('job_id must be a non-empty string');
  }
  return { action: 'remove', name: job_id };
}

export function pauseJob(job_id) {
  if (typeof job_id !== 'string' || job_id.length === 0) {
    throw new TypeError('job_id must be a non-empty string');
  }
  return { action: 'pause', name: job_id };
}

export function resumeJob(job_id) {
  if (typeof job_id !== 'string' || job_id.length === 0) {
    throw new TypeError('job_id must be a non-empty string');
  }
  return { action: 'resume', name: job_id };
}

// ── profile routing (mirrors cross-connection routing semantics) ──
// Pure helpers with zero imports. A route descriptor carries
// connectionId, profile, and targetProfile. Rows without scoping fall
// back to the active gateway door.

export function routeKey(route) {
  return `${route.connectionId}::${route.profile}`;
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
  const logical = route.profile;
  const target = backendTargetProfile(route, logical);
  if (!Object.prototype.hasOwnProperty.call(params, 'profile')) {
    return params;
  }
  return { ...params, profile: target };
}

export async function requestCronForRoute(host, target, method, params = {}, timeoutMs) {
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
  return timeoutMs === undefined
    ? host.request(method, params)
    : host.request(method, params, timeoutMs);
}
