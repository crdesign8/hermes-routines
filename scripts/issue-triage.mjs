// @ts-check
// Deterministic issue triage for hermes-routines (Closes #16).
//
// The policy (.github/label-policy.yml) is the source of truth. Labels are a
// projection: this script only ADDS desired managed labels and REMOVES managed
// labels that are no longer true. It never replaces an issue's complete label
// set, never touches unmanaged labels (GitHub defaults), never removes
// human-owned labels (`manual_labels`: priority:*, status:blocked), never
// edits code, never merges, never runs issue content as code.
//
// Classification inputs: title/body are UNTRUSTED. Label names never
// interpolate user text; only names declared in `managed_labels` may be
// projected (fail-closed `LabelizerError` otherwise).
//
// Entry events (see docs/LABELIZER.md and .github/workflows/issue-triage.yml):
// issues opened/edited/reopened (webhook reaction) + workflow_dispatch
// (manual reprocessing). Idempotency: compute-and-diff makes re-runs a no-op;
// the decision key is `repo:issue:number:content_sha:policy_vN`.
//
// Modes:
//   node scripts/issue-triage.mjs --validate [--root <dir>]
//     Offline. Parses + validates the policy and cross-checks that every
//     label referenced by .github/ISSUE_TEMPLATE/*.yml is managed.
//     Used by `npm run check:label-policy`. Needs no token.
//   node scripts/issue-triage.mjs --repo <owner/name> --issue <n> [--apply]
//     Live. GETs the issue, computes the desired set, prints the decision.
//     Without --apply it is a dry run. With --apply it adds/removes labels
//     via the issues-labels API only. Needs GITHUB_TOKEN (or GH_TOKEN).
//   node scripts/issue-triage.mjs --repo <owner/name> --all-open [--apply]
//     Live. Reprocesses every open issue (cap 30), for workflow_dispatch
//     without an issue number.
//
// Only node: builtins; no dependencies. Single file on purpose: scripts/ has
// no relative imports per the allowlist gate (scripts/check-allowlist.mjs).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class LabelizerError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'LabelizerError';
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

// ---------------------------------------------------------------------------
// Minimal strict YAML subset parser.
//
// Supports exactly what .github/label-policy.yml emits: mappings, `- `
// sequences, scalars (plain, single/double-quoted, integer), 2-space indent.
// Anything else (tabs, anchors, flow maps, multiline scalars) fails closed.
// ---------------------------------------------------------------------------

/**
 * @param {string} scalar
 * @returns {string | number}
 */
