// Traceability matrix and verification coverage by ASIL.
import { isRequirement } from './model.js';
import { verificationStatus } from './verify.js';

const byKey = (a, b) => a.key.localeCompare(b.key, 'en', { numeric: true });
const LEVEL_ORDER = { SG: 0, SYS: 1, SWR: 2 };

export function buildMatrix(items, index) {
  return items
    .filter(isRequirement)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || byKey(a, b))
    .map(req => {
      const s = verificationStatus(index, req);
      return {
        key: req.key,
        level: req.level,
        summary: req.summary,
        asil: s.asil,
        allocation: req.allocation || 'sw',
        parents: index.parents.get(req.key) || [],
        children: index.children.get(req.key) || [],
        tests: s.tests.map(t => ({ key: t.key, method: t.method || 'requirements', result: t.result || 'none' })),
        verified: s.verified,
        problems: s.problems,
      };
    });
}

// Safety goals are validated at vehicle level, so they are left out of verification coverage,
// and so are requirements allocated to hardware.
export function coverageByAsil(matrix) {
  const rows = matrix.filter(r => r.level !== 'SG' && r.allocation === 'sw');
  const pct = (v, t) => (t ? Math.round((100 * v) / t) : null);
  const byAsil = ['D', 'C', 'B', 'A', 'QM', 'none']
    .map(asil => {
      const group = rows.filter(r => (r.asil || 'none') === asil);
      const verified = group.filter(r => r.verified).length;
      return { asil, total: group.length, verified, percent: pct(verified, group.length) };
    })
    .filter(g => g.total > 0);
  const verified = rows.filter(r => r.verified).length;
  return { total: rows.length, verified, percent: pct(verified, rows.length), byAsil };
}
