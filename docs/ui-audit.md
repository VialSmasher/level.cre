# UI Audit

This audit covers the current Level CRE web app from the route and component source. It is intentionally a design/refactor audit only. No auth, database, API contract, routing, or business logic changes are proposed here.

## 1. Pages, Routes, And Components Reviewed

### Public And Entry Routes

- `/` landing page: `apps/web/src/pages/landing.tsx`
- `/launcher` tool selection page: `apps/web/src/pages/launcher.tsx`
- `/pricing`, `/terms`, `/privacy`, `/debug`
- `/auth/callback`

### Shared Shell, Navigation, And Foundations

- Main app shell: `apps/web/src/components/AppLayout.tsx`
- Industrial Intel shell: `apps/web/src/tools/industrial-intel/ToolLayout.tsx`
- Global CSS tokens: `apps/web/src/index.css`
- Tailwind preset: `packages/shared/tailwind-preset.cjs`
- Shared UI primitives: `Button`, `Card`, `Badge`, `Table`, `Input`, `Select`, `Textarea`, `Checkbox`, `Skeleton`, `Tooltip`, `Sheet`, `Dialog`, `Tabs`, `Sidebar`
- Custom primitives and utilities: `Modal`, `Spinner`, `PageErrorBoundary`, `DeveloperSettings`

### Level CRE CRM / Map Workflow

- `/app`: `apps/web/src/pages/home.tsx`
- Map components: `PropertyMap`, `MapControls`, `SearchBar`, `SearchComponent`, `StatusLegend`, `MapContextMenu`, `EditPropertyPanel`, `AddPropertyForm`, `PropertyInfoWindow`, `ConnectionStatus`
- Import and CSV tools: `CSVUploader`, `CSVUploaderNew`, field mapping and import dialogs

### Industrial Intel

- `/tools/industrial-intel`: `IndustrialIntelHomePage`
- `/tools/industrial-intel/listings`: `IndustrialIntelInventoryPage`
- `/tools/industrial-intel/requirements`: `IndustrialIntelRequirementsPage`
- `/tools/industrial-intel/dossiers`: `IndustrialIntelDossiersPage`
- `/tools/industrial-intel/surveys`: `IndustrialIntelSurveysPage`
- `/tools/industrial-intel/surveys/share/:token`: `IndustrialIntelSurveyClientPage`
- Supporting components: dossier upload flow, listing queue, requirement matching, survey builder, source health, public link resolver

### Track Record, Performance, And Gamification

- `/track-record`: `TrackRecordPage`
- `/broker-stats`: `StatsPage`
- `/leaderboard`: `LeaderboardPage`
- `/badges`: `BadgesPage`
- Gamification components and data: `GamificationToast`, `BrickWall`, `salesBadges`

### Broker Workflow Pages

- `/app/knowledge`: `KnowledgePage`
- `/app/followup`: `FollowUpPage`
- `/app/requirements`: `RequirementsPage`
- `/app/market-comps`: `MarketCompsPage`
- `/app/inbox`: `InboxPage`
- `/app/review`: `ReviewPage`

### Workspace, Listings, And Sharing

- `/app/workspaces`: `WorkspacesPage`
- `/app/workspaces/:id`: `WorkspacePage`
- Legacy `/app/listings` and `/app/listings/:id` redirects to workspaces
- Sharing and collaboration: `ShareWorkspaceDialog`

### Admin, Settings, Import, Export

- `/app/profile`: profile, settings, submarkets, import/export
- `/admin/diag`: admin diagnostics
- Internal test pages: `/app/map-tools-test`, TerraDraw test components
- Import/export components and data-management affordances across profile, map, Track Record, and Industrial Intel

## 2. What Feels Cheap, Inconsistent, Or Amateur

### The App Reads Like Multiple Products

The main Level CRE app, the Industrial Intel tool, the launcher, the landing page, the broker stats pages, and Track Record each use their own visual language. There are separate shells, separate page header patterns, separate card styles, separate status badge systems, and separate modal/dropzone treatments. The product feels assembled route-by-route instead of governed by a shared operating-system design language.

