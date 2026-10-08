# Phone enrichment

The phone-enrichment endpoints fill verified business phone information on a broker's existing company records. They do not record sales activity or create prospects, map assets, interactions, receipts, or XP.

## Authentication and ownership

The agent routes use `requireSalesActivityAuth`. A verified broker session or a configured sales-activity harness credential determines the actor through `getUserId`; a payload-supplied user ID cannot select the owner. Demo writes are rejected. The legacy agent middleware permits only the exact GET context, GET needs-number, POST research-status and POST batch paths for the proper sales credential, rather than opening the general agent namespace.

Responses use `Cache-Control: private, no-store`. Keep exported research context and enrichment results broker-private, outside version control and shared pursuit material. Never include credentials in payloads, evidence URLs, or saved research.

## Read-only research context

`GET /api/agent/phone-enrichment/context?limit=1000`

The optional limit is an integer from 1 to 1000; the default is 1000. Unknown query fields are rejected. The result contains an authenticated actor envelope, `rows`, and `total`. Each row exposes existing company identity, address, website, the primary `expectedContact` snapshot, active owned contact IDs and phone choices, a pending-call flag, and phone-enrichment provenance.

The query includes only the authenticated broker's unmerged records whose status is not `no_go`. It does not reconcile or create contact anchors, consume an ingestion window, read activity history, notes, message bodies, or mailbox/outbox contents, or export the full metadata object. A limited response is a bounded cohort, not pagination or proof that every owned record was returned.

## Verified batch input

`POST /api/agent/phone-enrichment/batch`

The strict body accepts 1 to 100 entries. Every entry requires `prospectId`, one explicit `contactPhone`, nested `phoneEvidence`, and the exact `expectedContact` snapshot obtained for the intended existing target. Optional identity fields are `contactId`, `contactName`, `email`, and `company`.

Synthetic example of an existing named contact's verified business mobile:

```json
{
  "entries": [
    {
      "prospectId": "existing-owned-prospect-id",
      "company": "Existing Company Name",
      "contactId": "existing-owned-contact-id",
      "contactName": "Existing Contact Name",
      "email": "contact@example.test",
      "contactPhone": "+1 780-555-0100",
      "expectedContact": {
        "name": "Existing Contact Name",
        "email": "contact@example.test",
        "phone": null
      },
      "phoneEvidence": {
        "kind": "contact_direct",
        "directNumberType": "mobile",
        "source": "zoominfo",
        "providerId": "verified-source-contact-id",
        "observedAt": "2026-10-07T18:00:00Z",
        "verified": true
      }
    }
  ]
}
```

Evidence kinds are `contact_direct` and `company_main`. Optional `directNumberType` is `mobile` or `office` and is valid only for `contact_direct` when the source explicitly supports that subtype. Never infer mobile from number formatting, area code or an unlabeled phone; a supported but untyped person-specific number remains untyped direct evidence. Sources are `company_website`, `official_directory`, `zoominfo`, `email_signature`, and `broker_confirmed`. Web sources require a public HTTP(S) URL without embedded credentials. ZoomInfo requires a URL or stable provider ID. Signature evidence requires a stable provider message ID. All evidence requires an ISO timestamp with an offset and literal `verified: true`; evidence more than five minutes in the future is held for review. Do not attach message bodies.

A direct number must match the existing person's name or email without conflicting identity fields. Use an owned active `contactId` to target an additional contact, and supply that contact's current name, email, and phone in `expectedContact`. A verified matching direct number can fill an empty phone. A fresh snapshot also permits replacement of an explicitly reported bad number, while keeping the same verified person. Healthy saved phones stay protected. Additional supported mobile/office evidence preserves the healthy scalar phone and appends a verified second number in `additionalPhones` labelled `Mobile` or `Direct office`, instead of replacing the existing number merely to change dial preference. An unlabeled legacy number is not thereby proven mobile or office. It does not create a guessed person.

A company main line must match the existing company identity and omit `contactId`. It creates or reuses a separate nonprimary contact labelled “Company main line” with title “Company switchboard”. It preserves the named primary person's phone and email. A mainline is company context, does not satisfy the named person's phone gap, and is excluded from default person calling readiness. Describe corporate/shared routing accurately in research evidence; a corporate line does not verify an Edmonton facility or named person's direct number.

## Conflict and retry rules

The service locks the owned prospect and any selected contact before checking identity and applying changes. Missing or foreign targets cannot be enriched. Merged targets require the surviving record. Inactive records, stale snapshots, conflicting existing phones, invalid or ambiguous phone text, malformed provenance, and an observed pending call produce review results rather than an overwrite. Phone changes remain separate from the frozen target of an active calling session.

Results contain `applied`, `unchanged`, `needsReview`, `errors`, and per-entry status/reason/evidence; the route adds a request ID. Entries commit separately. A typed entry error rolls back that entry, while earlier successful entries can remain committed. After an uncertain batch response, read fresh context and reconcile before retrying. Preserve the same evidence observation on retries: equivalent applied evidence is recognized, but a new snapshot or a different existing phone must be reviewed.

Only owned contact phones, contact relationships, provenance, and relevant update timestamps change. Backfill uses this endpoint, not a synthetic email or activity event. Existing verified-email ingestion may capture optional evidenced phone data, but its dispatch verification and activity identity remain independently authoritative.

When a verified activity is initially unmatched, its sanitized phone capture remains in the private import payload. A later manual or verified-map link replays that evidence through the same enrichment helper inside the link transaction. Same-link retries can recover a pending-call deferral without adding another interaction or credit. The response returns a separate `phoneEnrichment` result; an accepted email link does not prove the phone was applied. Ignore decisions do not replay phone capture. Foreign contact IDs, mismatched identity, unverified evidence and existing-phone conflicts remain reviewable.

