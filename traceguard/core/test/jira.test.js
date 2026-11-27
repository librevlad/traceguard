import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, auditStorage, itemView } from '../src/index.js';
import { issuesToItems, demoIssues, labelUpdates, linkSemantics, LINK_TYPES, PROPERTY_KEY } from '../src/jira.js';
import { items as demo } from '../../demo/brake-ecu.js';

// What Jira returns after the demo is seeded: BRK-n keys, the property, labels and links on both ends.
// Every fifth link is created the wrong way round to prove that orientation by level fixes it.
function seededIssues() {
  const plan = demoIssues(demo);
  const jiraKey = new Map(plan.map((p, n) => [p.ref, `BRK-${n + 1}`]));
  const issues = plan.map(p => ({
    key: jiraKey.get(p.ref),
    fields: { summary: p.summary, labels: p.labels, issuetype: { name: 'Task' }, status: { name: 'To Do' },
      created: '2026-11-27T10:00:00.000+0000', issuelinks: [] },
    properties: { [PROPERTY_KEY]: p.property },
  }));
  const byKey = new Map(issues.map(i => [i.key, i]));
  let n = 0;
  for (const p of plan) {
    for (const l of p.links) {
      const type = LINK_TYPES[l.type];
      let [src, dst] = [jiraKey.get(p.ref), jiraKey.get(l.target)];
      if (++n % 5 === 0) [src, dst] = [dst, src];
      byKey.get(src).fields.issuelinks.push({ type, outwardIssue: { key: dst } });
      byKey.get(dst).fields.issuelinks.push({ type, inwardIssue: { key: src } });
    }
  }
  return issues;
}

const signature = r => r.gaps.map(g => `${g.key}:${g.rule}:${g.severity}`).sort();

test('seeding the demo into Jira and reading it back gives the same audit', () => {
  const { items, keyMap, unclassified } = issuesToItems(seededIssues());
  assert.equal(unclassified, 0);
  assert.equal(items.length, demo.length);
  assert.equal(keyMap['SWR-3'], 'BRK-15');
  const fromJira = analyze(items);
  const original = analyze(demo);
  assert.deepEqual(signature(fromJira), signature(original));
  assert.deepEqual(fromJira.coverage, original.coverage);
  assert.equal(items.find(i => i.key === 'SWR-3').summary, demo.find(i => i.key === 'SWR-3').summary);
});

test('labels, issue types and test status classify issues without the property', () => {
  const issues = [
    { key: 'P-1', fields: { summary: 'Goal', issuetype: { name: 'Safety Goal' }, labels: ['ASIL-D'] } },
    { key: 'P-2', fields: { summary: 'Sys', issuetype: { name: 'Task' }, labels: ['tg-sys', 'asil_c'],
      issuelinks: [{ type: { name: 'Relates', outward: 'relates to', inward: 'relates to' }, outwardIssue: { key: 'P-1' } }] } },
    { key: 'P-3', fields: { summary: 'Check', issuetype: { name: 'Test' }, status: { name: 'Passed' },
      statuscategorychangedate: '2026-11-01T08:00:00.000+0000', parent: { key: 'P-2' } } },
    { key: 'P-4', fields: { summary: 'Plain task', issuetype: { name: 'Task' } } },
  ];
  const { items, unclassified } = issuesToItems(issues);
  assert.equal(unclassified, 1);
  const [sg, sys, tc] = items;
  assert.deepEqual([sg.level, sg.asil, sys.level, sys.asil, tc.level], ['SG', 'D', 'SYS', 'C', 'TEST']);
  assert.deepEqual(sys.links, [], '"relates to" carries no trace meaning');
  assert.deepEqual(tc.links, [{ type: 'verifies', target: 'P-2' }], 'a test under a requirement verifies it');
  assert.equal(tc.result, 'pass');
  assert.equal(tc.lastRunAt, '2026-11-01T08:00:00.000Z');
});

