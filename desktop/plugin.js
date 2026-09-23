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
import { useCallback, useEffect, useRef, useState } from "react";

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
  LIST_LOADING: "list-loading",
  READY: "ready",
  LIST_ERROR: "list-error"
});
function initialRoutinesState() {
  return {
    status: ROUTINES_VIEW_STATUS.ROUTES_LOADING,
    routes: [],
    selectedKey: null,
    jobs: [],
    error: null,
    notice: null,
    pending: [],
    confirmName: null,
    filter: "all",
    snapshot: null
  };
}
function routinesViewReducer(state, event) {
  const S = ROUTINES_VIEW_STATUS;
  const base = state ?? initialRoutinesState();
  if (!event) return base;
  switch (event.type) {
    case "routes-loading":
      return { ...base, status: S.ROUTES_LOADING, error: null, notice: null };
    case "routes-loaded": {
      const usable = coerceRoutes(event.routes);
      if (usable.length === 0) {
        return {
          ...base,
          status: S.READY,
          routes: [],
          selectedKey: null,
          jobs: [],
          error: null,
          snapshot: null,
          pending: [],
          confirmName: null
        };
      }
      return {
        ...base,
        status: S.LIST_LOADING,
        routes: usable,
        selectedKey: routeKey(usable[0]),
        jobs: [],
        error: null,
        notice: null,
        confirmName: null,
        snapshot: null,
        pending: []
      };
    }
    case "routes-error":
      return {
        ...base,
        status: S.ROUTES_ERROR,
        error: messageOf(event.error),
        routes: [],
        selectedKey: null,
        jobs: []
      };
    case "retry-routes":
      return { ...base, status: S.ROUTES_LOADING, error: null, notice: null };
    case "route-changed":
      return {
        ...base,
        status: S.LIST_LOADING,
        selectedKey: event.key,
        jobs: [],
        error: null,
        notice: null,
        confirmName: null,
        snapshot: null
      };
    case "list-loading":
      return { ...base, status: S.LIST_LOADING, error: null };
    case "list-loaded":
      return {
        ...base,
        status: S.READY,
        jobs: normalizeJobs(event.jobs),
        error: null,
        snapshot: null,
        pending: [],
        confirmName: null
      };
    case "list-error":
      return { ...base, status: S.LIST_ERROR, error: messageOf(event.error) };
    case "retry-list":
      return { ...base, status: S.LIST_LOADING, error: null, notice: null, confirmName: null };
    case "filter-changed":
      return {
        ...base,
        filter: event.filter === "active" || event.filter === "paused" ? event.filter : "all"
      };
    case "confirm-open":
      return { ...base, confirmName: typeof event.name === "string" ? event.name : null };
    case "confirm-close":
      return { ...base, confirmName: null };
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
  ".hr-root{box-sizing:border-box;max-width:880px;margin:0 auto;padding:24px;font-family:inherit;color:#161616;background:#ffffff;}",
  ".hr-title{font-size:22px;line-height:1.3;margin:0 0 8px;color:#161616;}",
  ".hr-sub{margin:0 0 8px;color:#595959;font-size:14px;line-height:1.5;}",
  ".hr-label{display:block;font-weight:600;margin:16px 0 6px;color:#161616;}",
  ".hr-select,.hr-input{display:block;width:100%;max-width:420px;padding:8px 10px;font-size:14px;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;}",
  ".hr-fieldset{margin:20px 0 0;border:1px solid #d9d9d9;border-radius:8px;padding:16px;}",
  ".hr-fieldset legend{font-weight:600;padding:0 6px;color:#161616;}",
  ".hr-btn{display:inline-block;padding:8px 14px;font-size:14px;font-weight:600;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;cursor:pointer;}",
  ".hr-btn:disabled{opacity:0.55;cursor:not-allowed;}",
  ".hr-btn-primary{background:#0b5fff;border-color:#0b5fff;color:#ffffff;}",
  ".hr-btn-danger{background:#b42318;border-color:#b42318;color:#ffffff;}",
  ".hr-btn-current{outline:2px solid #0b5fff;outline-offset:2px;}",
  ".hr-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;}",
  ".hr-list{list-style:none;margin:12px 0;padding:0;}",
  ".hr-row-item{border:1px solid #d9d9d9;border-radius:8px;padding:12px;margin-bottom:8px;}",
  ".hr-row-id{font-weight:600;color:#161616;overflow-wrap:anywhere;}",
  ".hr-row-meta{color:#595959;font-size:13px;line-height:1.5;}",
  ".hr-row-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}",
  ".hr-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;}",
  ".hr-badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:8px;}",
  ".hr-badge-active{background:#166534;color:#ffffff;}",
  ".hr-badge-paused{background:#f2f2f2;color:#1f1f1f;border:1px solid #6e6e6e;}",
  ".hr-error{border:1px solid #b42318;border-left-width:6px;border-radius:8px;padding:12px;background:#ffffff;color:#161616;margin:12px 0;}",
  ".hr-error strong{color:#b42318;}",
  ".hr-empty{border:1px dashed #6e6e6e;border-radius:8px;padding:16px;color:#595959;margin:12px 0;}",
  ".hr-muted{color:#595959;font-size:14px;line-height:1.5;}",
  ".hr-status{margin-top:16px;color:#595959;font-size:13px;}",
  ".hr-root :focus-visible{outline:3px solid #0b5fff;outline-offset:2px;}",
  "@media (max-width:560px){.hr-row-actions{flex-direction:column;align-items:stretch;}}"
].join("\n");

// src/views/RoutePicker.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function RoutePicker({ routes, selectedKey, onSelect }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("label", { htmlFor: "hermes-routines-profile", className: "hr-label", children: "Profile connection" }),
    /* @__PURE__ */ jsx(
      "select",
      {
        id: "hermes-routines-profile",
        className: "hr-select",
        value: selectedKey ?? "",
        onChange: (event) => {
          const next = event.target.value;
          if (next) onSelect(next);
        },
        children: routes.map((route) => {
          try {
            const key = routeKey(route);
            return /* @__PURE__ */ jsx("option", { value: key, children: key }, key);
          } catch {
            return null;
          }
        })
      }
    )
  ] });
}

