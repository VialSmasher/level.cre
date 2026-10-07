# Calling pilot simulation and release preparation

October 7, 2026. This report records a read-only production snapshot, local simulation work, and the release audit. No real phone call, production activity write, recurring automation change, push, or deployment has been performed as part of this work.

## Snapshot and simulation scope

The production Supabase project is `glgeqzgyvefcelzmdnte`, reported healthy with PostgreSQL 17.6. Direct project lookup and read-only SQL succeeded after the connector's project list showed only an unrelated inactive project. Broker identity was confirmed against the live authentication record, with 616 owned prospects.

Eight broker-owned records were copied into a private, Git-ignored local snapshot: six callable companies, one record needing phone review because it contains multiple numbers, and one record without a phone number carrying a reviewed occupant-to-building link. The linked building is not owned by this broker, so it was excluded; no foreign building record was read.

The snapshot includes the live table columns, constraints, and indexes, 16 relevant rows in each of interactions, events, and imports (48 total), 685 owned skill-ledger rows, and the broker's profile, user, and skills records. Activity baselines cover the eight-record cohort, not the complete history of all 616 prospects. The local checks preserve each selected prospect's contact, geometry, and metadata, with activity attributed to that exact owned prospect.

The final transaction rehearsal passes 21 independent assertions using PGlite PostgreSQL 18.3/WASM and captured schema evidence from production PostgreSQL 17.6. It imports the isolated release's calling service and its actual production, pulse, scorecard, queue, and badge readers, with source fingerprints recorded. The live-main reader includes stronger deduplication and additional badge definitions than the older development tree; those implementations were preserved and tested directly. Separate fresh-row and UTC-midnight cases verify the stored call XP streak starts at one and compares prior UTC timestamps on the Edmonton calendar day.

Five local confirmations produced exactly five stored calls, 75 stored follow-up XP with matching ledger entries, and five mapped production actions. The final release browser cohort's canonical production total increased from 15 to 20; stored follow-up XP increased from 1,080 to 1,155, and the cohort's Warm Line five-call badge unlocked. Copied assets stayed at eight. Production, badge, and coverage baselines cover this cohort, not global live totals. A phone-link click alone earned no call, conversation, or XP credit. Replays added nothing; a forced SQL failure rolled back the event, interaction, and XP together. The copied contacts, property metadata, profiles, source snapshot, and geometry stayed unchanged.

PostGIS is not executed: geometry is serialized GeoJSON retained as opaque text. Multi-connection concurrency, deployed authentication/RLS, and real dialer handoff have not been tested. Skills, profile, and header responses use thin SQL-backed local adapters; the full deployed `/api/skills` handler, global level/streak calculations, and their header display remain controlled-pilot acceptance boundaries. An empty email-message schema was added for the current production reader; all copied interaction email-message links were NULL, so no email contents or outside-cohort records were needed.

Read-only live trigger inspection found four noninternal change-broadcast triggers on prospects, events, interactions, and skill activities. They send only a table notification to the owning broker's private channel and catch realtime errors; they do not mutate records or XP. Supabase realtime delivery is not exercised in the local rehearsal. Explicit frontend query invalidation is verified.

Read-only production checks at `2026-10-07T20:35:05Z` and, after the final release rehearsals, `2026-10-07T20:54:29Z` found the eight prospects and broker skills unchanged and zero phone-link events/interactions. No simulated activity entered production. Actual company names, phone numbers, source records, screenshots, and detailed SQL/browser reports remain in ignored local evidence folders.

## Verified production identity