### The Global Radius Is Too Soft

The global radius token is very large, and many pages further override it with `rounded-full`, `rounded-2xl`, or `rounded-3xl`. This makes serious workflow surfaces feel bubbly. The issue is not just cosmetic: large radii appear on nav items, filters, cards, icon wrappers, dropzones, action buttons, modals, metric tiles, and empty states, so the whole app inherits a toy-like softness.

### Cards Are Used Where Tables, Panels, And Rows Should Exist

Many broker workflows are data-first but render as large card grids:

- Workspaces
- Requirements
- Follow-ups
- Market comps
- Track Record deals
- Industrial Intel listings
- Industrial Intel requirements
- Surveys
- Dossiers
- Broker standings

Cards are useful for summaries and selected detail panels, but the app leans on cards for almost every object type. This weakens scanability and makes the product feel like a demo instead of an internal deal desk.

### Icon Bubbles And Decorative Icons Are Overused

Circular or rounded icon tiles appear in stat cards, page headers, nav, launcher cards, workspace cards, requirement cards, empty states, and performance pages. Icons such as Trophy, Medal, Crown, Flame, Zap, Sparkles, Wand, and Bot create a playful tone that conflicts with the desired industrial brokerage platform feel.

### Gamification Is Too Prominent

The performance area currently foregrounds XP, levels, badges, leaderboards, streaks, trophies, medals, crowns, and badge collection mechanics. `GamificationToast` can surface XP after broker actions. `BrickWall` still exists as a game-like achievement visualization. These patterns read more like sales game mechanics than institutional brokerage operations.

### Tables Are Underdeveloped And Inconsistent

The shared `Table` primitive is basic and underused. Many pages hand-roll list rows, pseudo-tables, card grids, or ad hoc grids. Broker workflows need strong tables with clear row density, column hierarchy, sticky headers where useful, row actions, sortable columns, empty/loading rows, and consistent status cells.

### Page Headers Are Inconsistent

Page titles vary in size, language, and hierarchy. Some pages use marketing copy, some use dashboard copy, some use "command center" labels, some use large hero-like blocks, and some rely on dense operational controls. The app needs one enterprise page header model: title, concise subtitle, primary action, secondary actions, filters/search, and optional context metrics.

### The Shell Feels Like A Demo Launcher

`AppLayout` uses a pill-shaped top nav with active-only labels and icon-only inactive items. `ToolLayout` uses a different header for Industrial Intel, with rounded icon bubbles and pill nav. The launcher uses oversized rounded tool cards. This makes the product feel like a collection of demos rather than one broker OS.

### Shadows, Hover Motion, And Soft Panels Are Overused

Even though global shadow variables are muted, individual pages use Tailwind shadow classes directly. Hover shadows, hover translate effects, large soft cards, backdrop blur, and dark glass-style map overlays show up repeatedly. This creates a polished-mockup feel instead of a practical operations system.

### Color Semantics Are Too Loose

Blue, emerald, amber, violet, orange, rose, indigo, and slate are used for routine states, icons, cards, filters, and stats without a strong semantic system. The same color can mean status, category, emphasis, AI, action, or decoration depending on the page.

### Empty And Loading States Feel Decorative

Empty states often use large dashed cards, big icon bubbles, friendly explanatory copy, or oversized spinners. The app needs quieter operational empty states: compact, actionable, and consistent with tables and panels.

### Import, Upload, And Export Flows Are Not Unified

CSV import, dossier uploads, Track Record import, profile export, and survey/uploads use different visual treatments. There appear to be duplicate uploader components. These workflows should feel like one enterprise import/export system, not separate page-specific affordances.

### Encoding Artifacts Reduce Trust

Several files include mojibake such as `â€¢`, `Â·`, `âœ•`, and `Resettingâ€¦`. These small issues immediately make the product feel less production-grade.

