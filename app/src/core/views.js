// Views on an analysis for one item and for agents: what the issue panel and the Rovo actions return.
import { buildIndex, ancestors, isRequirement } from './model.js';
import { verificationStatus } from './verify.js';

const brief = item => item && {
  key: item.key,
  jiraKey: item.jiraKey || null,
  level: item.level,
  summary: item.summary,
  asil: item.asil || null,
};

const testBrief = t => ({ ...brief(t), method: t.method || 'requirements', result: t.result || 'none', lastRunAt: t.lastRunAt || null });

export function itemView(items, result, key) {
  const index = buildIndex(items);
  const item = index.byKey.get(key);
  if (!item) return null;
  const get = k => index.byKey.get(k);
  const chain = ancestors(index, key).map(k => brief(get(k)));
  const view = {
    item: {
      ...brief(item),
      status: item.status || null,
      allocation: item.allocation || 'sw',
      decomposition: item.decomposition || null,
      updated: item.updated || null,
      ...(item.level === 'TEST' ? { method: item.method || 'requirements', result: item.result || 'none', lastRunAt: item.lastRunAt || null } : {}),
    },
    chain,
    parents: (index.parents.get(key) || []).map(k => brief(get(k))),
    children: (index.children.get(key) || []).map(k => brief(get(k))),
    tests: (index.testsOf.get(key) || []).map(k => testBrief(get(k))),
    verifies: (index.verifiedBy.get(key) || []).map(k => brief(get(k))),
    broken: index.broken.filter(b => b.from === key).map(b => ({ type: b.type, target: b.target })),
    gaps: result.gaps.filter(g => g.key === key),
    suggestions: result.suggestions.filter(s => s.from === key),
    incoming: result.suggestions
      .flatMap(s => s.candidates.filter(c => c.key === key).map(c => ({ from: s.from, link: s.link, score: c.score })))
      .sort((a, b) => b.score - a.score),
  };
  if (isRequirement(item)) {
    const s = verificationStatus(index, item);
    view.effectiveAsil = s.asil || null;
    view.inheritedFrom = !item.asil && s.asil ? chain.find(a => a.asil === s.asil)?.key || null : null;
    view.verification = item.level === 'SG'
      ? { scope: 'vehicle' }
      : item.allocation === 'hw'
        ? { scope: 'hardware' }
        : {
          scope: 'software',
          verified: s.verified,
          passing: s.passing.length,
          failing: s.failing.map(t => t.key),
          notRun: s.notRun.map(t => t.key),
          suspect: s.suspect.map(t => t.key),
          problems: s.problems,
        };
  }
  return view;
}

// Compact answers for Rovo actions and MCP tools.
export function gapsView(result, { severity, limit = 50 } = {}) {
  const list = result.gaps.filter(g => !severity || g.severity === severity);
  return { summary: result.summary, shown: Math.min(limit, list.length), total: list.length, gaps: list.slice(0, limit) };
}

export function matrixView(result, { level, onlyOpen = false, limit = 200 } = {}) {
  const rows = result.matrix
    .filter(r => (!level || r.level === level) && (!onlyOpen || (!r.verified && r.level !== 'SG' && r.allocation === 'sw')))
    .map(r => ({
      key: r.key, level: r.level, asil: r.asil, summary: r.summary, allocation: r.allocation,
      derivesFrom: r.parents, derivedInto: r.children, tests: r.tests,
      status: r.level === 'SG' ? 'vehicle-level' : r.allocation === 'hw' ? 'hardware' : r.verified ? 'verified' : 'open',
      problems: r.problems,
    }));
  return { total: rows.length, rows: rows.slice(0, limit) };
}
