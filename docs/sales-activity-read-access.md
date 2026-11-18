# Owner-scoped sales activity reads

Patrick's existing sales-activity credential can read these exact GET endpoints:

- `/api/automation/sales-brief`
- `/api/automation/activity-pulse`
- `/api/agent/sales-activity/imports`
- `/api/activity-events`

Use `x-levelcre-sales-key` or the supported bearer form. The server validates the
existing configured key and derives the owner from `SALES_ACTIVITY_AGENT_USER_ID`
(with the existing Intel owner fallback). Payload, query and pre-existing request
identities cannot select another owner. The existing handlers retain their
`getUserId(req)` ownership filters and response limits.

This does not enable a general Intel credential or allow the sales key through
other authenticated endpoints. No PATCH, POST, DELETE, review/link action, account
settings or broker-approval permission is added. Ordinary verified broker sessions
retain their existing access. The established sales-ingestion and phone-research
routes are unchanged.

Reconciliation must compare the original provider message IDs across both ledgers,
then distinguish human replies, automatic replies, nondelivery and later outbound
messages. A failed read is unknown, not evidence of missing activity. Retain
unmatched evidence for review rather than creating a prospect or pin from email.
