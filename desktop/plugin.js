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
import { useCallback, useEffect as useEffect3, useMemo as useMemo2, useRef as useRef2, useState as useState5 } from "react";
import { host as host3, useValue } from "@hermes/plugin-sdk";

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
  if (plain.spawnPriority !== void 0 && plain.spawnPriority !== "foreground" && plain.spawnPriority !== "background") {
    throw new TypeError("options.spawnPriority must be 'foreground' or 'background'");
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

// src/domain/cronShapes.ts
var MAX_JOB_ID_LENGTH = 128;
var JOB_ID_RE = /^[A-Za-z0-9._:-]+$/;
var MAX_NAME_LENGTH = 128;
var MAX_SCHEDULE_LENGTH = 256;
var MAX_PROMPT_LENGTH = 2e4;
var CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;
function isValidJobId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_JOB_ID_LENGTH && JOB_ID_RE.test(value);
}
function assertJobId(jobId) {
  if (typeof jobId !== "string") {
    throw new TypeError("job_id must be a non-empty string");
  }
  const id = jobId.trim();
  if (!id) {
    throw new TypeError("job_id must be a non-empty string");
  }
  if (!isValidJobId(id)) {
    throw new TypeError("job_id must match /^[A-Za-z0-9._:-]+$/ with max 128 chars");
  }
  return id;
}
function assertName(name) {
  if (typeof name !== "string") {
    throw new TypeError("name must be a non-empty string");
  }
  const text = name.trim();
  if (!text) {
    throw new TypeError("name must be a non-empty string");
  }
  if (text.length > MAX_NAME_LENGTH) {
    throw new TypeError("name must be at most 128 chars");
  }
  if (CONTROL_CHARS_RE.test(text)) {
    throw new TypeError("name must not contain control characters");
  }
  return text;
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
function assertPrompt(prompt) {
  if (typeof prompt !== "string") {
    throw new TypeError("prompt must be a non-empty string");
  }
  const text = prompt.trim();
  if (!text) {
    throw new TypeError("prompt must be a non-empty string");
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    throw new TypeError("prompt must be at most 20000 chars");
  }
  return text;
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
  const name = assertName(input.name);
  const schedule = assertSchedule(input.schedule);
  const prompt = assertPrompt(input.prompt);
  return { action: "add", name, schedule, prompt };
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
  if (!row || typeof row.job_id !== "string") return "";
  const id = row.job_id.trim();
  return isValidJobId(id) ? id : "";
}
function jobIdFromResponse(payload) {
  if (payload === null || typeof payload !== "object") return "";
  const row = payload;
  const nested = row.job !== null && typeof row.job === "object" ? row.job : null;
  for (const candidate of [row.job_id, nested?.job_id]) {
    if (typeof candidate === "string") {
      const id = candidate.trim();
      if (isValidJobId(id)) return id;
    }
  }
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
      if (typeof event.jobId !== "string") return base;
      if (base.pending.indexOf(event.jobId) !== -1) return { ...base, notice: null };
      return { ...base, pending: base.pending.concat([event.jobId]), notice: null };
    }
    case "mutate-end":
      return { ...base, pending: base.pending.filter((jobId) => jobId !== event.jobId) };
    case "optimistic-pause":
      if (!event.jobId) return base;
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => jobIdOf(job) === event.jobId ? withPausedFlag(job, true) : job)
      };
    case "optimistic-resume":
      if (!event.jobId) return base;
      return {
        ...base,
        snapshot: base.jobs,
        jobs: base.jobs.map((job) => jobIdOf(job) === event.jobId ? withPausedFlag(job, false) : job)
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

// src/domain/schedule.ts
var TRIGGER_OPTIONS = [
  { value: "every_hour", label: "Every Hour" },
  { value: "every_day", label: "Every Day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "every_week", label: "Every week" },
  { value: "every_month", label: "Every month" },
  { value: "interval", label: "Interval" }
];
var DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
var DAY_OF_WEEK_TO_CRON = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};
var INTERVAL_VALUES = [2, 5, 10, 15, 20, 30, 45];
var INTERVAL_UNITS = ["minutes", "hours", "days"];
var TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
var TRIGGER_VALUES = new Set(TRIGGER_OPTIONS.map((o) => o.value));
var DAY_OF_WEEK_VALUES = new Set(DAYS_OF_WEEK);
var INTERVAL_UNIT_VALUES = new Set(INTERVAL_UNITS);
function show(value) {
  let text;
  try {
    text = typeof value === "string" ? JSON.stringify(value) : String(value);
  } catch {
    text = Object.prototype.toString.call(value);
  }
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}
function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    for (const m of [0, 15, 30, 45]) {
      const mm = String(m).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}
var TIME_SLOTS = generateTimeSlots();
function toOrdinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  if (rem10 === 1) return `${n}st`;
  if (rem10 === 2) return `${n}nd`;
  if (rem10 === 3) return `${n}rd`;
  return `${n}th`;
}
var DAYS_OF_MONTH = Array.from(
  { length: 31 },
  (_, i) => ({ value: i + 1, label: toOrdinal(i + 1) })
);
var DEFAULT_SCHEDULE_CONFIG = {
  trigger: "every_day",
  time: "08:00",
  dayOfWeek: "Monday",
  dayOfMonth: 1,
  intervalValue: 5,
  intervalUnit: "minutes"
};
function validateScheduleConfig(input) {
  if (typeof input !== "object" || input === null) {
    throw new TypeError(`schedule config must be an object (got ${show(input)})`);
  }
  const config = input;
  if (!TRIGGER_VALUES.has(config.trigger)) {
    throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
  if (typeof config.time !== "string" || !TIME_RE.test(config.time)) {
    throw new TypeError(`time must be a valid HH:mm string (got ${show(config.time)})`);
  }
  if (!DAY_OF_WEEK_VALUES.has(config.dayOfWeek)) {
    throw new TypeError(`unknown dayOfWeek value: ${show(config.dayOfWeek)}`);
  }
  if (typeof config.dayOfMonth !== "number" || !Number.isInteger(config.dayOfMonth) || config.dayOfMonth < 1 || config.dayOfMonth > 31) {
    throw new TypeError(
      `dayOfMonth must be an integer between 1 and 31 (got ${show(config.dayOfMonth)})`
    );
  }
  if (typeof config.intervalValue !== "number" || !Number.isInteger(config.intervalValue) || config.intervalValue < 1) {
    throw new TypeError(
      `intervalValue must be a finite positive integer (got ${show(config.intervalValue)})`
    );
  }
  if (!INTERVAL_UNIT_VALUES.has(config.intervalUnit)) {
    throw new TypeError(`unknown intervalUnit value: ${show(config.intervalUnit)}`);
  }
}
function parseTime(time) {
  const [hourText, minuteText] = time.split(":");
  return { hour: Number(hourText), minute: Number(minuteText) };
}
function buildCronExpression(config) {
  validateScheduleConfig(config);
  const { minute, hour } = parseTime(config.time);
  switch (config.trigger) {
    case "every_hour":
      return "0 * * * *";
    case "every_day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "every_week": {
      const dow = DAY_OF_WEEK_TO_CRON[config.dayOfWeek];
      return `${minute} ${hour} * * ${dow}`;
    }
    case "every_month": {
      const dom = config.dayOfMonth;
      return `${minute} ${hour} ${dom} * *`;
    }
    case "interval": {
      const val = config.intervalValue;
      if (config.intervalUnit === "minutes") {
        return `every ${val}m`;
      }
      if (config.intervalUnit === "hours") {
        return `every ${val}h`;
      }
      if (config.intervalUnit === "days") {
        return `every ${val}d`;
      }
      throw new TypeError(`unknown intervalUnit value: ${show(config.intervalUnit)}`);
    }
    default:
      throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
}
function describeScheduleConfig(config) {
  validateScheduleConfig(config);
  switch (config.trigger) {
    case "every_hour":
      return "Every hour";
    case "every_day":
      return `Every day at ${config.time}`;
    case "weekdays":
      return `Weekdays at ${config.time}`;
    case "every_week":
      return `Every ${config.dayOfWeek} at ${config.time}`;
    case "every_month":
      return `On the ${toOrdinal(config.dayOfMonth)} of every month at ${config.time}`;
    case "interval": {
      const unit = config.intervalValue === 1 ? config.intervalUnit.replace(/s$/, "") : config.intervalUnit;
      return `Every ${config.intervalValue} ${unit}`;
    }
    default:
      throw new TypeError(`unknown trigger value: ${show(config.trigger)}`);
  }
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
  if (isUniformMinuteStep(minute) && hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const step = minute.explicitStep ?? minute.step ?? 0;
    return `Every ${step} minutes`;
  }
  if (minute.isZeroOnly && isUniformHourStep(hour) && dom.isWildcard && month.isWildcard && dow.isWildcard) {
    const step = hour.explicitStep ?? hour.step ?? 0;
    return `Every ${step} hours`;
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
    if (!isUniformHourStep(hour)) return trimmed;
    const step = hour.explicitStep ?? hour.step;
    const cadence = `Every ${step} hours`;
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
function parseStrictInt(token) {
  if (!/^\d+$/.test(token)) return null;
  const value = Number.parseInt(token, 10);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}
function isUniformMinuteStep(field2) {
  const step = field2.explicitStep ?? field2.step;
  if (step === null || step <= 1) return false;
  if (field2.values[0] !== 0) return false;
  return 60 % step === 0;
}
function isUniformHourStep(field2) {
  const step = field2.explicitStep ?? field2.step;
  if (step === null || step <= 1) return false;
  if (field2.values[0] !== 0) return false;
  return 24 % step === 0;
}
function parseField(field2, min, max) {
  const trimmed = field2.trim();
  if (!trimmed) return null;
  let step = null;
  let base = trimmed;
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) return null;
    const parsed = parseStrictInt(parts[1] ?? "");
    if (parsed === null || parsed <= 0) return null;
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
    const start = parseStrictInt(base);
    if (start === null || start < min || start > max) return null;
    if (step === null) return parsedField([start]);
    const values = [];
    for (let v = start; v <= max; v += step) values.push(v);
    return parsedField(values, { step, explicitStep: step });
  }
  if (base.includes(",") || base.includes("-")) {
    const values = /* @__PURE__ */ new Set();
    for (const segment of base.split(",")) {
      const piece = segment.trim();
      if (!piece) return null;
      if (piece.includes("-")) {
        const range = piece.split("-");
        if (range.length !== 2) return null;
        const start = parseStrictInt(range[0] ?? "");
        const end = parseStrictInt(range[1] ?? "");
        if (start === null || end === null) return null;
        if (start < min || end > max || start > end) return null;
        for (let v = start; v <= end; v++) values.add(v);
      } else {
        const value = parseStrictInt(piece);
        if (value === null || value < min || value > max) return null;
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
  if (sameValues(dayList, [1, 2, 3, 4, 5])) return "Weekdays";
  if (sameValues(dayList, [0, 6])) return "Every weekend";
  if (dayList.length === 1) {
    const only = dayList[0];
    if (only === void 0) return "";
    return `Every ${WEEKDAY_NAMES[only]}`;
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
  const title = raw.replace(/^\[bot:[a-z0-9][a-z0-9_-]*\]\s*/i, "").replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D/gu, "").replace(/\s{2,}/g, " ").trim();
  return title || fallback;
}
function routineKey(job, fallback) {
  return jobIdOf(job ?? void 0) || fallback;
}
function routinePromptOf(job) {
  const row = asRecord(job);
  if (row === null) return null;
  const nested = asRecord(row.payload);
  return firstString(row.prompt, row.prompt_preview, row.promptPreview, nested?.prompt);
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
    return describeSchedule2(display);
  }
  const source = expr ?? display;
  if (source === null) return "";
  return describeSchedule2(source);
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
function isFailedStatus(job) {
  const status = (lastStatusOf(job) ?? "").trim().toLowerCase();
  return status === "error" || status === "failed" || status === "failure" || status === "1";
}
function lastRanWithError(job) {
  return isFailedStatus(job) || issueOf(job) !== null;
}
function lastResultOf(job) {
  if (lastRanSuccessfully(job)) return { kind: "success", text: "Success" };
  if (lastRanWithError(job)) {
    return { kind: "error", text: issueOf(job) ?? "Failed" };
  }
  return { kind: "neutral", text: lastStatusOf(job) ?? "\u2014" };
}
function runDistanceOf(iso) {
  const text = formatWhen(iso ?? null);
  if (text === null) return null;
  return { text, date: formatDate(iso ?? null) };
}
function lastExecutionOf(job) {
  const result = lastResultOf(job);
  const failed2 = result.kind === "error";
  const known = lastRunIso(job) !== null || lastStatusOf(job) !== null;
  return {
    known,
    lastRun: runDistanceOf(lastRunIso(job)),
    resultKind: result.kind,
    // The failure detail moves to its own row; the badge keeps the outcome.
    resultText: failed2 ? "Failed" : result.text,
    // Gated on known so the block can never contradict itself: a row with no
    // execution shows the empty state and no issue row, even when the backend
    // parked a benign reason there (issueOf also reads paused_reason).
    issue: known && failed2 ? issueOf(job) : null,
    nextRun: routineActive(job) ? runDistanceOf(nextRunIso(job)) : null
  };
}
function routineHealthOf(job) {
  if (job === null || job === void 0) return "unknown";
  if (routineCompleted(job)) return "completed";
  if (routineErrored(job)) return "failed";
  if (routinePausedOf(job)) return "paused";
  if (lastRanWithError(job)) return "failed";
  if (lastRanSuccessfully(job)) return "healthy";
  return "unknown";
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
  return fields.every((field2) => /^[\d*,/\-*]+$/.test(field2));
}
function describeSchedule2(expr) {
  return describeSchedule(expr);
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
    const dialOptions = options.spawnPriority === void 0 ? void 0 : { spawnPriority: options.spawnPriority };
    if (dialOptions === void 0) {
      return timeoutMs === void 0 ? host.requestProfile(route, method, scoped) : host.requestProfile(route, method, scoped, timeoutMs);
    }
    return timeoutMs === void 0 ? host.requestProfile(route, method, scoped, void 0, dialOptions) : host.requestProfile(route, method, scoped, timeoutMs, dialOptions);
  }
  if (options.allowActiveDoor !== true) {
    throw new Error(
      `Cannot dispatch ${method} without a resolved profile route (active gateway door is opt-in via { allowActiveDoor: true })`
    );
  }
  if (options.spawnPriority !== void 0) {
    throw new TypeError(
      `spawnPriority requires a resolved profile route (host.request takes no options bag)`
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

// src/domain/provisional.ts
function cronOutcomeOf(answer) {
  if (answer === null || typeof answer !== "object") {
    return { ok: false, error: "the backend returned no result" };
  }
  const row = answer;
  if (row.success !== false) return { ok: true, error: "" };
  const detail = typeof row.error === "string" ? row.error.trim() : "";
  return { ok: false, error: detail || "the backend rejected the request" };
}
function pausedConfirmedBy(answer) {
  if (answer === null || typeof answer !== "object") return false;
  const job = answer.job;
  if (job === null || typeof job !== "object") return false;
  return job.enabled === false;
}
function rowOf(answer) {
  if (answer === null || typeof answer !== "object") return null;
  const job = answer.job;
  return job !== null && typeof job === "object" ? job : null;
}
function scopeOf(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return null;
  return backendTargetProfile(route, "") || null;
}
function mintedRoutineFrom(route, addAnswer) {
  const backendProfile = scopeOf(route);
  if (!route || !backendProfile) {
    return {
      ok: false,
      reason: "no_route",
      message: "Provisional creation requires a resolved profile route",
      jobId: "",
      route: null,
      backendProfile: null,
      createdPaused: false
    };
  }
  const created = cronOutcomeOf(addAnswer);
  if (!created.ok) {
    return {
      ok: false,
      reason: "create_rejected",
      message: "the backend refused to create the routine: " + created.error,
      jobId: "",
      route,
      backendProfile,
      createdPaused: false
    };
  }
  const jobId = jobIdFromResponse(addAnswer);
  if (!jobId) {
    return {
      ok: false,
      reason: "identity_unresolved",
      message: "the routine was created but the backend returned no job id, so it cannot be addressed \u2014 check the routines list before configuring it",
      jobId: "",
      route,
      backendProfile,
      createdPaused: false
    };
  }
  return { ok: true, jobId, route, backendProfile, job: rowOf(addAnswer) };
}
function resolveProvisionalCreate(input) {
  const minted = mintedRoutineFrom(input.route, input.addAnswer);
  if (minted.ok === false) return minted;
  const { jobId, route, backendProfile } = minted;
  if (input.pause.status === "rejected") {
    return {
      ok: false,
      reason: "pause_rejected",
      message: "the routine was created but pausing it failed (" + input.pause.message + ") \u2014 it may still run on its schedule; check it before the first run",
      jobId,
      route,
      backendProfile,
      createdPaused: false
    };
  }
  const paused = cronOutcomeOf(input.pause.answer);
  if (!paused.ok) {
    return {
      ok: false,
      reason: "pause_rejected",
      message: "the routine was created but the backend refused to pause it: " + paused.error,
      jobId,
      route,
      backendProfile,
      createdPaused: false
    };
  }
  if (!pausedConfirmedBy(input.pause.answer)) {
    return {
      ok: false,
      reason: "pause_unconfirmed",
      message: "the routine was created but the backend did not confirm it is paused \u2014 check it before its first run",
      jobId,
      route,
      backendProfile,
      createdPaused: false
    };
  }
  return {
    ok: true,
    routine: {
      jobId,
      route,
      backendProfile,
      createdPaused: true,
      job: rowOf(input.pause.answer) ?? minted.job
    }
  };
}

// src/gateway/provisionalCreate.ts
async function createProvisionalRoutine(request) {
  const { route, name, schedule, prompt } = request;
  let addParams;
  let pauseOf;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt });
    pauseOf = (jobId) => buildPauseParams(route, jobId);
  } catch (err) {
    return resolveProvisionalCreate({ route, addAnswer: null, pause: { status: "rejected", message: messageOf(err) } });
  }
  let addAnswer;
  try {
    addAnswer = await requestCronForRoute(route, "cron.manage", addParams, void 0, {
      spawnPriority: "foreground"
    });
  } catch (err) {
    return resolveProvisionalCreate({ route, addAnswer: null, pause: { status: "rejected", message: messageOf(err) } });
  }
  const minted = mintedRoutineFrom(route, addAnswer);
  if (minted.ok === false) return minted;
  let pause;
  try {
    const pauseAnswer = await requestCronForRoute(
      route,
      "cron.manage",
      pauseOf(minted.jobId),
      void 0,
      { spawnPriority: "foreground" }
    );
    pause = { status: "answered", answer: pauseAnswer };
  } catch (err) {
    pause = { status: "rejected", message: messageOf(err) };
  }
  return resolveProvisionalCreate({ route, addAnswer, pause });
}

// src/domain/guidedEnvelope.ts
var GUIDED_ENVELOPE_MARKER = "HERMES_ROUTINE_CONFIG_V1";
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function optionalField(row, keys) {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function singleLine(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}
function orNull(value) {
  return value === "" ? null : value;
}
function field(value) {
  return value === null ? "(none)" : value;
}
function buildGuidedEnvelope(routine, submitted) {
  const jobId = singleLine(routine?.jobId);
  if (!isValidJobId(jobId)) {
    return {
      ok: false,
      reason: "no_job_id",
      message: "This routine has no authoritative job id, so a configuration chat cannot be bound to it \u2014 check the routines list before configuring it"
    };
  }
  const route = routine.route;
  try {
    routeKey(route);
  } catch {
    return {
      ok: false,
      reason: "no_route",
      message: "This routine has no owning profile route, so its chat cannot be routed \u2014 it stays paused"
    };
  }
  const connectionId = singleLine(route?.connectionId);
  const row = asRecord2(routine.job);
  const record = row;
  const fallbackName = singleLine(submitted?.name);
  const fallbackSchedule = singleLine(submitted?.schedule);
  const fallbackPrompt = singleLine(submitted?.prompt);
  const name = singleLine(
    // The row's `name` only. NOT routineTitle's full chain: that falls back
    // to `job_id` when a row carries no name, which would hand the agent a
    // technical id in the `name:` field and hide the title the user typed.
    // With no stored name, the submitted title is the truthful answer.
    routineTitle(record && typeof record.name === "string" ? { name: record.name } : null, fallbackName)
  );
  const schedule = singleLine(rawScheduleOf(row)) || fallbackSchedule;
  const instruction = singleLine(routinePromptOf(row)) || fallbackPrompt;
  const profile = singleLine(routine.backendProfile) || singleLine(route?.targetProfile) || singleLine(route?.profile);
  if (!connectionId || !profile) {
    return {
      ok: false,
      reason: "no_route",
      message: "This routine has no owning profile route, so its chat cannot be routed \u2014 it stays paused"
    };
  }
  return {
    ok: true,
    envelope: {
      jobId,
      connectionId,
      profile,
      name,
      schedule,
      instruction,
      // Delivery and model override exist upstream but are not part of the
      // create form yet: absent is reported as absent, never invented.
      delivery: orNull(
        singleLine(optionalField(record, ["deliver", "delivery", "deliver_to", "deliverTo"]))
      ),
      modelOverride: orNull(
        singleLine(optionalField(record, ["model", "model_override", "modelOverride", "override_model"]))
      ),
      state: "paused"
    }
  };
}
function serializeGuidedEnvelope(envelope) {
  return [
    GUIDED_ENVELOPE_MARKER,
    "You are configuring an existing Hermes Routine.",
    "",
    `job_id: ${envelope.jobId}`,
    `connection_id: ${envelope.connectionId}`,
    `profile: ${envelope.profile}`,
    `name: ${field(singleLine(envelope.name) || null)}`,
    `schedule: ${field(singleLine(envelope.schedule) || null)}`,
    `instruction: ${field(singleLine(envelope.instruction) || null)}`,
    `delivery: ${field(envelope.delivery === null ? null : singleLine(envelope.delivery))}`,
    `model_override: ${field(envelope.modelOverride === null ? null : singleLine(envelope.modelOverride))}`,
    `state: ${envelope.state}`,
    "",
    "Goal:",
    "Clarify the missing execution requirements with the user.",
    "Do not activate this routine.",
    "Do not treat free-form prose as persisted configuration.",
    "When the configuration is complete, produce the structured handoff expected by Hermes Routines.",
    "",
    "Ask only for what this routine needs in order to be executable and safe:",
    "- source, account, repository or channel scope;",
    "- read-only vs mutation authority;",
    "- delivery destination;",
    "- model override, when it is materially useful;",
    "- what to do when there is nothing to report;",
    "- retry and failure expectations;",
    '- thresholds such as "material" or "urgent";',
    "- expected output format;",
    "- any missing schedule or timezone detail.",
    "",
    "Do not force a questionnaire: if what is recorded above is already specific enough to run safely,",
    "go straight to reviewing the configuration instead of asking anyway."
  ].join("\n");
}

// src/gateway/guidedChat.ts
import { host as host2 } from "@hermes/plugin-sdk";
var GUIDED_CHAT_DRAFT = "new";
function failure(reason, message) {
  return { ok: false, reason, message };
}
async function openGuidedRoutineChat(request) {
  let key;
  try {
    key = routeKey(request?.route);
  } catch {
    return failure("no_route", "Guided chat requires a concrete profile route");
  }
  const prompt = typeof request.initialPrompt === "string" ? request.initialPrompt.trim() : "";
  if (!prompt) {
    return failure("blank_prompt", "Guided chat requires an opening prompt");
  }
  if (typeof host2.newChat !== "function") {
    return failure("no_new_chat", "Update Hermes Desktop to start a configuration chat");
  }
  if (typeof host2.composer?.setDraft !== "function") {
    return failure("no_composer", "Update Hermes Desktop to start a configuration chat");
  }
  host2.newChat(request.route);
  const seated = await host2.composer.setDraft(GUIDED_CHAT_DRAFT, prompt);
  if (!seated) {
    return failure("draft_not_claimed", "The new chat did not accept the prompt");
  }
  if (request.autoSubmit !== true) {
    return { ok: true, routeKey: key, autoSubmitted: false };
  }
  const sent = host2.composer.submit(GUIDED_CHAT_DRAFT, prompt);
  return { ok: true, routeKey: key, autoSubmitted: sent };
}

// src/gateway/guidedLaunch.ts
async function launchGuidedConfiguration(request) {
  const routine = request?.routine;
  const jobId = typeof routine?.jobId === "string" ? routine.jobId : "";
  const built = buildGuidedEnvelope(routine, request?.submitted);
  if (built.ok === false) {
    return {
      ok: false,
      reason: "envelope_unavailable",
      message: built.message,
      jobId
    };
  }
  const prompt = serializeGuidedEnvelope(built.envelope);
  const opened = await openGuidedRoutineChat({
    route: routine.route,
    initialPrompt: prompt,
    autoSubmit: request.autoSubmit === true
  });
  if (opened.ok === false) {
    return { ok: false, reason: opened.reason, message: opened.message, jobId };
  }
  return {
    ok: true,
    routeKey: opened.routeKey,
    jobId: built.envelope.jobId,
    autoSubmitted: opened.autoSubmitted,
    prompt
  };
}

// src/views/routinesStyles.ts
var ROUTINES_CSS = [
  "/* Base Root & Reset */",
  ".hr-root {",
  "  box-sizing: border-box;",
  "  display: flex;",
  "  flex-direction: column;",
  "  height: 100%;",
  "  min-height: 0;",
  "  min-width: 0;",
  "  margin: 0;",
  "  padding: 0;",
  "  font-family: inherit;",
  "  color: var(--ui-text-primary, var(--dt-foreground, #161616));",
  "  background: transparent;",
  "  overflow: hidden;",
  "}",
  ".hr-root *, .hr-root *::before, .hr-root *::after { box-sizing: border-box; }",
  ".hr-root :focus-visible { outline: 2px solid var(--dt-composer-ring, var(--ui-accent, #0053fd)); outline-offset: 2px; }",
  "",
  "/* Screen reader only utility */",
  ".hr-sr-only {",
  "  position: absolute;",
  "  width: 1px;",
  "  height: 1px;",
  "  padding: 0;",
  "  margin: -1px;",
  "  overflow: hidden;",
  "  clip: rect(0, 0, 0, 0);",
  "  white-space: nowrap;",
  "  border: 0;",
  "}",
  "",
  "/* Top Header Area (Minimalist) */",
  ".hr-header {",
  "  flex-shrink: 0;",
  "  padding: 4px 0 16px;",
  "  border-bottom: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.06));",
  "  margin-bottom: 18px;",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 6px;",
  "}",
  ".hr-header-top {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: 16px;",
  "}",
  ".hr-header-titles {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 2px;",
  "}",
  ".hr-title {",
  "  font-size: 20px;",
  "  font-weight: 700;",
  "  line-height: 1.2;",
  "  margin: 0;",
  "  color: var(--ui-text-primary, #fff);",
  "  letter-spacing: -0.01em;",
  "}",
  ".hr-sub {",
  "  margin: 0;",
  "  color: var(--ui-text-tertiary, #888);",
  "  font-size: 13px;",
  "  line-height: 1.4;",
  "}",
  ".hr-profile {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: 6px;",
  "  padding: 3px 10px;",
  "  border-radius: 999px;",
  "  font-size: 11px;",
  "  font-weight: 500;",
  "  background: var(--ui-bg-tertiary, rgba(255,255,255,0.04));",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.1));",
  "  color: var(--ui-text-secondary, #ccc);",
  "  margin: 0;",
  "}",
  ".hr-profile strong { font-weight: 600; color: var(--ui-text-primary, #fff); }",
  ".hr-count { margin: 0; color: var(--ui-text-tertiary, #888); font-size: 12px; }",
  "",
  "/* Controls & Toolbar (Minimalist) */",
  ".hr-toolbar {",
  "  display: flex;",
  "  align-items: flex-start;",
  "  justify-content: space-between;",
  "  gap: 16px;",
  "  margin-bottom: 14px;",
  "  flex-wrap: wrap;",
  "}",
  ".hr-search-wrap {",
  "  position: relative;",
  "  display: flex;",
  "  align-items: center;",
  "  flex: 0 1 260px;",
  "  width: 100%;",
  "  max-width: 280px;",
  "}",
  ".hr-filters-col {",
  "  display: flex;",
  "  flex-direction: column;",
  "  align-items: flex-end;",
  "  gap: 4px;",
  "  margin-left: auto;",
  "}",
  ".hr-filters {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: 14px;",
  "}",
  ".hr-filter-chip {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  height: 24px;",
  "  padding: 0 2px 2px;",
  "  border: none;",
  "  border-bottom: 2px solid transparent;",
  "  background: transparent;",
  "  color: var(--ui-text-tertiary, #888);",
  "  font-size: 13px;",
  "  font-weight: 500;",
  "  cursor: pointer;",
  "  transition: all 0.15s ease;",
  "  border-radius: 0;",
  "}",
  ".hr-filter-chip:hover {",
  "  background: transparent;",
  "  color: var(--ui-text-primary, #fff);",
  "}",
  '.hr-filter-chip[aria-current="true"], .hr-filter-chip-current {',
  "  border: none;",
  "  border-bottom: 2px solid var(--dt-composer-ring, var(--ui-accent, #0053fd));",
  "  background: transparent;",
  "  color: var(--ui-text-primary, #fff);",
  "  font-weight: 600;",
  "}",
  ".hr-count-right {",
  "  font-size: 11px;",
  "  color: var(--ui-text-quaternary, #666);",
  "  text-align: right;",
  "  padding-right: 2px;",
  "  user-select: none;",
  "}",
  ".hr-search-input {",
  "  width: 100%;",
  "  height: 26px;",
  "  padding: 0 24px 0 10px;",
  "  border-radius: 6px;",
  "  font-size: 12px;",
  "  background: var(--ui-bg-card, rgba(255,255,255,0.03));",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.1));",
  "  color: var(--ui-text-primary, #fff);",
  "  outline: none;",
  "  transition: border-color 0.15s;",
  "}",
  ".hr-search-input:focus {",
  "  border-color: var(--dt-composer-ring, var(--ui-accent, #0053fd));",
  "}",
  ".hr-search-clear {",
  "  position: absolute;",
  "  right: 6px;",
  "  width: 16px;",
  "  height: 16px;",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  border: none;",
  "  background: transparent;",
  "  color: var(--ui-text-quaternary, #666);",
  "  cursor: pointer;",
  "  font-size: 10px;",
  "}",
  ".hr-search-clear:hover { color: var(--ui-text-primary, #fff); }",
  "",
  "/* Master-Detail Split Workspace */",
  ".hr-workspace {",
  "  display: flex;",
  "  flex: 1 1 0;",
  "  min-height: 0;",
  "  min-width: 0;",
  "  overflow: hidden;",
  "}",
  ".hr-feed-column {",
  "  display: flex;",
  "  flex-direction: column;",
  "  flex: 1 1 0;",
  "  min-height: 0;",
  "  min-width: 0;",
  "  overflow-y: auto;",
  "  padding: 16px 24px 32px;",
  "}",
  ".hr-feed-contained {",
  "  max-width: 860px;",
  "  margin: 0 auto;",
  "  width: 100%;",
  "}",
  ".hr-list {",
  "  list-style: none;",
  "  margin: 0;",
  "  padding: 0;",
  "  display: flex;",
  "  flex-direction: column;",
  "}",
  "",
  "/* Minimalist Row Item (Matching hermes-crew) */",
  ".hr-row {",
  "  display: flex;",
  "  flex-direction: column;",
  "  padding: 14px 6px;",
  "  border-bottom: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.07));",
  "  transition: background 0.15s ease;",
  "  position: relative;",
  "  cursor: pointer;",
  "  background: transparent;",
  "}",
  ".hr-row:hover {",
  "  background: color-mix(in srgb, var(--chrome-action-hover, rgba(255, 255, 255, 0.04)) 40%, transparent);",
  "  border-radius: 6px;",
  "}",
  ".hr-row-top {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: 12px;",
  "}",
  ".hr-row-left {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: 10px;",
  "  min-width: 0;",
  "  flex: 1 1 auto;",
  "}",
  ".hr-status-indicator {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 18px;",
  "  height: 18px;",
  "  flex-shrink: 0;",
  "}",
  ".hr-status-svg { flex-shrink: 0; }",
  ".hr-status-svg-active { color: var(--ui-green, #34d399); }",
  ".hr-status-svg-paused { color: var(--ui-text-tertiary, #888); }",
  ".hr-status-svg-failed { color: var(--ui-red, #f87171); }",
  ".hr-status-svg-unknown { color: var(--ui-text-tertiary, #888); }",
  ".hr-status-failed { color: var(--ui-red, #f87171); }",
  ".hr-status-unknown { color: var(--ui-text-tertiary, #888); }",
  ".hr-row-title {",
  "  font-size: 14px;",
  "  font-weight: 600;",
  "  color: var(--ui-text-primary, #fff);",
  "  cursor: pointer;",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "  white-space: nowrap;",
  "}",
  ".hr-row-title:hover { color: var(--ui-accent, #4a84fe); }",
  ".hr-row-actions {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: 6px;",
  "  flex-shrink: 0;",
  "}",
  "",
  "/* Icon-Only Action Buttons */",
  ".hr-icon-btn {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 24px;",
  "  height: 24px;",
  "  border: none;",
  "  background: transparent;",
  "  color: var(--ui-text-tertiary, #888);",
  "  opacity: 0.6;",
  "  border-radius: 4px;",
  "  cursor: pointer;",
  "  font-size: 0;",
  "  line-height: 0;",
  "  position: relative;",
  "  transition: color 0.15s ease, opacity 0.15s ease;",
  "  padding: 0;",
  "}",
  ".hr-icon-btn:hover {",
  "  color: var(--ui-text-primary, #fff);",
  "  opacity: 1;",
  "}",
  ".hr-icon-btn:disabled { opacity: 0.25; cursor: not-allowed; }",
  ".hr-icon-btn::before {",
  '  content: "";',
  "  display: block;",
  "  width: 13px;",
  "  height: 13px;",
  "  background-color: currentColor;",
  "  -webkit-mask-size: contain;",
  "  mask-size: contain;",
  "  -webkit-mask-repeat: no-repeat;",
  "  mask-repeat: no-repeat;",
  "  -webkit-mask-position: center;",
  "  mask-position: center;",
  "}",
  ".hr-icon-btn-pause::before {",
  `  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M6 4h4v16H6V4zm8 0h4v16h-4V4z'/%3E%3C/svg%3E");`,
  `  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M6 4h4v16H6V4zm8 0h4v16h-4V4z'/%3E%3C/svg%3E");`,
  "}",
  ".hr-icon-btn-resume::before {",
  `  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M8 5v14l11-7z'/%3E%3C/svg%3E");`,
  `  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M8 5v14l11-7z'/%3E%3C/svg%3E");`,
  "}",
  ".hr-icon-btn-edit::before {",
  `  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/%3E%3C/svg%3E");`,
  `  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/%3E%3C/svg%3E");`,
  "}",
  ".hr-icon-btn-active { color: var(--ui-accent, #4a84fe) !important; }",
  "",
  "/* Subtitle & In-Place Details */",
  ".hr-row-sub {",
  "  margin-left: 28px;",
  "  margin-top: 3px;",
  "}",
  ".hr-row-subtitle {",
  "  font-size: 12px;",
  "  line-height: 1.4;",
  "  color: var(--ui-text-tertiary, #888);",
  "  display: flex;",
  "  align-items: center;",
  "  flex-wrap: wrap;",
  "}",
  ".hr-sub-paused { color: var(--ui-text-tertiary, #888); }",
  ".hr-sub-schedule { color: var(--ui-text-tertiary, #999); }",
  ".hr-sub-sep { margin: 0 6px; color: var(--ui-stroke-tertiary, rgba(255,255,255,0.2)); font-size: 11px; }",
  ".hr-sub-next { color: var(--ui-text-tertiary, #888); }",
  "",
  "/* Expanded In-Place Details (media_1790206808519.png) */",
  ".hr-details {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 4px;",
  "  margin-top: 8px;",
  "  padding-top: 6px;",
  "}",
  ".hr-detail {",
  "  display: grid;",
  "  grid-template-columns: 110px 1fr;",
  "  gap: 12px;",
  "  font-size: 12px;",
  "  line-height: 1.5;",
  "  align-items: baseline;",
  "}",
  ".hr-detail-label { color: var(--ui-text-tertiary, #888); }",
  ".hr-detail-value { color: var(--ui-text-secondary, #ccc); }",
  ".hr-next { font-weight: 500; color: var(--ui-text-primary, #fff); }",
  ".hr-date { color: var(--ui-text-tertiary, #888); font-weight: 400; }",
  ".hr-result { font-size: 12px; font-weight: 500; }",
  ".hr-result-success { color: var(--ui-green, #34d399); }",
  ".hr-result-error { color: var(--ui-red, #f87171); }",
  ".hr-result-neutral { color: var(--ui-text-secondary, #ccc); }",
  "",
  "/* Lateral Inspector (Minimalist) */",
  ".hr-inspector {",
  "  display: flex;",
  "  flex-direction: column;",
  "  width: 26rem;",
  "  flex-shrink: 0;",
  "  min-height: 0;",
  "  border-left: 1px solid var(--ui-stroke-tertiary, var(--dt-border, rgba(255, 255, 255, 0.08)));",
  "  background: var(--ui-sidebar-surface-background, var(--ui-bg-elevated, var(--dt-card, #161618)));",
  "}",
  ".hr-inspector-header {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: 10px;",
  "  padding: 14px 18px;",
  "  border-bottom: 1px solid var(--ui-stroke-tertiary, var(--dt-border, rgba(255, 255, 255, 0.06)));",
  "  flex-shrink: 0;",
  "}",
  ".hr-btn-back {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: 6px;",
  "  white-space: nowrap;",
  "  border: none;",
  "  background: transparent;",
  "  color: var(--ui-text-tertiary, #888);",
  "  font-size: 12px;",
  "  cursor: pointer;",
  "  padding: 4px 6px;",
  "  border-radius: 4px;",
  "  line-height: 1;",
  "}",
  ".hr-btn-back svg { display: inline-block; flex-shrink: 0; margin: 0; }",
  ".hr-btn-back:hover { color: var(--ui-text-primary, #fff); background: var(--chrome-action-hover, rgba(255,255,255,0.06)); }",
  ".hr-inspector-header-badges { display: flex; align-items: center; gap: 8px; }",
  ".hr-badge-subtle {",
  "  font-size: 10px;",
  "  color: var(--ui-text-tertiary, #888);",
  "  background: var(--ui-bg-quinary, rgba(255,255,255,0.05));",
  "  padding: 1px 6px;",
  "  border-radius: 4px;",
  "}",
  ".hr-inspector-body {",
  "  flex: 1 1 0;",
  "  min-height: 0;",
  "  overflow-y: auto;",
  "  padding: 18px;",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 18px;",
  "}",
  ".hr-inspector-ident { display: flex; flex-direction: column; gap: 4px; }",
  ".hr-inspector-title { font-size: 16px; font-weight: 700; margin: 0; color: var(--ui-text-primary, #fff); word-break: break-word; }",
  ".hr-inspector-id-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }",
  ".hr-inspector-id-label { color: var(--ui-text-tertiary, #888); }",
  ".hr-inspector-id-code { font-family: var(--dt-font-mono, monospace); font-size: 10px; color: var(--ui-text-secondary, #ccc); background: var(--ui-bg-quinary, rgba(255,255,255,0.04)); padding: 1px 5px; border-radius: 4px; }",
  ".hr-btn-mini { padding: 1px 6px; font-size: 10px; border-radius: 4px; border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.1)); background: transparent; color: var(--ui-text-tertiary, #888); cursor: pointer; }",
  ".hr-btn-mini:hover { color: var(--ui-text-primary, #fff); }",
  ".hr-inspector-section { display: flex; flex-direction: column; gap: 8px; }",
  ".hr-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ui-text-tertiary, #888); margin: 0; }",
  ".hr-kv-grid { display: grid; grid-template-columns: 86px 1fr; gap: 6px 10px; font-size: 12px; align-items: baseline; }",
  ".hr-kv-label { color: var(--ui-text-tertiary, #888); font-size: 11px; }",
  ".hr-kv-value { color: var(--ui-text-secondary, #ddd); overflow-wrap: anywhere; }",
  ".hr-kv-highlight { font-weight: 600; color: var(--ui-text-primary, #fff); }",
  ".hr-code-inline { font-family: var(--dt-font-mono, monospace); font-size: 11px; }",
  ".hr-tech-entry { display: flex; flex-direction: column; gap: 4px; }",
  ".hr-tech-entry-head { display: flex; align-items: center; justify-content: space-between; }",
  ".hr-code-block { font-family: var(--dt-font-mono, monospace); font-size: 11px; padding: 8px 10px; border-radius: 6px; background: var(--ui-bg-quinary, rgba(0,0,0,0.2)); border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.06)); color: var(--ui-text-secondary, #ccc); overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }",
  ".hr-inspector-actions-section { margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.06)); }",
  // Run outcome, read-only: a separator plus its own stack, so the block
  // never reads as another editable field of the composer above it.
  ".hr-inspector-last-run {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 4px;",
  "  margin-top: 6px;",
  "  padding-top: 14px;",
  "  border-top: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.06));",
  "}",
  ".hr-inspector-last-run .hr-create-section-label { margin-bottom: 6px; }",
  ".hr-inspector-issue { white-space: pre-wrap; overflow-wrap: anywhere; }",
  ".hr-inspector-actions-bar { display: flex; gap: 8px; }",
  ".hr-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--ui-text-primary, #fff); background: var(--ui-bg-card, #222); border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.12)); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; }",
  ".hr-btn:hover { background: var(--chrome-action-hover, rgba(255,255,255,0.08)); }",
  ".hr-btn:disabled { opacity: 0.5; cursor: not-allowed; }",
  ".hr-btn-pause { border-color: color-mix(in srgb, var(--ui-yellow, #fbbf24) 40%, transparent); color: var(--ui-yellow, #fbbf24); background: color-mix(in srgb, var(--ui-yellow, #fbbf24) 8%, transparent); }",
  ".hr-btn-resume { border-color: color-mix(in srgb, var(--ui-green, #34d399) 40%, transparent); color: var(--ui-green, #34d399); background: color-mix(in srgb, var(--ui-green, #34d399) 8%, transparent); }",
  "",
  "/* States (Loading, Error, Empty) */",
  ".hr-state { border: 1px dashed var(--ui-stroke-tertiary, rgba(255,255,255,0.12)); border-radius: 8px; padding: 32px 20px; margin: 16px 0; text-align: center; }",
  ".hr-state-title { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--ui-text-primary, #fff); }",
  ".hr-state-text { margin: 0; color: var(--ui-text-tertiary, #888); font-size: 13px; line-height: 1.5; }",
  ".hr-spinner { display: inline-block; width: 20px; height: 20px; border-radius: 999px; border: 2px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.2)); border-top-color: var(--dt-composer-ring, var(--ui-accent, #0053fd)); animation: hr-spin 0.8s linear infinite; margin-bottom: 10px; }",
  "@keyframes hr-spin { to { transform: rotate(360deg); } }",
  "@media (prefers-reduced-motion: reduce) { .hr-spinner { animation: none; } }",
  ".hr-error { border: 1px solid color-mix(in srgb, var(--ui-red, #f87171) 40%, transparent); border-left-width: 4px; border-radius: 8px; padding: 14px 16px; background: var(--ui-bg-elevated, rgba(255,255,255,0.02)); color: var(--ui-text-primary, #fff); margin: 16px 0; }",
  ".hr-error strong { color: var(--ui-red, #f87171); }",
  ".hr-stale { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.1)); border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; background: var(--ui-bg-tertiary, rgba(255,255,255,0.02)); color: var(--ui-text-secondary, #ccc); font-size: 12px; }",
  ".hr-muted { color: var(--ui-text-tertiary, #888); font-size: 13px; line-height: 1.4; }",
  ".hr-status { margin-top: 10px; color: var(--ui-text-tertiary, #888); font-size: 12px; }",
  // A status line that only restates what the page already shows (the
  // toolbar count, the empty state) keeps its role, text and focus target
  // but takes no visual footprint. Declared after .hr-status on purpose:
  // same specificity, so the clip wins over the status line's own spacing.
  ".hr-status.hr-sr-only { margin: -1px; }",
  "",
  "/* New Routine Trigger Button */",
  ".hr-btn-new {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 32px;",
  "  height: 32px;",
  "  border-radius: 6px;",
  "  border: none;",
  "  background: transparent;",
  "  color: var(--ui-text-tertiary, #888);",
  "  cursor: pointer;",
  "  transition: color 0.15s ease, transform 0.15s ease;",
  "  padding: 0;",
  "}",
  ".hr-btn-new:hover {",
  "  color: var(--ui-text-primary, #fff);",
  "  background: transparent;",
  "  transform: scale(1.1);",
  "}",
  ".hr-btn-new:active {",
  "  transform: scale(0.96);",
  "}",
  "",
  "/* Create Routine Composer Panel */",
  ".hr-create-title {",
  "  font-size: 16px;",
  "  font-weight: 700;",
  "  color: var(--ui-text-primary, #fff);",
  "  margin: 0 0 16px 0;",
  "}",
  ".hr-create-active-card {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: 12px;",
  "  padding: 4px 0 16px 0;",
  "  background: transparent;",
  "  border: none;",
  "  margin-bottom: 14px;",
  "}",
  ".hr-create-active-info {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 2px;",
  "}",
  ".hr-create-active-title {",
  "  font-size: 14px;",
  "  font-weight: 600;",
  "  color: var(--ui-text-primary, #fff);",
  "}",
  ".hr-create-active-subtitle {",
  "  font-size: 12px;",
  "  color: var(--ui-text-tertiary, #888);",
  "}",
  ".hr-switch-pill {",
  "  width: 40px;",
  "  height: 22px;",
  "  border-radius: 11px;",
  "  border: 1px solid color-mix(in srgb, var(--dt-foreground, var(--ui-text-primary, #fff)) 18%, transparent);",
  "  background: color-mix(in srgb, var(--dt-background, #121212) 58%, var(--dt-input, var(--ui-stroke-primary, rgba(255, 255, 255, 0.2))));",
  "  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dt-foreground, #fff) 8%, transparent);",
  "  cursor: pointer;",
  "  position: relative;",
  "  padding: 2px;",
  "  display: inline-flex;",
  "  align-items: center;",
  "  transition: background 0.2s ease, border-color 0.2s ease;",
  "  flex-shrink: 0;",
  "  outline: none;",
  "}",
  ".hr-switch-pill:focus-visible {",
  "  outline: 2px solid var(--dt-composer-ring, var(--ui-accent, currentColor));",
  "  outline-offset: 2px;",
  "}",
  ".hr-switch-active {",
  "  background: var(--dt-primary, var(--ui-accent, #ea580c));",
  "  border-color: transparent;",
  "  box-shadow: none;",
  "}",
  ".hr-switch-thumb {",
  "  width: 16px;",
  "  height: 16px;",
  "  border-radius: 50%;",
  "  background: var(--dt-foreground, var(--ui-text-primary, #fff));",
  "  display: block;",
  "  transition: transform 0.2s ease, background 0.2s ease;",
  "  transform: translateX(1px);",
  "  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);",
  "}",
  ".hr-switch-active .hr-switch-thumb {",
  "  background: var(--dt-background, var(--ui-bg-chrome, #121212));",
  "  transform: translateX(19px);",
  "}",
  ".hr-switch-pill:disabled {",
  "  opacity: 0.65;",
  "  cursor: not-allowed;",
  "}",
  "/* Field labels */",
  ".hr-field-label, .hr-select-label {",
  "  display: block;",
  "  font-size: 12px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-secondary, var(--dt-muted-foreground, #a1a1aa));",
  "  margin-bottom: 6px;",
  "  line-height: 1.2;",
  "}",
  ".hr-create-field {",
  "  margin-bottom: 14px;",
  "}",
  ".hr-create-input, .hr-create-textarea {",
  "  width: 100%;",
  "  background: var(--ui-bg-card, color-mix(in srgb, var(--dt-card, #1c1917) 60%, transparent));",
  "  border: 1px solid var(--ui-stroke-tertiary, var(--dt-border, rgba(255, 255, 255, 0.12)));",
  "  border-radius: 8px;",
  "  padding: 10px 14px;",
  "  font-size: 14px;",
  "  color: var(--ui-text-primary, var(--dt-foreground, #fff));",
  "  font-family: inherit;",
  "  outline: none;",
  "  transition: border-color 0.15s ease, background 0.15s ease;",
  "}",
  ".hr-create-input:hover, .hr-create-textarea:hover {",
  "  border-color: var(--ui-stroke-secondary, rgba(255, 255, 255, 0.25));",
  "}",
  ".hr-create-input:focus, .hr-create-textarea:focus {",
  "  border-color: var(--dt-composer-ring, var(--dt-primary, var(--ui-accent, currentColor)));",
  "}",
  ".hr-create-input::placeholder, .hr-create-textarea::placeholder {",
  "  color: var(--ui-text-tertiary, var(--dt-muted-foreground, rgba(255, 255, 255, 0.4)));",
  "}",
  ".hr-create-input:disabled, .hr-create-textarea:disabled {",
  "  opacity: 0.75;",
  "  cursor: not-allowed;",
  "}",
  ".hr-create-when-section {",
  "  margin-top: 14px;",
  "  margin-bottom: 16px;",
  "}",
  ".hr-create-section-label {",
  "  font-size: 11px;",
  "  font-weight: 600;",
  "  letter-spacing: 0.06em;",
  "  text-transform: uppercase;",
  "  color: var(--ui-text-tertiary, var(--dt-muted-foreground, #888));",
  "  margin-bottom: 12px;",
  "}",
  "",
  "/* Custom Select Field */",
  ".hr-select-container {",
  "  position: relative;",
  "  width: 100%;",
  "  margin-bottom: 12px;",
  "}",
  ".hr-select-trigger {",
  "  position: relative;",
  "  width: 100%;",
  "  background: var(--ui-bg-card, color-mix(in srgb, var(--dt-card, #1c1917) 60%, transparent));",
  "  border: 1px solid var(--ui-stroke-tertiary, var(--dt-border, rgba(255, 255, 255, 0.14)));",
  "  border-radius: 8px;",
  "  padding: 9px 12px;",
  "  display: flex;",
  "  justify-content: space-between;",
  "  align-items: center;",
  "  cursor: pointer;",
  "  user-select: none;",
  "  transition: border-color 0.15s ease, background 0.15s ease;",
  "  outline: none;",
  "  min-height: 38px;",
  "}",
  ".hr-select-trigger:hover {",
  "  border-color: var(--ui-stroke-secondary, rgba(255, 255, 255, 0.25));",
  "  background: var(--ui-bg-tertiary, color-mix(in srgb, var(--dt-card, #1c1917) 80%, transparent));",
  "}",
  ".hr-select-is-open .hr-select-trigger {",
  "  border-color: var(--dt-composer-ring, var(--dt-primary, var(--ui-accent, currentColor)));",
  "}",
  ".hr-select-value {",
  "  font-size: 13px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-primary, var(--dt-foreground, #fff));",
  "}",
  ".hr-select-arrow {",
  "  color: var(--ui-text-tertiary, var(--dt-muted-foreground, #888));",
  "  display: flex;",
  "  align-items: center;",
  "  margin-left: 8px;",
  "  transition: transform 0.15s ease;",
  "}",
  ".hr-select-is-open .hr-select-arrow {",
  "  transform: rotate(180deg);",
  "}",
  ".hr-select-menu {",
  "  position: absolute;",
  "  top: calc(100% + 4px);",
  "  left: 0;",
  "  right: 0;",
  "  max-height: 220px;",
  "  overflow-y: auto;",
  "  background: var(--dt-popover, var(--ui-bg-elevated, #181412));",
  "  border: 1px solid var(--dt-border, var(--ui-stroke-secondary, rgba(255, 255, 255, 0.14)));",
  "  border-radius: 8px;",
  "  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);",
  "  z-index: 1000;",
  "  padding: 4px;",
  "}",
  ".hr-select-option {",
  "  padding: 8px 12px;",
  "  font-size: 13px;",
  "  color: var(--dt-popover-foreground, var(--ui-text-primary, #fff));",
  "  border-radius: 6px;",
  "  cursor: pointer;",
  "  transition: background 0.12s ease, color 0.12s ease;",
  "}",
  ".hr-select-option:hover {",
  "  background: var(--chrome-action-hover, var(--ui-control-hover-background, rgba(255, 255, 255, 0.08)));",
  "  color: var(--ui-text-primary, #fff);",
  "}",
  ".hr-select-option-active {",
  "  background: color-mix(in srgb, var(--dt-primary, var(--ui-accent, #ea580c)) 20%, transparent);",
  "  color: var(--dt-primary, var(--ui-accent, #ea580c));",
  "  font-weight: 600;",
  "}",
  ".hr-create-sub-row {",
  "  width: 100%;",
  "  margin-top: 10px;",
  "}",
  ".hr-create-sub-split {",
  "  display: flex;",
  "  gap: 10px;",
  "  margin-top: 10px;",
  "}",
  ".hr-create-sub-split .hr-select-container {",
  "  flex: 1;",
  "  margin-bottom: 0;",
  "}",
  ".hr-create-preview-sentence {",
  "  font-size: 12px;",
  "  color: var(--ui-text-tertiary, var(--dt-muted-foreground, #888));",
  "  margin-top: 10px;",
  "  margin-bottom: 16px;",
  "}",
  ".hr-create-error {",
  "  background: color-mix(in srgb, var(--dt-destructive, var(--ui-red, #f87171)) 12%, transparent);",
  "  border: 1px solid color-mix(in srgb, var(--dt-destructive, var(--ui-red, #f87171)) 35%, transparent);",
  "  color: var(--dt-destructive, var(--ui-red, #f87171));",
  "  border-radius: 6px;",
  "  padding: 8px 12px;",
  "  font-size: 12px;",
  "  margin-bottom: 12px;",
  "}",
  // ── proposal review (issue #64) ──
  // A real table, so the comparison keeps its row/column semantics for
  // assistive tech. Changed rows are marked with a word, never with color
  // alone; long values scroll inside their own cell instead of being
  // truncated, so the full proposed text stays reachable.
  ".hr-review { display: flex; flex-direction: column; gap: 10px; }",
  ".hr-review-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }",
  ".hr-review-table th, .hr-review-table td {",
  "  text-align: left;",
  "  vertical-align: top;",
  "  padding: 6px 8px;",
  "  border-bottom: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.08));",
  "  overflow-wrap: anywhere;",
  "}",
  ".hr-review-table thead th {",
  "  font-size: 10px;",
  "  text-transform: uppercase;",
  "  letter-spacing: 0.06em;",
  "  color: var(--ui-text-tertiary, #888);",
  "  border-bottom-color: var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.16));",
  "}",
  ".hr-review-table thead th:first-child, .hr-review-table tbody th { width: 30%; }",
  ".hr-review-table tbody th { font-weight: 600; color: var(--ui-text-secondary, #ddd); }",
  ".hr-review-cell { color: var(--ui-text-secondary, #ddd); }",
  ".hr-review-cell-text { display: block; max-height: 9.5em; overflow: auto; }",
  ".hr-review-proposed { color: var(--ui-text-primary, #fff); }",
  ".hr-review-row-changed .hr-review-cell { font-weight: 600; }",
  ".hr-review-flag {",
  "  display: inline-block;",
  "  margin-left: 6px;",
  "  padding: 1px 4px;",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.22));",
  "  border-radius: 4px;",
  "  font-size: 9px;",
  "  font-weight: 700;",
  "  text-transform: uppercase;",
  "  letter-spacing: 0.05em;",
  "  color: var(--ui-text-primary, #fff);",
  "}",
  ".hr-review-readonly { margin-left: 6px; font-size: 9px; color: var(--ui-text-tertiary, #888); }",
  ".hr-review-note {",
  "  border-left: 2px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.22));",
  "  padding: 2px 0 2px 8px;",
  "}",
  ".hr-review-note-label {",
  "  font-size: 10px;",
  "  text-transform: uppercase;",
  "  letter-spacing: 0.06em;",
  "  color: var(--ui-text-tertiary, #888);",
  "}",
  ".hr-review-note-text {",
  "  margin: 4px 0 0;",
  "  font-size: 12px;",
  "  color: var(--ui-text-secondary, #ccc);",
  "  white-space: pre-wrap;",
  "  overflow-wrap: anywhere;",
  "}",
  ".hr-review-outcomes { display: flex; flex-direction: column; gap: 4px; }",
  ".hr-create-actions {",
  "  display: flex;",
  "  gap: 10px;",
  "  margin-top: 18px;",
  "}",
  ".hr-btn-back-routines {",
  "  flex: 1;",
  "  height: 38px;",
  "  border-radius: 8px;",
  "  font-size: 13px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-secondary, #ccc);",
  "  background: transparent;",
  "  border: 1px solid var(--ui-stroke-tertiary, var(--dt-border, rgba(255, 255, 255, 0.12)));",
  "  cursor: pointer;",
  "  transition: all 0.15s ease;",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "}",
  ".hr-btn-back-routines:hover {",
  "  background: var(--chrome-action-hover, rgba(255, 255, 255, 0.06));",
  "  color: var(--ui-text-primary, #fff);",
  "  border-color: var(--ui-stroke-secondary, rgba(255, 255, 255, 0.22));",
  "}",
  ".hr-btn-create-submit {",
  "  flex: 1;",
  "  height: 38px;",
  "  border-radius: 8px;",
  "  font-size: 13px;",
  "  font-weight: 600;",
  "  color: var(--dt-primary-foreground, #fff);",
  "  background: var(--dt-primary, var(--ui-accent, #ea580c));",
  "  border: 1px solid transparent;",
  "  cursor: pointer;",
  "  transition: all 0.15s ease;",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "}",
  ".hr-btn-create-submit:hover:not(:disabled) {",
  "  opacity: 0.92;",
  "  filter: brightness(1.08);",
  "}",
  ".hr-btn-create-submit:disabled {",
  "  background: var(--ui-bg-quaternary, color-mix(in srgb, var(--dt-foreground, #fff) 8%, transparent));",
  "  color: var(--ui-text-quaternary, var(--ui-text-tertiary, rgba(255, 255, 255, 0.35)));",
  "  border-color: var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.08));",
  "  cursor: not-allowed;",
  "  filter: none;",
  "  opacity: 0.6;",
  "}",
  "",
  "/* Responsive adaptiveness */",
  "@media (max-width: 820px) {",
  "  .hr-workspace { flex-direction: column; }",
  "  .hr-inspector { width: 100%; border-left: none; border-top: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.08)); }",
  "  .hr-feed-column { padding: 12px; }",
  "}"
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
      className: "hr-filter-chip" + (filter === entry.value ? " hr-filter-chip-current" : ""),
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

