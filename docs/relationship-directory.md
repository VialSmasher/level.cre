# Daily Desk company relationship map

## Relationship landing and pending-call visibility

The landing page previews existing companies as small relationship diagrams. Recently opened companies are stored as at most six identifiers per authenticated broker in this browser, beginning with visits after this release. The API resolves them against current owner-bound records, including merged accounts. Recent conversations use confirmed emails, recorded call attempts and meetings in the past 90 days, ordered by their original occurrence time. Future, draft and inferred activity does not qualify. Saved broker links and sourced relationship changes provide another set of starting companies, with existing records as a fallback. Sections do not repeat the same company.

Previews retain historical/ended broker labels, named contacts, unknown roles and actual counts. Opening one goes directly to its graph; All companies returns to the landing page. Viewing a company does not write activity, contacts, prospects or points. The overview is a broker-only, no-store read endpoint; browser history and query caches are owner-scoped. It requires no migration or automation change.

The pending-call provider remains global so navigation cannot discard an unfinished call, but its floating bar renders only on the Map route. Calls keeps its own pending confirmation interface. Relationships, Today, Activity and other pages no longer inherit the floating call panel.

Validation: 63 unique directory, ownership/authentication, contact, demo-isolation and history tests passed, the API TypeScript check and both builds passed. The web TypeScript check retains 34 existing diagnostics, none in the changed files. Chrome checks covered company previews, return navigation, persistence after reload, search and the 390-pixel mobile layout. Run `npm --workspace @apps/web run test:relationships` for the browser-data checks. Release identifiers and live checks follow after deployment.

Demo relationships use only fictional browser fixtures (Sample Distribution Co., Sample Manufacturing Ltd., Jordan Example, Alex Sample and Taylor Example), with an explicit read-only sample notice. An unsupported demo read or write stops locally instead of falling through to the authenticated API. Explicit demo requests also cannot access any directory endpoint, even when accompanied by a valid broker credential. Real history/query caches remain separate from demo history. The earlier loopback review used researched mockup examples and was not the public demo; it now displays only these fictional samples.

The November 19 read-only live ownership audit verified `livingstonpatrick1@gmail.com`, owner `cca487b3-eb6f-4e67-b8b3-0a6ac5728099`, against the server's relationship and sales/sync bindings and the installed local credentials. That owner held 256 active contact records, five brokers, seven account links and 15 maintenance changes. There were zero cross-owner contact/link references and zero demo contact, broker, link or change rows. All five private contact/directory tables retained row-level security and denied direct anonymous/browser-role access. The installed personal relationship client now also pins this exact owner independently of its credential file and refuses identity drift. Other brokers continue to require their own harness.

## Sync verification and navigation iteration

Current API: `609b098c580f886ad8ca730289ab588496193636`, Railway deployment `4093e182-623c-4a4d-8a82-f5cfb084d266` verified successful. Current website: `13899963e2588841ed0b949117ddd3dc97aa8be2`, Vercel deployment `dpl_DPHCUMA2bjMey4n2dXS4T4un7mK3`, verified on `level-cre.vercel.app`. The installed Windows worker and local relationship client match the tested API release. Schedule and credentials are unchanged.

The November 19 live button run returned a partial receipt with 28 activity records and 11 items for review. It saved three sourced contact titles in the relationship journal: Don Clement at Mission Building Supplies, Ray at Proline, and Sean Demidovich at Waymarc. President titles were retained without inventing real estate authority. A ZoomInfo credit limit and a phone identity conflict remained unresolved; neither prevented the supported contact-title updates from being saved. No new email address was saved and the final activity outbox was empty.

