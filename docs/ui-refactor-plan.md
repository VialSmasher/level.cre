# UI Refactor Plan

This plan professionalizes the existing Level CRE UI without a full app rewrite. It is design-system-first, incremental, and intended to preserve auth, database behavior, API contracts, routing, and business logic.

## Guiding Constraints

- Do not rewrite the app.
- Do not change auth, database, API contracts, routing, or business logic.
- Do not restyle pages randomly one by one.
- Start with shared tokens and primitives.
- Keep the map workflow, Industrial Intel workflows, Track Record, workspaces, imports, exports, and sharing intact.
- Prefer low-risk visual consolidation before deeper page layout changes.

## Phase 1. Global Tokens And Components

### Objective

Make the whole app inherit a calmer, denser, more professional visual language from shared foundations.

### Work

- Reduce global border radius defaults.
- Define stricter surface, border, text, muted, primary, and semantic status tokens.
- Make shadows opt-in rather than a common panel treatment.
- Add or harden shared primitives:
  - `PageHeader`
  - `CommandBar`
  - `DataPanel`
  - `MetricTile`
  - `StatusBadge`
  - `DataTable`
  - `EmptyState`
  - `LoadingState`
  - `DrawerPanel`
  - `ImportDropzone`
- Tighten existing primitives:
  - `Button`
  - `Card`
  - `Badge`
  - `Table`
  - `Input`
  - `Select`
  - `Textarea`
  - `Dialog`
  - `Sheet`
  - `Modal`
  - `Skeleton`
  - `Spinner`
- Define icon sizing and icon-button rules.
- Add component examples or a local reference page if the repo has an existing place for it.

### Guardrails

- Keep component APIs compatible where practical.
- Do not force every page migration in this phase.
- Avoid large visual rewrites hidden inside primitive changes.
- Test pages that heavily depend on default `Card`, `Button`, and `Badge` styles.

### Deliverables

- Updated token definitions.
- Updated shared primitive defaults.
- New shared layout/data primitives.
- Short migration notes for page owners.

### Verification

- Run typecheck/build.
- Spot-check core pages:
  - `/app`
  - `/launcher`
  - `/tools/industrial-intel`
  - `/tools/industrial-intel/listings`
  - `/track-record`
  - `/broker-stats`

## Phase 2. App Shell, Header, Navigation, And Page Layout

### Objective

Make Level CRE, Industrial Intel, Track Record, and broker workflow pages feel like one operating system.

### Work

- Unify `AppLayout` and `ToolLayout` styling.
- Use one nav item model for desktop and mobile.
- Show stable nav labels instead of active-only labels.
- Replace rounded pill nav with compact enterprise active states.
- Separate product switching, account settings, admin/debug links, and core workflow nav.
- Standardize page padding and max-width rules.
- Apply shared `PageHeader` to protected pages.
- Apply shared `CommandBar` for search/filter/action regions.
- Hide or lower priority of developer/demo controls in production-facing UI.
- Fix obvious encoding artifacts in shell and shared UI while touching nearby files.

### Guardrails

- Do not change route paths.
- Do not remove gated routes.
- Keep current auth and feature-flag behavior.
- Keep mobile access to all existing routes.

### Deliverables

- Unified shell visual treatment.
- Shared page header pattern.
- Consistent protected-app page spacing.
- Clear nav hierarchy.

### Verification

- Navigate all protected routes.
- Confirm feature-flagged Industrial Intel routes still work.
- Confirm mobile nav exposes the same destinations as desktop.
- Confirm admin/debug routes remain accessible only as currently allowed.

## Phase 3. Cards, Buttons, Tables, Forms, Badges, And Overlays

### Objective

Replace the demo-card feel with production-grade data surfaces and consistent controls.

### Work

- Migrate routine status chips to `StatusBadge`.
- Remove page-specific badge color formulas where possible.
- Replace oversized icon bubbles with small inline icons or remove icons entirely.
- Replace large card grids with tables or split list/detail layouts where brokers compare records:
  - Market comps
  - Requirements
  - Follow-ups
  - Workspaces
  - Track Record deals
  - Industrial Intel listing queue
  - Industrial Intel saved requirements
  - Dossiers
  - Surveys
- Define table row actions, bulk actions, empty rows, loading rows, and status cells.
- Standardize modal/drawer structure:
  - Header
  - Body
  - Footer
  - Close action
  - Sticky actions for long forms
- Consolidate import/export/dropzone styling across:
  - CSV import
  - Dossier upload
  - Track Record import
  - Profile export
  - Survey/source uploads
- Replace decorative empty states with compact operational states.
- Replace large spinners with skeletons and inline progress where appropriate.

### Guardrails

- Keep existing data shapes and event handlers.
- Prefer wrapping existing page content in shared primitives before restructuring logic.
- Do not change import parsing, upload behavior, or export formats in this phase.

### Deliverables

- Shared badge/status system adopted in high-traffic pages.
- Stronger shared table/data-grid pattern.
- Consistent overlay and form treatment.
- Consolidated upload/import/export visual patterns.

### Verification

- Smoke-test create/edit flows.
- Smoke-test import/export flows.
- Confirm destructive actions still require confirmation.
- Check keyboard focus and visible focus states for dialogs and row actions.

## Phase 4. Page-By-Page Cleanup

### Objective

After the shared language exists, clean up each route with minimal local styling and stronger workflow layouts.

