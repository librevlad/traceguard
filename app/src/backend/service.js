// What the UI, the Rovo actions and the MCP tools ask for. Inputs from agents are untrusted:
// every key is validated before it reaches JQL or a REST path.
import { analyze, auditReport, auditStorage, itemView, makeBaseline, compareBaseline } from '../core/index.js';
import {
  issuesToItems, demoIssues, labelUpdates, normalizeLevel, normalizeAsil, normalizeConfig, searchFields,
  guessLevel, guessLinkType, PROPERTY_KEY, METHODS, RESULTS,
} from '../core/jira.js';
import { items as demoItems } from '../demo/brake-ecu.js';
import * as rest from './jira.js';
import * as store from './store.js';

const PROJECT_RE = /^[A-Z][A-Z0-9_]{0,19}$/;
const ISSUE_RE = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const SPACE_RE = /^~?[A-Za-z0-9_-]{1,255}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,39}$/;

export class UserError extends Error {}

export function projectKeyOf(value) {
  const key = String(value || '').trim().toUpperCase();
  if (!PROJECT_RE.test(key)) throw new UserError('Name a Jira project by its key, for example BRK.');
  return key;
}

export function issueKeyOf(value) {
  const key = String(value || '').trim().toUpperCase();
  if (!ISSUE_RE.test(key)) throw new UserError('Name a Jira issue by its key, for example BRK-12.');
  return key;
}

const today = () => new Date().toISOString().slice(0, 10);

async function inBatches(jobs, size) {
  for (let i = 0; i < jobs.length; i += size) await Promise.all(jobs.slice(i, i + size).map(job => job()));
}

// Reads a project with its TraceGuard settings (or the settings given, for a preview) and analyses it.
export async function loadProject(projectKey, { config } = {}) {
  const key = projectKeyOf(projectKey);
  const [project, info, stored] = await Promise.all([
    rest.getProject(key), rest.getServerInfo(), config ? null : store.getConfig(key),
  ]);
  const settings = normalizeConfig(config || stored);
  const issues = await rest.searchProject(key, { fields: searchFields(settings) });
  const { items, keyMap, unclassified } = issuesToItems(issues, settings);
  return {
    project: { key, name: project.name },
    baseUrl: info.baseUrl,
    config: settings,
    items,
    keyMap,
    unclassified,
    issueCount: issues.length,
    result: analyze(items),
  };
}

// Settings and baselines are project properties: Jira lets only project administrators write them.
// The permission is checked first for a clear message, and Jira checks it again on the write.
async function asProjectAdmin(projectKey, what, fn) {
  const denied = () => new UserError(`Only project administrators can ${what}.`);
  if (!(await rest.canAdminister(projectKey))) throw denied();
  try {
    return await fn();
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw denied();
    throw e;
  }
}

// The analysis, what changed since the last baseline (null when there is none) and the baseline history.
// The project is read as the user first, so only people who can see it get its baselines.
export async function withChanges(projectKey) {
  const key = projectKeyOf(projectKey);
  const [loaded, stored] = await Promise.all([loadProject(key), store.getBaselines(key)]);
  return { loaded, changes: compareBaseline(stored?.latest, loaded.result), history: stored?.history || [] };
}

export const urlOf = (loaded, itemKey) => (loaded.keyMap[itemKey] ? `${loaded.baseUrl}/browse/${loaded.keyMap[itemKey]}` : null);

// Item key for a Jira key or a requirement ID (SWR-3) of the loaded project.
export function itemKeyOf(loaded, value) {
  const v = String(value || '').trim();
  if (loaded.keyMap[v]) return v;
  const upper = v.toUpperCase();
  return Object.keys(loaded.keyMap).find(k => loaded.keyMap[k] === upper) || null;
}

