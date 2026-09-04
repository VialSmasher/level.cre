# Telemetry hardening release

This release keeps the React/Vite + Express + Supabase/Drizzle pipeline and the existing CRM records. It adds durable interaction receipts, atomic XP awards, authenticated change notifications, producer receipts, and targeted dashboard improvements.

## Deployment

The existing API prestart migration runner applies **0020_telemetry_hardening.sql** before serving requests. The migration is additive and retry-safe. It does not delete or consolidate historical interactions.

It creates:
- Unique interaction-event receipts, immutable producer-event fingerprints and producer run receipts.
- A shared database-backed ingestion rate window (120 requests/minute per authenticated user).
- Private Supabase broadcast triggers containing only a table-change hint.
- RLS and revoked direct client grants for server-owned activity imports, canonical events/links and the new operational tables. API database access continues through the configured privileged connection.
- A private-channel policy and a restrictive guard limiting levelcre:user topics to the authenticated owner.

Verify the API /health and /api/version endpoints, startup migration logs, and the signed-in Today/Activity views after deployment. The frontend falls back to visible-tab polling every 30 seconds while Realtime is unavailable. Database writes do not depend on broadcast availability.

The production inbound secret and scoped sales key are already configured. Recipient or mailbox matching no longer authenticates a webhook. HTTPS Basic (password = inbound secret), Bearer and x-levelcre-inbound-secret are supported.

For the existing provider transition, **EMAIL_INBOUND_ALLOW_QUERY_SECRET=true** explicitly permits the old authenticated URL-secret configuration. Those responses carry a Deprecation header. After verifying Postmark uses HTTPS Basic authentication, remove this flag. Recipient-only requests remain rejected regardless of the flag. Do not put credentials in reports, command histories or source control.

## Laptop recorder rollout

The exact active installation on pat-pc must be located before replacing it. Update both the repository invocation and any installed outlook-sales-followup recorder copy that the scheduler actually uses. Keep its endpoint, scoped credential and existing outbox paths. Back up the previous script; do not delete either queue.

The updated recorder:
- Accepts existing flat JSONL outboxes.
- Persists each event before the first network call.
- Uses a file lock and atomic replacement, taking only exact delivery IDs out of the current queue after acknowledgement.
- Sends at most 50 items and a conservative serialized-byte budget per request.
- Verifies per-item identities; empty, skipped and malformed receipts cannot clear an event.
- Honors Retry-After across invocations, retries transient failures with backoff and isolates permanent validation failures in the adjacent .rejected.jsonl file.
- Preserves the existing verified-address and review rules.
- Returns queued_local for pending telemetry. Never resend the actual email to fix telemetry.

Pass the provider message ID and original confirmed ActivityAt whenever available. If no provider ID exists, the confirmed timestamp is required to generate a repeatable fallback ID. Use a run ID for the completed batch, and a producer ID such as pat-pc.

After a successful mailbox scan, including scans with no new activity, call the recorder with **-FlushOnly -ProducerId pat-pc -RunId <scan-id> -ScannedThrough <confirmed-scan-watermark>**. Do not invent a scan watermark for a simple queue flush.

Run summaries distinguish dashboard freshness from laptop scanning. A missing producer receipt means “not yet reported,” not “automation broken.” Historical run counts describe acknowledged deliveries for that run, not a new measure of unique sales actions.

## Mapping recovery

Run **scripts/codex/get-levelcre-mapping-coverage.ps1** on the producer to retrieve the current 28-day recovery groups. Its output includes original source/event identities where available.

Resolve existing entities first through /api/agent/entity-resolution. Research a location only when needed. Submit verified company/address/coordinate evidence through the existing /api/agent/sales-prospect-maps/batch contract. If identity or address remains ambiguous, retain the review item. Never manufacture map pins or infer won/lost stages.

The UI offers the corresponding Mapping coverage panel on Today and Activity. Commercial progression counts attributable correspondence separately from raw inbound volume and labels its evidence limits.

## Verification

- npm test --workspace @apps/api
- npm test --workspace @apps/web
- npm run check --workspace @apps/api
- npm run build
- PowerShell: scripts/codex/record-levelcre-sales-activity.test.ps1

The API suite includes an isolated PostgreSQL-compatible PGlite test exercising the actual Drizzle interaction/XP transaction, migration replay, rollback after an injected credit failure and private-channel access restrictions. It does not write test events to production.

For read-only comparisons from Windows, run with TZ=UTC to match Railway's timestamp-without-time-zone driver interpretation. Reporting windows themselves use Edmonton calendar days.

## Rollback

Reverting the application commit is compatible with the additive tables. Keep the migration and access protections in place; do not drop event receipts or recreate the recipient authentication bypass. Inspect startup logs if a deployment fails before changing schema. Preserve outboxes throughout any rollback.


The broad frontend TypeScript check currently reports 33 existing errors; an isolated checkout of the production commit produces the identical 33 errors. This release adds none. API type checking and the production build pass.