## 3. What Should Be Kept

### The Product Direction Is Strong

The underlying app already has serious broker workflow substance. The UI should not erase that. It should quiet the presentation and make the existing workflows feel more institutional.

### Keep The Map-First CRE Workflow

The Level CRE map, property editing, status filtering, search, custom controls, and right-side edit panel are the core product. The map workflow is the strongest operating-system signal in the app. It should be refined, not redesigned from scratch.

### Keep The Industrial Intel Depth

Industrial Intel has real workflow value:

- External inventory queue
- Source health and source runs
- Duplicate review
- Manual intake and upload review
- Public listing link resolver
- Requirement capture and matching
- Survey builder and public survey links
- Dossier library, approved facts, source material, and readiness tracking

These features are the right shape for an intelligence platform. They need denser, calmer UI.

### Keep Workspaces And Sharing

The workspace model is useful and aligns with how brokers package listings, collaborate, and share controlled views. The share dialog, member management, and workspace detail map should remain but use stronger tables, panels, and permission/status treatments.

### Keep Track Record As A Broker Asset

Track Record is valuable as a private ledger and client-safe presentation tool. The import, photo, print, and presentation-mode concepts should stay. The main view should become ledger/table-first, while presentation mode can remain more visual and client-facing.

### Keep Fast Broker Actions

Quick follow-up logging, voice capture, note entry, requirement creation, survey drafting, and import flows are important. The UI should make these actions faster and more legible, not bury them.

### Keep Tailwind And Shared Primitives

The app already has a usable primitive layer and Tailwind token structure. The safest path is to harden tokens and primitives first, then let pages inherit the new language.

### Keep Route Structure And Business Logic

Do not rewrite routing, auth, API contracts, database behavior, or business logic as part of UI professionalization.

## 4. What Should Be Removed Or Toned Down

### Remove Or Quarantine Game-Like UI From Core Workflows

- XP toasts after routine broker actions
- Trophy, medal, crown, flame, zap, sparkles, and badge-collection treatment in primary nav and core pages
- Leaderboard styling that resembles a game podium
- `BrickWall` style achievement visualization
- "Level" language as a primary performance concept

If performance metrics remain, they should read as productivity, pipeline health, data quality, and broker activity metrics.

### Tone Down The Launcher

The launcher should feel like a tool console or workspace switcher, not a SaaS app chooser. Replace oversized rounded cards and trophy styling with compact rows or dense panels showing tool name, purpose, status, and primary action.

### Tone Down Marketing-Landing Styling In App Surfaces

Marketing pages can remain more expressive, but the protected app should not inherit startup landing-page patterns: huge headlines, decorative grids, large preview cards, and promotional copy.

### Reduce Icon Bubbles

Use icons mainly as small utility aids in buttons, nav, table row actions, and compact status indicators. Avoid large colored icon containers unless they carry real hierarchy.

### Reduce Shadows And Hover Animation

Use borders, spacing, typography, and table hierarchy instead of shadows. Reserve elevation for popovers, menus, modals, and active drag/drop states.

### Remove Random Neon Or One-Off Color Systems

Replace page-specific color palettes with semantic tokens for status, priority, confidence, source health, and action state.

### Replace Card Grids With Tables Where Brokers Scan Data

Requirements, comps, follow-ups, workspaces, listings, dossiers, and Track Record should default to dense tables or list/detail layouts. Cards can remain for selected records, summaries, public/client views, or small repeated visual assets.

### Consolidate Import/Upload UI

CSV import, listing uploads, dossier uploads, Track Record import, and profile export should share one import/export visual system with consistent dropzones, mapping tables, progress, errors, and completion states.

## 5. Repeated UI Issues

### Shared Tokens

- Large global radius creates soft defaults everywhere.
- Shadow variables are muted, but page-level Tailwind shadow classes bypass them.
- Surface, border, muted, and primary colors do not yet produce a distinct enterprise hierarchy.
- Color semantics are not strict enough for data-heavy workflows.

