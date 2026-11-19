# Private relationship maintenance

Patrick authorized hands-off relationship maintenance on November 19, 2026: import the reviewed starting broker links and maintain company contacts and broker connections as Codex works on BD or researches a company. Routine sourced updates do not need a second approval. This does not authorize sending messages, changing deals, creating prospects or sharing private information.

## Operating workflow

Use `scripts/codex/use-levelcre-relationships.ps1`. It reads a Windows-user-encrypted credential from `%USERPROFILE%/.codex/secrets/levelcre-relationships.json`, checks its owner against the live manifest and only calls the fixed production API. Never print the credential or use another broker's configuration. Patrick's verified owner is `cca487b3-eb6f-4e67-b8b3-0a6ac5728099`, account `livingstonpatrick1@gmail.com`.

```powershell
./scripts/codex/use-levelcre-relationships.ps1 -Action Manifest
./scripts/codex/use-levelcre-relationships.ps1 -Action Search -Query 'Sysco'
./scripts/codex/use-levelcre-relationships.ps1 -Action Company -Id '<owned prospect UUID>'
./scripts/codex/use-levelcre-relationships.ps1 -Action Broker -Id '<broker UUID>'
./scripts/codex/use-levelcre-relationships.ps1 -Action Maintain -BodyFile '<private UTF-8 JSON file>'
./scripts/codex/use-levelcre-relationships.ps1 -Action Finding -BodyFile '<private UTF-8 JSON file>'
./scripts/codex/use-levelcre-relationships.ps1 -Action Changes
```

Resolve an existing owned company by its name, location, domain and legal entity. Read its brief before researching and before changing anything. People attach to that exact company with one or more roles: real estate, operations, facilities, finance, director, or unknown. Do not invent a title to fill a branch. Broker profiles are reusable nodes; link the same broker ID to each supported account. Preserve national versus local scope and historical versus current representation.

Save attributable company contacts and broker connections directly with `Maintain`. Record only minimal facts, source reference and original evidence date. Keep full correspondence and corporate-search documents in their established private project locations. A director needs exact legal entity, jurisdiction, source and search date. A directorship does not establish real estate decision authority. Keep uncertain identity or inferred roles in `Finding`; contradictory broker evidence stays in the private work summary until resolved, without overwriting an established link.

## Maintenance request

All requests require `externalKey`, `kind` and `evidence: {kind,reference,asOf,fact}`. Evidence kinds are `public_source`, `correspondence`, `broker_direction`, `corporate_search`. Use an original source date and stable message/document identity. The external key identifies one change, such as source identity + account + person + changed field. Retry the exact same payload and key. New evidence gets a new key. A 409 requires a fresh read and reconciliation, not a blind version bump.

- `kind: broker`: `id` UUID and full `broker` object: `name`, `firm`, `office`, `email`, `phone`, `linkedinUrl`, `sourceUrl`, `notes`, `version`. New records use version 0; existing records use the returned version. Search first to avoid a second profile. Only save verified business contact details and actual LinkedIn profile URLs.
- `kind: relationship`: `id` UUID and full `relationship`: `brokerId`, `prospectId`, `status`, `scope`, `notes`, `sourceUrl`, `learnedOn`, `version`. Status is `unverified`, `historical`, `ended` or `active`. Active requires attributable correspondence or Patrick's direction establishing current representation; a biography is insufficient. An ended relationship remains discoverable.
- `kind: contact`: `prospectId`, `contact: {name,email?,company?,title?,directoryContext}`. To update a saved person, also send their exact `contactId` and `expectedSnapshot` from the fresh brief's `snapshotToken`. Contact names and existing email identities cannot be replaced through this route. Existing blank emails and phone updates continue through their established verified enrichment workflows. No phone fields are accepted here.

`directoryContext` contains `roles`, `sourceType`, `sourceRef`, `asOf`, `evidenceStatus: observed`, optional `scope`, `notes`, `legalEntity`, `jurisdiction`, `registryNumber`. Source types: `broker_knowledge`, `company_website`, `corporate_search`, `email`, `linkedin`, `other`. Corporate searches require legal entity and jurisdiction. New contacts should have decisive person/company evidence; a shared address or guessed email does not establish identity.

Read the company/broker brief after each successful mutation and verify the intended identity, fields, source and scope. Exact replays are deduplicated. Maintenance preserves an owner-private journal of evidence, prior values and result IDs. It grants no activity points, sends no mail and creates no prospects, map pins or opportunities. Archive/remove operations remain explicit broker edits.

## Catch-up and immediate use

The existing **Evening Level CRE Sync** owns scheduled catch-up. Its existing weekday 6:15 p.m. schedule is retained. The **Sync with Codex** button uses the same current automation instructions through the installed local worker. The computer must be available in Patrick's signed-in Windows session for this local work to run.

During normal company research and BD work, use the same relationship workflow immediately. During evening or button-triggered runs, maintain only existing companies touched by that run's authorized correspondence/research, bounded to 20 companies. Extract attributable roles, employer/legal entity, introductions and explicit broker account statements. Do not turn recipients, CC membership, an introduction or an old biography into a current representation claim. Avoid a duplicate research automation.

Button-triggered workers inherit `LEVELCRE_DIRECTORY_SYNC_REQUEST_ID`. The client attaches it to maintenance and finding requests automatically. Do not add the run ID to evidence keys or alter it: the API checks that it belongs to the authenticated owner's running sync. Replaying the same evidence during a later run returns the original result without another journal entry. The server derives saved contact, broker, link and pending-finding counts from these durable records, separately from the worker's bounded company-review count. An incomplete relationship check cannot report an overall complete sync. Older workers report `Check not reported` rather than implying that a check happened.

Relationships is available under **Tools** in desktop navigation and the account menu on mobile. The sync receipt links to **Recent updates**, which shows saved changes and their source dates; the selected company graph refreshes while open. **Needs review** appears for pending findings on that company. The clickable trail returns to earlier companies and brokers. A link's **Noted** date is when the relationship was learned, not the transaction date.
