// Rovo actions. The same actions are the tools of the TraceGuard MCP server (rovo:mcp),
// so Rovo agents and external agents such as Claude or Cursor get identical answers.
import * as svc from '../backend/service.js';
import { gapsView, matrixView, itemView, auditReport } from '../core/index.js';

const SEVERITIES = ['high', 'medium', 'low'];
const LEVELS = ['SG', 'SYS', 'SWR', 'TEST'];

const int = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const run = fn => async payload => {
  try {
    const p = payload || {};
    const ctx = svc.actionContext(p);
    return await fn(p, { ...ctx, projectKey: p.projectKey || ctx.projectKey });
  } catch (e) {
    console.error('action failed', e);
    return { error: e.message || String(e) };
  }
};

const withUrls = (loaded, rows, field = 'key') => rows.map(r => ({ ...r, jiraKey: loaded.keyMap[r[field]] || null, url: svc.urlOf(loaded, r[field]) }));

export const actionGaps = run(async (p, ctx) => {
  const loaded = await svc.loadProject(ctx.projectKey);
  const severity = SEVERITIES.find(s => s === String(p.severity || '').toLowerCase());
  const view = gapsView(loaded.result, { severity, limit: int(p.limit, 1, 200, 50) });
  return { project: loaded.project, ...view, gaps: withUrls(loaded, view.gaps) };
});

export const actionMatrix = run(async (p, ctx) => {
  const loaded = await svc.loadProject(ctx.projectKey);
  const level = LEVELS.find(l => l === String(p.level || '').toUpperCase());
  const view = matrixView(loaded.result, { level, onlyOpen: String(p.onlyOpen) === 'true', limit: int(p.limit, 1, 500, 200) });
  return { project: loaded.project, ...view, rows: withUrls(loaded, view.rows) };
});

export const actionCoverage = run(async (p, ctx) => {
  const loaded = await svc.loadProject(ctx.projectKey);
  return { project: loaded.project, summary: loaded.result.summary, coverage: loaded.result.coverage };
});

export const actionSuggestions = run(async (p, ctx) => {
  const loaded = await svc.loadProject(ctx.projectKey);
  const suggestions = loaded.result.suggestions.map(s => ({
    from: s.from, fromUrl: svc.urlOf(loaded, s.from), link: s.link, candidates: withUrls(loaded, s.candidates),
  }));
  return {
    project: loaded.project,
    note: 'Suggestions come from text similarity. Confirm each one with the user before calling create-trace-link.',
    suggestions,
  };
});

export const actionItem = run(async (p, ctx) => {
  const wanted = p.issueKey || ctx.issueKey;
  const projectKey = ctx.projectKey || String(wanted || '').split('-')[0];
  const loaded = await svc.loadProject(projectKey);
  const key = svc.itemKeyOf(loaded, wanted);
  if (!key) return { error: `${wanted} is not a classified requirement or test case in ${loaded.project.key}.` };
  const view = itemView(loaded.items, loaded.result, key);
  return { project: loaded.project, url: svc.urlOf(loaded, key), ...view };
});

export const actionReport = run(async (p, ctx) => {
  const loaded = await svc.loadProject(ctx.projectKey);
  const name = `${loaded.project.name} (${loaded.project.key})`;
  return { project: loaded.project, summary: loaded.result.summary, markdown: auditReport(loaded.result, { project: name }) };
});

export const actionPublish = run(async (p, ctx) => svc.publishReport(ctx.projectKey, p.spaceKey));

export const actionLink = run(async (p, ctx) => {
  const projectKey = ctx.projectKey || String(p.fromKey || '').split('-')[0];
  return svc.createTraceLink(projectKey, { from: p.fromKey, to: p.toKey, type: p.linkType });
});
