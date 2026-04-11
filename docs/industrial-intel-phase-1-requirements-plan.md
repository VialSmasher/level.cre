# Industrial Intel, Phase 1 Requirements Slice

## Purpose

This document turns the next Tool B step into a concrete repo plan.

Goal of Phase 1:
- add structured Tool B requirements
- keep Tool A requirement tables untouched
- create the minimum base needed for later matching

This phase should **not** build matching yet.
It should only create the requirement records that matching will use later.

---

# Scope

## In scope
- new `intel_*` requirement tables
- migration for those tables
- API module expansion under `/api/intel/*`
- basic list/detail/create/update endpoints
- minimal Tool B requirement UI later

## Out of scope
- automatic matching
- shortlist generation
- brochure storage
- sharing
- off-market signals
- Tool A requirement table integration

---

# Why a separate Tool B requirement model

Tool A already has requirements, but those are part of the existing app flow and are overloaded for a different product shape.

Tool B needs requirements that are specifically designed for:
- market inventory search
- explainable matching
- future bot/agent queries
- off-market search flags

Therefore:
- **do not reuse Tool A `requirements`**
- create new Tool B tables only

---

# Proposed schema

## 1. `intel_requirements`

### Purpose
One top-level record for each active client/inventory search.

### Suggested columns
- `id varchar primary key default gen_random_uuid()`
- `created_by_user_id varchar not null references public.users(id)`
- `title varchar not null`
- `client_name varchar`
- `status varchar not null default 'draft'`
- `deal_type varchar not null default 'lease'`
- `market varchar`
- `submarket varchar`
- `min_sf integer`
- `max_sf integer`
- `min_clear_height_ft numeric(6,2)`
- `max_budget_psf numeric(12,2)`
- `required_dock_doors integer`
- `required_grade_doors integer`
- `min_yard_acres numeric(10,2)`
- `power_notes text`
- `office_notes text`
- `timing_notes text`
- `special_notes text`
- `is_off_market_search_enabled boolean not null default false`
- `created_at timestamp default now()`
- `updated_at timestamp default now()`
- `archived_at timestamp`

### Notes
- keep this table simple and filter-friendly
- store only the highest-value structured fields here
- avoid premature over-modeling

## 2. `intel_requirement_preferences`

### Purpose
Flexible structured preferences attached to a requirement.
This avoids stuffing every trait into columns too early.

### Suggested columns
- `id varchar primary key default gen_random_uuid()`
- `requirement_id varchar not null references public.intel_requirements(id) on delete cascade`
- `key varchar not null`
- `operator varchar not null default 'preferred'`
- `value_text text`
- `value_number numeric(12,2)`
- `value_boolean boolean`
- `weight integer not null default 1`
- `created_at timestamp default now()`
- `updated_at timestamp default now()`

### Example rows
- key=`dock_loading`, operator=`required`, value_boolean=`true`
- key=`rail_access`, operator=`preferred`, value_boolean=`true`
- key=`excess_office`, operator=`avoid`, value_boolean=`true`
- key=`power_service`, operator=`note`, value_text=`heavy power`

---

# Suggested indexes

## `intel_requirements`
- index on `created_by_user_id`
- index on `status`
- index on `market`
- index on `submarket`
- index on `archived_at`

## `intel_requirement_preferences`
- index on `requirement_id`
- index on `(requirement_id, key)`

---

# Repo-level implementation plan

## 1. Schema file

### File
- `shared/schema.ts`

### Add
- Drizzle table definitions for:
  - `intelRequirements`
  - `intelRequirementPreferences`
- select/insert types
- optional Zod schemas for Tool B request validation if useful

### Important
Keep Tool B naming clearly separate from Tool A names.

---

## 2. SQL migration

### File
- new migration after `drizzle/0003_industrial_intel_core.sql`
- suggested name: `0004_industrial_intel_requirements.sql`

### Add
- create `public.intel_requirements`
- create `public.intel_requirement_preferences`
- add indexes

---

## 3. API repository methods

### File
- `apps/api/src/modules/industrial-intel/repo.ts`

