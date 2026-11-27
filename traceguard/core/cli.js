// Local check of the core on the demo project:  node cli.js demo | node cli.js report
import { analyze, auditReport } from './src/index.js';
import { items, project } from '../demo/brake-ecu.js';

const cmd = process.argv[2] || 'demo';
const result = analyze(items);

if (cmd === 'report') {
  process.stdout.write(auditReport(result, { project: `${project.name} (${project.key})` }) + '\n');
} else {
  const { summary, coverage, gaps, suggestions } = result;
  console.log(`requirements ${summary.requirements}, tests ${summary.tests}, coverage ${summary.coverage}%`);
  console.log('by ASIL:', coverage.byAsil.map(g => `${g.asil} ${g.verified}/${g.total}`).join(', '));
  console.log(`gaps: high ${summary.gaps.high}, medium ${summary.gaps.medium}, low ${summary.gaps.low}`);
  for (const g of gaps) console.log(`  [${g.severity}] ${g.key} ${g.rule}: ${g.detail}`);
  console.log('suggestions:');
  for (const s of suggestions) console.log(`  ${s.from} ${s.link} -> ${s.candidates.map(c => `${c.key}:${c.score}`).join(' ')}`);
}