// src/views/RoutineDetails.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function RoutineDetails({
  job
}) {
  const schedule = humanScheduleOf(job) || "\u2014";
  const nextRun = routineActive(job) ? runDistanceOf(nextRunIso(job)) : null;
  const lastRun = runDistanceOf(lastRunIso(job));
  const result = lastResultOf(job);
  return /* @__PURE__ */ jsxs("div", { className: "hr-details", children: [
    /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Schedule" }),
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-value", children: schedule })
    ] }),
    nextRun !== null ? /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Next run" }),
      /* @__PURE__ */ jsx2(RunWhen, { distance: nextRun, strong: true })
    ] }) : null,
    lastRun !== null ? /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Last run" }),
      /* @__PURE__ */ jsx2(RunWhen, { distance: lastRun })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "hr-detail", children: [
      /* @__PURE__ */ jsx2("span", { className: "hr-detail-label", children: "Last result" }),
      /* @__PURE__ */ jsx2(ResultTone, { kind: result.kind, text: result.text })
    ] })
  ] });
}
function RunWhen({
  distance,
  strong
}) {
  return /* @__PURE__ */ jsxs("span", { className: strong ? "hr-detail-value hr-next" : "hr-detail-value", children: [
    distance.text,
    distance.date !== null ? /* @__PURE__ */ jsxs("span", { className: "hr-date", children: [
      " (",
      distance.date,
      ")"
    ] }) : null
  ] });
}
function ResultTone({
  kind,
  text
}) {
  return /* @__PURE__ */ jsxs("span", { className: `hr-result hr-result-${kind}`, children: [
    kind === "success" ? /* @__PURE__ */ jsx2("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx2("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z" }) }) : kind === "error" ? /* @__PURE__ */ jsx2("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx2("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z" }) }) : null,
    text
  ] });
}

