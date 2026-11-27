// Jira adapter, pure functions only (no Forge imports), so it runs under node --test.
//
// Where the trace model comes from in Jira:
//   level, ASIL, allocation, test method/result  issue property "traceguard", then labels, then issue type name
//   derives / verifies                           issue links (any link type whose wording says so),
//                                                the Jira parent field, and links kept in the property
//   human requirement ID (SWR-3, DOORS id)       property "ref"; it becomes the item key when unique
//   content change time (suspect links)          property "changedAt" or the last summary/description edit
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

function contentChangedAt(issue) {
  let last = null;
  for (const h of issue.changelog?.histories || []) {
    if ((h.items || []).some(i => i.field === 'summary' || i.field === 'description')) last = latest(last, h.created);
  }
  return last;
}

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,39}$/;
const validRef = r => (typeof r === 'string' && REF_RE.test(r.trim()) ? r.trim() : null);

function stripRef(summary, ref) {
  const s = String(summary || '').trim();
  if (ref && s.startsWith(`[${ref}]`)) return s.slice(ref.length + 2).trim();
  return s;
}

function levelOf(issue, prop) {
  const own = normalizeLevel(prop.level);
  if (own) return own;
  for (const l of issue.fields?.labels || []) {
    const v = LEVEL_LABELS[norm(l)];
    if (v) return v;
  }
  const type = issue.fields?.issuetype?.name || '';
  for (const [re, level] of TYPE_PATTERNS) if (re.test(type)) return level;
  return null;
}

function asilOf(issue, prop) {
  return normalizeAsil(prop.asil)
    || (issue.fields?.labels || []).filter(l => /^asil[-_]/i.test(l)).map(normalizeAsil).find(Boolean)
    || null;
}

function resultOf(issue, prop) {
  const own = pick(prop.result, RESULTS);
  if (own) return { result: own, fromStatus: false };
  const status = norm(issue.fields?.status?.name);
  if (/pass/.test(status)) return { result: 'pass', fromStatus: true };
  if (/fail/.test(status)) return { result: 'fail', fromStatus: true };
  return { result: 'none', fromStatus: false };
}

// issues: Jira REST v3 search results requested with SEARCH_FIELDS, properties [PROPERTY_KEY] and
// expand=changelog. Returns the items for the core, the item key -> Jira key map, and what was skipped.
export function issuesToItems(issues) {
  const rows = [];
  let unclassified = 0;
  for (const issue of issues || []) {
    const prop = (issue.properties && issue.properties[PROPERTY_KEY]) || {};
    const level = levelOf(issue, prop);
    if (!level) { unclassified += 1; continue; }
    rows.push({ issue, prop, level, ref: validRef(prop.ref) });
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
    const item = {
      key: r.key,
      jiraKey: r.issue.key,
      level: r.level,
      summary: stripRef(f.summary, r.ref),
      asil: asilOf(r.issue, r.prop) || undefined,
      status: f.status?.name,
      updated: latest(r.prop.changedAt, contentChangedAt(r.issue)) || isoDate(f.created) || undefined,
      links: [],
    };
    const description = adfText(f.description).trim();
    if (description) item.description = description;
    const allocation = pick(r.prop.allocation, ALLOCATIONS)
      || ((f.labels || []).some(l => norm(l) === 'alloc-hw') ? 'hw' : null);
    if (allocation) item.allocation = allocation;
    if (typeof r.prop.decomposition === 'string' && r.prop.decomposition.trim()) {
      item.decomposition = r.prop.decomposition.trim().slice(0, 80);
    }
    if (r.level === 'TEST') {
      item.method = pick(r.prop.method, METHODS) || 'requirements';
      const { result, fromStatus } = resultOf(r.issue, r.prop);
      item.result = result;
      const ran = isoDate(r.prop.lastRunAt) || (fromStatus ? isoDate(f.statuscategorychangedate || f.updated) : null);
      if (ran) item.lastRunAt = ran;
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
      const sem = linkSemantics(link.outwardIssue ? link.type?.outward : link.type?.inward);
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
