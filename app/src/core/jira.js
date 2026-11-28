// Jira adapter, pure functions only (no Forge imports), so it runs under node --test.
//
// Where the trace model comes from in Jira:
//   level, ASIL, allocation, test method/result  issue property "traceguard", then labels, then issue type name
//   derives / verifies                           issue links (any link type whose wording says so),
//                                                the Jira parent field, and links kept in the property
//   human requirement ID (SWR-3, DOORS id)       property "ref"; it becomes the item key when unique
//   content change time (suspect links)          property "changedAt" or the last summary/description edit
//   project settings (TraceGuard settings page)  which issue types are which level, which link types
//                                                derive or verify, and custom fields for ASIL, requirement
//                                                ID, test method and test result
//
// Links are oriented by level, so a link created "the wrong way round" still reads correctly:
// a test always verifies a requirement, and a lower-level requirement derives from a higher one.

export const PROPERTY_KEY = 'traceguard';
export const LEVELS = ['SG', 'SYS', 'SWR', 'TEST'];
export const ASILS = ['QM', 'A', 'B', 'C', 'D'];
export const METHODS = ['requirements', 'fault-injection', 'back-to-back', 'review'];
export const RESULTS = ['pass', 'fail', 'none'];
export const ALLOCATIONS = ['sw', 'hw'];
export const SEARCH_FIELDS = ['summary', 'description', 'issuetype', 'labels', 'status', 'issuelinks', 'parent',
  'created', 'updated', 'statuscategorychangedate'];
export const FIELD_ROLES = ['asil', 'ref', 'method', 'result'];
export const LINK_MEANINGS = ['derives', 'verifies', 'none'];
const FIELD_ID_RE = /^customfield_\d{1,9}$/;

// Link types TraceGuard creates on setup. Existing types with the same wording work too.
export const LINK_TYPES = {
  derives: { name: 'Derives', outward: 'derives from', inward: 'is derived into' },
  verifies: { name: 'Verifies', outward: 'verifies', inward: 'is verified by' },
};

const LEVEL_RANK = { SG: 0, SYS: 1, SWR: 2 };
const LEVEL_LABELS = { 'tg-sg': 'SG', 'tg-sys': 'SYS', 'tg-swr': 'SWR', 'tg-test': 'TEST' };
const TYPE_PATTERNS = [
  [/safety\s*goal/i, 'SG'],
  [/system\s*req/i, 'SYS'],
  [/software\s*req/i, 'SWR'],
  [/^(test|test\s*case)$/i, 'TEST'],
];
// Link wording seen from the issue that holds the link entry.
// "active": that issue is the lower end (the test, or the derived requirement).
const PHRASES = {
  active: {
    verifies: ['verifies', 'tests', 'validates', 'is a test for'],
    derives: ['derives from', 'is derived from', 'refines', 'implements', 'satisfies', 'is child of', 'traces to'],
  },
  passive: {
    verifies: ['is verified by', 'is tested by', 'is validated by', 'has test'],
    derives: ['is derived into', 'has derived', 'is refined by', 'is implemented by', 'is satisfied by',
      'is parent of', 'is traced by'],
  },
};

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function linkSemantics(phrase) {
  const p = norm(phrase);
  for (const voice of ['active', 'passive']) {
    for (const type of ['verifies', 'derives']) {
      if (PHRASES[voice][type].includes(p)) return { type, active: voice === 'active' };
    }
  }
  return null;
}

export function normalizeLevel(v) {
  const s = String(v || '').trim().toUpperCase();
  if (LEVELS.includes(s)) return s;
  if (s === 'TC' || s === 'TEST CASE') return 'TEST';
  return null;
}

export function normalizeAsil(v) {
  const s = String(v || '').trim().toUpperCase().replace(/^ASIL[\s_-]*/, '');
  return ASILS.includes(s) ? s : null;
}

// "ASIL B(D)": ASIL B that comes from decomposing an ASIL D requirement (ISO 26262-9).
export function parseAsil(v) {
  const s = String(v || '').trim().toUpperCase().replace(/^ASIL[\s_-]*/, '');
  const m = /^(QM|[ABCD])\s*\(\s*([ABCD])\s*\)$/.exec(s);
  if (m) return { asil: m[1], decomposition: `${m[1]}(${m[2]})` };
  const asil = normalizeAsil(s);
  return asil ? { asil } : null;
}

