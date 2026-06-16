# UI Design System Direction

Level CRE should feel like a serious industrial real estate broker operating system: clean, dense, calm, commercial, and enterprise-grade. The product should prioritize usefulness, speed, and broker confidence before decorative polish.

This design system direction is intended for incremental refactoring of the existing app. It should not require a rewrite, route changes, auth changes, database changes, API contract changes, or business logic changes.

## Product Feel

### Target Impression

- Institutional CRE intelligence platform
- Internal deal desk for brokers and analysts
- Spatial CRM with strong data workflows
- Calm professional tool used repeatedly throughout the day
- Closer to Linear, Retool, ArcGIS, Bloomberg, and internal brokerage systems than a startup demo

### Product Values

- Useful first, beautiful second
- Dense but not cramped
- Quiet but not generic
- Data-first and map-first
- Fast to scan
- Clear status, ownership, and next action
- Commercial, grounded, and durable

### Avoid

- Toy-like trophy, medal, crown, flame, badge, and XP styling
- Bubbly mobile-game surfaces
- Big cute icon bubbles
- Random neon colors
- Crypto dashboard styling
- Glassmorphism
- Excessive shadows
- One-off page hacks
- Startup landing-page patterns inside protected app workflows

## Visual Language

### Surfaces

Use a small set of predictable surfaces:

- App canvas: cool off-white or very light neutral
- Main panels: white or near-white
- Secondary panels: slightly tinted neutral
- Map controls: white, compact, bordered
- Overlays: white panels with modest elevation only when floating above content
- Public/client pages: slightly more spacious, but still restrained

Do not use gradient cards, dark glass panels, or decorative background effects for protected app workflows.

### Borders And Elevation

Use borders as the primary separator.

- Default panel border: subtle neutral
- Strong divider: used for tables, headers, and grouped controls
- Shadow: none by default
- Raised shadow: menus, popovers, modals, drawers, drag/drop previews only

Most cards and panels should feel flat.

### Radius

Use less rounding across the app.

- Small controls: 4px
- Buttons, inputs, rows: 6px
- Panels and cards: 8px
- Modals and drawers: 8px
- Pills: only for true tokens such as short status labels or counts, and even then use restrained sizing

Avoid `rounded-2xl`, `rounded-3xl`, and `rounded-full` as layout defaults.

### Typography

Use restrained type scale:

- Page title: 24px to 28px, medium or semibold
- Page subtitle: 13px to 14px, muted
- Section heading: 14px to 16px, semibold
- Panel heading: 13px to 14px, semibold
- Body/table text: 12px to 14px
- Metadata: 11px to 12px
- Numeric values: tabular figures where possible

Avoid hero-scale type inside protected app pages. Reserve large type for public marketing or client presentation pages.

### Spacing And Density

The protected app should be more compact.

- Page padding: 20px to 24px desktop, 12px to 16px mobile
- Header spacing: compact, with actions aligned right
- Panel padding: 12px to 16px
- Table row height: 36px to 44px depending on density
- Form row spacing: 12px to 16px
- Control height: 32px to 36px default, 40px for primary form actions

Avoid large vertical gaps before the core data or map.

### Color

Use neutral structure with semantic color.

- Neutral: slate/gray family for text, borders, surfaces
- Primary: restrained broker blue, not bright electric blue
- Success: muted green for confirmed/active/complete
- Warning: muted amber for attention/review
- Danger: muted red for destructive/error
- Info: muted blue for system/informational
- Draft/unknown: neutral

Color should communicate state, not decorate routine UI.

### Icons

Use icons as small operational cues.

- Default icon size: 14px to 18px
- Icon buttons: 28px to 32px square
- Page-header icons: avoid unless necessary
- Navigation icons: okay when paired with labels
- Status icons: use sparingly

Avoid large colored icon bubbles and playful achievement icons in the core app.

## Core Components

### App Shell

The shell should feel like one product across Level CRE and Industrial Intel.

- Shared header/nav treatment
- Persistent labels for primary nav
- Compact active states
- Clear product/workspace context
- Profile menu separated from tool switching and settings
- Debug/developer controls hidden or low priority
- Mobile nav generated from the same route model as desktop

### Page Header

Every protected page should use one header pattern:

- Title
- Short operational subtitle
- Primary action
- Secondary actions
- Optional search/filter command bar
- Optional compact context metrics

Avoid marketing headlines, large hero blocks, and inconsistent page labels.

### Command Bar

Use command bars for search, filters, saved views, bulk actions, import/export, and sort controls.

- Compact height
- Bordered surface
- Clear grouping
- No oversized filter pills
- Consistent reset and save-view behavior

### Panels And Cards

Use panels as structural containers and cards only for repeated summary objects.

- Panel: flat, bordered, compact
- Metric tile: compact number + label + optional trend
- Object card: only when visual preview or summary comparison is useful
- Detail panel: structured sections, no decorative icon bubbles

Cards should not be nested inside other cards.

### Buttons

Button hierarchy:

