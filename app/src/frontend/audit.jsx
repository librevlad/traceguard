// Jira project page: the full traceability audit of the project.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  BarChart, Box, Button, CodeBlock, DynamicTable, EmptyState, Heading, Inline, Label, Link, LoadingButton, Modal,
  ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, ProgressBar, SectionMessage, SectionMessageAction, Select, Stack,
  StackBarChart, Strong, Tab, TabList, TabPanel, Tabs, Text, Textfield, useProductContext,
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

function Summary({ data }) {
  const { summary, coverage } = data;
  return (
    <Inline space="space.150" shouldWrap>
      <Tile label="Verification coverage" value={`${coverage.percent ?? 0}%`}>
        <ProgressBar value={(coverage.percent ?? 0) / 100} appearance={coverage.percent === 100 ? 'success' : 'default'}
          ariaLabel="Verification coverage" />
        <Text size="small">{coverage.verified} of {coverage.total} verified</Text>
      </Tile>
      <Tile label="Requirements" value={summary.requirements} />
      <Tile label="Test cases" value={summary.tests} />
      <Tile label="High gaps" value={summary.gaps.high}><Severity value="high" /></Tile>
      <Tile label="Medium gaps" value={summary.gaps.medium}><Severity value="medium" /></Tile>
      <Tile label="Low gaps" value={summary.gaps.low}><Severity value="low" /></Tile>
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
          + 'Classify issues from the TraceGuard panel on an issue, label them (tg-swr, tg-test, asil-d), '
          + 'or load a demo project to see an audit right away.'}
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
              analysed {new Date(data.analysedAt).toLocaleString()}
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
                <Tab>Audit report</Tab>
              </TabList>
              <TabPanel><Box paddingBlock="space.200"><GapsTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><MatrixTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><CoverageTab data={data} /></Box></TabPanel>
              <TabPanel><Box paddingBlock="space.200"><SuggestionsTab data={data} onChanged={load} /></Box></TabPanel>
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