// src/views/FilterNav.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" }
];
function FilterNav({ filter, disabled, onSelect }) {
  return /* @__PURE__ */ jsx2("nav", { className: "hr-filters", "aria-label": "Filter routines by status", children: FILTER_OPTIONS.map((entry) => /* @__PURE__ */ jsx2(
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

// src/views/RoutineRow.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function RoutineRow(props) {
  const { job, name, paused, busy, confirming, disabled } = props;
  return /* @__PURE__ */ jsxs2("li", { className: "hr-row-item", children: [
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("strong", { className: "hr-row-id", children: name }),
        /* @__PURE__ */ jsx3("span", { className: paused ? "hr-badge hr-badge-paused" : "hr-badge hr-badge-active", children: paused ? "Paused" : "Active" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "hr-row-meta", children: "Schedule: " + String(job.schedule || "not set") + (busy ? " \u2014 Working\u2026" : "") })
    ] }),
    confirming ? /* @__PURE__ */ jsxs2("div", { className: "hr-confirm", role: "group", "aria-label": `Confirm removal of ${name}`, children: [
      /* @__PURE__ */ jsx3("span", { className: "hr-row-meta", children: `Remove ${name}?` }),
      /* @__PURE__ */ jsx3(
        "button",
        {
          ref: props.confirmRef,
          type: "button",
          className: "hr-btn hr-btn-danger",
          disabled,
          onClick: props.onConfirmRemove,
          children: "Confirm remove"
        }
      ),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "hr-btn", disabled, onClick: props.onCancel, children: "Cancel" })
    ] }) : /* @__PURE__ */ jsxs2("div", { className: "hr-row-actions", children: [
      paused ? /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: "hr-btn",
          disabled,
          onClick: props.onResume,
          "aria-label": `Resume ${name}`,
          children: busy ? "Resuming\u2026" : "Resume"
        }
      ) : /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: "hr-btn",
          disabled,
          onClick: props.onPause,
          "aria-label": `Pause ${name}`,
          children: busy ? "Pausing\u2026" : "Pause"
        }
      ),
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: "hr-btn hr-btn-danger",
          disabled,
          onClick: props.onRemoveOpen,
          "aria-label": `Remove ${name}`,
          children: busy ? "Removing\u2026" : "Remove"
        }
      )
    ] })
  ] });
}

