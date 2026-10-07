# Calling workspace: design and data fit review

October 7, 2026. Review of Patrick's supplied desktop mockup and Gemini's contact-roster proposal against the prepared calling pilot at `e999baa804fefd3fab3336532b53822e9d975591`.

Patrick subsequently approved implementation. The review below records the starting decision; the approved implementation model is recorded at the end. Current verification belongs in the [calling simulation report](calling-pilot-simulation-2026-10-07.md).

## Decision

Adopt the company-and-queue layout for the next private pilot. It puts the context needed for a call beside the work remaining and makes better use of a desktop screen. Preserve the compact Call and confirmation controls Patrick selected.

The multi-contact proposal is a useful next capability, but it assumes a person/company relationship model that the calling pilot does not yet expose. Build it on stable, broker-owned identities rather than assembling a visual list from names, phone strings or map records. A company workspace is a presentation and relationship layer; it must preserve the existing prospect/occupant and building identities.

This is a design and code compatibility review. No runtime code, database records, call activity or deployment changed during this review. The supplied image shows one desktop ready state; its contact roster, mobile layout and post-call states are proposals, not verified interactions.

## Reference

Patrick supplied the screenshot and Gemini's four-part proposal in this conversation. The screenshot's notes, dates, industry, contacts and targets are illustrative content, not a source for importing facts.

