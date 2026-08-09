# Level CRE brokerage-memory workflow

Level CRE treats enriched title/property files as source-backed property memory, not as a batch of new prospects.

## Durable flow

1. `POST /api/intel/brokerage-memory/preview` parses and resolves the file in memory. It performs database reads only.
2. `POST /api/intel/brokerage-memory/imports` saves one pending review item per canonical property. The request must include the hash returned by preview.
3. Today → Review presents one card per property with location, municipal, legal, ownership, and brokerage-context evidence groups.
4. A signed-in broker can approve selected groups or reject the item. Approval creates or safely enriches a property dossier and inserts idempotent source facts in one transaction.
5. `GET /api/intel/brokerage-memory/map` projects approved dossiers and pending review anchors onto the main map.

Linked property memory enriches the existing prospect pin. It does not create a second pin, change prospect status, overwrite notes/follow-ups/manual geometry, create XP, or force passive market memory into the active prospect funnel.

## Identity and conflict rules

- Canonical import identity is the sorted municipal-account set, with legal/source fallbacks. Coordinates are evidence and may change without creating a new property.
- Exact memory key, municipal account, title/LINC, or a close address-and-coordinate combination may produce an automatic link suggestion.
- Address alone is never auto-linked. Distinct parcels may share a civic address.
- Existing dossier fields and linked prospect geometry are preserved unless a broker explicitly chooses verified coordinates.
- Conflicted or unresolved anchors stay visible in the amber Review layer.

## Agent boundary

Agents may preview, stage, and read proposals with the scoped market-record credential. Only a broker-authenticated user can call the decision endpoint. The approval path never creates prospects or awards XP.

For a Codex-assisted run:

```powershell
# Read-only by default
.\scripts\codex\stage-levelcre-brokerage-memory.ps1 -SourcePath 'C:\path\to\enriched.json'

# Explicitly persist proposals to Today → Review
.\scripts\codex\stage-levelcre-brokerage-memory.ps1 -SourcePath 'C:\path\to\enriched.json' -SaveToReview
```

## Safe release and pilot

1. Deploy backend/schema changes before exposing the frontend workflow. Railway's API `prestart` hook applies the ordered, checksummed `drizzle/0018_brokerage_memory.sql` and `drizzle/0019_prospect_merge.sql` migrations in one transaction before the new server begins listening.
2. Confirm Railway starts through `npm start` (or `npm --workspace @apps/api run start`) so the API workspace `prestart` lifecycle runs. If the service bypasses npm lifecycle scripts, run `npm --workspace @apps/api run brokerage-memory:migrate` in its production shell before starting the new API.
3. In Railway logs, verify `Level CRE brokerage-memory migrations are current` appears before the API begins listening. `GET /health` proves only that the database is reachable; also verify the deployed commit at `GET /api/version`, an authenticated `GET /api/prospects`, `GET /api/prospects/duplicate-merges/candidates`, and `GET /api/intel/brokerage-memory/search`.
4. Deploy the frontend only after those backend checks pass. Vercel previews use the production Railway API, so preview merge actions also target production data.
5. Stage the 60-title / 55-property source and verify zero prospect mutations and zero canonical dossier writes.
6. Approve only a small pilot: one exact existing property, one clean new memory property, and one conflict case. Duplicate consolidation must first be previewed and explicitly confirmed by the broker.
7. Reload the main map and verify one-pin composition, provenance, story detail, property-memory search, and preserved manual fields before processing the remaining queue.

Do not use `db:push` or `db:prepare`. Both commands intentionally fail closed because the reviewed SQL migrations contain constraints, partial indexes, expression indexes, and audit protections that must not be reconciled by an unmanaged Drizzle push. The raw SQL migration chain is the schema authority for these tables. The `brokerage-memory:migrate` command is incremental and assumes the baseline Level CRE schema already exists; it is not a fresh-database bootstrap.
