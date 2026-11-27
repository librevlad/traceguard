# TraceGuard privacy policy

Last updated: 27 November 2026

TraceGuard is an Atlassian Forge app that audits requirements traceability (Automotive SPICE, ISO 26262)
in Jira and Confluence. It runs entirely on the Atlassian platform ("Runs on Atlassian").

## What data TraceGuard reads

- Jira issues of the project being audited: summary, description, issue type, labels, status, issue links,
  parent, dates, change history of summary and description, and the TraceGuard issue property.
- Confluence spaces, only to find the space you choose when you publish an audit report.

TraceGuard reads data as the user who opens a TraceGuard page or asks the Rovo agent or an MCP client,
so it only sees what that user is allowed to see in Jira and Confluence.

## What data TraceGuard writes

Only when a user asks for it:
- the issue property `traceguard` (trace level, ASIL, test method and result) and matching labels;
- Jira issue links (Derives, Verifies) and, for Jira admins, these two issue link types;
- Jira issues of the optional demo project;
- a Confluence page with the audit report.

## What TraceGuard does not do

- It does not send data outside Atlassian. It calls no external services and no external AI models of its own.
- It does not store personal data, user identifiers or credentials, and keeps no copies of your data
  outside your Jira and Confluence site.
- It does not track users and uses no cookies of its own.

Atlassian platform features such as Rovo and MCP clients that you connect are covered by Atlassian's
own privacy policy: https://www.atlassian.com/legal/privacy-policy

## Contact

Questions and requests: https://github.com/librevlad/traceguard/issues
