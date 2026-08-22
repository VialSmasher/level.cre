# Legacy CRM Background Maintenance

Level CRE treats the map and its activity history as the useful CRM record. This maintenance workflow consolidates only high-confidence legacy duplicates and converts map-ready property-memory review items into background enrichment.

## Safety policy

- Every operation starts with a read-only plan and a stable plan hash.
- Apply requests fail when the underlying plan has changed.
- Duplicate merges require a corroborated shared place and shared identity.
- Records with distinct companies or contact emails are never auto-merged.
- A legacy address-only pin may be absorbed into a richer record at the same normalized civic address.
- Each applied merge uses the existing serializable merge transaction and creates its own auditable, reversible merge event.
- Brokerage-memory maintenance is additive. It approves map-ready location, municipal, and brokerage context while leaving uncertain legal and ownership facts out of the automatic pass.
- Items without a usable address and map coordinate remain small exceptions; they are not deleted or rejected automatically.

## Duplicate dry run

`GET /api/prospects/duplicate-merges/maintenance-plan?limit=25`

The response separates candidate groups into `safe_to_merge` and `leave_separate`. It includes the recommended canonical record, signals, blockers, a summary, and the plan hash.

Apply only the safe portion of the unchanged plan:

`POST /api/prospects/duplicate-merges/maintenance`

```json
{
  "planHash": "<hash from dry run>",
  "runKey": "legacy-cleanup-2026-08-22",
  "limit": 25,
  "maxMerges": 10,
  "confirmation": "apply_safe_merges"
}
```

The result returns each merge event ID. The existing merge undo endpoint remains available for an applied event.

## Property-memory dry run

`GET /api/intel/brokerage-memory/maintenance/plan?limit=250`

The response separates map-ready background approvals from unplaceable exceptions.

Apply the unchanged plan:

`POST /api/intel/brokerage-memory/maintenance`

```json
{
  "planHash": "<hash from dry run>",
  "runKey": "property-memory-cleanup-2026-08-22",
  "limit": 250,
  "maxItems": 25,
  "confirmation": "approve_map_ready_memory"
}
```

Applied decisions retain the source, run key, plan hash, and `map-first-additive-enrichment` policy in their provenance.
Large backlogs are intentionally processed in batches of at most 50 items. Generate a fresh dry run between batches so changed matches and prior approvals are never acted on from a stale plan.
