# Sales Activity Import Contract

This is the Level CRE bridge for Codex-led sales work. It is intentionally conservative: activity can be recorded without creating map noise.

## Rules

1. Codex sales workflows write activity into `sales_activity_imports` first.
2. Confirmed `sent` and `received` email activity can create a `contact_interactions` row automatically. Received mail is recorded as an inbound outcome: it earns no XP, does not count toward production, and does not create an automatic 14-day follow-up.
3. Automatic interaction creation requires either:
   - a provided `prospectId` that belongs to the user, or
   - an exact match against an existing prospect `contact_email`.
4. Do not create fake prospects or map pins from email-only contacts.
5. Unmatched sent or received activity stays in `needs_review`.
6. `hold`, `low_priority`, and `skipped` rows stay in the ledger as `ignored`.
7. Idempotency is by `(user_id, source, external_activity_id)`.
8. Existing interactions are detected by `source_provider = 'codex'` and `source_message_id = external_activity_id`.

## Endpoints

### `POST /api/agent/sales-activity/batch`

Requires normal Level CRE auth or the existing agent auth:
- `Authorization: Bearer <SALES_ACTIVITY_AGENT_API_KEY>`, or
- `x-levelcre-sales-key: <SALES_ACTIVITY_AGENT_API_KEY>`

The server uses `SALES_ACTIVITY_AGENT_USER_ID` as the target Level CRE user for scoped sales-agent calls. It falls back to `INTEL_AGENT_USER_ID` during migration. The legacy `INTEL_AGENT_API_KEY` route remains accepted, but new Codex workflows should use the scoped sales key so they cannot authenticate unrelated application routes.

Request:

```json
{
  "source": "codex_followup",
  "runId": "2026-07-09-followup",
  "activities": [
    {
      "timestamp_mdt": "2026-07-08",
      "contact": "Brian Beckett",
      "company": "KSM RIG & EQUIPMENT",
      "email": "bb.ksm@ksmrig.com",
      "status": "sent",
      "subject": "Catch up",
      "notes": "Sent via Outlook desktop after approved wording."
    }
  ]
}
```

For received Outlook mail, pass the sender as the contact/email and use the exact provider message ID:

```json
{
  "source": "outlook_sync",
  "runId": "outlook-sync-2026-08-10",
  "activities": [
    {
      "externalActivityId": "exact-outlook-message-id",
      "activityAt": "2026-08-10T15:30:00-06:00",
      "activityType": "email",
      "status": "received",
      "contact": "Pat Prospect",
      "email": "pat@example.com",
      "subject": "Re: Edmonton requirement",
      "notes": "Observed in Outlook Inbox by scheduled sync; message body not stored."
    }
  ]
}
```

The bridge stores metadata only. Never send message bodies, previews, snippets, HTML, attachments, signatures, or quoted history.

Response includes counts plus per-row `matchStatus`, `matchReason`, `interactionId`, and `duplicate`.

### `GET /api/agent/sales-activity/imports`

Returns recent import ledger rows.

Optional query params:
- `limit`, max `250`
- `matchStatus`
- `source`

### `PATCH /api/agent/sales-activity/imports/:id`

Resolves an activity that could not be matched confidently during import.

Link a sent or received activity to an existing prospect:

```json
{
  "action": "link",
  "prospectId": "existing-prospect-id"
}
```

The server verifies prospect ownership, reuses an existing Codex interaction when present, and otherwise creates one interaction before marking the import `matched`.

Archive activity that should not enter the CRM:

```json
{
  "action": "ignore"
}
```

Activity with an existing interaction cannot be ignored.

## Daily Desk

`/app/desk` is the broker-facing review and action surface. It combines the ranked `/api/automation/sales-brief` output with `needs_review` sales activity imports.

Its working queues are:

- `Do now`: critical and high-priority actions.
- `Waiting`: Outlook threads waiting on another party.
- `Review`: captured email and Codex activity that needs context.
- `Develop`: stale prospects, research targets, and lower-priority pipeline work.

The page keeps `/app` as the map and links matched prospects back to `/app?prospectId=<id>`.

## Follow-Up Work

The `outlook-sales-followup` Codex skill records confirmed sends and scheduled Outlook reconciliation records eligible received messages through this endpoint. It keeps a local JSONL outbox when credentials or the API are unavailable and flushes that outbox on a later successful run. Postmark remains a fallback capture path. New mapped prospects should still be created only when a real address/property is known.

The repository copy of the recorder is `scripts/codex/record-levelcre-sales-activity.ps1`, so the workflow travels with the project across Patrick's Codex computers.
