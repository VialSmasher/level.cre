# Level CRE Agent Handoff

## Product shape

- **Tool A**: the existing live Level CRE app.
- **Tool B**: Industrial Intel, a separate parallel tool being built in the same repo.
- **Future state**: Level CRE may later become a lightweight toolbox shell that launches Tool A and Tool B, but **that is not v1**.

## Core rules

1. **Do not disturb the live Tool A app.**
2. Keep Tool A on the existing `/app/*` routes.
3. Build Tool B separately on `/tools/industrial-intel/*`.
4. Keep Tool B APIs under `/api/intel/*`.
5. Use **new `intel_*` tables only**.
6. **Do not reuse** overloaded Tool A tables like `listings`, `workspaces`, `listing_prospects`, or the current `requirements` tables for external inventory.
7. Keep Industrial Intel behind a feature flag at first.
8. Optimize for the **safest read-only first slice** before any ingestion automation or production scheduling.

## Repo shape

### Web
- `apps/web/src/tools/industrial-intel/`
  - `ToolLayout.tsx`
  - `pages/`
  - `components/`
  - `hooks/`
  - `lib/`

### API
- `apps/api/src/modules/industrial-intel/`
  - `registerRoutes.ts`
  - `repo.ts`
  - `service.ts`
  - `matching.ts`
  - `ingest/`
  - `jobs/`

### Data
- Add new `intel_*` tables in `shared/schema.ts`
- Add new migrations in `drizzle/`
- Keep Tool A schema untouched unless absolutely necessary

## Industrial Intel MVP

Build order:
1. Add feature-flagged Tool B routes.
2. Add separate Tool B layout.
3. Add read-only intel API stubs.
4. Add core `intel_*` schema and migrations.
5. Render placeholder/read-only pages from new intel tables only.
6. Add manual import and ingest-run logging.
7. Add change/diff generation.
8. Add Intel requirements CRUD.
9. Add matching.
10. Add shortlist actions and brochure/source links.
11. Add scheduler last.

## Markets in scope

- Edmonton
- Nisku
- Leduc
- Leduc County
- Acheson
- Sherwood Park
- Strathcona County
- Fort Saskatchewan

## Source direction

Prototype/source work already started outside the app and should be treated as seed logic for Tool B.
Current known sources include:
- Spacelist
- Cushman
- CWEDM
- CBRE
- Colliers
- JLL
- Cresa
- NAI
- Royal Park
- Saville/Savills
- Avison

## Matching vision

Industrial Intel is meant to support tenant requirement matching, for example:
- size
- market/submarket
- grade loading
- dock loading
- crane
- office buildout
- yard
- power
- budget
- timing

Initial matching should be **rule-based and explainable**, not opaque.
Results should be grouped as:
- strong matches
- possible matches
- stretch matches
- manual follow-up required

## Workflow intent

The end goal is to move from listings ingestion to client-ready shortlists.
This includes:
- structured listings
- brochure links/files later
- requirement intake
- match output
- shortlist generation
- share-ready client material

## Safety

- Prefer branches over direct work on `main`
- Protect the live app first
- Keep Tool B isolated until confidence is high
