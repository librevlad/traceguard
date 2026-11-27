// Confluence macro: a live traceability view of a Jira project, for specs, safety cases and audit pages.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  DynamicTable, Heading, Inline, Label, ProgressBar, Select, Stack, Text, Textfield, useConfig,
} from '@forge/react';
import {
  Asil, call, Failure, ItemLink, KeyList, Level, Loading, Result, Severity, SEVERITY_ORDER, Tile, TraceStatus,
} from './common.jsx';

const VIEWS = [
  { label: 'Traceability matrix', value: 'matrix' },
  { label: 'Gaps', value: 'gaps' },
  { label: 'ASIL coverage', value: 'coverage' },
];

const Config = () => (
  <>
    <Label labelFor="projectKey">Jira project key</Label>
    <Textfield id="projectKey" name="projectKey" placeholder="BRK" />
    <Label labelFor="view">Show</Label>
    <Select inputId="view" name="view" options={VIEWS} defaultValue={VIEWS[0]} />
  </>
);

const viewOf = config => {
  const v = config?.view;
  return (typeof v === 'object' ? v?.value : v) || 'matrix';
};

function Coverage({ data }) {
  const name = a => (a === 'none' ? 'not set' : a === 'QM' ? 'QM' : `ASIL ${a}`);
  return (
    <Inline space="space.150" shouldWrap>
      <Tile label="All software requirements" value={`${data.coverage.percent ?? 0}%`}>
        <ProgressBar value={(data.coverage.percent ?? 0) / 100} ariaLabel="Coverage" />
      </Tile>
      {data.coverage.byAsil.map(g => (
        <Tile key={g.asil} label={name(g.asil)} value={`${g.percent}%`}>
          <Text size="small">{g.verified} of {g.total} verified</Text>
        </Tile>
      ))}
    </Inline>
  );
}

function Gaps({ data }) {
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  return (
    <DynamicTable
      head={{ cells: [
        { key: 'severity', content: 'Severity', isSortable: true },
        { key: 'item', content: 'Item', isSortable: true },
        { key: 'gap', content: 'Gap' },
        { key: 'fix', content: 'How to fix' },
        { key: 'ref', content: 'Reference' },
      ] }}
      rows={data.gaps.map((g, n) => ({
        key: `g-${n}`,
        cells: [
          { key: `${SEVERITY_ORDER[g.severity]}-${n}`, content: <Severity value={g.severity} /> },
          { key: g.key, content: <ItemLink itemKey={g.key} {...props} /> },
          { key: `t-${n}`, content: <Stack space="space.025"><Text weight="semibold">{g.title}</Text><Text size="small">{g.detail}</Text></Stack> },
          { key: `f-${n}`, content: g.fix },
          { key: `r-${n}`, content: <Text size="small">{g.ref}</Text> },
        ],
      }))}
      rowsPerPage={20}
      emptyView={<Text>No gaps.</Text>}
    />
  );
}

function Matrix({ data }) {
  const props = { keyMap: data.keyMap, baseUrl: data.baseUrl };
  return (
    <DynamicTable
      head={{ cells: [
        { key: 'req', content: 'Requirement', isSortable: true },
        { key: 'level', content: 'Level' },
        { key: 'asil', content: 'ASIL', isSortable: true },
        { key: 'parents', content: 'Derives from' },
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
          {
            key: `t-${r.key}`,
            content: r.tests.length ? (
              <Stack space="space.050">
                {r.tests.map(t => (
                  <Inline key={t.key} space="space.075" alignBlock="center"><ItemLink itemKey={t.key} {...props} /><Result value={t.result} /></Inline>
                ))}
              </Stack>
            ) : <Text color="color.text.subtlest">—</Text>,
          },
          { key: r.level === 'SG' ? 'vehicle' : r.allocation === 'hw' ? 'hardware' : r.verified ? 'verified' : 'open', content: <TraceStatus row={r} /> },
        ],
      }))}
      rowsPerPage={30}
    />
  );
}

const App = () => {
  const config = useConfig();
  const projectKey = String(config?.projectKey || '').trim().toUpperCase();
  const view = viewOf(config);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    setData(null);
    try {
      setData(await call('getProjectAudit', { projectKey }));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { if (projectKey) load(); }, [projectKey]);

  if (!projectKey) return <Text>Edit this macro and enter the key of the Jira project to trace, for example BRK.</Text>;
  if (error) return <Failure error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const title = VIEWS.find(v => v.value === view)?.label || VIEWS[0].label;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Heading size="small">{title} — {data.project.name} ({data.project.key})</Heading>
        <Text size="small" color="color.text.subtle">
          coverage {data.coverage.percent ?? 0}% · {data.summary.gaps.high} high, {data.summary.gaps.medium} medium,{' '}
          {data.summary.gaps.low} low gaps · live from Jira, {new Date(data.analysedAt).toLocaleString()}
        </Text>
      </Inline>
      {view === 'gaps' && <Gaps data={data} />}
      {view === 'coverage' && <Coverage data={data} />}
      {view === 'matrix' && <Matrix data={data} />}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
ForgeReconciler.addConfig(<Config />);