// How much of the demo is in the project, so a half-finished load can be completed from the page.
function demoStatus(loaded) {
  const plan = demoIssues(demoItems);
  const refs = new Set(plan.map(p => p.ref));
  const issues = plan.filter(p => loaded.keyMap[p.ref]).length;
  if (!issues) return null;
  const expectedLinks = plan.reduce((n, p) => n + p.links.length, 0);
  const links = loaded.items.filter(i => refs.has(i.key)).reduce((n, i) => n + i.links.filter(l => refs.has(l.target)).length, 0);
  return { issues, total: plan.length, links, expectedLinks, complete: issues === plan.length && links >= expectedLinks };
}

export async function projectAudit(projectKey) {
  const { loaded, changes, history } = await withChanges(projectKey);
  const { project, keyMap, unclassified, issueCount, baseUrl, result, config } = loaded;
  return {
    project, keyMap, unclassified, issueCount, baseUrl,
    configured: Object.keys(config.levels).length + Object.keys(config.links).length + Object.keys(config.fields).length > 0,
    demo: demoStatus(loaded),
    ...result,
    changes,
    history,
    report: auditReport(result, { project: `${project.name} (${project.key})`, date: today(), changes }),
    analysedAt: new Date().toISOString(),
  };
}

// A baseline is the audit as it stood at an assessment or release; later audits are compared with it.
// Only figures, gap ids and item keys are kept: no personal data, not even who saved it.
export async function saveBaseline(projectKey, { name } = {}) {
  const key = projectKeyOf(projectKey);
  const loaded = await loadProject(key);
  const base = makeBaseline(loaded.result, { name: String(name || '').slice(0, 80) });
  await asProjectAdmin(key, 'save a baseline', () => store.addBaseline(key, base));
  return { at: base.at, name: base.name || '', truncated: Boolean(base.truncated) };
}

// Settings page: the project's issue types and the site's link types and custom fields, each with
// the meaning TraceGuard gives it now (saved setting, otherwise its guess from the name or wording).
export async function projectSettings(projectKey) {
  const key = projectKeyOf(projectKey);
  const [project, linkTypes, fields, canEdit, stored] = await Promise.all([
    rest.getProject(key), rest.listLinkTypes(), rest.listFields(), rest.canAdminister(key), store.getConfig(key),
  ]);
  const config = normalizeConfig(stored);
  return {
    project: { key, name: project.name },
    canEdit,
    savedAt: stored?.savedAt || null,
    issueTypes: (project.issueTypes || []).map(t => ({
      id: t.id, name: t.name, subtask: Boolean(t.subtask), level: config.levels[t.id] || guessLevel(t.name) || 'none',
    })),
    linkTypes: linkTypes.map(t => ({
      name: t.name, outward: t.outward, inward: t.inward, meaning: config.links[t.name] || guessLinkType(t) || 'none',
    })),
    fields,
    selected: config.fields,
  };
}

// What the audit would read with these settings, before they are saved.
export async function previewSettings(projectKey, raw) {
  const loaded = await loadProject(projectKey, { config: normalizeConfig(raw) });
  const levels = { SG: 0, SYS: 0, SWR: 0, TEST: 0 };
  for (const i of loaded.items) levels[i.level] += 1;
  return {
    issueCount: loaded.issueCount,
    unclassified: loaded.unclassified,
    levels,
    links: loaded.items.reduce((n, i) => n + i.links.length, 0),
    coverage: loaded.result.coverage.percent,
    gaps: loaded.result.summary.gaps,
  };
}

export async function saveSettings(projectKey, raw) {
  const key = projectKeyOf(projectKey);
  const config = normalizeConfig(raw);
  await asProjectAdmin(key, 'change the TraceGuard settings',
    () => store.setConfig(key, { ...config, savedAt: new Date().toISOString() }));
  return config;
}

