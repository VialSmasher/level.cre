# Property research inventory

Property classifications are stored in the existing prospect `aiMetadata.propertyInventory` namespace. They are independent of lifecycle status and brokerage pursuit type. Imports add `listing_prospect` as a pursuit type; an `on_market` source signal does not change a prospect into Patrick's listing.

The map provides four colored layers: multi-tenant (purple, larger M markers), single-tenant (blue S), developed land/yards (amber Y), and office (teal O). Map filters include a multi-tenant priority preset and a Nisku inventory preset that fit the relevant assets and reset other map filters. Other CRM records can be shown or hidden separately. All research confidence levels, including low and unrated, are visible by default. Low and unrated individual markers have amber borders.

Signals match any selected value within a group and all selected groups together. Counts describe the full inventory before the other map filters. Ownership, covenant and market signals preserve source research; they are not independent verification. CoStar research present includes an unsuccessful CoStar lookup. A partial CoStar record does not confirm tenancy. LastSaleDate is displayed as title registration and is not represented as a verified sale.

## Repeatable import

Prepare a JSON array matching `PropertyInventoryRecordSchema` in `packages/shared/src/propertyInventory.ts`. Keep the source workbook outside Git. Include original source rows, original title strings (with leading zeros), source file hash, research notes, raw CoStar building-area text, and source qualifiers. Never sum multiple-building areas or take a sibling building's year as the subject's year.

Combine repeated civic addresses before importing, retaining every title/legal/date record in `titleRecords`. Use supplied coordinates only. Missing or invalid coordinates must be listed in the QA report and excluded from the prepared array. Do not merge an unnamed nearby pin without identity evidence.

Set `DATABASE_URL` and `LEVELCRE_USER_ID` from the authorized deployment environment without printing them. Run a dry run first:

```powershell
npx tsx scripts/codex/import-property-inventory.ts --input prepared-inventory.json --report import-preview.json
```

After reviewing the concrete plan, run the same command with `--apply` and a distinct report path. The user's import request supplies authorization; no additional confirmation is needed unless a classification change or ambiguous identity requires their decision.

The importer locks this import path per owner, matches civic address within its municipality context, then falls back to title identity. Multiple matches fail the transaction. Exact repeated payloads are no-ops. Existing contact fields, notes, lifecycle and geometry are preserved, and other metadata is retained. New records are created as research prospects. Imported inventory does not generate sent-email events or production XP. The report records IDs and before metadata for updates.

Verify the persisted inventory counts and title count, then rerun the dry run: created and updated must both be zero. Check the map presets, confidence and signal filters, and a selected property's title/notes details after deployment. The import test exercises the SQL transaction, rollback, owner isolation, exact replay and metadata preservation using PGlite; the PostGIS constructors are represented by JSON geometry functions in that test.