| Surface | Verified identity |
| --- | --- |
| GitHub | `VialSmasher/level.cre`, default branch `main`, commit `37fb07ff0ee5b5140b82b16392ddefa46faed4c5` |
| Frontend | [level-cre.vercel.app](https://level-cre.vercel.app), ready production deployment `dpl_49RGkPBaXQBJXdndMxSycTbffM9Y` at that same commit |
| Vercel project/team | `prj_V33jNd3OsliNsuZ8W0PRR3cLtGFw` / `team_mPgSEsLPWy43Kj5VAwLVfDzk` |
| API | [Production API version](https://levelcre-production.up.railway.app/api/version) reports that same commit |

The production commit is titled **Link occupants to buildings for one classified map property**. Its calling service/client modules are absent and its route source has no `/api/calling/` handlers. The original development checkout is the older `codex/scorecard-production-first` branch at `300b9f0`, with more than 90 modified/untracked status entries during the audit. Its cached `origin/main` was stale at audit start and was subsequently fetched to the verified `37fb07f` before the calling worktree was created. The original dirty checkout must not be bulk-staged or deployed.

The existing `.release/account-intelligence` directory is a registered, clean but unrelated worktree at `683e1930`. It is not a calling release package.

## Smallest release slice

A managed isolated worktree at `C:/Users/patri/.codex/worktrees/calling-pilot/level.cre` now holds the narrow calling patch on `codex/calling-pilot`, based on the verified production commit. Telemetry, property classification, occupant/building links, the current Home selection guard, and current production/badge readers are preserved:

| Area | Required change |
| --- | --- |
| New runtime files | `apps/api/src/lib/mobileCallingService.ts`, `apps/api/src/lib/callingActivityPrivacy.ts`, `apps/web/src/lib/mobileCalling.ts`, and `apps/web/src/pages/mobile-calls.tsx` |
| API route integration | Calling import plus queue, start, discard, and outcome handlers in `apps/api/src/routes.ts` |
| Frontend integration | Calling lazy import/route in `App.tsx`, supporting Calls navigation and Today active state in `AppLayout.tsx`, and the existing Start calling link in `daily-desk.tsx` |
| Retry/shared types | A `keepalive` request option in `queryClient.ts` and `attempted` in the shared interaction outcome type; the database column already accepts that value |
| Private activity | Calling-origin exclusion in public pursuit snapshots and non-owner shared pursuit counts, dates, Tool A history, and Supabase fallback reads |
| Verification | Calling/privacy unit tests and entries in existing test commands, both mocked and copied-data Playwright configurations/specs, and narrow ignored evidence paths |

The current calling implementation requires no new npm dependency or calling schema migration. It uses the existing prospects, activity events/links, contact interactions, skill activities, and broker skills tables. Existing authentication, XP helpers, profile hooks, and voice dictation components are already on the production base. Unrelated harness, account intelligence, map, and credential changes should not be copied wholesale from the dirty checkout.

The live property model distinguishes the selected occupant record from its linked building. Contact and Activity stay with the selected record; property classification targets the building. A call must keep the exact selected prospect/occupant ID, including when the linked building is unavailable. It must not infer tenancy or ownership, or transfer the call to a building simply because the map groups those records.

The patch excludes phone-link interactions identified by `contact_interactions.source_provider = level_cre_mobile` or their linked `activity_events.source = level_cre_mobile_calling`. Public snapshots exclude them before the result limit. Shared reads keep the authenticated broker's own calls and exclude other brokers' private call rows, notes, counts, and dates. A real SQL regression checks public visibility, owner visibility, aggregates, and fallback parity. No automatic activity share event is introduced; any future activity sharing must be a separate sanitized action. The default **I called** attempt preserves prospect status and last-contact fields. Optional explicit connected outcomes can update those fields on the selected prospect, and they follow the existing record-sharing rules. The full unrelated sharing/harness implementation and optional demo fixtures were not copied.

## Local release verification

| Check | Result |
| --- | --- |
| Copied-data SQL rehearsal using release modules | 21/21 assertions pass |
| Calling service and privacy tests | 26/26 pass, including first-activity and Edmonton-date streak boundaries |
| Full frontend tests | 141/141 pass |
| Full API tests | Final source 204/205 pass; unchanged PDF extraction test cannot load native canvas/DOMMatrix on this Windows ARM64 Node 24.18 environment |
| Normal API typecheck and production build | Pass |
| Normal frontend production build | Pass, including the final queue-label correction |
| Full frontend TypeScript check | Existing CSV, map, follow-up, workspace, and inventory errors; no calling/AppLayout diagnostics |
| Browser regression and copied-data journeys | 32/32 mocked cases and 2/2 desktop/mobile copied-data journeys pass against the final release |

Git blob comparisons confirm the failing PDF test/module, package lock, and frontend error files are identical to the production base. Dependencies were installed from the unchanged existing lock; PGlite was already an API development dependency. The failure is recorded rather than hidden by a calling-specific runtime workaround. The scoped diff passes `git diff --check`.

`playwright.calling.config.ts` runs the 32 mocked regression cases. `playwright.calling-simulation.config.ts` is an explicit private rehearsal, not a default CI suite: it requires a resettable loopback API on port 4179, the `x-calling-simulation: local-only` header, and a health response whose source root matches the browser checkout. It blocks external resources and retains detailed reports/screenshots only under ignored `work/calling-simulation/private`. The rehearsal omits deployed auth/RLS, carrier dialing, map tiles, email auditing, and brokerage-memory endpoints; it verifies the copied eight-record cohort rather than all live activity totals.

## Preview and pilot preparation

The existing `vercel.json` hard-codes every `/api/*` request to production Railway. An ordinary frontend preview therefore does not isolate confirmation writes. Test a matching API and frontend against a disposable database, with an explicitly verified preview API target, before confirming any simulated call on a deployed preview.

API startup is also not read-only: its existing prestart migration and route registration execute table/migration SQL. No API startup or deployment should be used as a way to obtain a read-only production test.

Before a deployment, record the exact calling commit, frontend/API targets, database identity, and rollback artifacts. Complete a disposable PostgreSQL 17.6 integration run with actual PostGIS/auth behavior and separate-connection retry contention, then obtain device evidence for desktop Phone Link and mobile dialer handoff. A controlled first live test should use the intended broker and one owned, unshared prospect, explicitly identifying which genuine call will be logged. Backend deployment and smoke checks must precede enabling the frontend calling page; the new UI depends on the new routes.

The intended release targets remain the verified Railway API and Vercel project/team above, using the exact scoped `codex/calling-pilot` revision for both. No calling schema migration is needed. The rollback source is `37fb07ff0ee5b5140b82b16392ddefa46faed4c5`; the verified previous frontend artifact is `dpl_49RGkPBaXQBJXdndMxSycTbffM9Y`. The previous Railway deployment ID has not been verified, so record it before deployment rather than treating a source commit as a verified API artifact.

For eventual production staging, Vercel supports a production build without assigning production domains, followed by promotion of that same build. Preview-to-production promotion rebuilds, so it is a separate validation boundary. Neither staging nor promotion has been performed here. The API and frontend require coordinated release and rollback decisions. [Vercel deployment promotion documentation](https://vercel.com/docs/deployments/promoting-a-deployment)

## Current status

The read-only snapshot, final release SQL and browser rehearsal, narrow calling/private-activity patch, builds, and scoped checks are complete. The local `codex/calling-pilot` candidate is ready for review from the managed worktree; the release receipt records its exact Git revision. Disposable database integration, deployed authentication, device acceptance, and deployment remain open. No push or deployment has been performed, and this report does not claim a completed live calling pilot.

## UI refinement, October 7, 2026

The confirmation receipt now reads **Call saved · +15**, with the company below it and enough mobile spacing to clear the app header. The calling page gives the company and contact/phone a clearer hierarchy, emphasizes confirmed calls, uses quieter priority labels and a narrower desktop width, and puts recent history in a closed native disclosure. Instructions are shorter and the confirmation button uses a darker green. The two-click flow, next-company heading focus, 44px primary controls, and four upcoming companies remain intact.

The cleanup passed the existing 141/141 frontend tests and 32/32 calling regressions. After the final toast-position adjustment, the production web build, 4/4 targeted receipt/compact checks, and 2/2 copied-data desktop/mobile journeys passed. Final receipts were visually inspected on both viewports; title hit-testing checks confirm the header does not obscure them. Stored logging and XP retain the previously verified backend behavior. Only the page, its two browser specs, and this report form the UI follow-up commit; private captures stay ignored. No push or deployment has been performed.