export async function issueTrace(projectKey, issueKey) {
  const loaded = await loadProject(projectKey);
  const key = issueKeyOf(issueKey);
  const itemKey = itemKeyOf(loaded, key);
  const base = { project: loaded.project, issueKey: key, baseUrl: loaded.baseUrl, keyMap: loaded.keyMap, summary: loaded.result.summary };
  if (!itemKey) return { ...base, classified: false };
  return { ...base, classified: true, view: itemView(loaded.items, loaded.result, itemKey) };
}

export async function classifyIssue(issueKey, attrs = {}) {
  const key = issueKeyOf(issueKey);
  const level = normalizeLevel(attrs.level);
  if (!level) throw new UserError('Choose a level: safety goal, system requirement, software requirement or test case.');
  const issue = await rest.getIssue(key);
  const next = { ...(issue.properties?.[PROPERTY_KEY] || {}), level };
  const asil = level === 'TEST' ? null : normalizeAsil(attrs.asil);
  if (asil) next.asil = asil; else delete next.asil;
  if (level === 'SYS' && attrs.allocation === 'hw') next.allocation = 'hw'; else delete next.allocation;
  const decomposition = level === 'TEST' ? '' : String(attrs.decomposition || '').trim().slice(0, 80);
  if (decomposition) next.decomposition = decomposition; else delete next.decomposition;
  const ref = String(attrs.ref || '').trim();
  if (ref && REF_RE.test(ref)) next.ref = ref; else if (!ref) delete next.ref;
  if (level === 'TEST') {
    next.method = METHODS.includes(attrs.method) ? attrs.method : next.method || 'requirements';
    if (!RESULTS.includes(next.result)) next.result = 'none';
  } else {
    delete next.method; delete next.result; delete next.lastRunAt;
  }
  await rest.setProperty(key, next);
  await rest.updateLabels(key, labelUpdates(issue.fields?.labels, { level, asil }));
  return next;
}

export async function recordResult(issueKey, result) {
  const key = issueKeyOf(issueKey);
  if (!['pass', 'fail'].includes(result)) throw new UserError('A test result is pass or fail.');
  const issue = await rest.getIssue(key);
  const current = issue.properties?.[PROPERTY_KEY] || {};
  const next = { ...current, level: current.level || 'TEST', result, lastRunAt: new Date().toISOString() };
  await rest.setProperty(key, next);
  return next;
}

// type: derives (from = lower requirement), verifies (from = test) or verified-by (from = requirement).
export async function createTraceLink(projectKey, { from, to, type } = {}) {
  let [a, b, kind] = [from, to, String(type || '').toLowerCase()];
  if (kind === 'verified-by') { [a, b] = [b, a]; kind = 'verifies'; }
  if (!['derives', 'verifies'].includes(kind)) throw new UserError('The link type is derives, verifies or verified-by.');
  const loaded = await loadProject(projectKey);
  const resolve = v => {
    const k = itemKeyOf(loaded, v);
    if (k) return loaded.keyMap[k];
    const upper = String(v || '').trim().toUpperCase();
    return ISSUE_RE.test(upper) ? upper : null;
  };
  const [fromJira, toJira] = [resolve(a), resolve(b)];
  if (!fromJira || !toJira) throw new UserError(`Cannot find ${!fromJira ? a : b} in project ${loaded.project.key}.`);
  const types = await rest.ensureLinkTypes();
  if (types[kind]) {
    await rest.createIssueLink(types[kind], fromJira, toJira);
  } else {
    const issue = await rest.getIssue(fromJira);
    const prop = issue.properties?.[PROPERTY_KEY] || {};
    const links = Array.isArray(prop.links) ? prop.links : [];
    await rest.setProperty(fromJira, { ...prop, links: [...links, { type: kind, target: toJira }] });
  }
  return { linked: true, type: kind, from: fromJira, to: toJira, via: types[kind] ? 'Jira issue link' : 'TraceGuard issue property' };
}

const refFromSummary = s => /^\[([^\]]{1,40})\]/.exec(String(s || ''))?.[1] || null;

