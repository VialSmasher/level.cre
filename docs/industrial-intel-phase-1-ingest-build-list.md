# Industrial Intel, Phase 1 Ingest Build List

## Purpose

Convert the agreed brokerage priorities into a concrete engineering sequence.

Pat's clarified top brokerage priorities are:
1. CW Edmonton / Cushman (`cwedm.com`)
2. CBRE (`cbre.ca`)
3. Avison Young (`avisonyoung.ca`)
4. NAI Commercial Edmonton (`naiedmonton.com`)
5. Colliers (`collierscanada.com`)
6. JLL (`jll.ca`)

This document answers a different question:
**what should we actually build first, in what order, and why?**

---

# Phase 1 definition

Phase 1 should mean:
- build the ingest framework
- prove one or more real source adapters end-to-end
- write into Tool B tables
- generate run/change records
- make the data appear in the UI from real DB-backed writes

Phase 1 does **not** need to complete every source.
It needs to prove the backbone works.

---

# Recommended build order

## 1. CW Edmonton / Cushman
- Business priority: **highest**
- Current status: already closest to proven in the old tracker
- Engineering risk: **lowest among the top brokerages**
- Why first:
  - already known source family
  - directly relevant to Pat's market
  - fastest bridge from prototype to Tool B

### Goal for this source
Use it as the first true end-to-end ingest bridge:
- source adapter
- normalized records
- DB writes
- change rows
- UI reflected from real writes

---

## 2. NAI Commercial Edmonton
- Business priority: high
- Engineering risk: medium
- Why second:
  - strong local Edmonton value
  - likely more relevant to Pat's actual day-to-day than a generic national tail source
  - valuable local signal if fetch path is manageable

### Caveat
Prior prototype attempts suggest this may need a tailored fetch strategy.
So it is second in engineering order only if the fetch path is tractable.

---

## 3. Avison Young
- Business priority: high
- Engineering risk: medium
- Why third:
  - high strategic value
  - likely a good candidate once the ingest framework is stable

### Caveat
Exact complexity depends on site structure and whether listing pages are static enough to parse cleanly.

---

## 4. JLL
- Business priority: high
- Engineering risk: medium
- Why fourth:
  - major brokerage source
  - useful once the first 1-2 adapters prove the framework

### Caveat
Parser may be straightforward or may require more site-specific shaping.

---

## 5. CBRE
- Business priority: very high
- Engineering risk: high
- Why later in build order:
  - strategically important
  - but likely to be more brittle because of anti-bot or site structure constraints

### Important note
CBRE should stay near the top of the business roadmap even if it is not first in engineering order.
This is a good example of important ≠ easy.

---

## 6. Colliers
- Business priority: very high
- Engineering risk: high
- Why later in build order:
  - similar logic to CBRE
  - likely worth tackling after the ingest framework is stable and at least 2-3 easier adapters are proven

---

# Actual engineering sequence

## Step A, framework first
Before building all six adapters, create the shared ingest backbone:
- `ingest/types.ts`
- `ingest/runSource.ts`
- `ingest/applyNormalizedRecords.ts`
- `ingest/sources/`

## Step B, first adapter
Implement:
- `sources/cwedm.ts`

## Step C, first real run
Prove:
- source -> normalized records -> `intel_listings` / `intel_ingest_runs` / `intel_listing_changes`

## Step D, second adapter
Add whichever of these looks safer after inspection:
- `sources/nai-edmonton.ts`
- or `sources/avison.ts`

## Step E, third adapter
Add the next safest of:
- Avison
- JLL
- NAI Edmonton

## Step F, anti-bot wave
Then tackle:
- CBRE
- Colliers
with the expectation that these may require alternate tactics

---

# Suggested labels for implementation planning

## Tier A, build immediately
- CW Edmonton / Cushman

## Tier B, build after framework proof
- NAI Commercial Edmonton
- Avison Young
- JLL

## Tier C, high-value but harder
- CBRE
- Colliers

---

# Recommended code naming

Suggested source adapter ids/slugs:
- `cwedm`
- `nai_edmonton`
- `avison_young`
- `jll`
- `cbre`
- `colliers`

Keep source naming stable across:
- source records
- ingest logs
- cron jobs
- clawbot summaries

---

# Success criteria for Phase 1

Phase 1 is successful when:
- CW Edmonton / Cushman ingests into Tool B successfully
- at least one additional high-priority brokerage source also works
- runs and changes are logged correctly
- listings show up in Tool B from real DB-backed writes
- the framework is obviously reusable for the remaining sources

---

# Recommended immediate next coding step

## Build the ingest framework + CW Edmonton adapter first.

That is the highest-leverage move.
Once that works, the rest of the brokerage wave becomes a repeatable engineering problem instead of a conceptual one.
