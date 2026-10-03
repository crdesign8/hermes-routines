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
import { useCallback, useEffect as useEffect2, useMemo as useMemo2, useRef as useRef2, useState as useState3 } from "react";
import { Button as Button10, Input as Input4, host as host3, useValue } from "@hermes/plugin-sdk";

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
function filterCounts(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const counts = { all: list.length, active: 0, paused: 0 };
  for (const job of list) {
    if (jobPaused(job)) counts.paused += 1;
    else counts.active += 1;
  }
  return counts;
}
function visibleJobs(jobs, filter) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (filter === "active") return list.filter((job) => !jobPaused(job));
  if (filter === "paused") return list.filter((job) => jobPaused(job));
  return list.slice();
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
var NOW_WINDOW_MS = 6e4;
function relationOfDiff(diffMs) {
  if (diffMs > NOW_WINDOW_MS) return "future";
  if (diffMs < -NOW_WINDOW_MS) return "past";
  return "now";
}
function distanceText(absMs) {
  const minutes = Math.floor(absMs / 6e4);
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")}`;
  const days = Math.round(hours / 24);
  return `${days} ${plural(days, "day")}`;
}
function runDistanceOf(iso, now) {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const elapsedMs = (now ?? /* @__PURE__ */ new Date()).getTime() - timestamp.getTime();
  return {
    text: relationOfDiff(-elapsedMs) === "past" ? `${distanceText(elapsedMs)} ago` : "just now",
    date: formatDate(iso ?? null)
  };
}
function nextRunCopyOf(iso, now) {
  const timestamp = parseTimestamp(iso ?? null);
  if (timestamp === null) return null;
  const diffMs = timestamp.getTime() - (now ?? /* @__PURE__ */ new Date()).getTime();
  const date = formatDate(iso ?? null);
  const relation = relationOfDiff(diffMs);
  if (relation === "future") {
    const distance = distanceText(diffMs);
    return { state: "future", text: `in ${distance}`, sentence: `Next run in ${distance}`, date };
  }
  if (relation === "past") {
    const distance = distanceText(-diffMs);
    return { state: "overdue", text: `overdue by ${distance}`, sentence: `Overdue by ${distance}`, date };
  }
  return { state: "now", text: "due now", sentence: "Due now", date };
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
    nextRun: routineActive(job) ? nextRunCopyOf(nextRunIso(job)) : null
  };
}
function routineHealthOf(job) {
  if (job === null || job === void 0) return "unknown";
  if (routineCompleted(job)) return "completed";
  if (routineErrored(job)) return "failed";
  if (routinePausedOf(job)) return "paused";
  if (lastRanSuccessfully(job)) return "healthy";
  if (lastRanWithError(job)) return "failed";
  return "unknown";
}
function collapsedSubtitleOf(job) {
  if (routineCompleted(job)) return "Completed";
  if (routineErrored(job)) return "Error";
  if (routinePausedOf(job)) return "Paused";
  const base = humanScheduleOf(job) || "\u2014";
  const next = nextRunCopyOf(nextRunIso(job));
  if (next === null) return base;
  return `${base}  |  ${next.sentence}`;
}
function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return null;
  return new Date(time);
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

// src/domain/attention.ts
var NONE = { needsAttention: false, reason: null };
function attentionOf(job) {
  if (job === null || job === void 0) return NONE;
  if (jobIdOf(job) === "") return NONE;
  if (routineCompleted(job)) return NONE;
  if (routineErrored(job)) return { needsAttention: true, reason: "lifecycle-error" };
  if (lastRanSuccessfully(job)) return NONE;
  if (routinePausedOf(job)) return NONE;
  if (isFailedStatus(job)) return { needsAttention: true, reason: "current-failure" };
  return NONE;
}
function needsAttention(job) {
  return attentionOf(job).needsAttention;
}
function attentionTargets(jobs) {
  if (!Array.isArray(jobs)) return [];
  return jobs.filter((job) => attentionOf(job).needsAttention);
}
function attentionCount(jobs) {
  return attentionTargets(jobs).length;
}

