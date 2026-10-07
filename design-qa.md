# Calling Company/Contact Workspace Design QA

October 7, 2026. Local implementation following Patrick's approved company/queue reference and the [saved design/data review](docs/calling-account-workspace-review-2026-10-07.md). The exact local checkpoint and source hashes are recorded in the ignored release receipt. No production migration, genuine call, push, or deployment is part of this QA.

## Visual evidence and acceptance

The supplied reference was compared with the actual app at desktop 1536 by 1024 and mobile 390 by 844. The final compact mock layout and copied-company ready/started captures were inspected and accepted. Company/address hierarchy, long queue names, selected-contact context, compact blue Call and green confirmation, and touch-visible roster actions remain contained without horizontal overflow. Main call actions precede the roster; the mobile workspace scrolls naturally before the queue. Primary actions retain a 44px minimum height. Keyboard heading focus and an unobscured confirmation receipt are covered by the existing browser checks. This is targeted visual/interaction QA, not a full accessibility audit.

Evidence remains private and ignored under `work/calling-simulation/private/screenshots`: `desktop-01-real-ready.png`, `desktop-03-real-started.png`, their mobile counterparts, and `desktop-09-two-contact-workspace.png` / `mobile-09-two-contact-workspace.png`. The supplied reference remains in the original checkout's ignored `work/calling-simulation/private/design-references`. No actual contact data or private captures are staged with this report.

## Intentional deviations from the reference

- Keep Level CRE's existing navigation and Today/Calls entry. Wide screens split the selected record and sticky queue at approximately 60/40; smaller screens stack them. Show three contacts initially and five queued companies on mobile, with explicit View all controls.
- Retain content-sized Call and I called · next controls, one progress area, and the quiet Call saved · +15 receipt. Omit the quote, duplicate encouragement meter, and nonfunctional drag handles.
- Use the broker's saved call goal. The copied real profile has NULL goals, so its captures display no fabricated target. A separate synthetic goal case verifies 0/20, unchanged after a start, and 1/20 after confirmation at both sizes. No conversation target is invented.
- Keep the existing prospect/occupant/property context and bounded private contact relationships. Selecting a person or company prepares context without dialing, credit, or permanent primary replacement. One person's additional numbers are choices on that person.
- Keep All account activity separate from Selected contact. Older unassigned history is retained and never attributed merely because someone is now primary. Existing company notes use a disclosure; optional call notes save with the confirmed call. There is no unrelated Save note action that silently awards call credit.

## Functional results

| Check | Accepted result |
| --- | --- |
| Stateful desktop/mobile browser regressions | 52/52 pass |
| Separate synthetic saved-goal checks | 2/2 pass |
| Actual copied-data browser journeys | 4/4 pass: five confirmations and a two-contact company at both sizes |
| Frozen-source copied-schema SQL rehearsal | 44/44 assertions pass |
| Calling/privacy, roster/schema, merge/undo tests | 53/53 pass |
| API checks | Typecheck/build pass; full suite 231/232, with the unchanged Windows ARM64 native-canvas/DOMMatrix import failure |
| Frontend checks | Full 144/144 before final per-event recovery fix; afterward helper 6/6 and production build pass, plus final browser coverage above |

Browser checks cover separate person feeds with no stale note leak, preserved legacy context, two numbers, selection without credit, frozen targets, retries and reload, default next-company versus explicit alternate, delayed-start confirmation ordering, rejected-start undo, late-response cancellation, unavailable local dismissal, and a second pending person at the same company. SQL additionally verifies durable identity replacement, archival, legacy primary field compatibility, ownership, and merge/undo consistency. Five-call and synthetic-roster phases reset independently: the former adds five calls/75 stored XP/five mapped actions and zero assets; the two-contact browser phase adds two calls/30 stored XP/two mapped actions and zero assets. Neither result describes full live account totals.

## Private handoff and remaining acceptance

The preview at `http://127.0.0.1:5180/app/calls` was reset to its eight-record copied baseline at 22:19:13 UTC, before user testing. Its persistent notice reads **Private simulation · copied data · no live calls**. An ignored adapter removes production authentication/environment use, sets Supabase to NULL, allows only the loopback memory API, verifies the release source root, blocks external resources and unexpected API routes, denies static snapshot access, and prevents phone handoff. Four isolation checks pass; reset health and current fingerprints remain ignored. Production UI has no simulation banner.

PGlite executes PostgreSQL 18.3/WASM with copied production 17.6 schema; geometry is opaque and connections are not concurrent. Real device dialing, deployed auth/RLS, PostGIS, Supabase realtime, full global skills/header handlers, email auditing, and brokerage memory remain outside this rehearsal. Migration 0021 and API/frontend coordination require release validation, then one explicitly selected genuine call to an owned, unshared prospect. No blocking layout issue remains in the inspected states. The repeated Primary subtitle/badge found during comparison was corrected.

final result: passed for the calling workspace local rehearsal within these boundaries.

---

# Historical map QA, preserved unchanged

The following accepted map-search report predates the calling workspace. Its content is retained verbatim; it is not evidence for the new calling flow.

# Map Search Result Design QA

## Evidence

- Source visual truth: `C:\Users\patri\AppData\Local\Temp\codex-clipboard-543fee5a-0644-4423-930d-5e30f6cfdd15.png`
- Browser-rendered implementation: `artifacts/design-qa/search-result-card-live-v2.png`
- Focused implementation: `artifacts/design-qa/search-result-card-focused-v2.png`
- Full-view comparison: `artifacts/design-qa/search-result-card-comparison.png`
- Focused comparison: `artifacts/design-qa/search-result-card-focused-comparison.png`
- Viewport: 1440 x 1000; evidence crop normalized to 742 x 493
- State: `/app` in demo mode, aerial map, `10060 Jasper Avenue` selected from live Google Places results

## Findings

- No actionable P0, P1, or P2 findings remain.
- Typography: the 13px semibold title, 11px secondary address, and 12px action retain clear hierarchy without the oversized CTA competing with the location.
- Spacing and layout: the rendered Google InfoWindow measures 232 x 134; the shared content is 220px wide and the action is 92 x 28. The duplicate close action and full-width button are removed.
- Colors and tokens: the popup keeps Google's white surface and native close treatment while using Level CRE's existing slate and blue tokens.
- Image quality: the real aerial Google map rendered sharply with the selected marker visible; no substitute or generated assets were used.
- Copy: `Add to map` preserves the original action meaning while using sentence case and a compact plus icon.
- Affordance and accessibility: there is one close control, the add action remains keyboard focusable, and the focus ring is inset so it cannot be clipped by the InfoWindow boundary.

## Interaction Checks

- Searched an unsaved Edmonton address through live Google Places.
- Selected a Places result and confirmed the compact popup rendered over the correct marker.
- Switched between road and aerial map modes.
- Confirmed one close control and one `Add to map` action.
- Console errors checked: none.
- Automated production map journey: passed.

## Comparison History

1. Initial implementation removed the full-width CTA and duplicate close control, but the browser capture showed the automatically focused action ring clipped at the InfoWindow edge (P2 polish issue).
2. Added an inset focus treatment and disabled requested InfoWindow focus. The post-fix aerial capture shows no clipped edge or duplicate control.

## Follow-up Polish

- No P3 item is required for this request. The same compact result component is used by the main map and the shared prospecting workspace to prevent visual drift.

final result: passed
