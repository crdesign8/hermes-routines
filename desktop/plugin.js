// AUTO-GENERATED FILE - DO NOT EDIT.
// hermes-routines v0.1.0 | source of truth: src/**.ts(x)
// Regenerate with: npm run build   |   Verify freshness: npm run check-generated

// src/plugin.tsx
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";

// src/constants.ts
var PLUGIN_ID = "hermes-routines";
var PLUGIN_NAME = "Routines";
var ROUTE_ID = "routines";
var ROUTE_PATH = "/routines";
var SIDEBAR_ID = "sidebar-nav";
var SIDEBAR_ORDER = 50;
var SIDEBAR_LABEL = "Routines";
var SIDEBAR_CODICON = "history";

// src/views/RoutinesPage.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState2 } from "react";
import { host as host2, useValue } from "@hermes/plugin-sdk";

// src/domain/routing.ts
function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label);
  }
  return value;
}
function routeKey(route) {
  const candidate = route;
  if (!candidate || typeof candidate.connectionId !== "string" || typeof candidate.profile !== "string") {
    throw new TypeError("invalid route: connectionId and profile must be strings");
  }
  const connectionId = candidate.connectionId.trim();
  const profile = candidate.profile.trim();
  if (!connectionId || !profile) {
    throw new TypeError("invalid route: connectionId and profile must be non-empty");
  }
  return `${connectionId}::${profile}`;
}
function resolveProfileRoute(entry) {
  const source = entry ?? {};
  if (!source.sourceScoped && !source.remoteSource) {
    return { status: "not_scoped", route: null };
  }
  const candidate = source.route ?? {
    connectionId: source.connectionId,
    mode: source.connectionKind === "local" ? "local" : "remote",
    profile: source.name,
    targetProfile: source.targetProfile || source.name
  };
  if (candidate.mode !== void 0 && candidate.mode !== "local" && candidate.mode !== "remote") {
    throw new TypeError(`invalid route mode: ${String(candidate.mode)}`);
  }
  const connectionId = String(candidate.connectionId || "").trim();
  const profile = String(candidate.profile || source.name || "").trim() || "default";
  const targetProfile = String(candidate.targetProfile || profile).trim() || profile;
  if (!connectionId) {
    return { status: "owner_removed", route: null, profile };
  }
  const mode = candidate.mode === "local" || connectionId === "local" ? "local" : "remote";
  return {
    status: "resolved",
    route: Object.freeze({ connectionId, mode, profile, targetProfile })
  };
}
function profileRoute(entry) {
  const resolved = resolveProfileRoute(entry);
  if (resolved.status === "owner_removed") {
    throw new Error(`Profile ${resolved.profile} has no connection owner`);
  }
  return resolved.route;
}
function backendTargetProfile(route, fallbackProfile = "default") {
  if (!route) {
    return fallbackProfile;
  }
  return route.targetProfile || route.profile;
}
function scopedCronParams(route, params = {}, options = {}) {
  if (!route) {
    return params;
  }
  assertRoutingOptions(options);
  const plain = assertPlainObject(params, "scopedCronParams params must be a plain object");
  const target = backendTargetProfile(route, route.profile);
  if (!Object.prototype.hasOwnProperty.call(plain, "profile")) {
    if (options.allowUnscoped === true) {
      return params;
    }
    throw new TypeError(
      `scopedCronParams requires params.profile for ${route.connectionId}::${route.profile} (pass { allowUnscoped: true } to send unscoped intentionally)`
    );
  }
  return { ...plain, profile: target };
}
function assertRoutingOptions(options) {
  if (options === void 0) return;
  const plain = assertPlainObject(options, "options must be a plain object");
  if (plain.allowActiveDoor !== void 0 && typeof plain.allowActiveDoor !== "boolean") {
    throw new TypeError("options.allowActiveDoor must be a boolean");
  }
  if (plain.allowUnscoped !== void 0 && typeof plain.allowUnscoped !== "boolean") {
    throw new TypeError("options.allowUnscoped must be a boolean");
  }
}
function assertTimeoutMs(timeoutMs) {
  if (timeoutMs === void 0) return;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError("timeoutMs must be a non-negative finite number");
  }
}
function coerceRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  const usable = [];
  for (const route of routes) {
    try {
      routeKey(route);
      usable.push(route);
    } catch {
      continue;
    }
  }
  return usable;
}
function findRouteByKey(routes, key) {
  if (!Array.isArray(routes) || typeof key !== "string" || !key) return null;
  for (const route of routes) {
    try {
      if (routeKey(route) === key) return route;
    } catch {
      continue;
    }
  }
  return null;
}
function resolveActiveRoute(routes, profile, connectionId) {
  if (typeof profile !== "string" || !profile.trim()) return null;
  if (typeof connectionId !== "string" || !connectionId.trim()) return null;
  const usable = coerceRoutes(routes);
  if (usable.length === 0) return null;
  const key = `${connectionId.trim()}::${profile.trim()}`;
  return findRouteByKey(usable, key);
}
function activeRouteKey(profile, connectionId) {
  if (typeof profile !== "string" || !profile.trim()) return null;
  if (typeof connectionId !== "string" || !connectionId.trim()) return null;
  return `${connectionId.trim()}::${profile.trim()}`;
}

// src/domain/jobs.ts
function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === "object") {
    const jobs = payload.jobs;
    if (Array.isArray(jobs)) return jobs;
  }
  return [];
}
function jobIdOf(job) {
  const row = job;
  if (row && typeof row.name === "string" && row.name) return row.name;
  if (row && typeof row.job_id === "string" && row.job_id) return row.job_id;
  return "";
}
function jobPaused(job) {
  if (job?.disabled === true) return true;
  if (job?.enabled === false) return true;
  return false;
}
function withPausedFlag(job, paused) {
  const next = { ...job };
  if (paused) {
    next.disabled = true;
    if ("enabled" in next) next.enabled = false;
  } else {
    next.disabled = false;
    if ("enabled" in next) next.enabled = true;
  }
  return next;
}
function visibleJobs(jobs, filter) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (filter === "active") return list.filter((job) => !jobPaused(job));
  if (filter === "paused") return list.filter((job) => jobPaused(job));
  return list.slice();
}

// src/lib/errors.ts
function messageOf(value) {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const message = value.message;
    if (typeof message === "string" && message) return message;
  }
  return String(value);
}
function wrapHostError(err, context) {
  const detail = messageOf(err);
  const clipped = detail.length > 300 ? detail.slice(0, 300) : detail;
  return new Error(`${context}: ${clipped}`, { cause: err });
}

