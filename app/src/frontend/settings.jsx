// Jira project settings page: how TraceGuard reads this project — which issue types are which level,
// which link types trace and verify, and which custom fields hold the ASIL, the requirement ID and test results.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, DynamicTable, Heading, Inline, Label, LoadingButton, SectionMessage, Select, Stack, Text, useProductContext,
} from '@forge/react';
import { call, Failure, LEVEL_NAME, Loading, Tile } from './common.jsx';

const LEVEL_OPTIONS = [
  { label: 'Not traced', value: 'none' },
  ...['SG', 'SYS', 'SWR', 'TEST'].map(v => ({ label: LEVEL_NAME[v], value: v })),
];
const LINK_OPTIONS = [
  { label: 'Not a trace link', value: 'none' },
  { label: 'Derives: requirement to its parent', value: 'derives' },
  { label: 'Verifies: test to its requirement', value: 'verifies' },
];
const ROLES = [
  { role: 'asil', label: 'ASIL', hint: 'Select or text field with values such as "ASIL D", "D", or "B(D)" for an ASIL decomposition.' },
  { role: 'ref', label: 'Requirement ID', hint: 'For example a DOORS or Polarion ID. TraceGuard shows it instead of the Jira key.' },
  {
    role: 'method', label: 'Test method',
    hint: 'Values that mention fault injection, back-to-back or review; anything else counts as requirements-based.',
  },
  { role: 'result', label: 'Test result', hint: 'Values that mention pass or fail. The time of the last change counts as the test run.' },
];
const pick = (options, value) => options.find(o => o.value === value) || options[0];

function Preview({ data }) {
  const { levels } = data;
  return (
    <Stack space="space.100">
      <Heading size="small">With these settings</Heading>
      <Inline space="space.150" shouldWrap>
        <Tile label="Safety goals" value={levels.SG} />
        <Tile label="System requirements" value={levels.SYS} />
        <Tile label="Software requirements" value={levels.SWR} />
        <Tile label="Test cases" value={levels.TEST} />
        <Tile label="Trace links" value={data.links} />
        <Tile label="Verification coverage" value={`${data.coverage ?? 0}%`} />
      </Inline>
      <Text size="small" color="color.text.subtle">
        {data.issueCount - data.unclassified} of {data.issueCount} issues are part of the trace model; gaps: {data.gaps.high} high,
        {' '}{data.gaps.medium} medium, {data.gaps.low} low.
      </Text>
    </Stack>
  );
}