// src/views/CreateRoutineForm.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function CreateRoutineForm(props) {
  return /* @__PURE__ */ jsx4("form", { className: "hr-form", onSubmit: props.onSubmit, children: /* @__PURE__ */ jsxs3("fieldset", { className: "hr-fieldset", children: [
    /* @__PURE__ */ jsx4("legend", { children: "Create routine" }),
    /* @__PURE__ */ jsx4("label", { htmlFor: "hermes-routines-job", className: "hr-label", children: "Routine id" }),
    /* @__PURE__ */ jsx4(
      "input",
      {
        id: "hermes-routines-job",
        className: "hr-input",
        name: "job_id",
        autoComplete: "off",
        maxLength: 128,
        value: props.draftId,
        disabled: props.locked,
        onChange: (event) => props.onDraftIdChange(event.target.value),
        placeholder: "e.g. morning-brief"
      }
    ),
    /* @__PURE__ */ jsx4("label", { htmlFor: "hermes-routines-schedule", className: "hr-label", children: "Schedule" }),
    /* @__PURE__ */ jsx4(
      "input",
      {
        id: "hermes-routines-schedule",
        className: "hr-input",
        name: "schedule",
        autoComplete: "off",
        maxLength: 256,
        value: props.draftSchedule,
        disabled: props.locked,
        onChange: (event) => props.onDraftScheduleChange(event.target.value),
        placeholder: "e.g. 0 9 * * MON"
      }
    ),
    /* @__PURE__ */ jsx4("p", { className: "hr-row-meta", children: "Validated locally, then saved with cron.manage on the selected profile." }),
    /* @__PURE__ */ jsx4(
      "button",
      {
        type: "submit",
        className: "hr-btn hr-btn-primary",
        disabled: props.locked || !props.canSubmit,
        children: props.locked ? "Saving\u2026" : "Create routine"
      }
    )
  ] }) });
}

