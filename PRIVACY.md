# TraceGuard privacy policy

Last updated: 28 November 2026

TraceGuard is an Atlassian Forge app that audits requirements traceability (Automotive SPICE, ISO 26262)
in Jira and Confluence. It runs entirely on the Atlassian platform ("Runs on Atlassian").

## What data TraceGuard reads

- Jira issues of the project being audited: summary, description, issue type, labels, status, issue links,
  parent, dates, change history, the TraceGuard issue property, and the custom fields chosen in the
  TraceGuard settings of the project.
- The project's issue types and the site's issue link types and custom fields, for the settings page.
- Whether the current user administers the project, before settings or a baseline are saved.
- Confluence spaces, only to find the space you choose when you publish an audit report.

TraceGuard reads data as the user who opens a TraceGuard page or asks the Rovo agent or an MCP client,
so it only sees what that user is allowed to see in Jira and Confluence.

## What data TraceGuard writes

Only when a user asks for it:
- the issue property `traceguard` (trace level, ASIL, test method and result) and matching labels;
- Jira issue links (Derives, Verifies) and, for Jira admins, these two issue link types;
- Jira issues of the optional demo project;
- a Confluence page with the audit report.

## What data TraceGuard stores

As Jira project properties of the project, only when a project administrator saves them (Jira itself
lets only project administrators change them):
- the TraceGuard settings: which issue types, link types and custom fields hold trace data;
- audit baselines: the time and optional name, coverage figures, gap identifiers (rule and item key)
  and the keys of verified requirements. The twelve most recent baselines are kept for the coverage trend.

## What TraceGuard does not do

- It does not send data outside Atlassian. It calls no external services and no external AI models of its own.
- It does not store personal data, user identifiers or credentials. Apart from the settings and baselines
  above, it keeps no copies of your data, and nothing leaves the Atlassian platform.
- It does not track users and uses no cookies of its own.

Atlassian platform features such as Rovo and MCP clients that you connect are covered by Atlassian's
own privacy policy: https://www.atlassian.com/legal/privacy-policy

## Contact

Questions and requests: https://github.com/librevlad/traceguard/issues
