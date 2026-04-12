# Industrial Intel, Ingest + Crawler Architecture

## Goal

Turn the current local industrial tracker prototype into the real Tool B ingestion backbone.

This system should let:
- deterministic crawlers collect and normalize data
- the VPS run/schedule those jobs
- Supabase store the durable source-of-truth data
- clawbots supervise, summarize, and help with messy edge cases

## Core principle

### Supabase is the house
Supabase/shared Postgres is where Industrial Intel data should live long-term.

### VPS is the workshop
The VPS should run:
- crawlers
- source adapters
- scheduled jobs
- manual re-runs
- clawbot supervision tasks

### Clawbots are operators, not the only parser
Clawbots should help:
- trigger jobs
- summarize results
- classify weird source changes
- parse messy emails/brochures when needed
- flag suspicious output

But the canonical write path should still be deterministic and auditable.

---

# Current inputs we already have

## Existing local prototype
Source logic exists today in:
- `/root/.openclaw/workspace/industrial_tracker/tracker.py`

Current live sources:
- Spacelist
- Cushman
- CWEDM

Scaffolded / partial sources:
- CBRE
- Colliers
- JLL
- Cresa
- NAI
- Royal Park
- Saville / Savills
- Avison

Current local outputs:
- `latest_listings.csv`
- `latest_snapshot.json`
- `daily_summary.md`
- `dashboard.html`
- dated snapshots/reports

This is not throwaway work. It should be treated as the seed ingestion logic for Tool B.

---

# Recommended ingest flow

## Step 1, source adapter runs
Each source should have its own adapter.

Suggested future location:
- `apps/api/src/modules/industrial-intel/ingest/`

Example files:
- `sources/spacelist.ts`
- `sources/cushman.ts`
- `sources/cwedm.ts`
- `sources/cbre.ts`
- `sources/colliers.ts`

Each adapter should return a normalized in-memory record shape.

### Adapter contract
Each adapter should return records like:
- `sourceRecordKey`
- `externalId`
- `title`
- `address`
- `market`
- `submarket`
- `availableSf`
- `minDivisibleSf`
- `clearHeightFt`
- `brochureUrl`
- `sourceUrl`
- `status`
- `listingType`
- `lat/lng`
- `rawPayload`
- derived `contentHash`

---

# Step 2, normalized write pipeline

After a source adapter returns normalized records, the ingest service should:

1. create an `intel_ingest_runs` row
2. load existing listings for that source
3. compare by `(source_id, source_record_key)`
4. insert new listings
5. update changed listings
6. mark missing records as removed/stale when appropriate
7. create `intel_listing_changes` rows
8. update run counts:
   - seen
   - new
   - updated
   - removed
9. close the run with success/failure metadata

---

# How sorting/updating should work

## Identity
Use:
- `source_id`
- `source_record_key`

as the stable uniqueness pair.

## Change detection
Use:
- `content_hash`

for whether meaningful listing content changed.

## New listing
If `(source_id, source_record_key)` does not exist:
- insert listing
- add change row `new`

## Updated listing
If identity exists but `content_hash` changed:
- update row
- add change row `updated`

## Removed listing
If a previously-seen source record no longer appears in a successful run:
- set `removed_at`
- possibly set status `removed`
- add change row `removed`

## Reactivated listing
If a removed listing appears again:
- clear `removed_at`
- update row
- add change row `reactivated`

---

# Scheduling model

## Near-term
Start with VPS cron or scheduled task on the VPS.

Example cadence:
- daily morning full run
- optional second afternoon run
- manual trigger path for urgent refreshes

## Suggested schedule phases
### Phase 1
Run a stable subset daily:
- Spacelist
- Cushman
- CWEDM

### Phase 2
Add harder/broker-specific sources one by one:
- CBRE
- Colliers
- JLL
- etc.

### Phase 3
Add email-fed broker blast ingestion

---

# Email-fed listings

## Recommended role
Treat forwarded broker emails as another source type, not as the primary backbone.

Example source kind:
- `email_forward`

## Flow
1. email forwarded to a mailbox/input path
2. parser extracts candidate listing info
3. brochures/attachments are stored or linked
4. clawbot helps classify uncertain records
5. normalized record enters the same Tool B write pipeline

## Why later
Email parsing is useful, but messy.
It should sit on top of the same normalized ingest model rather than becoming the model itself.

---

# Clawbot role in ingest

## Clawbot should do
- kick off runs
- monitor failures
- summarize daily changes
- compare suspicious deltas
- help classify messy brochure/email data
- suggest follow-up actions for active requirements

## Clawbot should not do alone
- be the sole source of write truth
- silently invent structured fields without provenance
- replace deterministic identity/hash/update logic

---

# Suggested repo structure

## API module additions
Suggested new paths:
- `apps/api/src/modules/industrial-intel/ingest/index.ts`
- `apps/api/src/modules/industrial-intel/ingest/types.ts`
- `apps/api/src/modules/industrial-intel/ingest/runSource.ts`
- `apps/api/src/modules/industrial-intel/ingest/applyNormalizedRecords.ts`
- `apps/api/src/modules/industrial-intel/ingest/sources/`

Example source files:
- `sources/spacelist.ts`
- `sources/cushman.ts`
- `sources/cwedm.ts`

## Script entrypoints
Suggested scripts:
- `apps/api/scripts/run-industrial-intel-source.ts`
- `apps/api/scripts/run-industrial-intel-all.ts`

Possible npm scripts:
- `intel:run`
- `intel:run:all`
- `intel:run:spacelist`
- `intel:run:cushman`
- `intel:run:cwedm`

---

# Data quality rules

## Required metadata on each write
Every listing write should retain:
- source id
- source record key
- raw payload
- content hash
- first seen / last seen timestamps
- removed timestamp if applicable

## Provenance matters
If clawbot or an email parser helps interpret something uncertain, store the underlying source payload and do not hide uncertainty.

---

# Safe implementation order

## Phase A, bridge existing tracker into Tool B shape
- port/translate current tracker source logic into Tool B ingest adapters
- start with Spacelist, Cushman, CWEDM only
- manual run only at first

## Phase B, deterministic write pipeline
- add run row creation
- add normalized insert/update/remove logic
- add change rows
- verify counts and diffs

## Phase C, scheduling
- run daily from VPS
- add run summaries
- clawbot sends digest of changes

## Phase D, email source path
- define mailbox intake
- parse broker blasts
- same normalized write flow

## Phase E, requirement-aware refreshes
- after new listings land, clawbot can flag likely matches against active Tool B requirements

---

# Success criteria

This ingest backbone is successful when:
- at least one real live source writes to Tool B tables daily
- runs are logged in `intel_ingest_runs`
- new/updated/removed records create `intel_listing_changes`
- listings remain deduped by source identity
- daily refresh can be supervised by clawbot
- the UI reflects actual DB-backed changes over time

---

# Recommended next coding step

## Build the ingest bridge for the first stable sources:
- Spacelist
- Cushman
- CWEDM

That is the highest-value next engineering step.
It turns Tool B from a seeded shell into a living market-intel system.
