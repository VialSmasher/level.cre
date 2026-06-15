# SurveySync Agent Workflow

SurveySync is the agent-facing intake layer for Industrial Intel property dossiers. The goal is to let a broker or assistant collect old surveys, flyers, photos, and notes from local files or email, then push structured property packages into Level CRE for broker review and survey reuse.

## Current Contract

Agents can already use the normal authenticated HTTP API to:

0. Discover the active agent contract.
   - `GET /api/intel/agent-manifest`
   - Use this as the first call in a new Codex/Hermes session.
   - It returns auth modes, supported upload types, endpoint paths, invariants, and the recommended SurveySync flow.

1. Run a higher-level SurveySync job when the agent already has structured property/source-file intent.
   - `POST /api/intel/agent/surveysync-jobs`
   - This can create/select a survey, add inventory listing items, create or match property dossiers, add proposed facts, and return signed upload URLs for original brochures/flyers/photos.
   - If a dossier does not have a canonical inventory listing, it is saved but not added to the survey map yet. Direct dossier-to-survey map items are still a planned capability.

1. Create or update a property dossier.
   - `POST /api/intel/dossiers`
   - `PATCH /api/intel/dossiers/:id`

2. Request a signed upload URL for source material.
   - `POST /api/intel/dossiers/:id/assets/upload-url`
   - Supported files: PDF, JPG, PNG, WebP.
   - Current max file size: 25 MB.

3. Upload the file to Supabase Storage with the returned signed token.

4. Mark the asset upload complete.
   - `POST /api/intel/assets/:assetId/complete`

5. Propose or save dossier facts.
   - `POST /api/intel/dossiers/:id/facts`
   - `PATCH /api/intel/dossiers/:id/facts/:factId`

6. Extract proposed facts from an uploaded PDF asset.
   - `POST /api/intel/dossiers/:id/assets/:assetId/extract`
   - The asset must already be uploaded and marked `active`.
   - Current extraction support is PDF-only. PPTX is intentionally not enabled until we add a proper zip/XML parser.

Facts should stay `proposed` when an agent extracted them from imperfect source material. Facts become `approved` only after broker review, or when the broker/agent has explicit permission to mark a broker-provided fact as approved.

## Agent Authentication

Browser-based agents can use the broker's normal Supabase user session.

Server-to-server agents such as Hermes can use an optional static agent key when the deployment sets:

- `INTEL_AGENT_API_KEY`
- `INTEL_AGENT_USER_ID`
- optional `INTEL_AGENT_EMAIL`
- optional `INTEL_AGENT_NAME`

The agent sends either:

- `Authorization: Bearer <INTEL_AGENT_API_KEY>`
- or `X-LevelCRE-Agent-Key: <INTEL_AGENT_API_KEY>`

The API treats requests as the configured `INTEL_AGENT_USER_ID`, so the agent sees and writes the same owner-scoped dossiers, surveys, requirements, and assets every time. This is intentionally simple for the current MVP. The next production hardening step is scoped agent tokens, narrower permissions, and a review UI for audit events.

## Agent Smoke Test

After setting the production environment variables, run:

```bash
LEVELCRE_API_BASE_URL=https://<api-host> INTEL_AGENT_API_KEY=<key> npm run intel:agent-smoke
```

The smoke test calls:

- `GET /api/intel/agent-manifest`
- `GET /api/intel/dossiers`
- `GET /api/intel/surveys`
- `POST /api/intel/agent/surveysync-jobs` with `dryRun: true`
- `GET /api/intel/agent-events`

This is the first command a new Codex/Hermes setup should run before attempting file ingestion.

## Agent Audit Events

Authenticated agent-key calls under `/api/intel` are logged to `intel_agent_events`.

The audit log stores request metadata only: user id, agent name, request id, method, path, action, status, duration, and small metadata such as query keys and content type. It does not store uploaded source material or full request bodies.

## Expected Agent Behavior

An agent should treat the dossier as the reusable source of truth for a property:

- Match by normalized address first.
- Reuse an existing dossier when confidence is high.
- Create a new dossier only when the property cannot be matched.
- Upload original source files before proposing extracted facts.
- Preserve source filenames and asset types.
- Prefer many small proposed facts over one unreviewable blob.
- Never overwrite approved facts silently.
- Keep internal notes out of client-facing survey fields unless a broker approves them.

## Example Flow

Broker prompt:

> Find recent survey packages in my Trenton Cold Storage folder, identify each property page, upload the PDFs/photos to Level CRE, and propose facts for each property.

Agent steps:

1. Search local files for relevant PDFs/PPTX/images.
2. Extract candidate properties by address/title/page.
3. Call `GET /api/intel/dossiers` and match against existing dossiers.
4. Create missing dossiers.
5. Upload source files to each dossier.
6. Propose facts:
   - site size
   - building size
   - asking price
   - price per acre
   - zoning
   - comments
   - source page/file reference
7. Leave proposed facts for broker approval.

## Missing Pieces To Build Next

- Agent/service-token auth so external assistants do not need a browser session.
- A bulk intake endpoint for many files and facts in one job.
- Background extraction jobs for PDFs/PPTX/images.
- Property matching confidence records.
- Asset page/image previews.
- Survey export templates that consume approved dossier facts.

## Agent Intake Contract To Add

To let Codex, Claude CoWork, or another broker-controlled assistant populate Level CRE from PowerPoint decks and brokerage flyers, add a SurveySync job API:

1. `POST /api/intel/surveysync/jobs`
   - Accepts a job name, optional requirement or survey id, and a manifest of local files, email attachments, or cloud-file references.
   - Returns a job id and upload targets for each file.

2. `POST /api/intel/surveysync/jobs/:id/files/:fileId/complete`
   - Marks each uploaded PowerPoint, PDF, image, or brochure as available for extraction.

3. Worker step: extract properties and assets.
   - PPTX: split slides by property section, preserve page images, detect address/title/price/size/zoning notes.
   - PDF: split pages, store page previews, extract text and key facts.
   - Images: store photos/aerials/site plans as property assets.

4. Worker step: match or create property dossiers.
   - Match first by normalized address.
   - Then compare title, coordinates, municipality/submarket, and known listing ids.
   - Store match confidence and require broker review below the confidence threshold.

5. `POST /api/intel/dossiers/:id/facts/bulk`
   - Writes proposed facts with source file/page references.
   - Approved facts should only be written directly when the source is broker-authored or explicitly confirmed by the broker.

6. `POST /api/intel/surveys/:id/items/from-dossiers`
   - Adds matched dossiers/listings to a survey.
   - Uses approved dossier facts and primary assets to populate the client card.

The key rule: agents should be able to upload and propose, but the app should keep broker approval as the quality gate before anything becomes client-facing.

## Implemented First Slice

The first shippable slice is dossier-level PDF extraction:

1. Create or select a dossier.
2. Upload a PDF brochure or tear sheet to the dossier.
3. Mark the uploaded asset complete.
4. Call `POST /api/intel/dossiers/:id/assets/:assetId/extract`.
5. Review proposed facts in the Dossiers page.

Validated locally against `2959 Parsons Road Tear Sheet.pdf`. The extractor identified address, market, submarket, listing type, building size, land size, clear height, zoning, and loading from the source PDF.