![Patrick's supplied desktop calling workspace reference](C:/Users/patri/Documents/GitHub/level.cre/work/calling-simulation/private/design-references/2026-10-07-account-workspace-reference.png)

Reference SHA256: `183D55EAF7943A991D50F9E2C531416E26C1A759A9AC1F2850415970F7E9F84E`.

## Design direction

- At wide desktop sizes, use approximately 60% for the selected company and 40% for a sticky queue within the existing app shell. Reuse the app's wider page container. Start the split around 1280px because the navigation already occupies 224px. Stack the company and upcoming rows on narrower screens.
- Lead with the company, selected property/occupancy context, follow-up reason and compact contact controls. Keep the contact roster below company details and above history.
- Show up to three contacts initially, with a way to see the remainder. Three is a display limit, not a database limit. Prefer a quiet border for the selected person, with primary contact clearly labeled. Selecting an alternate does not permanently change the primary contact.
- Keep a short latest-activity preview visible on desktop. Allow a selected-person filter once reliable attribution exists, while keeping all activity for the current account accessible. Contact selection should not make useful company context disappear.
- Keep actions visible on touch and keyboard focus. Hover may emphasize an alternate contact's controls, but cannot be the only way to discover them.
- Retain the smaller Call and I called · next buttons. Remove the quote panel and duplicate Keep going meter from this first iteration. One progress area and the quiet +15 receipt are sufficient.
- Keep the current ranked queue with its reasons. Selecting a row should select a company without dialing or recording activity. Defer drag reordering until persistence and its relationship to automatic priorities are defined; do not show decorative handles that do nothing.

## Fit with the existing app

| Proposal | Current support | Implementation implication |
| --- | --- | --- |
| Company workspace | Company/name, address, status, follow-up dates, priority reasons and pursuit titles exist on the queue candidate | Reuse the current record ID and its property links; do not merge companies by matching names or addresses |
| Contact roster | A prospect currently has one flat name/email/phone/company set | Add or connect durable person records and explicit roster membership before enabling multiple contacts |
| Selected person's history | Interactions currently belong to `prospectId`, without `contactId` | Add attribution for new events; keep old unassigned activity at account level unless independently verified |
| Call logging | Start, confirm, discard, replay protection and scorecard/badge/point updates exist | Extend this same lifecycle rather than introducing a second logger |
| Goal strip | `callsPerDay` exists; no conversation-per-day goal is defined | Use the broker's saved goal. Do not hardcode the mock's 20 calls or 5 conversations |
| Notes | Notes can be saved with call confirmation | A separate Save note action must save independently without awarding call credit |
| More details | Related property and pursuit patterns exist; opportunities have a separate reader | Reuse those readers when needed. Add tags, industry or follow-up reason only where a verified source and edit path exist |

The current database is not a simple Lead table. Its `prospects` records can represent businesses, occupants and property records. A separate occupant can link to a building through the existing property-link model. Calling one person must remain associated with the selected business/occupant context and must not create an additional map asset or move the call to its building.

Separate account-intelligence work in the original checkout contains owned organization and person identities. It is outside this prepared release and supports research and relationship evidence. A person/account experience relationship is not automatically evidence that someone works at, or is the right callable contact for, that company. Coordinate the canonical person model with that work before adding a parallel contacts store.

## Required identity and state behavior

1. **Choose a company.** Continue using the existing prospect/occupant ID for this pilot's context. A future organization ID needs an explicit relationship to that record. The server derives broker identity from authentication and validates access to every supplied relationship.
2. **Choose a contact.** A contact must have a stable ID and a verified relationship to the selected context. Primary status belongs to that relationship. Multiple numbers for one person are phone choices, not additional people.
3. **Start a call.** Snapshot the selected context, contact ID, name and dialed number under the existing call event identity. Freeze the target until confirmation or undo. Selecting another row or opening history must not record activity.
4. **Confirm or undo.** Confirmation updates the same event and awards credit once. Undo awards none. A changed picker or later contact edit cannot relabel an existing attempt. Existing email ingestion/matching, contact editing, and prospect merge/undo must stay consistent with whichever primary-contact model is adopted.
5. **Advance or try an alternate.** Keep I called · next as the default company-advance action. Provide an explicit optional route to try another contact after recording the first attempt. The current queue suppresses the whole prospect after a call today, so this policy must be updated before an alternate-contact workflow is enabled.

Use Calls started, Calls logged and Conversations. A normal `tel:` link proves that the action was clicked, not that the device opened its dialer or connected a call. Confirmed logs advance the daily call goal; a conversation requires the explicit connected outcome.

For contact history, key requests by broker, selected record and contact. Show a loading or empty state while switching rather than briefly displaying the previous person's notes. Preserve all account activity as a separate view. Do not retroactively assign every old interaction to today's primary contact.

## Suggested sequence before the live pilot

1. Build the wide workspace and sticky queue using the existing real candidate data and current contact. Keep mobile stacked and retain the tested call lifecycle. This gives Patrick a useful design comparison without first migrating the entire CRM.
2. Settle the canonical person and relationship model, then implement the roster, contact-specific attribution, history filters and alternate-contact queue behavior together. Coordinate email ingestion and the contact editor so they do not become competing sources.
3. Rehearse a company with two contacts, a person with two numbers, a contact changed after a call started, a retry, an undo and a return to older unassigned history. Verify that the correct person/context receives the attempt and that scorecard, badges and points count it once without adding map assets. Complete actual device and deployment checks before a real call is recorded.

## Source anchors

- [Prospect and interaction schema](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/shared/schema.ts:315): one contact field set and prospect-scoped history.
- [Saved goals](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/shared/schema.ts:233): calls per day and meetings per week.
- [Calling candidate contract](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/apps/web/src/lib/mobileCalling.ts:21): the currently available screen data.
- [Calling service](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/apps/api/src/lib/mobileCallingService.ts:24): strict request schemas, queue history, whole-prospect suppression and session identity.
- [Property relationships](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/apps/api/src/lib/propertyLinkService.ts:14): explicit occupant/building links.
- [Current calling UI](C:/Users/patri/.codex/worktrees/calling-pilot/level.cre/apps/web/src/pages/mobile-calls.tsx:207): existing start/confirm flow and compact controls.
- [Separate account-intelligence types](C:/Users/patri/Documents/GitHub/level.cre/packages/shared/src/accountIntelligence.ts:104): useful identity groundwork outside the prepared calling release.

The implementation evidence above comes from local source and the already prepared pilot. No new production database inspection was performed for this review. The supplied image supports the desktop layout assessment; it cannot establish keyboard behavior, save reliability or full accessibility compliance.

## Approved implementation, October 7, 2026

Patrick approved proceeding after this review. Implementation is underway in the isolated `codex/calling-pilot` worktree, based on accepted compact-controls commit `e999baa804fefd3fab3336532b53822e9d975591`.

The roster uses private `prospect_contacts` relationships scoped to the existing broker and prospect/occupant record. This is a bounded relationship store, not a second global person directory. The unreleased account-intelligence module remains separate. Existing email matching and legacy editors continue to own the primary scalar contact fields; the roster reconciles a durable snapshot of that primary under the prospect lock. A meaningful primary identity change archives the prior identity and creates a new ID, preserving prior attribution. Cosmetic changes and phone edits for a named person retain the ID. Additional contacts and labeled phone choices are explicit broker entries.

New call starts freeze the contact ID, person snapshot and exact selected number. Confirmation and retries preserve that attribution even if the person is edited or archived while the call is pending. Company activity retains unattributed historical records. A selected-contact feed includes only explicitly attributed history. Primary and alternate dialing use the same existing private event/interaction/credit pipeline.

The default confirmation advances to the next company. The optional **Log & try another contact** confirms once, retains the current company and selects another callable contact without dialing. Company, contact and number selection stay locked during a pending call. The wider desktop workspace and queue stack on mobile; the compact 44px controls and quiet +15 receipt remain.

Prospect merging now includes the roster: existing UUIDs and history move with the selected account; an exact selected primary identity can retain its UUID. Full roster snapshots make undo exact and reject undo after subsequent contact changes. Pending calls must be confirmed or undone before merging their records. The contact migration is `0021_prospect_contacts.sql`, registered after the existing startup migrations. All new SQL verification uses disposable local PostgreSQL memory. No live migration, call, push or deployment is part of this implementation pass.

Final verification and captures belong in the simulation report and `design-qa.md`; this section records the accepted implementation model, not a claim that all checks have finished.
