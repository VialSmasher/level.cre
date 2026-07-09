# Sales Activity Import Contract

This is the Level CRE bridge for Codex-led sales work. It is intentionally conservative: activity can be recorded without creating map noise.

## Rules

1. Codex sales workflows write activity into `sales_activity_imports` first.
2. Only `sent` activity creates a `contact_interactions` row automatically.
3. Automatic interaction creation requires either:
   - a provided `prospectId` that belongs to the user, or
   - an exact match against an existing prospect `contact_email`.
4. Do not create fake prospects or map pins from email-only contacts.
5. Unmatched sent activity stays in `needs_review`.
6. `hold`, `low_priority`, and `skipped` rows stay in the ledger as `ignored`.
7. Idempotency is by `(user_id, source, external_activity_id)`.
8. Existing interactions are detected by `source_provider = 'codex'` and `source_message_id = external_activity_id`.

## Endpoints

### `POST /api/agent/sales-activity/batch`

Requires normal Level CRE auth or the existing agent auth:
- `Authorization: Bearer <INTEL_AGENT_API_KEY>`, or
- `x-levelcre-agent-key: <INTEL_AGENT_API_KEY>`

The server uses `INTEL_AGENT_USER_ID` as the target Level CRE user for agent-auth calls.

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

Response includes counts plus per-row `matchStatus`, `matchReason`, `interactionId`, and `duplicate`.

### `GET /api/agent/sales-activity/imports`

Returns recent import ledger rows.

Optional query params:
- `limit`, max `250`
- `matchStatus`
- `source`

## Follow-Up Work

The next safe layer is a review UI or agent brief over `needs_review` rows so unmatched sent activity can be linked to existing prospects or converted into new mapped prospects only when a real address/property is known.