// src/views/RoutineStatus.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function statusOf(job) {
  const health = routineHealthOf(job);
  switch (health) {
    case "completed":
      return { label: "Completed", tone: "completed" };
    case "failed":
      if (routineErrored(job)) return { label: "Error", tone: "error" };
      return { label: "Active \u2014 last run failed", tone: "failed" };
    case "paused":
      if (isFailedStatus(job)) return { label: "Paused \u2014 last run failed", tone: "paused" };
      return { label: "Paused", tone: "paused" };
    case "unknown":
      return { label: "Active", tone: "unknown" };
    case "healthy":
      return { label: "Active", tone: "active" };
  }
}
function RoutineStatus({ job }) {
  const { label, tone } = statusOf(job);
  return /* @__PURE__ */ jsxs2("span", { className: `hr-status-indicator hr-status-${tone}`, title: label, "aria-label": label, children: [
    tone === "active" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-active", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("polyline", { points: "8 4.2 8 8 10.8 8" })
    ] }) : tone === "paused" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-paused", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "6.5", y1: "5.5", x2: "6.5", y2: "10.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "9.5", y1: "5.5", x2: "9.5", y2: "10.5" })
    ] }) : tone === "failed" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-failed", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "5.5", y1: "5.5", x2: "10.5", y2: "10.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "10.5", y1: "5.5", x2: "5.5", y2: "10.5" })
    ] }) : tone === "unknown" ? /* @__PURE__ */ jsx3("svg", { className: "hr-status-svg hr-status-svg-unknown", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }) }) : /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "2", fill: "currentColor" })
    ] }),
    /* @__PURE__ */ jsx3("span", { className: "hr-sr-only", children: label })
  ] });
}