// Loads the brake ECU demo into a project, one bounded step per call, because a Forge UI call
// ends after 25 seconds. The page calls it until done is true. Safe to repeat: it only adds what is missing.
const ISSUES_PER_STEP = 25;
const STEP_BUDGET_MS = 14000;

// Jira search is eventually consistent: issues and links created a moment ago may not be found yet.
// So the page passes back what earlier steps created (known refs -> keys, links made), and a step
// that would need fresh search results waits ("indexing") instead of creating anything twice.
export async function seedDemo(projectKey, state = {}) {
  const started = Date.now();
  const inBudget = () => Date.now() - started < STEP_BUDGET_MS;
  const key = projectKeyOf(projectKey);
  const plan = demoIssues(demoItems);
  const planRefs = new Set(plan.map(p => p.ref));
  const ownKey = k => typeof k === 'string' && k.startsWith(`${key}-`) && /^\d{1,9}$/.test(k.slice(key.length + 1));
  const known = new Map(Object.entries(state.known || {})
    .filter(([ref, jiraKey]) => planRefs.has(ref) && ownKey(jiraKey)));
  const madeLinks = new Set((Array.isArray(state.linked) ? state.linked : []).filter(x => typeof x === 'string').slice(0, 500));
  const refsOf = issues => new Map(issues.map(i => [i.properties?.[PROPERTY_KEY]?.ref || refFromSummary(i.fields?.summary), i]));

  const [issues, linkTypes] = await Promise.all([rest.searchProject(key), rest.ensureLinkTypes()]);
  const byRef = refsOf(issues);
  for (const [ref, issue] of byRef) if (planRefs.has(ref)) known.set(ref, issue.key);
  const knownOut = () => Object.fromEntries(known);

  const missing = plan.filter(p => !known.has(p.ref));
  if (missing.length) {
    const issueType = await rest.creatableIssueType(key);
    if (!issueType) throw new UserError(`You cannot create issues in ${key}.`);
    const chunk = missing.slice(0, ISSUES_PER_STEP);
    const res = await rest.bulkCreate(chunk.map(p => ({
      fields: { project: { key }, issuetype: { id: issueType.id }, summary: p.summary, labels: p.labels },
      properties: [{ key: PROPERTY_KEY, value: p.property }],
    })));
    // Map the new keys to refs with direct reads, which do not depend on the search index.
    const created = await Promise.all((res.issues || []).map(i => rest.getIssue(i.key)));
    for (const issue of created) {
      const ref = issue.properties?.[PROPERTY_KEY]?.ref || refFromSummary(issue.fields?.summary);
      if (planRefs.has(ref)) known.set(ref, issue.key);
    }
    return { done: false, stage: 'issues', created: known.size, total: plan.length, known: knownOut() };
  }
  if (plan.some(p => !byRef.has(p.ref))) {
    return { done: false, stage: 'indexing', total: plan.length, known: knownOut() };
  }

  // Properties the bulk call did not store, and links where no link type could be used, go into the property.
  const propertyJobs = [];
  for (const p of plan) {
    const issue = byRef.get(p.ref);
    const viaProperty = p.links.filter(l => !linkTypes[l.type]);
    const stored = issue.properties?.[PROPERTY_KEY];
    const storedLinks = Array.isArray(stored?.links) ? stored.links.length : 0;
    const links = [...(p.property.links || []), ...viaProperty];
    if (!stored?.ref || storedLinks < links.length) {
      propertyJobs.push(() => rest.setProperty(issue.key, { ...p.property, ...(links.length ? { links } : {}) }));
    }
  }
  if (propertyJobs.length && !state.propertiesDone) {
    await inBatches(propertyJobs, 10);
    return { done: false, stage: 'properties', total: plan.length, known: knownOut(), propertiesDone: true };
  }

  const current = issuesToItems(issues);
  const existing = new Set(current.items.flatMap(i => i.links.map(l => `${i.key}|${l.type}|${l.target}`)));
  const jobs = [];
  for (const p of plan) {
    for (const l of p.links) {
      const id = `${p.ref}|${l.type}|${l.target}`;
      const [from, to] = [known.get(p.ref), known.get(l.target)];
      if (!linkTypes[l.type] || !from || !to || existing.has(id) || madeLinks.has(id)) continue;
      jobs.push({ id, run: () => rest.createIssueLink(linkTypes[l.type], from, to) });
    }
  }
  const linkedNow = [];
  for (let i = 0; i < jobs.length && inBudget(); i += 8) {
    const batch = jobs.slice(i, i + 8);
    await Promise.all(batch.map(j => j.run()));
    linkedNow.push(...batch.map(j => j.id));
  }
  const remaining = jobs.length - linkedNow.length;
  return {
    done: remaining === 0, stage: 'links', linked: linkedNow.length, remaining, total: plan.length,
    known: knownOut(), linkedNow, propertiesDone: Boolean(state.propertiesDone),
  };
}

