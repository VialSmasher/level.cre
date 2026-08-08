# Agent-forward automation contract

Level CRE uses a review-first operating model: agents may read, resolve, rank, watch, and propose. A signed-in broker must approve any proposal that creates or links a canonical map record or opportunity.

## Shared entity resolution

`POST /api/agent/entity-resolution`

Accepted identity signals include Google Place ID, normalized address, coordinates, phone, email, website domain, and business name. The response returns ranked prospect/listing/dossier candidates plus the signals and conflicts behind each score. It is read-only.

Market-record proposals run this resolver when submitted and again when approved. This prevents a stale proposal from creating a duplicate after another workflow has created the entity.

## Explainable requirement matching

`GET /api/intel/requirements/:id/matches?limit=100`

The API owns the shared deterministic scorer used by the Industrial Intel UI and agents. Results are ranked as:

- `strong` — score 70–100
- `possible` — score 45–69
- `stretch` — score 0–44

Each result includes positive reasons and unverified gaps. Shortlisting remains an explicit broker/user action.

## SurveySync and brochure dossiers to Review

`POST /api/intel/dossiers/:id/map-proposal`

A dossier must have an address and coordinates. The endpoint submits a `market_record_proposed` event carrying the dossier ID, canonical listing ID, source asset IDs, approved fact IDs, evidence URL, confidence, and entity-resolution candidates. It does not create a map pin.

Broker review remains at `PATCH /api/market-record-proposals/:id` with `approve` or `ignore`. Agent roles cannot call that approval endpoint.

## Confirmed activity to opportunity proposal

`POST /api/agent/opportunity-proposals`

The `sourceEventId` must identify confirmed activity linked to a prospect or listing. The endpoint creates an `opportunity_promotion_proposed` review event. It never creates an opportunity directly.

Broker review remains at `PATCH /api/opportunity-proposals/:id`. Approval creates a Target-stage opportunity. A `listing_pursuit` receives the standard playbook. Won and lost stages are never inferred and continue to require confirmed evidence.

## Requirement-driven watchlist

`GET /api/intel/watchlist?days=30&limit=12&terms=optional,terms`

Active requirements are the implicit watchlist. Recent listing changes are scored against them, and only possible/strong matches or explicit watch-term hits are returned. Signals identify listing, availability, brochure, occupancy, and pricing changes with a suggested next move. They do not alter a shortlist or survey.

## Reconciliation report

`GET /api/automation/reconciliation?limit=100`

This read-only report checks for:

- map geometry without canonical coordinates;
- map records without a dedicated address;
- missing market identity/provenance;
- active prospects without a next move;
- Review evidence older than seven days;
- won/lost opportunities without matching confirmed stage evidence;
- dossier identity, coordinate, and stale proposed-fact gaps.

The report explains the safe corrective action. It does not guess or mutate data.

## Existing next-move feed

`GET /api/automation/sales-brief`

This remains the primary ranked action feed for `/app/desk`. The Desk now combines it with `/api/intel/watchlist` and shows reconciliation health alongside Review proposals.

## Non-negotiable evidence rules

- A draft or attempted email is never recorded as sent.
- Agent roles cannot approve map/opportunity proposals or write those records directly.
- Source, evidence status, confidence, and provider/workflow identity remain on canonical activity.
- Full email bodies do not enter activity metadata.
- Uncertain identity and inferred facts remain reviewable.
- No automation marks an opportunity won or lost without Patrick-confirmed evidence.
