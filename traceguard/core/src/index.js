// TraceGuard core entry point: one call turns Jira/Confluence artifacts into an audit view.
import { buildIndex } from './model.js';
import { findGaps } from './rules.js';
import { buildMatrix, coverageByAsil } from './matrix.js';
import { suggestLinks } from './suggest.js';

export { auditReport } from './report.js';
export { auditStorage } from './storage.js';
export { RULES, gapId } from './rules.js';
export { makeBaseline, compareBaseline, changesLine } from './baseline.js';
export { itemView, gapsView, matrixView } from './views.js';

export function analyze(items, options = {}) {
  const index = buildIndex(items);
  const gaps = findGaps(items, index);
  const matrix = buildMatrix(items, index);
  const coverage = coverageByAsil(matrix);
  const suggestions = suggestLinks(items, index, options.suggest);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const g of gaps) counts[g.severity] += 1;
  return {
    summary: {
      requirements: matrix.length,
      tests: items.filter(i => i.level === 'TEST').length,
      gaps: counts,
      coverage: coverage.percent,
    },
    gaps,
    matrix,
    coverage,
    suggestions,
  };
}
