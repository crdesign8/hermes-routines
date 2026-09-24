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
  "  border-left: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.08));",
  "  background: var(--ui-bg-elevated, #161618);",
  "}",
  ".hr-inspector-header {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: 10px;",
  "  padding: 14px 18px;",
  "  border-bottom: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.06));",
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
  "  width: 44px;",
  "  height: 24px;",
  "  border-radius: 12px;",
  "  border: none;",
  "  background: #21262d;",
  "  cursor: pointer;",
  "  position: relative;",
  "  padding: 2px;",
  "  display: inline-flex;",
  "  align-items: center;",
  "  transition: background 0.2s ease;",
  "  flex-shrink: 0;",
  "}",
  ".hr-switch-active {",
  "  background: #f0f6fc;",
  "}",
  ".hr-switch-thumb {",
  "  width: 20px;",
  "  height: 20px;",
  "  border-radius: 50%;",
  "  background: #8b949e;",
  "  display: block;",
  "  transition: transform 0.2s ease, background 0.2s ease;",
  "  transform: translateX(0);",
  "}",
  ".hr-switch-active .hr-switch-thumb {",
  "  background: #0d1117;",
  "  transform: translateX(20px);",
  "}",
  "/* Field labels */",
  ".hr-field-label, .hr-select-label {",
  "  display: block;",
  "  font-size: 12px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-secondary, #a1a1aa);",
  "  margin-bottom: 6px;",
  "  line-height: 1.2;",
  "}",
  ".hr-create-field {",
  "  margin-bottom: 14px;",
  "}",
  ".hr-create-input, .hr-create-textarea {",
  "  width: 100%;",
  "  background: var(--ui-bg-card, rgba(255, 255, 255, 0.04));",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.12));",
  "  border-radius: 8px;",
  "  padding: 10px 14px;",
  "  font-size: 14px;",
  "  color: var(--ui-text-primary, #fff);",
  "  font-family: inherit;",
  "  outline: none;",
  "  transition: border-color 0.15s ease;",
  "}",
  ".hr-create-input:focus, .hr-create-textarea:focus {",
  "  border-color: var(--dt-composer-ring, var(--ui-accent, #58a6ff));",
  "}",
  ".hr-create-input::placeholder, .hr-create-textarea::placeholder {",
  "  color: var(--ui-text-tertiary, #6e7681);",
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
  "  color: var(--ui-text-tertiary, #888);",
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
  "  background: var(--ui-bg-card, rgba(255, 255, 255, 0.04));",
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.14));",
  "  border-radius: 8px;",
  "  padding: 9px 12px;",
  "  display: flex;",
  "  justify-content: space-between;",
  "  align-items: center;",
  "  cursor: pointer;",
  "  user-select: none;",
  "  transition: border-color 0.15s ease;",
  "  outline: none;",
  "  min-height: 38px;",
  "}",
  ".hr-select-trigger:hover, .hr-select-is-open .hr-select-trigger {",
  "  border-color: var(--ui-stroke-secondary, rgba(255, 255, 255, 0.3));",
  "}",
  ".hr-select-is-open .hr-select-trigger {",
  "  border-color: #f0f6fc;",
  "}",
  ".hr-select-value {",
  "  font-size: 13px;",
  "  font-weight: 500;",
  "  color: var(--ui-text-primary, #fff);",
  "}",
  ".hr-select-arrow {",
  "  color: var(--ui-text-tertiary, #888);",
  "  display: flex;",
  "  align-items: center;",
  "  margin-left: 8px;",
  "}",
  ".hr-select-menu {",
  "  position: absolute;",
  "  top: calc(100% + 4px);",
  "  left: 0;",
  "  right: 0;",
  "  max-height: 220px;",
  "  overflow-y: auto;",
  "  background: #1c2128;",
  "  border: 1px solid rgba(255, 255, 255, 0.18);",
  "  border-radius: 8px;",
  "  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85);",
  "  z-index: 1000;",
  "  padding: 4px 0;",
  "}",
  ".hr-select-option {",
  "  padding: 8px 12px;",
  "  font-size: 13px;",
  "  color: #f0f6fc;",
  "  cursor: pointer;",
  "  transition: background 0.1s ease;",
  "}",
  ".hr-select-option:hover {",
  "  background: rgba(255, 255, 255, 0.1);",
  "}",
  ".hr-select-option-active {",
  "  background: rgba(255, 255, 255, 0.16);",
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
  "  color: var(--ui-text-tertiary, #888);",
  "  margin-top: 10px;",
  "  margin-bottom: 16px;",
  "}",
  ".hr-create-error {",
  "  background: rgba(248, 81, 73, 0.1);",
  "  border: 1px solid rgba(248, 81, 73, 0.4);",
  "  color: var(--ui-red, #f85149);",
  "  border-radius: 6px;",
  "  padding: 8px 12px;",
  "  font-size: 12px;",
  "  margin-bottom: 12px;",
  "}",
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
  "  border: 1px solid var(--ui-stroke-tertiary, rgba(255, 255, 255, 0.12));",
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
  "  color: #0d1117;",
  "  background: #f0f6fc;",
  "  border: 1px solid transparent;",
  "  cursor: pointer;",
  "  transition: all 0.15s ease;",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "}",
  ".hr-btn-create-submit:hover:not(:disabled) {",
  "  background: #ffffff;",
  "}",
  ".hr-btn-create-submit:disabled {",
  "  background: #21262d;",
  "  color: #6e7681;",
  "  border-color: transparent;",
  "  cursor: not-allowed;",
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
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
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
      /* @__PURE__ */ jsxs("span", { className: `hr-result hr-result-${result.kind}`, children: [
        result.kind === "success" ? /* @__PURE__ */ jsx2("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx2("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z" }) }) : result.kind === "error" ? /* @__PURE__ */ jsx2("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx2("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z" }) }) : null,
        result.text
      ] })
    ] })
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
  return /* @__PURE__ */ jsxs2("span", { className: `hr-status-indicator hr-status-${tone}`, title: label, "aria-label": label, children: [
    tone === "active" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-active", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("polyline", { points: "8 4.2 8 8 10.8 8" })
    ] }) : tone === "paused" ? /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg hr-status-svg-paused", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx3("circle", { cx: "8", cy: "8", r: "6.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "6.5", y1: "5.5", x2: "6.5", y2: "10.5" }),
      /* @__PURE__ */ jsx3("line", { x1: "9.5", y1: "5.5", x2: "9.5", y2: "10.5" })
    ] }) : /* @__PURE__ */ jsxs2("svg", { className: "hr-status-svg", viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
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
    const stillThere = jobs.some((job, index) => (jobIdOf(job) || `routine ${index + 1}`) === activeInspectorId);
    if (!stillThere && handleInspect) {
      handleInspect(null);
    }
  }, [jobs, activeInspectorId, handleInspect]);
  function handleToggleExpand(name) {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }
  function handleEdit(name) {
    if (handleInspect) {
      handleInspect(activeInspectorId === name ? null : name);
    }
  }
  return /* @__PURE__ */ jsx5("ul", { className: "hr-list", "aria-label": "Routines", children: jobs.map((job, index) => {
    const fallback = `routine ${index + 1}`;
    const name = jobIdOf(job) || fallback;
    const busy = pending.indexOf(name) !== -1;
    return /* @__PURE__ */ jsx5(
      RoutineCard,
      {
        job,
        fallback,
        expanded: expandedNames.has(name),
        inspected: activeInspectorId === name,
        busy,
        disabled: locked,
        onToggleExpand: () => handleToggleExpand(name),
        onEdit: () => handleEdit(name),
        onPause: () => onPause(name),
        onResume: () => onResume(name)
      },
      `${index}::${name}`
    );
  }) });
}

