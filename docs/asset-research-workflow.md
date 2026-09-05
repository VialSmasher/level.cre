# Asset profiles and research corrections

Patrick or Grok supplies the research and spreadsheets to Codex. Codex cleans the data, verifies property identities and source evidence, prepares the existing import format, and checks the result after import. Small property-type corrections can also be made directly in the signed-in Level CRE profile.

## Research handoff

Keep the original workbook and source references available. During cleanup, preserve title/LINC strings with leading zeros, original source rows, address and municipality, dates, confidence and any source qualifiers. Leave unknown answers blank. Distinguish the legal owner from the operating occupant, and the subject property from a corporate or mailing address. A title registration date is not a verified sale date or proof of continuous ownership.

Codex uses the existing [property inventory import](property-inventory-import.md) or [brokerage-memory workflow](brokerage-memory-workflow.md) as appropriate. The inventory importer expects a complete prepared JSON inventory document and replaces that inventory namespace on a matched property; it is not a sparse spreadsheet patch. Its dry run and report identify the intended changes. Brokerage memory has its own preview, staging and decision workflow. Resolve ambiguous identities before applying changes, preserve source evidence, and verify persisted records after import.

## Consistent property profiles

CRM properties and property memory share **Property**, **Contact** and **Activity** tabs. Their available details depend on the underlying record. A property without a CRM contact or interaction history can still be classified.

The persistent **M / S / Y / O / ?** control shows the full selected label and saves a type when selected:

| Button | Value | Label |
| --- | --- | --- |
| M | `multi_tenant` | Multi-tenant |
| S | `single_tenant` | Single-tenant |
| Y | `developed_land` | Developed land / yards |
| O | `office` | Office |
| ? | `unknown` | Unclassified / other |

Classification describes the property independently of relationship status, pursuit type, ownership or occupancy. One known occupant does not by itself establish single tenancy. The exact values come from [propertyClassification.ts](../packages/shared/src/propertyClassification.ts); `land_yard` is not accepted.

Grey **?** property markers mean the effective property type is unclassified. They do not indicate that the property lacks research or is unavailable. Colored markers use the saved or imported property type. Other map cues can describe relationship or review state separately.

## Corrections and evidence

A CRM property's effective type is its broker correction, otherwise its imported inventory type, otherwise `unknown`. **Use imported type** removes the correction and restores the source type. **Clear correction** removes a correction when no imported type is available. Selecting **?** explicitly records an unclassified/other correction; it is different from removing a correction.

The correction stores its value, broker identity and review timestamp. It preserves the original research classification and supporting evidence; it does not upgrade research confidence, approve evidence, change prospect status or create an interaction.

Pending property memory can be classified while it remains in Review. Its suggested prospect match is not a confirmed link. Approved memory linked to a CRM property uses that CRM property's classifier. Approved standalone memory saves its own correction. A local preview must be persisted through the existing memory workflow before its type can be saved.

## Browser automation

Grokbot or Codex can use the following selectors when the user authorizes browser corrections. Scope them to the open profile and verify the civic address, municipality and any unit/parcel distinction before each change.

| Selector or attribute | Contract |
| --- | --- |
| `data-testid="asset-profile"` | Open asset profile |
| `data-asset-kind`, `data-asset-id` | Typed identity: `prospect`, `memory_item`, `dossier` or an unsaved `local_preview` |
| `asset-tab-property`, `asset-tab-contact`, `asset-tab-activity` | Common tab test IDs |
| `asset-type-<value>` | Type button test ID, using the exact value from the table above |
| `asset-type-label` | Full selected label |
| `asset-classification` / `data-classification` | Classifier test ID and effective selected value |
| `asset-type-save-status` / `data-save-state` | Save status: `idle`, `pending`, `success`, `error` |
| `asset-type-reset` | Reset button, when a correction exists |

