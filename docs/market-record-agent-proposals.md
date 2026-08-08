# Market Record Agent Proposals

This is the safe bridge between Level CRE's map and Codex-led research, brochure, SurveySync, inventory, and market-memory automations. Agents propose; Patrick approves the durable map record in `/app/desk` under **Review**.

## Authentication

Configure:

- `MARKET_RECORD_AGENT_API_KEY`
- `MARKET_RECORD_AGENT_USER_ID`
- optional `MARKET_RECORD_AGENT_EMAIL`
- optional `MARKET_RECORD_AGENT_NAME`

Send the key as either:

- `Authorization: Bearer <MARKET_RECORD_AGENT_API_KEY>`
- `x-levelcre-market-key: <MARKET_RECORD_AGENT_API_KEY>`

The scoped credential can submit proposals. Direct prospect create, edit, delete, and bulk-create routes reject agent credentials.

## Submit a proposal

`POST /api/agent/market-record-proposals`

```json
{
  "externalId": "google-place:ChIJ-example",
  "source": "codex_market_research",
  "observedAt": "2026-08-08T20:00:00.000Z",
  "evidenceStatus": "observed",
  "confidence": 95,
  "businessName": "Example Industrial Ltd.",
  "address": "12345 67 Street NW, Edmonton, AB",
  "latitude": 53.55,
  "longitude": -113.45,
  "contactPhone": "+1 780 555 0100",
  "placeId": "ChIJ-example",
  "googleMapsUrl": "https://maps.google.com/?cid=example",
  "evidenceUrl": "https://example.com/property-source",
  "legalIdentity": {
    "municipality": "Edmonton",
    "titleNumber": "242 123 456",
    "linc": "0012345678",
    "plan": "3443TR",
    "block": "4",
    "lot": "5"
  },
  "notes": "Observed operating at this location; awaiting broker approval."
}
```

Idempotency is `(user_id, source, externalId)`. Repeated submissions update the same review item without reopening an approved or ignored proposal.

## Review

The Daily Desk reads proposed records from the canonical activity-event ledger. Patrick can:

- **Approve to map**: link an exact existing record or create one complete prospect with address, coordinates, contact details, source, confidence, Place ID, and evidence metadata.
- **Archive**: mark the proposal ignored without creating a prospect.

Approval updates the proposal event to `matched`, links the prospect, and records the broker decision in event metadata. Email-only evidence is not sufficient for this endpoint because a valid property address and coordinates are required.

## Intended automation connections

- Google/Edmonton property research can propose observed businesses or properties.
- Brochure-vault and Industrial Inventory workflows can propose newly discovered addresses while retaining the source URL.
- SurveySync can propose a reusable map record after dossier matching, while extracted facts remain separately reviewable.
- Market-memory scans can submit candidates instead of writing pins.
- Requirement matching can link approved map records into pursuits without silently changing opportunity stage.
