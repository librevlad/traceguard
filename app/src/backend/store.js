// What TraceGuard keeps per project: the settings and the audit baselines. They are Jira project
// properties, so every TraceGuard surface (Jira, Confluence, Rovo, MCP clients) reads the same data,
// whichever product the call comes through; Jira lets only project administrators change them,
// and they stay with the project.
import * as rest from './jira.js';

const CONFIG = 'traceguard-config';
const BASELINE = 'traceguard-baseline';
const HISTORY = 'traceguard-baselines';
const KEEP = 12; // baselines kept for the coverage trend

export const getConfig = projectKey => rest.getProjectProperty(projectKey, CONFIG);
export const setConfig = (projectKey, config) => rest.setProjectProperty(projectKey, CONFIG, config);

// { latest: <baseline>, history: [{ at, name, coverage, counts }] } with the history oldest first, or null.
export async function getBaselines(projectKey) {
  const [latest, history] = await Promise.all([
    rest.getProjectProperty(projectKey, BASELINE), rest.getProjectProperty(projectKey, HISTORY),
  ]);
  return latest ? { latest, history: Array.isArray(history?.entries) ? history.entries : [] } : null;
}

export async function addBaseline(projectKey, baseline) {
  const stored = await rest.getProjectProperty(projectKey, HISTORY);
  const entry = { at: baseline.at, name: baseline.name || '', coverage: baseline.coverage.percent, counts: baseline.counts };
  const entries = [...(Array.isArray(stored?.entries) ? stored.entries : []), entry].slice(-KEEP);
  await rest.setProjectProperty(projectKey, BASELINE, baseline);
  await rest.setProjectProperty(projectKey, HISTORY, { entries });
  return entries;
}