The second live button run completed with 14 companies checked, one broker profile and one account link saved, zero new contacts and zero new pending relationship findings. Both saved changes carry that run's ID and match the server-derived receipt. Jeff Drouin Deslauriers's own signature supports his C&W Edmonton profile; Don Clement's November 18 statement supports a current unspecified deal with Mission/MBS. The property, exclusivity and wider mandate remain expressly unconfirmed. The 26 reconciled email messages were duplicates, with nine remaining in activity review; the UI therefore labels this activity count **reconciled**, not newly recorded. No new addresses were saved, the final outbox was empty and the unresolved phone lookup mismatch retained its research cooldown.

The follow-up iteration adds Relationships to desktop Tools and the mobile account menu, a company/broker navigation trail, visible relationship scope and learned dates, a source-backed Recent updates panel, clearer review controls and mobile graph positioning. Sync receipts separate relationship checks from saved changes. Counts come from durable owner-bound writes correlated to the exact run; the new worker/client attach that correlation automatically, without changing evidence identities. No new migration is required.

Validation: 59 backend tests and four worker tests passed, plus the API TypeScript check and both builds. The full web TypeScript check retains existing errors; none were reported in the changed files. Simulations cover three concurrent identical writes, replay during a later run, stale edits, wrong-owner/run rejection, source-key conflicts, partial completion and receipt delivery retries without repeating the mailbox scan. Three live replays of Sean Demidovich's original sourced update returned the same contact, one unchanged journal entry and the original saved timestamp. Chrome review verified company-to-broker-to-account navigation, the return trail, the updates panel and 390-pixel mobile navigation/layout. Gemini reviewed screenshots in three passes; verified suggestions were applied while retaining the graph. Its apparent desktop sidebar offset was a full-page screenshot artifact, not a browser layout defect. Its final mobile review found no remaining visual blocker, with nested touch scrolling left as a device-use watch item. A live follow-up fixed explicitly labeled company switchboards appearing as people with unconfirmed roles.

## Hands-off maintenance rollout

On November 19, 2026 Patrick authorized importing the reviewed mockup and maintaining the graph during company research and BD. Initial API release `c68dfffbfc1e0f27395478ce3b2b7f94088c7aee` added a separately enabled, owner-bound maintenance endpoint and private change journal. Railway deployment `f42f7359-f577-464f-a439-5d08fb23c023` served that release before the sync iteration above. The website remains compatible and displays the imported records.

The live import contains four C&W brokers and six connections across five existing companies: Hagerty to Sysco, PepsiCo and Canada Bread; Frizalone to Sysco; Jackson to Siemens; Sethney to Eaton. Four links are historical and two are ended. Scope and source notes are retained; no current local representation is inferred. Hagerty's published business email and direct office number are saved. Signed-in browser verification confirmed the ended Siemens link and Hagerty's three-account graph and contact details.

Patrick's dedicated private credential is installed with Windows user encryption and a user-only file ACL. The verified account is `livingstonpatrick1@gmail.com`. The personal `level-cre-relationships` skill, existing Outlook BD skill and root project instructions point to [the maintenance workflow](relationship-maintenance.md) and `scripts/codex/use-levelcre-relationships.ps1`. The existing Evening Level CRE Sync prompt was updated, retaining its weekday 6:15 p.m. schedule, model, reasoning and project. The existing Sync with Codex button reads that same prompt; no extra automation or button was created.

Validation: all 58 authentication/directory/contact tests passed, the API TypeScript check passed, and the API build passed. Imported broker/link writes were verified through fresh owner-bound API reads. Uncertain contact/director evidence still uses findings, and ordinary broker-only approvals remain protected. Routine sourced maintenance requires the dedicated key plus explicit deployment opt-in, an original source/date, an idempotency key and fresh versions/snapshots. It cannot modify phone readiness, create prospects, send messages, award activity, change opportunity stages or share records.

## Original graph production release

Released November 19, 2026 with Patrick's explicit production approval. Application commit `dfb5cdfe76f6d841093edd2358d8996d7782c2b9` is live at [Daily Desk](https://level-cre.vercel.app/app/desk) and [Company relationships](https://level-cre.vercel.app/app/desk/relationships).

