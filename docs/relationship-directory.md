# Daily Desk company relationship map

The Daily Desk opens `/app/desk/relationships`. Search an owned company, contact or broker to open its graph. A company branches into brokerage relationships, real estate, operations, facilities, finance/CFO and directors. Clicking a broker opens their other connected accounts with email, phone and LinkedIn access. Existing contacts with unknown roles have their own branch. Empty primary-contact snapshots are not displayed as people.

Company contacts use the established contact service and remain private. Broker profiles and account connections use migration `0023_relationship_directory.sql`. Migration `0024_relationship_graph.sql` adds contact context and private agent findings. Both are in the API startup migration runner. No sample contacts, brokers or relationships are seeded by either migration.

## Evidence and corporate searches

Each contact can have several roles, a responsibility scope, source type/reference, source date, evidence status and notes. A corporate-search connection requires the exact legal entity, jurisdiction, source reference and search date. Registry number is optional. A director connection does not establish authority over real estate. The graph displays source observations and inferences separately, and inferred roles do not close research gaps.

Broker connections retain current, historical, ended or unverified status, geographic/account scope, notes, source URL and date learned. New manual links default to unverified. Broker biographies naming a parent company do not establish representation of a local subsidiary. Company contacts open a LinkedIn people search. Broker profiles can store a verified LinkedIn URL.

## Agent workflow

Use the owner-bound `ACCOUNT_INTELLIGENCE_AGENT_API_KEY` and `ACCOUNT_INTELLIGENCE_AGENT_USER_ID` with `Authorization: Bearer <key>` or `X-LevelCRE-Account-Intelligence-Key`. Existing owner-bound market-record credentials can also read and propose. Broker JWTs are supported. General intel and sales-only keys cannot access this private graph. No payload-supplied owner is accepted.

1. Read `GET /api/intel/directory/manifest` for the contract.
2. Search `GET /api/intel/directory/search?search=<company-or-person>` and resolve the exact account.
3. Read `GET /api/intel/directory/companies/:id/brief`. The result includes contacts, roles, coverage gaps, sourced broker links, pending findings and reasoning rules.
4. Follow `GET /api/intel/directory/brokers/:id/brief` to connected accounts. Keep scope, dates and historical status in the answer.
5. Research missing roles from authorized sources. Stage contacts or directors with `POST /api/intel/directory/findings`.
6. Patrick reviews the finding in the graph. `POST /api/desk/directory/findings/:id/review` with `decision: accepted | rejected` requires broker authentication. Acceptance atomically saves the contact and review status, preserves the evidence status, and is safe to retry.

Finding shape, using fictional values solely to illustrate the contract

```json
{
  "externalKey": "stable-source-and-person-identity",
  "prospectId": "resolved-owned-account-id",
  "contact": {
    "name": "Example Director",
    "title": "Director",
    "directoryContext": {
      "roles": ["director"],
      "sourceType": "corporate_search",
      "sourceRef": "Exact retained corporate-search file reference",
      "asOf": "2026-11-19",
      "legalEntity": "Example Company Ltd.",
      "jurisdiction": "Alberta",
      "evidenceStatus": "observed",
      "scope": "Recorded directorship only. Property decision authority not established."
    }
  }
}
```

The same external key and payload return the same finding. Reusing a key with different evidence is rejected. Agents cannot approve their own findings or write confirmed broker relationships. Pending findings do not create contacts, prospects, map pins, activity credit, outreach or opportunities. Broker relationship changes remain explicit broker edits in this release. This release exposes agent tools, it does not schedule research or install a new live credential.

## Privacy and continuity

Ownership comes from the authenticated session or owner-bound credential. Browser database roles cannot directly access the private tables. Broker and relationship edits reject stale versions. Duplicate account connections are rejected. Archived records remain stored. Existing links and pending findings are discoverable through merged company records. Accepting a finding resolves the surviving account while retaining the original finding, legal entity and source.

## Verification and local review

Run `npm --workspace @apps/api run test:directory`, `node --import tsx --test apps/api/src/auth.test.ts apps/api/src/lib/prospectContactService.test.ts`, `npm run build:web`, and `npm run build:api`.

The November 19 graph review passed all 13 authentication/directory tests and all 45 contact regression tests. The directory integration test covers contact persistence, ownership, invalid URLs, concurrent edits, stale/duplicate links, archive visibility, corporate-search requirements, scoped agent access, idempotent findings, conflicting evidence, broker-only approval, inferred-role gaps and merged company review. The broad TypeScript check still reports existing project errors, with none reported in the changed graph files under the ES2022 check.

Browser review covers company search, company-to-broker-to-account navigation, email/phone/LinkedIn links, the director source form, saved contact evidence across reloads, graph controls and responsive layout. The local review server is `http://127.0.0.1:49232/app/desk/relationships?company=sysco`. The ignored runner is `work/calling-simulation/directory-preview.ts`. Its isolated database and screenshots are under Patrick's Codex visualization folder for this chat. It contains five source-backed company examples and four researched brokers. Named contacts retain unknown roles where evidence is missing.

The graph release is local and has not been deployed. Production rollout requires the additive migrations and API/web deployment. Any later import of the reviewed starting relationships must match Patrick's owned company IDs and retain their source notes and historical status.