- Primary: one per region, strong but restrained
- Secondary: bordered neutral
- Ghost: low-emphasis toolbar action
- Destructive: reserved for destructive actions
- Icon button: square, tooltip required when icon-only

Defaults:

- Height: 32px to 36px
- Radius: 6px
- Icons: 14px to 16px
- Avoid oversized pill buttons

### Badges And Status

Badges should be semantic, compact, and consistent.

Recommended status families:

- Property status: prospect, contacted, follow-up, active, inactive, closed
- Requirement status: draft, active, matching, paused, fulfilled
- Listing status: new, reviewed, duplicate, published, archived
- Dossier status: incomplete, reviewing, ready, shared
- Confidence: low, medium, high
- Source health: healthy, delayed, failed

Use a shared `StatusBadge` primitive. Avoid page-specific color formulas.

### Tables And Data Grids

Tables should become the default for broker data.

Required table behavior:

- Sticky header where useful
- Compact row density
- Clear column alignment
- Row hover without motion
- Inline row actions
- Bulk selection where useful
- Sortable columns where useful
- Empty row state
- Loading skeleton rows
- Consistent status cells
- Truncated long text with tooltip or detail panel

Priority table migrations:

- Market comps
- Requirements
- Follow-ups
- Workspaces
- Track Record deals
- Industrial Intel listing queue
- Industrial Intel requirements
- Dossiers
- Surveys
- Broker performance activity

### Forms

Forms should feel operational:

- Labels above fields
- Compact help text
- Error text close to fields
- Consistent field height
- Two-column layout only when fields are short and related
- Section dividers for long forms
- Sticky footer actions for long drawers/modals

Avoid oversized conversational forms unless the workflow is truly guided intake.

### Modals, Drawers, And Sheets

Use predictable overlay types:

- Modal: focused confirmation or short task
- Drawer: record detail, edit panel, longer form
- Sheet: secondary panel on mobile
- Popover: quick filter or compact menu

Defaults:

- 8px radius
- White surface
- Subtle border
- Modest shadow
- Header, body, footer structure
- Consistent close button

### Map Controls

Map UI should feel like professional spatial software.

- Compact square icon controls
- White bordered surfaces
- Small labels and legends
- No glassmorphism
- No dark floating panels unless the map requires contrast
- Status legend as a compact panel
- Edit panel aligned with drawer/panel design system
- Developer controls visually separated from broker controls

### Empty States

Empty states should be compact and actionable.

- Small title
- One-sentence explanation
- Primary action when useful
- Optional secondary link
- No large decorative icons by default

### Loading States

Use skeletons over large spinners for data regions.

- Table skeleton rows for tables
- Panel skeletons for details
- Small inline spinner only for button-level work
- Avoid full-page animated loading unless the entire route is blocked

### Toasts

Toasts should confirm operational outcomes.

- Saved
- Imported
- Export ready
- Shared
- Failed with retry

Avoid XP, celebration, streak, or achievement toasts in core workflows.

## Page Templates

### Map Workspace Template

Used by `/app` and workspace detail.

- Full map canvas
- Compact map control stack
- Search and filters as command controls
- Right-side edit/detail panel
- Compact status legend
- Minimal floating actions
- No developer/demo controls in production surfaces

### Data Workbench Template

Used by Industrial Intel inventory, requirements, surveys, dossiers, follow-ups, comps, and requirements.

- Page header
- Command bar
- Optional compact metrics row
- Primary data table or split list/detail layout
- Right-side detail or action drawer
- Import/export actions in consistent positions

### Record Library Template

Used by Track Record, dossiers, workspaces, and surveys.

- Table/list as default
- Detail panel for selected record
- Optional visual/client presentation mode
- Clear filters and bulk actions

### Client Share / Presentation Template

Used by public surveys and Track Record presentation mode.

- More spacious than internal app
- Clean print-friendly layout
- Strong property facts and media
- Minimal decorative effects
- Clear client-safe labeling

### Settings / Admin Template

Used by profile, imports/exports, admin diagnostics, and debug tools.

- Left section nav or stacked settings groups
- Compact forms
- Tables for lists and logs
- Quiet danger zone
- Clear internal-only labeling

## Treatment Of Performance And Scorecard

Performance should feel like broker productivity intelligence, not game mechanics.

Keep:

- Activity totals
- Follow-through metrics
- Conversion or pipeline indicators
- Coverage and data quality
- Team comparison where useful
- Next best actions

Change:

- XP becomes activity points only if absolutely needed, otherwise hide or rename.
- Levels become tiers or productivity bands only if product strategy requires them.
- Badges become milestones or achievements in a low-priority area, not core nav.
- Leaderboards become team performance tables.
- Trophies, medals, crowns, flames, and badge art are removed from primary surfaces.

## Implementation Bias

Make the app speak one visual language before redesigning pages.

Order of operations:

1. Tokens
2. Shared primitives
3. Shell and page layout
4. Tables, forms, badges, modals
5. Page-by-page cleanup
6. Polish and QA

This avoids random page-by-page restyling and keeps the live app safer.