- Railway API deployment `edc51a5a-fda5-44e6-9a26-f428a4696f9b` is successful. The prior healthy API remained available while a first attempt was rejected by the migration checksum check.
- Vercel production deployment `dpl_3HkirU8d9rVTnNGyP5S55BgUzCC5` is ready, reports the approved Git SHA, and serves the production aliases.
- Migrations `0023_relationship_directory.sql` and `0024_relationship_graph.sql` were committed together at `2026-11-19T15:22:27.181Z`. Read-only database verification confirmed their exact checksums, the JSONB contact context column, RLS, and denied direct access for `anon` and `authenticated` on all three directory tables.
- Signed-in production browser verification covered the Daily Desk link, Sysco and Siemens searches, the graph, Jesse Soyao's existing contact details and LinkedIn search, and the director form. No test contacts or preview broker links were imported into production.
- API health returns 200. Anonymous directory and agent-manifest requests return 401. The successful deployment's logs show no application errors in the release check. Vercel returned no runtime error records. Its optional drains inventory endpoint returned 404, so drain configuration was not verified.
- Dedicated account-intelligence and market-record agent credentials are not configured in the live API environment. The agent endpoints are deployed and accept broker sessions, but unattended scoped-agent access remains unconfigured. Existing sync-worker credentials were not changed.

The retained release package is `C:/Users/patri/.codex/visualizations/2026/11/18/01a1f06d-a3fe-79e1-b5f1-63dd8f2163ec/levelcre-release-dfb5cdf`. The source archive and deployed migration files use LF for migrations 0018 through 0024. Windows `git archive` produced CRLF in these SQL files and caused the first attempt's historical checksum mismatch. Normalize only CRLF to LF before deploying, then compare 0018 through 0022 byte for byte with the previous live package or migration ledger. Never change an already-applied migration or rewrite its ledger checksum to bypass the guard.

## Product behavior

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

The same external key and payload return the same finding. Reusing a key with different evidence is rejected. Agents cannot approve their own pending findings. Pending findings do not create contacts, prospects, map pins, activity credit, outreach or opportunities. The separately enabled maintenance rollout above now allows sourced direct contact and broker-link updates under Patrick's standing authorization; it preserves this findings/review path for uncertainty.

## Privacy and continuity

Ownership comes from the authenticated session or owner-bound credential. Browser database roles cannot directly access the private tables. Broker and relationship edits reject stale versions. Duplicate account connections are rejected. Archived records remain stored. Existing links and pending findings are discoverable through merged company records. Accepting a finding resolves the surviving account while retaining the original finding, legal entity and source.

## Verification and local review

Run `npm --workspace @apps/api run test:directory`, `node --import tsx --test apps/api/src/auth.test.ts apps/api/src/lib/prospectContactService.test.ts`, `npm run build:web`, and `npm run build:api`.

The November 19 graph review passed all 13 authentication/directory tests and all 45 contact regression tests. The directory integration test covers contact persistence, ownership, invalid URLs, concurrent edits, stale/duplicate links, archive visibility, corporate-search requirements, scoped agent access, idempotent findings, conflicting evidence, broker-only approval, inferred-role gaps and merged company review. The broad TypeScript check still reports existing project errors, with none reported in the changed graph files under the ES2022 check.

Browser review covers company search, company-to-broker-to-account navigation, email/phone/LinkedIn links, the director source form, saved contact evidence across reloads, graph controls and responsive layout. The local review server is `http://127.0.0.1:49232/app/desk/relationships?company=sysco`. The ignored runner is `work/calling-simulation/directory-preview.ts`. Its isolated database and screenshots are under Patrick's Codex visualization folder for this chat. It contains five source-backed company examples and four researched brokers. Named contacts retain unknown roles where evidence is missing.

The local preview remains available for design review. Any later import of its reviewed starting relationships must match Patrick's owned company IDs and retain their source notes and historical status. Production release and remaining agent-credential setup are recorded above.
