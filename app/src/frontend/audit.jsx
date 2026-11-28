// Jira project page: the full traceability audit of the project.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  BarChart, Box, Button, CodeBlock, DynamicTable, EmptyState, Heading, Inline, Label, LineChart, Link, LoadingButton, Modal,
  Lozenge, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, ProgressBar, SectionMessage, SectionMessageAction, Select,
  Stack, StackBarChart, Strong, Tab, TabList, TabPanel, Tabs, Text, Textfield, useProductContext,
} from '@forge/react';
import {
  Asil, call, Failure, ItemLink, KeyList, Level, Loading, Result, Severity, SEVERITY_ORDER, Tile, TraceStatus, METHOD_NAME,
} from './common.jsx';

const SEVERITY_FILTER = [
  { label: 'All severities', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];
const LINK_TEXT = { verifies: 'verifies', 'verified-by': 'is verified by', derives: 'derives from' };
const RULE_LABEL = {
  'not-broken-down': 'Not broken down', 'orphan-requirement': 'Orphan requirement', 'not-verified': 'No test',
  'insufficient-verification': 'Weak for ASIL', 'failing-verification': 'Failing / not run', 'suspect-link': 'Suspect',
  'asil-downgrade': 'ASIL downgrade', 'missing-asil': 'No ASIL', 'orphan-test': 'Orphan test', 'broken-link': 'Broken link',
};

const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

// A change against the baseline; for gaps fewer is better, for coverage more is better.
function Delta({ value, suffix = '', fewerIsBetter = false }) {
  if (value === null || value === undefined) return null;
  const good = fewerIsBetter ? value < 0 : value > 0;
  const bad = fewerIsBetter ? value > 0 : value < 0;
  return <Lozenge appearance={good ? 'success' : bad ? 'removed' : 'default'}>{`${signed(value)}${suffix}`}</Lozenge>;
}

const sinceText = changes => `since ${changes.name || 'baseline'} (${new Date(changes.since).toLocaleDateString()})`;

function Summary({ data }) {
  const { summary, coverage, changes } = data;
  // Only a real change is shown on the gap tiles; the coverage tile always says what it is compared with.
  const gapDelta = s => (changes?.counts?.before ? summary.gaps[s] - (changes.counts.before[s] ?? 0) || null : null);
  return (
    <Inline space="space.150" shouldWrap>
      <Tile label="Verification coverage" value={`${coverage.percent ?? 0}%`}>
        <ProgressBar value={(coverage.percent ?? 0) / 100} appearance={coverage.percent === 100 ? 'success' : 'default'}
          ariaLabel="Verification coverage" />
        <Text size="small">{coverage.verified} of {coverage.total} verified</Text>
        {changes && (
          <Inline space="space.050" alignBlock="center">
            <Delta value={changes.coverage.delta} suffix=" pts" />
            <Text size="small" color="color.text.subtle">{sinceText(changes)}</Text>
          </Inline>
        )}
      </Tile>
      <Tile label="Requirements" value={summary.requirements} />
      <Tile label="Test cases" value={summary.tests} />
      {['high', 'medium', 'low'].map(s => (
        <Tile key={s} label={`${s[0].toUpperCase()}${s.slice(1)} gaps`} value={summary.gaps[s]}>
          <Inline space="space.050" alignBlock="center"><Severity value={s} /><Delta value={gapDelta(s)} fewerIsBetter /></Inline>
        </Tile>
      ))}
    </Inline>
  );
}

function GapsTab({ data }) {
  const [severity, setSeverity] = useState(SEVERITY_FILTER[0]);
  const gaps = data.gaps.filter(g => !severity.value || g.severity === severity.value);
  const link = k => <ItemLink itemKey={k} keyMap={data.keyMap} baseUrl={data.baseUrl} />;
  const byRule = new Map();
  for (const g of data.gaps) byRule.set(RULE_LABEL[g.rule] || g.rule, (byRule.get(RULE_LABEL[g.rule] || g.rule) || 0) + 1);
  const chart = [...byRule].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
  return (
    <Stack space="space.200">
      <Inline space="space.300" alignBlock="start" shouldWrap>
        {chart.length > 0 && (
          <BarChart data={chart} xAccessor="rule" yAccessor="count" title="Gaps by rule" width={560} height={260} />
        )}
        <Stack space="space.100">
          <Label labelFor="severity-filter">Show</Label>
          <Select inputId="severity-filter" options={SEVERITY_FILTER} value={severity} onChange={v => setSeverity(v || SEVERITY_FILTER[0])} />
        </Stack>
      </Inline>
      <DynamicTable
        caption={`${gaps.length} gap${gaps.length === 1 ? '' : 's'}`}
        head={{ cells: [
          { key: 'severity', content: 'Severity', isSortable: true },
          { key: 'item', content: 'Item', isSortable: true },
          { key: 'gap', content: 'Gap', isSortable: true },
          { key: 'detail', content: 'Detail' },
          { key: 'fix', content: 'How to fix' },
          { key: 'ref', content: 'Reference' },
        ] }}
        rows={gaps.map((g, n) => ({
          key: `gap-${n}`,
          cells: [
            { key: `${SEVERITY_ORDER[g.severity]}-${n}`, content: <Severity value={g.severity} /> },
            { key: g.key, content: link(g.key) },
            { key: g.title, content: g.title },
            { key: `d-${n}`, content: g.detail },
            { key: `f-${n}`, content: g.fix },
            { key: `r-${n}`, content: <Text size="small">{g.ref}</Text> },
          ],
        }))}
        rowsPerPage={20}
        emptyView={<Text>No gaps. Every requirement is traced and verified.</Text>}
      />
    </Stack>
  );
}

function MatrixTab({ data }) {
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  return (
    <DynamicTable
      caption="Traceability matrix"
      head={{ cells: [
        { key: 'req', content: 'Requirement', isSortable: true },
        { key: 'level', content: 'Level', isSortable: true },
        { key: 'asil', content: 'ASIL', isSortable: true },
        { key: 'parents', content: 'Derives from' },
        { key: 'children', content: 'Derived into' },
        { key: 'tests', content: 'Verified by' },
        { key: 'status', content: 'Status', isSortable: true },
      ] }}
      rows={data.matrix.map(r => ({
        key: r.key,
        cells: [
          { key: r.key, content: <Stack space="space.025"><ItemLink itemKey={r.key} {...props} /><Text size="small">{r.summary}</Text></Stack> },
          { key: r.level, content: <Level value={r.level} /> },
          { key: r.asil || 'none', content: <Asil value={r.asil} /> },
          { key: `p-${r.key}`, content: <KeyList keys={r.parents} {...props} /> },
          { key: `c-${r.key}`, content: <KeyList keys={r.children} {...props} /> },
          {
            key: `t-${r.key}`,
            content: r.tests.length ? (
              <Stack space="space.050">
                {r.tests.map(t => (
                  <Inline key={t.key} space="space.075" alignBlock="center">
                    <ItemLink itemKey={t.key} {...props} />
                    <Result value={t.result} />
                    <Text size="small">{METHOD_NAME[t.method] || t.method}</Text>
                  </Inline>
                ))}
              </Stack>
            ) : <Text color="color.text.subtlest">—</Text>,
          },
          { key: r.level === 'SG' ? 'vehicle' : r.allocation === 'hw' ? 'hardware' : r.verified ? 'verified' : 'open', content: <TraceStatus row={r} /> },
        ],
      }))}
      rowsPerPage={25}
    />
  );
}

function CoverageTab({ data }) {
  const rows = data.coverage.byAsil;
  const name = a => (a === 'none' ? 'not set' : a === 'QM' ? 'QM' : `ASIL ${a}`);
  const chart = rows.flatMap(g => [
    { asil: name(g.asil), state: 'verified', count: g.verified },
    { asil: name(g.asil), state: 'open', count: g.total - g.verified },
  ]);
  return (
    <Stack space="space.200">
      <Text>
        Coverage counts software-allocated system and software requirements. Safety goals are validated at vehicle level and
        hardware requirements are verified elsewhere, so they are left out. ASIL C and D need two passing tests, one of them fault
        injection or back-to-back (ISO 26262-6).
      </Text>
      <Inline space="space.150" shouldWrap>
        {rows.map(g => (
          <Tile key={g.asil} label={name(g.asil)} value={`${g.percent}%`}>
            <ProgressBar value={g.percent / 100} appearance={g.percent === 100 ? 'success' : 'default'} ariaLabel={`${name(g.asil)} coverage`} />
            <Text size="small">{g.verified} of {g.total} verified</Text>
          </Tile>
        ))}
      </Inline>
      {chart.length > 0 && (
        <StackBarChart data={chart} xAccessor="asil" yAccessor="count" colorAccessor="state" title="Requirements by ASIL" height={300} />
      )}
    </Stack>
  );
}

function SuggestionsTab({ data, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  const link = async (s, c) => {
    setBusy(`${s.from}>${c.key}`);
    setMessage(null);
    try {
      await call('createLink', { from: s.from, to: c.key, type: s.link });
      setMessage({ ok: true, text: `Linked ${s.from} ${LINK_TEXT[s.link]} ${c.key}.` });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };
  const rows = data.suggestions.flatMap(s => s.candidates.map((c, n) => ({ s, c, n })));
  return (
    <Stack space="space.200">
      <Text>
        TraceGuard compares the wording of requirements and test cases (TF-IDF, no data leaves your site). A suggestion is only a
        proposal: check it, then create the link.
      </Text>
      {message && <SectionMessage appearance={message.ok ? 'success' : 'error'}><Text>{message.text}</Text></SectionMessage>}
      <DynamicTable
        head={{ cells: [
          { key: 'item', content: 'Item' },
          { key: 'link', content: 'Proposed link' },
          { key: 'candidate', content: 'Candidate' },
          { key: 'score', content: 'Similarity', isSortable: true },
          { key: 'action', content: '' },
        ] }}
        rows={rows.map(({ s, c, n }) => ({
          key: `${s.from}-${s.link}-${c.key}`,
          cells: [
            { key: s.from, content: n === 0 ? <ItemLink itemKey={s.from} {...props} /> : '' },
            { key: s.link, content: LINK_TEXT[s.link] },
            { key: c.key, content: <ItemLink itemKey={c.key} {...props} /> },
            { key: c.score, content: c.score.toFixed(2) },
            {
              key: `a-${s.from}-${c.key}`,
              content: (
                <LoadingButton appearance={n === 0 ? 'primary' : 'default'} isLoading={busy === `${s.from}>${c.key}`}
                  isDisabled={Boolean(busy)} onClick={() => link(s, c)}>Link</LoadingButton>
              ),
            },
          ],
        }))}
        emptyView={<Text>No suggestions: every test verifies something and every software requirement is traced.</Text>}
      />
    </Stack>
  );
}

// Baseline: the audit as it stood at an assessment or release, and what changed since.
// The modal is separate from its button: UI Kit renders only its own components in props such as
// EmptyState primaryAction, so the button there must be a plain Button.
function BaselineModal({ open, replaces, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('saveBaseline', { name: name.trim() });
      onClose();
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalTransition>
      {open && (
        <Modal onClose={() => !busy && onClose()}>
          <ModalHeader><ModalTitle>Save this audit as the baseline?</ModalTitle></ModalHeader>
          <ModalBody>
            <Stack space="space.150">
              <Text>
                Later audits show what changed since now: coverage per ASIL, gaps closed and opened, requirements that became verified or
                lost their verification.{replaces ? ' The new baseline replaces the current one.' : ''}
              </Text>
              <Stack space="space.050">
                <Label labelFor="baseline-name">Name (optional)</Label>
                <Textfield id="baseline-name" name="baselineName" placeholder="ASPICE assessment, December" onChange={e => setName(e.target.value)} />
              </Stack>
              {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" isDisabled={busy} onClick={onClose}>Cancel</Button>
            <LoadingButton appearance="primary" isLoading={busy} onClick={save}>Save baseline</LoadingButton>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

function ChangesTab({ data, onChanged }) {
  const c = data.changes;
  const [open, setOpen] = useState(false);
  const modal = <BaselineModal open={open} replaces={Boolean(c)} onClose={() => setOpen(false)} onSaved={onChanged} />;
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  const link = k => <ItemLink itemKey={k} {...props} />;
  const name = a => (a === 'none' ? 'not set' : a === 'QM' ? 'QM' : `ASIL ${a}`);
  if (!c) {
    return (
      <>
        <EmptyState
          header="No baseline yet"
          description={'Save the audit as it stands at an assessment, a release or a sprint review. From then on TraceGuard shows '
            + 'what changed: coverage per ASIL, gaps closed and opened, and requirements that lost their verification.'}
          primaryAction={<Button appearance="primary" onClick={() => setOpen(true)}>Save baseline</Button>}
        />
        {modal}
      </>
    );
  }
  const verificationRows = [
    ...c.newlyVerified.map(k => ({ k, change: <Lozenge appearance="success">newly verified</Lozenge> })),
    ...c.noLongerVerified.map(k => ({ k, change: <Lozenge appearance="removed">no longer verified</Lozenge> })),
  ];
  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Heading size="medium">Since {c.name || 'the baseline'} of {new Date(c.since).toLocaleString()}</Heading>
        <Button onClick={() => setOpen(true)}>Save a new baseline</Button>
      </Inline>
      {modal}
      <Inline space="space.150" shouldWrap>
        <Tile label="Verification coverage" value={`${c.coverage.before ?? '—'}% → ${c.coverage.now ?? '—'}%`}>
          <Delta value={c.coverage.delta} suffix=" points" />
        </Tile>
        <Tile label="Gaps closed" value={c.closedGaps.length} />
        <Tile label="New gaps" value={c.newGaps.length} />
        <Tile label="Newly verified" value={c.newlyVerified.length} />
        <Tile label="No longer verified" value={c.noLongerVerified.length} />
      </Inline>
      {data.history.length > 1 && (
        <LineChart
          data={[...data.history.map(h => ({ when: `${new Date(h.at).toLocaleDateString()}${h.name ? ` ${h.name}` : ''}`, coverage: h.coverage ?? 0 })),
            { when: 'now', coverage: data.coverage.percent ?? 0 }]}
          xAccessor="when" yAccessor="coverage" title="Verification coverage at each baseline (%)" height={260}
        />
      )}
      {c.truncated && (
        <SectionMessage appearance="information">
          <Text>The baseline was too large to keep every gap, so some low-severity gaps may show as new.</Text>
        </SectionMessage>
      )}
      <DynamicTable
        caption="Coverage by ASIL"
        head={{ cells: [
          { key: 'asil', content: 'ASIL' }, { key: 'before', content: 'Baseline' }, { key: 'now', content: 'Now' }, { key: 'delta', content: 'Change' },
        ] }}
        rows={c.byAsil.map(r => ({
          key: r.asil,
          cells: [
            { key: r.asil, content: name(r.asil) },
            { key: `b-${r.asil}`, content: r.before === null ? '—' : `${r.before}% (${r.verifiedBefore} of ${r.totalBefore})` },
            { key: `n-${r.asil}`, content: r.now === null ? '—' : `${r.now}% (${r.verifiedNow} of ${r.totalNow})` },
            { key: `d-${r.asil}`, content: <Delta value={r.before === null || r.now === null ? null : r.now - r.before} suffix=" points" /> },
          ],
        }))}
      />
      <DynamicTable
        caption={`New gaps (${c.newGaps.length})`}
        head={{ cells: [{ key: 's', content: 'Severity' }, { key: 'i', content: 'Item' }, { key: 'g', content: 'Gap' }, { key: 'd', content: 'Detail' }] }}
        rows={c.newGaps.map((g, n) => ({
          key: `new-${n}`,
          cells: [
            { key: `s-${n}`, content: <Severity value={g.severity} /> },
            { key: `i-${n}`, content: link(g.key) },
            { key: `g-${n}`, content: g.title },
            { key: `d-${n}`, content: g.detail },
          ],
        }))}
        rowsPerPage={10}
        emptyView={<Text>No new gaps since the baseline.</Text>}
      />
      <DynamicTable
        caption={`Closed gaps (${c.closedGaps.length})`}
        head={{ cells: [{ key: 's', content: 'Was' }, { key: 'i', content: 'Item' }, { key: 'g', content: 'Gap' }] }}
        rows={c.closedGaps.map((g, n) => ({
          key: `closed-${n}`,
          cells: [
            { key: `s-${n}`, content: <Severity value={g.severity} /> },
            { key: `i-${n}`, content: link(g.key) },
            { key: `g-${n}`, content: `${RULE_LABEL[g.rule] || g.rule}${g.about && g.about.includes(':') ? ` (${g.about.split(':')[0]})` : ''}` },
          ],
        }))}
        rowsPerPage={10}
        emptyView={<Text>No gaps closed since the baseline yet.</Text>}
      />
      <DynamicTable
        caption="Verification status changes"
        head={{ cells: [{ key: 'i', content: 'Requirement' }, { key: 'c', content: 'Change' }] }}
        rows={verificationRows.map(r => ({ key: r.k, cells: [{ key: `i-${r.k}`, content: link(r.k) }, { key: `c-${r.k}`, content: r.change }] }))}
        emptyView={<Text>No requirement changed its verification status.</Text>}
      />
    </Stack>
  );
}

function ReportTab({ data }) {
  const [space, setSpace] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const publish = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, page: await call('publishReport', { spaceKey: space.trim() }) });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack space="space.200">
      <Text>
        Publish the audit as a Confluence page: coverage, every gap with its fix and standard reference, the full matrix with links
        back to Jira, and a sign-off table for the assessment.
      </Text>
      <Inline space="space.100" alignBlock="end" shouldWrap>
        <Stack space="space.050">
          <Label labelFor="space-key">Confluence space key</Label>
          <Textfield id="space-key" name="spaceKey" placeholder="ENG" onChange={e => setSpace(e.target.value)} />
        </Stack>
        <LoadingButton appearance="primary" isLoading={busy} isDisabled={!space.trim()} onClick={publish}>Publish to Confluence</LoadingButton>
      </Inline>
      {result?.ok && (
        <SectionMessage appearance="success" title="Audit report published">
          <Text>{result.page.url ? <Link href={result.page.url} openNewTab>{result.page.title}</Link> : result.page.title}</Text>
        </SectionMessage>
      )}
      {result && !result.ok && <SectionMessage appearance="error"><Text>{result.error}</Text></SectionMessage>}
      <Heading size="small">Markdown version</Heading>
      <CodeBlock text={data.report} language="text" shouldWrapLongLines />
    </Stack>
  );
}

// Loads the demo in bounded steps (a Forge call ends after 25 s); repeats until the server says done.
function useDemoLoader(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      // What earlier steps made travels with each call, because Jira search lags behind new issues.
      let state = { known: {}, linked: [], propertiesDone: false };
      for (let step = 0; step < 40; step += 1) {
        const s = await call('seedDemo', state);
        state = {
          known: s.known || state.known,
          linked: [...state.linked, ...(s.linkedNow || [])],
          propertiesDone: Boolean(s.propertiesDone || state.propertiesDone),
        };
        if (s.done) {
          onDone();
          return true;
        }
        setProgress(s.stage === 'issues' ? `Created ${s.created} of ${s.total} issues…`
          : s.stage === 'indexing' ? 'Waiting for Jira search to see the new issues…'
            : s.stage === 'links' ? `Linking: ${s.remaining} links to go…` : 'Storing trace attributes…');
        if (s.stage === 'indexing') await new Promise(resolve => setTimeout(resolve, 3000));
      }
      throw new Error('Loading did not finish.');
    } catch (e) {
      setError(`${e.message} Loading is safe to repeat: it only adds what is missing.`);
      return false;
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return { load, busy, error, progress };
}

function DemoLoader({ projectKey, onDone }) {
  const [open, setOpen] = useState(false);
  const { load, busy, error, progress } = useDemoLoader(() => { setOpen(false); onDone(); });
  return (
    <>
      <EmptyState
        header="No requirements or test cases here yet"
        description={'TraceGuard reads safety goals, system and software requirements and test cases from Jira. '
          + 'Map your own issue types, link types and fields in Project settings > TraceGuard, classify issues from the '
          + 'TraceGuard panel on an issue, label them (tg-swr, tg-test, asil-d), or load a demo project to see an audit right away.'}
        primaryAction={<Button appearance="primary" onClick={() => setOpen(true)}>Load the brake ECU demo</Button>}
      />
      <ModalTransition>
        {open && (
          <Modal onClose={() => !busy && setOpen(false)}>
            <ModalHeader><ModalTitle>Load the demo into {projectKey}?</ModalTitle></ModalHeader>
            <ModalBody>
              <Stack space="space.100">
                <Text>
                  TraceGuard will create 62 issues — 2 safety goals, 10 system requirements, 16 software requirements and 34 test
                  cases of an electronic brake control unit — and link them. Some gaps are left on purpose.
                </Text>
                <Text>It also adds the issue link types <Strong>Derives</Strong> and <Strong>Verifies</Strong> if you are a Jira admin.</Text>
                {progress && <Text color="color.text.subtle">{progress}</Text>}
                {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" isDisabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <LoadingButton appearance="primary" isLoading={busy} onClick={load}>Create demo issues</LoadingButton>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </>
  );
}

function DemoIncomplete({ demo, onDone }) {
  const { load, busy, error, progress } = useDemoLoader(onDone);
  return (
    <SectionMessage appearance="warning" title="The demo is only partly loaded"
      actions={[<SectionMessageAction key="finish" onClick={busy ? undefined : load}>{busy ? 'Loading…' : 'Finish loading the demo'}</SectionMessageAction>]}>
      <Stack space="space.050">
        <Text>{demo.issues} of {demo.total} demo issues and {demo.links} of {demo.expectedLinks} links are in Jira.</Text>
        {progress && <Text color="color.text.subtle">{progress}</Text>}
        {error && <Text color="color.text.danger">{error}</Text>}
      </Stack>
    </SectionMessage>
  );
}

const App = () => {
  const context = useProductContext();
  const projectKey = context?.extension?.project?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await call('getProjectAudit'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (projectKey) load(); }, [projectKey]);

  if (error) return <Failure error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const empty = data.summary.requirements === 0 && data.summary.tests === 0;
  return (
    <Box padding="space.200">
      <Stack space="space.300">
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Stack space="space.050">
            <Heading size="large">Traceability audit — {data.project.name}</Heading>
            <Text size="small" color="color.text.subtle">
              ASPICE SYS.2 · SWE.1 · SWE.6 and ISO 26262 · {data.issueCount} issues read, {data.unclassified} not classified ·
              {data.configured ? ' project settings applied' : ' default settings'} · analysed {new Date(data.analysedAt).toLocaleString()}
            </Text>
          </Stack>
          <LoadingButton isLoading={loading} onClick={load}>Run audit again</LoadingButton>
        </Inline>
        {empty ? <DemoLoader projectKey={projectKey} onDone={load} /> : (
          <>
            {data.demo && !data.demo.complete && <DemoIncomplete demo={data.demo} onDone={load} />}
            <Summary data={data} />
            <Tabs id="traceguard-audit">
              <TabList>
                <Tab>Gaps ({data.gaps.length})</Tab>
                <Tab>Matrix</Tab>
                <Tab>ASIL coverage</Tab>
                <Tab>Suggested links ({data.suggestions.length})</Tab>
                <Tab>{data.changes ? `Changes (${data.changes.closedGaps.length} closed, ${data.changes.newGaps.length} new)` : 'Changes'}</Tab>
                <Tab>Audit report</Tab>
              </TabList>
              <TabPanel><Box paddingBlock="space.200"><GapsTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><MatrixTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><CoverageTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><SuggestionsTab data={data} onChanged={load} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><ChangesTab data={data} onChanged={load} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><ReportTab data={data} /></Box></TabPanel>
            </Tabs>
          </>
        )}
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
