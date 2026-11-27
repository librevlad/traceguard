// Audit-ready report in Markdown (converted to Confluence storage format by the app).

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

export function auditReport(result, { project = 'Project', date = new Date().toISOString().slice(0, 10) } = {}) {
  const { coverage, gaps, suggestions, summary } = result;
  const lines = [];
  lines.push(`# Traceability audit — ${project}`, '');
  lines.push(`Generated ${date} by TraceGuard. Scope: ${summary.requirements} requirements, ${summary.tests} test cases.`, '');

  lines.push('## Verification coverage', '');
  lines.push(`Overall: **${coverage.percent ?? 0}%** (${coverage.verified} of ${coverage.total} software-allocated requirements verified).`, '');
  lines.push('| ASIL | Requirements | Verified | Coverage |', '|---|---|---|---|');
  for (const g of coverage.byAsil) {
    lines.push(`| ${g.asil === 'none' ? 'not set' : g.asil} | ${g.total} | ${g.verified} | ${g.percent}% |`);
  }
  lines.push('');

  lines.push('## Gaps', '');
  lines.push(`High: **${summary.gaps.high}**, medium: **${summary.gaps.medium}**, low: **${summary.gaps.low}**.`, '');
  if (gaps.length) {
    lines.push('| Severity | Item | Gap | Detail | Fix | Reference |', '|---|---|---|---|---|---|');
    for (const g of gaps) {
      lines.push(`| ${SEVERITY_LABEL[g.severity]} | ${g.key} | ${g.title} | ${g.detail} | ${g.fix} | ${g.ref} |`);
    }
    lines.push('');
  }

  if (suggestions.length) {
    lines.push('## Suggested links (to confirm)', '');
    for (const s of suggestions) {
      const c = s.candidates.map(x => `${x.key} (${x.score})`).join(', ');
      lines.push(`- ${s.from} — ${s.link}: ${c}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
