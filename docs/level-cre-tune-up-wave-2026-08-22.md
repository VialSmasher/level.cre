# Level CRE Tune-Up Wave

**Date:** August 22, 2026
**Status:** First implementation wave completed locally; production deployment pending

## Implemented in this wave

- Reconciled August 21 against Outlook: 15 clear prospecting sends were confirmed and passed through the idempotent Level CRE recorder.
- Added one canonical production-activity read model for Today, Badges, and weekly scorecards, including unmatched confirmed sends and excluding inbound email from production.
- Added provider-aware duplicate reconciliation so connector, Outlook desktop, Postmark, and Codex evidence do not award the same send twice.
- Relaxed map attribution so a useful existing prospect or verified building wins over low-value legal/property review, including practical reuse of the richest legacy duplicate.
- Removed Review from the Today workflow and disabled its property/legal review feeds there.
- Reworked Today into weekly momentum: this week, last week, activity mix, pace, and a direct call-queue action.
- Reframed Activity as a quiet capture audit, defaulting to successfully linked activity and treating unlinked map context as optional.
- Made pursuit exports inherit global interactions from every prospect linked to the pursuit, even when the original activity was not explicitly tagged to that pursuit.
- Restored Standings through the stable `/app/standings` route while retaining the old `/leaderboard` redirect.

The private landlord share link and richer pursuit analytics remain follow-on work. The controlled legacy-record merge and property-memory maintenance layer is now implemented as a dry-run-first follow-up wave; production execution remains gated by its generated plan hashes.

## Product north star

Level CRE is a hands-off, map-first CRM for commercial real estate prospecting.

Patrick should spend his time making calls, sending emails, and advancing deals. Codex should capture that work, associate it with the most plausible prospect and property, add it to the map, and update the scorecards. Routine CRM administration should be the exception.

The map is the centre of the product. It should become more useful every time Patrick prospects.

## Working principles

1. **Capture activity reliably.** Confirmed outreach must not disappear between the sending tool, activity recorder, CRM, map, and scorecards.
2. **Prefer operational usefulness over perfect property data.** A generally correct building and prospect association is sufficient. Level CRE is not a title, legal, offer, or listing-agreement system of record.
3. **Automate CRM maintenance.** Address normalization, likely duplicate consolidation, property matching, and safe enrichment should happen in the background.
4. **Do not create chores.** Large review queues, routine tagging, polygon drawing, and manual activity logging work against the product.
5. **Keep one activity truth.** The global CRM and map hold the canonical activity. Scorecards, Today, and Pursuits are views over the same events.
6. **Keep provenance without exposing complexity.** Source, evidence status, confidence, provider identity, and aliases can remain available for auditing without demanding Patrick's attention.
7. **Count production consistently.** Confirmed outbound prospecting actions count toward production. Inbound messages are outcomes and context, not outbound production credit.

## Priority 0 — Repair the activity foundation

### 1. Reconcile missing email activity and incorrect badge counts

On August 21, 2026, Patrick believes he sent at least 10 prospecting emails, but Badge Collection reported a best email day of **8** and **Inbox Push 8/10**.

Determine whether the missing emails:

- were sent but never ingested;
- reached the CRM but were excluded from the scorecard query;
- were queued locally and never flushed;
- were collapsed incorrectly by idempotency or duplicate handling;
- carried a disposition or metadata value that excluded them; or
- landed on the wrong calendar day because of timezone handling.

Inspect confirmed Outlook sends, direct recorder results, durable outbox records, provider identities, canonical activity records, and scorecard aggregation. Use `America/Edmonton` for day boundaries.

#### Acceptance criteria

- Every confirmed, eligible outbound prospecting email creates exactly one canonical activity.
- Retries do not create duplicates.
- Queued local records eventually flush without requiring a resend.
- Activity, Today, badges, and scorecards derive their totals from the same canonical events.
- A reconciliation test covers the known August 21 failure pattern.
- Any backfill is based on confirmed evidence; no activity is fabricated.