// src/state/routinesState.ts
var ROUTINES_VIEW_STATUS = Object.freeze({
  ROUTES_LOADING: "routes-loading",
  ROUTES_ERROR: "routes-error",
  ROUTE_UNAVAILABLE: "route-unavailable",
  LIST_LOADING: "list-loading",
  READY: "ready",
  LIST_ERROR: "list-error"
});
function initialRoutinesState() {
  return {
    status: ROUTINES_VIEW_STATUS.ROUTES_LOADING,
    routes: [],
    activeKey: null,
    activeProfile: null,
    activeConnectionId: null,
    jobs: [],
    error: null,
    notice: null,
    pending: [],
    filter: "all",
    snapshot: null
  };
}
function profileText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function routinesViewReducer(state, event) {
  const S = ROUTINES_VIEW_STATUS;
  const base = state ?? initialRoutinesState();
  if (!event) return base;
  switch (event.type) {
    case "routes-loading":
      return {
        ...base,
        status: S.ROUTES_LOADING,
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null
      };
    case "routes-loaded": {
      const usable = coerceRoutes(event.routes);
      const profile = profileText(event.profile);
      const connectionId = profileText(event.connectionId);
      const route = resolveActiveRoute(usable, profile, connectionId);
      const key = activeRouteKey(profile, connectionId);
      if (!route || !key) {
        return {
          ...base,
          status: S.ROUTE_UNAVAILABLE,
          routes: usable,
          activeKey: null,
          activeProfile: profile,
          activeConnectionId: connectionId,
          jobs: [],
          error: null,
          notice: null,
          pending: [],
          snapshot: null
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        routes: usable,
        activeKey: key,
        activeProfile: profile,
        activeConnectionId: connectionId,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null
      };
    }
    case "routes-error":
      return {
        ...base,
        status: S.ROUTES_ERROR,
        error: messageOf(event.error),
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: []
      };
    case "retry-routes":
      return {
        ...base,
        status: S.ROUTES_LOADING,
        routes: [],
        activeKey: null,
        activeProfile: null,
        activeConnectionId: null,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null
      };
    case "active-changed": {
      const profile = profileText(event.profile);
      const connectionId = profileText(event.connectionId);
      const key = activeRouteKey(profile, connectionId);
      if (key === base.activeKey) return base;
      const route = resolveActiveRoute(base.routes, profile, connectionId);
      if (!route || !key) {
        return {
          ...base,
          status: S.ROUTE_UNAVAILABLE,
          activeKey: null,
          activeProfile: profile,
          activeConnectionId: connectionId,
          jobs: [],
          error: null,
          notice: null,
          pending: [],
          snapshot: null
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        activeKey: key,
        activeProfile: profile,
        activeConnectionId: connectionId,
        jobs: [],
        error: null,
        notice: null,
        pending: [],
        snapshot: null
      };
    }
    case "list-loading":
      return { ...base, status: S.LIST_LOADING, error: null };
    case "list-loaded": {
      if (typeof event.key !== "string" || event.key !== base.activeKey) return base;
      return {
        ...base,
        status: S.READY,
        jobs: normalizeJobs(event.jobs),
        error: null,
        snapshot: null,
        pending: []
      };
    }
    case "list-error": {
      if (typeof event.key !== "string" || event.key !== base.activeKey) return base;
      return { ...base, status: S.LIST_ERROR, error: messageOf(event.error) };
    }
    case "retry-list":
      return { ...base, status: S.LIST_LOADING, error: null, notice: null };
    case "filter-changed":
      return {
        ...base,
        filter: event.filter === "active" || event.filter === "paused" ? event.filter : "all"
      };
    case "mutate-start": {
      if (typeof event.name !== "string" || !event.name) return base;
      if (base.pending.indexOf(event.name) !== -1) return { ...base, notice: null };
      return { ...base, pending: base.pending.concat([event.name]), notice: null };
    }
    case "mutate-end":
      return { ...base, pending: base.pending.filter((name) => name !== event.name) };
    case "optimistic-pause":
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => jobIdOf(job) === event.name ? withPausedFlag(job, true) : job)
      };
    case "optimistic-resume":
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => jobIdOf(job) === event.name ? withPausedFlag(job, false) : job)
      };
    case "optimistic-rollback":
      return { ...base, snapshot: null, jobs: Array.isArray(base.snapshot) ? base.snapshot : base.jobs };
    case "notice":
      return { ...base, notice: messageOf(event.notice), error: null };
    case "mutation-error":
      return { ...base, error: messageOf(event.error) };
    default:
      return base;
  }
}

// src/domain/cronShapes.ts
var MAX_JOB_ID_LENGTH = 128;
var JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
var MAX_SCHEDULE_LENGTH = 256;
var CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;
function assertJobId(jobId) {
  if (typeof jobId !== "string") {
    throw new TypeError("job_id must be a non-empty string");
  }
  const id = jobId.trim();
  if (!id) {
    throw new TypeError("job_id must be a non-empty string");
  }
  if (id.length > MAX_JOB_ID_LENGTH || !JOB_ID_RE.test(id)) {
    throw new TypeError("job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars");
  }
  return id;
}
function assertSchedule(schedule) {
  if (typeof schedule !== "string") {
    throw new TypeError("schedule must be a non-empty string");
  }
  const trimmed = schedule.trim();
  if (!trimmed) {
    throw new TypeError("schedule must be a non-empty string");
  }
  if (trimmed.length > MAX_SCHEDULE_LENGTH) {
    throw new TypeError("schedule must be at most 256 chars");
  }
  if (CONTROL_CHARS_RE.test(trimmed)) {
    throw new TypeError("schedule must not contain control characters");
  }
  return trimmed;
}
function assertPayload(payload) {
  if (payload === void 0) return {};
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("payload must be a plain object");
  }
  return payload;
}
function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch (err) {
    if (err instanceof Error && err.name === "DataCloneError") {
      throw new TypeError(`uncloneable value: ${err.message || "DataCloneError"}`, { cause: err });
    }
    throw err;
  }
}
function listJobs(jobs = []) {
  const items = Array.isArray(jobs) ? jobs.map((job) => cloneValue(job)) : [];
  return { action: "list", jobs: items };
}
function addJob(input = {}) {
  const name = assertJobId(input.job_id);
  const schedule = assertSchedule(input.schedule);
  const payload = cloneValue(assertPayload(input.payload));
  return { action: "add", name, schedule, payload };
}
function removeJob(jobId) {
  return { action: "remove", name: assertJobId(jobId) };
}
function pauseJob(jobId) {
  return { action: "pause", name: assertJobId(jobId) };
}
function resumeJob(jobId) {
  return { action: "resume", name: assertJobId(jobId) };
}

// src/gateway/cronParams.ts
function targetProfileOf(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) {
    throw new Error("routine mutation requires a resolved profile route");
  }
  const target = backendTargetProfile(route, "");
  if (!target) {
    throw new Error("routine mutation requires a route with profile/targetProfile");
  }
  return target;
}
function buildListParams(route) {
  return { action: "list", include_disabled: true, profile: targetProfileOf(route) };
}
function buildAddParams(route, input) {
  const target = targetProfileOf(route);
  const shaped = addJob(input || {});
  return { ...shaped, profile: target };
}
function buildPauseParams(route, jobId) {
  return { ...pauseJob(jobId), profile: targetProfileOf(route) };
}
function buildResumeParams(route, jobId) {
  return { ...resumeJob(jobId), profile: targetProfileOf(route) };
}
function buildRemoveParams(route, jobId) {
  return { ...removeJob(jobId), profile: targetProfileOf(route) };
}
function isSafeOptimistic(action) {
  return action === "pause" || action === "resume";
}

