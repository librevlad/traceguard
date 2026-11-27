import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/index.js';

const req = (key, level, asil, parent, extra = {}) => ({
  key, level, asil, summary: `${key} summary`, updated: '2026-10-01T00:00:00Z',
  links: parent ? [{ type: 'derives', target: parent }] : [], ...extra,
});
const tc = (key, target, method = 'requirements', result = 'pass', lastRunAt = '2026-11-01T00:00:00Z') => ({
  key, level: 'TEST', method, result, lastRunAt, summary: `${key} summary`,
  links: target ? [{ type: 'verifies', target }] : [],
});
const rulesOf = (items, key) => analyze(items).gaps.filter(g => g.key === key).map(g => g.rule).sort();

test('a fully traced ASIL D chain has no gaps and counts as verified', () => {
  const items = [
    req('SG-1', 'SG', 'D'), req('SYS-1', 'SYS', 'D', 'SG-1'), req('SWR-1', 'SWR', 'D', 'SYS-1'),
    tc('TC-1', 'SWR-1'), tc('TC-2', 'SWR-1', 'fault-injection'),
    tc('TC-3', 'SYS-1'), tc('TC-4', 'SYS-1', 'back-to-back'),
  ];
  const r = analyze(items);
  assert.deepEqual(r.gaps, []);
  assert.equal(r.coverage.percent, 100);
});

test('system requirement without software requirement is reported unless allocated to hardware', () => {
  const items = [req('SYS-1', 'SYS', 'C'), req('SYS-2', 'SYS', 'C', null, { allocation: 'hw' })];
  assert.ok(rulesOf(items, 'SYS-1').includes('not-broken-down'));
  assert.deepEqual(rulesOf(items, 'SYS-2'), []);
});

test('software requirement without parent is an orphan', () => {
  const items = [req('SWR-1', 'SWR', 'QM'), tc('TC-1', 'SWR-1')];
  assert.deepEqual(rulesOf(items, 'SWR-1'), ['orphan-requirement']);
});

test('ASIL C requirement needs two tests and a robust method', () => {
  const items = [req('SYS-1', 'SYS', 'C'), req('SWR-1', 'SWR', 'C', 'SYS-1'), tc('TC-1', 'SWR-1'), tc('TC-9', 'SYS-1'), tc('TC-8', 'SYS-1', 'fault-injection')];
  const gaps = analyze(items).gaps.filter(g => g.key === 'SWR-1');
  assert.equal(gaps.length, 2);
  assert.ok(gaps.every(g => g.rule === 'insufficient-verification' && g.severity === 'high'));
});

test('QM requirement is fine with a single requirements-based test', () => {
  const items = [req('SYS-1', 'SYS', 'QM'), req('SWR-1', 'SWR', 'QM', 'SYS-1'), tc('TC-1', 'SWR-1'), tc('TC-2', 'SYS-1')];
  assert.deepEqual(analyze(items).gaps, []);
});

test('failing and never-run tests are reported per test', () => {
  const items = [
    req('SYS-1', 'SYS', 'QM'), req('SWR-1', 'SWR', 'QM', 'SYS-1'), tc('TC-0', 'SYS-1'),
    tc('TC-1', 'SWR-1', 'requirements', 'fail'), tc('TC-2', 'SWR-1', 'requirements', 'none'),
  ];
  const gaps = analyze(items).gaps.filter(g => g.key === 'SWR-1');
  assert.deepEqual(gaps.map(g => g.title).sort(), ['Failing test', 'Test never executed']);
  assert.equal(analyze(items).matrix.find(m => m.key === 'SWR-1').verified, false);
});

test('requirement edited after its tests ran is suspect, once per requirement', () => {
  const items = [
    req('SYS-1', 'SYS', 'QM'), tc('TC-0', 'SYS-1'),
    req('SWR-1', 'SWR', 'QM', 'SYS-1', { updated: '2026-11-20T00:00:00Z' }),
    tc('TC-1', 'SWR-1', 'requirements', 'pass', '2026-11-10T00:00:00Z'),
    tc('TC-2', 'SWR-1', 'requirements', 'pass', '2026-11-12T00:00:00Z'),
  ];
  const gaps = analyze(items).gaps.filter(g => g.rule === 'suspect-link');
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].detail, /TC-1, TC-2/);
});

test('ASIL downgrade without decomposition is high, with decomposition it is accepted', () => {
  const base = [req('SYS-1', 'SYS', 'D'), tc('TC-a', 'SYS-1'), tc('TC-b', 'SYS-1', 'fault-injection')];
  const down = [...base, req('SWR-1', 'SWR', 'B', 'SYS-1'), tc('TC-1', 'SWR-1')];
  const decomposed = [...base, req('SWR-1', 'SWR', 'B', 'SYS-1', { decomposition: 'B(D)+B(D)' }), tc('TC-1', 'SWR-1')];
  assert.ok(rulesOf(down, 'SWR-1').includes('asil-downgrade'));
  assert.ok(!rulesOf(decomposed, 'SWR-1').includes('asil-downgrade'));
});

test('missing ASIL is reported only below a safety goal, and the inherited ASIL is applied', () => {
  const items = [
    req('SG-1', 'SG', 'C'), req('SYS-1', 'SYS', 'C', 'SG-1'), req('SWR-1', 'SWR', undefined, 'SYS-1'),
    req('SYS-2', 'SYS', undefined), req('SWR-2', 'SWR', undefined, 'SYS-2'),
    tc('TC-1', 'SWR-1'), tc('TC-2', 'SWR-2'), tc('TC-3', 'SYS-1'), tc('TC-4', 'SYS-1', 'fault-injection'), tc('TC-5', 'SYS-2'),
  ];
  const r1 = rulesOf(items, 'SWR-1');
  assert.ok(r1.includes('missing-asil'));
  assert.ok(r1.includes('insufficient-verification'), 'inherited ASIL C needs deep verification');
  assert.deepEqual(rulesOf(items, 'SWR-2'), []);
});

test('orphan test and broken link are reported once each', () => {
  const items = [req('SYS-1', 'SYS', 'QM'), tc('TC-0', 'SYS-1'), tc('TC-1', null), tc('TC-2', 'SWR-404')];
  assert.deepEqual(rulesOf(items, 'TC-1'), ['orphan-test']);
  assert.deepEqual(rulesOf(items, 'TC-2'), ['broken-link']);
});

test('gaps are sorted by severity, then by key in natural order', () => {
  const items = [req('SWR-10', 'SWR', 'QM'), req('SWR-2', 'SWR', 'QM'), req('SYS-1', 'SYS', 'D')];
  const g = analyze(items).gaps;
  const sev = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < g.length; i++) assert.ok(sev[g[i - 1].severity] <= sev[g[i].severity]);
  const mediumKeys = g.filter(x => x.severity === 'medium').map(x => x.key);
  assert.ok(mediumKeys.indexOf('SWR-2') < mediumKeys.indexOf('SWR-10'));
});