// src/views/RoutineInspectorPanel.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function RoutineInspectorPanel({
  job,
  fallback,
  activeRoute,
  activeProfile,
  busy,
  disabled,
  onClose,
  onPause,
  onResume
}) {
  const [copiedId, setCopiedId] = useState2(false);
  const [copiedCron, setCopiedCron] = useState2(false);
  const title = routineTitle(job, fallback);
  const id = jobIdOf(job) || fallback;
  const paused = jobPaused(job);
  const terminal = routineTerminal(job);
  const schedule = humanScheduleOf(job) || "\u2014";
  const rawCron = rawScheduleOf(job);
  const nextIso = nextRunIso(job);
  const lastIso = lastRunIso(job);
  const result = lastResultOf(job);
  const showRuns = routineActive(job);
  const payload = job.payload && typeof job.payload === "object" ? job.payload : null;
  function copyText(text, setCopied) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2e3);
      }).catch(() => {
      });
    }
  }
  return /* @__PURE__ */ jsxs4("aside", { className: "hr-inspector", "aria-label": `Details for ${title}`, children: [
    /* @__PURE__ */ jsxs4("header", { className: "hr-inspector-header", children: [
      /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          className: "hr-btn-action hr-btn-back",
          onClick: onClose,
          "aria-label": "Back to list",
          children: [
            /* @__PURE__ */ jsx6("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { flexShrink: 0 }, children: /* @__PURE__ */ jsx6("path", { fillRule: "evenodd", d: "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" }) }),
            /* @__PURE__ */ jsx6("span", { children: "Back to list" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-header-badges", children: [
        activeRoute?.mode ? /* @__PURE__ */ jsx6("span", { className: "hr-badge-subtle", children: activeRoute.mode === "remote" ? "VPS" : "Local" }) : null,
        /* @__PURE__ */ jsx6(RoutineStatus, { job })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-body", children: [
      /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-ident", children: [
        /* @__PURE__ */ jsx6("h3", { className: "hr-inspector-title", children: title }),
        /* @__PURE__ */ jsxs4("div", { className: "hr-inspector-id-row", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-inspector-id-label", children: "ID:" }),
          /* @__PURE__ */ jsx6("code", { className: "hr-inspector-id-code", children: id }),
          /* @__PURE__ */ jsx6(
            "button",
            {
              type: "button",
              className: "hr-btn-mini",
              onClick: () => copyText(id, setCopiedId),
              "aria-label": "Copy routine ID",
              children: copiedId ? "Copied" : "Copy"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("section", { className: "hr-inspector-section", children: [
        /* @__PURE__ */ jsx6("h4", { className: "hr-section-title", children: "Cadence & Timing" }),
        /* @__PURE__ */ jsxs4("div", { className: "hr-kv-grid", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Schedule" }),
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-value hr-kv-highlight", children: schedule }),
          showRuns && nextIso !== null && formatWhen(nextIso) !== null ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Next Run" }),
            /* @__PURE__ */ jsxs4("span", { className: "hr-kv-value hr-next", children: [
              formatWhen(nextIso),
              formatDate(nextIso) ? /* @__PURE__ */ jsxs4("span", { className: "hr-date", children: [
                " (",
                formatDate(nextIso),
                ")"
              ] }) : null
            ] })
          ] }) : null,
          showRuns && lastIso !== null && formatWhen(lastIso) !== null ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Last Run" }),
            /* @__PURE__ */ jsxs4("span", { className: "hr-kv-value", children: [
              formatWhen(lastIso),
              formatDate(lastIso) ? /* @__PURE__ */ jsxs4("span", { className: "hr-date", children: [
                " (",
                formatDate(lastIso),
                ")"
              ] }) : null
            ] })
          ] }) : null,
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Last Result" }),
          /* @__PURE__ */ jsxs4("span", { className: `hr-kv-value hr-result hr-result-${result.kind}`, children: [
            result.kind === "success" ? /* @__PURE__ */ jsx6("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx6("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.854-8.646a.5.5 0 0 0-.708-.708L7.5 9.293 5.854 7.646a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l4-4z" }) }) : result.kind === "error" ? /* @__PURE__ */ jsx6("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", style: { display: "inline-block", verticalAlign: -2, marginRight: 6 }, children: /* @__PURE__ */ jsx6("path", { fillRule: "evenodd", d: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm3.354-9.354a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646z" }) }) : null,
            result.text
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("section", { className: "hr-inspector-section", children: [
        /* @__PURE__ */ jsx6("h4", { className: "hr-section-title", children: "Route & Target" }),
        /* @__PURE__ */ jsxs4("div", { className: "hr-kv-grid", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Profile" }),
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-value", children: activeProfile || "\u2014" }),
          activeRoute ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Connection" }),
            /* @__PURE__ */ jsxs4("span", { className: "hr-kv-value hr-code-inline", children: [
              activeRoute.connectionId,
              " (",
              activeRoute.mode,
              ")"
            ] }),
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Target" }),
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-value hr-code-inline", children: activeRoute.targetProfile })
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("section", { className: "hr-inspector-section", children: [
        /* @__PURE__ */ jsx6("h4", { className: "hr-section-title", children: "Technical Details" }),
        rawCron ? /* @__PURE__ */ jsxs4("div", { className: "hr-tech-entry", children: [
          /* @__PURE__ */ jsxs4("div", { className: "hr-tech-entry-head", children: [
            /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Cron Expression" }),
            /* @__PURE__ */ jsx6(
              "button",
              {
                type: "button",
                className: "hr-btn-mini",
                onClick: () => copyText(rawCron, setCopiedCron),
                "aria-label": "Copy cron expression",
                children: copiedCron ? "Copied" : "Copy"
              }
            )
          ] }),
          /* @__PURE__ */ jsx6("code", { className: "hr-code-block", children: rawCron })
        ] }) : null,
        payload && Object.keys(payload).length > 0 ? /* @__PURE__ */ jsxs4("div", { className: "hr-tech-entry", children: [
          /* @__PURE__ */ jsx6("span", { className: "hr-kv-label", children: "Payload Parameters" }),
          /* @__PURE__ */ jsx6("pre", { className: "hr-code-block", children: JSON.stringify(payload, null, 2) })
        ] }) : null
      ] }),
      !terminal ? /* @__PURE__ */ jsxs4("section", { className: "hr-inspector-section hr-inspector-actions-section", children: [
        /* @__PURE__ */ jsx6("h4", { className: "hr-section-title", children: "Actions" }),
        /* @__PURE__ */ jsx6("div", { className: "hr-inspector-actions-bar", children: paused ? /* @__PURE__ */ jsxs4(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-resume",
            disabled: disabled || busy,
            onClick: onResume,
            "aria-label": `Resume ${title}`,
            children: [
              /* @__PURE__ */ jsx6("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", style: { marginRight: 6 }, children: /* @__PURE__ */ jsx6("path", { d: "M8 5v14l11-7z" }) }),
              busy ? "Resuming\u2026" : "Resume Routine"
            ]
          }
        ) : /* @__PURE__ */ jsxs4(
          "button",
          {
            type: "button",
            className: "hr-btn hr-btn-pause",
            disabled: disabled || busy,
            onClick: onPause,
            "aria-label": `Pause ${title}`,
            children: [
              /* @__PURE__ */ jsx6("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", style: { marginRight: 6 }, children: /* @__PURE__ */ jsx6("path", { d: "M6 4h4v16H6V4zm8 0h4v16h-4V4z" }) }),
              busy ? "Pausing\u2026" : "Pause Routine"
            ]
          }
        ) })
      ] }) : null
    ] })
  ] });
}

// src/views/RoutineComposerPanel.tsx
import { useMemo, useState as useState4 } from "react";

// src/domain/routineSchedule.ts
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
function parseTime(time) {
  const parts = time.split(":");
  const hour = Math.max(0, Math.min(23, parseInt(parts[0] || "0", 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(parts[1] || "0", 10) || 0));
  return { minute, hour };
}
function buildCronExpression(config) {
  const { minute, hour } = parseTime(config.time);
  switch (config.trigger) {
    case "every_hour":
      return "0 * * * *";
    case "every_day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "every_week": {
      const dow = DAY_OF_WEEK_TO_CRON[config.dayOfWeek] ?? 1;
      return `${minute} ${hour} * * ${dow}`;
    }
    case "every_month": {
      const dom = Math.max(1, Math.min(31, Math.floor(config.dayOfMonth)));
      return `${minute} ${hour} ${dom} * *`;
    }
    case "interval": {
      const val = Math.max(1, Math.floor(config.intervalValue));
      if (config.intervalUnit === "minutes") {
        return `*/${val} * * * *`;
      }
      if (config.intervalUnit === "hours") {
        return `0 */${val} * * *`;
      }
      return `0 0 */${val} * *`;
    }
    default:
      return `${minute} ${hour} * * *`;
  }
}
function describeScheduleConfig(config) {
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
      return `Every day at ${config.time}`;
  }
}

// src/views/SelectField.tsx
import { useEffect as useEffect2, useRef, useState as useState3 } from "react";
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function SelectField({
  label,
  value,
  options,
  onChange,
  className = ""
}) {
  const [isOpen, setIsOpen] = useState3(false);
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
  onSubmit
}) {
  const [name, setName] = useState4("");
  const [prompt, setPrompt] = useState4("");
  const [active, setActive] = useState4(true);
  const [scheduleConfig, setScheduleConfig] = useState4(DEFAULT_SCHEDULE_CONFIG);
  const [submitting, setSubmitting] = useState4(false);
  const [error, setError] = useState4(null);
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
    let jobId = trimmedName.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._:-]/g, "");
    if (!jobId) jobId = "routine";
    const payload = {};
    if (prompt.trim()) {
      payload.prompt = prompt.trim();
    }
    if (trimmedName !== jobId) {
      payload.title = trimmedName;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onSubmit(jobId, cronExpr, payload, active);
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
      /* @__PURE__ */ jsxs6("div", { className: "hr-create-active-card", children: [
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
      ] }),
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
            disabled: !name.trim() || submitting || disabled,
            onClick: handleSubmit,
            children: submitting ? "Creating\u2026" : "Create Routine"
          }
        )
      ] })
    ] })
  ] });
}