// src/gateway/cronGateway.ts
import { host } from "@hermes/plugin-sdk";
function isRouteTarget(target) {
  if (typeof target !== "object" || target === null) return false;
  const connectionId = target.connectionId;
  return typeof connectionId === "string" && connectionId !== "";
}
async function requestCronForRoute(target, method, params = {}, timeoutMs, options = {}) {
  assertTimeoutMs(timeoutMs);
  assertRoutingOptions(options);
  const route = isRouteTarget(target) ? target : profileRoute(target);
  if (route) {
    if (typeof host.requestProfile !== "function") {
      throw new Error(`Cannot route ${method} for ${route.connectionId}::${route.profile}`);
    }
    const scoped = scopedCronParams(route, params, { allowUnscoped: options.allowUnscoped });
    return timeoutMs === void 0 ? host.requestProfile(route, method, scoped) : host.requestProfile(route, method, scoped, timeoutMs);
  }
  if (options.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`
    );
  }
  if (typeof host.request !== "function") {
    throw new Error(`Cannot dispatch ${method}: host.request is not a function`);
  }
  return timeoutMs === void 0 ? host.request(method, params) : host.request(method, params, timeoutMs);
}
async function listProfileRoutes() {
  try {
    return await host.profileRoutes();
  } catch (err) {
    throw new Error(`failed to list profile routes: ${messageOf(err)}`, { cause: err });
  }
}
async function listRoutines(route) {
  if (!route?.connectionId) {
    throw new Error("listRoutines requires a resolved profile route");
  }
  const target = backendTargetProfile(route, "");
  if (!target) {
    throw new Error("listRoutines requires a route with profile/targetProfile");
  }
  return requestCronForRoute(route, "cron.manage", {
    action: "list",
    include_disabled: true,
    profile: target
  });
}

// src/views/routinesStyles.ts
var ROUTINES_CSS = [
  ".hr-root{box-sizing:border-box;max-width:1040px;margin:0 auto;padding:28px 28px 40px;font-family:inherit;color:var(--ui-text-primary,#161616);background:transparent;}",
  ".hr-title{font-size:22px;line-height:1.3;margin:0 0 6px;color:var(--ui-text-primary,#161616);letter-spacing:-0.01em;}",
  ".hr-sub{margin:0 0 4px;color:var(--ui-text-tertiary,#595959);font-size:14px;line-height:1.5;max-width:72ch;}",
  ".hr-profile{display:inline-flex;align-items:center;gap:8px;margin:12px 0 0;padding:4px 10px;border:1px solid var(--ui-stroke-secondary,#d9d9d9);border-radius:999px;background:var(--ui-bg-tertiary,rgba(0,0,0,0.03));color:var(--ui-text-secondary,#404040);font-size:13px;line-height:1.5;}",
  ".hr-profile strong{font-weight:600;color:var(--ui-text-primary,#161616);overflow-wrap:anywhere;}",
  ".hr-count{margin:12px 0 0;color:var(--ui-text-tertiary,#595959);font-size:13px;}",
  ".hr-label{display:block;font-weight:600;margin:16px 0 6px;color:var(--ui-text-primary,#161616);}",
  ".hr-btn{display:inline-block;padding:8px 14px;font-size:14px;font-weight:600;color:var(--ui-text-primary,#161616);background:var(--ui-bg-elevated,#ffffff);border:1px solid var(--ui-stroke-secondary,#6e6e6e);border-radius:6px;cursor:pointer;line-height:1.3;}",
  ".hr-btn:disabled{opacity:0.55;cursor:not-allowed;}",
  ".hr-btn-small{padding:4px 10px;font-size:13px;}",
  ".hr-btn-current{outline:2px solid var(--ui-accent,#0b5fff);outline-offset:2px;}",
  ".hr-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 4px;}",
  ".hr-list{list-style:none;margin:12px 0;padding:0;display:grid;gap:10px;}",
  ".hr-card{border:1px solid var(--ui-stroke-secondary,#d9d9d9);border-radius:10px;padding:14px 16px;background:var(--ui-bg-elevated,#ffffff);}",
  ".hr-card-paused{border-left-width:4px;border-left-color:var(--ui-stroke-tertiary,#8a8a8a);background:var(--ui-bg-tertiary,rgba(0,0,0,0.02));}",
  ".hr-card-head{display:flex;gap:10px;align-items:flex-start;}",
  ".hr-card-toggle{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--ui-text-tertiary,#595959);cursor:pointer;font-size:14px;}",
  ".hr-card-toggle:hover{border-color:var(--ui-stroke-secondary,#d9d9d9);color:var(--ui-text-primary,#161616);}",
  ".hr-caret{display:inline-block;transition:transform 120ms ease;}",
  ".hr-caret-open{transform:rotate(90deg);}",
  ".hr-card-title{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}",
  ".hr-row-id{font-weight:600;font-size:15px;color:var(--ui-text-primary,#161616);overflow-wrap:anywhere;}",
  ".hr-subtitle{margin:6px 0 0 38px;color:var(--ui-text-tertiary,#595959);font-size:13px;line-height:1.5;}",
  ".hr-row-meta{color:var(--ui-text-tertiary,#595959);font-size:13px;line-height:1.5;}",
  ".hr-row-actions{flex:none;display:flex;gap:8px;flex-wrap:wrap;}",
  ".hr-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;}",
  ".hr-badge-dot{width:7px;height:7px;border-radius:999px;background:currentColor;flex:none;}",
  ".hr-badge-active{background:color-mix(in srgb,var(--ui-green,#166534) 12%,transparent);color:var(--ui-green,#166534);border:1px solid color-mix(in srgb,var(--ui-green,#166534) 35%,transparent);}",
  ".hr-badge-paused{background:var(--ui-bg-tertiary,rgba(0,0,0,0.05));color:var(--ui-text-secondary,#404040);border:1px solid var(--ui-stroke-secondary,#6e6e6e);}",
  ".hr-badge-completed{background:color-mix(in srgb,var(--ui-green,#166534) 12%,transparent);color:var(--ui-green,#166534);border:1px solid color-mix(in srgb,var(--ui-green,#166534) 35%,transparent);}",
  ".hr-badge-error{background:color-mix(in srgb,var(--ui-red,#b42318) 10%,transparent);color:var(--ui-red,#b42318);border:1px solid color-mix(in srgb,var(--ui-red,#b42318) 40%,transparent);}",
  ".hr-details{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px;margin:12px 0 0 38px;padding-top:12px;border-top:1px solid var(--ui-stroke-tertiary,#e4e4e4);}",
  ".hr-detail{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:start;}",
  ".hr-detail-label{color:var(--ui-text-tertiary,#595959);font-size:12px;line-height:1.6;text-transform:uppercase;letter-spacing:0.04em;}",
  ".hr-detail-value{color:var(--ui-text-secondary,#404040);font-size:14px;line-height:1.5;overflow-wrap:anywhere;}",
  ".hr-next{font-weight:600;color:var(--ui-text-primary,#161616);}",
  ".hr-date{color:var(--ui-text-tertiary,#595959);font-weight:400;}",
  ".hr-result{font-size:14px;line-height:1.5;}",
  ".hr-result-success{color:var(--ui-green,#166534);font-weight:600;}",
  ".hr-result-error{color:var(--ui-red,#b42318);font-weight:600;}",
  ".hr-result-neutral{color:var(--ui-text-secondary,#404040);}",
  ".hr-tech{grid-column:1 / -1;margin-top:4px;}",
  ".hr-tech-summary{cursor:pointer;color:var(--ui-text-tertiary,#595959);font-size:13px;}",
  ".hr-tech-body{display:grid;grid-template-columns:96px 1fr;gap:6px 10px;margin-top:8px;}",
  ".hr-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--ui-text-secondary,#404040);overflow-wrap:anywhere;}",
  ".hr-state{border:1px dashed var(--ui-stroke-secondary,#6e6e6e);border-radius:10px;padding:28px 20px;margin:16px 0;text-align:center;}",
  ".hr-state-title{margin:0 0 6px;font-size:15px;font-weight:600;color:var(--ui-text-primary,#161616);}",
  ".hr-state-text{margin:0;color:var(--ui-text-tertiary,#595959);font-size:14px;line-height:1.5;}",
  ".hr-spinner{display:inline-block;width:18px;height:18px;border-radius:999px;border:2px solid var(--ui-stroke-secondary,#d9d9d9);border-top-color:var(--ui-accent,#0b5fff);animation:hr-spin 0.9s linear infinite;margin-bottom:8px;}",
  "@keyframes hr-spin{to{transform:rotate(360deg);}}",
  "@media (prefers-reduced-motion:reduce){.hr-spinner{animation:none;}.hr-caret{transition:none;}}",
  ".hr-error{border:1px solid color-mix(in srgb,var(--ui-red,#b42318) 55%,transparent);border-left-width:6px;border-radius:10px;padding:14px 16px;background:var(--ui-bg-elevated,#ffffff);color:var(--ui-text-primary,#161616);margin:16px 0;}",
  ".hr-error strong{color:var(--ui-red,#b42318);}",
  ".hr-stale{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--ui-stroke-secondary,#d9d9d9);border-radius:10px;padding:10px 14px;margin:12px 0 0;background:var(--ui-bg-tertiary,rgba(0,0,0,0.03));color:var(--ui-text-secondary,#404040);font-size:13px;}",
  ".hr-muted{color:var(--ui-text-tertiary,#595959);font-size:14px;line-height:1.5;}",
  ".hr-status{margin-top:16px;color:var(--ui-text-tertiary,#595959);font-size:13px;}",
  ".hr-root :focus-visible{outline:2px solid var(--ui-accent,#0b5fff);outline-offset:2px;}",
  "@media (max-width:720px){.hr-root{padding:20px 16px 32px;}.hr-details{grid-template-columns:1fr;margin-left:0;}.hr-subtitle{margin-left:0;}.hr-card-head{flex-wrap:wrap;}.hr-row-actions{width:100%;}.hr-row-actions .hr-btn{flex:1 1 auto;}}"
].join("\n");

// src/views/FilterNav.tsx
import { jsx } from "react/jsx-runtime";
var FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" }
];
function FilterNav({ filter, disabled, onSelect }) {
  return /* @__PURE__ */ jsx("nav", { className: "hr-filters", "aria-label": "Filter routines by status", children: FILTER_OPTIONS.map((entry) => /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      className: "hr-btn" + (filter === entry.value ? " hr-btn-current" : ""),
      "aria-current": filter === entry.value ? "true" : void 0,
      disabled,
      onClick: () => onSelect(entry.value),
      children: entry.label
    },
    entry.value
  )) });
}

// src/views/RoutineList.tsx
import { useEffect, useState } from "react";

// src/domain/present.ts
function asRecord(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
}
function optionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function firstString(...values) {
  for (const value of values) {
    const text = optionalString(value);
    if (text !== null) return text;
  }
  return null;
}
function routineStateOf(job) {
  const row = asRecord(job);
  const raw = row === null ? "" : optionalString(row.state) ?? "";
  const token = raw.trim();
  if (!token) return "scheduled";
  if (token === "scheduled") return "scheduled";
  if (token === "paused") return "paused";
  if (token === "completed") return "completed";
  if (token === "error") return "error";
  return "unknown";
}
function routinePausedOf(job) {
  if (jobPaused(job ?? void 0)) return true;
  return routineStateOf(job) === "paused";
}
function routineCompleted(job) {
  return routineStateOf(job) === "completed";
}
function routineErrored(job) {
  return routineStateOf(job) === "error";
}
function routineTerminal(job) {
  const state = routineStateOf(job);
  return state === "completed" || state === "error";
}
function routineActive(job) {
  return !routinePausedOf(job) && !routineTerminal(job);
}
function routineTitle(job, fallback) {
  const row = asRecord(job);
  const raw = firstString(row?.name, row?.job_id, row?.id) ?? "";
  const title = raw.replace(/^\[bot:[a-z0-9][a-z0-9_-]*\]\s*/i, "").trim();
  return title || fallback;
}
function routineKey(job, fallback) {
  return jobIdOf(job ?? void 0) || fallback;
}
function scheduleTexts(job) {
  const row = asRecord(job);
  if (row === null) return { display: null, expr: null };
  const nested = asRecord(row.schedule);
  const display = firstString(
    row.schedule_display,
    row.scheduleDisplay,
    nested?.display
  );
  let expr = firstString(row.schedule_expr, row.scheduleExpr, nested?.expr);
  if (expr === null && typeof row.schedule === "string") {
    const raw = optionalString(row.schedule);
    expr = raw !== null && raw !== display ? raw : null;
  }
  if (expr !== null && expr === display) expr = null;
  return { display, expr };
}
function humanScheduleOf(job) {
  const { display, expr } = scheduleTexts(job);
  if (display !== null && !looksLikeCronExpression(display)) {
    return describeSchedule(display);
  }
  const source = expr ?? display;
  if (source === null) return "";
  return describeSchedule(source);
}
function rawScheduleOf(job) {
  const { display, expr } = scheduleTexts(job);
  return expr ?? display;
}
function fieldOf(job, ...keys) {
  const row = asRecord(job);
  if (row === null) return null;
  for (const key of keys) {
    const text = optionalString(row[key]);
    if (text !== null) return text;
  }
  return null;
}
function nextRunIso(job) {
  return fieldOf(job, "next_run_at", "nextRunAt", "next_run", "nextRun");
}
function lastRunIso(job) {
  return fieldOf(job, "last_run_at", "lastRunAt", "last_run", "lastRun");
}
function lastStatusOf(job) {
  return fieldOf(job, "last_status", "lastStatus");
}
function issueOf(job) {
  const row = asRecord(job);
  if (row === null) return null;
  const fire = asRecord(row.last_fire_error);
  const candidates = [
    row.last_fire_error && typeof row.last_fire_error === "string" ? row.last_fire_error : null,
    fire?.detail ?? null,
    fire?.at ?? null,
    row.lastFireError ?? null,
    row.last_delivery_error,
    row.lastDeliveryError,
    row.paused_reason,
    row.pausedReason,
    row.last_error,
    row.lastError
  ];
  for (const candidate of candidates) {
    const text = optionalString(candidate);
    if (text !== null) return text;
  }
  return null;
}
function lastRanSuccessfully(job) {
  const status = (lastStatusOf(job) ?? "").trim().toLowerCase();
  return status === "ok" || status === "success" || status === "completed" || status === "0";
}
function lastRanWithError(job) {
  const status = (lastStatusOf(job) ?? "").trim().toLowerCase();
  const failed = status === "error" || status === "failed" || status === "failure" || status === "1";
  return failed || issueOf(job) !== null;
}
function lastResultOf(job) {
  if (lastRanSuccessfully(job)) return { kind: "success", text: "Success" };
  if (lastRanWithError(job)) {
    return { kind: "error", text: issueOf(job) ?? "Failed" };
  }
  return { kind: "neutral", text: lastStatusOf(job) ?? "\u2014" };
}
function collapsedSubtitleOf(job) {
  if (routineCompleted(job)) return "Completed";
  if (routineErrored(job)) return "Error";
  if (routinePausedOf(job)) return "Paused";
  const base = humanScheduleOf(job) || "\u2014";
  const next = nextRunIso(job);
  const when = next === null ? null : formatWhen(next);
  if (when === null) return base;
  const daysMatch = /^in (\d+) days?$/.exec(when);
  const nextText = daysMatch?.[1] !== void 0 ? `Next in ${daysMatch[1].padStart(2, "0")} days` : `Next ${when.charAt(0).toUpperCase()}${when.slice(1)}`;
  return `${base}  |  ${nextText}`;
}
function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return null;
  return new Date(time);
}
function formatWhen(iso, now) {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const reference = now ?? /* @__PURE__ */ new Date();
  const diffMs = timestamp.getTime() - reference.getTime();
  if (diffMs > 0) {
    if (diffMs < 6e4) return "soon";
    const minutes2 = Math.floor(diffMs / 6e4);
    if (minutes2 < 60) return `in ${minutes2} ${plural(minutes2, "minute")}`;
    const hours2 = Math.round(minutes2 / 60);
    if (hours2 < 24) return `in ${hours2} ${plural(hours2, "hour")}`;
    const days2 = Math.round(hours2 / 24);
    return `in ${days2} ${plural(days2, "day")}`;
  }
  const elapsedMs = -diffMs;
  if (elapsedMs < 6e4) return "just now";
  const minutes = Math.floor(elapsedMs / 6e4);
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${plural(days, "day")} ago`;
}
function formatDate(iso) {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const month = pad(timestamp.getMonth() + 1);
  const day = pad(timestamp.getDate());
  const year = timestamp.getFullYear();
  return `${month}/${day}/${year} ${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
}
function plural(value, unit) {
  return value === 1 ? unit : `${unit}s`;
}
function looksLikeCronExpression(value) {
  const fields = value.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) return false;
  return fields.every((field) => /^[\d*,/\-*]+$/.test(field));
}
var WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function describeSchedule(expr) {
  if (typeof expr !== "string") return "";
  const trimmed = expr.trim();
  if (!trimmed) return "";
  const interval = describeInterval(trimmed);
  if (interval !== null) return interval;
  const fields = splitFields(trimmed);
  if (fields === null) return trimmed;
  const minute = parseField(fields[0] ?? "", 0, 59);
  const hour = parseField(fields[1] ?? "", 0, 23);
  const dom = parseField(fields[2] ?? "", 1, 31);
  const month = parseField(fields[3] ?? "", 1, 12);
  const dow = parseField(fields[4] ?? "", 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return trimmed;
  if (minute.isWildcard && hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    return "Every minute";
  }
  if (minute.step !== null && minute.step > 1 && hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    return `Every ${minute.step} minutes`;
  }
  if (minute.isZeroOnly && hour.step !== null && hour.step > 1 && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    return `Every ${hour.step} hours`;
  }
  if (minute.values.length === 1 && hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const only = minute.values[0];
    if (only === void 0) return trimmed;
    if (minute.isZeroOnly) return "Every hour";
    return `Every hour at :${String(only).padStart(2, "0")}`;
  }
  if (minute.values.length === 1 && hour.values.length === 1 && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === void 0 || h === void 0) return trimmed;
    return `Every day at ${formatTime(m, h)}`;
  }
  if (minute.values.length === 1 && hour.values.length === 1 && dom.isWildcard && month.isWildcard && !dow.isWildcard) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === void 0 || h === void 0) return trimmed;
    const days = normalizedWeekdays(dow.values);
    if (days.length === 0) return trimmed;
    return `${describeWeekdays(days)} at ${formatTime(m, h)}`;
  }
  if (minute.values.length === 1 && hour.values.length === 1 && !dom.isWildcard && dom.values.length > 1 && isContiguousRange(dom.values) && month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    const h = hour.values[0];
    const first = dom.values[0];
    const last = dom.values[dom.values.length - 1];
    if (m === void 0 || h === void 0 || first === void 0 || last === void 0) {
      return trimmed;
    }
    return `At ${formatTime(m, h)} on the ${ordinal(first)} to ${ordinal(last)} of every month`;
  }
  if (minute.values.length === 1 && hour.values.length === 1 && !dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === void 0 || h === void 0) return trimmed;
    const days = sortedUnique(dom.values);
    if (days.length === 1) {
      const only = days[0];
      if (only === void 0) return trimmed;
      return `On the ${ordinal(only)} of every month at ${formatTime(m, h)}`;
    }
    return `On ${joinNames(days.map(ordinal))} of every month at ${formatTime(m, h)}`;
  }
  if (minute.values.length === 1 && hour.values.length === 1 && dom.isWildcard && !month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    const h = hour.values[0];
    if (m === void 0 || h === void 0) return trimmed;
    const months = sortedUnique(month.values).map((value) => value >= 1 && value <= 12 ? MONTH_NAMES[value - 1] : null).filter((name) => name !== null);
    if (months.length === 0) return trimmed;
    return `Every day in ${joinNames(months)} at ${formatTime(m, h)}`;
  }
  if (minute.values.length === 1 && hour.values.length > 1 && !isContiguousRange(hour.values) && hour.explicitStep == null && !hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    if (m === void 0) return trimmed;
    return `At ${joinNames(hour.values.map((h) => formatTime(m, h)))} every day`;
  }
  if (minute.values.length === 1 && (isContiguousRange(hour.values) || hour.explicitStep != null) && !hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const m = minute.values[0];
    const first = hour.values[0];
    const last = hour.values[hour.values.length - 1];
    if (m === void 0 || first === void 0 || last === void 0) return trimmed;
    const start = formatTime(m, first);
    const end = formatTime(m, last);
    if (hour.explicitStep != null && hour.explicitStep > 1) {
      return `Every ${hour.explicitStep} hours from ${start} to ${end}`;
    }
    return `Every hour from ${start} to ${end}`;
  }
  if (minute.values.length === 1 && month.isWildcard && dow.isWildcard && hour.step !== null && hour.step > 1) {
    const cadence = `Every ${hour.step} hours`;
    if (dom.isWildcard) return cadence;
    const first = dom.values[0];
    const last = dom.values[dom.values.length - 1];
    if (first === void 0 || last === void 0) return trimmed;
    if (dom.values.length === 1) return `${cadence} on the ${ordinal(first)} of every month`;
    if (isContiguousRange(dom.values)) {
      return `${cadence} on the ${ordinal(first)} to ${ordinal(last)} of every month`;
    }
    return `${cadence} on the ${joinNames(dom.values.map(ordinal))} of every month`;
  }
  return trimmed;
}
function describeInterval(expr) {
  const match = /^(?:every\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i.exec(
    expr.trim()
  );
  if (!match) return null;
  const raw = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const token = (match[2] ?? "").toLowerCase();
  let minutes = raw;
  if (token.startsWith("h")) minutes = raw * 60;
  else if (token.startsWith("d")) minutes = raw * 1440;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Every day" : `Every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Every hour" : `Every ${hours} hours`;
  }
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}
function splitFields(expr) {
  const normalized = expr.trim().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");
  const list = normalized.split(" ").filter((f) => f.length > 0);
  if (list.length === 6 && list[0] === "0") list.shift();
  if (list.length !== 5) return null;
  return list;
}
function parsedField(values, opts = {}) {
  return {
    values,
    isWildcard: opts.isWildcard ?? false,
    step: opts.step ?? null,
    explicitStep: opts.explicitStep ?? null,
    isZeroOnly: values.length === 1 && values[0] === 0
  };
}
function parseField(field, min, max) {
  const trimmed = field.trim();
  if (!trimmed) return null;
  let step = null;
  let base = trimmed;
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) return null;
    const parsed = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    step = parsed;
    base = parts[0] ?? "";
  }
  if (base === "*") {
    if (step !== null) {
      const values2 = [];
      for (let v = min; v <= max; v += step) values2.push(v);
      return parsedField(values2, { isWildcard: step === 1, step, explicitStep: step });
    }
    const values = [];
    for (let v = min; v <= max; v++) values.push(v);
    return parsedField(values, { isWildcard: step == null, step: step ?? 1, explicitStep: step });
  }
  if (!base.includes("*") && !base.includes(",") && !base.includes("-")) {
    const value = Number.parseInt(base, 10);
    if (!Number.isInteger(value) || value < min || value > max) return null;
    return parsedField([value]);
  }
  if (base.includes(",") || base.includes("-")) {
    const values = /* @__PURE__ */ new Set();
    for (const segment of base.split(",")) {
      const piece = segment.trim();
      if (!piece) return null;
      if (piece.includes("-")) {
        const range = piece.split("-");
        if (range.length !== 2) return null;
        const start = Number.parseInt(range[0] ?? "", 10);
        const end = Number.parseInt(range[1] ?? "", 10);
        if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
        if (start < min || end > max || start > end) return null;
        for (let v = start; v <= end; v++) values.add(v);
      } else {
        const value = Number.parseInt(piece, 10);
        if (!Number.isInteger(value) || value < min || value > max) return null;
        values.add(value);
      }
    }
    const sorted = sortedUnique([...values]);
    const stepped = step == null ? sorted : sorted.filter((v) => (v - (sorted[0] ?? 0)) % step === 0);
    if (stepped.length === 0) return null;
    return parsedField(stepped, { explicitStep: step });
  }
  return null;
}
function normalizedWeekdays(values) {
  const normalized = new Set(values.map((v) => v === 7 ? 0 : v));
  return WEEKDAY_NAMES.map((_, index) => index).filter((index) => normalized.has(index));
}
function describeWeekdays(days) {
  const dayList = sortedUnique(days);
  if (sameValues(dayList, [1, 2, 3, 4, 5])) return "Every weekday";
  if (sameValues(dayList, [0, 6])) return "Every weekend";
  if (dayList.length === 1) {
    const only = dayList[0];
    if (only === void 0) return "";
    return `${WEEKDAY_NAMES[only]}s`;
  }
  return `Every ${joinNames(dayList.map((d) => WEEKDAY_NAMES[d] ?? String(d)))}`;
}
function sameValues(a, b) {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort((x, y) => x - y);
  return a.every((value, index) => value === sortedB[index]);
}
function joinNames(names) {
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
function ordinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const last = value % 10;
  if (last === 1) return `${value}st`;
  if (last === 2) return `${value}nd`;
  if (last === 3) return `${value}rd`;
  return `${value}th`;
}
function formatTime(minute, hour) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function isContiguousRange(values) {
  if (values.length < 2) return false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== (values[i - 1] ?? 0) + 1) return false;
  }
  return true;
}

