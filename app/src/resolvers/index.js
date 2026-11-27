// UI resolvers. Project and issue come from the Forge context where there is one,
// so a page can only act on what it is showing; the Confluence macro names its project in its config.
import Resolver from '@forge/resolver';
import * as svc from '../backend/service.js';

const resolver = new Resolver();
const projectOf = req => req.context?.extension?.project?.key || req.payload?.projectKey;
const issueOf = req => req.context?.extension?.issue?.key;

const define = (name, fn) => resolver.define(name, async req => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (e) {
    console.error(`${name} failed`, e);
    return { ok: false, error: e.message || String(e) };
  }
});

define('getProjectAudit', req => svc.projectAudit(projectOf(req)));
define('getIssueTrace', req => svc.issueTrace(projectOf(req), issueOf(req)));
define('classifyIssue', req => svc.classifyIssue(issueOf(req), req.payload));
define('recordResult', req => svc.recordResult(issueOf(req), req.payload?.result));
define('createLink', req => svc.createTraceLink(projectOf(req), req.payload));
define('seedDemo', req => svc.seedDemo(req.context?.extension?.project?.key, req.payload || {}));
define('publishReport', req => svc.publishReport(projectOf(req), req.payload?.spaceKey));

export const handler = resolver.getDefinitions();