The intake preserves supplied phone evidence; it does not discover numbers by itself. Research the actual existing person in the email relationship, matched by company/name and exact email. Prioritize their verified business mobile, then direct office. Reuse a correctly attributed saved number and inspect that person's received signature, including prior replies if the latest outreach is unanswered. If person-specific evidence is unavailable, perform an authorized exact-person ZoomInfo lookup. A generic company contact page or mainline never completes enrichment, and another employee's phone does not complete the intended recipient's phone gap. Corroborating named-person team pages can support direct evidence. Keep exact identity, supported mobile/office subtype, source and observation date; unresolved identity, access or credit limits remain explicit gaps. Backfill uses the phone-only endpoint with a fresh target snapshot. Signature capture excludes the broker's signature, fax numbers and unrelated quoted contacts. A phone-capture failure never causes a real email to be sent again.

## Missing-number research and broker feedback

`GET /api/calling/needs-number?limit=25` is a signed-in broker list shared by Desk and Calls. `GET /api/agent/phone-enrichment/needs-number?limit=20&eligibleOnly=true` is the same owned research cohort for Codex. Active, identifiable companies without a usable person-specific saved choice are ranked with due follow-ups first. Mainline-only accounts remain in the research cohort; do not substitute a switchboard for the intended email contact. A named primary contact with a saved email and no usable person-specific phone receives `missing_primary_contact_number` even when another employee has a callable direct number. Alternative personal choices remain available manually, but do not resolve the primary email contact's gap. Address-only property labels, foreign records, merged records and no-go records are excluded. Pending calls and research cooldowns prevent automated work on an unsafe or recently checked target.

`POST /api/agent/phone-enrichment/research-status` accepts a current `expectedSnapshotToken` and one of `not_found`, `conflicting`, `identity_unclear` or `access_blocked`. The default retry is 14 days, bounded to 1–90 days. Retry of the same result does not extend its cooldown. Changed company/contact/phone state requires refreshed context.

Wrong number and Disconnected are confirmed call-attempt outcomes. The existing frozen session determines the person and exact number, the attempt earns only normal call credit once, and the finding blocks that choice on that owned record. Another usable person-specific choice keeps the company callable; otherwise it enters Needs a number. A mainline alone does not keep it callable. Source retries cannot revive a reported bad number. Verified replacement preserves the old finding and person identity. Generic metadata edits/imports cannot erase these findings or phone provenance.

Both the call queue/workspace and Desk sales brief derive readiness from the same active contact roster, current legacy primary identity, labeled additional numbers, and bad-number findings. A company routing line remains separate company context and is excluded from the default person call queue. Within a person's choices, verified mobile precedes direct office; supported untyped direct evidence remains below those typed choices.

The existing Evening Level CRE Sync performs a bounded weekday refill of up to 20 eligible companies at 6:15 p.m., targeting existing named email contacts with saved/signature evidence first, then authorized exact-person ZoomInfo research. Earlier correspondence can supply a signature even when the latest outreach has no reply. Company-main discovery does not count as a completed person refill. A missing or unauthorized endpoint stops only refill, not verified activity recording. The morning brief is read-only. Source access and credit restrictions remain in force.

## Validation

Focused API and browser regression receipts are maintained in the private release report. API type checking and bundling are required before release. Coverage includes credential actor binding and the exact legacy path allowlist, strict nested evidence and required snapshots, foreign/merged targets, read-only context privacy, direct versus company-main attribution, existing-phone preservation, pending-call and stale-snapshot conflicts, repeated evidence, and verified-email capture compatibility.

Relevant source files are `apps/api/src/auth.ts`, `apps/api/src/routes.ts`, `apps/api/src/lib/phoneEnrichmentService.ts`, and their associated API tests. These checks do not substitute for source verification or a broker's review of a disputed company/contact match.

## Codex workflow handoff

Research sheets feed through Codex and the existing authorized account import/link workflow. Preserve the verified phone with the exact saved prospect/contact IDs, company/person match, direct/main kind, source-supported mobile/office subtype, source URL or stable provider ID, and original observation date. After the owned record is resolved, send a phone-only sidecar to the enrichment batch endpoint with a fresh `expectedContact` snapshot. A sheet cell alone does not verify a number. This handoff does not create an app spreadsheet UI, duplicate an account, change a property address, or invent an email/call to install a number.

The recorder's local `phoneEnrichment` summary exposes `reported`, `applied`, `unchanged`, `needsReview`, `errors`, `unconfirmed`, and per-entry `results` containing activity/source identity, prospect/contact IDs, status and reason. It excludes raw phone evidence and message content. These phone verdicts remain separate from email acceptance, activity `needsReview`, and retained activity outbox counts. A phone-review failure never authorizes resending a real email. Missing or unrecognized verdicts cannot establish a saved phone; `applied`/`unchanged` also require fresh owned-context readback to confirm the intended usable number and attribution.

The agent repair queue at `GET /api/agent/phone-enrichment/needs-number?limit=20&eligibleOnly=true&includeReportedBad=true` includes current blocked choices for replacement research even when the company has a usable alternate; the UI Needs a number list remains limited to companies with no usable person-specific choice, including mainline-only accounts. Preserve healthy choices. Automatic replacement requires the exact reported-bad primary/direct or Company main line and fresh context; a blocked labeled `additionalPhones` slot remains held for explicit review/contact editing instead of overwriting a healthy primary/main field. Pending-call exclusions and research cooldowns apply to this repair lane as well.
