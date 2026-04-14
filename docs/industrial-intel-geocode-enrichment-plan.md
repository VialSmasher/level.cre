# Industrial Intel Geocode Enrichment Plan

## Objective
Add the first reliable geocode enrichment lane for Tool B so listings can graduate from address-only records into map-renderable inventory.

## Current State
Already in place:
- map shell in Tool B listings UI
- shared Google Maps key helper path
- map-ready listing payload fields
- first-pass metadata fields on `intel_listings`

Current metadata now available on listings:
- `normalized_address`
- `geocode_status`
- `geocode_confidence`
- `geocode_source`
- `data_quality_status`
- `lat`
- `lng`

## Guiding Principle
Geocoding is enrichment, not truth creation.

The system should:
- geocode only when a listing has a usable address
- preserve the original source address
- store normalized output separately
- mark uncertainty instead of guessing

## Proposed Enrichment Inputs
Use this order of trust:
1. source-provided `lat/lng`
2. source address + market/submarket context
3. manual review / future operator correction

## Proposed Geocode Statuses
Recommended steady-state values:
- `success`
- `pending`
- `needs_review`
- `failed`
- `blocked`

### Meaning
- `success`: usable coordinates stored
- `pending`: eligible for enrichment, not processed yet
- `needs_review`: geocoder returned ambiguous or low-confidence result
- `failed`: attempted and no usable result returned
- `blocked`: listing does not have enough address quality to attempt geocoding

## Proposed Geocode Sources
Recommended values:
- `source_feed`
- `google_maps`
- `manual_override`
- `seed`

## Data Quality Heuristic, First Pass
### `clean`
- has a real street address or highly usable normalized address
- not obviously marketing copy

### `review`
- partial address only
- address may actually be brochure text / marketing language
- title/source mismatch suggests uncertainty

### `blocked`
- no usable address
- explicit ambiguity that should not be geocoded automatically

## First Utility Shape
Suggested location:
- `apps/api/src/modules/industrial-intel/geocode/`

Suggested files:
- `types.ts`
- `normalizeAddress.ts`
- `scoreGeocodeCandidate.ts`
- `geocodeListing.ts`
- `runPendingGeocodes.ts`

## Suggested Function Contract
```ts
async function geocodeIntelListing(listingId: string): Promise<{
  listingId: string;
  geocodeStatus: 'success' | 'pending' | 'needs_review' | 'failed' | 'blocked';
  latitude: number | null;
  longitude: number | null;
  normalizedAddress: string | null;
  geocodeConfidence: number | null;
  geocodeSource: string | null;
  dataQualityStatus: 'clean' | 'review' | 'blocked';
  notes?: string[];
}>;
```

## Batch Job Rules
The batch utility should:
- pull only listings with `geocode_status in ('pending', 'needs_review')`
- skip listings with no usable address
- cap per run to a safe batch size
- write back result metadata atomically per listing
- log counts of:
  - attempted
  - success
  - needs_review
  - failed
  - blocked

## Safe First Batch Filter
Recommended SQL-style eligibility:
- `removed_at is null`
- `lat is null or lng is null`
- `coalesce(normalized_address, address) is not null`
- `trim(coalesce(normalized_address, address)) <> ''`
- `geocode_status in ('pending', 'needs_review')`

## Confidence Policy
### Auto-accept
Accept automatically when:
- geocoder returns a clear single result
- confidence is high enough
- result remains inside expected market context

### Review instead of accept
Mark `needs_review` when:
- multiple plausible results
- result appears outside Edmonton market context
- postal/locality mismatch
- source address looks like intersection, district, or marketing copy

## Provider Recommendation
For the first live pass, use Google where practical because:
- map provider is already Google Maps
- key path is already understood
- fewer moving parts for the first production slice

But keep the utility boundary provider-agnostic enough that replacing the geocoder later is possible.

## First Acceptance Criteria
This lane is good enough for first release when:
- listings with reliable source coordinates show immediately as `success`
- address-only listings become `success`, `needs_review`, or `failed` deterministically
- bad addresses do not create bad pins silently
- the map starts filling with real usable pins without manual pin editing

## Tomorrow-Ready Follow-up
Once Railway env truth is sorted:
1. confirm production DB path
2. apply migration `0006_industrial_intel_map_fields.sql`
3. verify `/api/intel/listings` returns map metadata live
4. build the first `runPendingGeocodes` utility
5. test on a tiny known-good batch before wide rollout