const App = () => {
  const context = useProductContext();
  const projectKey = context?.extension?.project?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [levels, setLevels] = useState({});
  const [links, setLinks] = useState({});
  const [fields, setFields] = useState({});
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const d = await call('getSettings');
      setLevels(Object.fromEntries(d.issueTypes.map(t => [t.id, t.level])));
      setLinks(Object.fromEntries(d.linkTypes.map(t => [t.name, t.meaning])));
      setFields({ ...d.selected });
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { if (projectKey) load(); }, [projectKey]);

  const config = () => ({ levels, links, fields });
  const run = async (name, fn) => {
    setBusy(name);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };
  const showPreview = () => run('preview', async () => setPreview(await call('previewSettings', { config: config() })));
  const save = () => run('save', async () => {
    await call('saveSettings', { config: config() });
    setMessage({ ok: true, text: 'Saved. The audit page, the issue panels, the Confluence macro, Rovo and MCP clients now read the project this way.' });
    setPreview(await call('previewSettings', { config: config() }));
  });

  if (error) return <Failure error={error} onRetry={load} />;
  if (!data) return <Loading label="Reading the project…" />;
  const fieldOptions = [{ label: 'Not used', value: '' }, ...data.fields.map(f => ({ label: `${f.name} (${f.id})`, value: f.id }))];
  return (
    <Box padding="space.200">
      <Stack space="space.400">
        <Stack space="space.100">
          <Heading size="large">TraceGuard settings — {data.project.name}</Heading>
          <Text>
            Tell TraceGuard how this project already records requirements, tests and their links, so the audit works on your data as it
            is. Labels such as tg-swr and asil-d and the TraceGuard issue panel keep working on top of these settings.
          </Text>
          {data.savedAt && <Text size="small" color="color.text.subtle">Last saved {new Date(data.savedAt).toLocaleString()}</Text>}
          {!data.canEdit && (
            <SectionMessage appearance="information">
              <Text>Only project administrators can change these settings. You can still preview what TraceGuard would read.</Text>
            </SectionMessage>
          )}
        </Stack>

        <Stack space="space.100">
          <Heading size="medium">Issue types</Heading>
          <Text>The level each issue type stands for. Suggested from the type name until you save.</Text>
          <DynamicTable
            head={{ cells: [{ key: 'type', content: 'Issue type' }, { key: 'level', content: 'Level in the trace model' }] }}
            rows={data.issueTypes.map(t => ({
              key: t.id,
              cells: [
                { key: `n-${t.id}`, content: <Text>{t.name}{t.subtask ? ' (sub-task)' : ''}</Text> },
                {
                  key: `l-${t.id}`,
                  content: (
                    <Select inputId={`tg-type-${t.id}`} options={LEVEL_OPTIONS} value={pick(LEVEL_OPTIONS, levels[t.id])}
                      onChange={v => setLevels(prev => ({ ...prev, [t.id]: v?.value || 'none' }))} />
                  ),
                },
              ],
            }))}
          />
        </Stack>

        <Stack space="space.100">
          <Heading size="medium">Link types</Heading>
          <Text>
            Which issue links connect a requirement to its parent and a test to the requirement it verifies. The direction does not
            matter: TraceGuard orients every link by level. The Jira parent field always counts.
          </Text>
          <DynamicTable
            head={{ cells: [{ key: 'name', content: 'Link type' }, { key: 'words', content: 'Wording' }, { key: 'meaning', content: 'Meaning' }] }}
            rows={data.linkTypes.map(t => ({
              key: t.name,
              cells: [
                { key: `n-${t.name}`, content: <Text>{t.name}</Text> },
                { key: `w-${t.name}`, content: <Text size="small">{t.outward} / {t.inward}</Text> },
                {
                  key: `m-${t.name}`,
                  content: (
                    <Select inputId={`tg-link-${t.name}`} options={LINK_OPTIONS} value={pick(LINK_OPTIONS, links[t.name])}
                      onChange={v => setLinks(prev => ({ ...prev, [t.name]: v?.value || 'none' }))} />
                  ),
                },
              ],
            }))}
          />
        </Stack>

        <Stack space="space.200">
          <Heading size="medium">Fields</Heading>
          <Text>Custom fields that already hold trace data. A field with a value wins over the TraceGuard panel and labels.</Text>
          {ROLES.map(r => (
            <Stack key={r.role} space="space.050">
              <Label labelFor={`tg-field-${r.role}`}>{r.label}</Label>
              <Select inputId={`tg-field-${r.role}`} options={fieldOptions} value={pick(fieldOptions, fields[r.role] || '')}
                onChange={v => setFields(prev => ({ ...prev, [r.role]: v?.value || undefined }))} />
              <Text size="small" color="color.text.subtle">{r.hint}</Text>
            </Stack>
          ))}
        </Stack>

        {message && <SectionMessage appearance={message.ok ? 'success' : 'error'}><Text>{message.text}</Text></SectionMessage>}
        {preview && <Preview data={preview} />}
        <Inline space="space.100">
          <LoadingButton isLoading={busy === 'preview'} isDisabled={Boolean(busy)} onClick={showPreview}>Preview</LoadingButton>
          <LoadingButton appearance="primary" isLoading={busy === 'save'} isDisabled={Boolean(busy) || !data.canEdit} onClick={save}>
            Save settings
          </LoadingButton>
        </Inline>
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
