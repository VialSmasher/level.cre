# Calls Clear Blue visual polish, October 8, 2026

**final result: passed**

Patrick selected option 1, Clear Blue, and explicitly requested the live release after the completed checks so further functional and design changes can follow. This release is limited to presentation in the Calls page and its contact/activity components. The new isolated branch starts at released commit `4f27ceb4da850517f13ecfa9a7eeab2c4740a342`; concurrent functional work is excluded.

## Source and rendered evidence

- Source visual truth: `C:/Users/patri/.codex/generated_images/01a11c90-85d0-74a1-b85d-fb0ac3edb4f0/exec-add25553-0528-4859-ac3f-ad8f3ab4ab5c.png`.
- Final browser-rendered implementation: `C:/Users/patri/Documents/GitHub/level.cre/work/calls-polish/iteration3/clear-blue-desktop.png`.
- Full paired comparison: `C:/Users/patri/Documents/GitHub/level.cre/work/calls-polish/iteration3/clear-blue-comparison-full.png`.
- Focused paired comparisons in the same private directory: `clear-blue-comparison-account.png`, `clear-blue-comparison-contacts.png`, `clear-blue-comparison-queue.png`, and `clear-blue-comparison-metrics.png`. Both source and implementation were opened together for each comparison.
- Source and desktop render: 1787 x 880 pixels, 1787 x 880 CSS viewport, device scale 1. No resampling needed. Comparison canvases add labels and place both images side by side.
- Additional rendered views: mobile 390 x 844 and tablet 820 x 1180, both scale 1, plus full-page and contact-editor captures in that directory.
- State: selected company from the approved snapshot, two contacts including a phone-less primary and selected company line, empty activity, zero progress, no saved target, queue count 138 and queue positioned at row 11. All data is isolated browser fixture data. No production record or phone handoff is involved.

## Comparison history and findings

1. Initial comparison found P2 typography and vertical rhythm drift: small text and excess panel height. Desktop type scale was increased locally, KPI and section padding tightened, and the main width aligned with the source. The original checkout developed unrelated concurrent changes, so it was abandoned for final validation.
2. Clean iteration 2 resolved those findings: account height 648.5px versus source approximately 646px, KPI height 80px versus approximately 78px, and clearer title/contact text. Queue density still showed nine companies where the source showed ten. Desktop queue row padding was reduced. KPI markup was also corrected so each immediate description-list group contains its own dt/dd elements.
3. Clean iteration 3 recaptured the corrected source and paired it with the selected image. Ten queue company labels are visible, the current-call panel is contained, and no actionable P0/P1/P2 issue remains. The last queue phone sits near the viewport edge; the existing scrollable queue remains usable. Minor baseline, cropping and font-metric differences are P3 follow-up polish. Patrick requested ending further testing and releasing this iteration.

## Required fidelity surfaces

- **Fonts and typography:** Retain the established Aptos/Inter/Segoe UI/Arial stack. The desktop account title is 28px, queue/contact names 16px, section headings 16–18px, and secondary text 12–14px. Mobile retains smaller text and wrapping. Generated-reference font metrics differ slightly; established product typography is intentional.
- **Spacing and layout:** Approximately 58/42 split, 16px gutter, compact content-sized 80 x 44 Call button, 64px contact rows, tighter queue rows, and a stacked phone/tablet layout. All captured document widths equal their viewports. Existing navigation and Needs a number remain present.
- **Colors and tokens:** Cool-white `#f6f9ff` canvas, white tiles, pale blue headers and selected contact, existing blue call action, green logged count, and subdued amber overdue reason. The existing dark sidebar is retained.
- **Images and icons:** Existing logo and Lucide icon library remain sharp. Outline phone/check/chat icons intentionally follow the app library rather than drawing the raster mock's solid icons. No new decorative artwork or custom SVG was introduced.
- **Copy and content:** Existing labels, saved contact information, account history filters, goal, outcomes and queue actions are unchanged. No invented target, XP label or activity was added. Sidebar fixture identity and sync footer differ from the live session by design.

## Completed verification

- Frontend unit regressions: 147/147.
- Full isolated desktop/mobile calling browser regressions: 80/80.
- Final affected layout/calling/goal/history/navigation checks after the last markup and spacing adjustment: 14/14.
- Final production frontend build passed.
- TypeScript AST review confirms non-render state, hooks, mutation functions and handlers match the release base; component changes are classes only; existing event, accessibility and data attributes are preserved.
- Desktop/mobile/tablet read-only fixture interactions exercised company and contact selection plus opening/cancelling the contact editor. Zero API mutations, zero horizontal overflow and zero app runtime exceptions were recorded. The sole console resource error is the deliberately blocked external Google font stylesheet; the established installed font fallback renders normally.

This is targeted visual and interaction validation, not a full accessibility audit or verification of a genuine connected phone call. Private screenshots, fixtures and logs remain excluded from Git. Backend, database and automations are outside this cosmetic release.

**Implementation checklist:** selected palette applied; compact actions retained; responsive layout captured; typography/rhythm findings corrected; valid KPI grouping restored; completed regression/build results recorded. Further visual refinements can accompany Patrick's next requested changes.

---

## Earlier company/contact workspace QA record

The October 7 record below is retained for history. Its states and test counts describe that earlier implementation, not this visual release.

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

## Private preview stylesheet follow-up

The user reported an unstyled handoff preview after the implementation checkpoint. Tailwind's relative content globs resolved from the original checkout working directory, so the private preview compiled base styles without utility classes. Earlier browser QA started from the web workspace and did not exercise this startup path. The ignored preview adapter now supplies explicit PostCSS plugins with absolute content paths into the release tree; application source and production configuration are unchanged.

Read-only verification of the actual port 5180 preview passed at 1536 by 1024, 698 by 936, and 390 by 844. The Call control measures 79.3 by 44 CSS pixels and has the expected blue background; navigation switches correctly, there is no horizontal overflow, the simulation notice remains visible, and browser error counts are zero. Call progress was unchanged. The repeatable `preview-style-smoke.mjs`, JSON results, and `preview-style-*.png` captures remain ignored in the original checkout's private simulation folder. The in-app automation helper was unavailable; the previously authorized isolated Chrome fallback supplied these captures. The supplied failure screenshot and corrected narrow screenshot were visually checked, as were corrected desktop/mobile views.

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