// Level TraceGuard assumes for an issue type name when the project has no setting for it.
export function guessLevel(issueTypeName) {
  for (const [re, level] of TYPE_PATTERNS) if (re.test(String(issueTypeName || ''))) return level;
  return null;
}

// Meaning TraceGuard assumes for a Jira link type from its wording: derives, verifies or null.
export function guessLinkType(linkType) {
  return linkSemantics(linkType?.outward)?.type || linkSemantics(linkType?.inward)?.type || null;
}

// Project settings as saved from the settings page; anything unexpected is dropped.
//   levels: { <issue type id>: 'SG' | 'SYS' | 'SWR' | 'TEST' | 'none' }
//   links:  { <link type name>: 'derives' | 'verifies' | 'none' }
//   fields: { asil | ref | method | result: 'customfield_10042' }
export function normalizeConfig(raw) {
  const out = { levels: {}, links: {}, fields: {} };
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw.levels || {}).slice(0, 300)) {
    const level = v === 'none' ? 'none' : normalizeLevel(v);
    if (/^\d{1,18}$/.test(id) && level) out.levels[id] = level;
  }
  for (const [name, v] of Object.entries(raw.links || {}).slice(0, 300)) {
    if (name && name.length <= 255 && LINK_MEANINGS.includes(v)) out.links[name] = v;
  }
  for (const role of FIELD_ROLES) {
    const id = raw.fields?.[role];
    if (typeof id === 'string' && FIELD_ID_RE.test(id)) out.fields[role] = id;
  }
  return out;
}

// Fields to request from Jira search for a project with these settings.
export const searchFields = config => [...SEARCH_FIELDS, ...new Set(Object.values(normalizeConfig(config).fields))];

// Text of a Jira field value: plain text, a select option, a rich text document, or a list of them.
export function fieldText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(', ');
  if (typeof v === 'object') return v.type === 'doc' ? adfText(v) : fieldText(v.value ?? v.name ?? '');
  return '';
}

const METHOD_PATTERNS = [
  [/fault|inject/i, 'fault-injection'],
  [/back[\s-]*to[\s-]*back|b2b/i, 'back-to-back'],
  [/review|inspect|walk[\s-]*through/i, 'review'],
];
const methodFromText = t => (t ? METHOD_PATTERNS.find(([re]) => re.test(t))?.[1] || 'requirements' : null);
const resultFromText = t => {
  if (!t) return null;
  if (/fail|nok|error|block/i.test(t)) return 'fail';
  return /pass|^ok$|success/i.test(t) ? 'pass' : 'none';
};

const pick = (v, allowed) => (allowed.includes(norm(v)) ? norm(v) : null);

// Jira returns "+0000"; normalise every date to ISO 8601 UTC.
export function isoDate(v) {
  if (!v) return null;
  const t = Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const latest = (...dates) => dates.map(isoDate).filter(Boolean).sort().pop() || null;

// Plain text of an Atlassian Document Format node (descriptions feed the link suggestions).
export function adfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(adfText).filter(Boolean).join(' ');
}

function changedAt(issue, matches) {
  let last = null;
  for (const h of issue.changelog?.histories || []) {
    if ((h.items || []).some(matches)) last = latest(last, h.created);
  }
  return last;
}
const contentChangedAt = issue => changedAt(issue, i => i.field === 'summary' || i.field === 'description');

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,39}$/;
const validRef = r => (typeof r === 'string' && REF_RE.test(r.trim()) ? r.trim() : null);

function stripRef(summary, ref) {
  const s = String(summary || '').trim();
  if (ref && s.startsWith(`[${ref}]`)) return s.slice(ref.length + 2).trim();
  return s;
}

// Level: the issue's own property, then tg-* labels, then the project setting for its issue type,
// then the issue type name.
function levelOf(issue, prop, config) {
  const own = normalizeLevel(prop.level);
  if (own) return own;
  for (const l of issue.fields?.labels || []) {
    const v = LEVEL_LABELS[norm(l)];
    if (v) return v;
  }
  const mapped = config.levels[issue.fields?.issuetype?.id];
  if (mapped) return mapped === 'none' ? null : mapped;
  return guessLevel(issue.fields?.issuetype?.name);
}