### 2. Make prospect-to-map attribution dependable

When Codex records an email or, later, a call, Level CRE should attach it to the most plausible contact, company, and building, then display it on the map activity timeline.

The system should optimize for a useful map pin and correct general association. Minor address, municipal, ownership, legal-description, or parcel differences should not block ingestion.

#### Acceptance criteria

- A confirmed activity with sufficient company, contact, or address context reaches a map record without manual review.
- Existing contacts and properties are reused when there is a reasonable match.
- The activity appears in the selected prospect's Activity panel.
- An uncertain legal or municipal field does not prevent an otherwise useful map association.
- If no reasonable building can be determined, the activity remains recorded and can be enriched later.

### 3. Consolidate legacy duplicates automatically

Earlier manual entry and newer Codex-created records may describe the same prospect or building. Reconcile likely duplicates using practical signals such as:

- normalized company name;
- contact email and email domain;
- normalized address;
- geographic proximity;
- website domain; and
- shared activity or brokerage context.

Choose the richer record as the canonical record, combine activity histories, and retain alternate names and addresses as aliases. Avoid competing pins for the same real-world prospect.

Merges should be auditable and reversible, but should not require routine approval from Patrick.

## Priority 1 — Remove administrative friction

### 4. Replace the 108-item Review burden with background maintenance

The current Review tab mixes legacy evidence, address variations, possible duplicates, parcel ambiguity, and property enrichment into a large manual queue. This is not a good use of broker time.

Change the workflow so Codex or automated rules:

- accept generally correct, additive information;
- choose the most plausible property match;
- consolidate likely duplicates;
- dismiss stale or low-value proposals;
- retain confidence and source evidence in the background; and
- permit later correction when a visible error matters.

Review should not appear as a prominent obligation on Today. Consider hiding or removing the user-facing Review tab after the existing backlog has been processed. Only a genuine inability to place an important activity should require attention, and even then it should be presented as a small exception rather than a property-data audit.

### 5. Reframe Activity as a quiet exception and audit surface

The existing Activity ledger is cluttered and does not provide a practical daily workflow. Archived test messages, unattached records, captured-versus-logged totals, and manual context actions create confusion.

Activity should not be another inbox. Its useful role is likely:

- a lightweight exception surface for activity the system truly could not associate;
- an audit trail when Patrick or Codex needs to verify a send;
- capture health and reconciliation diagnostics; and
- administrative capture settings.

Normal successfully recorded activity should flow directly to prospects, the map, pursuits, and scorecards without requiring a visit to this page. Archived test data should not dominate the default view.

## Priority 2 — Focus the daily experience on production

### 6. Turn Today into a momentum coach

Codex is better suited to nuanced inbox and deal-flow prioritization. Level CRE should not duplicate that work with a brittle list of specific “next moves.”

Refocus Today around general sales production:

- last week's calls, emails, meetings, active days, and total touches;
- this week's targets and current pace;
- a simple activity gap, such as “six calls and four emails puts you on pace”;
- streaks, badges, milestones, and recent wins; and
- goals suggested from Patrick's real historical cadence.

Remove property-memory review work from the primary Today experience. Deal-specific recommendations can remain Codex-led rather than becoming another Level CRE task list.

## Priority 3 — Strengthen the best existing workflows

### 7. Preserve and incrementally improve the global map

The global map is the strongest and most valuable part of Level CRE. Do not redesign it unnecessarily.

The Codex-created Logoplaste record illustrates the desired result: a useful location, company and contact context, prospect status, and recorded email activity available from the map panel.

Improvements should focus underneath and around the current experience:

- use a reasonably accurate point as the default;
- keep manual polygon tools available but optional;
- never require Patrick to draw a building outline;
- add parcel geometry automatically later when reliable and inexpensive;
- combine duplicate histories onto one useful pin;
- enrich older manual records toward the Codex-created structure; and
- ensure confirmed outreach appears on the correct map timeline.

