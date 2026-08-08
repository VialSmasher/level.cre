# Property-title evidence adapter

This adapter translates the PL Listing Prospects audit manifest into Level CRE's existing activity-event, entity-resolution, market-proposal, and Daily Desk contracts. It is evidence-first and has no write mode.

## Dry run

```powershell
pnpm exec tsx scripts/codex/build-property-title-evidence-dry-run.ts `
  --dry-run `
  --manifest "C:\path\to\property-audit-manifest.json" `
  --out-json "C:\path\to\dry-run.json" `
  --out-markdown "C:\path\to\dry-run.md"
```

Optional `--coordinates` and `--resolutions` JSON files are keyed by audit case ID. Coordinates must include `latitude`, `longitude`, `sourceUrl`, and `capturedAt`. Resolution snapshots must come from the read-only `POST /api/agent/entity-resolution` endpoint.

The command validates every generated event against `ActivityEventBatchSchema` and every eligible proposal against `MarketRecordProposalInputSchema`. It rejects duplicate external IDs before writing the local review artifact.

## Safety boundary

- Stable event identities include the audit case, record kind, source SHA-256, and a legal/entity discriminator when one file has multiple records; for example `plp:plp-br:title:<sha256>:242-123-456`.
- Corporate office, records-office, director, shareholder, and owner-mailing addresses are excluded from property fields and compact metadata.
- Folder-name-only, unresolved legal, corporate-only, multi-parcel, and root-inbox cases cannot create a market proposal.
- A municipally verified civic address without source-backed coordinates remains blocked.
- The adapter does not call an API, create a prospect/pin, promote an opportunity, log an interaction, or award XP.
- Patrick must approve the generated dry run before a separate ingestion command is designed or enabled.