```text
Open the intended asset and read its typed identity and address.
Read Property and the supporting evidence.
If the classifier is disabled or this is a local preview, do not attempt a save.
If the desired button is already aria-pressed="true", record unchanged.
Otherwise click the desired asset-type-<value> button.
Wait for asset-type-save-status data-save-state="success".
On error, record failed; do not count the visual selection as saved.
Reopen the same asset and verify its identity and selected type.
Record the before/after type, source and outcome in the work log.
```

Re-read the profile identity after navigation. Marker color, list position and generated local `csv-*` IDs are not stable identity evidence. A demo-mode save is not a production save.

## Buildings and occupant records

A company/occupant record can be linked to an existing building record without merging contacts, notes, ownership, activity or relationship stages. Use **This is an occupant? Link to a building** in the profile, then select the exact building. **Building & occupants** switches between the building and its companies; Contact and Activity always belong to the selected record. Property classification edits target the building. **Change link → Unlink** restores a separate map pin.

The map renders one property per explicit building link, uses the building's classification and coordinates, and includes occupants' relationship/pursuit types when filtering. Unlinked records remain independent, even at the same address. Missing, inaccessible, malformed or cyclic links never hide a record. This association does not establish ownership or verify a lease, and does not infer single tenancy from the number of known occupants.

`PATCH /api/prospects/:occupantId/property-link` accepts exactly:

```json
{"propertyProspectId":"EXACT-BUILDING-ID","expectedPropertyProspectId":null}
```

Both records must be editable by the signed-in broker, including existing workspace editor rights. Scoped agent map writes remain prohibited. Set `propertyProspectId` to `null` to unlink; supply the current linked building ID as `expectedPropertyProspectId`. An identical retry is a no-op; a stale change returns 409. Links cannot nest or cycle. The response is `{id, aiMetadata, unchanged}`. Current association and its change history are stored in the occupant's existing metadata. General metadata updates preserve these fields; they cannot create associations. A classification PATCH against an occupant returns 409: classify its building instead.

Browser agent selectors: `property-records` (`data-property-id`), `property-record-select`, `property-link-toggle`, `property-link-search`, `property-link-target-<buildingId>`, `property-link-remove`, and `property-link-save-status` (`data-save-state`). The profile exposes both `data-asset-id` (selected CRM record) and `data-property-id` (building). `property-classification-target` identifies the record receiving classification edits. Research spreadsheets should retain exact record IDs and, when supported by evidence, identify a separate building ID for Codex to link. Do not auto-link by distance or address alone.

## Classification route reference

| Target | Route | Response |
| --- | --- | --- |
| CRM property | `PATCH /api/prospects/:id` | Saved prospect, including classification metadata |
| Pending memory | `PATCH /api/intel/brokerage-memory/items/:id/classification` | Typed target and classification |
| Approved standalone memory | `PATCH /api/intel/brokerage-memory/dossiers/:id/classification` | Typed target and classification |

For a correction, send `{"propertyClassification":"multi_tenant"}`. To clear the correction, send `{"propertyClassification":null}`. Do not send the inventory document along with a classification correction. The memory routes strictly accept that one field and return this shape:

```json
{
  "target": {"kind": "dossier", "id": "EXAMPLE-DOSSIER-ID"},
  "propertyClassification": {
    "classification": "multi_tenant",
    "source": "broker",
    "reviewedAt": "2026-09-04T18:00:00.000Z",
    "reviewedBy": "EXAMPLE-BROKER-ID"
  }
}
```

After a memory reset, `propertyClassification` is `null`. These corrections require broker authentication; scoped agent credentials cannot write broker corrections. Verify that the response identity matches the requested target. A `409` means the record changed, was merged, or should be classified through its linked prospect. Refresh and verify the canonical identity before retrying; do not redirect a pending match to a prospect automatically.

Implementation references: [classification service](../apps/api/src/lib/brokerageMemoryClassification.ts), [memory target selection](../apps/web/src/features/property-memory/classification.ts), [classifier control](../apps/web/src/features/map/PropertyClassificationControl.tsx), and [CRM routes](../apps/api/src/routes.ts).