function parseScalar(scalar) {
  const s = scalar.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

/**
 * @param {string} text e.g. `[a, "b: c"]`
 * @param {number} line
 * @returns {(string | number)[]}
 */
function parseInlineList(text, line) {
  const inner = text.slice(1, -1).trim();
  if (inner === '') return [];
  /** @type {string[]} */
  const parts = [];
  let cur = '';
  /** @type {string | null} */
  let quote = null;
  for (const ch of inner) {
    if (quote !== null) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (quote !== null) throw new LabelizerError(`policy yaml line ${line}: unterminated quote in list`);
  parts.push(cur.trim());
  return parts.filter((p) => p !== '').map(parseScalar);
}

/**
 * @param {string} text
 * @returns {any}
 */
export function parsePolicyYaml(text) {
  const lines = text.split('\n');
  /** @type {{ indent: number, container: any }[]} */
  const stack = [{ indent: -1, container: {} }];

  for (let i = 0; i < lines.length; i++) {
    const raw = /** @type {string} */ (lines[i]);
    if (raw.includes('\t')) throw new LabelizerError(`policy yaml line ${i + 1}: tabs are forbidden`);
    if (/^\s*(#|$)/.test(raw)) continue;
    const indent = raw.length - raw.trimStart().length;
    if (indent % 2 !== 0) throw new LabelizerError(`policy yaml line ${i + 1}: indent must be a multiple of 2`);
    const content = raw.trim();

    while (stack.length > 1) {
      const top = /** @type {{ indent: number, container: any }} */ (stack[stack.length - 1]);
      if (indent <= top.indent) stack.pop();
      else break;
    }
    const parent = /** @type {{ indent: number, container: any }} */ (stack[stack.length - 1]);
    if (parent === undefined || parent.container === undefined) {
      throw new LabelizerError(`policy yaml line ${i + 1}: lost parent frame`);
    }

    if (content.startsWith('- ')) {
      if (!Array.isArray(parent.container)) {
        throw new LabelizerError(`policy yaml line ${i + 1}: sequence entry outside a sequence`);
      }
      /** @type {any[]} */
      const seq = parent.container;
      const itemText = content.slice(2).trim();
      if (itemText === '') {
        /** @type {any} */
        const child = {};
        seq.push(child);
        stack.push({ indent, container: child });
      } else if (itemText.startsWith('[') && itemText.endsWith(']')) {
        seq.push(parseInlineList(itemText, i + 1));
      } else {
        const colon = itemText.indexOf(':');
        const looksLikeMap =
          colon > 0 && !itemText.startsWith('[') && !itemText.startsWith('{') && !itemText.startsWith('"') && !itemText.startsWith("'");
        if (looksLikeMap) {
          const k = itemText.slice(0, colon).trim();
          const rest = itemText.slice(colon + 1).trim();
          /** @type {any} */
          const child = {};
          seq.push(child);
          stack.push({ indent, container: child });
          if (rest === '') {
            // nested block follows on the next lines; frame already pushed
          } else if (rest.startsWith('[') && rest.endsWith(']')) {
            child[k] = parseInlineList(rest, i + 1);
          } else {
            child[k] = parseScalar(rest);
          }
        } else {
          seq.push(parseScalar(itemText));
        }
      }
      continue;
    }

    const m = content.match(/^([^:[\]{}]+):\s*(.*)$/);
    if (!m) throw new LabelizerError(`policy yaml line ${i + 1}: cannot parse: ${content.slice(0, 60)}`);
    const key = /** @type {string} */ (m[1]).trim();
    const rest = /** @type {string} */ (m[2]).trim();
    if (Array.isArray(parent.container)) {
      throw new LabelizerError(`policy yaml line ${i + 1}: mapping key inside a sequence`);
    }
    /** @type {any} */
    const obj = parent.container;
    if (rest === '') {
      // Look ahead: sequence or mapping?
      let nextContent = null;
      let nextIndent = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const r2 = /** @type {string} */ (lines[j]);
        if (/^\s*(#|$)/.test(r2)) continue;
        nextIndent = r2.length - r2.trimStart().length;
        nextContent = r2.trim();
        break;
      }
      if (nextContent === null || nextIndent <= indent) {
        obj[key] = {};
      } else if (nextContent.startsWith('- ')) {
        /** @type {any[]} */
        const arr = [];
        obj[key] = arr;
        stack.push({ indent, container: arr });
      } else {
        /** @type {any} */
        const child = {};
        obj[key] = child;
        stack.push({ indent, container: child });
      }
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      obj[key] = parseInlineList(rest, i + 1);
    } else {
      obj[key] = parseScalar(rest);
    }
  }

  const root = /** @type {{ indent: number, container: any }} */ (stack[0]);
  return root.container;
}

// ---------------------------------------------------------------------------
// Validation (fail-closed).
// ---------------------------------------------------------------------------

/**
 * @param {any} labels
 * @param {Set<string>} names
 * @param {string} location
 */
function checkLabelRefs(labels, names, location) {
  if (!Array.isArray(labels)) throw new LabelizerError(`${location} must be a list`);
  /** @type {string[]} */
  const unknown = labels.filter((l) => typeof l !== 'string' || !names.has(l));
  if (unknown.length > 0) throw new LabelizerError(`${location} contains unknown labels: ${unknown.join(', ')}`);
}

/**
 * @param {any} policy
 * @returns {{ managed: Set<string>, manual: Set<string> }}
 */
export function validatePolicy(policy) {
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    throw new LabelizerError('policy must be a mapping');
  }
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    throw new LabelizerError('policy must declare an integer version >= 1');
  }
  const managed = policy.managed_labels;
  if (!Array.isArray(managed) || managed.length === 0) {
    throw new LabelizerError('policy must declare managed_labels');
  }
  /** @type {Set<string>} */
  const names = new Set();
  for (const entry of managed) {
    if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string') {
      throw new LabelizerError('managed_labels must contain named mappings');
    }
    if (names.has(entry.name)) throw new LabelizerError(`managed_labels has duplicate: ${entry.name}`);
    names.add(entry.name);
    // YAML parses an unquoted pure-digit color (e.g. 116329) as a number;
    // normalize before checking so quoted and unquoted spellings agree.
    if (typeof entry.color === 'number') entry.color = String(entry.color);
    if (typeof entry.color !== 'string' || !/^[0-9a-fA-F]{6}$/.test(entry.color)) {
      throw new LabelizerError(`managed label ${entry.name} needs a 6-hex color`);
    }
    if (typeof entry.description !== 'string' || entry.description === '') {
      throw new LabelizerError(`managed label ${entry.name} needs a description`);
    }
  }

  const groups = policy.exclusive_groups ?? {};
  if (typeof groups !== 'object' || groups === null || Array.isArray(groups)) {
    throw new LabelizerError('exclusive_groups must be a mapping');
  }
  for (const [groupName, group] of Object.entries(groups)) {
    const precedence = /** @type {any} */ (group)?.precedence;
    if (!Array.isArray(precedence) || precedence.length === 0) {
      throw new LabelizerError(`exclusive group ${groupName} has no precedence`);
    }
    /** @type {string[]} */
    const unknown = precedence.filter((l) => typeof l !== 'string' || !names.has(l));
    if (unknown.length > 0) throw new LabelizerError(`exclusive group ${groupName} has unknown labels: ${unknown.join(', ')}`);
  }

  const issue = policy.issue ?? {};
  if (typeof issue !== 'object' || issue === null || Array.isArray(issue)) {
    throw new LabelizerError('policy section "issue" must be a mapping');
  }
  checkLabelRefs(issue.defaults ?? [], names, 'issue.defaults');
  for (const rule of issue.title_rules ?? []) {
    if (typeof rule !== 'object' || rule === null) throw new LabelizerError('issue.title_rules contains a non-mapping rule');
    if (!Array.isArray(rule.prefixes) || rule.prefixes.length === 0) {
      throw new LabelizerError('issue.title_rules rule has no prefixes');
    }
    checkLabelRefs(rule.labels ?? [], names, 'issue.title_rules');
  }
  for (const rule of issue.title_scope_rules ?? []) {
    if (typeof rule !== 'object' || rule === null) throw new LabelizerError('issue.title_scope_rules contains a non-mapping rule');
    if (typeof rule.contains !== 'string' || rule.contains === '') {
      throw new LabelizerError('issue.title_scope_rules rule has no contains');
    }
    checkLabelRefs(rule.labels ?? [], names, 'issue.title_scope_rules');
    /** @type {string[]} */
    const nonArea = (rule.labels ?? []).filter((/** @type {string} */ l) => !l.startsWith('area:'));
    if (nonArea.length > 0) {
      throw new LabelizerError(`issue.title_scope_rules may only project area:* (found ${nonArea.join(', ')})`);
    }
  }
  for (const rule of issue.body_rules ?? []) {
    if (typeof rule !== 'object' || rule === null) throw new LabelizerError('issue.body_rules contains a non-mapping rule');
    if (typeof rule.contains !== 'string' || rule.contains === '') {
      throw new LabelizerError('issue.body_rules rule has no contains');
    }
    if (rule.match !== undefined && rule.match !== 'word' && rule.match !== 'substring') {
      throw new LabelizerError(`issue.body_rules rule has unsupported match: ${String(rule.match)}`);
    }
    checkLabelRefs(rule.labels ?? [], names, 'issue.body_rules');
  }

  const manualList = policy.manual_labels ?? [];
  if (!Array.isArray(manualList)) throw new LabelizerError('manual_labels must be a list');
  /** @type {Set<string>} */ const manual = new Set();
  for (const l of manualList) {
    if (typeof l !== 'string' || !names.has(l)) throw new LabelizerError(`manual_labels contains unknown label: ${String(l)}`);
    if (manual.has(l)) throw new LabelizerError(`manual_labels has duplicate: ${l}`);
    manual.add(l);
  }
  return { managed: names, manual };
}

// ---------------------------------------------------------------------------
// Classification (mirrors the VPS pm-labelizer engine semantics).
// ---------------------------------------------------------------------------

/**
 * @param {string} title case-insensitive prefix match
 * @param {any[]} rules
 * @returns {Set<string>}
 */
function labelsForTitle(title, rules) {
  const lowered = (title ?? '').toLowerCase();
  /** @type {Set<string>} */
  const out = new Set();
  for (const rule of rules) {
    const prefixes = Array.isArray(rule?.prefixes) ? rule.prefixes : [];
    if (prefixes.some((/** @type {string} */ p) => lowered.startsWith(String(p).toLowerCase()))) {
      for (const l of Array.isArray(rule?.labels) ? rule.labels : []) out.add(String(l));
    }
  }
  return out;
}

/**
 * @param {string} title case-insensitive contains on the parenthesized scope
 * @param {any[]} rules
 * @returns {Set<string>}
 */
function labelsForScope(title, rules) {
  const lowered = (title ?? '').toLowerCase();
  /** @type {Set<string>} */
  const out = new Set();
  for (const rule of rules) {
    if (typeof rule?.contains !== 'string') continue;
    if (lowered.includes(rule.contains.toLowerCase())) {
      for (const l of Array.isArray(rule?.labels) ? rule.labels : []) out.add(String(l));
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} token
 * @param {number} at index of a candidate occurrence
 * @returns {boolean} the occurrence is delimited by non-word chars on both sides
 */
function onWordBoundaries(text, token, at) {
  const before = at > 0 ? (text[at - 1] ?? '') : '';
  const after = at + token.length < text.length ? (text[at + token.length] ?? '') : '';
  return !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after);
}

/**
 * @param {string} body case-sensitive, like the VPS engine (`in`)
 * @param {any[]} rules `match: word` opts a rule into word-boundary matching
 * @returns {Set<string>}
 */
function labelsForBody(body, rules) {
  const text = body ?? '';
  /** @type {Set<string>} */
  const out = new Set();
  for (const rule of rules) {
    if (typeof rule?.contains !== 'string') continue;
    const token = rule.contains;
    let hit = false;
    if (rule.match === 'word') {
      for (let at = text.indexOf(token); at !== -1 && !hit; at = text.indexOf(token, at + 1)) {
        hit = onWordBoundaries(text, token, at);
      }
    } else {
      hit = text.includes(token);
    }
    if (hit) {
      for (const l of Array.isArray(rule?.labels) ? rule.labels : []) out.add(String(l));
    }
  }
  return out;
}

/**
 * @param {Set<string>} labels
 * @param {any} policy
 * @returns {Set<string>}
 */
function reduceExclusive(labels, policy) {
  const reduced = new Set(labels);
  const groups = policy.exclusive_groups ?? {};
  for (const group of Object.values(groups)) {
    const precedence = /** @type {any} */ (group)?.precedence ?? [];
    if (!Array.isArray(precedence)) continue;
    const selected = precedence.find((/** @type {string} */ l) => reduced.has(l));
    if (selected !== undefined) {
      for (const l of precedence) reduced.delete(l);
      reduced.add(selected);
    }
  }
  return reduced;
}

/**
 * @param {{ title?: string, body?: string }} item
 * @param {any} policy validated
 * @returns {string[]} sorted desired labels
 */
export function classifyIssue(item, policy) {
  const section = policy.issue ?? {};
  /** @type {Set<string>} */
  const labels = new Set(Array.isArray(section.defaults) ? section.defaults.map(String) : []);
  for (const l of labelsForBody(item.body ?? '', Array.isArray(section.body_rules) ? section.body_rules : [])) labels.add(l);
  for (const l of labelsForTitle(item.title ?? '', Array.isArray(section.title_rules) ? section.title_rules : [])) labels.add(l);
  for (const l of labelsForScope(item.title ?? '', Array.isArray(section.title_scope_rules) ? section.title_scope_rules : [])) labels.add(l);
  /** @type {Set<string>} */
  const managed = new Set(
    (Array.isArray(policy.managed_labels) ? policy.managed_labels : []).map((/** @type {any} */ e) => String(e?.name)),
  );
  const reduced = reduceExclusive(labels, policy);
  /** @type {string[]} */
  const unknown = [...reduced].filter((l) => !managed.has(l));
  if (unknown.length > 0) throw new LabelizerError(`classifier produced undeclared labels: ${unknown.join(', ')}`);
  return [...reduced].sort();
}

/**
 * @param {string[]} current
 * @param {string[]} desired
 * @param {Set<string>} managed
 * @param {Set<string>} [manual] human-owned managed labels: never removed
 * @returns {{ additions: string[], removals: string[] }}
 */
export function computeDiff(current, desired, managed, manual = new Set()) {
  const cur = new Set(current);
  const want = new Set(desired);
  const additions = [...want].filter((l) => !cur.has(l)).sort();
  const removals = [...cur].filter((l) => managed.has(l) && !manual.has(l) && !want.has(l)).sort();
  return { additions, removals };
}

/**
 * @param {string} repo
 * @param {number} number
 * @param {{ title?: string, body?: string }} item
 * @param {any} policy
 * @returns {string}
 */
export function decisionKey(repo, number, item, policy) {
  const hash = createHash('sha256')
    .update(JSON.stringify({ body: item.body ?? '', title: item.title ?? '' }))
    .digest('hex');
  return `${repo}:issue:${number}:${hash.slice(0, 16)}:v${policy.version}`;
}

// ---------------------------------------------------------------------------
// GitHub API (labels endpoints only — no code, no merge).
// ---------------------------------------------------------------------------

const API = 'https://api.github.com';

/**
 * @param {string} token
 * @returns {Record<string, string>}
 */
function apiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'hermes-routines-issue-triage',
  };
}

/**
 * @param {string} token
 * @param {string} p path starting with /
 * @param {any} [body]
 * @param {string} [method]
 * @returns {Promise<any>}
 */
async function apiCall(token, p, body, method) {
  const res = await fetch(`${API}${p}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: apiHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LabelizerError(`GitHub API ${res.status} on ${p}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * @param {string} token
 * @param {string} repo
 * @param {number} number
 * @returns {Promise<{ number: number, title: string, body: string, current: string[] }>}
 */
async function fetchIssue(token, repo, number) {
  /** @type {any} */
  const data = await apiCall(token, `/repos/${repo}/issues/${number}`);
  if (data.pull_request) throw new LabelizerError(`#${number} is a pull request, not an issue — refusing`);
  /** @type {string[]} */
  const current = (data.labels ?? []).map((/** @type {any} */ l) => (typeof l === 'string' ? l : String(l?.name ?? '')));
  return { number: data.number, title: data.title ?? '', body: data.body ?? '', current };
}

/**
 * @param {string} token
 * @param {string} repo
 * @param {number} number
 * @param {string[]} additions
 * @param {string[]} removals
 */
async function applyDiff(token, repo, number, additions, removals) {
  if (additions.length > 0) {
    await apiCall(token, `/repos/${repo}/issues/${number}/labels`, { labels: additions });
  }
  for (const label of removals) {
    await apiCall(token, `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`, undefined, 'DELETE');
  }
}

/**
 * @param {string} token
 * @param {string} repo
 * @param {number} [cap]
 * @returns {Promise<number[]>}
 */
async function listOpenIssues(token, repo, cap = 30) {
  /** @type {number[]} */
  const out = [];
  let page = 1;
  while (out.length < cap) {
    /** @type {any} */
    const batch = await apiCall(token, `/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      if (item.pull_request) continue;
      out.push(Number(item.number));
      if (out.length >= cap) break;
    }
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function usage() {
  return [
    'usage:',
    '  node scripts/issue-triage.mjs --validate [--root <dir>]',
    '  node scripts/issue-triage.mjs --repo <owner/name> --issue <n> [--apply]',
    '  node scripts/issue-triage.mjs --repo <owner/name> --all-open [--apply]',
  ].join('\n');
}

/**
 * @param {string} root
 * @returns {any}
 */
function loadPolicyFile(root) {
  const p = path.join(root, '.github', 'label-policy.yml');
  /** @type {string} */
  let text;
  try {
    text = readFileSync(p, 'utf8');
  } catch {
    throw new LabelizerError(`policy file missing: ${path.relative(root, p)}`);
  }
  return parsePolicyYaml(text);
}

/**
 * Extract `labels: [...]` from an issue template form file (subset parse).
 * @param {string} text
 * @returns {string[]}
 */
function templateLabels(text) {
  const m = text.match(/^labels:\s*(\[.*\])\s*$/m);
  if (!m) return [];
  return parseInlineList(/** @type {string} */ (m[1]), 0).map(String);
}

/**
 * @param {string} root
 * @param {Set<string>} managed
 * @returns {string[]}
 */
function crossCheckTemplates(root, managed) {
  const dir = path.join(root, '.github', 'ISSUE_TEMPLATE');
  /** @type {string[]} */
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  } catch {
    throw new LabelizerError('ISSUE_TEMPLATE directory missing');
  }
  /** @type {string[]} */
  const problems = [];
  for (const f of files) {
    if (f === 'config.yml') continue;
    const labels = templateLabels(readFileSync(path.join(dir, f), 'utf8'));
    for (const l of labels) {
      if (!managed.has(l)) problems.push(`${f} references unmanaged label ${l}`);
    }
  }
  return problems;
}

/**
 * @param {string[]} lines
 */
function emitSummary(lines) {
  const dest = process.env.GITHUB_STEP_SUMMARY;
  if (dest) {
    try {
      appendFileSync(dest, lines.join('\n') + '\n');
    } catch {
      // observability is best-effort; the JSON stdout stays authoritative
    }
  }
}

/**
 * @param {string[]} argv
 */
async function main(argv) {
  /** @type {Map<string, string>} */
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = /** @type {string} */ (argv[i]);
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args.set(a, next);
        i++;
      } else {
        args.set(a, 'true');
      }
    }
  }

  if (args.has('--validate')) {
    const root = args.get('--root') ?? DEFAULT_ROOT;
    const policy = loadPolicyFile(root);
    const { managed, manual } = validatePolicy(policy);
    const problems = crossCheckTemplates(root, managed);
    if (problems.length > 0) {
      for (const p of problems) console.error(`check-label-policy: ${p}`);
      process.exit(1);
    }
    process.stdout.write(
      `check-label-policy ok: version ${policy.version}, ${managed.size} managed labels (${manual.size} human-owned), templates reference managed labels only\n`,
    );
    return;
  }

  const repo = args.get('--repo');
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
    console.error(usage());
    process.exit(2);
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    console.error('issue-triage: refusing live run without GITHUB_TOKEN (fail-closed)');
    process.exit(1);
  }
  const apply = args.get('--apply') === 'true';
  const policy = loadPolicyFile(DEFAULT_ROOT);
  const { managed, manual } = validatePolicy(policy);

  /** @type {number[]} */
  let numbers = [];
  if (args.has('--all-open')) {
    numbers = await listOpenIssues(token, repo);
  } else if (args.get('--issue')) {
    const n = Number(args.get('--issue'));
    if (!Number.isInteger(n) || n <= 0) {
      console.error('issue-triage: --issue must be a positive integer');
      process.exit(2);
    }
    numbers = [n];
  } else {
    console.error(usage());
    process.exit(2);
  }

  /** @type {any[]} */
  const results = [];
  for (const n of numbers) {
    /** @type {any} */
    let item;
    try {
      item = await fetchIssue(token, repo, n);
    } catch (err) {
      // The `issues` trigger can fire for pull requests (a PR is an issue
      // row). Triage owns issues only: skip PRs without writes, exit 0.
      if (err instanceof LabelizerError && /pull request/.test(err.message)) {
        const skipped = { repo, number: n, skipped: 'pull_request', write_performed: false, dry_run: !apply };
        results.push(skipped);
        process.stdout.write(`${JSON.stringify(skipped)}\n`);
        continue;
      }
      throw err;
    }
    const desired = classifyIssue({ title: item.title, body: item.body }, policy);
    const { additions, removals } = computeDiff(item.current, desired, managed, manual);
    let writePerformed = false;
    if (apply && (additions.length > 0 || removals.length > 0)) {
      await applyDiff(token, repo, n, additions, removals);
      writePerformed = true;
    }
    const result = {
      repo,
      number: n,
      policy_version: policy.version,
      decision_key: decisionKey(repo, n, item, policy),
      desired_labels: desired,
      additions,
      removals,
      write_performed: apply && writePerformed,
      dry_run: !apply,
    };
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }

  emitSummary([
    '### Issue triage',
    ...results.map((/** @type {any} */ r) =>
      r.skipped !== undefined
        ? `- #${r.number}: skipped (${r.skipped})`
        : `- #${r.number}: desired [${r.desired_labels.join(', ') || 'none'}] / +[${r.additions.join(', ') || 'none'}] -[${r.removals.join(', ') || 'none'}]${r.dry_run ? ' (dry-run)' : ''}`,
    ),
  ]);
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`issue-triage: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