// src/views/RoutineDetails.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function RoutineDetails({
  job,
  fallback
}) {
  const schedule = humanScheduleOf(job) || "\u2014";
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const raw = rawScheduleOf(job);
  const title = routineTitle(job, fallback);
  const showRuns = routineActive(job);
  return /* @__PURE__ */ jsxs("div", { className: "hr-details", children: [
    /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Schedule" }),
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-value", children: schedule })
    ] }),
    showRuns && nextIso !== null && formatWhen(nextIso) !== null ? /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Next run" }),
      /* @__PURE__ */ jsx2(RunValue, { iso: nextIso, strong: true })
    ] }) : null,
    showRuns && lastIso !== null && formatWhen(lastIso) !== null ? /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Last run" }),
      /* @__PURE__ */ jsx2(RunValue, { iso: lastIso })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Last result" }),
      /* @__PURE__ */ jsx2("span", { className: `hr-result hr-result-${result.kind}`, children: result.text })
    ] }),
    raw !== null && raw !== schedule ? /* @__PURE__ */ jsxs("details", { className: "hr-tech", children: [
      /* @__PURE__ */ jsx2("summary", { className: "hr-tech-summary", children: "Technical details" }),
      /* @__PURE__ */ jsxs("div", { className: "hr-tech-body", children: [
        /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Routine" }),
        /* @__PURE__ */ jsx2("code", { className: "hr-code", children: title }),
        /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Cron" }),
        /* @__PURE__ */ jsx2("code", { className: "hr-code", children: raw })
      ] })
    ] }) : null
  ] });
}
function RunValue({ iso, strong }) {
  const distance = formatWhen(iso);
  if (distance === null) return null;
  const date = formatDate(iso);
  return /* @__PURE__ */ jsxs("span", { className: strong ? "hr-detail-value hr-next" : "hr-detail-value", children: [
    distance,
    date !== null ? /* @__PURE__ */ jsxs("span", { className: "hr-date", children: [
      " (",
      date,
      ")"
    ] }) : null
  ] });
}

