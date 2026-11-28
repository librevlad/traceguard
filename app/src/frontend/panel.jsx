// Jira issue panel: where this requirement or test sits in the trace, and what is missing.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, ButtonGroup, Heading, Inline, Label, LoadingButton, SectionMessage, Select, Stack, Strong, Text,
  Textfield, useProductContext,
} from '@forge/react';
import { events } from '@forge/bridge';
import {
  Asil, call, Failure, GapMessage, ItemLink, Level, LEVEL_NAME, Loading, METHOD_NAME, Result, TraceStatus,
} from './common.jsx';

const LEVELS = ['SG', 'SYS', 'SWR', 'TEST'].map(v => ({ label: LEVEL_NAME[v], value: v }));
const ASILS = [{ label: 'not set', value: '' }, ...['QM', 'A', 'B', 'C', 'D'].map(v => ({ label: v === 'QM' ? 'QM' : `ASIL ${v}`, value: v }))];
const METHODS = Object.entries(METHOD_NAME).map(([value, label]) => ({ label, value }));
const ALLOCATIONS = [{ label: 'Software', value: 'sw' }, { label: 'Hardware', value: 'hw' }];
const LINK_TEXT = { verifies: 'verifies', 'verified-by': 'is verified by', derives: 'derives from' };
const find = (options, value) => options.find(o => o.value === value) || options[0];

