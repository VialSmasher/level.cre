# Industrial Intel, Concrete Schema + API Plan

## Current state

Already present:
- `intel_sources`
- `intel_listings`
- `intel_ingest_runs`
- `intel_listing_changes`
- read-only Tool B pages
- read-only Tool B API routes
- seed data path

This means Tool B already has the first inventory/change-tracking slice.

## Goal of the next design phase

Add the minimum next data model needed to support:
- structured requirements
- explainable matching
- shortlist preparation
- agent/bot-friendly querying later

Do this **without** disturbing Tool A tables or Tool A flows.

---

# Phase 1, Requirements

## New tables

### `intel_requirements`
One row per requirement/request.

Suggested fields:
- `id`
- `account_id` or `team_id` later if needed
- `created_by_user_id`
- `title`
- `client_name`
- `deal_type` (`lease`, `sale`, `either`)
- `status` (`draft`, `active`, `paused`, `filled`, `archived`)
- `market`
- `submarket`
- `min_sf`
- `max_sf`
- `min_clear_height_ft`
- `max_budget_psf` or `max_rate`
- `min_yard_acres` nullable
- `required_dock_doors` nullable
- `required_grade_doors` nullable
- `power_notes`
- `office_notes`
- `timing_notes`
- `special_notes`
- `is_off_market_search_enabled` boolean
- `created_at`
- `updated_at`

### `intel_requirement_preferences`
Structured boolean/preference rows for requirement traits that should not all be flattened into the main table.

Suggested fields:
- `id`
- `requirement_id`
- `key`
- `operator` (`required`, `preferred`, `avoid`, `note`)
- `value_text`
- `value_number`
- `value_boolean`
- `weight`

Examples:
- dock loading required
- rail preferred
- west end preferred
- excess office avoid
- heavy power required

## Why Phase 1 matters

This gives Tool B something concrete to match **against**.
Without structured requirements, the tool remains only a listing viewer.

## Phase 1 API

### Read/write requirements
- `GET /api/intel/requirements`
- `POST /api/intel/requirements`
- `GET /api/intel/requirements/:id`
- `PATCH /api/intel/requirements/:id`
- `GET /api/intel/requirements/:id/preferences`
- `PUT /api/intel/requirements/:id/preferences`

## Phase 1 UI

- Tool B page: Requirement list
- Tool B page: Requirement detail/edit
- keep this internal and simple first

---

# Phase 2, Matching

## New tables

### `intel_matches`
One row per requirement-to-listing candidate result.

Suggested fields:
- `id`
- `requirement_id`
- `listing_id`
- `match_bucket` (`strong`, `possible`, `stretch`, `manual_review`)
- `score` numeric
- `status` (`active`, `dismissed`, `shortlisted`, `hidden`)
- `generated_at`
- `generated_by` (`system_rule`, `manual`, `agent_assisted`)
- `explanation_summary`
- `created_at`
- `updated_at`

### `intel_match_reasons`
Multiple reasons per match for explainability.

Suggested fields:
- `id`
- `match_id`
- `reason_code`
- `reason_label`
- `reason_type` (`positive`, `negative`, `warning`, `missing_data`)
- `weight`
- `details_json`

Examples:
- within size range
- right submarket
- dock loading present
- yard unknown
- pricing missing
- stale listing, verify manually

## Matching rules, first version

Do this deterministically.

Examples:
- hard filter by market/submarket when explicitly required
- hard filter by size if outside acceptable bounds
- strong positive for fitting size band tightly
- strong positive for required dock/grade traits
- warning for unknown fields
- downgrade stale or removed inventory
- separate score from bucket so UI can explain both

## Phase 2 API

- `POST /api/intel/requirements/:id/match`
- `GET /api/intel/requirements/:id/matches`
- `GET /api/intel/matches/:id`
- `PATCH /api/intel/matches/:id` for manual disposition

## Phase 2 UI

- Requirement detail page gets a Match Results section
- user can view:
  - strong matches
  - possible matches
  - stretch matches
  - manual review
- each result must show reasons, not just rank

---

# Phase 3, Off-market / broker intel

