// Jira and Confluence REST calls. Everything runs as the current user (asUser), so Jira and
// Confluence permissions decide what TraceGuard may read and change. The one exception is the
// status on the issue view's TraceGuard button, which Jira may ask for without a user (see asApp).
import { AsyncLocalStorage } from 'node:async_hooks';
import api, { route } from '@forge/api';
import { PROPERTY_KEY, SEARCH_FIELDS, LINK_TYPES } from '../core/jira.js';

const principal = new AsyncLocalStorage();
// Runs fn with every REST call made as the app instead of the user.
export const asApp = fn => principal.run('app', fn);

const HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(product, path, { method = 'GET', body } = {}) {
  const user = principal.getStore() === 'app' ? api.asApp() : api.asUser();
  const init = { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) };
  const res = product === 'confluence' ? await user.requestConfluence(path, init) : await user.requestJira(path, init);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      detail = [...(j.errorMessages || []), ...Object.values(j.errors || {}), j.message].filter(Boolean).join('; ') || detail;
    } catch { /* plain text body */ }
    throw new ApiError(`${product === 'confluence' ? 'Confluence' : 'Jira'} returned ${res.status}: ${detail}`, res.status);
  }
  return text ? JSON.parse(text) : null;
}

const jira = (path, opts) => call('jira', path, opts);
const confluence = (path, opts) => call('confluence', path, opts);

export const getProject = key => jira(route`/rest/api/3/project/${key}`);
export const getServerInfo = () => jira(route`/rest/api/3/serverInfo`);

export async function searchProject(projectKey, { max = 1000, fields = SEARCH_FIELDS } = {}) {
  const issues = [];
  let nextPageToken;
  do {
    const page = await jira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: {
        jql: `project = "${projectKey}" ORDER BY key ASC`,
        fields,
        properties: [PROPERTY_KEY],
        expand: 'changelog',
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      },
    });
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && issues.length < max);
  return issues;
}

export async function getIssue(key) {
  return jira(route`/rest/api/3/issue/${key}?fields=labels,project,issuetype,summary&properties=${PROPERTY_KEY}`);
}

export const setProperty = (key, value) => jira(route`/rest/api/3/issue/${key}/properties/${PROPERTY_KEY}`, { method: 'PUT', body: value });

export const updateLabels = (key, ops) => (ops.length
  ? jira(route`/rest/api/3/issue/${key}`, { method: 'PUT', body: { update: { labels: ops } } })
  : null);

export async function creatableIssueType(projectKey) {
  const data = await jira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = (data.issueTypes || data.values || []).filter(t => !t.subtask);
  return ['Task', 'Story', 'Requirement'].map(n => types.find(t => t.name === n)).find(Boolean) || types[0] || null;
}

export const bulkCreate = issueUpdates => jira(route`/rest/api/3/issue/bulk`, { method: 'POST', body: { issueUpdates } });

// Project properties hold the TraceGuard settings and baselines of a project (see store.js).
export async function getProjectProperty(projectKey, propertyKey) {
  try {
    const res = await jira(route`/rest/api/3/project/${projectKey}/properties/${propertyKey}`);
    return res?.value ?? null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export const setProjectProperty = (projectKey, propertyKey, value) => jira(
  route`/rest/api/3/project/${projectKey}/properties/${propertyKey}`, { method: 'PUT', body: value },
);

// True when the current user administers the project (or Jira): they may change settings and baselines.
export async function canAdminister(projectKey) {
  const res = await jira(route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS,ADMINISTER`);
  const p = res?.permissions || {};
  return Boolean(p.ADMINISTER_PROJECTS?.havePermission || p.ADMINISTER?.havePermission);
}

export async function listLinkTypes() {
  const { issueLinkTypes = [] } = await jira(route`/rest/api/3/issueLinkType`);
  return issueLinkTypes;
}

// Custom fields that can hold an ASIL, a requirement ID, a test method or a test result.
export async function listFields() {
  const fields = await jira(route`/rest/api/3/field`);
  const usable = f => f.custom && ['string', 'option', 'array', 'number'].includes(f.schema?.type)
    && (f.schema.type !== 'array' || ['string', 'option'].includes(f.schema.items));
  return (fields || []).filter(usable).map(f => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Finds the Derives / Verifies link types, creating them when the user is allowed to.
// Returns { derives: name|null, verifies: name|null }; null means links go into the issue property.
export async function ensureLinkTypes({ create = true } = {}) {
  const issueLinkTypes = await listLinkTypes();
  const out = {};
  for (const [type, want] of Object.entries(LINK_TYPES)) {
    const same = t => t.name.toLowerCase() === want.name.toLowerCase()
      || (t.outward?.toLowerCase() === want.outward && t.inward?.toLowerCase() === want.inward);
    let found = issueLinkTypes.find(same);
    if (!found && create) {
      try {
        found = await jira(route`/rest/api/3/issueLinkType`, { method: 'POST', body: want });
      } catch (e) {
        if (e.status !== 403 && e.status !== 401) throw e;
      }
    }
    out[type] = found ? found.name : null;
  }
  return out;
}

// "from" is the lower end: the test that verifies, or the requirement that derives.
// Jira shows the outward wording ("verifies") on the issue passed as inwardIssue.
export const createIssueLink = (typeName, from, to) => jira(route`/rest/api/3/issueLink`, {
  method: 'POST',
  body: { type: { name: typeName }, inwardIssue: { key: from }, outwardIssue: { key: to } },
});

export async function createConfluencePage(spaceKey, title, storage) {
  const spaces = await confluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  const space = spaces.results?.[0];
  if (!space) throw new ApiError(`Confluence space ${spaceKey} was not found or you cannot see it.`, 404);
  const page = await confluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    body: { spaceId: space.id, status: 'current', title, body: { representation: 'storage', value: storage } },
  });
  return { id: page.id, title: page.title, url: page._links?.webui ? `${page._links.base || ''}${page._links.webui}` : null };
}