test('Xray-style wording and reversed links are understood', () => {
  assert.deepEqual(linkSemantics('Is Tested By'), { type: 'verifies', active: false });
  assert.deepEqual(linkSemantics('implements'), { type: 'derives', active: true });
  assert.equal(linkSemantics('blocks'), null);
  const issues = [
    { key: 'A-1', fields: { summary: 'req', labels: ['tg-swr'],
      issuelinks: [{ type: { name: 'Test', outward: 'tests', inward: 'is tested by' }, inwardIssue: { key: 'A-2' } }] } },
    { key: 'A-2', fields: { summary: 'tc', labels: ['tg-test'] } },
    { key: 'A-3', fields: { summary: 'sys', labels: ['tg-sys'],
      issuelinks: [{ type: LINK_TYPES.derives, outwardIssue: { key: 'A-1' } }] } },
  ];
  const { items } = issuesToItems(issues);
  const get = k => items.find(i => i.key === k);
  assert.deepEqual(get('A-2').links, [{ type: 'verifies', target: 'A-1' }]);
  assert.deepEqual(get('A-1').links, [{ type: 'derives', target: 'A-3' }], 'SYS "derives from" SWR is turned round');
});

test('a reference to a missing requirement becomes a broken link', () => {
  const issues = [
    { key: 'B-1', fields: { summary: 'req', labels: ['tg-sys'] } },
    { key: 'B-2', fields: { summary: 'tc', labels: ['tg-test'] },
      properties: { [PROPERTY_KEY]: { links: [{ type: 'verifies', target: 'DOORS-4711' }] } } },
  ];
  const gaps = analyze(issuesToItems(issues).items).gaps.filter(g => g.key === 'B-2');
  assert.deepEqual(gaps.map(g => g.rule), ['broken-link']);
});

test('duplicate refs fall back to Jira keys', () => {
  const issues = ['C-1', 'C-2'].map(key => ({ key, fields: { summary: 's' }, properties: { [PROPERTY_KEY]: { ref: 'SWR-1', level: 'SWR' } } }));
  assert.deepEqual(issuesToItems(issues).items.map(i => i.key), ['C-1', 'C-2']);
});

test('editing a requirement text after its tests ran makes the link suspect', () => {
  const base = seededIssues();
  const swr2 = base.find(i => i.properties[PROPERTY_KEY].ref === 'SWR-2');
  swr2.changelog = { histories: [{ created: '2026-11-26T12:00:00.000+0000', items: [{ field: 'description' }] }] };
  const { items } = issuesToItems(base);
  const gaps = analyze(items).gaps.filter(g => g.key === 'SWR-2');
  assert.deepEqual(gaps.map(g => g.rule), ['suspect-link']);
});

test('label updates follow the property', () => {
  assert.deepEqual(labelUpdates(['traceguard', 'tg-swr', 'asil-d'], { level: 'SWR', asil: 'C' }),
    [{ remove: 'asil-d' }, { add: 'asil-c' }]);
  assert.deepEqual(labelUpdates([], { level: 'TEST' }), [{ add: 'tg-test' }]);
});

test('the Confluence report links items, shows status lozenges and escapes text', () => {
  const items = demo.map(i => (i.key === 'SWR-12' ? { ...i, summary: 'Use <b> & "quotes"' } : i));
  const html = auditStorage(analyze(items), { project: 'BRK', date: '2026-11-27', link: k => `https://x.atlassian.net/browse/${k}` });
  assert.match(html, /<a href="https:\/\/x\.atlassian\.net\/browse\/SWR-3">SWR-3<\/a>/);
  assert.match(html, /ac:name="status"/);
  assert.match(html, /Use &lt;b&gt; &amp; &quot;quotes&quot;/);
  assert.ok(!html.includes('<b>'));
});

test('item view explains the chain, the inherited ASIL and incoming suggestions', () => {
  const result = analyze(demo);
  const swr15 = itemView(demo, result, 'SWR-15');
  assert.equal(swr15.item.asil, null);
  assert.equal(swr15.effectiveAsil, swr15.chain.find(a => a.key === swr15.inheritedFrom).asil);
  assert.ok(swr15.gaps.some(g => g.rule === 'missing-asil'));
  const swr9 = itemView(demo, result, 'SWR-9');
  assert.equal(swr9.verification.verified, false);
  assert.equal(swr9.incoming[0].from, 'TC-21');
  const tc23 = itemView(demo, result, 'TC-23');
  assert.deepEqual(tc23.broken, [{ type: 'verifies', target: 'SWR-99' }]);
  assert.equal(itemView(demo, result, 'SYS-8').verification.scope, 'hardware');
});