## New tables

### `intel_private_notes`
Attach private notes to listings/properties/requirements.

Suggested fields:
- `id`
- `listing_id` nullable
- `requirement_id` nullable
- `property_id` nullable
- `author_user_id`
- `note_type` (`call_note`, `owner_note`, `availability_note`, `warning`, `strategy`)
- `body`
- `visibility` (`private`, `team`, `shareable_internal_only`)
- `created_at`
- `updated_at`

### `intel_properties`
Optional but valuable when multiple listings point to one building/site.

Suggested fields:
- `id`
- `normalized_address`
- `property_name`
- `market`
- `submarket`
- `lat`
- `lng`
- `clear_height_ft`
- `site_acres`
- `yard_possible`
- `rail_possible`
- `power_notes`
- `owner_name` nullable
- `management_company` nullable
- `created_at`
- `updated_at`

### `intel_property_availability_signals`
For gray-market / off-market hints.

Suggested fields:
- `id`
- `property_id`
- `source_type` (`broker_note`, `call`, `historical_listing`, `manual`, `agent_inference`)
- `confidence` (`low`, `medium`, `high`)
- `availability_status` (`rumored`, `possible`, `verified`, `stale`)
- `summary`
- `observed_at`
- `created_by_user_id`

## Why Phase 3 matters

This is the bridge from “listing tracker” to real broker intelligence.
It also creates the foundation for future agents to answer:
- what might fit, even if it is not publicly listed right now?

---

# Phase 4, Shortlists + brochures

## New tables

### `intel_shortlists`
- `id`
- `requirement_id`
- `title`
- `status`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `intel_shortlist_items`
- `id`
- `shortlist_id`
- `listing_id`
- `match_id` nullable
- `position`
- `broker_notes`
- `client_notes`
- `include_in_share` boolean
- `created_at`

### `intel_brochures`
- `id`
- `listing_id`
- `source_url`
- `storage_path` nullable
- `file_name`
- `mime_type`
- `retrieved_at`
- `hash`
- `is_current`

## Phase 4 API

- `POST /api/intel/shortlists`
- `GET /api/intel/shortlists/:id`
- `PUT /api/intel/shortlists/:id/items`
- `POST /api/intel/listings/:id/brochures`
- `GET /api/intel/listings/:id/brochures`

## Phase 4 UI

- create shortlist from matches
- reorder items
- broker notes vs client-facing notes
- eventually export/share

---

# API design principles

## 1. Bot-friendly, but not bot-only
Endpoints should be usable by:
- UI screens
- internal automation
- future agents/bots

## 2. Explanations are first-class
Never return only a score if a user or agent will need to trust the result.

## 3. Keep Tool B namespace clean
Continue using:
- `/tools/industrial-intel/*`
- `/api/intel/*`
- `intel_*` tables

## 4. Separate truth from presentation
The same match record should power:
- UI cards
- shortlist flow
- bot responses
- broker summaries

---

# What should stay deterministic vs AI-assisted

## Deterministic
- field normalization
- filtering
- match scoring base rules
- stale/removed handling
- shortlist membership

## AI-assisted later
- parsing messy brochures into candidate fields
- summarizing notes
- generating user-facing explanations
- drafting shortlist commentary
- proposing off-market follow-ups

---

# Safest implementation order from here

## Recommended next build sequence
1. `intel_requirements`
2. requirement CRUD endpoints
3. simple Tool B requirement page/form
4. deterministic match engine
5. `intel_matches` + `intel_match_reasons`
6. shortlist tables
7. brochure handling
8. private notes / off-market signals
9. agent/bot layer on top

---

# What not to do yet

Do **not**:
- merge Tool B data into Tool A `listings` / `workspaces`
- make AI the primary matching engine
- build the full toolbox shell yet
- mix demo-mode assumptions into Tool B truth
- build external sharing before shortlist objects exist

---

# Summary

The next concrete safe step after the current read-only slice is:

## Build requirements first.

That gives Tool B a real query target.
Then build deterministic matches.
Then build shortlist workflows.
Then let bots/agents use the same structured system.
