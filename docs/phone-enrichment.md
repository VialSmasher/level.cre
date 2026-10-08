# Phone enrichment

The phone-enrichment endpoints fill verified business phone information on a broker's existing company records. They do not record sales activity or create prospects, map assets, interactions, receipts, or XP.

## Authentication and ownership

Both routes use `requireSalesActivityAuth`. A verified broker session or a configured sales-activity harness credential determines the actor through `getUserId`; a payload-supplied user ID cannot select the owner. Demo writes are rejected. The legacy agent middleware permits only the exact GET context and POST batch paths for the proper sales credential, rather than opening the general agent namespace.

Responses use `Cache-Control: private, no-store`. Keep exported research context and enrichment results broker-private, outside version control and shared pursuit material. Never include credentials in payloads, evidence URLs, or saved research.

## Read-only research context

`GET /api/agent/phone-enrichment/context?limit=1000`

The optional limit is an integer from 1 to 1000; the default is 1000. Unknown query fields are rejected. The result contains an authenticated actor envelope, `rows`, and `total`. Each row exposes existing company identity, address, website, the primary `expectedContact` snapshot, active owned contact IDs and phone choices, a pending-call flag, and phone-enrichment provenance.

The query includes only the authenticated broker's unmerged records whose status is not `no_go`. It does not reconcile or create contact anchors, consume an ingestion window, read activity history, notes, message bodies, or mailbox/outbox contents, or export the full metadata object. A limited response is a bounded cohort, not pagination or proof that every owned record was returned.

## Verified batch input

`POST /api/agent/phone-enrichment/batch`

The strict body accepts 1 to 100 entries. Every entry requires `prospectId`, one explicit `contactPhone`, nested `phoneEvidence`, and the exact `expectedContact` snapshot obtained for the intended existing target. Optional identity fields are `contactId`, `contactName`, `email`, and `company`.

Synthetic example of a company routing line:

```json
{
  "entries": [
    {
      "prospectId": "existing-owned-prospect-id",
      "company": "Existing Company Name",
      "contactPhone": "+1 780-555-0100",
      "expectedContact": {
        "name": "Existing Contact Name",
        "email": "contact@example.test",
        "phone": null
      },
      "phoneEvidence": {
        "kind": "company_main",
        "source": "company_website",
        "url": "https://company.example.test/contact",
        "observedAt": "2026-10-07T18:00:00Z",
        "verified": true
      }
    }
  ]
}
```

Evidence kinds are `contact_direct` and `company_main`. Sources are `company_website`, `official_directory`, `zoominfo`, `email_signature`, and `broker_confirmed`. Web sources require a public HTTP(S) URL without embedded credentials. ZoomInfo requires a URL or stable provider ID. Signature evidence requires a stable provider message ID. All evidence requires an ISO timestamp with an offset and literal `verified: true`; evidence more than five minutes in the future is held for review. Do not attach message bodies.

A direct number must match the existing person's name or email without conflicting identity fields. Use an owned active `contactId` to target an additional contact, and supply that contact's current name, email, and phone in `expectedContact`. A verified matching direct number can fill an empty phone; it does not create a guessed person.

A company main line must match the existing company identity and omit `contactId`. It creates or reuses a separate nonprimary contact labelled “Company main line” with title “Company switchboard”. It preserves the named primary person's phone and email. Describe corporate/shared routing accurately in research evidence; a corporate line does not verify an Edmonton facility or named person's direct number.

## Conflict and retry rules

The service locks the owned prospect and any selected contact before checking identity and applying changes. Missing or foreign targets cannot be enriched. Merged targets require the surviving record. Inactive records, stale snapshots, conflicting existing phones, invalid or ambiguous phone text, malformed provenance, and an observed pending call produce review results rather than an overwrite. Phone changes remain separate from the frozen target of an active calling session.

Results contain `applied`, `unchanged`, `needsReview`, `errors`, and per-entry status/reason/evidence; the route adds a request ID. Entries commit separately. A typed entry error rolls back that entry, while earlier successful entries can remain committed. After an uncertain batch response, read fresh context and reconcile before retrying. Preserve the same evidence observation on retries: equivalent applied evidence is recognized, but a new snapshot or a different existing phone must be reviewed.

Only owned contact phones, contact relationships, provenance, and relevant update timestamps change. Backfill uses this endpoint, not a synthetic email or activity event. Existing verified-email ingestion may capture optional evidenced phone data, but its dispatch verification and activity identity remain independently authoritative.

## Validation

The focused API regression run passed 98 of 98 checks, and API type checking and bundling passed. Coverage includes credential actor binding and the exact legacy path allowlist, strict nested evidence and required snapshots, foreign/merged targets, read-only context privacy, direct versus company-main attribution, existing-phone preservation, pending-call and stale-snapshot conflicts, repeated evidence, and verified-email capture compatibility.

Relevant source files are `apps/api/src/auth.ts`, `apps/api/src/routes.ts`, `apps/api/src/lib/phoneEnrichmentService.ts`, and their associated API tests. These checks do not substitute for source verification or a broker's review of a disputed company/contact match.

