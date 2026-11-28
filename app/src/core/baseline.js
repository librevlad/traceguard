// Baselines: a compact snapshot of an audit, kept as a Jira project property, so a later audit
// shows what changed since the last assessment or release: coverage per ASIL, gaps closed and
// opened, requirements that became verified or lost their verification.
import { gapId } from './rules.js';

const SEVERITY = { h: 'high', m: 'medium', l: 'low' };
const ASILS = ['D', 'C', 'B', 'A', 'QM', 'none'];

// maxChars keeps the snapshot inside a Jira entity property (32 KB of JSON at most).
export function makeBaseline(result, { at = new Date().toISOString(), by = null, name = '', maxChars = 30000 } = {}) {
  const { coverage, matrix, gaps, summary } = result;
  const base = {
    version: 1,
    at,
    ...(by ? { by } : {}),
    ...(String(name || '').trim() ? { name: String(name).trim().slice(0, 80) } : {}),
    requirements: summary.requirements,
    tests: summary.tests,
    counts: { ...summary.gaps },
    coverage: { percent: coverage.percent, verified: coverage.verified, total: coverage.total },
    byAsil: coverage.byAsil.map(({ asil, total, verified, percent }) => ({ asil, total, verified, percent })),
    verified: matrix.filter(r => r.verified).map(r => r.key),
    // Severity initial + gap id. Gaps come highest severity first, so trimming drops the least important.
    gaps: gaps.map(g => `${g.severity[0]}:${gapId(g)}`),
  };
  while (JSON.stringify(base).length > maxChars && (base.gaps.length || base.verified.length)) {
    if (base.gaps.length) base.gaps = base.gaps.slice(0, Math.floor(base.gaps.length * 0.9));
    else base.verified = base.verified.slice(0, Math.floor(base.verified.length * 0.9));
    base.truncated = true;
  }
  return base;
}

function parseGap(entry) {
  const s = String(entry);
  const id = s.slice(2);
  const [rule, key, ...about] = id.split('|');
  return { id, severity: SEVERITY[s[0]] || 'low', rule, key, ...(about.length ? { about: about.join('|') } : {}) };
}

// What changed between a stored baseline and the current analysis; null when there is no baseline.
export function compareBaseline(baseline, result) {
  if (!baseline || typeof baseline !== 'object' || !baseline.at) return null;
  const before = (Array.isArray(baseline.gaps) ? baseline.gaps : []).map(parseGap);
  const beforeIds = new Set(before.map(g => g.id));
  const nowIds = new Set(result.gaps.map(gapId));
  const wasVerified = new Set(Array.isArray(baseline.verified) ? baseline.verified : []);
  const rows = new Map(result.matrix.map(r => [r.key, r]));
  const percent = v => (typeof v === 'number' ? v : null);
  const coverageBefore = percent(baseline.coverage?.percent);
  const coverageNow = percent(result.coverage.percent);
  const asilRows = Array.isArray(baseline.byAsil) ? baseline.byAsil : [];

  return {
    since: baseline.at,
    by: baseline.by || null,
    name: baseline.name || '',
    truncated: Boolean(baseline.truncated),
    coverage: {
      before: coverageBefore,
      now: coverageNow,
      delta: coverageBefore === null || coverageNow === null ? null : coverageNow - coverageBefore,
    },
    byAsil: ASILS.map(asil => {
      const b = asilRows.find(x => x.asil === asil);
      const n = result.coverage.byAsil.find(x => x.asil === asil);
      if (!b && !n) return null;
      return {
        asil,
        before: percent(b?.percent),
        now: percent(n?.percent),
        verifiedBefore: b?.verified ?? 0,
        verifiedNow: n?.verified ?? 0,
        totalBefore: b?.total ?? 0,
        totalNow: n?.total ?? 0,
      };
    }).filter(Boolean),
    counts: { before: baseline.counts || null, now: result.summary.gaps },
    requirements: { before: baseline.requirements ?? null, now: result.summary.requirements },
    tests: { before: baseline.tests ?? null, now: result.summary.tests },
    newGaps: result.gaps.filter(g => !beforeIds.has(gapId(g))),
    closedGaps: before.filter(g => !nowIds.has(g.id)).map(({ id, ...g }) => g),
    newlyVerified: result.matrix.filter(r => r.verified && !wasVerified.has(r.key)).map(r => r.key),
    noLongerVerified: [...wasVerified].filter(k => rows.has(k) && !rows.get(k).verified),
    removed: [...wasVerified].filter(k => !rows.has(k)),
  };
}

// One line for reports and agents: "coverage 56% → 63% (+7 points), 4 gaps closed, 1 new".
export function changesLine(changes) {
  if (!changes) return '';
  const c = changes.coverage;
  const delta = c.delta === null ? '' : ` (${c.delta >= 0 ? '+' : ''}${c.delta} points)`;
  return `coverage ${c.before ?? '—'}% → ${c.now ?? '—'}%${delta}, ${changes.closedGaps.length} gap`
    + `${changes.closedGaps.length === 1 ? '' : 's'} closed, ${changes.newGaps.length} new, `
    + `${changes.newlyVerified.length} newly verified, ${changes.noLongerVerified.length} no longer verified`;
}