### Recommended Order

1. `/app` map workflow
2. `/app/workspaces` and `/app/workspaces/:id`
3. Industrial Intel inventory
4. Industrial Intel dossiers
5. Industrial Intel requirements
6. Industrial Intel surveys and public survey view
7. Market comps
8. Requirements
9. Follow-ups
10. Knowledge and inbox/review workflows
11. Track Record
12. Broker performance, leaderboard, and badges
13. Launcher and landing-adjacent protected entry points
14. Profile, settings, imports, exports, and admin diagnostics

### Page Notes

#### Map Workflow

- Keep the map as the primary surface.
- Normalize map controls, search, status legend, context menu, and edit panel.
- Replace dark glass legend styling with a compact bordered panel.
- Remove XP toast behavior from map actions.
- Ensure developer controls are not visually competing with broker controls.

#### Workspaces And Listings

- Treat workspaces as broker records, not large marketing cards.
- Use table/list-first layout with status, owner, shared state, listing count, and updated date.
- Keep legacy listing redirects intact.
- Keep share and delete flows intact while restyling dialogs.

#### Industrial Intel

- Keep the workflow depth.
- Make inventory, requirements, dossiers, and surveys feel like data workbenches.
- Replace oversized workflow cards with compact metrics, command bars, queues, and detail panels.
- Keep public survey pages slightly more spacious but still restrained and print-friendly.

#### Market Comps

- Move from card grid to table-first comps ledger.
- Prioritize address, comp type, asset type, size, rate/price, date, source, confidence, and actions.
- Keep current create/edit/delete behavior.

#### Requirements

- Move from card-board feel to requirement pipeline table or split list/detail.
- Keep quick entry, broker assignment, statuses, tags, and notes.
- Replace playful icons and excessive chips with structured fields.

#### Follow-Ups

- Make follow-ups a queue with due date, company/contact, property, reason, priority, owner, and action.
- Keep snooze, complete, call, and note flows.
- Reduce card-heavy prospect presentation.

#### Knowledge, Inbox, And Review

- Reframe as operations queues and review consoles.
- Reduce decorative production-pulse and trophy elements.
- Keep cleanup, triage, note, and audit actions.

#### Track Record

- Make the default mode a private deal ledger table.
- Keep import, photo management, client-safe copy, print, and presentation mode.
- Tone down trophy/private ledger styling and large photo-card defaults.

#### Broker Performance / Scorecard

- Reframe gamification as productivity analytics.
- Remove podium, badge collection, XP-first, and trophy/medal/crown visual language from primary surfaces.
- Keep useful metrics, next best actions, team comparison, and activity trends.

#### Launcher And Landing

- Launcher should become a compact tool console.
- Landing can remain more expressive, but fix encoding artifacts and avoid visual mismatch with protected app claims.

#### Admin / Settings / Import / Export

- Use a settings/admin template with compact forms and tables.
- Keep export/import behavior intact.
- Consolidate CSV uploader variants if one is legacy.
- Make diagnostics clearly internal and visually subordinate.

### Guardrails

- Migrate one page family at a time.
- Keep local page diffs readable.
- Avoid introducing new visual systems inside page cleanup.
- Use shared primitives unless a page has a truly unique need.

### Deliverables

- Refined route families with shared components.
- Reduced local Tailwind styling.
- Fewer one-off badges, cards, modals, and filters.
- Page-specific QA notes.

### Verification

- Use browser screenshots for desktop and mobile.
- Check loading, empty, error, and populated states.
- Verify no text overlaps at narrow widths.
- Verify maps, drawers, dialogs, and tables remain usable.

## Phase 5. Polish And QA

### Objective

Make the refactor feel production-ready and reduce regression risk.

### Work

- Full route screenshot pass.
- Mobile pass for shell, forms, drawers, tables, and map controls.
- Accessibility pass:
  - Focus states
  - Dialog focus traps
  - Button labels
  - Icon-only tooltips
  - Color contrast
  - Keyboard access
- Data-state pass:
  - Empty
  - Loading
  - Error
  - Permission denied
  - Feature disabled
  - Long names
  - Large datasets
- Copy pass:
  - Remove playful/gamified copy from core workflows
  - Normalize page titles
  - Fix encoding artifacts
  - Reduce marketing language inside protected app
- Performance pass:
  - Avoid heavy shadows and filters
  - Watch map overlay rendering
  - Avoid expensive table re-renders

### Guardrails

- Do not combine QA polish with new product behavior.
- Do not expand scope into backend or workflow changes.
- Keep changes reviewable by page family.

### Deliverables

- Screenshot QA notes.
- Accessibility fixes.
- Final visual polish.
- Regression checklist for future UI changes.

## Suggested First Implementation Slice

The safest first slice after this planning pass:

1. Tighten radius, border, surface, shadow, and status tokens.
2. Update `Card`, `Button`, `Badge`, `Table`, `Modal/Dialog`, `Sheet`, `Skeleton`, and `Spinner` defaults.
3. Add `PageHeader`, `CommandBar`, `StatusBadge`, `DataPanel`, and `DataTable`.
4. Apply the shell/page-header treatment to `/launcher`, `/app`, `/tools/industrial-intel`, and `/track-record`.
5. Remove or hide the most visible gamification treatments from primary navigation and core workflow confirmations.

This gives the app a more serious visual foundation before deeper page migrations begin.