// src/views/RoutineCard.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function RoutineCard(props) {
  const { job, fallback, expanded, inspected = false, busy, disabled } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const { tone } = statusOf(job);
  const schedule = humanScheduleOf(job) || "\u2014";
  const nextIso = nextRunIso(job);
  const nextDistance = nextIso ? formatWhen(nextIso) : null;
  const controlsId = `hr-details-${fallback.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  return /* @__PURE__ */ jsxs3(
    "li",
    {
      className: `hr-row hr-row-${tone}${expanded ? " hr-row-expanded" : ""}${inspected ? " hr-row-selected" : ""}`,
      onClick: (e) => {
        if (e.target.closest("button, .hr-row-actions")) return;
        props.onToggleExpand();
      },
      style: { cursor: "pointer" },
      children: [
        /* @__PURE__ */ jsxs3("div", { className: "hr-row-top", children: [
          /* @__PURE__ */ jsxs3("div", { className: "hr-row-left", children: [
            /* @__PURE__ */ jsx4(RoutineStatus, { job }),
            /* @__PURE__ */ jsx4(
              "span",
              {
                className: "hr-row-title",
                role: "button",
                tabIndex: 0,
                onClick: (e) => {
                  e.stopPropagation();
                  props.onToggleExpand();
                },
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onToggleExpand();
                  }
                },
                children: title
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "hr-row-actions", children: [
            !terminal ? paused ? /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                className: "hr-icon-btn hr-icon-btn-resume",
                disabled: disabled || busy,
                onClick: (e) => {
                  e.stopPropagation();
                  props.onResume();
                },
                "aria-label": `Resume ${title}`,
                title: "Resume routine",
                children: "Resume"
              }
            ) : /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                className: "hr-icon-btn hr-icon-btn-pause",
                disabled: disabled || busy,
                onClick: (e) => {
                  e.stopPropagation();
                  props.onPause();
                },
                "aria-label": `Pause ${title}`,
                title: "Pause routine",
                children: "Pause"
              }
            ) : null,
            /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                className: `hr-icon-btn hr-icon-btn-edit${inspected ? " hr-icon-btn-active" : ""}`,
                "aria-expanded": expanded,
                "aria-controls": controlsId,
                "aria-label": `${inspected ? "Close inspector" : "Edit"} details for ${title}`,
                onClick: (e) => {
                  e.stopPropagation();
                  if (props.onEdit) props.onEdit();
                  else props.onToggleExpand();
                },
                title: "Edit routine",
                children: "Edit"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "hr-row-sub", children: !expanded ? /* @__PURE__ */ jsx4("div", { className: "hr-row-subtitle", children: paused ? /* @__PURE__ */ jsx4("span", { className: "hr-sub-paused", children: "Paused" }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
          /* @__PURE__ */ jsx4("span", { className: "hr-sub-schedule", children: schedule }),
          nextDistance ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx4("span", { className: "hr-sub-sep", children: "|" }),
            /* @__PURE__ */ jsxs3("span", { className: "hr-sub-next", children: [
              "Next in ",
              nextDistance
            ] })
          ] }) : null
        ] }) }) : /* @__PURE__ */ jsx4("div", { id: controlsId, className: "hr-row-details", children: /* @__PURE__ */ jsx4(RoutineDetails, { job, fallback }) }) })
      ]
    }
  );
}

// src/views/RoutineList.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function RoutineList({
  jobs,
  pending,
  locked,
  selectedId,
  onSelect,
  inspectedId,
  onInspect,
  onPause,
  onResume
}) {
  const [expandedNames, setExpandedNames] = useState(() => /* @__PURE__ */ new Set());
  const activeInspectorId = inspectedId !== void 0 ? inspectedId : selectedId ?? null;
  const handleInspect = onInspect ?? onSelect;
  useEffect(() => {
    if (activeInspectorId === null) return;
    const stillThere = jobs.some(
      (job, index) => routineKey(job, `routine ${index + 1}`) === activeInspectorId
    );
    if (!stillThere && handleInspect) {
      handleInspect(null);
    }
  }, [jobs, activeInspectorId, handleInspect]);
  function handleToggleExpand(key) {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }
  function handleEdit(key) {
    if (handleInspect) {
      handleInspect(activeInspectorId === key ? null : key);
    }
  }
  return /* @__PURE__ */ jsx5("ul", { className: "hr-list", "aria-label": "Routines", children: jobs.map((job, index) => {
    const fallback = `routine ${index + 1}`;
    const jobId = jobIdOf(job);
    const viewKey = routineKey(job, fallback);
    const busier = jobId !== "" && pending.indexOf(jobId) !== -1;
    return /* @__PURE__ */ jsx5(
      RoutineCard,
      {
        job,
        fallback,
        expanded: expandedNames.has(viewKey),
        inspected: activeInspectorId === viewKey,
        busy: busier,
        disabled: locked || jobId === "",
        onToggleExpand: () => handleToggleExpand(viewKey),
        onEdit: () => handleEdit(viewKey),
        onPause: () => onPause(jobId, routineTitle(job, fallback)),
        onResume: () => onResume(jobId, routineTitle(job, fallback))
      },
      `${index}::${viewKey}`
    );
  }) });
}

// src/views/RoutineInspectorPanel.tsx
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function RoutineInspectorPanel({
  job,
  fallback,
  onClose
}) {
  const title = routineTitle(job, fallback);
  const schedule = humanScheduleOf(job) || "\u2014";
  const execution = lastExecutionOf(job);
  return /* @__PURE__ */ jsxs4("aside", { className: "hr-inspector", "aria-label": `Details for ${title}`, children: [
    /* @__PURE__ */ jsx6("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsxs4(
      "button",
      {
        type: "button",
        className: "hr-btn-action hr-btn-back",
        onClick: onClose,
        "aria-label": "Back to routines",
        children: [
          /* @__PURE__ */ jsx6("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { flexShrink: 0 }, children: /* @__PURE__ */ jsx6("path", { fillRule: "evenodd", d: "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" }) }),
          /* @__PURE__ */ jsx6("span", { children: "Back to routines" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx6("h3", { className: "hr-create-title", children: title }),
      /* @__PURE__ */ jsxs4("div", { className: "hr-create-active-card", children: [
        /* @__PURE__ */ jsxs4("div", { className: "hr-create-active-info", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-create-active-title", children: "Active" }),
          /* @__PURE__ */ jsx6("span", { className: "hr-create-active-subtitle", children: "This routine will run on the schedule below." })
        ] }),
        /* @__PURE__ */ jsx6(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": routineActive(job),
            "aria-label": "Routine active state",
            disabled: true,
            className: `hr-switch-pill ${routineActive(job) ? "hr-switch-active" : ""}`,
            children: /* @__PURE__ */ jsx6("span", { className: "hr-switch-thumb" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx6("label", { className: "hr-field-label", children: "Name" }),
        /* @__PURE__ */ jsx6(
          "input",
          {
            type: "text",
            className: "hr-create-input",
            value: title,
            disabled: true,
            readOnly: true,
            "aria-label": "Routine name"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx6("label", { className: "hr-field-label", children: "What should this routine do?" }),
        /* @__PURE__ */ jsx6(
          "textarea",
          {
            className: "hr-create-textarea",
            rows: 3,
            value: routinePromptOf(job) ?? "",
            disabled: true,
            readOnly: true,
            "aria-label": "What this routine does",
            placeholder: "No instruction stored for this routine."
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx6("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
        /* @__PURE__ */ jsx6("div", { className: "hr-create-preview-sentence", children: schedule })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-last-run", children: [
        /* @__PURE__ */ jsx6("div", { className: "hr-create-section-label", children: "LAST EXECUTION" }),
        execution.lastRun !== null ? /* @__PURE__ */ jsxs4("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Last run" }),
          /* @__PURE__ */ jsx6(RunWhen, { distance: execution.lastRun })
        ] }) : null,
        /* @__PURE__ */ jsxs4("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Last result" }),
          execution.known ? /* @__PURE__ */ jsx6(ResultTone, { kind: execution.resultKind, text: execution.resultText }) : (
            // Stated in words, never as a placeholder that reads as data.
            /* @__PURE__ */ jsx6("span", { className: "hr-muted", children: "No runs yet." })
          )
        ] }),
        execution.issue !== null ? /* @__PURE__ */ jsxs4("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Issue" }),
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-value hr-inspector-issue", children: execution.issue })
        ] }) : null,
        execution.nextRun !== null ? /* @__PURE__ */ jsxs4("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Next run" }),
          /* @__PURE__ */ jsx6(RunWhen, { distance: execution.nextRun, strong: true })
        ] }) : null
      ] })
    ] })
  ] });
}

// src/views/RoutineComposerPanel.tsx
import { useMemo, useState as useState3 } from "react";

// src/views/SelectField.tsx
import { useEffect as useEffect2, useRef, useState as useState2 } from "react";
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function SelectField({
  label,
  value,
  options,
  onChange,
  className = ""
}) {
  const [isOpen, setIsOpen] = useState2(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];
  const displayLabel = selectedOption ? selectedOption.label : String(value);
  useEffect2(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);
  useEffect2(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector('[aria-selected="true"]');
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen]);
  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        if (currentIndex < options.length - 1) {
          const nextOpt = options[currentIndex + 1];
          if (nextOpt) onChange(nextOpt.value);
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        if (currentIndex > 0) {
          const prevOpt = options[currentIndex - 1];
          if (prevOpt) onChange(prevOpt.value);
        }
      }
    }
  }
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      ref: containerRef,
      className: `hr-select-container ${className}${isOpen ? " hr-select-is-open" : ""}`,
      children: [
        label ? /* @__PURE__ */ jsx7("label", { className: "hr-select-label", children: label }) : null,
        /* @__PURE__ */ jsxs5(
          "div",
          {
            className: "hr-select-trigger",
            role: "combobox",
            tabIndex: 0,
            "aria-expanded": isOpen,
            "aria-haspopup": "listbox",
            "aria-label": label,
            onClick: () => setIsOpen((prev) => !prev),
            onKeyDown: handleKeyDown,
            children: [
              /* @__PURE__ */ jsx7("span", { className: "hr-select-value", children: displayLabel }),
              /* @__PURE__ */ jsx7("span", { className: "hr-select-arrow", "aria-hidden": "true", children: /* @__PURE__ */ jsx7("svg", { width: "10", height: "6", viewBox: "0 0 10 6", fill: "currentColor", children: /* @__PURE__ */ jsx7("path", { d: "M0 0l5 5 5-5z" }) }) })
            ]
          }
        ),
        isOpen ? /* @__PURE__ */ jsx7("div", { ref: listRef, className: "hr-select-menu", role: "listbox", "aria-label": label, children: options.map((opt) => {
          const isSelected = opt.value === value;
          return /* @__PURE__ */ jsx7(
            "div",
            {
              role: "option",
              "aria-selected": isSelected,
              className: `hr-select-option${isSelected ? " hr-select-option-active" : ""}`,
              onClick: (e) => {
                e.stopPropagation();
                onChange(opt.value);
                setIsOpen(false);
              },
              children: opt.label
            },
            String(opt.value)
          );
        }) }) : null
      ]
    }
  );
}

// src/views/RoutineComposerPanel.tsx
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
function RoutineComposerPanel({
  disabled,
  onClose,
  onSubmit,
  onSubmitGuided
}) {
  const [name, setName] = useState3("");
  const [prompt, setPrompt] = useState3("");
  const [active, setActive] = useState3(true);
  const [scheduleConfig, setScheduleConfig] = useState3(DEFAULT_SCHEDULE_CONFIG);
  const [submitting, setSubmitting] = useState3(false);
  const [error, setError] = useState3(null);
  const [mode, setMode] = useState3(onSubmitGuided ? "guided" : "direct");
  const timeOptions = useMemo(
    () => TIME_SLOTS.map((t) => ({ value: t, label: t })),
    []
  );
  const dayOfWeekOptions = useMemo(
    () => DAYS_OF_WEEK.map((d) => ({ value: d, label: d })),
    []
  );
  const intervalValueOptions = useMemo(
    () => INTERVAL_VALUES.map((v) => ({ value: v, label: String(v) })),
    []
  );
  const intervalUnitOptions = useMemo(
    () => INTERVAL_UNITS.map((u) => ({ value: u, label: u })),
    []
  );
  const cronExpr = useMemo(() => buildCronExpression(scheduleConfig), [scheduleConfig]);
  const humanSentence = useMemo(() => describeScheduleConfig(scheduleConfig), [scheduleConfig]);
  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || submitting || disabled) return;
    const promptText = prompt.trim();
    if (!promptText) {
      setError("Describe what this routine should do.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "guided" && onSubmitGuided) {
        const ok2 = await onSubmitGuided(trimmedName, cronExpr, promptText);
        if (!ok2) {
          setError("Failed to create routine. Please verify parameters.");
        }
        return;
      }
      const ok = await onSubmit(trimmedName, cronExpr, promptText, active);
      if (!ok) {
        setError("Failed to create routine. Please verify parameters.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create routine.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }
  return /* @__PURE__ */ jsxs6("aside", { className: "hr-inspector hr-create-inspector", "aria-label": "Create Routine", children: [
    /* @__PURE__ */ jsx8("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsxs6(
      "button",
      {
        type: "button",
        className: "hr-btn-action hr-btn-back",
        onClick: onClose,
        "aria-label": "Back to routines",
        children: [
          /* @__PURE__ */ jsx8(
            "svg",
            {
              width: "12",
              height: "12",
              viewBox: "0 0 16 16",
              fill: "currentColor",
              "aria-hidden": "true",
              style: { flexShrink: 0 },
              children: /* @__PURE__ */ jsx8(
                "path",
                {
                  fillRule: "evenodd",
                  d: "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
                }
              )
            }
          ),
          /* @__PURE__ */ jsx8("span", { children: "Back to routines" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs6("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx8("h3", { className: "hr-create-title", children: "Create Routine" }),
      onSubmitGuided ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-card", children: [
        /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-info", children: [
          /* @__PURE__ */ jsx8("span", { className: "hr-create-active-title", children: "Configure with Hermes" }),
          /* @__PURE__ */ jsx8("span", { className: "hr-create-active-subtitle", children: mode === "guided" ? "Creates the routine paused, then opens a chat to finish configuring it." : "Creates the routine right away with the settings below." })
        ] }),
        /* @__PURE__ */ jsx8(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": mode === "guided",
            "aria-label": "Toggle guided configuration",
            className: `hr-switch-pill ${mode === "guided" ? "hr-switch-active" : ""}`,
            onClick: () => setMode(mode === "guided" ? "direct" : "guided"),
            children: /* @__PURE__ */ jsx8("span", { className: "hr-switch-thumb" })
          }
        )
      ] }) : null,
      mode === "direct" ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-card", children: [
        /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-info", children: [
          /* @__PURE__ */ jsx8("span", { className: "hr-create-active-title", children: "Active" }),
          /* @__PURE__ */ jsx8("span", { className: "hr-create-active-subtitle", children: "This routine will run on the schedule below." })
        ] }),
        /* @__PURE__ */ jsx8(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": active,
            "aria-label": "Toggle routine active state",
            className: `hr-switch-pill ${active ? "hr-switch-active" : ""}`,
            onClick: () => setActive(!active),
            children: /* @__PURE__ */ jsx8("span", { className: "hr-switch-thumb" })
          }
        )
      ] }) : null,
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx8("label", { className: "hr-field-label", children: "Name" }),
        /* @__PURE__ */ jsx8(
          "input",
          {
            type: "text",
            className: "hr-create-input",
            placeholder: "Name this Routine",
            value: name,
            onChange: (e) => setName(e.target.value),
            "aria-label": "Name this Routine"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx8("label", { className: "hr-field-label", children: "What should this routine do?" }),
        /* @__PURE__ */ jsx8(
          "textarea",
          {
            className: "hr-create-textarea",
            placeholder: "e.g. Check server health and notify #ops channel",
            rows: 3,
            value: prompt,
            onChange: (e) => setPrompt(e.target.value),
            "aria-label": "What should this routine do?"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx8("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
        /* @__PURE__ */ jsx8(
          SelectField,
          {
            label: "Trigger",
            value: scheduleConfig.trigger,
            options: TRIGGER_OPTIONS,
            onChange: (val) => setScheduleConfig((prev) => ({ ...prev, trigger: val }))
          }
        ),
        scheduleConfig.trigger === "every_day" || scheduleConfig.trigger === "weekdays" ? /* @__PURE__ */ jsx8("div", { className: "hr-create-sub-row", children: /* @__PURE__ */ jsx8(
          SelectField,
          {
            label: "at",
            value: scheduleConfig.time,
            options: timeOptions,
            onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
          }
        ) }) : null,
        scheduleConfig.trigger === "every_week" ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "on",
              value: scheduleConfig.dayOfWeek,
              options: dayOfWeekOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, dayOfWeek: val }))
            }
          ),
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "at",
              value: scheduleConfig.time,
              options: timeOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
            }
          )
        ] }) : null,
        scheduleConfig.trigger === "every_month" ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "on the",
              value: scheduleConfig.dayOfMonth,
              options: DAYS_OF_MONTH,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, dayOfMonth: val }))
            }
          ),
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "at",
              value: scheduleConfig.time,
              options: timeOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
            }
          )
        ] }) : null,
        scheduleConfig.trigger === "interval" ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "every",
              value: scheduleConfig.intervalValue,
              options: intervalValueOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, intervalValue: val }))
            }
          ),
          /* @__PURE__ */ jsx8(
            SelectField,
            {
              label: "unit",
              value: scheduleConfig.intervalUnit,
              options: intervalUnitOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, intervalUnit: val }))
            }
          )
        ] }) : null,
        /* @__PURE__ */ jsx8("div", { className: "hr-create-preview-sentence", children: humanSentence })
      ] }),
      error ? /* @__PURE__ */ jsx8("div", { className: "hr-create-error", role: "alert", children: error }) : null,
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-actions", children: [
        /* @__PURE__ */ jsx8(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-back-routines",
            onClick: onClose,
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsx8(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: !name.trim() || !prompt.trim() || submitting || disabled,
            onClick: handleSubmit,
            children: submitting ? "Creating\u2026" : mode === "guided" && onSubmitGuided ? "Create & Configure with Hermes" : "Create Routine"
          }
        )
      ] })
    ] })
  ] });
}

// src/views/GuidedRoutinePanel.tsx
import { useState as useState4 } from "react";

// src/domain/routineProposal.ts
var MAX_NAME_LENGTH2 = 128;
var MAX_SCHEDULE_LENGTH2 = 256;
var MAX_PROMPT_LENGTH2 = 2e4;
var CONTROL_CHARS_RE2 = /[\x00-\x1F\x7F]/;
var ROUTINE_PROPOSAL_VERSION = 1;
var PATCH_FIELDS = ["name", "prompt", "schedule"];
var PROPOSAL_FIELDS = ["version", "jobId", "owner", "base", "patch", "desiredActive", "note", "validated"];
function asRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function trimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function rowField(row, keys) {
  if (row === null) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function snapshotJobConfig(job) {
  const row = asRecord3(job);
  return {
    name: rowField(row, ["name"]),
    schedule: (rawScheduleOf(job ?? null) ?? "").trim(),
    prompt: (routinePromptOf(job ?? null) ?? "").trim(),
    // Same candidate keys the envelope reports (guidedEnvelope.ts) —
    // absent reads as absent, never invented.
    delivery: rowField(row, ["deliver", "delivery", "deliver_to", "deliverTo"]),
    modelOverride: rowField(row, ["model", "model_override", "modelOverride", "override_model"]),
    paused: routinePausedOf(job ?? null)
  };
}
function fingerprintSnapshot(snapshot) {
  const encoded = JSON.stringify([
    "routine-proposal-base-v1",
    snapshot.name,
    snapshot.schedule,
    snapshot.prompt,
    snapshot.delivery,
    snapshot.modelOverride,
    snapshot.paused ? "paused" : "active"
  ]);
  let hash = 2166136261;
  for (let i = 0; i < encoded.length; i += 1) {
    hash ^= encoded.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function fingerprintJob(job) {
  return fingerprintSnapshot(snapshotJobConfig(job));
}
function isProposalStale(proposal, job) {
  return fingerprintJob(job) !== proposal.base.fingerprint;
}
function refusal(code, message) {
  return { ok: false, code, message };
}
function checkName(value) {
  if (typeof value !== "string") return "proposal name must be text";
  const text = value.trim();
  if (!text) return "proposal name must not be empty";
  if (text.length > MAX_NAME_LENGTH2) return "proposal name must be at most 128 chars";
  if (CONTROL_CHARS_RE2.test(text)) return "proposal name must not contain control characters";
  return null;
}
function checkSchedule(value) {
  if (typeof value !== "string") return "proposal schedule must be text";
  const text = value.trim();
  if (!text) return "proposal schedule must not be empty";
  if (text.length > MAX_SCHEDULE_LENGTH2) return "proposal schedule must be at most 256 chars";
  if (CONTROL_CHARS_RE2.test(text)) return "proposal schedule must not contain control characters";
  return null;
}
function checkPrompt(value) {
  if (typeof value !== "string") return "proposal instruction must be text";
  const text = value.trim();
  if (!text) return "proposal instruction must not be empty";
  if (text.length > MAX_PROMPT_LENGTH2) return "proposal instruction must be at most 20000 chars";
  return null;
}
function validateProposal(input, expectedOwner = null) {
  const root = asRecord3(input);
  if (root === null) {
    return refusal("not_an_object", "the proposal must be a structured object, not text or a list");
  }
  for (const key of Object.keys(root)) {
    if (!PROPOSAL_FIELDS.includes(key)) {
      return refusal("unknown_field", `unknown proposal field "${key}" \u2014 proposals carry only ${PROPOSAL_FIELDS.join(", ")}`);
    }
  }
  if (root.version !== ROUTINE_PROPOSAL_VERSION) {
    return refusal(
      "unsupported_version",
      `unsupported proposal version ${JSON.stringify(root.version)} \u2014 this plugin reads version 1`
    );
  }
  if (!isValidJobId(root.jobId)) {
    return refusal("bad_job_id", "the proposal must carry the authoritative job_id of the routine it configures");
  }
  const owner = asRecord3(root.owner);
  const connectionId = owner === null ? "" : trimmedText(owner.connectionId);
  const profile = owner === null ? "" : trimmedText(owner.profile);
  if (!connectionId || !profile || Object.keys(owner ?? {}).some((k) => k !== "connectionId" && k !== "profile")) {
    return refusal(
      "bad_owner",
      "the proposal must name its owning connection and profile as { connectionId, profile }"
    );
  }
  if (expectedOwner !== null && (expectedOwner.connectionId !== connectionId || expectedOwner.profile !== profile)) {
    return refusal(
      "owner_mismatch",
      `the proposal belongs to ${connectionId}::${profile} and cannot be applied elsewhere`
    );
  }
  const base = asRecord3(root.base);
  if (base === null || typeof base.fingerprint !== "string" || !base.fingerprint) {
    return refusal(
      "bad_base",
      "the proposal must carry the base fingerprint of the configuration it was built from"
    );
  }
  const patch = asRecord3(root.patch);
  if (patch === null) {
    return refusal("empty_patch", "the proposal must carry a patch object with at least one change");
  }
  const patchKeys = Object.keys(patch);
  if (patchKeys.length === 0) {
    return refusal("empty_patch", "the proposal patch is empty \u2014 a proposal that changes nothing is not a proposal");
  }
  for (const key of patchKeys) {
    if (!PATCH_FIELDS.includes(key)) {
      return refusal(
        "unknown_patch_field",
        `unknown patch field "${key}" \u2014 only ${PATCH_FIELDS.join(", ")} can be reconfigured` + (key === "delivery" || key === "deliver" || key === "modelOverride" || key === "model_override" || key === "model" ? "; delivery and model overrides are reported by the session but have no supported write path on this surface" : "")
      );
    }
  }
  const normalized = {};
  if ("name" in patch) {
    const bad = checkName(patch.name);
    if (bad !== null) return refusal("bad_name", bad);
    normalized.name = patch.name.trim();
  }
  if ("schedule" in patch) {
    const bad = checkSchedule(patch.schedule);
    if (bad !== null) return refusal("bad_schedule", bad);
    normalized.schedule = patch.schedule.trim();
  }
  if ("prompt" in patch) {
    const bad = checkPrompt(patch.prompt);
    if (bad !== null) return refusal("bad_prompt", bad);
    normalized.prompt = patch.prompt.trim();
  }
  if (root.desiredActive !== false) {
    return refusal(
      "activation_not_supported",
      "proposals never activate a routine \u2014 the configured routine stays paused until it is resumed explicitly"
    );
  }
  let note;
  if (root.note !== void 0) {
    if (typeof root.note !== "string") {
      return refusal("bad_note", "the proposal note is display-only text or absent");
    }
    note = root.note;
  }
  return {
    ok: true,
    proposal: {
      version: 1,
      jobId: root.jobId,
      owner: { connectionId, profile },
      base: { fingerprint: base.fingerprint },
      patch: normalized,
      desiredActive: false,
      ...note === void 0 ? {} : { note },
      validated: true
    }
  };
}
function submitProposalHandoff(input) {
  if (typeof input === "string" || asRecord3(input) === null) {
    return refusal(
      "handoff_must_be_structured",
      "the handoff is a structured proposal object \u2014 free-form text is never parsed into routine configuration"
    );
  }
  return validateProposal(input, null);
}
function submitProposalForRoutine(input, target) {
  let candidate = input;
  if (typeof candidate === "string") {
    const text = candidate.trim();
    if (!text) {
      return refusal(
        "handoff_must_be_structured",
        "paste the proposal object Hermes returned \u2014 an empty handoff is not a proposal"
      );
    }
    try {
      candidate = JSON.parse(text);
    } catch {
      return refusal(
        "handoff_must_be_structured",
        "the handoff could not be read as a JSON object \u2014 paste the proposal exactly as Hermes returned it"
      );
    }
  }
  if (asRecord3(candidate) === null) {
    return refusal(
      "handoff_must_be_structured",
      "the handoff must be a structured proposal object \u2014 free-form text is never parsed into routine configuration"
    );
  }
  const expectedOwner = target === null ? null : { connectionId: trimmedText(target.connectionId), profile: trimmedText(target.profile) };
  const validated = validateProposal(candidate, expectedOwner);
  if (validated.ok === false) return validated;
  if (target !== null && validated.proposal.jobId !== target.jobId) {
    return refusal(
      "job_mismatch",
      `this proposal configures ${validated.proposal.jobId}, not ${target.jobId} \u2014 ask Hermes for a proposal bound to this routine`
    );
  }
  return validated;
}

// src/domain/guidedWorkflow.ts
var GUIDED_WORKFLOW_STATE = Object.freeze({
  /** Job exists and is proven paused; no chat has been opened yet. */
  PROVISIONAL_PAUSED: "provisional_paused",
  /** A guided chat is (or was) clarifying the configuration. */
  CONFIGURING: "configuring",
  /** A validated proposal is on the table, waiting for a decision. */
  PROPOSAL_READY: "proposal_ready",
  /** The confirmed proposal is being written to the backend. */
  APPLYING: "applying",
  /** Configuration applied AND verified; the routine is still paused. */
  CONFIGURED_PAUSED: "configured_paused",
  /** Resume issued; the active state has not been proven yet. */
  ACTIVATING: "activating",
  /** Applied, resumed and re-read as running. Backend truth, not intent. */
  ACTIVE: "active",
  /** Something needs the user: an uncertain or failed transition. */
  NEEDS_ATTENTION: "needs_attention"
});
var GUIDED_WORKFLOW_STAGE = Object.freeze({
  /** The handoff itself was refused — nothing was read or written. */
  HANDOFF: "handoff",
  /** Pre-mutation guard: identity, ownership, staleness, paused-ness. */
  STALE: "stale",
  /** The deterministic write (add → pause → remove → re-read). */
  APPLY: "apply",
  /** Post-apply verification read of the persisted values. */
  VERIFY: "verify",
  /** The official resume/enable call. */
  RESUME: "resume",
  /** Post-resume verification read of the active state. */
  ACTIVATE_VERIFY: "activate-verify"
});
function initialGuidedWorkflow(jobId) {
  return {
    jobId,
    state: GUIDED_WORKFLOW_STATE.PROVISIONAL_PAUSED,
    proposal: null,
    current: null,
    desiredActive: false,
    appliedJobId: "",
    failure: null,
    status: "Routine created paused. It needs configuration."
  };
}
var GUIDED_TRANSITIONS = Object.freeze({
  [GUIDED_WORKFLOW_STATE.PROVISIONAL_PAUSED]: [
    GUIDED_WORKFLOW_STATE.CONFIGURING,
    GUIDED_WORKFLOW_STATE.PROPOSAL_READY
  ],
  [GUIDED_WORKFLOW_STATE.CONFIGURING]: [
    GUIDED_WORKFLOW_STATE.CONFIGURING,
    GUIDED_WORKFLOW_STATE.PROPOSAL_READY
  ],
  [GUIDED_WORKFLOW_STATE.PROPOSAL_READY]: [
    GUIDED_WORKFLOW_STATE.APPLYING,
    GUIDED_WORKFLOW_STATE.CONFIGURING
  ],
  // proposal_ready: a stale/invalid proposal goes back to review, a
  // verified apply branches on the recorded activation decision, and
  // everything else is an attention state.
  [GUIDED_WORKFLOW_STATE.APPLYING]: [
    GUIDED_WORKFLOW_STATE.PROPOSAL_READY,
    GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
    GUIDED_WORKFLOW_STATE.ACTIVATING,
    GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION
  ],
  [GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED]: [
    GUIDED_WORKFLOW_STATE.ACTIVATING,
    GUIDED_WORKFLOW_STATE.CONFIGURING,
    GUIDED_WORKFLOW_STATE.ACTIVE
  ],
  // A resume answer is never taken on trust: activating ends in active
  // only through a verified read, back to configured_paused when the
  // resume was refused, and in needs_attention when truth is unreadable.
  [GUIDED_WORKFLOW_STATE.ACTIVATING]: [
    GUIDED_WORKFLOW_STATE.ACTIVE,
    GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
    GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION
  ],
  // Losing activation (paused from outside) is a legitimate move.
  [GUIDED_WORKFLOW_STATE.ACTIVE]: [GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED],
  [GUIDED_WORKFLOW_STATE.NEEDS_ATTENTION]: [
    GUIDED_WORKFLOW_STATE.APPLYING,
    GUIDED_WORKFLOW_STATE.ACTIVATING,
    GUIDED_WORKFLOW_STATE.CONFIGURING,
    GUIDED_WORKFLOW_STATE.CONFIGURED_PAUSED,
    GUIDED_WORKFLOW_STATE.ACTIVE
  ]
});
function canGuidedTransition(from, to) {
  const allowed = GUIDED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
}
function failure2(stage, reason, message, recovery) {
  return { stage, reason, message, recovery };
}
function announce(base, status) {
  return { ...base, status };
}
function guidedWorkflowReducer(state, event) {
  const base = state ?? initialGuidedWorkflow("");
  if (!event) return base;
  const S = GUIDED_WORKFLOW_STATE;
  switch (event.type) {
    case "chat-launched": {
      if (base.state === S.PROVISIONAL_PAUSED) {
        return {
          ...base,
          state: S.CONFIGURING,
          status: "Configuration chat opened for this routine. It stays paused."
        };
      }
      if (base.state === S.CONFIGURING) {
        return announce(base, "Configuration chat re-opened for this routine. It stays paused.");
      }
      return base;
    }
    case "handoff-rejected": {
      if (base.state !== S.PROVISIONAL_PAUSED && base.state !== S.CONFIGURING) return base;
      return {
        ...base,
        failure: failure2("handoff", event.reason, event.message, "review"),
        status: event.message
      };
    }
    case "proposal-received": {
      const legal = base.state === S.PROVISIONAL_PAUSED || base.state === S.CONFIGURING || base.state === S.PROPOSAL_READY || base.state === S.NEEDS_ATTENTION && base.failure?.recovery === "review";
      if (!legal) return base;
      return {
        ...base,
        state: S.PROPOSAL_READY,
        proposal: event.proposal,
        current: event.current,
        desiredActive: false,
        failure: null,
        status: "Proposal ready for review. Nothing has been applied yet."
      };
    }
    case "return-to-review": {
      if (base.state !== S.NEEDS_ATTENTION) return base;
      if (base.failure === null || base.failure.recovery !== "review") return base;
      return {
        ...base,
        state: S.PROPOSAL_READY,
        failure: null,
        status: "Back to review. Nothing has been applied yet."
      };
    }
    case "continue-configuring": {
      if (!canGuidedTransition(base.state, S.CONFIGURING)) return base;
      return {
        ...base,
        state: S.CONFIGURING,
        proposal: null,
        current: null,
        desiredActive: false,
        failure: null,
        status: "Back to configuration. The routine stays paused."
      };
    }
    case "confirm": {
      if (base.state === S.PROPOSAL_READY) {
        if (base.proposal === null || base.current === null) return base;
        return {
          ...base,
          state: S.APPLYING,
          desiredActive: event.desiredActive === true,
          failure: null,
          status: event.desiredActive ? "Applying the reviewed configuration." : "Applying the reviewed configuration. The routine stays paused."
        };
      }
      if (base.state === S.NEEDS_ATTENTION && base.failure?.recovery === "apply") {
        if (base.proposal === null || base.current === null) return base;
        return {
          ...base,
          state: S.APPLYING,
          desiredActive: event.desiredActive === true,
          failure: null,
          status: "Retrying the configuration apply."
        };
      }
      return base;
    }
    case "confirm-activation": {
      const legal = base.state === S.CONFIGURED_PAUSED || base.state === S.NEEDS_ATTENTION && base.failure?.recovery === "activation";
      if (!legal) return base;
      return {
        ...base,
        state: S.ACTIVATING,
        desiredActive: true,
        failure: null,
        status: "Activating the routine."
      };
    }
    case "failed": {
      const detail = failure2(event.stage, event.reason, event.message, event.recovery);
      const address = typeof event.jobId === "string" && event.jobId.length > 0 ? event.jobId : base.jobId;
      const parked = { ...base, jobId: address, failure: detail, status: event.message };
      if (base.state === S.APPLYING) {
        if (event.stage === GUIDED_WORKFLOW_STAGE.STALE || event.stage === GUIDED_WORKFLOW_STAGE.HANDOFF) {
          return { ...parked, state: S.PROPOSAL_READY };
        }
        return { ...parked, state: S.NEEDS_ATTENTION };
      }
      if (base.state === S.ACTIVATING) {
        if (event.stage === GUIDED_WORKFLOW_STAGE.RESUME) {
          return { ...parked, state: S.CONFIGURED_PAUSED };
        }
        return { ...parked, state: S.NEEDS_ATTENTION };
      }
      return base;
    }
    case "apply-verified": {
      if (base.state !== S.APPLYING) return base;
      const jobId = typeof event.jobId === "string" && event.jobId ? event.jobId : base.jobId;
      const applied = { ...base, appliedJobId: jobId, failure: null, jobId };
      if (base.desiredActive) {
        return {
          ...applied,
          state: S.ACTIVATING,
          status: "Configuration applied and verified. Activating the routine."
        };
      }
      return {
        ...applied,
        state: S.CONFIGURED_PAUSED,
        status: "Configuration applied and verified. The routine stays paused."
      };
    }
    case "activation-verified": {
      if (base.state !== S.ACTIVATING) return base;
      const jobId = typeof event.jobId === "string" && event.jobId ? event.jobId : base.jobId;
      return {
        ...base,
        state: S.ACTIVE,
        jobId,
        appliedJobId: jobId,
        failure: null,
        status: "Routine active. The active state was confirmed by a backend read."
      };
    }
    case "refresh-result": {
      const allowed = base.state === S.NEEDS_ATTENTION || base.state === S.CONFIGURED_PAUSED || base.state === S.ACTIVE;
      if (!allowed) return base;
      if (!event.exists) {
        if (base.state !== S.NEEDS_ATTENTION) return base;
        return {
          ...base,
          status: "The routine no longer exists on its owning profile.",
          failure: base.failure ? { ...base.failure, message: "The routine no longer exists on its owning profile." } : base.failure
        };
      }
      if (!event.paused) {
        return {
          ...base,
          state: S.ACTIVE,
          failure: null,
          status: "The routine is active, confirmed by a backend read."
        };
      }
      if (base.state === S.ACTIVE) {
        return {
          ...base,
          state: S.CONFIGURED_PAUSED,
          failure: null,
          status: "The routine is paused. Its configuration is unchanged."
        };
      }
      if (base.state === S.NEEDS_ATTENTION && event.configured) {
        return {
          ...base,
          state: S.CONFIGURED_PAUSED,
          failure: null,
          status: "The persisted configuration was verified. The routine stays paused."
        };
      }
      if (base.state === S.NEEDS_ATTENTION) {
        return announce(base, "The routine is still paused and its configuration is not confirmed yet.");
      }
      return base;
    }
    default:
      return base;
  }
}
function guidedIndicator(state, failure3) {
  const S = GUIDED_WORKFLOW_STATE;
  switch (state) {
    case S.PROVISIONAL_PAUSED:
    case S.CONFIGURING:
      return "Paused \xB7 needs configuration";
    case S.PROPOSAL_READY:
      return "Proposal ready";
    case S.APPLYING:
      return "Applying configuration";
    case S.CONFIGURED_PAUSED:
      return failure3 !== null && failure3.stage === GUIDED_WORKFLOW_STAGE.RESUME ? "Activation failed" : "Configured \xB7 Paused";
    case S.ACTIVATING:
      return "Activating";
    case S.ACTIVE:
      return "Active";
    case S.NEEDS_ATTENTION:
      return failure3 !== null && (failure3.stage === GUIDED_WORKFLOW_STAGE.RESUME || failure3.stage === GUIDED_WORKFLOW_STAGE.ACTIVATE_VERIFY) ? "Activation failed" : "Needs attention";
  }
}
function proposedSnapshot(current, patch) {
  return {
    ...current,
    name: patch.name ?? current.name,
    schedule: patch.schedule ?? current.schedule,
    prompt: patch.prompt ?? current.prompt
  };
}
var REVIEW_LABELS = Object.freeze({
  name: "Name",
  schedule: "Schedule",
  prompt: "Instruction",
  delivery: "Delivery",
  modelOverride: "Model override"
});
var REVIEW_ORDER = ["name", "schedule", "prompt", "delivery", "modelOverride"];
var PATCHABLE = Object.freeze({
  name: true,
  schedule: true,
  prompt: true,
  delivery: false,
  modelOverride: false
});
function buildProposalReview(current, proposal) {
  if (!current || !proposal) return null;
  const proposed = proposedSnapshot(current, proposal.patch);
  const rows = REVIEW_ORDER.map((field2) => {
    const before = current[field2] ?? "";
    const after = proposed[field2] ?? "";
    return {
      field: field2,
      label: REVIEW_LABELS[field2],
      current: before,
      proposed: after,
      changed: before !== after,
      patchable: PATCHABLE[field2]
    };
  });
  return {
    jobId: proposal.jobId,
    rows,
    changedFields: rows.filter((row) => row.changed).map((row) => row.field),
    note: typeof proposal.note === "string" && proposal.note.trim() ? proposal.note : null,
    stale: fingerprintSnapshot(current) !== proposal.base.fingerprint,
    current,
    proposed
  };
}

// src/gateway/proposalApply.ts
function scopeOf2(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return null;
  return backendTargetProfile(route, "") || null;
}
function failed(reason, message, jobId, backendProfile, replacementJobId = null) {
  return { ok: false, reason, message, jobId, replacementJobId, backendProfile };
}
async function applyValidatedProposal(request) {
  const route = request?.route;
  const backendProfile = scopeOf2(route);
  if (!route || !backendProfile) {
    return failed(
      "no_route",
      "applying a proposal requires the resolved profile route that owns the routine",
      "",
      null
    );
  }
  const checked = validateProposal(request?.proposal, null);
  if (checked.ok === false) {
    return failed("invalid_proposal", "the proposal is not valid: " + checked.message, "", backendProfile);
  }
  const proposal = checked.proposal;
  const jobId = proposal.jobId;
  if (route.connectionId !== proposal.owner.connectionId || route.profile !== proposal.owner.profile && route.targetProfile !== proposal.owner.profile) {
    return failed(
      "owner_mismatch",
      `the proposal belongs to ${proposal.owner.connectionId}::${proposal.owner.profile} and cannot be applied on ${route.connectionId}::${route.profile}`,
      jobId,
      backendProfile
    );
  }
  let rows;
  try {
    rows = normalizeJobs(await listRoutines(route));
  } catch (err) {
    return failed("list_failed", "the routines list could not be read: " + messageOf(err), jobId, backendProfile);
  }
  const current = rows.find((row) => jobIdOf(row) === jobId) ?? null;
  if (current === null) {
    return failed(
      "job_not_found",
      "the routine no longer exists on its owning profile \u2014 check the routines list before reapplying",
      jobId,
      backendProfile
    );
  }
  if (isProposalStale(proposal, current)) {
    return failed(
      "stale_base",
      "the routine changed since the configuration session started \u2014 review the current values and build a new proposal instead of overwriting newer state",
      jobId,
      backendProfile
    );
  }
  const snapshot = snapshotJobConfig(current);
  if (!snapshot.paused) {
    return failed(
      "not_paused",
      "only a paused routine can be reconfigured \u2014 the routine is currently active, so the proposal no longer describes a safe target",
      jobId,
      backendProfile
    );
  }
  const name = proposal.patch.name ?? snapshot.name;
  const schedule = proposal.patch.schedule ?? snapshot.schedule;
  const prompt = proposal.patch.prompt ?? snapshot.prompt;
  if (!name || !schedule || !prompt) {
    return failed(
      "unapplyable_base",
      "the routine carries no usable name, schedule or instruction to carry forward \u2014 fill every field in the proposal",
      jobId,
      backendProfile
    );
  }
  if (name === snapshot.name && schedule === snapshot.schedule && prompt === snapshot.prompt) {
    return { ok: true, jobId, previousJobId: "", changed: false, backendProfile };
  }
  let addParams;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt });
  } catch (err) {
    return failed("invalid_proposal", "the patched configuration is not valid: " + messageOf(err), jobId, backendProfile);
  }
  let addAnswer;
  try {
    addAnswer = await requestCronForRoute(route, "cron.manage", addParams, void 0, {
      spawnPriority: "foreground"
    });
  } catch (err) {
    return failed(
      "create_rejected",
      "the backend refused to create the replacement routine (" + messageOf(err) + ") \u2014 the original is untouched",
      jobId,
      backendProfile
    );
  }
  const created = cronOutcomeOf(addAnswer);
  if (!created.ok) {
    return failed(
      "create_rejected",
      "the backend refused to create the replacement routine: " + created.error + " \u2014 the original is untouched",
      jobId,
      backendProfile
    );
  }
  const replacementId = jobIdFromResponse(addAnswer);
  if (!replacementId) {
    return failed(
      "identity_unresolved",
      "the backend created a replacement but returned no job id, so it cannot be addressed \u2014 the original is untouched; check the routines list",
      jobId,
      backendProfile
    );
  }
  let pauseParams;
  try {
    pauseParams = buildPauseParams(route, replacementId);
  } catch (err) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      "replacement_not_paused",
      `the replacement ${replacementId} could not be addressed for pausing (${messageOf(err)}) \u2014 the original ${jobId} is untouched` + (cleanup ? " and the replacement was removed" : "; the replacement may still exist \u2014 check the routines list"),
      jobId,
      backendProfile,
      cleanup ? null : replacementId
    );
  }
  let pauseAnswer;
  try {
    pauseAnswer = await requestCronForRoute(route, "cron.manage", pauseParams, void 0, {
      spawnPriority: "foreground"
    });
  } catch (err) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      "replacement_not_paused",
      `the replacement routine could not be paused (${messageOf(err)}) \u2014 the original ${jobId} is untouched` + (cleanup ? " and the unpaused replacement was removed" : "; the unpaused replacement may still exist \u2014 check the routines list"),
      jobId,
      backendProfile,
      cleanup ? null : replacementId
    );
  }
  if (!cronOutcomeOf(pauseAnswer).ok || !pausedConfirmedBy(pauseAnswer)) {
    const cleanup = await removeQuietly(route, replacementId);
    return failed(
      "replacement_not_paused",
      "the backend did not confirm the replacement is paused \u2014 the original " + jobId + " is untouched" + (cleanup ? " and the replacement was removed" : "; the replacement may still exist \u2014 check the routines list"),
      jobId,
      backendProfile,
      cleanup ? null : replacementId
    );
  }
  let removeParams;
  try {
    removeParams = buildRemoveParams(route, jobId);
  } catch (err) {
    return failed(
      "supersede_incomplete",
      `the replacement ${replacementId} is configured and paused, but the superseded ${jobId} could not be addressed for removal (${messageOf(err)}) \u2014 remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  let removeAnswer;
  try {
    removeAnswer = await requestCronForRoute(route, "cron.manage", removeParams, void 0, {
      spawnPriority: "foreground"
    });
  } catch (err) {
    return failed(
      "supersede_incomplete",
      `the replacement ${replacementId} is configured and paused, but removing the superseded ${jobId} failed (${messageOf(err)}) \u2014 remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  if (!cronOutcomeOf(removeAnswer).ok) {
    const detail = cronOutcomeOf(removeAnswer).error;
    return failed(
      "supersede_incomplete",
      `the replacement ${replacementId} is configured and paused, but the backend refused to remove the superseded ${jobId}: ${detail} \u2014 remove it by id; nothing was lost`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  let fresh;
  try {
    fresh = normalizeJobs(await listRoutines(route));
  } catch (err) {
    return failed(
      "truth_unconfirmed",
      `the replacement ${replacementId} is configured and paused, but the routines list could not be re-read (${messageOf(err)}) \u2014 verify it before the first run`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  const confirmed = fresh.find((row) => jobIdOf(row) === replacementId) ?? null;
  if (confirmed === null || fingerprintSnapshot(snapshotJobConfig(confirmed)) === proposal.base.fingerprint) {
    return failed(
      "truth_unconfirmed",
      `the replacement ${replacementId} was applied but the re-read list does not show the new configuration \u2014 verify it before the first run`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  const confirmedSnapshot = snapshotJobConfig(confirmed);
  if (confirmedSnapshot.name !== name || confirmedSnapshot.schedule !== schedule || confirmedSnapshot.prompt !== prompt) {
    return failed(
      "truth_unconfirmed",
      `the re-read list shows the replacement ${replacementId} with different values than requested \u2014 verify it before the first run`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  if (!confirmedSnapshot.paused) {
    return failed(
      "truth_unconfirmed",
      `the re-read list does not show the replacement ${replacementId} as paused \u2014 check it before its first run`,
      jobId,
      backendProfile,
      replacementId
    );
  }
  return { ok: true, jobId: replacementId, previousJobId: jobId, changed: true, backendProfile };
}
async function removeQuietly(route, jobId) {
  try {
    const answer = await requestCronForRoute(route, "cron.manage", buildRemoveParams(route, jobId), void 0, {
      spawnPriority: "foreground"
    });
    return cronOutcomeOf(answer).ok;
  } catch {
    return false;
  }
}

// src/gateway/proposalConfirm.ts
function scopeOf3(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return null;
  return backendTargetProfile(route, "") || null;
}
async function readJobConfig(request) {
  const route = request?.route;
  if (!scopeOf3(route)) {
    return { ok: false, message: "reading a routine requires the resolved profile route that owns it" };
  }
  const jobId = typeof request?.jobId === "string" ? request.jobId : "";
  if (!jobId) {
    return { ok: false, message: "reading a routine requires its authoritative job id" };
  }
  let rows;
  try {
    rows = normalizeJobs(await listRoutines(route));
  } catch (err) {
    return { ok: false, message: "the routines list could not be read: " + messageOf(err) };
  }
  const row = rows.find((candidate) => jobIdOf(candidate) === jobId) ?? null;
  if (row === null) {
    return { ok: true, exists: false, snapshot: { name: "", schedule: "", prompt: "", delivery: "", modelOverride: "", paused: false }, paused: false, fingerprint: "" };
  }
  const snapshot = snapshotJobConfig(row);
  return {
    ok: true,
    exists: true,
    snapshot,
    paused: snapshot.paused,
    fingerprint: fingerprintSnapshot(snapshot)
  };
}
function refused(stage, reason, message, jobId, recovery, replacementJobId = null) {
  return { ok: false, stage, reason, message, jobId, recovery, replacementJobId };
}
function classifyApplyFailure(reason, replacementJobId) {
  const S = GUIDED_WORKFLOW_STAGE;
  switch (reason) {
    case "no_route":
    case "owner_mismatch":
    case "invalid_proposal":
      return { stage: S.STALE, recovery: "review" };
    case "list_failed":
    case "job_not_found":
    case "stale_base":
    case "not_paused":
    case "unapplyable_base":
      return { stage: S.STALE, recovery: "review" };
    case "create_rejected":
      return { stage: S.APPLY, recovery: "apply" };
    case "identity_unresolved":
    case "supersede_incomplete":
      return { stage: S.APPLY, recovery: "refresh" };
    case "replacement_not_paused":
      return { stage: S.APPLY, recovery: replacementJobId ? "refresh" : "apply" };
    case "truth_unconfirmed":
      return { stage: S.VERIFY, recovery: "refresh" };
    default:
      return { stage: S.APPLY, recovery: "refresh" };
  }
}
async function confirmProposal(request) {
  const route = request?.route;
  const backendProfile = scopeOf3(route);
  const S = GUIDED_WORKFLOW_STAGE;
  const checked = validateProposal(request?.proposal, null);
  if (checked.ok === false) {
    return refused(S.STALE, "invalid_proposal", "the proposal is not valid: " + checked.message, "", "review");
  }
  const proposal = checked.proposal;
  const jobId = proposal.jobId;
  if (!route || !backendProfile) {
    return refused(S.STALE, "no_route", "applying a proposal requires the resolved profile route that owns the routine", jobId, "review");
  }
  if (route.connectionId !== proposal.owner.connectionId || route.profile !== proposal.owner.profile && route.targetProfile !== proposal.owner.profile) {
    return refused(
      S.STALE,
      "owner_mismatch",
      `the proposal belongs to ${proposal.owner.connectionId}::${proposal.owner.profile} and cannot be applied on ${route.connectionId}::${route.profile}`,
      jobId,
      "review"
    );
  }
  const before = await readJobConfig({ route, jobId });
  if (!before.ok) {
    return refused(S.STALE, "list_failed", before.message, jobId, "review");
  }
  if (!before.exists) {
    return refused(
      S.STALE,
      "job_not_found",
      "the routine no longer exists on its owning profile \u2014 check the routines list before reapplying",
      jobId,
      "review"
    );
  }
  if (before.fingerprint !== proposal.base.fingerprint) {
    return refused(
      S.STALE,
      "stale_base",
      "the routine changed since the configuration session started \u2014 review the current values and build a new proposal instead of overwriting newer state",
      jobId,
      "review"
    );
  }
  if (!before.paused) {
    return refused(
      S.STALE,
      "not_paused",
      "only a paused routine can be reconfigured \u2014 the routine is currently active, so the proposal no longer describes a safe target",
      jobId,
      "review"
    );
  }
  const applied = await applyValidatedProposal({ proposal, route });
  if (applied.ok === false) {
    const { stage, recovery } = classifyApplyFailure(applied.reason, applied.replacementJobId);
    return refused(stage, applied.reason, applied.message, applied.jobId || jobId, recovery, applied.replacementJobId);
  }
  const expected = proposedSnapshot(before.snapshot, proposal.patch);
  const verified = await readJobConfig({ route, jobId: applied.jobId });
  if (!verified.ok) {
    return refused(S.VERIFY, "verification_unreadable", verified.message, applied.jobId, "refresh", null);
  }
  if (!verified.exists) {
    return refused(
      S.VERIFY,
      "verification_missing",
      `the configuration was applied but the routine ${applied.jobId} is not in the re-read list \u2014 verify it before any activation`,
      applied.jobId,
      "refresh",
      null
    );
  }
  if (verified.snapshot.name !== expected.name || verified.snapshot.schedule !== expected.schedule || verified.snapshot.prompt !== expected.prompt) {
    return refused(
      S.VERIFY,
      "verification_failed",
      `the re-read routine ${applied.jobId} does not hold the proposed configuration \u2014 do not activate it; check the routines list`,
      applied.jobId,
      "refresh",
      null
    );
  }
  if (!verified.paused) {
    return refused(
      S.VERIFY,
      "verification_unpaused",
      `the re-read routine ${applied.jobId} is not paused after the apply \u2014 it must be parked before any activation decision`,
      applied.jobId,
      "refresh",
      null
    );
  }
  if (request?.desiredActive !== true) {
    return { ok: true, activated: false, jobId: applied.jobId, previousJobId: applied.previousJobId, changed: applied.changed };
  }
  const activated = await activateConfigured({ route, jobId: applied.jobId });
  if (activated.ok === false) return activated;
  return { ok: true, activated: true, jobId: applied.jobId, previousJobId: applied.previousJobId, changed: applied.changed };
}
async function activateConfigured(request) {
  const route = request?.route;
  const jobId = typeof request?.jobId === "string" ? request.jobId : "";
  const S = GUIDED_WORKFLOW_STAGE;
  if (!scopeOf3(route) || !jobId) {
    return refused(
      S.RESUME,
      "no_route",
      "activating a routine requires the resolved profile route that owns it",
      jobId,
      "activation"
    );
  }
  let resumeError = null;
  try {
    const params = buildResumeParams(route, jobId);
    const answer = await requestCronForRoute(route, "cron.manage", params, void 0, {
      spawnPriority: "foreground"
    });
    const outcome = cronOutcomeOf(answer);
    if (!outcome.ok) resumeError = outcome.error;
  } catch (err) {
    resumeError = messageOf(err);
  }
  const after = await readJobConfig({ route, jobId });
  if (!after.ok) {
    return refused(S.ACTIVATE_VERIFY, "truth_unreadable", after.message, jobId, "refresh");
  }
  if (!after.exists) {
    return refused(
      S.ACTIVATE_VERIFY,
      "job_missing",
      `the routine ${jobId} is no longer in the re-read list \u2014 check the routines list before retrying`,
      jobId,
      "refresh"
    );
  }
  if (!after.paused) {
    return { ok: true, activated: true, jobId, previousJobId: "", changed: false };
  }
  if (resumeError !== null) {
    return refused(
      S.RESUME,
      "resume_rejected",
      `the backend refused to resume the routine (${resumeError}) \u2014 it stays configured and paused`,
      jobId,
      "activation"
    );
  }
  return refused(
    S.ACTIVATE_VERIFY,
    "resume_unconfirmed",
    `the resume was accepted but the routine ${jobId} still reads as paused \u2014 the active state was not confirmed`,
    jobId,
    "refresh"
  );
}

// src/views/GuidedProposalReview.tsx
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
function cellText(value) {
  return value.trim() ? value : "\u2014";
}
function GuidedProposalReview({
  review,
  busy,
  onConfirm,
  onContinueConfiguring
}) {
  return /* @__PURE__ */ jsxs7("div", { className: "hr-review", children: [
    /* @__PURE__ */ jsx9("div", { className: "hr-create-section-label", children: "REVIEW THE PROPOSAL" }),
    /* @__PURE__ */ jsxs7("table", { className: "hr-review-table", children: [
      /* @__PURE__ */ jsx9("caption", { className: "hr-sr-only", children: "Current configuration compared with the proposed configuration for this routine." }),
      /* @__PURE__ */ jsx9("thead", { children: /* @__PURE__ */ jsxs7("tr", { children: [
        /* @__PURE__ */ jsx9("th", { scope: "col", children: "Field" }),
        /* @__PURE__ */ jsx9("th", { scope: "col", children: "Current" }),
        /* @__PURE__ */ jsx9("th", { scope: "col", children: "Proposed" })
      ] }) }),
      /* @__PURE__ */ jsx9("tbody", { children: review.rows.map((row) => /* @__PURE__ */ jsxs7("tr", { className: row.changed ? "hr-review-row-changed" : void 0, children: [
        /* @__PURE__ */ jsxs7("th", { scope: "row", children: [
          row.label,
          row.changed ? /* @__PURE__ */ jsx9("span", { className: "hr-review-flag", children: "changed" }) : null,
          row.patchable ? null : /* @__PURE__ */ jsx9("span", { className: "hr-review-readonly", children: "not editable" })
        ] }),
        /* @__PURE__ */ jsx9("td", { className: "hr-review-cell", children: /* @__PURE__ */ jsx9("span", { className: "hr-review-cell-text", children: cellText(row.current) }) }),
        /* @__PURE__ */ jsx9("td", { className: "hr-review-cell hr-review-proposed", children: /* @__PURE__ */ jsx9("span", { className: "hr-review-cell-text", children: row.changed ? cellText(row.proposed) : cellText(row.current) }) })
      ] }, row.field)) })
    ] }),
    review.note ? /* @__PURE__ */ jsxs7("div", { className: "hr-review-note", children: [
      /* @__PURE__ */ jsx9("span", { className: "hr-review-note-label", children: "From Hermes (explanation, not configuration)" }),
      /* @__PURE__ */ jsx9("p", { className: "hr-review-note-text", children: review.note })
    ] }) : null,
    review.stale ? /* @__PURE__ */ jsx9("div", { className: "hr-create-error", role: "alert", children: "The routine changed after this proposal was built. Applying it will be refused \u2014 ask Hermes for a new proposal before confirming." }) : null,
    /* @__PURE__ */ jsxs7("div", { className: "hr-review-outcomes", children: [
      /* @__PURE__ */ jsxs7("div", { className: "hr-detail", children: [
        /* @__PURE__ */ jsx9("span", { className: "hr-detail-label", children: "Apply and activate" }),
        /* @__PURE__ */ jsx9("span", { className: "hr-detail-value", children: "This routine ends active." })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "hr-detail", children: [
        /* @__PURE__ */ jsx9("span", { className: "hr-detail-label", children: "Keep paused" }),
        /* @__PURE__ */ jsx9("span", { className: "hr-detail-value", children: "This routine ends configured and paused." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "hr-create-actions", children: [
      /* @__PURE__ */ jsx9(
        "button",
        {
          type: "button",
          className: "hr-btn hr-btn-back-routines",
          disabled: busy,
          onClick: onContinueConfiguring,
          children: "Continue configuring"
        }
      ),
      /* @__PURE__ */ jsx9(
        "button",
        {
          type: "button",
          className: "hr-btn hr-btn-back-routines",
          disabled: busy,
          onClick: () => onConfirm(false),
          children: "Keep paused"
        }
      ),
      /* @__PURE__ */ jsx9(
        "button",
        {
          type: "button",
          className: "hr-btn hr-btn-create-submit",
          disabled: busy,
          onClick: () => onConfirm(true),
          children: "Apply and activate"
        }
      )
    ] })
  ] });
}

// src/views/GuidedRoutinePanel.tsx
import { Fragment as Fragment2, jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function stateSubtitle(state, failure3, profile) {
  const S = GUIDED_WORKFLOW_STATE;
  switch (state) {
    case S.PROVISIONAL_PAUSED:
    case S.CONFIGURING:
      return `The routine was created on ${profile} and will not run until its configuration is finished.`;
    case S.PROPOSAL_READY:
      return "Nothing has been applied yet. Read what Hermes proposes, then decide.";
    case S.APPLYING:
      return "The confirmed proposal is being written to the backend.";
    case S.CONFIGURED_PAUSED:
      return failure3 !== null && failure3.stage === "resume" ? "The configuration was applied and verified, but the routine could not be activated. It stays paused." : "The configuration was applied and verified. The routine stays paused.";
    case S.ACTIVATING:
      return "The resume was sent. The active state is still being verified.";
    case S.ACTIVE:
      return "The configuration was applied, verified, and the routine is running.";
    case S.NEEDS_ATTENTION:
      switch (failure3?.stage) {
        case "handoff":
          return "The pasted proposal could not be read.";
        case "stale":
          return "The proposal no longer describes this routine. Nothing was applied.";
        case "apply":
          return "The configuration could not be applied. The routine stays paused.";
        case "verify":
          return "The configuration was written but is not confirmed. The routine stays paused and must not be activated yet.";
        case "resume":
          return "The configuration is verified, but activation failed.";
        default:
          return "The routine needs attention before it can be activated.";
      }
  }
}
function GuidedRoutinePanel({
  routine,
  submittedName,
  submittedSchedule,
  submittedPrompt,
  autoSubmitOnFirstLaunch,
  onLaunch,
  onClose
}) {
  const [launching, setLaunching] = useState4(false);
  const [launch, setLaunch] = useState4(null);
  const [autoSubmit] = useState4(autoSubmitOnFirstLaunch === true);
  const [handoff, setHandoff] = useState4("");
  const [wf, setWf] = useState4(() => initialGuidedWorkflow(routine.jobId));
  const [busy, setBusy] = useState4(false);
  const firstLaunch = launch === null;
  const S = GUIDED_WORKFLOW_STATE;
  const title = routineTitle(routine.job, submittedName || "Routine");
  const schedule = humanScheduleOf(routine.job) || submittedSchedule || "\u2014";
  const instruction = routinePromptOf(routine.job) ?? submittedPrompt;
  const profile = backendTargetProfile(routine.route, routine.backendProfile);
  const review = buildProposalReview(wf.current, wf.proposal);
  const inFlight = busy || wf.state === S.APPLYING || wf.state === S.ACTIVATING;
  async function handleLaunch() {
    if (launching) return;
    setLaunching(true);
    try {
      const result = await onLaunch(
        routine,
        { name: submittedName, schedule: submittedSchedule, prompt: submittedPrompt },
        // Auto-send is a property of the FIRST launch only. A retry means
        // the user is present and re-deciding, so it drafts and lets them
        // send — a hidden second auto-send would start a conversation the
        // user never asked for.
        autoSubmit && firstLaunch
      );
      setLaunch(result);
      if (result.ok) setWf(guidedWorkflowReducer(wf, { type: "chat-launched" }));
    } finally {
      setLaunching(false);
    }
  }
  async function handleReviewProposal() {
    if (busy || inFlight) return;
    const target = {
      jobId: routine.jobId,
      connectionId: routine.route?.connectionId ?? "",
      profile: routine.backendProfile || backendTargetProfile(routine.route, "")
    };
    const accepted = submitProposalForRoutine(handoff, target);
    if (accepted.ok === false) {
      setWf(
        guidedWorkflowReducer(wf, {
          type: "handoff-rejected",
          reason: accepted.code,
          message: accepted.message
        })
      );
      return;
    }
    setBusy(true);
    try {
      const read = await readJobConfig({ route: routine.route, jobId: accepted.proposal.jobId });
      if (!read.ok) {
        setWf(
          guidedWorkflowReducer(wf, { type: "handoff-rejected", reason: "read_failed", message: read.message })
        );
        return;
      }
      if (!read.exists) {
        setWf(
          guidedWorkflowReducer(wf, {
            type: "handoff-rejected",
            reason: "job_not_found",
            message: "the routine no longer exists on its owning profile \u2014 check the routines list before reviewing"
          })
        );
        return;
      }
      setWf(
        guidedWorkflowReducer(wf, {
          type: "proposal-received",
          proposal: accepted.proposal,
          current: read.snapshot
        })
      );
      setHandoff("");
    } finally {
      setBusy(false);
    }
  }
  async function handleConfirm(desiredActive) {
    if (busy || inFlight || wf.proposal === null) return;
    const applying = guidedWorkflowReducer(wf, { type: "confirm", desiredActive });
    if (applying === wf) return;
    setWf(applying);
    setBusy(true);
    try {
      const result = await confirmProposal({
        proposal: wf.proposal,
        route: routine.route,
        desiredActive
      });
      if (result.ok) {
        const verified = guidedWorkflowReducer(applying, { type: "apply-verified", jobId: result.jobId });
        setWf(
          result.activated ? guidedWorkflowReducer(verified, { type: "activation-verified", jobId: result.jobId }) : verified
        );
        return;
      }
      setWf(
        guidedWorkflowReducer(applying, {
          type: "failed",
          stage: result.stage,
          reason: result.reason,
          message: result.message,
          recovery: result.recovery,
          jobId: result.replacementJobId ?? result.jobId
        })
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleActivate() {
    if (busy || inFlight) return;
    const activating = guidedWorkflowReducer(wf, { type: "confirm-activation" });
    if (activating === wf) return;
    setWf(activating);
    setBusy(true);
    try {
      const result = await activateConfigured({
        route: routine.route,
        jobId: wf.appliedJobId || wf.jobId
      });
      if (result.ok) {
        setWf(guidedWorkflowReducer(activating, { type: "activation-verified", jobId: result.jobId }));
        return;
      }
      setWf(
        guidedWorkflowReducer(activating, {
          type: "failed",
          stage: result.stage,
          reason: result.reason,
          message: result.message,
          recovery: result.recovery,
          jobId: result.jobId
        })
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleRefresh() {
    if (busy || inFlight) return;
    setBusy(true);
    try {
      const read = await readJobConfig({ route: routine.route, jobId: wf.appliedJobId || wf.jobId });
      if (!read.ok) {
        setWf(
          guidedWorkflowReducer(wf, {
            type: "failed",
            stage: "verify",
            reason: "refresh_failed",
            message: read.message,
            recovery: "refresh"
          })
        );
        return;
      }
      const expected = wf.current !== null && wf.proposal !== null ? proposedSnapshot(wf.current, wf.proposal.patch) : null;
      setWf(
        guidedWorkflowReducer(wf, {
          type: "refresh-result",
          exists: read.exists,
          paused: read.paused,
          configured: expected !== null && read.exists && read.snapshot.name === expected.name && read.snapshot.schedule === expected.schedule && read.snapshot.prompt === expected.prompt
        })
      );
    } finally {
      setBusy(false);
    }
  }
  const failed2 = launch !== null && launch.ok === false;
  const opened = launch !== null && launch.ok === true;
  const showHandoff = wf.state === S.PROVISIONAL_PAUSED || wf.state === S.CONFIGURING;
  const showReview = wf.state === S.PROPOSAL_READY && review !== null;
  function actionsFor() {
    const close = /* @__PURE__ */ jsx10("button", { type: "button", className: "hr-btn hr-btn-back-routines", onClick: onClose, children: "Close" });
    if (showReview) {
      return /* @__PURE__ */ jsx10("div", { className: "hr-create-actions", children: close });
    }
    if (wf.state === S.CONFIGURED_PAUSED) {
      return /* @__PURE__ */ jsxs8("div", { className: "hr-create-actions", children: [
        close,
        /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: inFlight,
            onClick: () => void handleActivate(),
            children: wf.failure !== null && wf.failure.stage === "resume" ? "Retry activation" : "Activate now"
          }
        )
      ] });
    }
    if (wf.state === S.NEEDS_ATTENTION) {
      const recovery = wf.failure?.recovery;
      return /* @__PURE__ */ jsxs8("div", { className: "hr-create-actions", children: [
        close,
        recovery === "apply" ? /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: inFlight,
            onClick: () => void handleConfirm(wf.desiredActive),
            children: "Try applying again"
          }
        ) : null,
        recovery === "activation" ? /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: inFlight,
            onClick: () => void handleActivate(),
            children: "Retry activation"
          }
        ) : null,
        recovery === "refresh" ? /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: inFlight,
            onClick: () => void handleRefresh(),
            children: "Refresh status"
          }
        ) : null
      ] });
    }
    if (wf.state === S.PROVISIONAL_PAUSED || wf.state === S.CONFIGURING) {
      return /* @__PURE__ */ jsxs8("div", { className: "hr-create-actions", children: [
        close,
        /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: launching,
            onClick: () => void handleLaunch(),
            children: launching ? "Opening\u2026" : failed2 ? "Retry chat" : "Configure with Hermes"
          }
        )
      ] });
    }
    return /* @__PURE__ */ jsx10("div", { className: "hr-create-actions", children: close });
  }
  return /* @__PURE__ */ jsxs8("aside", { className: "hr-inspector hr-create-inspector", "aria-label": "Configure routine with Hermes", children: [
    /* @__PURE__ */ jsx10("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsxs8(
      "button",
      {
        type: "button",
        className: "hr-btn-action hr-btn-back",
        onClick: onClose,
        "aria-label": "Back to routines",
        children: [
          /* @__PURE__ */ jsx10(
            "svg",
            {
              width: "12",
              height: "12",
              viewBox: "0 0 16 16",
              fill: "currentColor",
              "aria-hidden": "true",
              style: { flexShrink: 0 },
              children: /* @__PURE__ */ jsx10(
                "path",
                {
                  fillRule: "evenodd",
                  d: "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
                }
              )
            }
          ),
          /* @__PURE__ */ jsx10("span", { children: "Back to routines" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs8("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx10("h3", { className: "hr-create-title", children: title }),
      /* @__PURE__ */ jsx10("div", { className: "hr-create-active-card", children: /* @__PURE__ */ jsxs8("div", { className: "hr-create-active-info", children: [
        /* @__PURE__ */ jsx10("span", { className: "hr-create-active-title", children: guidedIndicator(wf.state, wf.failure) }),
        /* @__PURE__ */ jsx10("span", { className: "hr-create-active-subtitle", children: stateSubtitle(wf.state, wf.failure, profile) })
      ] }) }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx10("label", { className: "hr-field-label", children: "Job id" }),
        /* @__PURE__ */ jsx10(
          "input",
          {
            type: "text",
            className: "hr-create-input",
            value: routine.jobId,
            disabled: true,
            readOnly: true,
            "aria-label": "Routine job id"
          }
        )
      ] }),
      showReview && review !== null ? /* @__PURE__ */ jsx10(
        GuidedProposalReview,
        {
          review,
          busy: inFlight,
          onConfirm: (desiredActive) => void handleConfirm(desiredActive),
          onContinueConfiguring: () => setWf(guidedWorkflowReducer(wf, { type: "continue-configuring" }))
        }
      ) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
        /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
          /* @__PURE__ */ jsx10("label", { className: "hr-field-label", children: "What should this routine do?" }),
          /* @__PURE__ */ jsx10(
            "textarea",
            {
              className: "hr-create-textarea",
              rows: 3,
              value: instruction ?? "",
              disabled: true,
              readOnly: true,
              "aria-label": "What this routine does",
              placeholder: "No instruction stored for this routine."
            }
          )
        ] }),
        /* @__PURE__ */ jsxs8("div", { className: "hr-create-when-section", children: [
          /* @__PURE__ */ jsx10("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
          /* @__PURE__ */ jsx10("div", { className: "hr-create-preview-sentence", children: schedule })
        ] })
      ] }),
      wf.failure !== null ? /* @__PURE__ */ jsx10("div", { className: "hr-create-error", role: "alert", children: wf.failure.message }) : null,
      failed2 ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-error", role: "alert", children: [
        launch.message,
        launch.jobId ? " The routine is still paused." : ""
      ] }) : null,
      opened ? /* @__PURE__ */ jsx10("div", { className: "hr-create-preview-sentence", role: "status", children: launch.autoSubmitted ? "Chat opened on this profile and the configuration envelope was sent." : "Chat opened on this profile with the configuration envelope ready to send." }) : null,
      showHandoff ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx10("label", { className: "hr-field-label", htmlFor: "hr-guided-handoff", children: "Proposal returned by Hermes" }),
        /* @__PURE__ */ jsx10(
          "textarea",
          {
            id: "hr-guided-handoff",
            className: "hr-create-textarea",
            rows: 4,
            value: handoff,
            onChange: (e) => setHandoff(e.target.value),
            "aria-label": "Paste the proposal object Hermes returned",
            placeholder: '{"version":1,"jobId":"\u2026","owner":{\u2026},"base":{\u2026},"patch":{\u2026},"desiredActive":false}'
          }
        ),
        /* @__PURE__ */ jsx10("div", { className: "hr-create-actions", children: /* @__PURE__ */ jsx10(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-create-submit",
            disabled: inFlight || handoff.trim().length === 0,
            onClick: () => void handleReviewProposal(),
            children: busy ? "Reading\u2026" : "Review proposal"
          }
        ) })
      ] }) : null,
      actionsFor(),
      /* @__PURE__ */ jsx10("p", { className: "hr-sr-only", role: "status", "aria-live": "polite", children: wf.status })
    ] })
  ] });
}

// src/views/panels.tsx
import { Fragment as Fragment3, jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
function StatusLine({ text, statusRef, restatesVisibleState }) {
  return /* @__PURE__ */ jsx11(
    "p",
    {
      ref: statusRef,
      tabIndex: -1,
      className: restatesVisibleState ? "hr-status hr-sr-only" : "hr-status",
      role: "status",
      "aria-live": "polite",
      children: text || "Routines ready."
    }
  );
}

// src/views/RoutineStates.tsx
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
function LoadingState({ text }) {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-state", role: "status", "aria-live": "polite", "aria-busy": "true", children: [
    /* @__PURE__ */ jsx12("span", { className: "hr-spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx12("p", { className: "hr-state-text", children: text })
  ] });
}
function EmptyState() {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx12("p", { className: "hr-state-title", children: "No routines yet" }),
    /* @__PURE__ */ jsx12("p", { className: "hr-state-text", children: "Scheduled jobs for this profile will appear here." })
  ] });
}
function EmptyFilterState() {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx12("p", { className: "hr-state-title", children: "No routines match this filter" }),
    /* @__PURE__ */ jsx12("p", { className: "hr-state-text", children: "Try a different filter to see more routines." })
  ] });
}
function ErrorState({
  title,
  message,
  onRetry
}) {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx12("strong", { children: title }),
    /* @__PURE__ */ jsx12("p", { className: "hr-row-meta", children: message }),
    /* @__PURE__ */ jsx12("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function UnavailableState({
  profile,
  onRetry
}) {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx12("strong", { children: "Routines unavailable for this profile." }),
    /* @__PURE__ */ jsx12("p", { className: "hr-row-meta", children: profile ? `The Desktop profile \u201C${profile}\u201D has no routines route right now. Connect the profile, then retry.` : "The active Desktop profile has no routines route right now. Select a profile, then retry." }),
    /* @__PURE__ */ jsx12("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function StaleBanner({ onRetry }) {
  return /* @__PURE__ */ jsxs10("div", { className: "hr-stale", role: "status", children: [
    /* @__PURE__ */ jsx12("span", { children: "Showing last loaded jobs." }),
    /* @__PURE__ */ jsx12("button", { type: "button", className: "hr-btn hr-btn-small", onClick: onRetry, children: "Refresh" })
  ] });
}

// src/views/RoutinesPage.tsx
import { Fragment as Fragment4, jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";
function pastTense(kind) {
  if (kind === "pause") return "paused";
  if (kind === "resume") return "resumed";
  return "saved";
}
function RoutinesPage() {
  const [state, setState] = useState5(initialRoutinesState);
  const [routesNonce, setRoutesNonce] = useState5(0);
  const headingRef = useRef2(null);
  const statusRef = useRef2(null);
  const generationRef = useRef2(0);
  const activeProfile = useValue(host3.state.profile);
  const activeConnectionId = useValue(host3.state.connectionId);
  const dispatch = useCallback((event) => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);
  const activeRoute = findRouteByKey(state.routes, state.activeKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;
  const [searchQuery, setSearchQuery] = useState5("");
  const [selectedJobKey, setSelectedJobKey] = useState5(null);
  const [isCreating, setIsCreating] = useState5(false);
  const [guided, setGuided] = useState5(null);
  useEffect3(() => {
    if (selectedJobKey === null) return;
    const stillThere = state.jobs.some(
      (job, index) => routineKey(job, `routine ${index + 1}`) === selectedJobKey
    );
    if (!stillThere) setSelectedJobKey(null);
  }, [state.jobs, selectedJobKey]);
  const filteredJobs = useMemo2(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shown;
    return shown.filter((job) => {
      const name = (routineTitle(job, "") || jobIdOf(job)).toLowerCase();
      const schedule = (humanScheduleOf(job) || "").toLowerCase();
      return name.includes(q) || schedule.includes(q);
    });
  }, [shown, searchQuery]);
  const selectedJob = useMemo2(() => {
    if (!selectedJobKey) return null;
    return state.jobs.find(
      (j, index) => routineKey(j, `routine ${index + 1}`) === selectedJobKey
    ) ?? null;
  }, [state.jobs, selectedJobKey]);
  const selectedJobId = selectedJob ? jobIdOf(selectedJob) : "";
  const selectedJobLabel = selectedJob ? routineTitle(selectedJob, selectedJobKey || "Routine") : selectedJobKey || "Routine";
  useEffect3(() => {
    let cancelled = false;
    dispatch({ type: "routes-loading" });
    void (async () => {
      try {
        const routes = await listProfileRoutes();
        if (cancelled) return;
        dispatch({
          type: "routes-loaded",
          routes,
          profile: host3.state.profile.get(),
          connectionId: host3.state.connectionId.get()
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
  useEffect3(() => {
    if (state.status === S.ROUTES_LOADING || state.status === S.ROUTES_ERROR) return;
    if (state.routes.length === 0 && state.status !== S.ROUTE_UNAVAILABLE) return;
    dispatch({ type: "active-changed", profile: activeProfile, connectionId: activeConnectionId });
  }, [activeProfile, activeConnectionId, state.status, state.routes.length, dispatch, S.ROUTES_LOADING, S.ROUTES_ERROR, S.ROUTE_UNAVAILABLE]);
  useEffect3(() => {
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
  useEffect3(() => {
    if (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) statusRef.current?.focus();
  }, [state.status, S.ROUTES_ERROR, S.LIST_ERROR]);
  function handleRetryRoutes() {
    setRoutesNonce((nonce) => nonce + 1);
  }
  async function runMutation(kind, jobId, label, build) {
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
      dispatch(kind === "pause" ? { type: "optimistic-pause", jobId } : { type: "optimistic-resume", jobId });
    }
    dispatch({ type: "mutate-start", jobId });
    try {
      await requestCronForRoute(activeRoute, "cron.manage", params, void 0, {
        spawnPriority: "foreground"
      });
      dispatch({ type: "mutate-end", jobId });
      dispatch({ type: "notice", notice: "routine " + label + " " + pastTense(kind) });
      dispatch({ type: "retry-list" });
      return true;
    } catch (err) {
      dispatch({ type: "mutate-end", jobId });
      if (isSafeOptimistic(kind)) dispatch({ type: "optimistic-rollback" });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to " + kind + " routine").message });
      return false;
    }
  }
  function handlePause(jobId, label) {
    if (locked || !jobId || !activeRoute) return;
    const route = activeRoute;
    void runMutation("pause", jobId, label, () => buildPauseParams(route, jobId));
  }
  function handleResume(jobId, label) {
    if (locked || !jobId || !activeRoute) return;
    const route = activeRoute;
    void runMutation("resume", jobId, label, () => buildResumeParams(route, jobId));
  }
  async function handleCreateRoutine(name, schedule, prompt, active) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    const route = activeRoute;
    const createSlot = "";
    try {
      const addParams = buildAddParams(route, { name, schedule, prompt });
      dispatch({ type: "mutate-start", jobId: createSlot });
      const created = await requestCronForRoute(route, "cron.manage", addParams, void 0, {
        spawnPriority: "foreground"
      });
      const outcome = cronOutcomeOf(created);
      if (!outcome.ok) {
        dispatch({ type: "mutate-end", jobId: createSlot });
        dispatch({ type: "mutation-error", error: "failed to create routine: " + outcome.error });
        return false;
      }
      if (!active) {
        const createdId = jobIdFromResponse(created);
        if (!createdId) {
          dispatch({ type: "mutate-end", jobId: createSlot });
          dispatch({ type: "retry-list" });
          setIsCreating(false);
          dispatch({
            type: "notice",
            notice: "routine " + name + " created \u2014 the backend returned no job id, so it stays active"
          });
          return true;
        }
        const pauseParams = buildPauseParams(route, createdId);
        const paused = await requestCronForRoute(route, "cron.manage", pauseParams, void 0, {
          spawnPriority: "foreground"
        });
        const pauseOutcome = cronOutcomeOf(paused);
        if (!pauseOutcome.ok) {
          dispatch({ type: "mutate-end", jobId: createSlot });
          dispatch({ type: "retry-list" });
          setIsCreating(false);
          dispatch({
            type: "mutation-error",
            error: "routine " + name + " was created but the backend refused to pause it (" + pauseOutcome.error + ") \u2014 it may still run on its schedule"
          });
          return false;
        }
      }
      dispatch({ type: "mutate-end", jobId: createSlot });
      dispatch({ type: "notice", notice: "routine " + name + " created" });
      dispatch({ type: "retry-list" });
      setIsCreating(false);
      return true;
    } catch (err) {
      dispatch({ type: "mutate-end", jobId: createSlot });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to create routine").message });
      return false;
    }
  }
  async function handleCreateGuided(name, schedule, prompt) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    const createSlot = "";
    dispatch({ type: "mutate-start", jobId: createSlot });
    try {
      const result = await createProvisionalRoutine({ route: activeRoute, name, schedule, prompt });
      dispatch({ type: "mutate-end", jobId: createSlot });
      dispatch({ type: "retry-list" });
      if (result.ok === false) {
        dispatch({ type: "mutation-error", error: "failed to create routine: " + result.message });
        return false;
      }
      setGuided({ routine: result.routine, name, schedule, prompt });
      setIsCreating(false);
      setSelectedJobKey(null);
      dispatch({ type: "notice", notice: "routine " + name + " created paused \u2014 it needs configuration" });
      return true;
    } catch (err) {
      dispatch({ type: "mutate-end", jobId: createSlot });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to create routine").message });
      return false;
    }
  }
  async function handleGuidedLaunch(routine, submitted, autoSubmit) {
    return launchGuidedConfiguration({ routine, submitted, autoSubmit });
  }
  function renderList() {
    const totalCount = state.jobs.length;
    const shownCount = filteredJobs.length;
    const isReduced = shownCount < totalCount;
    const countText = isReduced ? `Showing ${shownCount} of ${totalCount} routines.` : `Showing all ${totalCount} routines.`;
    return /* @__PURE__ */ jsxs11(Fragment4, { children: [
      /* @__PURE__ */ jsxs11("div", { className: "hr-toolbar", children: [
        /* @__PURE__ */ jsxs11("div", { className: "hr-search-wrap", children: [
          /* @__PURE__ */ jsx13(
            "input",
            {
              type: "text",
              className: "hr-search-input",
              placeholder: "Search routines\u2026",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              "aria-label": "Search routines"
            }
          ),
          searchQuery ? /* @__PURE__ */ jsx13(
            "button",
            {
              type: "button",
              className: "hr-search-clear",
              onClick: () => setSearchQuery(""),
              "aria-label": "Clear search",
              children: /* @__PURE__ */ jsx13("svg", { width: "10", height: "10", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx13("path", { d: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" }) })
            }
          ) : null
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "hr-filters-col", children: [
          /* @__PURE__ */ jsx13(
            FilterNav,
            {
              filter: state.filter,
              disabled: locked,
              onSelect: (value) => dispatch({ type: "filter-changed", filter: value })
            }
          ),
          state.status === S.READY && totalCount > 0 ? /* @__PURE__ */ jsx13("span", { className: "hr-count-right", children: countText }) : null
        ] })
      ] }),
      filteredJobs.length === 0 ? state.jobs.length === 0 ? /* @__PURE__ */ jsx13(EmptyState, {}) : /* @__PURE__ */ jsx13(EmptyFilterState, {}) : /* @__PURE__ */ jsx13(
        RoutineList,
        {
          jobs: filteredJobs,
          pending: state.pending,
          locked,
          inspectedId: selectedJobKey,
          onInspect: (key) => {
            setSelectedJobKey(key);
            if (key) {
              setIsCreating(false);
              setGuided(null);
            }
          },
          onPause: handlePause,
          onResume: handleResume
        }
      )
    ] });
  }
  let liveText = "";
  let liveRestatesVisible = false;
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = "Loading routines.";
  else if (state.status === S.LIST_LOADING) liveText = "Loading routines.";
  else if (state.status === S.ROUTE_UNAVAILABLE) liveText = "Routines unavailable for this profile.";
  else if (state.status === S.READY) {
    if (state.jobs.length === 0) {
      liveText = "No routines yet.";
      liveRestatesVisible = true;
    } else {
      liveText = `Showing ${filteredJobs.length} of ${state.jobs.length} routines.`;
      liveRestatesVisible = true;
    }
  }
  const body = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(/* @__PURE__ */ jsx13(LoadingState, { text: "Loading routines." }, "routes-loading"));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      /* @__PURE__ */ jsx13(
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
      /* @__PURE__ */ jsx13(
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
        /* @__PURE__ */ jsx13(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-loading")
      );
      body.push(/* @__PURE__ */ jsx13("div", { children: renderList() }, "stale-list"));
    } else {
      body.push(/* @__PURE__ */ jsx13(LoadingState, { text: "Loading routines." }, "list-loading"));
    }
  } else if (state.status === S.LIST_ERROR) {
    if (state.jobs.length > 0) {
      body.push(
        /* @__PURE__ */ jsx13(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-error")
      );
      body.push(/* @__PURE__ */ jsx13("div", { children: renderList() }, "stale-list-error"));
    }
    body.push(
      /* @__PURE__ */ jsx13(
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
    body.push(/* @__PURE__ */ jsx13("div", { children: renderList() }, "ready-list"));
  }
  const profileLabel = typeof activeProfile === "string" && activeProfile ? activeProfile : "\u2014";
  return /* @__PURE__ */ jsxs11("section", { id: "hermes-routines-root", className: "hr-root", "aria-labelledby": "hermes-routines-heading", children: [
    /* @__PURE__ */ jsx13("style", { children: ROUTINES_CSS }),
    /* @__PURE__ */ jsxs11("div", { className: "hr-workspace", children: [
      /* @__PURE__ */ jsxs11("div", { className: `hr-feed-column${!selectedJob && !guided && !isCreating ? " hr-feed-contained" : ""}`, children: [
        /* @__PURE__ */ jsxs11("header", { className: "hr-header", children: [
          /* @__PURE__ */ jsxs11("div", { className: "hr-header-top", children: [
            /* @__PURE__ */ jsx13("h2", { id: "hermes-routines-heading", ref: headingRef, tabIndex: -1, className: "hr-title", children: "Routines" }),
            /* @__PURE__ */ jsx13(
              "button",
              {
                type: "button",
                className: "hr-btn-new",
                onClick: () => {
                  setSelectedJobKey(null);
                  setGuided(null);
                  setIsCreating(true);
                },
                "aria-label": "New routine",
                title: "New routine",
                children: /* @__PURE__ */ jsxs11(
                  "svg",
                  {
                    width: "18",
                    height: "18",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2.5",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    "aria-hidden": "true",
                    children: [
                      /* @__PURE__ */ jsx13("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
                      /* @__PURE__ */ jsx13("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
                    ]
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxs11("span", { className: "hr-sr-only", children: [
              "Profile: ",
              profileLabel
            ] })
          ] }),
          /* @__PURE__ */ jsx13("p", { className: "hr-sub", children: "Routines are scheduled jobs this profile runs to do recurring tasks." })
        ] }),
        body
      ] }),
      selectedJob ? /* @__PURE__ */ jsx13(
        RoutineInspectorPanel,
        {
          job: selectedJob,
          fallback: selectedJobKey || "Routine",
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          busy: selectedJobId !== "" && state.pending.indexOf(selectedJobId) !== -1,
          disabled: locked,
          onClose: () => setSelectedJobKey(null),
          onPause: () => handlePause(selectedJobId, selectedJobLabel),
          onResume: () => handleResume(selectedJobId, selectedJobLabel)
        }
      ) : guided ? /* @__PURE__ */ jsx13(
        GuidedRoutinePanel,
        {
          routine: guided.routine,
          submittedName: guided.name,
          submittedSchedule: guided.schedule,
          submittedPrompt: guided.prompt,
          onLaunch: handleGuidedLaunch,
          onClose: () => setGuided(null)
        }
      ) : isCreating ? /* @__PURE__ */ jsx13(
        RoutineComposerPanel,
        {
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          disabled: locked,
          onClose: () => setIsCreating(false),
          onSubmit: handleCreateRoutine,
          onSubmitGuided: handleCreateGuided
        }
      ) : null
    ] }),
    /* @__PURE__ */ jsx13(StatusLine, { text: liveText, statusRef, restatesVisibleState: liveRestatesVisible })
  ] });
}

// src/plugin.tsx
import { jsx as jsx14 } from "react/jsx-runtime";
function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => /* @__PURE__ */ jsx14(RoutinesPage, {})
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
  description: "Standalone Hermes Desktop plugin for managing scheduled routines",
  defaultEnabled: false,
  version: "0.1.0",
  register
};
var plugin_default = plugin;
export {
  DAYS_OF_MONTH,
  DAYS_OF_WEEK,
  DEFAULT_SCHEDULE_CONFIG,
  GUIDED_CHAT_DRAFT,
  GUIDED_ENVELOPE_MARKER,
  GUIDED_TRANSITIONS,
  GUIDED_WORKFLOW_STAGE,
  GUIDED_WORKFLOW_STATE,
  GuidedProposalReview,
  GuidedRoutinePanel,
  INTERVAL_UNITS,
  INTERVAL_VALUES,
  PLUGIN_ID,
  PLUGIN_NAME,
  ROUTE_ID,
  ROUTE_PATH,
  ROUTINES_VIEW_STATUS,
  ROUTINE_PROPOSAL_VERSION,
  ResultTone,
  RoutineComposerPanel,
  RoutineDetails,
  RoutineInspectorPanel,
  RoutinesPage,
  RunWhen,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
  SelectField,
  TIME_SLOTS,
  TRIGGER_OPTIONS,
  activateConfigured,
  activeRouteKey,
  addJob,
  applyValidatedProposal,
  assertRoutingOptions,
  assertTimeoutMs,
  backendTargetProfile,
  buildAddParams,
  buildCronExpression,
  buildGuidedEnvelope,
  buildListParams,
  buildPauseParams,
  buildProposalReview,
  buildRemoveParams,
  buildResumeParams,
  canGuidedTransition,
  coerceRoutes,
  collapsedSubtitleOf,
  confirmProposal,
  createProvisionalRoutine,
  cronOutcomeOf,
  plugin_default as default,
  describeSchedule2 as describeSchedule,
  describeScheduleConfig,
  findRouteByKey,
  fingerprintJob,
  fingerprintSnapshot,
  formatDate,
  formatWhen,
  generateTimeSlots,
  guidedIndicator,
  guidedWorkflowReducer,
  humanScheduleOf,
  initialGuidedWorkflow,
  initialRoutinesState,
  isFailedStatus,
  isProposalStale,
  isSafeOptimistic,
  isValidJobId,
  issueOf,
  jobIdFromResponse,
  jobIdOf,
  jobPaused,
  lastExecutionOf,
  lastRanSuccessfully,
  lastRanWithError,
  lastResultOf,
  lastRunIso,
  lastStatusOf,
  launchGuidedConfiguration,
  listJobs,
  listProfileRoutes,
  listRoutines,
  messageOf,
  mintedRoutineFrom,
  nextRunIso,
  normalizeJobs,
  openGuidedRoutineChat,
  parseTimestamp,
  pauseJob,
  pausedConfirmedBy,
  plugin,
  profileRoute,
  proposedSnapshot,
  rawScheduleOf,
  readJobConfig,
  register,
  removeJob,
  requestCronForRoute,
  resolveActiveRoute,
  resolveProfileRoute,
  resolveProvisionalCreate,
  resumeJob,
  routeKey,
  routineActive,
  routineCompleted,
  routineErrored,
  routineHealthOf,
  routineKey,
  routinePausedOf,
  routinePromptOf,
  routineStateOf,
  routineTerminal,
  routineTitle,
  routinesViewReducer,
  runDistanceOf,
  scopedCronParams,
  serializeGuidedEnvelope,
  singleLine,
  snapshotJobConfig,
  submitProposalForRoutine,
  submitProposalHandoff,
  toOrdinal,
  validateProposal,
  validateScheduleConfig,
  visibleJobs,
  withPausedFlag,
  wrapHostError
};
