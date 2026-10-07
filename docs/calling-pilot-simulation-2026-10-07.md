# Calling pilot simulation and live release

October 7, 2026. The approved calling pilot is published. The live amendment below supersedes prior preparation-status statements; earlier simulation and device sections retain their historical evidence and limitations.

## Calling navigation repair, October 7, 2026

Skip previously chose the first eligible company other than the current one, causing A to B to A. It now defers the current company for this pass and advances to the next remaining company. Deferred companies stay out of the upcoming list after a queue refetch; the end of the pass offers an explicit Revisit skipped companies action. Skip records no call or credit.

A compact Previous control retraces viewed companies, including confirmed companies, and restores the selected person/number without replaying a call session or clearing completed-call suppression. Manual selections and ordinary Didn't call undo pin the current company across queue refreshes. Navigation history is local to the open calling desk; a full page reload begins a fresh viewing history while existing durable pending-call recovery remains intact.

Previous, Skip, contact selection, and queue selection are disabled while a call is pending. Skip remains visibly separate from Didn't call, with a clear instruction to resolve the call before changing companies. Ordinary undo keeps the frozen company/person/number selected. Unsaved notes and follow-up controls reset before another company is prepared.

The frontend production build and diff checks pass. The complete browser run passed 64 of 66 desktop/mobile cases; the two failures were an incorrect new test expectation that a previously deferred company would return to the forward queue. After correcting only that expectation, both affected cases passed. All 66 behaviors are covered, including progressive skips, queue refetch, Previous preserving contact/number, Previous on an already confirmed company with saved attributed history and unchanged credit, delayed-start navigation locks, draft reset, and end-of-pass revisit. Independent review then found that a skipped company, revisited and successfully called, still inflated the deferred count. Successful completion now removes only that company from the skipped set. The final source production build and all 14 focused desktop/mobile navigation checks pass, including the deferred-count and explicit-revisit regression.

Read-only private-preview rendering passed at 1536 by 1024, 390 by 844, and 698 by 936. Previous and Skip retain 44px tap heights; there is no horizontal overflow or browser error. Existing user simulation state was preserved with no call, discard, contact-edit, or external request. The captures cover the current ready state; pending/end states are covered by the mocked browser checks. Safe evidence remains ignored in nav-layout-smoke.json and private screenshots.

This repair changes the calling page and its browser regressions only. The existing live API, migration, privacy rules, and activity accounting are unchanged. The exact frontend publication is recorded after deployment in the private release receipt and live follow-up below.