// src/domain/diagnostics.ts
var GUIDED_DIAG_STAGES = Object.freeze({
  /** The provisional create did not reach the paused invariant. */
  PROVISIONAL_CREATE: "provisional-create",
  /** The configuration chat could not be opened. */
  SESSION_LAUNCH: "session-launch",
  /** A pasted proposal failed validation before any backend read. */
  PROPOSAL_VALIDATION: "proposal-validation",
  /** A proposal was refused because its target moved or vanished. */
  STALE_REJECTION: "stale-rejection",
  /** The deterministic write did not reach replaced-and-paused. */
  APPLY: "apply",
  /** The write happened but backend truth could not confirm it. */
  VERIFICATION: "verification",
  /** A verified configuration could not be resumed and proven active. */
  ACTIVATION: "activation"
});
function isStage(value) {
  return typeof value === "string" && Object.values(GUIDED_DIAG_STAGES).indexOf(value) !== -1;
}
var RETRIABLE_REASONS = /* @__PURE__ */ new Set([
  "list_failed",
  "read_failed",
  "refresh_failed",
  "verification_unreadable",
  "verification_missing",
  "truth_unconfirmed",
  "truth_unreadable",
  "session_target_unreadable",
  "create_rejected",
  "pause_rejected",
  "no_new_chat",
  "no_composer",
  "draft_not_claimed"
]);
function isRetriableDiagReason(reason) {
  return typeof reason === "string" && RETRIABLE_REASONS.has(reason);
}
function recordGuidedDiag(stage, reason) {
  if (!isStage(stage)) {
    throw new TypeError(`unknown guided diagnostics stage: ${String(stage)}`);
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new TypeError("a guided diagnostics record requires a non-empty reason code");
  }
  const code = reason.trim();
  return Object.freeze({ stage, reason: code, retriable: isRetriableDiagReason(code) });
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
var RUN_EVIDENCE_KEYS = Object.freeze([
  "last_run_at",
  "lastRunAt",
  "last_run",
  "lastRun",
  "last_status",
  "lastStatus",
  "last_fire_error",
  "lastFireError",
  "last_error",
  "lastError"
]);
function hasRunEvidence(job) {
  for (const key of RUN_EVIDENCE_KEYS) {
    const value = job[key];
    if (typeof value === "string" && value.trim() !== "") return true;
    if (value !== void 0 && value !== null && typeof value !== "string") return true;
  }
  return false;
}
function guidedConfigCandidateOf(job) {
  if (job === null || job === void 0) return null;
  const row = job;
  const id = typeof row.job_id === "string" ? row.job_id.trim() : "";
  if (!id) return null;
  if (!jobPaused(row)) return null;
  if (hasRunEvidence(row)) return null;
  return { jobId: id };
}
function buildReopenHandle(route, job) {
  const candidate = guidedConfigCandidateOf(job);
  if (candidate === null) return null;
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return null;
  const backendProfile = backendTargetProfile(route, "") || null;
  if (!backendProfile) return null;
  return {
    jobId: candidate.jobId,
    route,
    backendProfile,
    createdPaused: true,
    job: job ?? null
  };
}
function diagOfProvisionalResult(result) {
  if (result.ok) return recordGuidedDiag(GUIDED_DIAG_STAGES.PROVISIONAL_CREATE, "ok");
  return recordGuidedDiag(GUIDED_DIAG_STAGES.PROVISIONAL_CREATE, result.reason);
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
    snapshot: null,
    attentionFocus: null,
    configFocus: null
  };
}
function profileText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function pruneAttentionFocus(focus, jobs) {
  if (focus === null) return null;
  const alive = attentionTargets(jobs).map((job) => jobIdOf(job)).filter((id) => id !== "");
  const kept = focus.filter((id) => alive.indexOf(id) !== -1);
  return kept.length > 0 ? kept : null;
}
function pruneConfigFocus(focus, jobs) {
  if (focus === null) return null;
  const alive = [];
  for (const job of jobs) {
    const candidate = guidedConfigCandidateOf(job);
    if (candidate !== null && alive.indexOf(candidate.jobId) === -1) alive.push(candidate.jobId);
  }
  const kept = focus.filter((id) => alive.indexOf(id) !== -1);
  return kept.length > 0 ? kept : null;
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
        snapshot: null,
        attentionFocus: null,
        configFocus: null
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
          snapshot: null,
          attentionFocus: null,
          configFocus: null
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
        snapshot: null,
        attentionFocus: null,
        configFocus: null
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
        jobs: [],
        attentionFocus: null,
        configFocus: null
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
        snapshot: null,
        attentionFocus: null,
        configFocus: null
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
          snapshot: null,
          attentionFocus: null,
          configFocus: null
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
        snapshot: null,
        attentionFocus: null,
        configFocus: null
      };
    }
    case "list-loading":
      return { ...base, status: S.LIST_LOADING, error: null };
    case "list-loaded": {
      if (typeof event.key !== "string" || event.key !== base.activeKey) return base;
      const jobs = normalizeJobs(event.jobs);
      return {
        ...base,
        status: S.READY,
        jobs,
        error: null,
        snapshot: null,
        pending: [],
        // A focus is a claim about specific rows, so it is re-checked
        // against the inventory that just arrived. A routine that recovered
        // (or was deleted) leaves the focus, and a focus left with nothing in
        // it is dropped entirely — an empty focus would empty the list and
        // leave the user on a blank page with no control that says why.
        attentionFocus: pruneAttentionFocus(base.attentionFocus, jobs),
        // The configuration focus is re-derived the same way: a routine
        // that ran, resumed, or vanished is no longer a candidate and
        // leaves it, and an emptied focus is dropped instead of blanking
        // the page.
        configFocus: pruneConfigFocus(base.configFocus, jobs)
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
        filter: event.filter === "active" || event.filter === "paused" ? event.filter : "all",
        // A lifecycle chip is a different question from either focus, and
        // the user answering one has answered the other: they are no longer
        // looking at "what is failing" or "what needs configuration".
        // Keeping any of them would leave the list showing a slice of one
        // question while a focus bar claims another, with no way back to
        // the rest of the list.
        attentionFocus: null,
        configFocus: null
      };
    case "attention-focus": {
      const ids = attentionTargets(event.jobs).map((job) => jobIdOf(job)).filter((id) => id !== "");
      if (ids.length === 0) return { ...base, attentionFocus: null };
      return { ...base, filter: "all", attentionFocus: ids, configFocus: null };
    }
    case "attention-focus-cleared":
      return base.attentionFocus === null ? base : { ...base, attentionFocus: null };
    case "config-focus": {
      const ids = [];
      const rows = Array.isArray(event.jobs) ? event.jobs : [];
      for (const job of rows) {
        const candidate = guidedConfigCandidateOf(job);
        if (candidate !== null && ids.indexOf(candidate.jobId) === -1) ids.push(candidate.jobId);
      }
      if (ids.length === 0) return { ...base, configFocus: null };
      return { ...base, filter: "all", attentionFocus: null, configFocus: ids };
    }
    case "config-focus-cleared":
      return base.configFocus === null ? base : { ...base, configFocus: null };
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

// src/domain/advancedSettings.ts
var DELIVERY_GRAMMAR = "local, all, bot-chat[:profile], or platform:chat_id[:thread_id]";
var MAX_DELIVERY_LENGTH = 256;
var CONTROL_CHARS_RE2 = /[\x00-\x1F\x7F]/;
var DELIVERY_ROW_KEYS = ["deliver", "delivery", "deliver_to", "deliverTo"];
var MODEL_ROW_KEYS = ["model", "model_override", "modelOverride", "override_model"];
var RESERVED_FIRST_SEGMENTS = /* @__PURE__ */ new Set(["local", "all", "bot-chat", "origin"]);
function absent() {
  return { ok: true, present: false, delivery: null };
}
function present(delivery) {
  return { ok: true, present: true, delivery };
}
function refused(message) {
  return { ok: false, code: "bad_delivery", message };
}
function grammarRefusal(received) {
  return refused(
    `unsupported delivery ${JSON.stringify(received)} \u2014 delivery is one of: ${DELIVERY_GRAMMAR}`
  );
}
function normalizeDelivery(value) {
  if (value === void 0 || value === null) return absent();
  if (typeof value !== "string") return grammarRefusal(JSON.stringify(value) ?? String(value));
  const text = value.trim();
  if (text === "") return absent();
  if (text.length > MAX_DELIVERY_LENGTH) {
    return refused("delivery must be at most 256 chars");
  }
  if (CONTROL_CHARS_RE2.test(text)) {
    return refused("delivery must not contain control characters");
  }
  const lowered = text.toLowerCase();
  if (lowered === "origin") {
    return refused(
      `delivery "origin" is not supported for plugin creates \u2014 it resolves to the creating session target, which only exists for cron-session creates; use one of: ${DELIVERY_GRAMMAR}`
    );
  }
  if (lowered === "local") return present("local");
  if (lowered === "all") return present("all");
  if (lowered === "bot-chat") return present("bot-chat");
  if (text.startsWith("bot-chat:") || lowered.startsWith("bot-chat:")) {
    const profile = text.slice(text.indexOf(":") + 1).trim();
    if (!profile || profile.includes(":") || CONTROL_CHARS_RE2.test(profile)) {
      return grammarRefusal(text);
    }
    return present(`bot-chat:${profile}`);
  }
  const parts = text.split(":");
  if (parts.length === 2 || parts.length === 3) {
    const platform = (parts[0] ?? "").trim();
    const chatId = (parts[1] ?? "").trim();
    if (!platform || !chatId) return grammarRefusal(text);
    if (RESERVED_FIRST_SEGMENTS.has(platform.toLowerCase())) return grammarRefusal(text);
    if (parts.length === 3) {
      const thread = (parts[2] ?? "").trim();
      if (!thread) return grammarRefusal(text);
      return present(`${platform}:${chatId}:${thread}`);
    }
    return present(`${platform}:${chatId}`);
  }
  return grammarRefusal(text);
}
function firstStoredText(row, keys) {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function readStoredDelivery(row) {
  return firstStoredText(row, DELIVERY_ROW_KEYS);
}
function readStoredModelOverride(row) {
  return firstStoredText(row, MODEL_ROW_KEYS);
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
  const delivery = normalizeDelivery((input || {}).delivery);
  if (!delivery.ok) {
    throw new TypeError(delivery.message);
  }
  if (!delivery.present) {
    return { ...shaped, profile: target };
  }
  return { ...shaped, deliver: delivery.delivery, profile: target };
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
var RETRIABLE_GATEWAY_PATTERNS = [
  /timed?\s?out/i,
  /\btimeout\b/i,
  /\beconn\w*/i,
  /\beai_again\b/i,
  /\bsocket\b/i,
  /\bnetwork\b/i,
  /fetch\s+failed/i,
  /temporar\w*\s+unavailable/i,
  /service\s+unavailable/i,
  /\b503\b/,
  /\b502\b/,
  /\b504\b/,
  /rate[\s_-]?limit/i,
  /overloaded/i,
  /try\s+again/i,
  /connection\s+(reset|refused|closed|aborted)/i
];
function isRetriableGatewayError(message) {
  if (typeof message !== "string" || !message.trim()) return false;
  return RETRIABLE_GATEWAY_PATTERNS.some((pattern) => pattern.test(message));
}

// src/gateway/provisionalCreate.ts
async function createProvisionalRoutine(request) {
  const { route, name, schedule, prompt, delivery } = request;
  let addParams;
  let pauseOf;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt, delivery });
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

// src/domain/destinations.ts
var DESTINATION_DEFAULT = "";
var DESTINATION_HISTORY = "local";
var DESTINATION_BROADCAST = "all";
var DESTINATION_ADVANCED = "advanced";
var DEFAULT_OPTION = Object.freeze({
  value: DESTINATION_DEFAULT,
  label: "Use my default destination",
  detail: "Results go wherever this profile normally sends its results.",
  broadcast: false
});
var HISTORY_OPTION = Object.freeze({
  value: DESTINATION_HISTORY,
  label: "Keep in routine history only",
  detail: "Results are saved with the routine and are not sent anywhere.",
  broadcast: false
});
var BROADCAST_OPTION = Object.freeze({
  value: DESTINATION_BROADCAST,
  label: "Send to every connected channel",
  detail: "Results are delivered to every channel this profile is connected to. Nothing narrows this later, so pick it only when that is the intent.",
  broadcast: true
});
var BROADCAST_ACKNOWLEDGEMENT = "I understand this delivers results to every connected channel.";
var BROADCAST_ADVANCED_ACTION = "Send to every connected channel instead";
var BROADCAST_ADDRESS_ACTION = "Use a specific address instead";
var BROADCAST_REVIEW_WARNING = "This proposal delivers results to every connected channel. Apply it only if that is what you asked for.";
var GUIDED_BROADCAST_CONSTRAINT = [
  "Delivery:",
  "Prefer the profile default, routine history, or one specific destination.",
  'Propose delivery "all" (results to every connected channel) only when the user stated that every connected channel should receive them.',
  "A request to send, notify, or deliver the results is not that statement."
].join("\n");
function broadcastDestinationOption() {
  return BROADCAST_OPTION;
}
function isBroadcastDelivery(value) {
  return typeof value === "string" && value.trim().toLowerCase() === DESTINATION_BROADCAST;
}
function baseDestinationOptions() {
  return [DEFAULT_OPTION, HISTORY_OPTION];
}
function botChatLabel(profile) {
  return `Bot Chat \u2192 ${profile}`;
}
function botChatDestinations(routes) {
  if (!Array.isArray(routes)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of routes) {
    if (candidate === null || typeof candidate !== "object") continue;
    const route = candidate;
    if (route.mode !== "local") continue;
    const profile = typeof route.targetProfile === "string" && route.targetProfile.trim() ? route.targetProfile.trim() : typeof route.profile === "string" && route.profile.trim() ? route.profile.trim() : "";
    if (!profile) continue;
    const value = `bot-chat:${profile}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: botChatLabel(profile),
      detail: "Results arrive in that profile\u2019s own Hermes Bot Chat.",
      broadcast: false
    });
  }
  return out;
}
function destinationOptions(routes) {
  return [...baseDestinationOptions(), ...botChatDestinations(routes)];
}
function findDestinationOption(options, value) {
  if (typeof value !== "string") return null;
  for (const option of options) {
    if (option.value === value) return option;
  }
  return null;
}
function describeDestination(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) {
    return {
      label: DEFAULT_OPTION.label,
      detail: DEFAULT_OPTION.detail,
      resolved: true,
      broadcast: false
    };
  }
  if (text === DESTINATION_HISTORY) {
    return {
      label: HISTORY_OPTION.label,
      detail: HISTORY_OPTION.detail,
      resolved: true,
      broadcast: false
    };
  }
  if (text === DESTINATION_BROADCAST) {
    return {
      label: BROADCAST_OPTION.label,
      detail: BROADCAST_OPTION.detail,
      resolved: true,
      broadcast: true
    };
  }
  const botChat = /^bot-chat:([^:]+)$/i.exec(text);
  if (botChat !== null) {
    const profile = (botChat[1] ?? "").trim();
    if (profile) {
      return {
        label: botChatLabel(profile),
        detail: "Results arrive in that profile\u2019s own Hermes Bot Chat.",
        resolved: true,
        broadcast: false
      };
    }
  }
  if (/^bot-chat$/i.test(text)) {
    return {
      label: botChatLabel("this profile"),
      detail: "Results arrive in this profile\u2019s own Hermes Bot Chat.",
      resolved: true,
      broadcast: false
    };
  }
  return { label: text, detail: "", resolved: false, broadcast: false };
}
var EMPTY_ADVANCED_DESTINATION = Object.freeze({
  platform: "",
  chatId: "",
  threadId: ""
});
var MAX_PART_LENGTH = 128;
function advancedDestinationDelivery(input) {
  const platform = (input?.platform ?? "").trim();
  const chatId = (input?.chatId ?? "").trim();
  const threadId = (input?.threadId ?? "").trim();
  if (!platform) {
    return {
      ok: false,
      code: "bad_delivery",
      message: "an advanced destination needs a platform and an address"
    };
  }
  if (!chatId) {
    return {
      ok: false,
      code: "bad_delivery",
      message: "an advanced destination needs an address for the selected platform"
    };
  }
  for (const part of [platform, chatId, threadId]) {
    if (part.length > MAX_PART_LENGTH) {
      return {
        ok: false,
        code: "bad_delivery",
        message: "an advanced destination field must be at most 128 chars"
      };
    }
    if (part.includes(":")) {
      return {
        ok: false,
        code: "bad_delivery",
        message: 'an advanced destination field must not contain ":"'
      };
    }
  }
  return normalizeDelivery(threadId ? `${platform}:${chatId}:${threadId}` : `${platform}:${chatId}`);
}
function destinationDelivery(choice, advanced = EMPTY_ADVANCED_DESTINATION) {
  if (choice === DESTINATION_ADVANCED) return advancedDestinationDelivery(advanced);
  if (typeof choice !== "string") {
    return {
      ok: false,
      code: "bad_delivery",
      message: "choose where results should go"
    };
  }
  return normalizeDelivery(choice);
}
var BROADCAST_NOT_PRIMARY = {
  ok: false,
  code: "bad_delivery",
  message: "Sending to every connected channel is not a primary destination. Open advanced delivery and confirm it there."
};
var BROADCAST_UNCONFIRMED = {
  ok: false,
  code: "bad_delivery",
  message: "Confirm the delivery to every connected channel before creating the routine."
};
function composerDestinationDelivery(choice, advanced = EMPTY_ADVANCED_DESTINATION, broadcast = { optedIn: false, confirmed: false }) {
  const optedIn = broadcast.optedIn === true;
  const confirmed = broadcast.confirmed === true;
  if (choice === DESTINATION_ADVANCED && optedIn) {
    return confirmed ? destinationDelivery(DESTINATION_BROADCAST) : BROADCAST_UNCONFIRMED;
  }
  if (isBroadcastDelivery(choice)) return BROADCAST_NOT_PRIMARY;
  return destinationDelivery(choice, advanced);
}

// src/domain/guidedEnvelope.ts
var GUIDED_ENVELOPE_MARKER = "HERMES_ROUTINE_CONFIG_V1";
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
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
      // Delivery and model override read from the stored row through the
      // shared advanced-settings readers (domain/advancedSettings.ts) — the
      // same source the proposal fingerprint reads, so the session prompt
      // and the stale guard agree. Delivery is writable (see
      // routineProposal.ts); modelOverride stays read-only display, and
      // absent is reported as absent, never invented.
      delivery: orNull(singleLine(readStoredDelivery(record))),
      modelOverride: orNull(singleLine(readStoredModelOverride(record))),
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
    GUIDED_BROADCAST_CONSTRAINT,
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
  if (request.autoSubmit === true && typeof host2.composer.submit !== "function") {
    return failure("no_composer", "Update Hermes Desktop to submit a configuration chat");
  }
  try {
    host2.newChat(request.route);
  } catch {
    return failure("session_open_failed", "The configuration chat could not be opened. Retry from this routine.");
  }
  try {
    const seated = await host2.composer.setDraft(GUIDED_CHAT_DRAFT, prompt);
    if (!seated) {
      return failure("draft_not_claimed", "The new chat did not accept the prompt");
    }
    if (request.autoSubmit !== true) {
      return { ok: true, routeKey: key, autoSubmitted: false };
    }
    const sent = host2.composer.submit(GUIDED_CHAT_DRAFT, prompt);
    return sent ? { ok: true, routeKey: key, autoSubmitted: true } : failure("submit_not_accepted", "The new chat did not submit the prompt. Retry to start configuration.");
  } catch {
    return failure("submit_not_accepted", "The configuration prompt could not be submitted. Retry from this routine.");
  }
}

// src/domain/routineProposal.ts
var MAX_NAME_LENGTH2 = 128;
var MAX_SCHEDULE_LENGTH2 = 256;
var MAX_PROMPT_LENGTH2 = 2e4;
var CONTROL_CHARS_RE3 = /[\x00-\x1F\x7F]/;
var ROUTINE_PROPOSAL_VERSION = 1;
var PATCH_FIELDS = ["name", "prompt", "schedule", "delivery"];
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
    // Stored delivery through the shared advanced-settings reader
    // (domain/advancedSettings.ts) — the same source the envelope reports,
    // so the fingerprint and the session prompt can never disagree about
    // what "current" means. Absent reads as absent, never invented.
    delivery: readStoredDelivery(row) ?? "",
    modelOverride: readStoredModelOverride(row) ?? "",
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
  if (CONTROL_CHARS_RE3.test(text)) return "proposal name must not contain control characters";
  return null;
}
function checkSchedule(value) {
  if (typeof value !== "string") return "proposal schedule must be text";
  const text = value.trim();
  if (!text) return "proposal schedule must not be empty";
  if (text.length > MAX_SCHEDULE_LENGTH2) return "proposal schedule must be at most 256 chars";
  if (CONTROL_CHARS_RE3.test(text)) return "proposal schedule must not contain control characters";
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
        `unknown patch field "${key}" \u2014 only ${PATCH_FIELDS.join(", ")} can be reconfigured` + (key === "modelOverride" || key === "model_override" || key === "model" ? "; model overrides are reported by the session but have no supported write path on this surface" : "")
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
  if ("delivery" in patch) {
    const delivery = normalizeDelivery(patch.delivery);
    if (!delivery.ok) return refusal("bad_delivery", delivery.message);
    normalized.delivery = delivery.present ? delivery.delivery : "";
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
    case "session-lost": {
      if (base.state !== S.PROVISIONAL_PAUSED && base.state !== S.CONFIGURING) return base;
      if (base.state === S.CONFIGURING) {
        return announce(
          base,
          "The configuration session is no longer available. Start a fresh one for the same routine \u2014 it stays paused."
        );
      }
      return {
        ...base,
        state: S.CONFIGURING,
        status: "The configuration session is no longer available. Start a fresh one for the same routine \u2014 it stays paused."
      };
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
    prompt: patch.prompt ?? current.prompt,
    // #65: an explicit '' clears the target; an absent key keeps the stored
    // one. `??` cannot express that, so the empty string is checked directly.
    delivery: patch.delivery === void 0 ? current.delivery : patch.delivery
  };
}
var REVIEW_LABELS = Object.freeze({
  name: "Name",
  schedule: "Schedule",
  prompt: "Instruction",
  // Issue #73: the review answers the same question the composer asks.
  // The VALUE in the cells is still the backend truth (`local`, `all`,
  // `bot-chat` plus a profile name) — a review that showed a prettified value would
  // not be comparing what the backend holds.
  delivery: "Results go to",
  // Issue #74: the model is no longer a field of any routine form. The
  // review keeps reporting it — dropping a value the backend actually
  // applies would make the comparison untrue — under a plain name, with
  // the `not editable` badge below carrying the only fact that matters:
  // a proposal can never change it.
  modelOverride: "Model"
});
var REVIEW_ORDER = ["name", "schedule", "prompt", "delivery", "modelOverride"];
var REVIEW_PATCHABLE = Object.freeze({
  name: true,
  schedule: true,
  prompt: true,
  delivery: true,
  modelOverride: false
});
var PATCHABLE = REVIEW_PATCHABLE;
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
function routeLabel(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return "";
  const profile = typeof route.targetProfile === "string" && route.targetProfile || typeof route.profile === "string" && route.profile || "";
  return profile ? `${route.connectionId}::${profile}` : "";
}
function routeProfiles(route) {
  if (!route) return [];
  const out = [];
  if (typeof route.profile === "string" && route.profile) out.push(route.profile);
  if (typeof route.targetProfile === "string" && route.targetProfile && out.indexOf(route.targetProfile) === -1) {
    out.push(route.targetProfile);
  }
  return out;
}
function guidedRouteDrift(retained, current) {
  const retainedLabel = routeLabel(retained);
  const currentLabel = routeLabel(current);
  if (!retainedLabel || !currentLabel) {
    return { drifted: false, retained: retainedLabel, current: currentLabel };
  }
  if (!retained || !current || typeof retained.connectionId !== "string" || retained.connectionId !== current.connectionId) {
    return { drifted: true, retained: retainedLabel, current: currentLabel };
  }
  const kept = routeProfiles(retained);
  const now = routeProfiles(current);
  const shared = kept.some((profile) => now.indexOf(profile) !== -1);
  return { drifted: !shared, retained: retainedLabel, current: currentLabel };
}

// src/gateway/proposalApply.ts
function scopeOf2(route) {
  if (!route || typeof route.connectionId !== "string" || !route.connectionId) return null;
  return backendTargetProfile(route, "") || null;
}
function failed(reason, message, jobId, backendProfile, replacementJobId = null) {
  return { ok: false, reason, message, jobId, replacementJobId, backendProfile };
}
function findAppliedDuplicate(rows, excludeJobId, expected) {
  for (const row of rows) {
    const id = jobIdOf(row);
    if (!id || id === excludeJobId) continue;
    const snapshot = snapshotJobConfig(row);
    if (!snapshot.paused) continue;
    if (snapshot.name === expected.name && snapshot.schedule === expected.schedule && snapshot.prompt === expected.prompt && snapshot.delivery === expected.delivery) {
      return { jobId: id };
    }
  }
  return null;
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
  const delivery = proposal.patch.delivery ?? snapshot.delivery;
  if (!name || !schedule || !prompt) {
    return failed(
      "unapplyable_base",
      "the routine carries no usable name, schedule or instruction to carry forward \u2014 fill every field in the proposal",
      jobId,
      backendProfile
    );
  }
  if (name === snapshot.name && schedule === snapshot.schedule && prompt === snapshot.prompt && delivery === snapshot.delivery) {
    return { ok: true, jobId, previousJobId: "", changed: false, backendProfile };
  }
  const expected = { ...snapshot, name, schedule, prompt, delivery };
  const duplicate = findAppliedDuplicate(rows, jobId, expected);
  if (duplicate !== null) {
    return failed(
      "duplicate_suspected",
      `a paused routine ${duplicate.jobId} already holds this exact configuration \u2014 verify it in the routines list instead of applying again`,
      jobId,
      backendProfile,
      duplicate.jobId
    );
  }
  let addParams;
  try {
    addParams = buildAddParams(route, { name, schedule, prompt, delivery });
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
  if (confirmedSnapshot.name !== name || confirmedSnapshot.schedule !== schedule || confirmedSnapshot.prompt !== prompt || confirmedSnapshot.delivery !== delivery) {
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
function refused2(stage, reason, message, jobId, recovery, replacementJobId = null) {
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
    case "duplicate_suspected":
      return { stage: S.APPLY, recovery: "refresh" };
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
    return refused2(S.STALE, "invalid_proposal", "the proposal is not valid: " + checked.message, "", "review");
  }
  const proposal = checked.proposal;
  const jobId = proposal.jobId;
  if (!route || !backendProfile) {
    return refused2(S.STALE, "no_route", "applying a proposal requires the resolved profile route that owns the routine", jobId, "review");
  }
  if (route.connectionId !== proposal.owner.connectionId || route.profile !== proposal.owner.profile && route.targetProfile !== proposal.owner.profile) {
    return refused2(
      S.STALE,
      "owner_mismatch",
      `the proposal belongs to ${proposal.owner.connectionId}::${proposal.owner.profile} and cannot be applied on ${route.connectionId}::${route.profile}`,
      jobId,
      "review"
    );
  }
  const before = await readJobConfig({ route, jobId });
  if (!before.ok) {
    return refused2(S.STALE, "list_failed", before.message, jobId, "review");
  }
  if (!before.exists) {
    return refused2(
      S.STALE,
      "job_not_found",
      "the routine no longer exists on its owning profile \u2014 check the routines list before reapplying",
      jobId,
      "review"
    );
  }
  if (before.fingerprint !== proposal.base.fingerprint) {
    return refused2(
      S.STALE,
      "stale_base",
      "the routine changed since the configuration session started \u2014 review the current values and build a new proposal instead of overwriting newer state",
      jobId,
      "review"
    );
  }
  if (!before.paused) {
    return refused2(
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
    return refused2(stage, applied.reason, applied.message, applied.jobId || jobId, recovery, applied.replacementJobId);
  }
  const expected = proposedSnapshot(before.snapshot, proposal.patch);
  const verified = await readJobConfig({ route, jobId: applied.jobId });
  if (!verified.ok) {
    return refused2(S.VERIFY, "verification_unreadable", verified.message, applied.jobId, "refresh", null);
  }
  if (!verified.exists) {
    return refused2(
      S.VERIFY,
      "verification_missing",
      `the configuration was applied but the routine ${applied.jobId} is not in the re-read list \u2014 verify it before any activation`,
      applied.jobId,
      "refresh",
      null
    );
  }
  if (verified.snapshot.name !== expected.name || verified.snapshot.schedule !== expected.schedule || verified.snapshot.prompt !== expected.prompt) {
    return refused2(
      S.VERIFY,
      "verification_failed",
      `the re-read routine ${applied.jobId} does not hold the proposed configuration \u2014 do not activate it; check the routines list`,
      applied.jobId,
      "refresh",
      null
    );
  }
  if (!verified.paused) {
    return refused2(
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
    return refused2(
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
    return refused2(S.ACTIVATE_VERIFY, "truth_unreadable", after.message, jobId, "refresh");
  }
  if (!after.exists) {
    return refused2(
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
    return refused2(
      S.RESUME,
      "resume_rejected",
      `the backend refused to resume the routine (${resumeError}) \u2014 it stays configured and paused`,
      jobId,
      "activation"
    );
  }
  return refused2(
    S.ACTIVATE_VERIFY,
    "resume_unconfirmed",
    `the resume was accepted but the routine ${jobId} still reads as paused \u2014 the active state was not confirmed`,
    jobId,
    "refresh"
  );
}
function diagOfConfirmResult(result) {
  const D = GUIDED_DIAG_STAGES;
  if (result.ok) {
    return recordGuidedDiag(result.activated ? D.ACTIVATION : D.VERIFICATION, "ok");
  }
  switch (result.stage) {
    case GUIDED_WORKFLOW_STAGE.STALE:
      return recordGuidedDiag(D.STALE_REJECTION, result.reason);
    case GUIDED_WORKFLOW_STAGE.APPLY:
      return recordGuidedDiag(D.APPLY, result.reason);
    case GUIDED_WORKFLOW_STAGE.VERIFY:
      return recordGuidedDiag(D.VERIFICATION, result.reason);
    case GUIDED_WORKFLOW_STAGE.RESUME:
    case GUIDED_WORKFLOW_STAGE.ACTIVATE_VERIFY:
      return recordGuidedDiag(D.ACTIVATION, result.reason);
    default:
      return recordGuidedDiag(D.PROPOSAL_VALIDATION, result.reason);
  }
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
async function relaunchGuidedConfiguration(request) {
  const routine = request?.routine;
  const jobId = typeof routine?.jobId === "string" ? routine.jobId : "";
  if (!jobId) {
    return {
      ok: false,
      reason: "envelope_unavailable",
      message: "starting a fresh session requires the authoritative job id",
      jobId: ""
    };
  }
  const read = await readJobConfig({ route: routine.route, jobId });
  if (!read.ok) {
    return { ok: false, reason: "session_target_unreadable", message: read.message, jobId };
  }
  if (!read.exists) {
    return {
      ok: false,
      reason: "session_target_gone",
      message: "the routine no longer exists on its owning profile \u2014 check the routines list; it is not recreated",
      jobId
    };
  }
  if (!read.paused) {
    return {
      ok: false,
      reason: "session_target_active",
      message: "the routine is active, so it needs no configuration session",
      jobId
    };
  }
  const launched = await launchGuidedConfiguration(request);
  if (launched.ok === false) {
    return { ok: false, reason: launched.reason, message: launched.message, jobId: launched.jobId };
  }
  return {
    ok: true,
    routeKey: launched.routeKey,
    jobId: launched.jobId,
    autoSubmitted: launched.autoSubmitted,
    prompt: launched.prompt,
    snapshot: read.snapshot,
    fingerprint: read.fingerprint
  };
}
function diagOfLaunchResult(result) {
  if (result.ok) return recordGuidedDiag(GUIDED_DIAG_STAGES.SESSION_LAUNCH, "ok");
  return recordGuidedDiag(GUIDED_DIAG_STAGES.SESSION_LAUNCH, result.reason);
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
  // The primary action is labeled now (issue #79), so the row is wider than
  // it used to be and must wrap rather than crush the heading on a narrow
  // viewport. The action stays last in reading order.
  "  flex-wrap: wrap;",
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
  // 28px, matching the filter chips: the box and its clear control are one
  // target area and must not disagree about height (issue #79). The height
  // lives on the wrapper since the field itself is a host Input (issue #100).
  ".hr-search-wrap > input { flex: 1 1 auto; min-width: 0; height: 28px; }",
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
  "  gap: 10px;",
  "}",
  // Per-filter counts (issue #79). Muted and smaller than the label so the
  // label still reads first, and clearly separated by a middot so "All 15"
  // never reads as one word.
  ".hr-filter-count {",
  "  margin-left: 5px;",
  "  font-size: 11px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-quaternary, #666);",
  "  font-variant-numeric: tabular-nums;",
  "}",
  '.hr-filter-chip[aria-current="true"] .hr-filter-count, .hr-filter-chip-current .hr-filter-count {',
  "  color: var(--ui-text-tertiary, #888);",
  "}",
  // Comfortably clickable row of filters (issue #79): the chips were a
  // 24px-tall underline with 2px of side padding, so the effective
  // target was the glyph, not the control.
  ".hr-filter-chip {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  min-height: 28px;",
  "  padding: 0 6px 2px;",
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
  // Same hit-target rule as the row actions: a 16x16 box around a 10px
  // glyph was the smallest target on the page (issue #79).
  ".hr-search-clear {",
  "  position: absolute;",
  "  right: 2px;",
  "  top: 50%;",
  "  transform: translateY(-50%);",
  "  width: 24px;",
  "  height: 24px;",
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
  // Selection (issue #77): a selected row is marked, never grown. Both the
  // tint and the accent bar are painted on the existing box (the bar is
  // absolutely positioned against the row's own relative positioning), so
  // selecting a routine cannot change the list's row height or reflow the
  // rows below it.
  ".hr-row-selected {",
  "  background: color-mix(in srgb, var(--chrome-action-hover, rgba(255, 255, 255, 0.04)) 40%, transparent);",
  "  border-radius: 6px;",
  "}",
  ".hr-row-selected::before {",
  '  content: "";',
  "  position: absolute;",
  "  left: 0;",
  "  top: 6px;",
  "  bottom: 6px;",
  "  width: 2px;",
  "  border-radius: 2px;",
  "  background: var(--ui-accent, #4a84fe);",
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
  "  gap: 2px;",
  "  flex-shrink: 0;",
  "}",
  "",
  "/* Icon-Only Action Buttons */",
  // Hit targets, not glyph boxes (issue #79). The buttons were a 24x24 box
  // holding a 13px glyph, so the clickable area was the icon plus a thin
  // ring of padding. The glyph is unchanged (the row stays compact per
  // issue #77); the box around it is now 28x28, which clears the WCAG 2.2
  // target minimum with room to spare without making the row grow.
  ".hr-icon-btn {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 28px;",
  "  height: 28px;",
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
  "/* Subtitle: one line, always. A row's height must not depend on its content or its selection state (issue #77), so the summary is a single truncated line instead of a wrapping block; the full schedule and run story live in the inspector. Truncation lives on a BLOCK container on purpose: text-overflow:ellipsis has no effect on a flex container, so a flex subtitle would clip at the edge with no glyph and no signal that the line continues; the separator spans carry their own margins, so the parts still space out inline. */",
  ".hr-row-sub {",
  "  margin-left: 28px;",
  "  margin-top: 3px;",
  "}",
  ".hr-row-subtitle {",
  "  font-size: 12px;",
  "  line-height: 1.4;",
  "  color: var(--ui-text-tertiary, #888);",
  "  display: block;",
  "  max-width: 100%;",
  "  overflow: hidden;",
  "  white-space: nowrap;",
  "  text-overflow: ellipsis;",
  "}",
  ".hr-sub-paused { color: var(--ui-text-tertiary, #888); }",
  ".hr-sub-schedule { color: var(--ui-text-tertiary, #999); }",
  ".hr-sub-sep { margin: 0 6px; color: var(--ui-stroke-tertiary, rgba(255,255,255,0.2)); font-size: 11px; }",
  ".hr-sub-next { color: var(--ui-text-tertiary, #888); }",
  // Failure text for the row: words plus color, so the failure reads even
  // when color is unavailable (issue #76).
  ".hr-sub-failed { color: var(--ui-red, #f87171); font-weight: 500; }",
  // Configuration state for the row (issue #93): plain secondary words on
  // the single summary line — no button, no badge, no bordered chrome.
  // The row identifies; the inspector acts.
  ".hr-sub-config { color: var(--ui-text-secondary, #ccc); }",
  "",
  "/* Shared detail rows. The expanded in-place block is gone (issue #77): a row never grows, so these rows belong to the inspector alone and the label/value cells keep the same rendering wherever they are read. */",
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
  /* Panel navigation (issue #78). The header keeps both controls and the
     stylesheet decides which one the layout can honestly offer: the
     dismiss icon beside a visible list, the Back affordance where the
     panel covers the list. The hidden one is display:none, not
     visibility:hidden, so it is out of the accessibility tree and out of
     the tab order instead of lingering as a focusable ghost. */
  ".hr-nav {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: 4px;",
  "  margin-left: auto;",
  "}",
  ".hr-btn-nav {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
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
  ".hr-btn-nav svg { display: inline-block; flex-shrink: 0; margin: 0; }",
  ".hr-btn-nav:hover { color: var(--ui-text-primary, #fff); background: var(--chrome-action-hover, rgba(255,255,255,0.06)); }",
  /* Split view (default): the list is on screen, so the honest control is
     the dismiss icon. Back would promise a navigation that never happened. */
  ".hr-nav-back { display: none; }",
  ".hr-nav-close { padding: 4px; }",
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
  // ── failure hierarchy (issue #76) ──
  // What failed first (words, never the icon's color alone), then the
  // derived reason, then — collapsed and visually secondary — the raw
  // evidence. The summary is the loudest thing in the block on purpose.
  ".hr-failure-summary { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }",
  ".hr-failure-summary-head { font-size: 13px; font-weight: 600; color: var(--ui-text-primary, #fff); }",
  ".hr-failure-summary-reason { font-size: 12px; line-height: 1.5; color: var(--ui-text-secondary, #ccc); }",
  // Native disclosure: collapsed by default, keyboard reachable, and it
  // needs no control — the block stays read-only by construction.
  ".hr-tech-details { margin-top: 2px; }",
  ".hr-tech-summary { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ui-text-tertiary, #888); cursor: pointer; padding: 2px 0; }",
  ".hr-tech-summary:hover { color: var(--ui-text-secondary, #ccc); }",
  ".hr-tech-body { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }",
  // Evidence stays verbatim: wrapped, never ellipsized, and long output
  // scrolls inside its own cell instead of being cut off.
  ".hr-tech-value { font-family: var(--dt-font-mono, monospace); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow-y: auto; }",
  ".hr-inspector-actions-bar { display: flex; gap: 8px; }",
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
  // Needs-attention summary (issue #80). A quiet band, deliberately close to
  // the stale banner it borrows its box from — the difference must be the
  // WORDS and the accent, not a loud alarm: a warning that screams on a
  // routine nobody can fix right now trains users to ignore it. The text
  // carries the state, so the red accent only reinforces what is already
  // written ("2 routines need attention") and is never the sole signal.
  ".hr-attention { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border: 1px solid color-mix(in srgb, var(--ui-red, #f87171) 40%, transparent); border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; background: var(--ui-bg-tertiary, rgba(255,255,255,0.02)); color: var(--ui-text-primary, #fff); font-size: 12px; }",
  ".hr-attention-glyph { flex: 0 0 auto; color: var(--ui-red, #f87171); }",
  ".hr-attention-text { font-weight: 600; }",
  // Secondary clause, so the excluded paused failures read as context beside
  // the headline and not as a second number the user has to reconcile.
  ".hr-attention-note { color: var(--ui-text-tertiary, #888); }",
  // The focus bar is the same band in its active state: same severity, a
  // different sentence, and the control that leaves it.
  ".hr-attention-active { border-color: color-mix(in srgb, var(--ui-red, #f87171) 55%, transparent); margin-bottom: 8px; }",
  '.hr-attention > [data-slot="button"], .hr-config-note > [data-slot="button"] { margin-left: auto; }',
  ".hr-muted { color: var(--ui-text-tertiary, #888); font-size: 13px; line-height: 1.4; }",
  ".hr-status { margin-top: 10px; color: var(--ui-text-tertiary, #888); font-size: 12px; }",
  // A status line that only restates what the page already shows (the
  // toolbar count, the empty state) keeps its role, text and focus target
  // but takes no visual footprint. Declared after .hr-status on purpose:
  // same specificity, so the clip wins over the status line's own spacing.
  ".hr-status.hr-sr-only { margin: -1px; }",
  "",
  "/* New Routine Trigger Button */",
  // The primary action is a labeled pill (issue #79). It was a 32x32 bare
  // plus: a glyph-only primary control that scaled on hover, which reads as
  // decoration rather than as the page's main action. Now it carries its
  // label, keeps a stable hit target, and drops the scale transform so the
  // header never shifts as the pointer crosses it.
  ".hr-btn-new {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  gap: 6px;",
  "  min-height: 32px;",
  "  padding: 0 12px;",
  "  border-radius: 6px;",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.1));",
  "  background: var(--ui-bg-tertiary, rgba(255, 255, 255, 0.04));",
  "  color: var(--ui-text-secondary, #ccc);",
  "  font-size: 13px;",
  "  font-weight: 500;",
  "  white-space: nowrap;",
  "  cursor: pointer;",
  "  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;",
  "}",
  ".hr-btn-new:hover {",
  "  color: var(--ui-text-primary, #fff);",
  "  background: var(--chrome-action-hover, rgba(255, 255, 255, 0.08));",
  "  border-color: var(--ui-stroke-secondary, rgba(255, 255, 255, 0.16));",
  "}",
  ".hr-btn-new:active {",
  "  background: color-mix(in srgb, var(--chrome-action-hover, rgba(255, 255, 255, 0.08)) 70%, transparent);",
  "}",
  ".hr-btn-new-label {",
  "  line-height: 1;",
  "}",
  "",
  "/* Create Routine Composer Panel */",
  ".hr-create-title {",
  "  font-size: 16px;",
  "  font-weight: 700;",
  "  color: var(--ui-text-primary, #fff);",
  "  margin: 0 0 16px 0;",
  "}",
  // Already chromeless (transparent, no border): creation-time state is a
  // quiet row, not a card. Typography stays below the section titles so the
  // mechanism never outranks the intent (attention budget, issue #92).
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
  "  font-size: 13px;",
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
  // Finish with Hermes: a quiet secondary act ABOVE the final actions, so
  // the secondary completion path reads as a separate offering without
  // competing with the primary action (attention budget, issue #92). No
  // border, no fill: spacing and typography do the grouping. The button
  // itself is borderless accent text (clearly secondary next to the filled
  // Create Routine action), followed by exactly one supporting sentence.
  ".hr-create-hermes-quiet {",
  "  display: flex;",
  "  flex-direction: column;",
  "  align-items: flex-start;",
  "  gap: 4px;",
  "  margin-top: 16px;",
  "}",
  ".hr-create-hermes-note {",
  "  margin: 0;",
  "  font-size: 12px;",
  "  line-height: 1.45;",
  "  color: var(--ui-text-tertiary, #888);",
  "}",
  // The quiet act is a host Button (issue #100), so it is addressed by its
  // slot rather than a retired class. The hover affordance is an underline
  // on the label, exactly as before — the host `ghost` variant supplies the
  // rest, and it already dims itself when disabled.
  '[data-slot="button"]:hover:not(:disabled) {',
  "  text-decoration: underline;",
  "  text-underline-offset: 3px;",
  "}",
  // Quiet broadcast opt-in (issue #92). Asking for the fan-out guard is not
  // itself a risk, so the pre-opt-in block takes no bordered surface — only
  // the acknowledged fan-out state below keeps the bordered card, because
  // delivering to every connected channel is a real risk.
  ".hr-create-broadcast-quiet {",
  "  display: flex;",
  "  flex-direction: column;",
  "  align-items: flex-start;",
  "  gap: 6px;",
  "  margin: 10px 0 14px 0;",
  "}",
  '.hr-create-broadcast-quiet [data-slot="button"] {',
  "  background: transparent;",
  "}",
  // Quiet inspector note (issue #92): information with no action on this
  // surface, so spacing and type carry it instead of a card.
  ".hr-inspector-note {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 2px;",
  "  padding: 0;",
  "}",
  // Quiet aggregate needs-configuration summary (issues #92 and #93):
  // this names how many paused rows still need configuration, not a
  // failure — so it takes no bordered band and offers exactly one action.
  // The StaleBanner keeps .hr-stale; errors and the attention band keep
  // their stronger treatment.
  ".hr-config-note {",
  "  display: flex;",
  "  gap: 8px;",
  "  align-items: center;",
  "  flex-wrap: wrap;",
  "  padding: 4px 0;",
  "  margin: 0 0 12px;",
  "  color: var(--ui-text-secondary, #ccc);",
  "  font-size: 12px;",
  "}",
  // Fan-out guard (issue #90). The card is painted only inside the advanced
  // path, after an explicit opt-in: delivering to every connected channel
  // is not a primary destination, and opening advanced does not select it.
  ".hr-create-broadcast-card {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 8px;",
  "  padding: 10px 12px;",
  "  margin: 10px 0 14px 0;",
  "  border: 1px solid var(--ui-stroke-secondary, var(--dt-border, rgba(255, 255, 255, 0.22)));",
  "  border-radius: 10px;",
  "  background: var(--ui-bg-secondary, color-mix(in srgb, var(--dt-card, #1c1917) 35%, transparent));",
  "}",
  ".hr-create-broadcast-check {",
  "  display: flex;",
  "  align-items: flex-start;",
  "  gap: 8px;",
  "  font-size: 12px;",
  "  line-height: 1.45;",
  "  color: var(--ui-text-secondary, #a1a1aa);",
  "  cursor: pointer;",
  "}",
  ".hr-create-broadcast-check input {",
  "  margin: 1px 0 0 0;",
  "  flex-shrink: 0;",
  "}",
  ".hr-create-broadcast-note {",
  "  margin: 0;",
  "  font-size: 12px;",
  "  line-height: 1.45;",
  "  color: var(--ui-text-secondary, #a1a1aa);",
  "}",
  "/* Field labels */",
  ".hr-field-label {",
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
  // The composer's fields are host Input/Textarea now (issue #100). Their
  // hover, placeholder and disabled looks belong to the theme, so the local
  // overrides that used to fight the custom border are gone; only the
  // read-only mirrors keep a dimmed affordance, because a disabled field
  // must still read as "reported, not editable" (issue #74).
  '.hr-create-field [data-slot="input"]:disabled, .hr-create-field [data-slot="textarea"]:disabled {',
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
  // Vertical rhythm for the schedule selects. The retired
  // .hr-select-container rule carried this as part of its chrome; the host
  // control supplies its own box, so the spacing belongs to the wrapper.
  // Without it a standalone select (the Trigger) would butt straight against
  // the section's preview sentence.
  ".hr-select {",
  "  width: 100%;",
  "  margin-bottom: 12px;",
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
  ".hr-create-sub-split .hr-select {",
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
  ".hr-review-editable { margin-left: 6px; font-size: 9px; color: var(--ui-text-tertiary, #888); }",
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
  // The two final acts are host Buttons now (issue #100), so their own
  // chrome is gone; the row still owns the equal-width split and the height,
  // which are layout the primitive does not decide.
  ".hr-create-actions {",
  "  display: flex;",
  "  gap: 10px;",
  "  margin-top: 18px;",
  "}",
  ".hr-create-actions > * { flex: 1 1 0; min-height: 38px; }",
  // The filled act is a host Button too; its pressed and disabled looks are
  // the host's, so nothing overrides them here any more.
  '[data-slot="button"][data-variant="default"]:active:not(:disabled) {',
  "  opacity: 0.92;",
  "}",
  "",
  "/* Responsive adaptiveness */",
  "@media (max-width: 820px) {",
  "  .hr-workspace { flex-direction: column; }",
  "  /* The inspector is the primary detail surface on a narrow viewport: it takes the full width and its own scroll instead of sharing a cramped column with the list (issue #77). */",
  "  .hr-inspector { width: 100%; flex: 1 1 auto; border-left: none; border-top: 1px solid var(--ui-stroke-tertiary, rgba(255,255,255,0.08)); }",
  "  .hr-feed-column { padding: 12px; }",
  /* The panel now covers the list, so leaving it IS a back navigation: the
     wording that would have been a lie in the split view is the honest one
     here, and the dismiss icon would understate that the list is behind
     the panel (issue #78). */
  "  .hr-nav-back { display: inline-flex; }",
  "  .hr-nav-close { display: none; }",
  "  /* A narrow viewport must not turn the list back into a stack of wrapping blocks: the row stays compact and the summary keeps its single line. */",
  "  .hr-row { padding: 12px 4px; }",
  "  /* Row actions stay compact but keep their enlarged targets on a narrow viewport (issue #79). */",
  "  .hr-icon-btn { width: 28px; height: 28px; }",
  // The labeled primary action tightens its padding rather than dropping
  // its label, so it still says what it does at any width (issue #79).
  "  .hr-btn-new { padding: 0 10px; gap: 5px; }",
  "  .hr-row-sub { margin-left: 26px; }",
  // The aggregate configuration summary keeps its single action beside
  // the count on a narrow viewport (issue #93): the row already wraps,
  // so the banner only tightens its spacing instead of stacking.
  "  .hr-config-note { gap: 6px; margin: 0 0 10px; }",
  "}"
].join("\n");

// src/views/FilterNav.tsx
import { Button } from "@hermes/plugin-sdk";
import { jsx, jsxs } from "react/jsx-runtime";
var FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" }
];
function FilterNav({ filter, disabled, counts, onSelect }) {
  return /* @__PURE__ */ jsx("nav", { className: "hr-filters", "aria-label": "Filter routines by status", children: FILTER_OPTIONS.map((entry) => {
    const count = counts ? counts[entry.value] : null;
    return /* @__PURE__ */ jsxs(
      Button,
      {
        variant: "chip",
        size: "xs",
        className: "hr-filter-chip" + (filter === entry.value ? " hr-filter-chip-current" : ""),
        "aria-current": filter === entry.value ? "true" : void 0,
        "aria-label": count === null ? void 0 : `${entry.label} \u2014 ${count} ${count === 1 ? "routine" : "routines"}`,
        disabled,
        onClick: () => onSelect(entry.value),
        children: [
          entry.label,
          count === null ? null : /* @__PURE__ */ jsx("span", { className: "hr-filter-count", "aria-hidden": "true", children: count })
        ]
      },
      entry.value
    );
  }) });
}

// src/views/RoutineList.tsx
import { useEffect } from "react";

// src/views/RoutineCard.tsx
import { Button as Button2 } from "@hermes/plugin-sdk";

// src/views/RoutineStatus.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function statusOf(job) {
  const health = routineHealthOf(job);
  switch (health) {
    case "completed":
      return { label: "Completed", tone: "completed", failure: null };
    case "failed":
      if (routineErrored(job)) return { label: "Error", tone: "error", failure: "Error" };
      return { label: "Active \u2014 last run failed", tone: "failed", failure: "Last run failed" };
    case "paused":
      if (isFailedStatus(job)) {
        return { label: "Paused \u2014 last run failed", tone: "paused", failure: "Last run failed" };
      }
      return { label: "Paused", tone: "paused", failure: null };
    case "unknown":
      return { label: "Active", tone: "unknown", failure: null };
    case "healthy":
      return { label: "Active", tone: "active", failure: null };
  }
}
function RoutineStatus({ job }) {
  const { label, tone } = statusOf(job);
  return /* @__PURE__ */ jsxs2("span", { className: `hr-status-indicator hr-status-${tone}`, title: label, "aria-label": label, children: [
    tone === "active" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-active", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx2("polyline", { points: "8 4.2 8 8 10.8 8" })
    ] }) : tone === "paused" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-paused", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx2("line", { x1: "6.5", y1: "5.5", x2: "6.5", y2: "10.5" }),
      /* @__PURE__ */ jsx2("line", { x1: "9.5", y1: "5.5", x2: "9.5", y2: "10.5" })
    ] }) : tone === "failed" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-failed", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx2("line", { x1: "5.5", y1: "5.5", x2: "10.5", y2: "10.5" }),
      /* @__PURE__ */ jsx2("line", { x1: "10.5", y1: "5.5", x2: "5.5", y2: "10.5" })
    ] }) : tone === "unknown" ? /* @__PURE__ */ jsx2("svg", { className: "hr-status-svg hr-status-svg-unknown", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "6.5" }) }) : /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx2("circle", { cx: "8", cy: "8", r: "2", fill: "currentColor" })
    ] }),
    /* @__PURE__ */ jsx2("span", { className: "hr-sr-only", children: label })
  ] });
}

// src/views/RoutineCard.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function RoutineCard(props) {
  const { job, fallback, inspected = false, busy, disabled, inspectorId, controlId } = props;
  const title = routineTitle(job, fallback);
  const paused = routinePausedOf(job);
  const terminal = routineTerminal(job);
  const { tone, failure: failure3 } = statusOf(job);
  const schedule = humanScheduleOf(job) || "\u2014";
  const nextCopy = routineActive(job) ? nextRunCopyOf(nextRunIso(job)) : null;
  const needsConfiguration = guidedConfigCandidateOf(job) !== null;
  return /* @__PURE__ */ jsxs3(
    "li",
    {
      className: `hr-row hr-row-${tone}${inspected ? " hr-row-selected" : ""}`,
      onClick: (e) => {
        if (e.target.closest("button, .hr-row-actions")) return;
        props.onSelect();
      },
      style: { cursor: "pointer" },
      children: [
        /* @__PURE__ */ jsxs3("div", { className: "hr-row-top", children: [
          /* @__PURE__ */ jsxs3("div", { className: "hr-row-left", children: [
            /* @__PURE__ */ jsx3(RoutineStatus, { job }),
            /* @__PURE__ */ jsx3(
              "span",
              {
                className: "hr-row-title",
                role: "button",
                tabIndex: 0,
                "aria-expanded": inspected,
                "aria-controls": inspected ? inspectorId : void 0,
                onClick: (e) => {
                  e.stopPropagation();
                  props.onSelect();
                },
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onSelect();
                  }
                },
                children: title
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "hr-row-actions", children: [
            !terminal ? paused ? /* @__PURE__ */ jsx3(
              Button2,
              {
                variant: "ghost",
                size: "xs",
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
            ) : /* @__PURE__ */ jsx3(
              Button2,
              {
                variant: "ghost",
                size: "xs",
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
            /* @__PURE__ */ jsx3(
              Button2,
              {
                variant: "ghost",
                size: "xs",
                id: controlId,
                className: `hr-icon-btn hr-icon-btn-edit${inspected ? " hr-icon-btn-active" : ""}`,
                "aria-expanded": inspected,
                "aria-controls": inspected ? inspectorId : void 0,
                "aria-label": `${inspected ? "Close details for" : "Show details for"} ${title}`,
                onClick: (e) => {
                  e.stopPropagation();
                  props.onSelect();
                },
                title: "Details",
                children: "Details"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "hr-row-sub", children: /* @__PURE__ */ jsx3("div", { className: "hr-row-subtitle", children: paused ? /* @__PURE__ */ jsxs3(Fragment, { children: [
          /* @__PURE__ */ jsx3("span", { className: "hr-sub-paused", children: "Paused" }),
          failure3 !== null ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-sep", children: "|" }),
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-failed", children: failure3 })
          ] }) : null,
          needsConfiguration ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-sep", children: "|" }),
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-config", children: "Needs configuration" })
          ] }) : null
        ] }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
          /* @__PURE__ */ jsx3("span", { className: "hr-sub-schedule", children: schedule }),
          failure3 !== null ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-sep", children: "|" }),
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-failed", children: failure3 })
          ] }) : null,
          nextCopy ? /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-sep", children: "|" }),
            /* @__PURE__ */ jsx3("span", { className: "hr-sub-next", children: nextCopy.sentence })
          ] }) : null
        ] }) }) })
      ]
    }
  );
}

// src/views/RoutineInspectorPanel.tsx
import { Button as Button4, Input, Textarea } from "@hermes/plugin-sdk";

// src/domain/failureExplain.ts
var GENERIC_FAILURE_SUMMARY = "The last run failed.";
var REASON_PATTERNS = [
  [/\bcommand not found\b|\bENOENT\b/i, "A required command or file was not found."],
  [/\bpermission denied\b|\bEACCES\b/i, "Permission was denied."],
  [/\btim(?:ed|e)?[ -]?out\b|\bETIMEDOUT\b/i, "The run timed out."],
  [
    /\bconnection refused\b|\bECONNREFUSED\b|\bENOTFOUND\b|\bEAI_AGAIN\b/i,
    "The network request failed."
  ],
  [
    /\btoo many requests\b|\brate[ -]?limit(?:ed|ing)?\b|\b(?:status|http)[ :]*429\b/i,
    "The service rate limit was hit."
  ],
  [
    /\bunauthorized\b|\bauthentication (?:failed|required)\b|\binvalid api key\b/i,
    "Authentication was rejected."
  ],
  [/\bno space left on device\b|\bENOSPC\b/i, "The disk is full."]
];
function deriveFailureReason(...texts) {
  for (const [pattern, reason] of REASON_PATTERNS) {
    for (const text of texts) {
      if (typeof text === "string" && pattern.test(text)) return reason;
    }
  }
  return null;
}
function asRecord4(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
}
function firstText(row, keys) {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}
function explainFailureOf(job) {
  const execution = lastExecutionOf(job);
  if (!execution.known || execution.resultKind !== "error") return null;
  const row = asRecord4(job);
  const message = issueOf(job);
  const stderr = firstText(row, ["last_stderr", "lastStderr", "stderr"]);
  const exitCode = firstText(row, ["last_exit_code", "lastExitCode", "exit_code", "exitCode"]);
  const runAt = lastRunIso(job);
  const runId = firstText(row, ["last_run_id", "lastRunId", "run_id", "runId"]);
  const evidence = [];
  const push = (label, value) => {
    if (value !== null) evidence.push({ label, value });
  };
  push("Exit code", exitCode);
  push("Stderr", stderr === message ? null : stderr);
  push("Run timestamp", runAt);
  push("Issue", message);
  push("Run id", runId);
  return {
    summary: GENERIC_FAILURE_SUMMARY,
    reason: deriveFailureReason(message, stderr),
    evidence
  };
}

// src/views/RunOutcome.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function RunWhen({
  distance,
  strong
}) {
  return /* @__PURE__ */ jsxs4("span", { className: strong ? "hr-detail-value hr-next" : "hr-detail-value", children: [
    distance.text,
    distance.date !== null ? /* @__PURE__ */ jsxs4("span", { className: "hr-date", children: [
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
  return /* @__PURE__ */ jsxs4("span", { className: `hr-result hr-result-${kind}`, children: [
    kind === "success" ? /* @__PURE__ */ jsx4("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx4("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z" }) }) : kind === "error" ? /* @__PURE__ */ jsx4("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx4("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z" }) }) : null,
    text
  ] });
}

// src/views/PanelNav.tsx
import { Button as Button3 } from "@hermes/plugin-sdk";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var NEW_ROUTINE_CONTROL_ID = "hermes-routines-new";
function routineRowFocusId(key) {
  return `hermes-routines-row--${key}`;
}
function dismissFocusId(surface, key) {
  if (surface === "inspector") {
    if (typeof key !== "string" || key === "") return null;
    return routineRowFocusId(key);
  }
  if (surface === "composer") return NEW_ROUTINE_CONTROL_ID;
  return null;
}
function escapeLeavesPanel(target) {
  const node = target;
  if (node === null || typeof node !== "object") return true;
  const element = node;
  if (typeof element.tagName !== "string") return true;
  const tag = element.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  const role = typeof element.getAttribute === "function" ? element.getAttribute("role") : null;
  if (role === "combobox" || role === "listbox" || role === "option") return false;
  return true;
}
function focusById(id) {
  if (id === null) return false;
  if (typeof document === "undefined") return false;
  const node = document.getElementById(id);
  if (node === null || typeof node.focus !== "function") return false;
  node.focus({ preventScroll: true });
  return true;
}
function PanelNav({ closeLabel, onClose }) {
  return /* @__PURE__ */ jsxs5("div", { className: "hr-nav", children: [
    /* @__PURE__ */ jsxs5(
      Button3,
      {
        variant: "text",
        size: "xs",
        className: "hr-btn-nav hr-nav-back",
        onClick: onClose,
        "aria-label": "Back to routines",
        children: [
          /* @__PURE__ */ jsx5("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { flexShrink: 0 }, children: /* @__PURE__ */ jsx5("path", { fillRule: "evenodd", d: "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" }) }),
          /* @__PURE__ */ jsx5("span", { children: "Back to routines" })
        ]
      }
    ),
    /* @__PURE__ */ jsx5(
      Button3,
      {
        variant: "text",
        size: "xs",
        className: "hr-btn-nav hr-nav-close",
        onClick: onClose,
        "aria-label": closeLabel,
        title: closeLabel,
        children: /* @__PURE__ */ jsx5("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { flexShrink: 0 }, children: /* @__PURE__ */ jsx5("path", { fillRule: "evenodd", d: "M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" }) })
      }
    )
  ] });
}

// src/views/RoutineInspectorPanel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var INSPECTOR_PANEL_ID = "hermes-routines-inspector";
function RoutineInspectorPanel({
  job,
  fallback,
  id = INSPECTOR_PANEL_ID,
  onClose,
  onConfigure
}) {
  const title = routineTitle(job, fallback);
  const schedule = humanScheduleOf(job) || "\u2014";
  const execution = lastExecutionOf(job);
  const row = job ?? null;
  const storedDelivery = readStoredDelivery(row);
  const storedModelOverride = readStoredModelOverride(row);
  const describedDelivery = describeDestination(storedDelivery);
  const configCandidate = guidedConfigCandidateOf(job);
  const needsConfiguration = configCandidate !== null;
  const failure3 = explainFailureOf(job);
  return /* @__PURE__ */ jsxs6("aside", { className: "hr-inspector", id, "aria-label": `Details for ${title}`, children: [
    /* @__PURE__ */ jsx6("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsx6(PanelNav, { closeLabel: `Close details for ${title}`, onClose }) }),
    /* @__PURE__ */ jsxs6("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx6("h3", { className: "hr-create-title", children: title }),
      needsConfiguration ? /* @__PURE__ */ jsxs6("div", { className: "hr-inspector-note", children: [
        /* @__PURE__ */ jsx6("span", { className: "hr-create-active-title", children: "Paused \xB7 needs configuration" }),
        /* @__PURE__ */ jsx6("span", { className: "hr-create-active-subtitle", children: "This routine is paused and has never run \u2014 its configuration is incomplete." }),
        configCandidate !== null && onConfigure ? /* @__PURE__ */ jsx6(
          Button4,
          {
            variant: "outline",
            size: "xs",
            onClick: () => onConfigure(configCandidate.jobId),
            children: "Continue configuration"
          }
        ) : null
      ] }) : null,
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-card", children: [
        /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-info", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-create-active-title", children: "Active" }),
          /* @__PURE__ */ jsx6("span", { className: "hr-create-active-subtitle", children: "This routine will run on the schedule below." })
        ] }),
        /* @__PURE__ */ jsx6(
          Button4,
          {
            variant: "secondary",
            size: "sm",
            role: "switch",
            "aria-checked": routineActive(job),
            "aria-label": "Routine active state",
            disabled: true,
            className: `hr-switch-pill ${routineActive(job) ? "hr-switch-active" : ""}`,
            children: /* @__PURE__ */ jsx6("span", { className: "hr-switch-thumb" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx6("label", { className: "hr-field-label", children: "Name" }),
        /* @__PURE__ */ jsx6(
          Input,
          {
            type: "text",
            value: title,
            disabled: true,
            readOnly: true,
            "aria-label": "Routine name"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx6("label", { className: "hr-field-label", children: "What should this routine do?" }),
        /* @__PURE__ */ jsx6(
          Textarea,
          {
            rows: 3,
            value: routinePromptOf(job) ?? "",
            disabled: true,
            readOnly: true,
            "aria-label": "What this routine does",
            placeholder: "No instruction stored for this routine."
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx6("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
        /* @__PURE__ */ jsx6("div", { className: "hr-create-preview-sentence", children: schedule })
      ] }),
      describedDelivery !== null || storedModelOverride !== null ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx6("div", { className: "hr-create-section-label", children: "ADVANCED" }),
        describedDelivery !== null ? /* @__PURE__ */ jsxs6("div", { className: "hr-create-field", children: [
          /* @__PURE__ */ jsx6("label", { className: "hr-field-label", children: "Results go to" }),
          /* @__PURE__ */ jsx6("div", { className: "hr-create-preview-sentence", children: describedDelivery.resolved ? describedDelivery.label : storedDelivery }),
          describedDelivery.detail ? /* @__PURE__ */ jsx6("div", { className: "hr-create-preview-sentence", children: describedDelivery.detail }) : null,
          /* @__PURE__ */ jsx6(
            Input,
            {
              type: "text",
              value: storedDelivery ?? "",
              disabled: true,
              readOnly: true,
              "aria-label": "Stored delivery"
            }
          )
        ] }) : null,
        storedModelOverride !== null ? (
          // A report of stored truth, not a setting: a plain read-only
          // line, never an input. A disabled input still reads as a
          // form field the user failed to fill in (issue #74).
          /* @__PURE__ */ jsxs6("div", { className: "hr-detail", children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Model" }),
            /* @__PURE__ */ jsx6("span", { className: "hr-detail-value", children: storedModelOverride })
          ] })
        ) : null
      ] }) : null,
      /* @__PURE__ */ jsxs6("div", { className: "hr-inspector-last-run", children: [
        /* @__PURE__ */ jsx6("div", { className: "hr-create-section-label", children: "LAST EXECUTION" }),
        execution.lastRun !== null ? /* @__PURE__ */ jsxs6("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Last run" }),
          /* @__PURE__ */ jsx6(RunWhen, { distance: execution.lastRun })
        ] }) : null,
        /* @__PURE__ */ jsxs6("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Last result" }),
          execution.known ? /* @__PURE__ */ jsx6(ResultTone, { kind: execution.resultKind, text: execution.resultText }) : (
            // Stated in words, never as a placeholder that reads as data.
            /* @__PURE__ */ jsx6("span", { className: "hr-muted", children: "No runs yet." })
          )
        ] }),
        failure3 !== null ? /* @__PURE__ */ jsxs6("div", { className: "hr-failure-summary", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-failure-summary-head", children: failure3.summary }),
          failure3.reason !== null ? /* @__PURE__ */ jsx6("span", { className: "hr-failure-summary-reason", children: failure3.reason }) : null
        ] }) : null,
        failure3 !== null && failure3.evidence.length > 0 ? /* @__PURE__ */ jsxs6("details", { className: "hr-tech-details", children: [
          /* @__PURE__ */ jsx6("summary", { className: "hr-tech-summary", children: "Technical details" }),
          /* @__PURE__ */ jsx6("div", { className: "hr-tech-body", children: failure3.evidence.map((item) => /* @__PURE__ */ jsxs6("div", { className: "hr-detail", children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: item.label }),
            /* @__PURE__ */ jsx6("span", { className: "hr-detail-value hr-tech-value", children: item.value })
          ] }, item.label)) })
        ] }) : null,
        execution.nextRun !== null ? /* @__PURE__ */ jsxs6("div", { className: "hr-detail", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-detail-label", children: "Next run" }),
          /* @__PURE__ */ jsx6(RunWhen, { distance: execution.nextRun, strong: true })
        ] }) : null
      ] })
    ] })
  ] });
}

// src/views/RoutineList.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function RoutineList({
  jobs,
  pending,
  locked,
  selectedId,
  onSelect,
  inspectedId,
  onInspect,
  inspectorId = INSPECTOR_PANEL_ID,
  rowControlId,
  onPause,
  onResume
}) {
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
  function handleSelect(key) {
    if (handleInspect) handleInspect(activeInspectorId === key ? null : key);
  }
  return /* @__PURE__ */ jsx7("ul", { className: "hr-list", "aria-label": "Routines", children: jobs.map((job, index) => {
    const fallback = `routine ${index + 1}`;
    const jobId = jobIdOf(job);
    const viewKey = routineKey(job, fallback);
    const busier = jobId !== "" && pending.indexOf(jobId) !== -1;
    return /* @__PURE__ */ jsx7(
      RoutineCard,
      {
        job,
        fallback,
        inspected: activeInspectorId === viewKey,
        busy: busier,
        disabled: locked || jobId === "",
        inspectorId,
        controlId: rowControlId ? rowControlId(viewKey) : void 0,
        onSelect: () => handleSelect(viewKey),
        onPause: () => onPause(jobId, routineTitle(job, fallback)),
        onResume: () => onResume(jobId, routineTitle(job, fallback))
      },
      `${index}::${viewKey}`
    );
  }) });
}

// src/views/RoutineComposerPanel.tsx
import { useMemo, useRef, useState } from "react";
import { Button as Button5, Input as Input2, Textarea as Textarea2 } from "@hermes/plugin-sdk";

// src/views/NativeSelect.tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hermes/plugin-sdk";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function NativeSelect({
  label,
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  "aria-label": ariaLabel
}) {
  const encoded = String(value);
  const selected = options.find((option) => String(option.value) === encoded);
  return /* @__PURE__ */ jsxs7("div", { className: `hr-select ${className}`.trim(), children: [
    /* @__PURE__ */ jsx8("span", { className: "hr-field-label", id: `hr-select-label-${encoded}`, children: label }),
    /* @__PURE__ */ jsxs7(
      Select,
      {
        disabled,
        value: encoded,
        onValueChange: (next) => {
          const match = options.find((option) => String(option.value) === next);
          if (match !== void 0) onChange(match.value);
        },
        children: [
          /* @__PURE__ */ jsx8(SelectTrigger, { "aria-label": ariaLabel ?? label, children: /* @__PURE__ */ jsx8(SelectValue, { placeholder: selected?.label ?? options[0]?.label }) }),
          /* @__PURE__ */ jsx8(SelectContent, { children: options.map((option) => /* @__PURE__ */ jsx8(SelectItem, { value: String(option.value), children: option.label }, String(option.value))) })
        ]
      }
    )
  ] });
}

// src/views/RoutineComposerPanel.tsx
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function RoutineComposerPanel({
  disabled,
  onClose,
  onSubmit,
  onSubmitGuided,
  destinationRoutes
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [startEnabled, setStartEnabled] = useState(true);
  const [scheduleConfig, setScheduleConfig] = useState(DEFAULT_SCHEDULE_CONFIG);
  const [pendingPath, setPendingPath] = useState(null);
  const [error, setError] = useState(null);
  const [destinationChoice, setDestinationChoice] = useState("");
  const [advancedPlatform, setAdvancedPlatform] = useState("");
  const [advancedChatId, setAdvancedChatId] = useState("");
  const [advancedThreadId, setAdvancedThreadId] = useState("");
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  const [broadcastOptIn, setBroadcastOptIn] = useState(false);
  const inFlightRef = useRef(false);
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
  const destinationChoices = useMemo(
    () => [
      ...destinationOptions(destinationRoutes),
      {
        value: DESTINATION_ADVANCED,
        label: "Advanced override\u2026",
        detail: "Name a platform and address directly, if you need to.",
        broadcast: false
      }
    ],
    [destinationRoutes]
  );
  const selectedDestination = findDestinationOption(
    destinationChoices,
    destinationChoice
  );
  const advancedInput = useMemo(
    () => ({
      platform: advancedPlatform,
      chatId: advancedChatId,
      threadId: advancedThreadId
    }),
    [advancedPlatform, advancedChatId, advancedThreadId]
  );
  const broadcastPending = destinationChoice === DESTINATION_ADVANCED && broadcastOptIn;
  const broadcastBlocked = broadcastPending && !broadcastConfirmed;
  const cronExpr = useMemo(() => buildCronExpression(scheduleConfig), [scheduleConfig]);
  const humanSentence = useMemo(() => describeScheduleConfig(scheduleConfig), [scheduleConfig]);
  const draftReady = name.trim() !== "" && prompt.trim() !== "";
  const busy = pendingPath !== null || disabled;
  async function handleSubmit(path) {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    const promptText = prompt.trim();
    if (!promptText) {
      setError("Describe what this routine should do.");
      return;
    }
    const normalized = composerDestinationDelivery(destinationChoice, advancedInput, {
      optedIn: broadcastOptIn,
      confirmed: broadcastConfirmed
    });
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }
    const delivery = normalized.present ? normalized.delivery : void 0;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPendingPath(path);
    setError(null);
    try {
      if (path === "guided") {
        if (!onSubmitGuided) return;
        const ok2 = await onSubmitGuided(trimmedName, cronExpr, promptText, delivery);
        if (!ok2) {
          setError("Failed to create routine. Please verify parameters.");
        }
        return;
      }
      const ok = await onSubmit(trimmedName, cronExpr, promptText, startEnabled, delivery);
      if (!ok) {
        setError("Failed to create routine. Please verify parameters.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create routine.";
      setError(message);
    } finally {
      inFlightRef.current = false;
      setPendingPath(null);
    }
  }
  return /* @__PURE__ */ jsxs8("aside", { className: "hr-inspector hr-create-inspector", "aria-label": "Create Routine", children: [
    /* @__PURE__ */ jsx9("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsx9(PanelNav, { closeLabel: "Cancel and close the create form", onClose }) }),
    /* @__PURE__ */ jsxs8("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx9("h3", { className: "hr-create-title", children: "Create Routine" }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx9("label", { className: "hr-field-label", children: "Name" }),
        /* @__PURE__ */ jsx9(
          Input2,
          {
            type: "text",
            placeholder: "Name this Routine",
            value: name,
            onChange: (e) => setName(e.target.value),
            "aria-label": "Name this Routine"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx9("label", { className: "hr-field-label", children: "What should this routine do?" }),
        /* @__PURE__ */ jsx9(
          Textarea2,
          {
            placeholder: "e.g. Check server health and notify #ops channel",
            rows: 3,
            value: prompt,
            onChange: (e) => setPrompt(e.target.value),
            "aria-label": "What should this routine do?"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx9("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
        /* @__PURE__ */ jsx9(
          NativeSelect,
          {
            label: "Trigger",
            value: scheduleConfig.trigger,
            options: TRIGGER_OPTIONS,
            onChange: (val) => setScheduleConfig((prev) => ({ ...prev, trigger: val }))
          }
        ),
        scheduleConfig.trigger === "every_day" || scheduleConfig.trigger === "weekdays" ? /* @__PURE__ */ jsx9("div", { className: "hr-create-sub-row", children: /* @__PURE__ */ jsx9(
          NativeSelect,
          {
            label: "at",
            value: scheduleConfig.time,
            options: timeOptions,
            onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
          }
        ) }) : null,
        scheduleConfig.trigger === "every_week" ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "on",
              value: scheduleConfig.dayOfWeek,
              options: dayOfWeekOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, dayOfWeek: val }))
            }
          ),
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "at",
              value: scheduleConfig.time,
              options: timeOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
            }
          )
        ] }) : null,
        scheduleConfig.trigger === "every_month" ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "on the",
              value: scheduleConfig.dayOfMonth,
              options: DAYS_OF_MONTH,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, dayOfMonth: val }))
            }
          ),
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "at",
              value: scheduleConfig.time,
              options: timeOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, time: val }))
            }
          )
        ] }) : null,
        scheduleConfig.trigger === "interval" ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-sub-split", children: [
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "every",
              value: scheduleConfig.intervalValue,
              options: intervalValueOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, intervalValue: val }))
            }
          ),
          /* @__PURE__ */ jsx9(
            NativeSelect,
            {
              label: "unit",
              value: scheduleConfig.intervalUnit,
              options: intervalUnitOptions,
              onChange: (val) => setScheduleConfig((prev) => ({ ...prev, intervalUnit: val }))
            }
          )
        ] }) : null,
        /* @__PURE__ */ jsx9("div", { className: "hr-create-preview-sentence", children: humanSentence })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-when-section", children: [
        /* @__PURE__ */ jsx9("div", { className: "hr-create-section-label", children: "RESULTS" }),
        /* @__PURE__ */ jsx9(
          NativeSelect,
          {
            label: "Where should results go?",
            value: destinationChoice,
            options: destinationChoices.map((o) => ({ value: o.value, label: o.label })),
            onChange: (val) => {
              setDestinationChoice(val);
              setBroadcastOptIn(false);
              setBroadcastConfirmed(false);
            }
          }
        ),
        selectedDestination !== null ? /* @__PURE__ */ jsx9("div", { className: "hr-create-preview-sentence", children: selectedDestination.detail }) : null,
        destinationChoice === DESTINATION_ADVANCED && !broadcastOptIn ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-field", children: [
          /* @__PURE__ */ jsx9("label", { className: "hr-field-label", children: "Advanced destination override" }),
          /* @__PURE__ */ jsxs8("div", { className: "hr-create-sub-split", children: [
            /* @__PURE__ */ jsx9(
              Input2,
              {
                type: "text",
                placeholder: "Platform",
                value: advancedPlatform,
                onChange: (e) => setAdvancedPlatform(e.target.value),
                "aria-label": "Advanced destination platform"
              }
            ),
            /* @__PURE__ */ jsx9(
              Input2,
              {
                type: "text",
                placeholder: "Channel or chat id",
                value: advancedChatId,
                onChange: (e) => setAdvancedChatId(e.target.value),
                "aria-label": "Advanced destination channel or chat id"
              }
            )
          ] }),
          /* @__PURE__ */ jsx9(
            Input2,
            {
              type: "text",
              placeholder: "Thread id (optional)",
              value: advancedThreadId,
              onChange: (e) => setAdvancedThreadId(e.target.value),
              "aria-label": "Advanced destination thread id"
            }
          ),
          /* @__PURE__ */ jsx9("div", { className: "hr-create-preview-sentence", children: selectedDestination?.detail ?? "" }),
          /* @__PURE__ */ jsxs8("div", { className: "hr-create-broadcast-quiet", children: [
            /* @__PURE__ */ jsx9("p", { className: "hr-create-broadcast-note", children: "Sending to every connected channel is not a normal destination." }),
            /* @__PURE__ */ jsx9(
              Button5,
              {
                variant: "outline",
                size: "sm",
                onClick: () => {
                  setBroadcastOptIn(true);
                  setBroadcastConfirmed(false);
                },
                children: BROADCAST_ADVANCED_ACTION
              }
            )
          ] })
        ] }) : null,
        broadcastPending ? /* @__PURE__ */ jsxs8("div", { className: "hr-create-broadcast-card", children: [
          /* @__PURE__ */ jsx9("p", { className: "hr-create-broadcast-note", children: "Results are delivered to every channel this profile is connected to. Nothing narrows this later." }),
          /* @__PURE__ */ jsxs8("label", { className: "hr-create-broadcast-check", children: [
            /* @__PURE__ */ jsx9(
              "input",
              {
                type: "checkbox",
                checked: broadcastConfirmed,
                onChange: (e) => setBroadcastConfirmed(e.target.checked),
                "aria-label": BROADCAST_ACKNOWLEDGEMENT
              }
            ),
            /* @__PURE__ */ jsx9("span", { children: BROADCAST_ACKNOWLEDGEMENT })
          ] }),
          /* @__PURE__ */ jsx9(
            Button5,
            {
              variant: "outline",
              size: "sm",
              onClick: () => {
                setBroadcastOptIn(false);
                setBroadcastConfirmed(false);
              },
              children: BROADCAST_ADDRESS_ACTION
            }
          )
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-active-card", children: [
        /* @__PURE__ */ jsxs8("div", { className: "hr-create-active-info", children: [
          /* @__PURE__ */ jsx9("span", { className: "hr-create-active-title", children: "Start enabled" }),
          /* @__PURE__ */ jsx9("span", { className: "hr-create-active-subtitle", children: startEnabled ? "The routine runs on the schedule above as soon as it is created." : "The routine is created paused, so it waits until you turn it on yourself." })
        ] }),
        /* @__PURE__ */ jsx9(
          Button5,
          {
            variant: "secondary",
            size: "sm",
            role: "switch",
            "aria-checked": startEnabled,
            "aria-label": "Start the routine enabled",
            className: `hr-switch-pill ${startEnabled ? "hr-switch-active" : ""}`,
            onClick: () => setStartEnabled(!startEnabled),
            children: /* @__PURE__ */ jsx9("span", { className: "hr-switch-thumb" })
          }
        )
      ] }),
      error ? /* @__PURE__ */ jsx9("div", { className: "hr-create-error", role: "alert", children: error }) : null,
      onSubmitGuided ? /* @__PURE__ */ jsxs8("section", { className: "hr-create-hermes-quiet", "aria-labelledby": "hr-create-hermes-title", children: [
        /* @__PURE__ */ jsx9("span", { id: "hr-create-hermes-title", className: "hr-sr-only", children: "Finish with Hermes" }),
        /* @__PURE__ */ jsx9(
          Button5,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": "Create this routine and finish the setup with Hermes",
            disabled: !draftReady || busy || broadcastBlocked,
            onClick: () => void handleSubmit("guided"),
            children: pendingPath === "guided" ? "Starting\u2026" : "Finish with Hermes \u2192"
          }
        ),
        /* @__PURE__ */ jsx9("p", { className: "hr-create-hermes-note", children: "Let Hermes review this paused routine in chat before you enable it." })
      ] }) : null,
      /* @__PURE__ */ jsxs8("div", { className: "hr-create-actions", children: [
        /* @__PURE__ */ jsx9(
          Button5,
          {
            variant: "text",
            size: "sm",
            onClick: onClose,
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsx9(
          Button5,
          {
            variant: "default",
            size: "sm",
            disabled: !draftReady || busy || broadcastBlocked,
            onClick: () => void handleSubmit("direct"),
            children: pendingPath === "direct" ? "Creating\u2026" : "Create Routine"
          }
        )
      ] })
    ] })
  ] });
}

// src/views/GuidedRoutinePanel.tsx
import { useState as useState2 } from "react";
import { Button as Button7, Input as Input3, Textarea as Textarea3 } from "@hermes/plugin-sdk";

// src/views/GuidedProposalReview.tsx
import { Button as Button6 } from "@hermes/plugin-sdk";
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
function cellText(value) {
  return value.trim() ? value : "\u2014";
}
function GuidedProposalReview({
  review,
  busy,
  onConfirm,
  onContinueConfiguring
}) {
  return /* @__PURE__ */ jsxs9("div", { className: "hr-review", children: [
    /* @__PURE__ */ jsx10("div", { className: "hr-create-section-label", children: "REVIEW THE PROPOSAL" }),
    /* @__PURE__ */ jsxs9("table", { className: "hr-review-table", children: [
      /* @__PURE__ */ jsx10("caption", { className: "hr-sr-only", children: "Current configuration compared with the proposed configuration for this routine." }),
      /* @__PURE__ */ jsx10("thead", { children: /* @__PURE__ */ jsxs9("tr", { children: [
        /* @__PURE__ */ jsx10("th", { scope: "col", children: "Field" }),
        /* @__PURE__ */ jsx10("th", { scope: "col", children: "Current" }),
        /* @__PURE__ */ jsx10("th", { scope: "col", children: "Proposed" })
      ] }) }),
      /* @__PURE__ */ jsx10("tbody", { children: review.rows.map((row) => /* @__PURE__ */ jsxs9("tr", { className: row.changed ? "hr-review-row-changed" : void 0, children: [
        /* @__PURE__ */ jsxs9("th", { scope: "row", children: [
          row.label,
          row.changed ? /* @__PURE__ */ jsx10("span", { className: "hr-review-flag", children: "changed" }) : null,
          row.patchable ? row.changed ? /* @__PURE__ */ jsx10("span", { className: "hr-review-editable", children: "editable" }) : null : /* @__PURE__ */ jsx10("span", { className: "hr-review-readonly", children: "not editable" })
        ] }),
        /* @__PURE__ */ jsx10("td", { className: "hr-review-cell", children: /* @__PURE__ */ jsx10("span", { className: "hr-review-cell-text", children: cellText(row.current) }) }),
        /* @__PURE__ */ jsx10("td", { className: "hr-review-cell hr-review-proposed", children: /* @__PURE__ */ jsx10("span", { className: "hr-review-cell-text", children: row.changed ? cellText(row.proposed) : cellText(row.current) }) })
      ] }, row.field)) })
    ] }),
    review.note ? /* @__PURE__ */ jsxs9("div", { className: "hr-review-note", children: [
      /* @__PURE__ */ jsx10("span", { className: "hr-review-note-label", children: "From Hermes (explanation, not configuration)" }),
      /* @__PURE__ */ jsx10("p", { className: "hr-review-note-text", children: review.note })
    ] }) : null,
    isBroadcastDelivery(review.proposed.delivery) ? /* @__PURE__ */ jsx10("div", { className: "hr-create-broadcast-card", role: "status", children: /* @__PURE__ */ jsx10("p", { className: "hr-create-broadcast-note", children: BROADCAST_REVIEW_WARNING }) }) : null,
    review.stale ? /* @__PURE__ */ jsx10("div", { className: "hr-create-error", role: "alert", children: "The routine changed after this proposal was built. Applying it will be refused \u2014 ask Hermes for a new proposal before confirming." }) : null,
    /* @__PURE__ */ jsxs9("div", { className: "hr-review-outcomes", children: [
      /* @__PURE__ */ jsxs9("div", { className: "hr-detail", children: [
        /* @__PURE__ */ jsx10("span", { className: "hr-detail-label", children: "Apply and activate" }),
        /* @__PURE__ */ jsx10("span", { className: "hr-detail-value", children: "This routine ends active." })
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "hr-detail", children: [
        /* @__PURE__ */ jsx10("span", { className: "hr-detail-label", children: "Keep paused" }),
        /* @__PURE__ */ jsx10("span", { className: "hr-detail-value", children: "This routine ends configured and paused." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs9("div", { className: "hr-create-actions", children: [
      /* @__PURE__ */ jsx10(Button6, { variant: "text", size: "sm", disabled: busy, onClick: onContinueConfiguring, children: "Continue configuring" }),
      /* @__PURE__ */ jsx10(Button6, { variant: "outline", size: "sm", disabled: busy, onClick: () => onConfirm(false), children: "Keep paused" }),
      /* @__PURE__ */ jsx10(Button6, { variant: "default", size: "sm", disabled: busy, onClick: () => onConfirm(true), children: "Apply and activate" })
    ] })
  ] });
}

// src/views/GuidedRoutinePanel.tsx
import { Fragment as Fragment2, jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
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
  submittedDelivery,
  initialLaunch,
  autoSubmitOnFirstLaunch,
  activeRoute,
  onLaunch,
  onClose
}) {
  const [launching, setLaunching] = useState2(false);
  const [launch, setLaunch] = useState2(initialLaunch ?? null);
  const [autoSubmit] = useState2(autoSubmitOnFirstLaunch !== false);
  const [handoff, setHandoff] = useState2("");
  const [wf, setWf] = useState2(() => initialGuidedWorkflow(routine.jobId));
  const [busy, setBusy] = useState2(false);
  const firstLaunch = launch === null;
  const S = GUIDED_WORKFLOW_STATE;
  const title = routineTitle(routine.job, submittedName || "Routine");
  const schedule = humanScheduleOf(routine.job) || submittedSchedule || "\u2014";
  const instruction = routinePromptOf(routine.job) ?? submittedPrompt;
  const profile = backendTargetProfile(routine.route, routine.backendProfile);
  const review = buildProposalReview(wf.current, wf.proposal);
  const inFlight = busy || wf.state === S.APPLYING || wf.state === S.ACTIVATING;
  const drift = guidedRouteDrift(routine.route, activeRoute ?? null);
  async function handleLaunch() {
    if (launching) return;
    setLaunching(true);
    try {
      const result = await onLaunch(
        routine,
        { name: submittedName, schedule: submittedSchedule, prompt: submittedPrompt },
        // The initial Finish action already authorized a submit. A retry is
        // another explicit click on that same paused job, not another create.
        autoSubmit || !firstLaunch
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
    const close = /* @__PURE__ */ jsx11(Button7, { variant: "text", size: "sm", onClick: onClose, children: "Close" });
    if (showReview) {
      return /* @__PURE__ */ jsx11("div", { className: "hr-create-actions", children: close });
    }
    if (wf.state === S.CONFIGURED_PAUSED) {
      return /* @__PURE__ */ jsxs10("div", { className: "hr-create-actions", children: [
        close,
        /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: inFlight,
            onClick: () => void handleActivate(),
            children: wf.failure !== null && wf.failure.stage === "resume" ? "Retry activation" : "Activate now"
          }
        )
      ] });
    }
    if (wf.state === S.NEEDS_ATTENTION) {
      const recovery = wf.failure?.recovery;
      return /* @__PURE__ */ jsxs10("div", { className: "hr-create-actions", children: [
        close,
        recovery === "apply" ? /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: inFlight,
            onClick: () => void handleConfirm(wf.desiredActive),
            children: "Try applying again"
          }
        ) : null,
        recovery === "activation" ? /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: inFlight,
            onClick: () => void handleActivate(),
            children: "Retry activation"
          }
        ) : null,
        recovery === "refresh" ? /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: inFlight,
            onClick: () => void handleRefresh(),
            children: "Refresh status"
          }
        ) : null
      ] });
    }
    if (wf.state === S.PROVISIONAL_PAUSED || wf.state === S.CONFIGURING) {
      return /* @__PURE__ */ jsxs10("div", { className: "hr-create-actions", children: [
        close,
        !opened ? /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: launching,
            onClick: () => void handleLaunch(),
            children: launching ? "Opening\u2026" : failed2 ? "Retry chat" : "Configure with Hermes"
          }
        ) : null
      ] });
    }
    return /* @__PURE__ */ jsx11("div", { className: "hr-create-actions", children: close });
  }
  return /* @__PURE__ */ jsxs10("aside", { className: "hr-inspector hr-create-inspector", "aria-label": "Configure routine with Hermes", children: [
    /* @__PURE__ */ jsx11("header", { className: "hr-inspector-header", children: /* @__PURE__ */ jsx11(PanelNav, { closeLabel: "Close configuration and return to routines", onClose }) }),
    /* @__PURE__ */ jsxs10("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsx11("h3", { className: "hr-create-title", children: title }),
      /* @__PURE__ */ jsx11("div", { className: "hr-create-active-card", children: /* @__PURE__ */ jsxs10("div", { className: "hr-create-active-info", children: [
        /* @__PURE__ */ jsx11("span", { className: "hr-create-active-title", children: guidedIndicator(wf.state, wf.failure) }),
        /* @__PURE__ */ jsx11("span", { className: "hr-create-active-subtitle", children: stateSubtitle(wf.state, wf.failure, profile) })
      ] }) }),
      drift.drifted ? /* @__PURE__ */ jsx11("div", { className: "hr-create-error", role: "alert", children: `The active profile changed to ${drift.current}. This session stays bound to ${drift.retained} \u2014 reviewing or applying here still targets the original owner.` }) : null,
      /* @__PURE__ */ jsxs10("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx11("label", { className: "hr-field-label", children: "Job id" }),
        /* @__PURE__ */ jsx11(
          Input3,
          {
            type: "text",
            value: routine.jobId,
            disabled: true,
            readOnly: true,
            "aria-label": "Routine job id"
          }
        )
      ] }),
      showReview && review !== null ? /* @__PURE__ */ jsx11(
        GuidedProposalReview,
        {
          review,
          busy: inFlight,
          onConfirm: (desiredActive) => void handleConfirm(desiredActive),
          onContinueConfiguring: () => setWf(guidedWorkflowReducer(wf, { type: "continue-configuring" }))
        }
      ) : /* @__PURE__ */ jsxs10(Fragment2, { children: [
        /* @__PURE__ */ jsxs10("div", { className: "hr-create-field", children: [
          /* @__PURE__ */ jsx11("label", { className: "hr-field-label", children: "What should this routine do?" }),
          /* @__PURE__ */ jsx11(
            Textarea3,
            {
              rows: 3,
              value: instruction ?? "",
              disabled: true,
              readOnly: true,
              "aria-label": "What this routine does",
              placeholder: "No instruction stored for this routine."
            }
          )
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "hr-create-when-section", children: [
          /* @__PURE__ */ jsx11("div", { className: "hr-create-section-label", children: "WHEN TO RUN" }),
          /* @__PURE__ */ jsx11("div", { className: "hr-create-preview-sentence", children: schedule })
        ] }),
        submittedDelivery ? /* @__PURE__ */ jsxs10("div", { className: "hr-create-field", children: [
          /* @__PURE__ */ jsx11("label", { className: "hr-field-label", children: "Results go to" }),
          /* @__PURE__ */ jsx11("div", { className: "hr-create-preview-sentence", children: describeDestination(submittedDelivery)?.label ?? submittedDelivery })
        ] }) : null
      ] }),
      wf.failure !== null ? /* @__PURE__ */ jsx11("div", { className: "hr-create-error", role: "alert", children: wf.failure.message }) : null,
      failed2 ? /* @__PURE__ */ jsxs10("div", { className: "hr-create-error", role: "alert", children: [
        launch.message,
        launch.jobId ? " The routine is still paused." : ""
      ] }) : null,
      opened ? /* @__PURE__ */ jsx11("div", { className: "hr-create-preview-sentence", role: "status", children: launch.autoSubmitted ? "Chat opened on this profile and the configuration envelope was sent." : "Chat opened on this profile with the configuration envelope ready to send." }) : null,
      showHandoff ? /* @__PURE__ */ jsxs10("div", { className: "hr-create-field", children: [
        /* @__PURE__ */ jsx11("label", { className: "hr-field-label", htmlFor: "hr-guided-handoff", children: "Proposal returned by Hermes" }),
        /* @__PURE__ */ jsx11(
          Textarea3,
          {
            id: "hr-guided-handoff",
            rows: 4,
            value: handoff,
            onChange: (e) => setHandoff(e.target.value),
            "aria-label": "Paste the proposal object Hermes returned",
            placeholder: '{"version":1,"jobId":"\u2026","owner":{\u2026},"base":{\u2026},"patch":{\u2026},"desiredActive":false}'
          }
        ),
        /* @__PURE__ */ jsx11("div", { className: "hr-create-actions", children: /* @__PURE__ */ jsx11(
          Button7,
          {
            variant: "default",
            size: "sm",
            disabled: inFlight || handoff.trim().length === 0,
            onClick: () => void handleReviewProposal(),
            children: busy ? "Reading\u2026" : "Review proposal"
          }
        ) })
      ] }) : null,
      actionsFor(),
      /* @__PURE__ */ jsx11("p", { className: "hr-sr-only", role: "status", "aria-live": "polite", children: wf.status })
    ] })
  ] });
}

// src/views/panels.tsx
import { Button as Button8 } from "@hermes/plugin-sdk";
import { Fragment as Fragment3, jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
function StatusLine({ text, statusRef, restatesVisibleState }) {
  return /* @__PURE__ */ jsx12(
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
import { Button as Button9 } from "@hermes/plugin-sdk";
import { jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function LoadingState({ text }) {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-state", role: "status", "aria-live": "polite", "aria-busy": "true", children: [
    /* @__PURE__ */ jsx13("span", { className: "hr-spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx13("p", { className: "hr-state-text", children: text })
  ] });
}
function EmptyState() {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx13("p", { className: "hr-state-title", children: "No routines yet" }),
    /* @__PURE__ */ jsx13("p", { className: "hr-state-text", children: "Scheduled jobs for this profile will appear here." })
  ] });
}
function EmptyFilterState({
  title = "No routines match this filter",
  hint = "Try a different filter to see more routines."
}) {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx13("p", { className: "hr-state-title", children: title }),
    /* @__PURE__ */ jsx13("p", { className: "hr-state-text", children: hint })
  ] });
}
function ErrorState({
  title,
  message,
  onRetry
}) {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx13("strong", { children: title }),
    /* @__PURE__ */ jsx13("p", { className: "hr-row-meta", children: message }),
    /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "sm", onClick: onRetry, children: "Retry" })
  ] });
}
function UnavailableState({
  profile,
  onRetry
}) {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx13("strong", { children: "Routines unavailable for this profile." }),
    /* @__PURE__ */ jsx13("p", { className: "hr-row-meta", children: profile ? `The Desktop profile \u201C${profile}\u201D has no routines route right now. Connect the profile, then retry.` : "The active Desktop profile has no routines route right now. Select a profile, then retry." }),
    /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "sm", onClick: onRetry, children: "Retry" })
  ] });
}
function StaleBanner({ onRetry }) {
  return /* @__PURE__ */ jsxs12("div", { className: "hr-stale", role: "status", children: [
    /* @__PURE__ */ jsx13("span", { children: "Showing last loaded jobs." }),
    /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "xs", onClick: onRetry, children: "Refresh" })
  ] });
}
var ATTENTION_BAND_ID = "hermes-routines-attention";
function NeedsAttentionNotice({
  count,
  paused = 0,
  onFocus
}) {
  if (count === 0) return null;
  return /* @__PURE__ */ jsxs12("div", { id: ATTENTION_BAND_ID, className: "hr-attention", role: "status", tabIndex: -1, children: [
    /* @__PURE__ */ jsxs12(
      "svg",
      {
        className: "hr-attention-glyph",
        width: "14",
        height: "14",
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.8",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        children: [
          /* @__PURE__ */ jsx13("circle", { cx: "8", cy: "8", r: "6.5" }),
          /* @__PURE__ */ jsx13("line", { x1: "5.5", y1: "5.5", x2: "10.5", y2: "10.5" }),
          /* @__PURE__ */ jsx13("line", { x1: "10.5", y1: "5.5", x2: "5.5", y2: "10.5" })
        ]
      }
    ),
    /* @__PURE__ */ jsx13("span", { className: "hr-attention-text", children: count === 1 ? "1 routine needs attention" : `${count} routines need attention` }),
    paused > 0 ? /* @__PURE__ */ jsx13("span", { className: "hr-attention-note", children: paused === 1 ? "1 paused routine also failed before it was paused" : `${paused} paused routines also failed before they were paused` }) : null,
    /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "xs", onClick: onFocus, children: "Show them" })
  ] });
}
var CONFIG_BAND_ID = "hermes-routines-config";
function NeedsConfigurationNotice({
  count,
  onView
}) {
  if (count === 0) return null;
  return /* @__PURE__ */ jsxs12("div", { id: CONFIG_BAND_ID, className: "hr-config-note", role: "status", tabIndex: -1, children: [
    /* @__PURE__ */ jsx13("span", { children: count === 1 ? "1 routine needs configuration" : `${count} routines need configuration` }),
    /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "xs", onClick: onView, children: "View" })
  ] });
}
function NeedsConfigurationFocusBar({
  visibleCount,
  onClear
}) {
  return /* @__PURE__ */ jsxs12(
    "div",
    {
      id: CONFIG_BAND_ID,
      className: "hr-attention hr-attention-active",
      role: "status",
      tabIndex: -1,
      children: [
        /* @__PURE__ */ jsx13("span", { className: "hr-attention-text", children: visibleCount === 0 ? "No routine needing configuration matches this search" : visibleCount === 1 ? "Showing 1 routine that needs configuration" : `Showing ${visibleCount} routines that need configuration` }),
        /* @__PURE__ */ jsx13(Button9, { variant: "outline", size: "xs", onClick: onClear, children: "Show all routines" })
      ]
    }
  );
}

// src/views/RoutinesPage.tsx
import { Fragment as Fragment4, jsx as jsx14, jsxs as jsxs13 } from "react/jsx-runtime";
function pastTense(kind) {
  if (kind === "pause") return "paused";
  if (kind === "resume") return "resumed";
  return "saved";
}
function matchesQuery(job, query) {
  const q = query.trim().toLowerCase();
  const name = (routineTitle(job, "") || jobIdOf(job)).toLowerCase();
  const schedule = (humanScheduleOf(job) || "").toLowerCase();
  return name.includes(q) || schedule.includes(q);
}
function RoutinesPage() {
  const [state, setState] = useState3(initialRoutinesState);
  const [routesNonce, setRoutesNonce] = useState3(0);
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
  const [searchQuery, setSearchQuery] = useState3("");
  const [selectedJobKey, setSelectedJobKey] = useState3(null);
  const [isCreating, setIsCreating] = useState3(false);
  const [guided, setGuided] = useState3(null);
  const [guidedRecent, setGuidedRecent] = useState3(null);
  useEffect2(() => {
    if (selectedJobKey === null) return;
    const stillThere = state.jobs.some(
      (job, index) => routineKey(job, `routine ${index + 1}`) === selectedJobKey
    );
    if (!stillThere) setSelectedJobKey(null);
  }, [state.jobs, selectedJobKey]);
  const searchMatches = useMemo2(() => {
    const q = searchQuery.trim();
    if (!q) return state.jobs;
    return state.jobs.filter((job) => matchesQuery(job, q));
  }, [state.jobs, searchQuery]);
  const filteredJobs = useMemo2(() => {
    const searched = searchQuery.trim() ? shown.filter((job) => matchesQuery(job, searchQuery)) : shown;
    const inAttention = state.attentionFocus === null ? searched : searched.filter((job) => {
      const id = jobIdOf(job);
      return id !== "" && state.attentionFocus !== null && state.attentionFocus.indexOf(id) !== -1;
    });
    if (state.configFocus === null) return inAttention;
    const focus = state.configFocus;
    return inAttention.filter((job) => {
      const id = jobIdOf(job);
      return id !== "" && focus.indexOf(id) !== -1;
    });
  }, [shown, searchQuery, state.attentionFocus, state.configFocus]);
  const attention = useMemo2(() => {
    const failing = attentionTargets(searchMatches);
    const pausedFailures = searchMatches.filter(
      (job) => routinePausedOf(job) && isFailedStatus(job) && !needsAttention(job)
    ).length;
    return { count: failing.length, pausedFailures };
  }, [searchMatches]);
  const configCandidates = useMemo2(() => {
    if (guided !== null) return [];
    return searchMatches.filter((job) => guidedConfigCandidateOf(job) !== null);
  }, [searchMatches, guided]);
  const selectedJob = useMemo2(() => {
    if (!selectedJobKey) return null;
    return state.jobs.find(
      (j, index) => routineKey(j, `routine ${index + 1}`) === selectedJobKey
    ) ?? null;
  }, [state.jobs, selectedJobKey]);
  const selectedJobId = selectedJob ? jobIdOf(selectedJob) : "";
  const selectedJobLabel = selectedJob ? routineTitle(selectedJob, selectedJobKey || "Routine") : selectedJobKey || "Routine";
  function closeSurface(surface) {
    const key = surface === "inspector" ? selectedJobKey : null;
    if (surface === "inspector") setSelectedJobKey(null);
    if (surface === "composer") setIsCreating(false);
    if (surface === "guided") handleGuidedClose();
    const focusId = dismissFocusId(surface, key);
    if (focusId === null) return;
    setTimeout(() => {
      focusById(focusId);
    }, 0);
  }
  const openSurface = selectedJob !== null ? "inspector" : guided !== null ? "guided" : isCreating ? "composer" : null;
  function handleWorkspaceKeyDown(event) {
    if (event.key !== "Escape") return;
    if (openSurface === null) return;
    if (!escapeLeavesPanel(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    closeSurface(openSurface);
  }
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
  async function handleCreateRoutine(name, schedule, prompt, active, delivery) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    const route = activeRoute;
    const createSlot = "";
    try {
      const addParams = buildAddParams(route, { name, schedule, prompt, delivery });
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
  async function handleCreateGuided(name, schedule, prompt, delivery) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    const createSlot = "";
    dispatch({ type: "mutate-start", jobId: createSlot });
    try {
      const result = await createProvisionalRoutine({ route: activeRoute, name, schedule, prompt, delivery });
      dispatch({ type: "mutate-end", jobId: createSlot });
      dispatch({ type: "retry-list" });
      if (result.ok === false) {
        dispatch({ type: "mutation-error", error: "failed to create routine: " + result.message });
        return false;
      }
      const initialLaunch = await launchGuidedConfiguration({
        routine: result.routine,
        submitted: { name, schedule, prompt },
        autoSubmit: true
      });
      dispatch({ type: "config-focus-cleared" });
      setGuided({ routine: result.routine, name, schedule, prompt, delivery, initialLaunch });
      setGuidedRecent(null);
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
  function handleGuidedClose() {
    if (guided !== null) setGuidedRecent(guided);
    setGuided(null);
  }
  function handleGuidedReopen(jobId) {
    dispatch({ type: "config-focus-cleared" });
    if (guidedRecent !== null && guidedRecent.routine.jobId === jobId) {
      setGuided(guidedRecent);
      setGuidedRecent(null);
      setIsCreating(false);
      setSelectedJobKey(null);
      return;
    }
    const row = state.jobs.find((job) => jobIdOf(job) === jobId) ?? null;
    if (row === null || guidedConfigCandidateOf(row) === null) {
      dispatch({
        type: "notice",
        notice: "that routine can no longer be opened for configuration \u2014 check the routines list"
      });
      return;
    }
    const handle = activeRoute === null ? null : buildReopenHandle(activeRoute, row);
    if (handle === null) {
      dispatch({
        type: "notice",
        notice: "that routine can no longer be opened for configuration \u2014 check the routines list"
      });
      return;
    }
    setGuided({
      routine: handle,
      name: routineTitle(row, "Routine"),
      schedule: humanScheduleOf(row) || "",
      prompt: routinePromptOf(row) ?? ""
    });
    setGuidedRecent(null);
    setIsCreating(false);
    setSelectedJobKey(null);
  }
  function setAttentionFocus(event) {
    if (event === "focus") {
      dispatch({ type: "attention-focus", jobs: searchMatches });
    } else {
      dispatch({ type: "attention-focus-cleared" });
    }
    setTimeout(() => {
      focusById(ATTENTION_BAND_ID);
    }, 0);
  }
  function setConfigFocus(event) {
    if (event === "focus") {
      dispatch({ type: "config-focus", jobs: searchMatches });
    } else {
      dispatch({ type: "config-focus-cleared" });
    }
    setTimeout(() => {
      focusById(CONFIG_BAND_ID);
    }, 0);
  }
  function renderList() {
    const counts = state.status === S.READY ? filterCounts(searchMatches) : null;
    const focusBar = state.attentionFocus !== null && state.attentionFocus.length > 0 ? /* @__PURE__ */ jsxs13(
      "div",
      {
        id: ATTENTION_BAND_ID,
        className: "hr-attention hr-attention-active",
        role: "status",
        tabIndex: -1,
        children: [
          /* @__PURE__ */ jsx14("span", { className: "hr-attention-text", children: filteredJobs.length === 0 ? "No failing routine matches this search" : filteredJobs.length === 1 ? "Showing 1 routine that needs attention" : `Showing ${filteredJobs.length} routines that need attention` }),
          /* @__PURE__ */ jsx14(
            Button10,
            {
              variant: "outline",
              size: "xs",
              onClick: () => setAttentionFocus("clear"),
              children: "Show all routines"
            }
          )
        ]
      }
    ) : null;
    return /* @__PURE__ */ jsxs13(Fragment4, { children: [
      /* @__PURE__ */ jsxs13("div", { className: "hr-toolbar", children: [
        /* @__PURE__ */ jsxs13("div", { className: "hr-search-wrap", children: [
          /* @__PURE__ */ jsx14(
            Input4,
            {
              type: "text",
              placeholder: "Search routines\u2026",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              "aria-label": "Search routines"
            }
          ),
          searchQuery ? /* @__PURE__ */ jsx14(
            Button10,
            {
              variant: "ghost",
              size: "icon-xs",
              className: "hr-search-clear",
              onClick: () => setSearchQuery(""),
              "aria-label": "Clear search",
              children: /* @__PURE__ */ jsx14("svg", { width: "10", height: "10", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx14("path", { d: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" }) })
            }
          ) : null
        ] }),
        /* @__PURE__ */ jsx14("div", { className: "hr-filters-col", children: /* @__PURE__ */ jsx14(
          FilterNav,
          {
            filter: state.filter,
            disabled: locked,
            counts: counts ?? void 0,
            onSelect: (value) => dispatch({ type: "filter-changed", filter: value })
          }
        ) })
      ] }),
      focusBar ?? /* @__PURE__ */ jsx14(
        NeedsAttentionNotice,
        {
          count: attention.count,
          paused: attention.pausedFailures,
          onFocus: () => setAttentionFocus("focus")
        }
      ),
      filteredJobs.length === 0 ? state.jobs.length === 0 ? /* @__PURE__ */ jsx14(EmptyState, {}) : state.attentionFocus !== null ? (
        // The only way a live focus can match nothing is a search that no
        // longer covers any failing routine: the reducer re-derives the
        // focus on every list load, so a routine that recovered or
        // vanished would have dropped the focus rather than emptied it.
        // Copy that names the real cause — the generic "no routines match
        // this filter" would blame a filter the user never applied, and
        // "every routine is healthy" would be a claim about rows this
        // search is not even showing.
        /* @__PURE__ */ jsx14(
          EmptyFilterState,
          {
            title: "No failing routine matches this search",
            hint: "Clear the search box to see the routines that need attention."
          }
        )
      ) : state.configFocus !== null ? (
        // Same trap one dimension over: the only way a live
        // configuration focus can match nothing is a search that no
        // longer covers any candidate — a configured or vanished
        // routine would have dropped the focus on the next list load.
        /* @__PURE__ */ jsx14(
          EmptyFilterState,
          {
            title: "No routine needing configuration matches this search",
            hint: "Clear the search box to see the routines that need configuration."
          }
        )
      ) : /* @__PURE__ */ jsx14(EmptyFilterState, {}) : /* @__PURE__ */ jsx14(
        RoutineList,
        {
          jobs: filteredJobs,
          pending: state.pending,
          locked,
          inspectedId: selectedJobKey,
          inspectorId: INSPECTOR_PANEL_ID,
          rowControlId: routineRowFocusId,
          onInspect: (key) => {
            setSelectedJobKey(key);
            if (key) {
              setIsCreating(false);
              handleGuidedClose();
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
    body.push(/* @__PURE__ */ jsx14(LoadingState, { text: "Loading routines." }, "routes-loading"));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      /* @__PURE__ */ jsx14(
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
      /* @__PURE__ */ jsx14(
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
        /* @__PURE__ */ jsx14(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-loading")
      );
      body.push(/* @__PURE__ */ jsx14("div", { children: renderList() }, "stale-list"));
    } else {
      body.push(/* @__PURE__ */ jsx14(LoadingState, { text: "Loading routines." }, "list-loading"));
    }
  } else if (state.status === S.LIST_ERROR) {
    if (state.jobs.length > 0) {
      body.push(
        /* @__PURE__ */ jsx14(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-error")
      );
      body.push(/* @__PURE__ */ jsx14("div", { children: renderList() }, "stale-list-error"));
    }
    body.push(
      /* @__PURE__ */ jsx14(
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
    if (guided === null) {
      if (state.configFocus !== null && state.configFocus.length > 0) {
        body.push(
          /* @__PURE__ */ jsx14(
            NeedsConfigurationFocusBar,
            {
              visibleCount: filteredJobs.length,
              onClear: () => setConfigFocus("clear")
            },
            "config-focus"
          )
        );
      } else if (configCandidates.length > 0) {
        body.push(
          /* @__PURE__ */ jsx14(
            NeedsConfigurationNotice,
            {
              count: configCandidates.length,
              onView: () => setConfigFocus("focus")
            },
            "needs-configuration"
          )
        );
      }
    }
    body.push(/* @__PURE__ */ jsx14("div", { children: renderList() }, "ready-list"));
  }
  const profileLabel = typeof activeProfile === "string" && activeProfile ? activeProfile : "\u2014";
  return /* @__PURE__ */ jsxs13("section", { id: "hermes-routines-root", className: "hr-root", "aria-labelledby": "hermes-routines-heading", children: [
    /* @__PURE__ */ jsx14("style", { children: ROUTINES_CSS }),
    /* @__PURE__ */ jsxs13("div", { className: "hr-workspace", onKeyDown: handleWorkspaceKeyDown, children: [
      /* @__PURE__ */ jsxs13("div", { className: `hr-feed-column${!selectedJob && !guided && !isCreating ? " hr-feed-contained" : ""}`, children: [
        /* @__PURE__ */ jsxs13("header", { className: "hr-header", children: [
          /* @__PURE__ */ jsxs13("div", { className: "hr-header-top", children: [
            /* @__PURE__ */ jsx14("h2", { id: "hermes-routines-heading", ref: headingRef, tabIndex: -1, className: "hr-title", children: "Routines" }),
            /* @__PURE__ */ jsxs13(
              Button10,
              {
                variant: "default",
                size: "sm",
                id: NEW_ROUTINE_CONTROL_ID,
                className: "hr-btn-new",
                onClick: () => {
                  setSelectedJobKey(null);
                  setGuided(null);
                  setGuidedRecent(null);
                  setIsCreating(true);
                },
                children: [
                  /* @__PURE__ */ jsxs13(
                    "svg",
                    {
                      width: "16",
                      height: "16",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: "2.5",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      "aria-hidden": "true",
                      children: [
                        /* @__PURE__ */ jsx14("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
                        /* @__PURE__ */ jsx14("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx14("span", { className: "hr-btn-new-label", children: "New routine" })
                ]
              }
            ),
            /* @__PURE__ */ jsxs13("span", { className: "hr-sr-only", children: [
              "Profile: ",
              profileLabel
            ] })
          ] }),
          /* @__PURE__ */ jsx14("p", { className: "hr-sub", children: "Routines are scheduled jobs this profile runs to do recurring tasks." })
        ] }),
        body
      ] }),
      selectedJob ? /* @__PURE__ */ jsx14(
        RoutineInspectorPanel,
        {
          job: selectedJob,
          fallback: selectedJobKey || "Routine",
          id: INSPECTOR_PANEL_ID,
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          busy: selectedJobId !== "" && state.pending.indexOf(selectedJobId) !== -1,
          disabled: locked,
          onClose: () => closeSurface("inspector"),
          onPause: () => handlePause(selectedJobId, selectedJobLabel),
          onResume: () => handleResume(selectedJobId, selectedJobLabel),
          onConfigure: handleGuidedReopen
        }
      ) : guided ? /* @__PURE__ */ jsx14(
        GuidedRoutinePanel,
        {
          routine: guided.routine,
          submittedName: guided.name,
          submittedSchedule: guided.schedule,
          submittedPrompt: guided.prompt,
          submittedDelivery: guided.delivery,
          initialLaunch: guided.initialLaunch,
          activeRoute,
          onLaunch: handleGuidedLaunch,
          onClose: () => closeSurface("guided")
        }
      ) : isCreating ? /* @__PURE__ */ jsx14(
        RoutineComposerPanel,
        {
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          destinationRoutes: activeRoute === null ? state.routes : [activeRoute, ...state.routes],
          disabled: locked,
          onClose: () => closeSurface("composer"),
          onSubmit: handleCreateRoutine,
          onSubmitGuided: handleCreateGuided
        }
      ) : null
    ] }),
    /* @__PURE__ */ jsx14(StatusLine, { text: liveText, statusRef, restatesVisibleState: liveRestatesVisible })
  ] });
}

// src/plugin.tsx
import { jsx as jsx15 } from "react/jsx-runtime";
function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => /* @__PURE__ */ jsx15(RoutinesPage, {})
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
  ATTENTION_BAND_ID,
  BROADCAST_ACKNOWLEDGEMENT,
  BROADCAST_ADDRESS_ACTION,
  BROADCAST_ADVANCED_ACTION,
  BROADCAST_REVIEW_WARNING,
  CONFIG_BAND_ID,
  DAYS_OF_MONTH,
  DAYS_OF_WEEK,
  DEFAULT_SCHEDULE_CONFIG,
  DESTINATION_ADVANCED,
  DESTINATION_BROADCAST,
  DESTINATION_DEFAULT,
  DESTINATION_HISTORY,
  EMPTY_ADVANCED_DESTINATION,
  EmptyFilterState,
  EmptyState,
  ErrorState,
  FilterNav,
  GENERIC_FAILURE_SUMMARY,
  GUIDED_BROADCAST_CONSTRAINT,
  GUIDED_CHAT_DRAFT,
  GUIDED_ENVELOPE_MARKER,
  GUIDED_TRANSITIONS,
  GUIDED_WORKFLOW_STAGE,
  GUIDED_WORKFLOW_STATE,
  GuidedProposalReview,
  GuidedRoutinePanel,
  INSPECTOR_PANEL_ID,
  INTERVAL_UNITS,
  INTERVAL_VALUES,
  LoadingState,
  NEW_ROUTINE_CONTROL_ID,
  NOW_WINDOW_MS,
  NativeSelect,
  NeedsAttentionNotice,
  NeedsConfigurationFocusBar,
  NeedsConfigurationNotice,
  PLUGIN_ID,
  PLUGIN_NAME,
  PanelNav,
  REVIEW_PATCHABLE,
  ROUTE_ID,
  ROUTE_PATH,
  ROUTINES_VIEW_STATUS,
  ROUTINE_PROPOSAL_VERSION,
  ResultTone,
  RoutineCard,
  RoutineComposerPanel,
  RoutineInspectorPanel,
  RoutineList,
  RoutinesPage,
  RunWhen,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
  StaleBanner,
  TIME_SLOTS,
  TRIGGER_OPTIONS,
  UnavailableState,
  activateConfigured,
  activeRouteKey,
  addJob,
  advancedDestinationDelivery,
  applyValidatedProposal,
  assertRoutingOptions,
  assertTimeoutMs,
  attentionCount,
  attentionOf,
  attentionTargets,
  backendTargetProfile,
  baseDestinationOptions,
  botChatDestinations,
  broadcastDestinationOption,
  buildAddParams,
  buildCronExpression,
  buildGuidedEnvelope,
  buildListParams,
  buildPauseParams,
  buildProposalReview,
  buildRemoveParams,
  buildReopenHandle,
  buildResumeParams,
  canGuidedTransition,
  coerceRoutes,
  collapsedSubtitleOf,
  composerDestinationDelivery,
  confirmProposal,
  createProvisionalRoutine,
  cronOutcomeOf,
  plugin_default as default,
  deriveFailureReason,
  describeDestination,
  describeSchedule2 as describeSchedule,
  describeScheduleConfig,
  destinationDelivery,
  destinationOptions,
  diagOfConfirmResult,
  diagOfLaunchResult,
  diagOfProvisionalResult,
  dismissFocusId,
  escapeLeavesPanel,
  explainFailureOf,
  filterCounts,
  findAppliedDuplicate,
  findDestinationOption,
  findRouteByKey,
  fingerprintJob,
  fingerprintSnapshot,
  focusById,
  formatDate,
  generateTimeSlots,
  guidedConfigCandidateOf,
  guidedIndicator,
  guidedRouteDrift,
  guidedWorkflowReducer,
  humanScheduleOf,
  initialGuidedWorkflow,
  initialRoutinesState,
  isBroadcastDelivery,
  isFailedStatus,
  isProposalStale,
  isRetriableGatewayError,
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
  needsAttention,
  nextRunCopyOf,
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
  relaunchGuidedConfiguration,
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
  routineRowFocusId,
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
