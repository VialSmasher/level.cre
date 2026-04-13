# Industrial Intel Map + Filters Plan

## Goal
Add a scalable inventory browsing workflow for Tool B so operators can narrow large listing sets quickly and move between table and map views without losing context.

## Product Direction
Build this in stages:
1. finish current UI polish
2. add table filters first
3. add normalized map/geocode fields to the data model
4. add map view and table-to-map linking
5. improve review workflow for unmappable or low-confidence records

This order matters. Filters are useful immediately. A map is only trustworthy once addresses and geocodes are normalized.

## Desired Operator Experience
When Tool B grows to hundreds of listings, the operator should be able to:
- filter by submarket
- filter by listing type (lease, sale, sublease)
- filter by size range
- filter by source
- filter by active vs removed state
- click a table row and highlight the corresponding map pin
- click a map pin and open a compact detail card
- open brochure/source links from the map card in a new tab

## Core Principle
Bots should not write directly to a separate map-pin system.

Bots write normalized listing records.
A geocoding/enrichment step adds map-ready fields.
The map reads from the enriched listing records.

This keeps the workflow correct and avoids duplicated truth.

## Data Requirements
Each listing should eventually support these fields:
- `address`
- `market`
- `submarket`
- `listingType`
- `availableSf`
- `sourceUrl`
- `brochureUrl`
- `latitude`
- `longitude`
- `geocodeStatus` (`pending`, `success`, `failed`, `needs_review`)
- `geocodeConfidence`
- `geocodeSource`
- `mapLabel` or cleaned display title
- `dataQualityStatus` (`clean`, `review`, `blocked`)

Optional but useful later:
- parcel / legal address fields
- municipality
- normalized postal code
- duplicate cluster id

## Workflow
### Ingest / Manual intake
1. ingest listing into Industrial Intel tables
2. normalize the listing title and address
3. mark listing for geocode enrichment

### Geocode enrichment
1. attempt geocoding from normalized address
2. if geocoding succeeds, save lat/lng + confidence
3. if geocoding fails or confidence is weak, mark `needs_review`
4. keep the listing visible in the table even if it is not mappable yet

### UI behavior
- table can show all listings
- map shows only listings with usable geocodes
- low-confidence or unmappable listings remain in the table with a visible review state

## Filter Plan
### Phase 1 filters
- submarket
- listing type
- min/max available SF
- source
- active / removed

### Phase 2 filters
- market
- mapped only / all
- quality state
- has brochure
- has source URL
- date last seen

## Map Behavior
Recommended desktop layout:
- left: table / list
- right: map

Recommended interactions:
- click table row -> center/highlight pin
- click pin -> open map card
- map card shows:
  - title
  - address
  - listing type
  - available SF
  - source name
  - brochure link
  - source link
- brochure/source links open in a new tab
- cluster pins when zoomed out
- color pins by listing type

## UI Sequencing Recommendation
### First next slice
Implement table filters without the map first.

Why:
- useful immediately
- easier to validate
- forces better normalization of listingType, submarket, and availableSf
- reduces noise before map work begins

### After filters
Add the geocode pipeline and map-ready fields.

### Then
Add the actual map view.

## Quality / Review States
Add lightweight review signals so the operator can trust the map:
- clean -> safe to map
- review -> visible in table, caution on map or hidden until reviewed
- blocked -> visible in table only, not shown as a normal pin

## Technical Notes
- do not create a separate manual pin table
- do not let the map own source-of-truth listing data
- keep geocode enrichment as a derivation of the listing record
- use normalized listing records as the single source of truth for both table and map

## Suggested Immediate Build Order
1. hide or collapse manual intake from default listings view
2. add table filters to the listings page
3. add normalized display helpers for title/address/submarket
4. add geocode fields and enrichment workflow
5. add map split-view
6. add row <-> pin linking
7. add quality-state controls for unmappable listings

## Decision
Proceed with filters first, then map.
