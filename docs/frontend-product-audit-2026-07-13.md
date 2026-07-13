# Level CRE Frontend Product Audit

Date: 2026-07-13

## Product Standard

Level CRE is a map-first business-development operating system for a commercial real estate broker. It should do three jobs exceptionally well:

1. Preserve a visual memory of the market: properties, companies, relationships, requirements, and nearby context.
2. Turn captured activity from Outlook, Codex, Postmark, and manual work into a trustworthy daily operating view.
3. Show whether prospecting effort is creating momentum, a healthier pipeline, and eventual production.

Codex is the research, drafting, inference, and coaching layer. Level CRE is the durable market graph, map, activity ledger, and business-development calculator.

## Current Audit

### Critical

- The entry journey describes three different products with equal weight. The landing page sells surveys, the launcher sells a toolbox, and the application behaves like a CRM. A user cannot form one clear mental model.
- The launcher duplicates the role of the Daily Desk and adds a decision before useful work. Labels such as "Tool C" and "built to grow into a toolbox" expose internal product thinking instead of helping a broker work.
- The main map does not visually anchor the product. On the live audit it initially rendered as a large empty field with unrelated floating controls and an oversized open status panel.
- Navigation labels do not match the intended workflows. "Deals" implies transaction management, while the actual workspace is for listing and area prospecting. "Inbox" sounds like another email client, while it is an activity evidence and review surface.

### High

- The interface uses multiple visual systems at once: rounded marketing cards, a conventional top navigation, floating map tools, and dense table-like dashboard sections. Radius, shadows, spacing, type scale, and color emphasis vary by page.
- The Daily Desk gives technical source health and stale workspace records similar visual priority to revenue-moving work. The hierarchy should be action, pipeline, momentum, then system health.
- Activity metrics mix useful signals with vanity totals. Mapped prospect count is market coverage, not current effort or momentum.
- The public landing preview is a CSS illustration of a map and no longer represents the actual product direction.

### Medium

- The authenticated navigation hides important related tools in a profile menu while showing five peers across the top. The result is simultaneously crowded and hard to discover.
- The map search and drawing controls use ambiguous icons and controls. The strict-bounds square is especially unclear.
- Production-only developer controls and placeholder copy remain in the map route.
- Several public strings contain encoding artifacts such as `â€¢` and `Â·`.

## Information Architecture

The persistent application navigation is limited to five destinations:

| Destination | Job |
| --- | --- |
| Today | Ranked daily actions, review decisions, momentum, and pipeline health |
| Map | Visual market memory, context, search, and prospect editing |
| Pursuits | Team prospecting around a listing, target property, or defined area |
| Activity | Captured Outlook/Codex/Postmark evidence and exceptions needing review |
| Scorecard | Effort, momentum, pipeline, and production trends |

Requirements, follow-up lists, market comps, knowledge, track record, review tools, and settings remain available as supporting tools. They are not equal top-level product identities.

The `/launcher` route remains only as a backwards-compatible redirect. Successful sign-in goes directly to `/app/desk`.

## Visual System

- **Character:** quiet broker workstation, not a marketing dashboard.
- **Layout:** fixed desktop work rail, compact mobile header, stable mobile bottom navigation, full-bleed map canvas.
- **Surfaces:** white operational surfaces on a cool neutral workspace; 6px default radius; subtle borders and shadows.
- **Color:** cobalt for commands and selection, green for healthy progress, amber for attention, red for overdue or critical work, charcoal for primary hierarchy.
- **Typography:** compact system sans stack, tabular numerals for metrics, no viewport-scaled type, no negative letter spacing.
- **Density:** information-dense but scannable. Use separators and bands before adding more cards.

## Release Sequence

### Release 1: One Product

- Replace the top navigation with the shared broker work rail and mobile dock.
- Rename Deals to Pursuits and Inbox to Activity.
- Remove the launcher from the normal sign-in journey.
- Rebuild the public landing page around the map-first market-memory product.
- Reduce map obstruction and clarify search, market scope, map type, and drawing tools.
- Re-rank the Daily Desk hierarchy around effort, momentum, pipeline, and next action.

### Release 2: Workflow Consistency

- Apply the shared page shell, headers, filters, empty states, and data tables to Pursuits, Activity, Requirements, Follow-up, and Scorecard.
- Rework Pursuits around listing/area campaigns and client activity reports.
- Consolidate duplicate follow-up and review concepts into Activity and Today.

### Release 3: Product Proof

- Add capture-health and match-confidence reporting without putting diagnostics in the primary workflow.
- Show map coverage, relationship history, and recent activity together when preparing for a meeting.
- Add production goals and a visible conversion path from activity to meetings, tours, proposals, offers, and closed revenue.

## Acceptance Criteria

- A broker can identify the product, current market, and primary next action within five seconds.
- The map remains the largest visual surface and is not obscured by default-open panels.
- Today, Map, Pursuits, Activity, and Scorecard use the same navigation and visual language.
- The default authenticated path contains no launcher decision.
- Desktop and mobile layouts have no overlapping navigation, controls, menus, or editable panels.
- The core build and focused tests pass before deployment.
