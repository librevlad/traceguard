// Audit report in Confluence storage format (XHTML), for the page TraceGuard publishes.
// link(key) returns the Jira URL of an item key, or null to print the key as text.

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const status = (title, colour) => '<ac:structured-macro ac:name="status">'
  + `<ac:parameter ac:name="colour">${colour}</ac:parameter>`
  + `<ac:parameter ac:name="title">${esc(title)}</ac:parameter></ac:structured-macro>`;

const panel = (name, html) => `<ac:structured-macro ac:name="${name}"><ac:rich-text-body>${html}</ac:rich-text-body></ac:structured-macro>`;

const SEVERITY = { high: ['HIGH', 'Red'], medium: ['MEDIUM', 'Yellow'], low: ['LOW', 'Grey'] };

function table(head, rows) {
  const th = head.map(h => `<th>${esc(h)}</th>`).join('');
  const tr = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table data-layout="full-width"><tbody><tr>${th}</tr>${tr}</tbody></table>`;
}

export function auditStorage(result, { project = 'Project', date = new Date().toISOString().slice(0, 10), link = () => null } = {}) {
  const { coverage, gaps, matrix, suggestions, summary } = result;
  const k = key => {
    const href = link(key);
    return href ? `<a href="${esc(href)}">${esc(key)}</a>` : esc(key);
  };
  const keys = list => (list.length ? list.map(k).join(', ') : '—');
  const out = [];

  out.push(panel('info', `<p>Generated ${esc(date)} by TraceGuard for <strong>${esc(project)}</strong>. `
    + `Scope: ${summary.requirements} requirements, ${summary.tests} test cases. `
    + 'Checks follow Automotive SPICE (SYS.2, SWE.1, SWE.6) and ISO 26262 parts 3, 6, 8 and 9.</p>'));

  out.push('<h2>Verification coverage</h2>');
  out.push(`<p>Overall: <strong>${coverage.percent ?? 0}%</strong> — ${coverage.verified} of ${coverage.total} `
    + 'software-allocated requirements are verified. Safety goals and hardware-allocated requirements are out of scope.</p>');
  out.push(table(['ASIL', 'Requirements', 'Verified', 'Coverage'], coverage.byAsil.map(g => [
    esc(g.asil === 'none' ? 'not set' : g.asil), g.total, g.verified, `${g.percent}%`,
  ])));

  out.push('<h2>Gaps</h2>');
  out.push(`<p>${status(`${summary.gaps.high} high`, 'Red')} ${status(`${summary.gaps.medium} medium`, 'Yellow')} `
    + `${status(`${summary.gaps.low} low`, 'Grey')}</p>`);
  if (gaps.length) {
    out.push(table(['Severity', 'Item', 'Gap', 'Detail', 'Fix', 'Reference'], gaps.map(g => [
      status(...SEVERITY[g.severity]), k(g.key), esc(g.title), esc(g.detail), esc(g.fix), esc(g.ref),
    ])));
  } else {
    out.push(panel('tip', '<p>No gaps found.</p>'));
  }

  out.push('<h2>Traceability matrix</h2>');
  out.push(table(['Requirement', 'Level', 'ASIL', 'Derives from', 'Derived into', 'Verified by', 'Status'], matrix.map(r => [
    `${k(r.key)}<br/>${esc(r.summary)}`, esc(r.level), esc(r.asil || '—'), keys(r.parents), keys(r.children),
    r.tests.length ? r.tests.map(t => `${k(t.key)} (${esc(t.method)}, ${esc(t.result)})`).join('<br/>') : '—',
    r.level === 'SG' ? status('VEHICLE LEVEL', 'Blue')
      : r.allocation === 'hw' ? status('HARDWARE', 'Blue')
        : r.verified ? status('VERIFIED', 'Green') : status('OPEN', 'Red'),
  ])));

  if (suggestions.length) {
    out.push('<h2>Suggested links</h2>');
    out.push('<p>Found by text similarity. Each link must be confirmed by an engineer before it counts as evidence.</p>');
    out.push(table(['Item', 'Proposed link', 'Candidates (score)'], suggestions.map(s => [
      k(s.from), esc(s.link), s.candidates.map(c => `${k(c.key)} (${c.score})`).join(', '),
    ])));
  }

  out.push('<h2>Sign-off</h2>');
  out.push(table(['Role', 'Name', 'Date', 'Decision'], [
    ['Safety manager', '', '', ''], ['Quality assurance', '', '', ''], ['Project lead', '', '', ''],
  ]));
  return out.join('\n');
}
