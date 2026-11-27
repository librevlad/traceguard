import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, auditReport } from '../src/index.js';
import { items, project } from '../../demo/brake-ecu.js';

const result = analyze(items);
const has = (key, rule) => result.gaps.some(g => g.key === key && g.rule === rule);

test('every planted gap of the demo project is found', () => {
  const planted = [
    ['SYS-9', 'not-broken-down'], ['SWR-3', 'insufficient-verification'], ['SWR-4', 'asil-downgrade'],
    ['SWR-6', 'failing-verification'], ['SWR-8', 'failing-verification'], ['SWR-9', 'not-verified'],
    ['SWR-12', 'not-verified'], ['SWR-14', 'orphan-requirement'], ['SWR-15', 'missing-asil'],
    ['SWR-16', 'suspect-link'], ['TC-21', 'orphan-test'], ['TC-22', 'orphan-test'], ['TC-23', 'broken-link'],
  ];
  for (const [key, rule] of planted) assert.ok(has(key, rule), `${key} ${rule}`);
});

test('clean and hardware-allocated items raise no gaps', () => {
  for (const key of ['SWR-1', 'SWR-2', 'SWR-5', 'SWR-7', 'SYS-1', 'SYS-2', 'SYS-8']) {
    assert.ok(!result.gaps.some(g => g.key === key), key);
  }
});

test('orphan tests get the right requirement as the top suggestion', () => {
  const top = from => result.suggestions.find(s => s.from === from)?.candidates[0]?.key;
  assert.equal(top('TC-21'), 'SWR-9');
  assert.equal(top('TC-22'), 'SWR-12');
});

test('coverage excludes safety goals and hardware-allocated requirements', () => {
  const swReqs = items.filter(i => (i.level === 'SYS' || i.level === 'SWR') && i.allocation !== 'hw');
  assert.equal(result.coverage.total, swReqs.length);
  assert.ok(result.coverage.percent > 0 && result.coverage.percent < 100);
});

test('audit report lists coverage, every gap and the suggestions', () => {
  const md = auditReport(result, { project: project.name, date: '2026-11-27' });
  assert.match(md, /# Traceability audit — Electronic brake control unit/);
  assert.match(md, /\| D \| \d+ \| \d+ \| \d+% \|/);
  for (const g of result.gaps) assert.ok(md.includes(`| ${g.key} | ${g.title} |`), g.key);
  assert.match(md, /TC-21 — verifies: SWR-9/);
});