export async function publishReport(projectKey, spaceKey) {
  const space = String(spaceKey || '').trim();
  if (!SPACE_RE.test(space)) throw new UserError('Name the Confluence space by its key, for example ENG.');
  const { loaded, changes } = await withChanges(projectKey);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = `${loaded.project.name} (${loaded.project.key})`;
  const storage = auditStorage(loaded.result, { project: name, date: `${stamp} UTC`, link: k => urlOf(loaded, k), changes });
  const page = await rest.createConfluencePage(space, `Traceability audit — ${name} — ${stamp} UTC`, storage);
  const url = page.url && !page.url.startsWith('http') ? `${loaded.baseUrl}/wiki${page.url}` : page.url;
  return { ...page, url, space, summary: loaded.result.summary };
}

// Status on the TraceGuard button of the issue view (jira:issueContext dynamic properties).
// Jira asks for it when the panel is collapsed; an issue outside the trace model answers quickly.
const lozenge = (label, type = 'default') => ({ status: { type: 'lozenge', value: { label, type } } });

async function issueStatus(projectKey, issueKey) {
  const key = projectKeyOf(projectKey);
  const [stored, issue] = await Promise.all([store.getConfig(key), rest.getIssue(issueKeyOf(issueKey))]);
  const settings = normalizeConfig(stored);
  if (!issuesToItems([issue], settings).items.length) return lozenge('not traced');
  const trace = await issueTrace(key, issueKey);
  if (!trace.classified) return lozenge('not traced');
  const { item, gaps, verification } = trace.view;
  if (gaps.length) {
    return lozenge(`${gaps.length} gap${gaps.length === 1 ? '' : 's'}`, gaps.some(g => g.severity === 'high') ? 'removed' : 'moved');
  }
  if (item.level === 'TEST') {
    if (item.result === 'pass') return lozenge('passed', 'success');
    return item.result === 'fail' ? lozenge('failed', 'removed') : lozenge('not run');
  }
  if (verification?.scope === 'software') return verification.verified ? lozenge('verified', 'success') : lozenge('open', 'moved');
  return lozenge('traced', 'success');
}

export async function contextStatus(payload) {
  const ext = payload?.extension || {};
  const [projectKey, issueKey] = [ext.project?.key, ext.issue?.key];
  if (!projectKey || !issueKey) return lozenge('TraceGuard');
  try {
    return await issueStatus(projectKey, issueKey);
  } catch {
    try {
      return await rest.asApp(() => issueStatus(projectKey, issueKey));
    } catch (e) {
      console.error('context status failed', e);
      return lozenge('TraceGuard');
    }
  }
}

// Project and issue the user is looking at when a Rovo agent calls an action.
export function actionContext(payload) {
  const jira = payload?.context?.jira || {};
  const issueKey = jira.issueKey || jira.issue?.key || null;
  const projectKey = jira.projectKey || jira.project?.key || (issueKey ? String(issueKey).split('-')[0] : null);
  return { projectKey, issueKey };
}