// A custom field named in the project settings wins when it has a value: it is the team's own data.
// ASIL: that field, then the property set from the TraceGuard panel, then asil-* labels.
function asilOf(issue, prop, fieldValue) {
  return parseAsil(fieldValue)
    || parseAsil(prop.asil)
    || (issue.fields?.labels || []).filter(l => /^asil[-_]/i.test(l)).map(parseAsil).find(Boolean)
    || null;
}

// Test result and when it was recorded: result field, property, then a workflow status named pass/fail.
function resultOf(issue, prop, fieldValue, fieldId) {
  const fromField = resultFromText(fieldValue);
  if (fromField) {
    return { result: fromField, ranAt: changedAt(issue, i => i.fieldId === fieldId) || isoDate(issue.fields?.updated) };
  }
  const own = pick(prop.result, RESULTS);
  if (own) return { result: own, ranAt: isoDate(prop.lastRunAt) };
  const status = norm(issue.fields?.status?.name);
  const ranAt = isoDate(issue.fields?.statuscategorychangedate || issue.fields?.updated);
  if (/fail/.test(status)) return { result: 'fail', ranAt };
  if (/pass/.test(status)) return { result: 'pass', ranAt };
  return { result: 'none', ranAt: null };
}

// What a Jira issue link means: the project setting for its link type, otherwise its wording.
function linkMeaning(link, config) {
  const mapped = config.links[link.type?.name];
  if (mapped === 'none') return null;
  if (mapped) return { type: mapped, active: Boolean(link.outwardIssue) };
  return linkSemantics(link.outwardIssue ? link.type?.outward : link.type?.inward);
}

// issues: Jira REST v3 search results requested with searchFields(config), properties [PROPERTY_KEY] and
// expand=changelog. config: the project settings (see normalizeConfig).
// Returns the items for the core, the item key -> Jira key map, and how many issues were skipped.
export function issuesToItems(issues, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const field = (issue, role) => (config.fields[role] ? fieldText(issue.fields?.[config.fields[role]]).trim() : '');
  const rows = [];
  let unclassified = 0;
  for (const issue of issues || []) {
    const prop = (issue.properties && issue.properties[PROPERTY_KEY]) || {};
    const level = levelOf(issue, prop, config);
    if (!level) { unclassified += 1; continue; }
    rows.push({ issue, prop, level, ref: validRef(field(issue, 'ref')) || validRef(prop.ref) });
  }

  const jiraKeys = new Set(rows.map(r => r.issue.key));
  const refCount = new Map();
  for (const r of rows) if (r.ref) refCount.set(r.ref, (refCount.get(r.ref) || 0) + 1);
  const toItemKey = new Map();
  for (const r of rows) {
    r.key = r.ref && refCount.get(r.ref) === 1 && !jiraKeys.has(r.ref) ? r.ref : r.issue.key;
    toItemKey.set(r.issue.key, r.key);
  }
  const itemKeys = new Set(rows.map(r => r.key));
  const levelOfKey = new Map(rows.map(r => [r.key, r.level]));

  const items = rows.map(r => {
    const f = r.issue.fields || {};
    const asil = r.level === 'TEST' ? null : asilOf(r.issue, r.prop, field(r.issue, 'asil'));
    const item = {
      key: r.key,
      jiraKey: r.issue.key,
      level: r.level,
      summary: stripRef(f.summary, r.ref),
      asil: asil?.asil || undefined,
      status: f.status?.name,
      updated: latest(r.prop.changedAt, contentChangedAt(r.issue)) || isoDate(f.created) || undefined,
      links: [],
    };
    const description = adfText(f.description).trim();
    if (description) item.description = description;
    const allocation = pick(r.prop.allocation, ALLOCATIONS)
      || ((f.labels || []).some(l => norm(l) === 'alloc-hw') ? 'hw' : null);
    if (allocation) item.allocation = allocation;
    const decomposition = asil?.decomposition
      || (typeof r.prop.decomposition === 'string' ? r.prop.decomposition.trim().slice(0, 80) : '');
    if (decomposition) item.decomposition = decomposition;
    if (r.level === 'TEST') {
      item.method = methodFromText(field(r.issue, 'method')) || pick(r.prop.method, METHODS) || 'requirements';
      const { result, ranAt } = resultOf(r.issue, r.prop, field(r.issue, 'result'), config.fields.result);
      item.result = result;
      if (ranAt && result !== 'none') item.lastRunAt = ranAt;
    }
    return item;
  });
  const byKey = new Map(items.map(i => [i.key, i]));

  // Orient a proposed edge from -> to by level; null when the pair makes no sense in the model.
  const orient = (type, a, b) => {
    const la = levelOfKey.get(a);
    const lb = levelOfKey.get(b);
    if (!la || !lb || a === b) return null;
    if (type === 'verifies') {
      if (la === 'TEST' && lb !== 'TEST') return [a, b];
      if (lb === 'TEST' && la !== 'TEST') return [b, a];
      return null;
    }
    if (la === 'TEST' || lb === 'TEST') return null;
    return LEVEL_RANK[lb] > LEVEL_RANK[la] ? [b, a] : [a, b];
  };
  const seen = new Set();
  const addEdge = (type, from, to) => {
    const id = `${from}|${type}|${to}`;
    if (seen.has(id)) return;
    seen.add(id);
    byKey.get(from).links.push({ type, target: to });
  };

  for (const r of rows) {
    const f = r.issue.fields || {};
    for (const link of f.issuelinks || []) {
      const other = link.outwardIssue || link.inwardIssue;
      const otherKey = toItemKey.get(other?.key);
      if (!otherKey) continue; // unclassified or outside the analysed scope
      const sem = linkMeaning(link, config);
      if (!sem) continue;
      const edge = sem.active ? orient(sem.type, r.key, otherKey) : orient(sem.type, otherKey, r.key);
      if (edge) addEdge(sem.type, ...edge);
    }
    const parentKey = toItemKey.get(f.parent?.key);
    if (parentKey) {
      const type = r.level === 'TEST' || levelOfKey.get(parentKey) === 'TEST' ? 'verifies' : 'derives';
      const edge = orient(type, r.key, parentKey);
      if (edge) addEdge(type, ...edge);
    }
    for (const l of Array.isArray(r.prop.links) ? r.prop.links : []) {
      if (!['derives', 'verifies'].includes(l?.type) || typeof l.target !== 'string') continue;
      const target = toItemKey.get(l.target) || (itemKeys.has(l.target) ? l.target : null);
      if (!target) { addEdge(l.type, r.key, l.target.slice(0, 40)); continue; } // kept as a broken link
      const edge = orient(l.type, r.key, target);
      if (edge) addEdge(l.type, ...edge);
    }
  }

  const keyMap = Object.fromEntries(items.map(i => [i.key, i.jiraKey]));
  return { items, keyMap, unclassified };
}

