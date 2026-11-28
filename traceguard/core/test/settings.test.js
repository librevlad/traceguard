import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeBaseline, compareBaseline, changesLine, auditReport, auditStorage } from '../src/index.js';
import {
  issuesToItems, normalizeConfig, parseAsil, searchFields, guessLevel, guessLinkType, SEARCH_FIELDS,
} from '../src/jira.js';
import { items as demo } from '../../demo/brake-ecu.js';

// A project the way many teams already run it: their own issue types, a "Tests" link type,
// a select field for ASIL, a text field for the DOORS id, a test type field and a result field.
const CONFIG = {
  levels: { 10001: 'SYS', 10002: 'SWR', 10003: 'TEST', 10004: 'none' },
  links: { Relates: 'derives', 'Test Coverage': 'verifies' },
  fields: { asil: 'customfield_10050', ref: 'customfield_10051', method: 'customfield_10052', result: 'customfield_10053' },
};
const type = id => ({ id: String(id), name: { 10001: 'Feature', 10002: 'Story', 10003: 'Check', 10004: 'Bug' }[id] });
const relates = { name: 'Relates', outward: 'relates to', inward: 'relates to' };
const coverage = { name: 'Test Coverage', outward: 'covers', inward: 'is covered by' };

function teamProject() {
  return [
    { key: 'ACC-1', fields: { summary: 'Keep distance to the vehicle ahead', issuetype: type(10001),
      customfield_10050: { value: 'ASIL C' }, customfield_10051: 'DOORS-101' } },
    { key: 'ACC-2', fields: { summary: 'Compute the target gap from speed', issuetype: type(10002),
      customfield_10050: { value: 'ASIL B(C)' }, customfield_10051: 'DOORS-205',
      issuelinks: [{ type: relates, outwardIssue: { key: 'ACC-1' } }] } },
    { key: 'ACC-3', fields: { summary: 'Gap at 100 km/h', issuetype: type(10003),
      customfield_10052: { value: 'Fault injection' }, customfield_10053: { value: 'Failed' },
      issuelinks: [{ type: coverage, outwardIssue: { key: 'ACC-2' } }] },
    changelog: { histories: [{ created: '2026-11-20T09:00:00.000+0000', items: [{ field: 'Result', fieldId: 'customfield_10053' }] }] } },
    { key: 'ACC-4', fields: { summary: 'Radar ghost target', issuetype: type(10004) } },
  ];
}

test('project settings map issue types, link types and custom fields', () => {
  const { items, keyMap, unclassified } = issuesToItems(teamProject(), CONFIG);
  assert.equal(unclassified, 1, 'the Bug type is set to "not traced"');
  const byKey = Object.fromEntries(items.map(i => [i.key, i]));
  assert.deepEqual(Object.keys(byKey).sort(), ['ACC-3', 'DOORS-101', 'DOORS-205']);
  assert.equal(keyMap['DOORS-205'], 'ACC-2');
  assert.deepEqual([byKey['DOORS-101'].level, byKey['DOORS-101'].asil], ['SYS', 'C']);
  const swr = byKey['DOORS-205'];
  assert.deepEqual([swr.level, swr.asil, swr.decomposition], ['SWR', 'B', 'B(C)']);
  assert.deepEqual(swr.links, [{ type: 'derives', target: 'DOORS-101' }], 'Relates is set to mean derives');
  const tc = byKey['ACC-3'];
  assert.deepEqual([tc.method, tc.result, tc.lastRunAt], ['fault-injection', 'fail', '2026-11-20T09:00:00.000Z']);
  assert.deepEqual(tc.links, [{ type: 'verifies', target: 'DOORS-205' }]);
  const result = analyze(items);
  assert.ok(result.gaps.some(g => g.key === 'DOORS-205' && g.rule === 'failing-verification'));
  assert.ok(!result.gaps.some(g => g.rule === 'asil-downgrade'), 'B(C) documents the decomposition');
});

test('without settings the same project falls back to wording and names', () => {
  const { items, unclassified } = issuesToItems(teamProject());
  assert.equal(items.length, 0, 'Feature, Story and Check are not requirement or test names');
  assert.equal(unclassified, 4);
});

