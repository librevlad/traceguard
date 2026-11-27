import React from 'react';
import {
  Box, Heading, Inline, Link, Lozenge, SectionMessage, SectionMessageAction, Spinner, Stack, Strong, Text, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

export const LEVEL_NAME = { SG: 'Safety goal', SYS: 'System requirement', SWR: 'Software requirement', TEST: 'Test case' };
export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const SEVERITY_LOOK = { high: 'removed', medium: 'moved', low: 'default' };
const ASIL_LOOK = { D: 'removed', C: 'moved', B: 'inprogress', A: 'new', QM: 'default' };
const RESULT_LOOK = { pass: 'success', fail: 'removed', none: 'default' };
export const GAP_MESSAGE = { high: 'error', medium: 'warning', low: 'information' };
export const METHOD_NAME = {
  requirements: 'requirements-based', 'fault-injection': 'fault injection', 'back-to-back': 'back-to-back', review: 'review',
};

// Resolver calls answer { ok, data } or { ok: false, error }.
export async function call(name, payload) {
  const res = await invoke(name, payload);
  if (!res?.ok) throw new Error(res?.error || `${name} failed`);
  return res.data;
}

export const Severity = ({ value }) => (
  <Lozenge appearance={SEVERITY_LOOK[value]} isBold={value === 'high'}>{value}</Lozenge>
);

export const Asil = ({ value }) => (value
  ? <Lozenge appearance={ASIL_LOOK[value]} isBold={value === 'D' || value === 'C'}>{value === 'QM' ? 'QM' : `ASIL ${value}`}</Lozenge>
  : <Lozenge appearance="default">no ASIL</Lozenge>);

export const Result = ({ value }) => (
  <Lozenge appearance={RESULT_LOOK[value] || 'default'}>{value === 'pass' ? 'passed' : value === 'fail' ? 'failed' : 'not run'}</Lozenge>
);

export const Level = ({ value }) => <Lozenge appearance="discovery">{value}</Lozenge>;

export function TraceStatus({ row }) {
  if (row.level === 'SG') return <Lozenge appearance="inprogress">vehicle level</Lozenge>;
  if (row.allocation === 'hw') return <Lozenge appearance="inprogress">hardware</Lozenge>;
  return row.verified ? <Lozenge appearance="success" isBold>verified</Lozenge> : <Lozenge appearance="removed">open</Lozenge>;
}

export function ItemLink({ itemKey, keyMap, baseUrl }) {
  const jiraKey = keyMap?.[itemKey];
  if (!jiraKey) return <Text>{itemKey}</Text>;
  return <Link href={`${baseUrl || ''}/browse/${jiraKey}`}>{itemKey}</Link>;
}

export function KeyList({ keys, keyMap, baseUrl }) {
  if (!keys?.length) return <Text color="color.text.subtlest">—</Text>;
  return (
    <Inline space="space.075" shouldWrap>
      {keys.map(k => <ItemLink key={k} itemKey={k} keyMap={keyMap} baseUrl={baseUrl} />)}
    </Inline>
  );
}

const tileStyle = xcss({
  padding: 'space.150',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  minWidth: '130px',
});

export function Tile({ label, value, children }) {
  return (
    <Box xcss={tileStyle}>
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">{label}</Text>
        <Heading size="large">{String(value)}</Heading>
        {children}
      </Stack>
    </Box>
  );
}

export function GapMessage({ gap, children }) {
  return (
    <SectionMessage appearance={GAP_MESSAGE[gap.severity]} title={gap.title}>
      <Stack space="space.050">
        <Text>{gap.detail}</Text>
        <Text><Strong>Fix:</Strong> {gap.fix}</Text>
        <Text size="small" color="color.text.subtle">{gap.ref}</Text>
        {children}
      </Stack>
    </SectionMessage>
  );
}

export function Loading({ label = 'Analysing traceability…' }) {
  return (
    <Inline space="space.100" alignBlock="center">
      <Spinner size="medium" label={label} />
      <Text>{label}</Text>
    </Inline>
  );
}

export function Failure({ error, onRetry }) {
  return (
    <SectionMessage appearance="error" title="TraceGuard could not load the data"
      actions={onRetry ? [<SectionMessageAction key="retry" onClick={onRetry}>Try again</SectionMessageAction>] : undefined}>
      <Text>{error}</Text>
    </SectionMessage>
  );
}
