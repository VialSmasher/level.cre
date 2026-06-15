# SurveySync Agent Workflow

SurveySync is the agent-facing intake layer for Industrial Intel property dossiers. The goal is to let a broker or assistant collect old surveys, flyers, photos, and notes from local files or email, then push structured property packages into Level CRE for broker review and survey reuse.

## Current Contract

Agents can already use the normal authenticated HTTP API to:

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

Facts should stay `proposed` when an agent extracted them from imperfect source material. Facts become `approved` only after broker review, or when the broker/agent has explicit permission to mark a broker-provided fact as approved.

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