test('settings are cleaned before use', () => {
  const config = normalizeConfig({
    levels: { 10001: 'swr', abc: 'SG', 10002: 'nonsense', 10003: 'none' },
    links: { Blocks: 'blocks', Tests: 'verifies' },
    fields: { asil: 'customfield_10050', ref: 'summary', method: 'customfield_1; drop', extra: 'customfield_1' },
    other: true,
  });
  assert.deepEqual(config, {
    levels: { 10001: 'SWR', 10003: 'none' }, links: { Tests: 'verifies' }, fields: { asil: 'customfield_10050' },
  });
  assert.deepEqual(normalizeConfig(null), { levels: {}, links: {}, fields: {} });
  assert.deepEqual(searchFields(CONFIG).slice(SEARCH_FIELDS.length),
    ['customfield_10050', 'customfield_10051', 'customfield_10052', 'customfield_10053']);
});

test('ASIL notation, level and link guesses', () => {
  assert.deepEqual(parseAsil('ASIL B(D)'), { asil: 'B', decomposition: 'B(D)' });
  assert.deepEqual(parseAsil('asil-d'), { asil: 'D' });
  assert.deepEqual(parseAsil('QM(B)'), { asil: 'QM', decomposition: 'QM(B)' });
  assert.equal(parseAsil('high'), null);
  assert.equal(guessLevel('Software Requirement'), 'SWR');
  assert.equal(guessLevel('Story'), null);
  assert.equal(guessLinkType({ name: 'Test', outward: 'tests', inward: 'is tested by' }), 'verifies');
  assert.equal(guessLinkType({ name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }), null);
});

// The demo after a week of work: SWR-9 got its tests, SWR-12 got one, and TC-5 of SWR-3 now fails.
function weekLater() {
  const items = demo.map(i => ({ ...i, links: [...(i.links || [])] }));
  const add = (key, target, method) => items.push({ key, level: 'TEST', method, result: 'pass', lastRunAt: '2026-11-25T10:00:00Z',
    summary: `Test for ${target}`, links: [{ type: 'verifies', target }] });
  add('TC-40', 'SWR-9', 'requirements');
  add('TC-41', 'SWR-9', 'fault-injection');
  add('TC-42', 'SWR-12', 'requirements');
  const tc5 = items.find(i => i.key === 'TC-5');
  tc5.result = 'fail';
  return items;
}

test('a baseline shows what changed since the last assessment', () => {
  const then = analyze(demo);
  const base = makeBaseline(then, { at: '2026-11-20T10:00:00.000Z', by: 'acc-1', name: 'Assessment 1' });
  assert.equal(base.gaps.length, then.gaps.length);
  assert.ok(JSON.stringify(base).length < 30000);

  const same = compareBaseline(base, then);
  assert.deepEqual([same.newGaps.length, same.closedGaps.length, same.coverage.delta], [0, 0, 0]);

  const now = analyze(weekLater());
  const changes = compareBaseline(base, now);
  assert.equal(changes.name, 'Assessment 1');
  assert.ok(changes.coverage.delta > 0, 'two requirements became verified');
  assert.deepEqual(changes.newlyVerified.sort(), ['SWR-12', 'SWR-9']);
  assert.ok(changes.closedGaps.some(g => g.key === 'SWR-9' && g.rule === 'not-verified' && g.severity === 'high'));
  assert.ok(changes.newGaps.some(g => g.key === 'SWR-3' && g.rule === 'failing-verification' && g.about === 'TC-5:fail'));
  assert.equal(changes.counts.before.high, then.summary.gaps.high);
  assert.match(changesLine(changes), /^coverage \d+% → \d+% \(\+\d+ points\), \d+ gaps closed, \d+ new/);

  const md = auditReport(now, { project: 'BRK', changes });
  assert.match(md, /## Changes since the baseline/);
  const page = auditStorage(now, { project: 'BRK', changes });
  assert.match(page, /Changes since the baseline/);
  assert.match(page, /CLOSED/);
  assert.equal(compareBaseline(null, now), null);
});

test('a baseline of a very large project stays inside its size limit', () => {
  const items = [];
  for (let n = 1; n <= 1500; n += 1) items.push({ key: `REQ-${n}`, level: 'SWR', asil: 'C', summary: `Requirement ${n}`, links: [] });
  const base = makeBaseline(analyze(items, { suggest: { limit: 0 } }));
  assert.ok(JSON.stringify(base).length <= 30000);
  assert.equal(base.truncated, true);
});