// Demo items -> what to create in Jira: summary, labels, the issue property and the Jira links.
// Links whose target is not part of the demo stay in the property, where they surface as broken links.
export function demoIssues(items) {
  const refs = new Set(items.map(i => i.key));
  return items.map(i => {
    const property = { ref: i.key, level: i.level };
    if (i.asil) property.asil = i.asil;
    if (i.allocation) property.allocation = i.allocation;
    if (i.decomposition) property.decomposition = i.decomposition;
    if (i.level === 'TEST') {
      property.method = i.method || 'requirements';
      property.result = i.result || 'none';
      if (i.lastRunAt) property.lastRunAt = i.lastRunAt;
    } else if (i.updated) {
      property.changedAt = i.updated;
    }
    const dangling = (i.links || []).filter(l => !refs.has(l.target));
    if (dangling.length) property.links = dangling.map(l => ({ type: l.type, target: l.target }));
    const labels = ['traceguard', `tg-${i.level.toLowerCase()}`];
    if (i.asil) labels.push(`asil-${i.asil.toLowerCase()}`);
    if (i.allocation === 'hw') labels.push('alloc-hw');
    return {
      ref: i.key,
      summary: `[${i.key}] ${i.summary}`,
      labels,
      property,
      links: (i.links || []).filter(l => refs.has(l.target)).map(l => ({ type: l.type, target: l.target })),
    };
  });
}

// Label changes that keep the tg-* and asil-* labels in line with the property after an edit.
export function labelUpdates(currentLabels, { level, asil }) {
  const ops = [];
  const want = new Set();
  if (level) want.add(`tg-${level.toLowerCase()}`);
  if (asil) want.add(`asil-${asil.toLowerCase()}`);
  for (const l of currentLabels || []) {
    const n = norm(l);
    if ((LEVEL_LABELS[n] || /^asil[-_]/.test(n)) && !want.has(n)) ops.push({ remove: l });
  }
  const have = new Set((currentLabels || []).map(norm));
  for (const w of want) if (!have.has(w)) ops.push({ add: w });
  return ops;
}