// src/views/panels.tsx
import { Fragment, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function ErrorPanel({ title, message, onRetry }) {
  return /* @__PURE__ */ jsxs4("div", { className: "hr-error", role: "alert", children: [
    /* @__PURE__ */ jsx5("strong", { children: title }),
    /* @__PURE__ */ jsx5("p", { className: "hr-row-meta", children: message }),
    /* @__PURE__ */ jsx5("button", { type: "button", className: "hr-btn", onClick: onRetry, children: "Retry" })
  ] });
}
function EmptyPanel({ message, actionLabel, onAction }) {
  return /* @__PURE__ */ jsx5("div", { className: "hr-empty", children: actionLabel && onAction ? /* @__PURE__ */ jsxs4(Fragment, { children: [
    /* @__PURE__ */ jsx5("p", { children: message }),
    /* @__PURE__ */ jsx5("button", { type: "button", className: "hr-btn", onClick: onAction, children: actionLabel })
  ] }) : message });
}
function StatusLine({ text, statusRef }) {
  return /* @__PURE__ */ jsx5("p", { ref: statusRef, tabIndex: -1, className: "hr-status", role: "status", "aria-live": "polite", children: text || "Routines ready." });
}

// src/views/RoutinesPage.tsx
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function pastTense(kind) {
  if (kind === "pause") return "paused";
  if (kind === "resume") return "resumed";
  if (kind === "remove") return "removed";
  return "saved";
}
function RoutinesPage() {
  const [state, setState] = useState(initialRoutinesState);
  const [draftId, setDraftId] = useState("");
  const [draftSchedule, setDraftSchedule] = useState("");
  const [routesNonce, setRoutesNonce] = useState(0);
  const headingRef = useRef(null);
  const statusRef = useRef(null);
  const confirmRef = useRef(null);
  const dispatch = useCallback((event) => {
    setState((prev) => routinesViewReducer(prev, event));
  }, []);
  const selectedRoute = findRouteByKey(state.routes, state.selectedKey);
  const locked = state.pending.length !== 0;
  const shown = visibleJobs(state.jobs, state.filter);
  const S = ROUTINES_VIEW_STATUS;
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "routes-loading" });
    void (async () => {
      try {
        const routes = await listProfileRoutes();
        if (!cancelled) dispatch({ type: "routes-loaded", routes });
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
  useEffect(() => {
    if (state.status !== S.LIST_LOADING) return void 0;
    let cancelled = false;
    void (async () => {
      const route = findRouteByKey(state.routes, state.selectedKey);
      if (!route) {
        if (!cancelled) dispatch({ type: "list-error", error: "selected profile route is no longer available" });
        return;
      }
      try {
        const payload = await listRoutines(route);
        if (!cancelled) dispatch({ type: "list-loaded", jobs: payload });
      } catch (err) {
        if (!cancelled) dispatch({ type: "list-error", error: wrapHostError(err, "failed to load routines").message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, state.routes, state.selectedKey, dispatch]);
  useEffect(() => {
    if (state.confirmName) confirmRef.current?.focus();
  }, [state.confirmName]);
  useEffect(() => {
    if (state.status === S.ROUTES_ERROR || state.status === S.LIST_ERROR) statusRef.current?.focus();
  }, [state.status]);
  function focusHeading() {
    headingRef.current?.focus();
  }
  function focusStatus() {
    statusRef.current?.focus();
  }
  function handleRetryRoutes() {
    dispatch({ type: "retry-routes" });
    setRoutesNonce((nonce) => nonce + 1);
  }
  async function runMutation(kind, name, build) {
    if (!selectedRoute) {
      dispatch({ type: "mutation-error", error: "select a profile route first" });
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
      await requestCronForRoute(selectedRoute, "cron.manage", params);
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
  async function handleCreate(event) {
    event.preventDefault();
    if (locked) return;
    if (!selectedRoute) {
      dispatch({ type: "mutation-error", error: "select a profile route first" });
      return;
    }
    let params;
    try {
      params = buildAddParams(selectedRoute, { job_id: draftId, schedule: draftSchedule });
    } catch (err) {
      dispatch({ type: "mutation-error", error: wrapHostError(err, "invalid routine").message });
      return;
    }
    const name = typeof params.name === "string" ? params.name : "";
    dispatch({ type: "mutate-start", name });
    try {
      await requestCronForRoute(selectedRoute, "cron.manage", params);
      dispatch({ type: "mutate-end", name });
      dispatch({ type: "notice", notice: "routine " + name + " created" });
      setDraftId("");
      setDraftSchedule("");
      dispatch({ type: "retry-list" });
    } catch (err) {
      dispatch({ type: "mutate-end", name });
      dispatch({ type: "mutation-error", error: wrapHostError(err, "failed to create routine").message });
    }
  }
  function handlePause(name) {
    if (locked || !name) return void 0;
    return runMutation("pause", name, () => buildPauseParams(selectedRoute, name));
  }
  function handleResume(name) {
    if (locked || !name) return void 0;
    return runMutation("resume", name, () => buildResumeParams(selectedRoute, name));
  }
  async function handleRemoveConfirm(name) {
    dispatch({ type: "confirm-close" });
    if (locked || !name) return;
    const ok = await runMutation("remove", name, () => buildRemoveParams(selectedRoute, name));
    if (ok) focusHeading();
    else focusStatus();
  }
  function renderList() {
    return /* @__PURE__ */ jsxs5(Fragment2, { children: [
      /* @__PURE__ */ jsx6(
        FilterNav,
        {
          filter: state.filter,
          disabled: locked,
          onSelect: (value) => dispatch({ type: "filter-changed", filter: value })
        }
      ),
      shown.length === 0 ? /* @__PURE__ */ jsx6(
        EmptyPanel,
        {
          message: state.jobs.length === 0 ? "No routines yet. Create the first one below." : "No routines match this filter."
        }
      ) : /* @__PURE__ */ jsx6("ul", { className: "hr-list", "aria-label": "Routines", children: shown.map((job, index) => {
        const name = jobIdOf(job) || `routine ${index + 1}`;
        const paused = jobPaused(job);
        const busy = state.pending.indexOf(name) !== -1;
        return /* @__PURE__ */ jsx6(
          RoutineRow,
          {
            job,
            name,
            paused,
            busy,
            confirming: state.confirmName === name,
            disabled: locked,
            confirmRef,
            onPause: () => handlePause(name),
            onResume: () => handleResume(name),
            onRemoveOpen: () => dispatch({ type: "confirm-open", name }),
            onConfirmRemove: () => void handleRemoveConfirm(name),
            onCancel: () => dispatch({ type: "confirm-close" })
          },
          `${index}::${name}`
        );
      }) }),
      /* @__PURE__ */ jsx6(
        CreateRoutineForm,
        {
          draftId,
          draftSchedule,
          locked,
          canSubmit: selectedRoute !== null,
          onDraftIdChange: setDraftId,
          onDraftScheduleChange: setDraftSchedule,
          onSubmit: handleCreate
        }
      )
    ] });
  }
  let liveText = "";
  if (state.error) liveText = state.error;
  else if (state.notice) liveText = state.notice;
  else if (state.status === S.ROUTES_LOADING) liveText = "Loading profile routes.";
  else if (state.status === S.LIST_LOADING) liveText = "Loading routines.";
  else if (state.status === S.READY) {
    if (state.routes.length === 0) liveText = "No profile routes available.";
    else if (state.jobs.length === 0) liveText = "No routines yet. Create the first one below.";
    else liveText = `Showing ${shown.length} of ${state.jobs.length} routines.`;
  }
  const body = [];
  if (state.status === S.ROUTES_LOADING) {
    body.push(/* @__PURE__ */ jsx6("p", { className: "hr-muted", children: "Loading profile routes." }, "routes-loading"));
  } else if (state.status === S.ROUTES_ERROR) {
    body.push(
      /* @__PURE__ */ jsx6(
        ErrorPanel,
        {
          title: "Could not list profile routes.",
          message: state.error || "Unknown error.",
          onRetry: handleRetryRoutes
        },
        "routes-error"
      )
    );
  } else if (state.routes.length === 0) {
    body.push(
      /* @__PURE__ */ jsx6(
        EmptyPanel,
        {
          message: "No profile routes available. Connect a profile, then reload.",
          actionLabel: "Reload routes",
          onAction: handleRetryRoutes
        },
        "routes-empty"
      )
    );
  } else {
    body.push(
      /* @__PURE__ */ jsx6(
        RoutePicker,
        {
          routes: state.routes,
          selectedKey: state.selectedKey,
          onSelect: (key) => dispatch({ type: "route-changed", key })
        },
        "route-picker"
      )
    );
  }
  if (selectedRoute) {
    if (state.status === S.LIST_LOADING) {
      body.push(/* @__PURE__ */ jsx6("p", { className: "hr-muted", children: "Loading routines." }, "list-loading"));
    } else if (state.status === S.LIST_ERROR) {
      body.push(
        /* @__PURE__ */ jsx6(
          ErrorPanel,
          {
            title: "Could not load routines.",
            message: state.error || "Unknown error.",
            onRetry: () => dispatch({ type: "retry-list" })
          },
          "list-error"
        )
      );
    } else if (state.status === S.READY) {
      body.push(renderList());
    }
  }
  return /* @__PURE__ */ jsxs5("section", { id: "hermes-routines-root", className: "hr-root", "aria-labelledby": "hermes-routines-heading", children: [
    /* @__PURE__ */ jsx6("style", { children: ROUTINES_CSS }),
    /* @__PURE__ */ jsx6("h2", { id: "hermes-routines-heading", ref: headingRef, tabIndex: -1, className: "hr-title", children: "Routines" }),
    /* @__PURE__ */ jsx6("p", { className: "hr-sub", children: "Per-profile routines. Reads and writes ride cron.manage through the selected profile route." }),
    body,
    /* @__PURE__ */ jsx6(StatusLine, { text: liveText, statusRef })
  ] });
}

// src/plugin.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function register(ctx) {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => /* @__PURE__ */ jsx7(RoutinesPage, {})
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
  plugin_default as default,
  findRouteByKey,
  initialRoutinesState,
  isSafeOptimistic,
  jobIdOf,
  jobPaused,
  listJobs,
  listProfileRoutes,
  listRoutines,
  messageOf,
  normalizeJobs,
  pauseJob,
  plugin,
  profileRoute,
  register,
  removeJob,
  requestCronForRoute,
  resolveProfileRoute,
  resumeJob,
  routeKey,
  routinesViewReducer,
  scopedCronParams,
  visibleJobs,
  withPausedFlag,
  wrapHostError
};