### Shared Components

- `Card` is too visually dominant for default layout use.
- `CardTitle` is often too large for dense panels.
- `Badge` defaults to pill styling, which encourages bubbly status chips.
- `Button` has reasonable foundations but pages override it into large pills and icon bubbles.
- `Table` needs stronger enterprise defaults and broader adoption.
- `Modal`, `Dialog`, `Sheet`, custom drawers, and custom modals are visually inconsistent.
- Loading and empty states are not governed by shared primitives.

### App Shell

- Main app and Industrial Intel use separate shells.
- Nav treatment is too rounded and inconsistent.
- Inactive nav labels are hidden in the main app, reducing scanability.
- Profile and tool menus mix product navigation, settings, debug, and gamified destinations.
- Mobile nav duplicates route lists manually.

### Page Layouts

- Page max widths, padding, header spacing, action placement, filter bars, and stat rows vary by page.
- Several pages use "command center", "workbench", "dashboard", or "board" language interchangeably.
- Large cards and repeated stat blocks consume vertical space before core data appears.

### Data Presentation

- Tables are missing or weak on pages where row comparison matters.
- Status badges and filters are inconsistent by page.
- Row actions are often hidden in hover cards or scattered in menus.
- Metrics lack consistent definitions and placement.

### Map And Spatial UI

- Map controls, status legends, edit panels, workspace toolbar, and developer controls use different surface styles.
- Dark glass overlays and floating rounded controls conflict with the rest of the UI.
- Developer/demo controls should not share visual priority with broker controls.

### Copy And Tone

- Some protected routes still use marketing language.
- Some pages use playful productivity copy.
- Gamified labels and badge names make broker operations feel less serious.
- Encoding artifacts reduce polish and trust.

## 6. Highest-Impact / Lowest-Risk Fixes First

### 1. Tighten Global Tokens

Reduce the default radius, standardize border colors, neutralize surfaces, make shadows opt-in, and define semantic status tokens. This changes the app's feel broadly without touching business logic.

### 2. Harden Shared Primitives

Update `Card`, `Button`, `Badge`, `Table`, `Modal/Dialog`, `Sheet`, `Skeleton`, `Spinner`, and form primitives to enterprise defaults. Add missing primitives for `PageHeader`, `CommandBar`, `DataPanel`, `MetricTile`, `StatusBadge`, `DataTable`, `EmptyState`, and `LoadingState`.

### 3. Unify The App Shell

Make `AppLayout` and `ToolLayout` speak the same visual language. Use consistent nav labels, active states, profile menu styling, page padding, and utility actions. This will immediately reduce the "multiple apps" feeling.

### 4. Standardize Page Headers And Filter Bars

Create one pattern for title, subtitle, primary action, secondary actions, search, filters, and context metrics. Apply it before deep page redesign.

### 5. Replace The Most Visible Toy Elements

Remove or tone down XP toasts, trophy/medal/crown/flame/sparkles icon usage, and leaderboard podium styling. Reframe performance as broker activity, follow-through, coverage, and data quality.

### 6. Upgrade Tables Before Reworking Pages

Build a stronger shared table/data-grid pattern first, then migrate comps, requirements, follow-ups, workspaces, Track Record, and Industrial Intel queues. This gives the biggest "real broker tool" improvement with controlled risk.

### 7. Normalize Map Control Surfaces

Unify map controls, legends, edit panels, context menus, and workspace toolbars into one compact spatial-control language.

### 8. Consolidate Import/Export And Upload Treatments

Create shared import/export/dropzone/mapping/progress/error states and then migrate CSV import, dossier upload, Track Record import, and profile export.

### 9. Clean Encoding Artifacts

Fix mojibake strings during the UI cleanup. This is low risk and has outsized trust impact.

### 10. Defer Deep Page-Specific Polish

Do not start by prettifying each route independently. After tokens, primitives, shell, tables, and forms are in place, page-specific cleanup becomes safer and more consistent.

