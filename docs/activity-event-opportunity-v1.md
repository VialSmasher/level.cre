# Activity Event and Opportunity V1

Level CRE is Patrick's durable business-development record and visual market memory. Codex may discover, draft, send, and infer. Level CRE stores confirmed activity, reviewable evidence, opportunity state, and links to the map without inventing facts or pins.

## System Roles

- **Map:** geospatial market memory for known properties, companies, contacts, requirements, and opportunities.
- **Calculator:** separate Effort, Momentum, Pipeline, and Production measures. Do not collapse them into one opaque score.
- **Codex:** research, coaching, outreach, inference, and automation.
- **Level CRE:** durable truth, provenance, corrections, relationship graph, and reporting.

## Canonical Activity Event

Every event has a provider-neutral type, source, stable external ID, occurrence time, evidence status, confidence, match status, brief summary, and optional links. Full email bodies and source documents are not stored in the canonical ledger.

Evidence status:

- `observed`: directly seen in a source, but not necessarily confirmed as a business fact.
- `inferred`: Codex derived the signal and it remains reviewable.
- `confirmed`: Patrick or a delivery/provider result confirmed it.

Match status:

- `matched`: confidently linked to a known entity.
- `needs_review`: plausible but requires a decision.
- `unassigned`: valid activity with no entity link yet.
- `ignored`: deliberately excluded by a durable human correction.

`(user_id, source, external_event_id)` is the idempotency boundary. Human corrections outrank later inference. Unknown activity must not create fake prospects or map pins.

## Opportunity V1

Types:

- `listing_pursuit`
- `tenant_requirement`
- `buyer_requirement`
- `renewal_relocation`
- `sale_opportunity`

Stages:

`target -> researching -> contacting -> engaged -> qualified -> pitching -> decision -> won | nurture | lost`

Stages describe commercial state. Playbook steps describe work completed and do not automatically force a stage change. `won` and `lost` require confirmed evidence.

## Listing Pursuit Playbook

1. Drive by.
2. Observe property condition, vacancy, signage, or occupancy.
3. Capture a photo or voice note.
4. Pull title.
5. Resolve ownership.
6. Identify the decision maker.
7. Find contact details.
8. Contact the owner.
9. Follow up.
10. Confirm occupancy or listing status.
11. Discover timing and motivation.
12. Prepare comps or recommendations.
13. Book the owner meeting.
14. Deliver an opinion of value or strategy.
15. Send the listing proposal.

## Ingestion Paths

1. **Codex-assisted sends:** direct structured recorder after provider confirmation. This is primary.
2. **Manual/outside-Codex sends:** Postmark BCC or future mailbox sync as fallback evidence.
3. **Historical bootstrap:** `scripts/codex/scan-patrick-market-memory.ps1` emits read-only candidate reports. It never writes Level CRE.

All paths converge on the canonical event ledger and use provider identity for deduplication.

## API Surface

- `POST /api/agent/activity-events/batch`: scoped agent ingestion.
- `GET /api/activity-events`: authenticated event read.
- `GET /api/opportunities`: authenticated opportunity read.
- `POST /api/opportunities`: create an opportunity at `target`.
- `PATCH /api/opportunities/:id/stage`: evidence-backed stage change.
- `PATCH /api/opportunities/:id/playbook`: update a listing-pursuit step.

The legacy `POST /api/agent/sales-activity/batch` remains supported and dual-writes confirmed sends into the canonical ledger.
