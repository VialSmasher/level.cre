# Industrial Intel Map Implementation Plan

## Objective
Build the first usable map slice for Tool B so operators can browse industrial inventory spatially while keeping the filtered listings table as the primary review surface.

## Scope for First Map Release
The first release should:
- render a map beside the filtered listings table
- show pins only for listings with usable geocodes
- keep unmappable listings visible in the table
- allow row-to-pin and pin-to-card interaction
- allow brochure/source links to open in a new tab from the map card

The first release should not try to solve every ingestion edge case.

## Guiding Principle
The map must read from normalized listing records.
It must not become its own data entry surface.

## Required Data Additions
Add map-ready fields to Industrial Intel listings or a tightly linked enrichment layer:
- `latitude`
- `longitude`
- `geocodeStatus`
- `geocodeConfidence`
- `geocodeSource`
- `normalizedAddress`
- `dataQualityStatus`

## Geocode Status States
Suggested values:
- `pending`
- `success`
- `failed`
- `needs_review`

## Data Quality States
Suggested values:
- `clean`
- `review`
- `blocked`

## UX Shape
### Desktop
- left pane: filtered listings table
- right pane: map

### Mobile / narrow widths
- stacked layout or tab toggle between list and map

## Table -> Map Interaction
- clicking a listing row centers the map on that listing
- selected row highlights selected pin
- if the listing has no geocode, show a small explanation instead of trying to pin it

## Map -> Detail Interaction
Clicking a pin opens a compact info card with:
- title
- normalized address
- listing type
- available SF
- source name
- brochure link
- source link

Brochure/source links should open in a new tab.

## Filter Behavior
The map should use the same filters as the listings table.
There should be one shared filter state, not two competing systems.

## First Technical Slice
### Step 1: data model groundwork
- add geocode/map fields
- add migration for map-ready metadata
- keep existing listing records as source of truth

### Step 2: enrichment path
- create a geocode enrichment job or utility
- run only against records with a usable address
- mark bad/ambiguous addresses as `needs_review`

### Step 3: API surface
- extend listing payloads to include map-ready fields
- optionally add a map-focused endpoint later, but do not require one for first release if listing payloads remain manageable

### Step 4: UI
- add split-view layout
- render map pins from filtered listings with usable coordinates
- add selected listing state
- add pin detail cards

## Mapping Provider Questions
Need to choose one:
- Google Maps
- Mapbox
- Leaflet + OSM tiles

Recommendation:
- choose the provider that best fits existing auth/cost constraints
- do not overbuild provider abstraction on day one

## Suggested Rollout Order
1. choose map provider
2. add geocode/map fields
3. build backend enrichment path
4. expose map-ready listing payloads
5. build split-view UI with shared filters
6. add row/pin linking
7. add quality-state handling for unmappable listings

## Non-Goals for First Release
- polygon drawing
- saved map searches
- route optimization
- full clustering analytics
- editing pin positions manually
- brochure upload workflow

## Success Criteria
The first map release is successful when:
- operators can filter listings and see matching pins
- clicking rows and pins feels connected
- brochure/source links open from the map card
- bad or missing addresses do not break the experience
- the map reinforces the same inventory truth as the table

## Immediate Next Decision
Pick the map provider first. That will drive the implementation details for the UI slice.