Published to [live Calls](https://level-cre.vercel.app/app/calls) from source `0da7ce080c65212a0bd14f1a4459a505f811cfd0` in READY production frontend deployment `dpl_7DmwMmiWgixomYaKS7oj6P82fT7a`. The live alias was independently verified; `mobile-calls-DBu5oLLa.js` is 39,087 bytes and includes Previous, Revisit skipped companies, and pending-call guidance. API health is 200 and the frontend's unauthenticated calling queue rewrite returns 401. Fresh real Chrome desktop/mobile login-gate checks passed at 23:12:27 UTC with no browser errors, overflow, failed resources, workspace reads, sign-in, or call writes. Authenticated live navigation remains Patrick's manual acceptance. Existing API deployment `180be816-4028-48f3-b180-a890cf971ca0` and database migration are unchanged. The source-sync PR remains a draft pending the earlier specific main-merge approval; this frontend repair did not modify main.
## Initial approved live rollout, October 7, 2026

Patrick approved the live pilot after confirming the Android/Phone Link device handoff. The approved calling source is `9e7899bff4203072aa7ecb26fe2ab42f31648954`, with runtime implementation at `c81b4b7fa7a7a315891ec47172149f81f667c759`. It was published from the isolated calling release, with no unrelated primary-checkout changes or private simulation material included.

| Live surface | Verified release |
| --- | --- |
| Calls | [level-cre.vercel.app/app/calls](https://level-cre.vercel.app/app/calls) |
| Frontend | Vercel production deployment `dpl_pkoHn9repdHHTXUKKtPC1K16Y5Wt`, READY, exact approved Git source; the live alias points to this deployment |
| API | Railway production deployment `180be816-4028-48f3-b180-a890cf971ca0`, SUCCESS |
| Database | Supabase `glgeqzgyvefcelzmdnte`; `0021_prospect_contacts.sql` applied at `2026-10-07T22:49:20.831556Z` with checksum `8a28c191fef2c7658a1a5c55c2d1506b48fd654afdfdecc1c12dc94bf8aee35b` |
| Source synchronization | [Draft PR #34](https://github.com/VialSmasher/level.cre/pull/34) targets `main` from `codex/calling-pilot`; main remains at `37fb07ff0ee5b5140b82b16392ddefa46faed4c5` pending specific merge approval |

The API shipped from an exact Git export with LF migration bytes. The raw Windows checkout and the first archive contained CRLF migrations and were rejected before deployment because the existing ledger uses LF checksums. The deployed export uses `core.autocrlf=false` and `core.eol=lf`, with all four migration hashes verified. Its archive SHA-256 is `11340fec7eab19a69fcea9b28002acec6079cc7649d1ed1695bb049ae772f704`; a legacy tracked `server/.env.bak` file was excluded from the shipping directory. The local-upload deployment does not supply Railway's Git commit environment, so `/api/version` reports a null commit; source provenance rests on the exact export, manifest, deployment identity, and migration fingerprints, not an invented version response.

Postdeployment catalog checks verify table owner postgres, enabled RLS, zero browser policies, no anon/authenticated SELECT/INSERT/UPDATE/DELETE grants, the expected service-role grants, four indexes, and six valid constraints. Health is 200; queue, workspace, start, outcome, and discard routes deny unauthenticated requests with 401. The production frontend serves the new calling chunk and rewrites its queue request to that protected API. A bounded API error-log check found no new runtime error entry. These checks placed no calls and wrote no simulated production activity.

Fresh real Chrome contexts passed the live smoke at 22:55:29 UTC for desktop 1536 by 1024 and mobile 390 by 844. The actual Calls URL returns 200 then reaches the real login gate; Google sign-in and blank Work email render with a 44px input, no horizontal overflow, and zero console/page errors, failed resource responses, mutation attempts, or workspace reads. The served `mobile-calls-D0lDT_oA.js` is 37,033 bytes and contains the released calling controls. No authentication override or demo flow was used. This verifies the real sign-in gate and shipped assets, not an authenticated call-workspace test.

Patrick's normal signed-in acceptance remains: choose one owned, unshared prospect, open its selected number through Phone Link, make a genuine attempt, confirm once with I called · next, and verify the selected contact/account activity and live scorecard. The app cannot infer a connected carrier call from opening the dialer. Ordinary Vercel previews still target the live API and must not host copied-data confirmations.

Automatic approval review rejected a direct push to main before execution because the general rollout approval did not specifically authorize that branch mutation. The deployment proceeded from the approved calling branch without modifying main. Draft PR #34 keeps the complete source change reviewable; merging it requires Patrick's specific approval. Until source synchronization, a future deployment of the old main branch could replace this calling release. Documentation-only follow-ups do not change the approved runtime or deployment provenance.

Rollback remains the verified previous frontend artifact `dpl_49RGkPBaXQBJXdndMxSycTbffM9Y` while retaining the new API, private-call filters, table, and saved history. The previous API artifact is `4630d375-22b5-4095-bc2e-47042d9aa6d7`; after genuine calls exist, downgrading to its old source would remove the calling privacy filters, so preserve those protections or fix forward. Ignored package, catalog, HTTP, browser, and release receipts remain under `work/calling-simulation/private`. The private local preview and its user-testing state remain available.

## Private preview stylesheet follow-up

The user reported an unstyled handoff preview after the implementation checkpoint. Tailwind's relative content globs resolved from the original checkout working directory, so the private preview compiled base styles without utility classes. Earlier browser QA started from the web workspace and did not exercise this startup path. The ignored preview adapter now supplies explicit PostCSS plugins with absolute content paths into the release tree; application source and production configuration are unchanged.

Read-only verification of the actual port 5180 preview passed at 1536 by 1024, 698 by 936, and 390 by 844. The Call control measures 79.3 by 44 CSS pixels and has the expected blue background; navigation switches correctly, there is no horizontal overflow, the simulation notice remains visible, and browser error counts are zero. Call progress was unchanged. The repeatable `preview-style-smoke.mjs`, JSON results, and `preview-style-*.png` captures remain ignored in the original checkout's private simulation folder. The in-app automation helper was unavailable; the previously authorized isolated Chrome fallback supplied these captures. The supplied failure screenshot and corrected narrow screenshot were visually checked, as were corrected desktop/mobile views.

## Desktop Phone Link investigation, October 7, 2026

Read-only inspection of Patrick's PC found Phone Link 1.26072.257.0 installed/running and registering the tel, ms-phone, and sms protocols. No explicit TEL user-choice handler is configured. Patrick confirms an Android phone and a ready dial pad in Phone Link's Calls tab. This is a reported readiness check; actual Bluetooth/carrier handoff is not yet verified. Microsoft documents [Bluetooth calling setup](https://support.microsoft.com/en-us/windows/apps/phonelink/setting-up-calls-in-the-phone-link) and [changing default link applications](https://support.microsoft.com/en-us/windows/apps/change-default-apps-in-windows).

The release uses synchronous native tel anchor activation while recording its observed start asynchronously. Confirmation remains a separate broker action; the web app cannot observe carrier connection or duration. The installed Codex external-link bridge allows tel links, but actual in-app-browser handoff still needs a human device test. Extensions are displayed rather than included in the dialed URI; the phone helper does not add a country code.

An ignored local-only page at `http://127.0.0.1:5180/calling-device-check` starts with a blank number and uses the actual release phone helper. The human chooses a destination and clicks Open phone app; that action can initiate a real call. The page makes no CRM requests and awards no points. Browser verification at 698 by 936 confirms blank/invalid numbers disable the link, a fictional number produces the expected URI, and zero API/external requests or browser errors occur. The link was never clicked during verification. Prospect-preview telephone interception stays enabled. Remaining device acceptance: set TEL to Phone Link in Windows Default apps, then verify a human-selected number reaches Phone Link from the user's browser. No Windows default was changed, real call placed, production activity written, or release deployed.

## Device acceptance and live release readiness, October 7, 2026

Patrick reported **worked** after the standalone phone-handoff test in Codex's in-app browser. This accepts the human-tested Android/Phone Link handoff. Exact native-app click count, connected-call audio, and carrier duration were not reported, and no CRM call was inferred or recorded from this device check.

Read-only release checks confirm GitHub main, Vercel's ready production deployment, and Railway's successful active deployment/API version remain at `37fb07ff0ee5b5140b82b16392ddefa46faed4c5`. The calling release contains 32 scoped files against that baseline. No unrelated primary-checkout work or private simulation material belongs in the release. Vercel target is project `prj_V33jNd3OsliNsuZ8W0PRR3cLtGFw` under team `team_mPgSEsLPWy43Kj5VAwLVfDzk`; the live frontend is `https://level-cre.vercel.app`. Railway target is project `5815e1a8-9f12-4b0e-b72f-4b3e7c94c613`, service `89c1d569-fc17-40c1-9baf-f4feaa3d8a77`, production environment `5467f896-a3b3-457d-9373-453ecbf2ad69`, and `https://levelcre-production.up.railway.app`. Its configured start is `npm start --workspace=@apps/api`, which runs the checksum-guarded prestart migration before the API listens.

The exact Railway DATABASE_URL was used only in memory for a READ ONLY metadata transaction against verified Supabase project `glgeqzgyvefcelzmdnte`. Its API role is postgres, has schema CREATE and RLS bypass, and owns the existing prerequisites. Demo flags are disabled; the production start command sets NODE_ENV=production. PostgreSQL is 17.6. The private-contact table is absent as expected, existing migration ledger checksums match committed Linux/LF blobs for 0018–0020, and the required varchar IDs/jsonb attribution metadata match 0021. The interaction table is approximately 120 KiB with an estimated 133 rows, so the planned non-concurrent attribution index is small; migration still acquires write-blocking locks until its transaction commits. No credential was printed or saved. Ignored metadata proof is `work/calling-simulation/private/live-release-readonly.json` in the original checkout.

The concrete rollout is the verified calling code plus additive migration 0021: release/migrate the API first, verify schema/ACL/checksum, version/health and authentication enforcement, then expose the matching frontend. An authenticated queue read can check retrieval; a workspace GET reconciles primary anchors and is a live write, so it belongs to approved pilot acceptance. Patrick then makes one chosen real call, confirms it, and checks its contact/account activity and scorecard exactly once. Ordinary Vercel previews use the live Railway API and must not run copied-data confirmations.

Rollback frontend to verified Vercel deployment `dpl_49RGkPBaXQBJXdndMxSycTbffM9Y` while retaining the new API/private table/history. The previous Railway deployment is `4630d375-22b5-4095-bc2e-47042d9aa6d7` at the baseline commit and image digest `sha256:b2fb4f697da6d2e30bc66e4eaecf6881bb2468f019d57e420d625c4c62c03af8`. After confirmed calls exist, a full API downgrade to that old source would remove new private-call filters from shared/public activity; keep those protections or fix forward instead. Do not drop saved contact/call history. Local preparation and read-only checks are complete; publication and live migration await the separate live-rollout decision.

## Company/contact workspace, October 7, 2026

Patrick approved the wider workspace and roster after the [design and data fit review](calling-account-workspace-review-2026-10-07.md). The implementation is verified locally in the managed `codex/calling-pilot` worktree, following compact-controls commit `e999baa804fefd3fab3336532b53822e9d975591`. The ignored release receipt records the exact checkpoint revision. No push, deployment, production migration, or genuine call is part of this pass. The sections below this amendment retain the pre-roster history; their no-migration statements apply only to that earlier implementation.

The roster introduces private, broker-owned `prospect_contacts` relationships at an existing prospect/occupant record. It is a bounded relationship store, not a global CRM person directory or inferred company identity. Migration `0021_prospect_contacts.sql` is registered in the existing checksum/startup runner and applied only to disposable PGlite. Legacy primary scalar contact fields remain authoritative for editors and email matching; atomic reconciliation snapshots that identity. Meaningful name/email replacement archives the prior identity and creates a new UUID. Cosmetic and named-person phone edits retain it. New history uses explicit contact attribution; old unattributed activity stays in the account feed.

The company context, person, and exact number freeze under one call key. Confirmation preserves that snapshot after edits or archival and credits the existing event/interaction/XP pipeline once. **I called · next** advances by default; **Log & try another contact** explicitly keeps the company. The client reconciles the same saved start before confirmation, without redialing. Undo directly handles rejected/delayed starts; an ignored discard tombstone prevents a late original request from resurrecting credit. Unavailable owned context permits local dismissal, while network failures remain retryable. Resolved call keys are separate from company suppression, preserving a second pending person at the same company.

Merge/undo retains roster UUIDs and attributed history, uses exact roster snapshots, rejects subsequent contact conflicts, and requires pending calls to be resolved first. Five focused SQL cases verify this compatibility. The selected owned prospect/occupant and its existing property links remain authoritative; calling creates no additional map asset.

| Final local check | Result |
| --- | --- |
| Copied-schema PostgreSQL/WASM proof against frozen release sources | 44/44 assertions pass |
| Calling/privacy, roster/schema, and merge/undo focused tests | 53/53 pass |
| Full API suite | 231/232 pass; unchanged `surveySyncExtraction.test.ts` native-canvas/DOMMatrix import fails on Windows ARM64, Node 24.19.0 |
| API typecheck and production build | Pass |
| Frontend unit tests and production build | 144/144 before the final per-event pending-discovery fix; afterward, helpers 6/6 and production build pass |
| Stateful calling browser regressions | 52/52 pass at desktop and mobile sizes |
| Separate synthetic saved-goal case | 2/2 pass: 0/20 initially and after a start; 1/20 only after confirmation |
| Actual copied-data browser journeys | 4/4 pass: five-call and two-contact flows at both viewports |

The 44 SQL assertions separate synthetic relationship/edit/recovery fixtures from a reset to the original copied baseline for the five-call reader proof. That final phase produces +5 confirmed calls, +75 stored follow-up XP and ledger credit, +5 mapped actions, and no asset increase. Copied-cohort production is 15 to 20; stored follow-up XP is 1,080 to 1,155. The separate two-contact browser phase creates an explicitly synthetic local contact, calls its second number, logs it, tries the original primary, and advances. It produces +2 calls, +30 stored XP, and +2 mapped actions with no asset or primary scalar change. These are independent resettable rehearsals, not combined production totals or new identity facts.

Desktop captures use 1536 by 1024; mobile uses 390 by 844. The supplied reference, compact mock layout, and copied-company ready/started captures were compared and accepted. Long names and existing addresses remain contained. The copied profile's goal is NULL, so real-data captures have no invented target. The separate 20-call goal uses a clearly synthetic profile with the actual profile query. [Calling design QA](../design-qa.md) records intentional deviations and preserves the earlier map report.

Fixtures, full-data reports, screenshots, snapshot, and source fingerprints remain ignored under `work/calling-simulation/private`. SQL imports actual release services and current production/pulse/scorecard/badge readers. The browser still uses thin local profile/skills/header adapters, fixed identity, an inert map, blocked external resources, and intercepted phone links. Deployed authentication/RLS, full global skills/header calculations, PostGIS, independent-connection contention, email auditing, brokerage memory, carrier handoff, and Supabase realtime delivery remain outside this proof. Explicit invalidation and canonical reader effects are verified.

The handoff preview is [http://127.0.0.1:5180/app/calls](http://127.0.0.1:5180/app/calls), reset to the copied baseline with zero starts, logged calls, conversations, and pending sessions. Its ignored adapter displays **Private simulation · copied data · no live calls**, supplies no production JWT, sets Supabase to NULL, restricts API traffic to loopback port 4179, verifies the release source root, and prevents actual dialing. Four isolation checks verify no external browser requests, unexpected API denial, private snapshot static denial, and prevented handoff. Current hashes and reset health are in the ignored receipt. The production app is unchanged.

This iteration requires migration 0021 before the matching API and frontend. Before release, verify the exact checkpoint, database, additive migration, ownership/RLS, PostgreSQL/PostGIS behavior, and previous API artifact. Preserve the verified previous frontend artifact and source for rollback; leaving the new table in place is an additive rollback decision to review, not permission to drop contact history. Generic Vercel previews still point API traffic to live Railway and cannot safely host simulated confirmations. Device acceptance and one explicitly selected genuine call to an owned, unshared prospect remain the controlled live-pilot steps.

## Historical pre-roster evidence

The remaining sections describe the initial calling pilot and UI refinements through `e999baa804fefd3fab3336532b53822e9d975591`. Their earlier counts, release readiness, and lack of a calling migration are historical, superseded by the amendment above.

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

## Pre-roster release slice

A managed isolated worktree at `C:/Users/patri/.codex/worktrees/calling-pilot/level.cre` now holds the narrow calling patch on `codex/calling-pilot`, based on the verified production commit. Telemetry, property classification, occupant/building links, the current Home selection guard, and current production/badge readers are preserved:

| Area | Required change |
| --- | --- |
| New runtime files | `apps/api/src/lib/mobileCallingService.ts`, `apps/api/src/lib/callingActivityPrivacy.ts`, `apps/web/src/lib/mobileCalling.ts`, and `apps/web/src/pages/mobile-calls.tsx` |
| API route integration | Calling import plus queue, start, discard, and outcome handlers in `apps/api/src/routes.ts` |
| Frontend integration | Calling lazy import/route in `App.tsx`, supporting Calls navigation and Today active state in `AppLayout.tsx`, and the existing Start calling link in `daily-desk.tsx` |
| Retry/shared types | A `keepalive` request option in `queryClient.ts` and `attempted` in the shared interaction outcome type; the database column already accepts that value |
| Private activity | Calling-origin exclusion in public pursuit snapshots and non-owner shared pursuit counts, dates, Tool A history, and Supabase fallback reads |
| Verification | Calling/privacy unit tests and entries in existing test commands, both mocked and copied-data Playwright configurations/specs, and narrow ignored evidence paths |

The pre-roster calling implementation required no new npm dependency or calling schema migration. It used the existing prospects, activity events/links, contact interactions, skill activities, and broker skills tables. Existing authentication, XP helpers, profile hooks, and voice dictation components were already on the production base. Unrelated harness, account intelligence, map, and credential changes should not be copied wholesale from the dirty checkout. The current roster amendment above adds migration 0021.

The live property model distinguishes the selected occupant record from its linked building. Contact and Activity stay with the selected record; property classification targets the building. A call must keep the exact selected prospect/occupant ID, including when the linked building is unavailable. It must not infer tenancy or ownership, or transfer the call to a building simply because the map groups those records.

The patch excludes phone-link interactions identified by `contact_interactions.source_provider = level_cre_mobile` or their linked `activity_events.source = level_cre_mobile_calling`. Public snapshots exclude them before the result limit. Shared reads keep the authenticated broker's own calls and exclude other brokers' private call rows, notes, counts, and dates. A real SQL regression checks public visibility, owner visibility, aggregates, and fallback parity. No automatic activity share event is introduced; any future activity sharing must be a separate sanitized action. The default **I called** attempt preserves prospect status and last-contact fields. Optional explicit connected outcomes can update those fields on the selected prospect, and they follow the existing record-sharing rules. The full unrelated sharing/harness implementation and optional demo fixtures were not copied.

## Pre-roster local release verification

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

The intended release targets remain the verified Railway API and Vercel project/team above, using the exact scoped `codex/calling-pilot` revision for both. The original pre-roster pilot needed no calling migration; the current roster requires migration 0021. The rollback source is `37fb07ff0ee5b5140b82b16392ddefa46faed4c5`; the verified previous frontend artifact is `dpl_49RGkPBaXQBJXdndMxSycTbffM9Y`. The previous Railway deployment ID has not been verified, so record it before deployment rather than treating a source commit as a verified API artifact.

For eventual production staging, Vercel supports a production build without assigning production domains, followed by promotion of that same build. Preview-to-production promotion rebuilds, so it is a separate validation boundary. Neither staging nor promotion has been performed here. The API and frontend require coordinated release and rollback decisions. [Vercel deployment promotion documentation](https://vercel.com/docs/deployments/promoting-a-deployment)

## Pre-roster checkpoint status

The read-only snapshot, final release SQL and browser rehearsal, narrow calling/private-activity patch, builds, and scoped checks are complete. The local `codex/calling-pilot` candidate is ready for review from the managed worktree; the release receipt records its exact Git revision. Disposable database integration, deployed authentication, device acceptance, and deployment remain open. No push or deployment has been performed, and this report does not claim a completed live calling pilot.

The initial local release commit was `45dabe981fc7eb4bd6fb08a40b41c8f3b1806c0f`, **Add private call queue with explicit confirmation**, with parent `37fb07ff0ee5b5140b82b16392ddefa46faed4c5`. Its 21-file scope was verified. The ignored release receipt is saved at `work/calling-simulation/private/release-receipt.json` in both the original and managed workspaces.

## UI refinement, October 7, 2026

The confirmation receipt now reads **Call saved · +15**, with the company below it and enough mobile spacing to clear the app header. The calling page gives the company and contact/phone a clearer hierarchy, emphasizes confirmed calls, uses quieter priority labels and a narrower desktop width, and puts recent history in a closed native disclosure. Instructions are shorter and the confirmation button uses a darker green. The two-click flow, next-company heading focus, 44px primary controls, and four upcoming companies remain intact.

The cleanup passed the existing 141/141 frontend tests and 32/32 calling regressions. After the final toast-position adjustment, the production web build, 4/4 targeted receipt/compact checks, and 2/2 copied-data desktop/mobile journeys passed. Final receipts were visually inspected on both viewports; title hit-testing checks confirm the header does not obscure them. Stored logging and XP retain the previously verified backend behavior. Only the page, its two browser specs, and this report form the UI follow-up commit; private captures stay ignored. No push or deployment has been performed.

The accepted UI refinement is saved in local commit `46aac1835a8d909d683044be66c9b4e7bb8ee2d1`, following the initial calling pilot commit `45dabe981fc7eb4bd6fb08a40b41c8f3b1806c0f`. The managed release checkout was clean at that checkpoint; neither commit was pushed or deployed.

## Compact calling controls, October 7, 2026

The design was reviewed from a broker's repeated-call workflow, a first-time broker's understanding of dial versus confirmation, and a product designer's view of hierarchy and mobile tap targets. The current company and contact lead the card. Call and I called · next now size to their text while retaining a 44px minimum tap height; Skip follows the primary action and the dialer helper aligns beneath it. The two-click flow, upcoming company preview, and activity recording are unchanged.

Patrick's requested compact control treatment was accepted after fresh desktop and mobile ready/started captures. Six existing focused UI checks passed and the final web production build passed. The test specifications and backend were unchanged. This remains a local revision; no live call, push, or deployment was performed.

The accepted compact controls are saved in local commit `e999baa804fefd3fab3336532b53822e9d975591`. The managed release checkout was clean at that checkpoint; this revision has not been pushed or deployed.

## Proposed account workspace review, October 7, 2026

Patrick supplied a new split-pane desktop reference and Gemini's multi-contact proposal for review before implementation. The [design and data fit review](calling-account-workspace-review-2026-10-07.md) recommended the wider company/queue layout while retaining compact controls, and identified stable contact identities and history attribution needed for a real roster. At that review the accepted runtime was `e999baa804fefd3fab3336532b53822e9d975591`; the approved implementation and final QA are now recorded in the amendment at the top.