The Brokerage Memory overlay should not advertise a large “awaiting review” burden. Generally correct records should become useful map data automatically.

### 8. Reconnect Pursuits as scoped views of global activity

Keep Pursuits. Reframe each pursuit as a focused lens over the global CRM rather than a separate manually populated CRM.

A pursuit may centre on:

- a listing, such as **2959 Parsons Road**;
- a company or ownership target;
- a tenant or client requirement;
- a prospecting campaign; or
- optionally, a geographic area.

When Codex performs outreach for a listing or campaign, the activity should attach to that pursuit during capture. Later follow-ups should inherit the association. A single activity may appear in multiple relevant pursuits without being duplicated.

The existing pursuit detail already opens a pursuit-scoped map. Preserve that foundation and add:

- pursuit-specific activity totals and timeline;
- relevant prospects and statuses;
- collaborator or actor activity;
- campaign context; and
- reporting and sharing.

Investigate the current inconsistency where the Pursuits list reports zero prospects mapped while an opened pursuit visibly contains numerous map markers.

#### Preferred reporting output

The primary owner-facing output should eventually be a polished private share link where a landlord can view activity and explore relevant prospects. A PDF can remain a secondary snapshot or export.

#### Collaboration direction

Future-proof activity records with actor and source identity so another broker, such as Jack, can contribute without needing Patrick's exact Codex setup. Broader assignments, follow-ups, and team workflows are later-phase features, not part of the immediate foundation repair.

## Lowest priority — Minor broken navigation

### 9. Repair the Standings page

The Standings tab can no longer be opened or clicked. Diagnose and restore the route or interaction after the core activity, map, and daily-experience work is stable.

## Separate future work

### Mobile calling companion

The mobile calling companion is being handled separately. Its intended role is to provide a focused prospect call queue, useful context, tap-to-call, and low-friction call capture that feeds the same canonical activity, map, pursuits, and scorecard systems.

It should remain a slim calling tool rather than becoming a full mobile CRM.

## Recommended delivery sequence

1. Establish a reproducible activity-count baseline and reconcile August 21.
2. Repair the canonical activity recording and scorecard aggregation path.
3. Improve automatic contact, company, property, and map attribution.
4. Run a controlled legacy duplicate consolidation and remove routine review work.
5. Simplify Activity into exceptions and diagnostics.
6. Rework Today around weekly momentum and production goals.
7. Fix Pursuit counts and automatic activity association.
8. Build the private pursuit sharing/reporting experience.
9. Repair Standings.

## Success measures

- Confirmed prospecting emails are captured exactly once and counted correctly.
- Patrick does not need to visit Activity or Review during a normal prospecting day.
- Most activity reaches a plausible map pin automatically.
- Duplicate pins and fragmented activity histories decline over time.
- Today encourages more calls and emails without creating a second task system.
- Pursuits automatically reflect activity performed for their listing or campaign.
- The map becomes more informative as prospecting continues, with little or no manual CRM maintenance.

## Post-wave polish â€” approved August 22

The next polish pass keeps the same hands-off product rule:

1. **Historical pursuit recovery:** plan and apply only exact historical `listing_id + prospect_id` links already present in confirmed activity evidence. Do not use fuzzy name or address matching.
2. **Standings identity cleanup:** remove zero-activity placeholder accounts and consolidate exact duplicate email identities in the display layer without merging authentication users.
3. **Pursuit organization:** sort live work first and collapse older empty pursuits into a dormant section without deleting or auto-archiving them.
4. **Quiet capture health:** reconcile captured outbound email against the canonical production ledger over seven days and show a warning only when a real count gap exists.
5. **Client-link polish:** make enabled client views easy to preview and let clients filter the activity trail by prospect while preserving the client-safe privacy contract.