// src/views/RoutineStatus.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function statusOf(job) {
  if (routineCompleted(job)) return { label: "Completed", tone: "completed" };
  if (routineErrored(job)) return { label: "Error", tone: "error" };
  if (routinePausedOf(job)) return { label: "Paused", tone: "paused" };
  return { label: "Active", tone: "active" };
}
function RoutineStatus({ job }) {
  const { label, tone } = statusOf(job);
  return /* @__PURE__ */ jsxs2("span", { className: `hr-badge hr-badge-${tone}`, children: [
    /* @__PURE__ */ jsx3("span", { className: "hr-badge-dot", "aria-hidden": "true" }),
    label
  ] });
}

// src/views/RoutineCard.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function RoutineCard(props) {
  const { job, fallback, expanded, busy, disabled } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const subtitle = collapsedSubtitleOf(job);
  const controlsId = `hr-details-${fallback.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  return /* @__PURE__ */ jsxs3("li", { className: "hr-card" + (paused && !terminal ? " hr-card-paused" : ""), children: [
    /* @__PURE__ */ jsxs3("div", { className: "hr-card-head", children: [
      /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "hr-card-toggle",
          "aria-expanded": expanded,
          "aria-controls": controlsId,
          "aria-label": `${expanded ? "Collapse" : "Expand"} details for ${title}`,
          onClick: props.onToggleExpand,
          children: /* @__PURE__ */ jsx4("span", { className: "hr-caret" + (expanded ? " hr-caret-open" : ""), "aria-hidden": "true", children: "\u25B8" })
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "hr-card-title", children: [
        /* @__PURE__ */ jsx4("strong", { className: "hr-row-id", children: title }),
        /* @__PURE__ */ jsx4(RoutineStatus, { job })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "hr-row-actions", children: !terminal ? paused ? /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "hr-btn",
          disabled,
          onClick: props.onResume,
          "aria-label": `Resume ${title}`,
          children: busy ? "Resuming\u2026" : "Resume"
        }
      ) : /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "hr-btn",
          disabled,
          onClick: props.onPause,
          "aria-label": `Pause ${title}`,
          children: busy ? "Pausing\u2026" : "Pause"
        }
      ) : null })
    ] }),
    !expanded ? /* @__PURE__ */ jsx4("p", { className: "hr-subtitle", children: subtitle }) : null,
    expanded ? /* @__PURE__ */ jsx4("div", { id: controlsId, children: /* @__PURE__ */ jsx4(RoutineDetails, { job, fallback }) }) : null
  ] });
}

// src/views/RoutineList.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function RoutineList({ jobs, pending, locked, onPause, onResume }) {
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    if (expanded === null) return;
    const stillThere = jobs.some((job, index) => (jobIdOf(job) || `routine ${index + 1}`) === expanded);
    if (!stillThere) setExpanded(null);
  }, [jobs, expanded]);
  return /* @__PURE__ */ jsx5("ul", { className: "hr-list", "aria-label": "Routines", children: jobs.map((job, index) => {
    const fallback = `routine ${index + 1}`;
    const name = jobIdOf(job) || fallback;
    const busy = pending.indexOf(name) !== -1;
    return /* @__PURE__ */ jsx5(
      RoutineCard,
      {
        job,
        fallback,
        expanded: expanded === name,
        busy,
        disabled: locked,
        onToggleExpand: () => setExpanded((current) => current === name ? null : name),
        onPause: () => onPause(name),
        onResume: () => onResume(name)
      },
      `${index}::${name}`
    );
  }) });
}

// src/views/panels.tsx
import { Fragment, jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function StatusLine({ text, statusRef }) {
  return /* @__PURE__ */ jsx6("p", { ref: statusRef, tabIndex: -1, className: "hr-status", role: "status", "aria-live": "polite", children: text || "Routines ready." });
}

// src/views/RoutineStates.tsx
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function LoadingState({ text }) {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-state", role: "status", "aria-live": "polite", "aria-busy": "true", children: [
    /* @__PURE__ */ jsx7("span", { className: "hr-spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx7("p", { className: "hr-state-text", children: text })
  ] });
}
function EmptyState() {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx7("p", { className: "hr-state-title", children: "No routines yet" }),
    /* @__PURE__ */ jsx7("p", { className: "hr-state-text", children: "Scheduled jobs for this profile will appear here." })
  ] });
}
function EmptyFilterState() {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx7("p", { className: "hr-state-title", children: "No routines match this filter" }),
    /* @__PURE__ */ jsx7("p", { className: "hr-state-text", children: "Try a different filter to see more routines." })
  ] });
}
function ErrorState({
  title,
  message,
  onRetry
}) {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx7("strong", { children: title }),
    /* @__PURE__ */ jsx7("p", { className: "hr-row-meta", children: message }),
    /* @__PURE__ */ jsx7("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function UnavailableState({
  profile,
  onRetry
}) {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx7("strong", { children: "Routines unavailable for this profile." }),
    /* @__PURE__ */ jsx7("p", { className: "hr-row-meta", children: profile ? `The Desktop profile \u201C${profile}\u201D has no routines route right now. Connect the profile, then retry.` : "The active Desktop profile has no routines route right now. Select a profile, then retry." }),
    /* @__PURE__ */ jsx7("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function StaleBanner({ onRetry }) {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-stale", role: "status", children: [
    /* @__PURE__ */ jsx7("span", { children: "Showing last loaded jobs." }),
    /* @__PURE__ */ jsx7("button", { type: "button", className: "hr-btn hr-btn-small", onClick: onRetry, children: "Refresh" })
  ] });
}

// src/views/RoutinesPage.tsx
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
function pastTense(kind) {
  if (kind === "pause") return "paused";
  if (kind === "resume") return "resumed";
  return "saved";
}
function RoutinesPage() {
  const [state, setState] = useState2(initialRoutinesState);
  const [routesNonce, setRoutesNonce] = useState2(0);
  const headingRef = useRef(null);
  const statusRef = useRef(null);
  const generationRef = useRef(0);
  const activeProfile = useValue(host2.state.profile);
  const activeConnectionId = useValue(host2.state.connectionId);
  const dispatch = useCallback((event) => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);
  const activeRoute = findRouteByKey(state.routes, state.activeKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;
  useEffect2(() => {
    let cancelled = false;
    dispatch({ type: "routes-loading" });
    void (async () => {
      try {
        const routes = await listProfileRoutes();
        if (cancelled) return;
        dispatch({
          type: "routes-loaded",
          routes,
          profile: host2.state.profile.get(),
          connectionId: host2.state.connectionId.get()
        });
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: "routes-error", error: wrapHostError(err, "failed to list profile routes").message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routesNonce, dispatch]);
  useEffect2(() => {
    if (state.status === S.ROUTES_LOADING || state.status === S.ROUTES_ERROR) return;
    if (state.routes.length === 0 && state.status !== S.ROUTE_UNAVAILABLE) return;
    dispatch({ type: "active-changed", profile: activeProfile, connectionId: activeConnectionId });
  }, [activeProfile, activeConnectionId, state.status, state.routes.length, dispatch, S.ROUTES_LOADING, S.ROUTES_ERROR, S.ROUTE_UNAVAILABLE]);
  useEffect2(() => {
    if (state.status !== S.LIST_LOADING) return void 0;
    if (!state.activeKey) return void 0;
    const key = state.activeKey;
    const route = findRouteByKey(state.routes, key);
    if (!route) {
      dispatch({ type: "list-error", error: "the active profile route is no longer available", key });
      return void 0;
    }
    try {
      buildListParams(route);
    } catch (err) {
      dispatch({ type: "list-error", error: wrapHostError(err, "failed to load routines").message, key });
      return void 0;
    }
    const generation = generationRef.current += 1;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await listRoutines(route);
        if (!cancelled && generation === generationRef.current) {
          dispatch({ type: "list-loaded", jobs: payload, key });
        }
      } catch (err) {
        if (!cancelled && generation === generationRef.current) {
          dispatch({ type: "list-error", error: wrapHostError(err, "failed to load routines").message, key });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, state.routes, state.activeKey, dispatch, S.LIST_LOADING]);
  useEffect2(() => {
    if (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) statusRef.current?.focus();
  }, [state.status, S.ROUTES_ERROR, S.LIST_ERROR]);
  function handleRetryRoutes() {
    setRoutesNonce((nonce) => nonce + 1);
  }
  async function runMutation(kind, name, build) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    let params;
    try {
      params = build();
    } catch (err) {
      dispatch({ type: "mutation-error", error: wrapHostError(err, "invalid routine " + kind).message });
      return false;
    }
    if (isSafeOptimistic(kind)) {
      dispatch(kind === "pause" ? { type: "optimistic-pause", name } : { type: "optimistic-resume", name });
    }
    dispatch({ type: "mutate-start", name });
    try {
      await requestCronForRoute(activeRoute, "cron.manage", params);
      dispatch({ type: "mutate-end", name });
      dispatch({ type: "notice", notice: "routine " + name + " " + pastTense(kind) });
      dispatch({ type: "retry-list" });
      return true;
    } catch (err) {
      dispatch({ type: "mutate-end", name });
      if (isSafeOptimistic(kind)) dispatch({ type: "optimistic-rollback" });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to " + kind + " routine").message });
      return false;
    }
  }
  function handlePause(name) {
    if (locked || !name || !activeRoute) return;
    const route = activeRoute;
    void runMutation("pause", name, () => buildPauseParams(route, name));
  }
  function handleResume(name) {
    if (locked || !name || !activeRoute) return;
    const route = activeRoute;
    void runMutation("resume", name, () => buildResumeParams(route, name));
  }
  function renderList() {
    return /* @__PURE__ */ jsxs6(Fragment2, { children: [
      /* @__PURE__ */ jsx8(
        FilterNav,
        {
          filter: state.filter,
          disabled: locked,
          onSelect: (value) => dispatch({ type: "filter-changed", filter: value })
        }
      ),
      shown.length === 0 ? state.jobs.length === 0 ? /* @__PURE__ */ jsx8(EmptyState, {}) : /* @__PURE__ */ jsx8(EmptyFilterState, {}) : /* @__PURE__ */ jsx8(
        RoutineList,
        {
          jobs: shown,
          pending: state.pending,
          locked,
          onPause: handlePause,
          onResume: handleResume
        }
      )
    ] });
  }
  let liveText = "";
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = "Loading routines.";
  else if (state.status === S.LIST_LOADING) liveText = "Loading routines.";
  else if (state.status === S.ROUTE_UNAVAILABLE) liveText = "Routines unavailable for this profile.";
  else if (state.status === S.READY) {
    if (state.jobs.length === 0) liveText = "No routines yet.";
    else liveText = `Showing ${shown.length} of ${state.jobs.length} routines.`;
  }
  const body = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(/* @__PURE__ */ jsx8(LoadingState, { text: "Loading routines." }, "routes-loading"));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      /* @__PURE__ */ jsx8(
        ErrorState,
        {
          title: "Could not list routines.",
          message: state.error || "Unknown error.",
          onRetry: handleRetryRoutes
        },
        "routes-error"
      )
    );
  } else if (state.status === S.ROUTE_UNAVAILABLE) {
    body.push(
      /* @__PURE__ */ jsx8(
        UnavailableState,
        {
          profile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          onRetry: handleRetryRoutes
        },
        "route-unavailable"
      )
    );
  } else if (state.status === S.LIST_LOADING) {
    if (state.jobs.length > 0) {
      body.push(
        /* @__PURE__ */ jsx8(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-loading")
      );
      body.push(/* @__PURE__ */ jsx8("div", { children: renderList() }, "stale-list"));
    } else {
      body.push(/* @__PURE__ */ jsx8(LoadingState, { text: "Loading routines." }, "list-loading"));
    }
  } else if (state.status === S.LIST_ERROR) {
    if (state.jobs.length > 0) {
      body.push(
        /* @__PURE__ */ jsx8(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-error")
      );
      body.push(/* @__PURE__ */ jsx8("div", { children: renderList() }, "stale-list-error"));
    }
    body.push(
      /* @__PURE__ */ jsx8(
        ErrorState,
        {
          title: "Could not load routines.",
          message: state.error || "Unknown error.",
          onRetry: () => dispatch({ type: "retry-list" })
        },
        "list-error"
      )
    );
  } else if (state.status === S.READY) {
    body.push(/* @__PURE__ */ jsx8("div", { children: renderList() }, "ready-list"));
  }
  const profileLabel = typeof activeProfile === "string" && activeProfile ? activeProfile : "\u2014";
  return /* @__PURE__ */ jsxs6("section", { id: "hermes-routines-root", className: "hr-root", "aria-labelledby": "hermes-routines-heading", children: [
    /* @__PURE__ */ jsx8("style", { children: ROUTINES_CSS }),
    /* @__PURE__ */ jsx8("h2", { id: "hermes-routines-heading", ref: headingRef, tabIndex: -1, className: "hr-title", children: "Routines" }),
    /* @__PURE__ */ jsx8("p", { className: "hr-sub", children: "Routines are scheduled jobs this profile runs to do recurring tasks." }),
    /* @__PURE__ */ jsxs6("p", { className: "hr-profile", "aria-live": "polite", children: [
      "Profile: ",
      /* @__PURE__ */ jsx8("strong", { children: profileLabel })
    ] }),
    state.status === S.READY && state.jobs.length > 0 ? /* @__PURE__ */ jsxs6("p", { className: "hr-count", children: [
      "Showing ",
      shown.length,
      " of ",
      state.jobs.length,
      " routines."
    ] }) : null,
    body,
    /* @__PURE__ */ jsx8(StatusLine, { text: liveText, statusRef })
  ] });
}

// src/plugin.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => /* @__PURE__ */ jsx9(RoutinesPage, {})
  });
  ctx.register({
    id: SIDEBAR_ID,
    area: SIDEBAR_NAV_AREA,
    order: SIDEBAR_ORDER,
    data: { path: ROUTE_PATH, label: SIDEBAR_LABEL, codicon: SIDEBAR_CODICON }
  });
}
var plugin = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  version: "0.1.0",
  register
};
var plugin_default = plugin;
export {
  PLUGIN_ID,
  PLUGIN_NAME,
  ROUTE_ID,
  ROUTE_PATH,
  ROUTINES_VIEW_STATUS,
  RoutinesPage,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
  activeRouteKey,
  addJob,
  assertRoutingOptions,
  assertTimeoutMs,
  backendTargetProfile,
  buildAddParams,
  buildListParams,
  buildPauseParams,
  buildRemoveParams,
  buildResumeParams,
  coerceRoutes,
  collapsedSubtitleOf,
  plugin_default as default,
  describeSchedule,
  findRouteByKey,
  formatDate,
  formatWhen,
  humanScheduleOf,
  initialRoutinesState,
  isSafeOptimistic,
  issueOf,
  jobIdOf,
  jobPaused,
  lastRanSuccessfully,
  lastRanWithError,
  lastResultOf,
  lastRunIso,
  lastStatusOf,
  listJobs,
  listProfileRoutes,
  listRoutines,
  messageOf,
  nextRunIso,
  normalizeJobs,
  parseTimestamp,
  pauseJob,
  plugin,
  profileRoute,
  rawScheduleOf,
  register,
  removeJob,
  requestCronForRoute,
  resolveActiveRoute,
  resolveProfileRoute,
  resumeJob,
  routeKey,
  routineActive,
  routineCompleted,
  routineErrored,
  routineKey,
  routinePausedOf,
  routineStateOf,
  routineTerminal,
  routineTitle,
  routinesViewReducer,
  scopedCronParams,
  visibleJobs,
  withPausedFlag,
  wrapHostError
};