### Add types
- `IntelRequirementListItem`
- `IntelRequirementDetail`
- `IntelRequirementPreference`
- `CreateIntelRequirementInput`
- `UpdateIntelRequirementInput`

### Add methods
- `getRequirements(userId: string)`
- `getRequirementById(userId: string, id: string)`
- `createRequirement(userId: string, input)`
- `updateRequirement(userId: string, id: string, input)`
- `replaceRequirementPreferences(userId: string, requirementId: string, prefs)`
- `getRequirementPreferences(userId: string, requirementId: string)`

### Rule
Every Tool B requirement should be user-scoped via `created_by_user_id`.

---

## 4. API service layer

### File
- `apps/api/src/modules/industrial-intel/service.ts`

### Add
Thin pass-through service methods for all requirement repository methods.

---

## 5. Route registration

### File
- `apps/api/src/modules/industrial-intel/registerRoutes.ts`

### Add endpoints
- `GET /api/intel/requirements`
- `POST /api/intel/requirements`
- `GET /api/intel/requirements/:id`
- `PATCH /api/intel/requirements/:id`
- `GET /api/intel/requirements/:id/preferences`
- `PUT /api/intel/requirements/:id/preferences`

### Validation
Use explicit request validation before inserts/updates.
Do not trust arbitrary JSON blobs from the client.

---

# Suggested API payload shapes

## `POST /api/intel/requirements`

```json
{
  "title": "West Edmonton lease requirement",
  "clientName": "Example Client",
  "status": "active",
  "dealType": "lease",
  "market": "Edmonton",
  "submarket": "West Edmonton",
  "minSf": 15000,
  "maxSf": 30000,
  "minClearHeightFt": 24,
  "maxBudgetPsf": 16.5,
  "requiredDockDoors": 2,
  "requiredGradeDoors": 1,
  "minYardAcres": 1.5,
  "powerNotes": "Heavy power preferred",
  "officeNotes": "Minimal office preferred",
  "timingNotes": "Need occupancy in Q3",
  "specialNotes": "Truck court matters",
  "isOffMarketSearchEnabled": true
}
```

## `PUT /api/intel/requirements/:id/preferences`

```json
[
  {
    "key": "dock_loading",
    "operator": "required",
    "valueBoolean": true,
    "weight": 5
  },
  {
    "key": "rail_access",
    "operator": "preferred",
    "valueBoolean": true,
    "weight": 2
  },
  {
    "key": "excess_office",
    "operator": "avoid",
    "valueBoolean": true,
    "weight": 2
  }
]
```

---

# UI plan after backend slice exists

## Suggested Tool B pages

### New pages
- `apps/web/src/tools/industrial-intel/pages/IndustrialIntelRequirementsPage.tsx`
- optional later: `IndustrialIntelRequirementDetailPage.tsx`

### First UI slice
Keep it minimal:
- list of requirements
- create requirement form
- edit panel or detail page

Do **not** build a complicated wizard first.

---

# Safety notes

## Safe
- new Tool B-only tables
- new Tool B-only endpoints
- user-scoped records
- no Tool A table reuse
- no auth model rewrite

## Avoid right now
- connecting these records to Tool A workspaces
- trying to auto-match immediately
- forcing launcher/auth changes beyond what is already done
- letting demo mode create false confidence for Tool B data truth

---

# Recommended next code order

1. add SQL migration for requirement tables
2. add Drizzle schema definitions in `shared/schema.ts`
3. add repository/service methods
4. add Tool B API routes
5. test endpoints with seeded auth context
6. add minimal Tool B requirements page
7. only then begin match engine work

---

# Success criteria for Phase 1

Phase 1 is successful when:
- a signed-in user can create a Tool B requirement
- the record lives in `intel_requirements`
- preferences can be attached in `intel_requirement_preferences`
- requirements can be listed/read/updated via `/api/intel/*`
- no Tool A tables were reused
- no Tool A flows were broken

---

# Summary

The safest next real build step is to make Tool B capable of storing structured requirements.
That is the minimum foundation needed before matching, shortlist generation, or future bot workflows become meaningful.