function ClassifyForm({ initial, onSaved, onCancel }) {
  const [level, setLevel] = useState(find(LEVELS, initial?.level || 'SWR'));
  const [asil, setAsil] = useState(find(ASILS, initial?.asil || ''));
  const [method, setMethod] = useState(find(METHODS, initial?.method || 'requirements'));
  const [allocation, setAllocation] = useState(find(ALLOCATIONS, initial?.allocation || 'sw'));
  const [ref, setRef] = useState(initial?.ref || '');
  const [decomposition, setDecomposition] = useState(initial?.decomposition || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('classifyIssue', {
        level: level.value, asil: asil.value, method: method.value, allocation: allocation.value, ref, decomposition,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const isTest = level.value === 'TEST';
  return (
    <Stack space="space.150">
      <Inline space="space.150" shouldWrap>
        <Stack space="space.050">
          <Label labelFor="tg-level">Level</Label>
          <Select inputId="tg-level" options={LEVELS} value={level} onChange={v => setLevel(v || LEVELS[2])} />
        </Stack>
        {!isTest && (
          <Stack space="space.050">
            <Label labelFor="tg-asil">ASIL</Label>
            <Select inputId="tg-asil" options={ASILS} value={asil} onChange={v => setAsil(v || ASILS[0])} />
          </Stack>
        )}
        {isTest && (
          <Stack space="space.050">
            <Label labelFor="tg-method">Test method</Label>
            <Select inputId="tg-method" options={METHODS} value={method} onChange={v => setMethod(v || METHODS[0])} />
          </Stack>
        )}
        {level.value === 'SYS' && (
          <Stack space="space.050">
            <Label labelFor="tg-allocation">Allocated to</Label>
            <Select inputId="tg-allocation" options={ALLOCATIONS} value={allocation} onChange={v => setAllocation(v || ALLOCATIONS[0])} />
          </Stack>
        )}
        <Stack space="space.050">
          <Label labelFor="tg-ref">Requirement ID (optional)</Label>
          <Textfield id="tg-ref" name="ref" placeholder="SWR-3" defaultValue={initial?.ref || ''} onChange={e => setRef(e.target.value)} />
        </Stack>
        {!isTest && level.value !== 'SG' && (
          <Stack space="space.050">
            <Label labelFor="tg-decomposition">ASIL decomposition (optional)</Label>
            <Textfield id="tg-decomposition" name="decomposition" placeholder="B(D) + B(D)" defaultValue={initial?.decomposition || ''}
              onChange={e => setDecomposition(e.target.value)} />
          </Stack>
        )}
      </Inline>
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      <ButtonGroup>
        <LoadingButton appearance="primary" isLoading={busy} onClick={save}>Save</LoadingButton>
        {onCancel && <Button appearance="subtle" onClick={onCancel}>Cancel</Button>}
      </ButtonGroup>
    </Stack>
  );
}

function Linked({ title, rows, props, empty, render }) {
  return (
    <Stack space="space.075">
      <Text weight="semibold">{title}</Text>
      {rows.length ? rows.map(r => (
        <Inline key={r.key} space="space.100" alignBlock="center" shouldWrap>
          <ItemLink itemKey={r.key} {...props} />
          {render ? render(r) : <Asil value={r.asil} />}
          <Text size="small">{r.summary}</Text>
        </Inline>
      )) : <Text color="color.text.subtlest">{empty}</Text>}
    </Stack>
  );
}

function Suggestions({ view, props, onLinked }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const own = view.suggestions.flatMap(s => s.candidates.map(c => ({ from: s.from, to: c.key, type: s.link, score: c.score, shown: c.key })));
  const incoming = view.incoming.map(s => ({ from: s.from, to: view.item.key, type: s.link, score: s.score, shown: s.from }));
  // The same link can be proposed from both ends (requirement "verified-by" test, test "verifies" requirement).
  const canonical = s => (s.type === 'verified-by' ? `verifies:${s.to}>${s.from}` : `${s.type}:${s.from}>${s.to}`);
  const seen = new Set();
  const all = [...own, ...incoming]
    .map(s => (s.type === 'verified-by' ? { ...s, from: s.to, to: s.from, type: 'verifies' } : s))
    .sort((a, b) => b.score - a.score)
    .filter(s => (seen.has(canonical(s)) ? false : seen.add(canonical(s))))
    .slice(0, 4);
  if (!all.length) return null;
  const link = async s => {
    setBusy(`${s.from}>${s.to}`);
    setError(null);
    try {
      await call('createLink', { from: s.from, to: s.to, type: s.type });
      onLinked();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Stack space="space.075">
      <Text weight="semibold">Suggested links</Text>
      {all.map(s => (
        <Inline key={`${s.from}-${s.to}`} space="space.100" alignBlock="center" shouldWrap>
          <ItemLink itemKey={s.from} {...props} />
          <Text>{LINK_TEXT[s.type]}</Text>
          <ItemLink itemKey={s.to} {...props} />
          <Text size="small" color="color.text.subtle">similarity {s.score.toFixed(2)}</Text>
          <LoadingButton spacing="compact" isLoading={busy === `${s.from}>${s.to}`} isDisabled={Boolean(busy)} onClick={() => link(s)}>Link</LoadingButton>
        </Inline>
      ))}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
    </Stack>
  );
}

function TestResult({ item, onRecorded }) {
  const [busy, setBusy] = useState(null);
  const record = async result => {
    setBusy(result);
    try {
      await call('recordResult', { result });
      onRecorded();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Inline space="space.100" alignBlock="center" shouldWrap>
      <Text weight="semibold">Last result</Text>
      <Result value={item.result} />
      <Text size="small">{item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : 'never executed'}</Text>
      <LoadingButton spacing="compact" isLoading={busy === 'pass'} isDisabled={Boolean(busy)} onClick={() => record('pass')}>Record pass</LoadingButton>
      <LoadingButton spacing="compact" isLoading={busy === 'fail'} isDisabled={Boolean(busy)} onClick={() => record('fail')}>Record fail</LoadingButton>
    </Inline>
  );
}

function Trace({ data, reload }) {
  const [editing, setEditing] = useState(false);
  const { view } = data;
  const { item } = view;
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  const isTest = item.level === 'TEST';
  const v = view.verification;
  if (editing) {
    return <ClassifyForm initial={{ ...item, ref: item.key !== item.jiraKey ? item.key : '' }} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />;
  }
  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {item.key !== item.jiraKey && <Heading size="small">{item.key}</Heading>}
        <Level value={item.level} />
        {!isTest && <Asil value={view.effectiveAsil} />}
        {view.inheritedFrom && <Text size="small">inherited from {view.inheritedFrom}</Text>}
        {item.decomposition && <Text size="small">decomposed {item.decomposition}</Text>}
        {v?.scope === 'software' && <TraceStatus row={{ level: item.level, allocation: item.allocation, verified: v.verified }} />}
        {v && v.scope !== 'software' && <TraceStatus row={{ level: item.level, allocation: item.allocation }} />}
        <Button appearance="subtle" spacing="compact" onClick={() => setEditing(true)}>Edit</Button>
      </Inline>

      {view.chain.length > 0 && (
        <Inline space="space.075" alignBlock="center" shouldWrap>
          <Text weight="semibold">Trace to safety goal</Text>
          <Text>{item.key}</Text>
          {view.chain.map(c => (
            <Inline key={c.key} space="space.075" alignBlock="center"><Text>→</Text><ItemLink itemKey={c.key} {...props} /></Inline>
          ))}
        </Inline>
      )}

      {isTest ? (
        <>
          <TestResult item={item} onRecorded={reload} />
          <Linked title="Verifies" rows={view.verifies} props={props} empty="No requirement yet." />
          {view.broken.length > 0 && (
            <Text color="color.text.danger">Points to missing {view.broken.map(b => b.target).join(', ')}</Text>
          )}
        </>
      ) : (
        <>
          {item.level !== 'SG' && <Linked title="Derives from" rows={view.parents} props={props} empty="No parent requirement." />}
          {(item.level !== 'SWR' || view.children.length > 0) && (
            <Linked title="Derived into" rows={view.children} props={props}
              empty={item.allocation === 'hw' ? 'Allocated to hardware.' : 'Nothing derived yet.'} />
          )}
          {item.level !== 'SG' && (
            <Linked title="Verified by" rows={view.tests} props={props} empty="No test case."
              render={t => (
                <Inline space="space.075" alignBlock="center">
                  <Result value={t.result} />
                  <Text size="small">{METHOD_NAME[t.method] || t.method}</Text>
                </Inline>
              )} />
          )}
        </>
      )}

      {view.gaps.length > 0
        ? <Stack space="space.100">{view.gaps.map((g, n) => <GapMessage key={`${g.rule}-${n}`} gap={g} />)}</Stack>
        : <SectionMessage appearance="success" title="No traceability gaps"><Text>This item meets every TraceGuard rule.</Text></SectionMessage>}

      <Suggestions view={view} props={props} onLinked={reload} />
    </Stack>
  );
}

const App = () => {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    try {
      setData(await call('getIssueTrace'));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { if (issueKey) load(); }, [issueKey]);
  // Re-read the trace when the issue is edited, so a changed requirement shows its suspect tests at once.
  useEffect(() => {
    const subscription = events.on('JIRA_ISSUE_CHANGED', () => load());
    return () => { subscription.then(s => s.unsubscribe()).catch(() => {}); };
  }, []);

  if (error) return <Failure error={error} onRetry={load} />;
  if (!data) return <Loading label="Reading the trace…" />;
  if (!data.classified) {
    return (
      <Box padding="space.100">
        <Stack space="space.150">
          <Text>
            <Strong>{data.issueKey}</Strong> is not part of the trace model yet. Classify it as a safety goal, a requirement or a test
            case, and TraceGuard will check its links, ASIL and verification.
          </Text>
          <ClassifyForm onSaved={load} />
        </Stack>
      </Box>
    );
  }
  return <Box padding="space.100"><Trace data={data} reload={load} /></Box>;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