// src/views/panels.tsx
import { Fragment as Fragment3, jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
function StatusLine({ text, statusRef }) {
  return /* @__PURE__ */ jsx9("p", { ref: statusRef, tabIndex: -1, className: "hr-status", role: "status", "aria-live": "polite", children: text || "Routines ready." });
}

// src/views/RoutineStates.tsx
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function LoadingState({ text }) {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-state", role: "status", "aria-live": "polite", "aria-busy": "true", children: [
    /* @__PURE__ */ jsx10("span", { className: "hr-spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx10("p", { className: "hr-state-text", children: text })
  ] });
}
function EmptyState() {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx10("p", { className: "hr-state-title", children: "No routines yet" }),
    /* @__PURE__ */ jsx10("p", { className: "hr-state-text", children: "Scheduled jobs for this profile will appear here." })
  ] });
}
function EmptyFilterState() {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-state", children: [
    /* @__PURE__ */ jsx10("p", { className: "hr-state-title", children: "No routines match this filter" }),
    /* @__PURE__ */ jsx10("p", { className: "hr-state-text", children: "Try a different filter to see more routines." })
  ] });
}
function ErrorState({
  title,
  message,
  onRetry
}) {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx10("strong", { children: title }),
    /* @__PURE__ */ jsx10("p", { className: "hr-row-meta", children: message }),
    /* @__PURE__ */ jsx10("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function UnavailableState({
  profile,
  onRetry
}) {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx10("strong", { children: "Routines unavailable for this profile." }),
    /* @__PURE__ */ jsx10("p", { className: "hr-row-meta", children: profile ? `The Desktop profile \u201C${profile}\u201D has no routines route right now. Connect the profile, then retry.` : "The active Desktop profile has no routines route right now. Select a profile, then retry." }),
    /* @__PURE__ */ jsx10("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function StaleBanner({ onRetry }) {
  return /* @__PURE__ */ jsxs8("div", { className: "hr-stale", role: "status", children: [
    /* @__PURE__ */ jsx10("span", { children: "Showing last loaded jobs." }),
    /* @__PURE__ */ jsx10("button", { type: "button", className: "hr-btn hr-btn-small", onClick: onRetry, children: "Refresh" })
  ] });
}

// src/views/RoutinesPage.tsx
import { Fragment as Fragment4, jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
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
  const activeProfile = useValue(host2.state.profile);
  const activeConnectionId = useValue(host2.state.connectionId);
  const dispatch = useCallback((event) => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);
  const activeRoute = findRouteByKey(state.routes, state.activeKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;
  const [searchQuery, setSearchQuery] = useState5("");
  const [selectedJobName, setSelectedJobName] = useState5(null);
  const [isCreating, setIsCreating] = useState5(false);
  useEffect3(() => {
    if (selectedJobName === null) return;
    const stillThere = state.jobs.some(
      (job, index) => (jobIdOf(job) || `routine ${index + 1}`) === selectedJobName
    );
    if (!stillThere) setSelectedJobName(null);
  }, [state.jobs, selectedJobName]);
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
    if (!selectedJobName) return null;
    return state.jobs.find(
      (j, index) => (jobIdOf(j) || `routine ${index + 1}`) === selectedJobName
    ) ?? null;
  }, [state.jobs, selectedJobName]);
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
  async function handleCreateRoutine(name, schedule, payload, active) {
    if (!activeRoute) {
      dispatch({ type: "mutation-error", error: "the active profile route is no longer available" });
      return false;
    }
    const route = activeRoute;
    try {
      const addParams = buildAddParams(route, { job_id: name, schedule, payload });
      dispatch({ type: "mutate-start", name });
      await requestCronForRoute(route, "cron.manage", addParams);
      if (!active) {
        const pauseParams = buildPauseParams(route, name);
        await requestCronForRoute(route, "cron.manage", pauseParams);
      }
      dispatch({ type: "mutate-end", name });
      dispatch({ type: "notice", notice: "routine " + name + " created" });
      dispatch({ type: "retry-list" });
      setIsCreating(false);
      return true;
    } catch (err) {
      dispatch({ type: "mutate-end", name });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to create routine").message });
      return false;
    }
  }
  function renderList() {
    const totalCount = state.jobs.length;
    const shownCount = filteredJobs.length;
    const isReduced = shownCount < totalCount;
    const countText = isReduced ? `Showing ${shownCount} of ${totalCount} routines.` : `Showing all ${totalCount} routines.`;
    return /* @__PURE__ */ jsxs9(Fragment4, { children: [
      /* @__PURE__ */ jsxs9("div", { className: "hr-toolbar", children: [
        /* @__PURE__ */ jsxs9("div", { className: "hr-search-wrap", children: [
          /* @__PURE__ */ jsx11(
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
          searchQuery ? /* @__PURE__ */ jsx11(
            "button",
            {
              type: "button",
              className: "hr-search-clear",
              onClick: () => setSearchQuery(""),
              "aria-label": "Clear search",
              children: /* @__PURE__ */ jsx11("svg", { width: "10", height: "10", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsx11("path", { d: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" }) })
            }
          ) : null
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "hr-filters-col", children: [
          /* @__PURE__ */ jsx11(
            FilterNav,
            {
              filter: state.filter,
              disabled: locked,
              onSelect: (value) => dispatch({ type: "filter-changed", filter: value })
            }
          ),
          state.status === S.READY && totalCount > 0 ? /* @__PURE__ */ jsx11("span", { className: "hr-count-right", children: countText }) : null
        ] })
      ] }),
      filteredJobs.length === 0 ? state.jobs.length === 0 ? /* @__PURE__ */ jsx11(EmptyState, {}) : /* @__PURE__ */ jsx11(EmptyFilterState, {}) : /* @__PURE__ */ jsx11(
        RoutineList,
        {
          jobs: filteredJobs,
          pending: state.pending,
          locked,
          inspectedId: selectedJobName,
          onInspect: (name) => {
            setSelectedJobName(name);
            if (name) setIsCreating(false);
          },
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
    body.push(/* @__PURE__ */ jsx11(LoadingState, { text: "Loading routines." }, "routes-loading"));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      /* @__PURE__ */ jsx11(
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
      /* @__PURE__ */ jsx11(
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
        /* @__PURE__ */ jsx11(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-loading")
      );
      body.push(/* @__PURE__ */ jsx11("div", { children: renderList() }, "stale-list"));
    } else {
      body.push(/* @__PURE__ */ jsx11(LoadingState, { text: "Loading routines." }, "list-loading"));
    }
  } else if (state.status === S.LIST_ERROR) {
    if (state.jobs.length > 0) {
      body.push(
        /* @__PURE__ */ jsx11(StaleBanner, { onRetry: () => dispatch({ type: "retry-list" }) }, "stale-error")
      );
      body.push(/* @__PURE__ */ jsx11("div", { children: renderList() }, "stale-list-error"));
    }
    body.push(
      /* @__PURE__ */ jsx11(
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
    body.push(/* @__PURE__ */ jsx11("div", { children: renderList() }, "ready-list"));
  }
  const profileLabel = typeof activeProfile === "string" && activeProfile ? activeProfile : "\u2014";
  return /* @__PURE__ */ jsxs9("section", { id: "hermes-routines-root", className: "hr-root", "aria-labelledby": "hermes-routines-heading", children: [
    /* @__PURE__ */ jsx11("style", { children: ROUTINES_CSS }),
    /* @__PURE__ */ jsxs9("div", { className: "hr-workspace", children: [
      /* @__PURE__ */ jsxs9("div", { className: `hr-feed-column${!selectedJob && !isCreating ? " hr-feed-contained" : ""}`, children: [
        /* @__PURE__ */ jsxs9("header", { className: "hr-header", children: [
          /* @__PURE__ */ jsxs9("div", { className: "hr-header-top", children: [
            /* @__PURE__ */ jsx11("h2", { id: "hermes-routines-heading", ref: headingRef, tabIndex: -1, className: "hr-title", children: "Routines" }),
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: "hr-btn-new",
                onClick: () => {
                  setSelectedJobName(null);
                  setIsCreating(true);
                },
                "aria-label": "New routine",
                title: "New routine",
                children: /* @__PURE__ */ jsxs9(
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
                      /* @__PURE__ */ jsx11("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
                      /* @__PURE__ */ jsx11("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
                    ]
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxs9("span", { className: "hr-sr-only", children: [
              "Profile: ",
              profileLabel
            ] })
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "hr-sub", children: "Routines are scheduled jobs this profile runs to do recurring tasks." })
        ] }),
        body
      ] }),
      selectedJob ? /* @__PURE__ */ jsx11(
        RoutineInspectorPanel,
        {
          job: selectedJob,
          fallback: selectedJobName || "Routine",
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          busy: state.pending.indexOf(selectedJobName || "") !== -1,
          disabled: locked,
          onClose: () => setSelectedJobName(null),
          onPause: () => handlePause(jobIdOf(selectedJob) || selectedJobName || ""),
          onResume: () => handleResume(jobIdOf(selectedJob) || selectedJobName || "")
        }
      ) : isCreating ? /* @__PURE__ */ jsx11(
        RoutineComposerPanel,
        {
          activeRoute,
          activeProfile: state.activeProfile ?? (typeof activeProfile === "string" ? activeProfile : null),
          disabled: locked,
          onClose: () => setIsCreating(false),
          onSubmit: handleCreateRoutine
        }
      ) : null
    ] }),
    /* @__PURE__ */ jsx11(StatusLine, { text: liveText, statusRef })
  ] });
}

// src/plugin.tsx
import { jsx as jsx12 } from "react/jsx-runtime";
function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => /* @__PURE__ */ jsx12(RoutinesPage, {})
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
  DAYS_OF_MONTH,
  DAYS_OF_WEEK,
  DEFAULT_SCHEDULE_CONFIG,
  INTERVAL_UNITS,
  INTERVAL_VALUES,
  PLUGIN_ID,
  PLUGIN_NAME,
  ROUTE_ID,
  ROUTE_PATH,
  ROUTINES_VIEW_STATUS,
  RoutineComposerPanel,
  RoutinesPage,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
  SelectField,
  TIME_SLOTS,
  TRIGGER_OPTIONS,
  activeRouteKey,
  addJob,
  assertRoutingOptions,
  assertTimeoutMs,
  backendTargetProfile,
  buildAddParams,
  buildCronExpression,
  buildListParams,
  buildPauseParams,
  buildRemoveParams,
  buildResumeParams,
  coerceRoutes,
  collapsedSubtitleOf,
  plugin_default as default,
  describeSchedule,
  describeScheduleConfig,
  findRouteByKey,
  formatDate,
  formatWhen,
  generateTimeSlots,
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
  toOrdinal,
  visibleJobs,
  withPausedFlag,
  wrapHostError
};
