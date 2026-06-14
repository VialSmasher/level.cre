# Resident Loyalty Architecture Audit

Date: 2026-06-09

## Summary

Level CRE has enough reusable architecture to support a contained multifamily resident loyalty MVP without rewriting the app. The strongest reusable pieces are the protected app shell, Supabase/demo auth flow, React Query API client conventions, Shadcn/Radix UI components, dashboard/stat card patterns, JSON-backed demo mode, Drizzle schema style, workspace/member authorization concepts, contact interaction ledger, skill activity XP ledger, follow-up queue UI, and admin diagnostics.

The first MVP should be a mock/demo module behind `/resident-loyalty` and `/resident-loyalty/resident-demo`. It should avoid schema migrations at first unless feedback confirms the concept. A typed frontend demo data module plus optionally read-only mock API routes is enough for the first lunch demo. This keeps existing Level CRE functionality intact and avoids introducing payments, banking, public tenant leaderboards, punitive tenant scoring, or PMS integration complexity.

## Existing Architecture That Can Be Reused

### 1. Auth, User, And Session Handling

- Frontend auth is centralized in `apps/web/src/contexts/AuthContext.tsx`.
- Protected app routes use `ProtectedRoute` and the shared `AppLayout`.
- Demo mode already exists through localStorage `demo-mode`, `/api/auth/demo/user`, and `x-demo-mode: true` request handling.
- Backend route protection uses `requireAuth`, `verifySupabaseToken`, and `getUserId` in `apps/api/src/auth.ts`.

Resident loyalty reuse:

- Reuse the same protected route wrapper for the manager dashboard.
- For the resident demo route, either keep it protected for MVP simplicity or explicitly make it public/demo-only later.
- Reuse demo mode assumptions for a no-database prototype.

### 2. Database Schema And Drizzle Patterns

- Shared schema lives in `packages/shared/src/schema.ts` and is mirrored by root `shared/schema.ts`.
- Drizzle tables use `pgTable`, `varchar` IDs with `gen_random_uuid()`, `timestamp().defaultNow()`, `jsonb` metadata, indexes, and inferred row types.
- Existing tables already model users, profiles, workspaces/listings, workspace members, workspace-prospect links, contact interactions, broker skills, skill activities, email sync, industrial intel ingest runs, surveys, survey events, and assets.
- `drizzle.config.ts` points at `packages/shared/src/schema.ts`; `npm run db:prepare` runs `pgcrypto` setup plus Drizzle push.

Resident loyalty reuse:

- If this grows beyond mock mode, follow the same schema style for `resident_properties`, `resident_buildings`, `resident_units`, `residents`, `resident_events`, `resident_rewards`, `maintenance_requests`, `building_notices`, and `renewal_statuses`.
- Use `jsonb("metadata").$type<Record<string, unknown>>()` for event payloads, photo counts, notice IDs, checklist details, and reward details.
- Use indexes on manager/landlord user ID, building ID, resident ID, event type, and created_at.

### 3. Event And Activity Ledger Patterns

- `contact_interactions` is an operational activity ledger tied to `user_id`, `prospect_id`, optional `listing_id`, activity type, outcome, notes, next follow-up, and created timestamp.
- `skill_activities` is an XP ledger tied to `user_id`, `skill_type`, `action`, `xp_gained`, `related_id`, `multiplier`, and timestamp.
- Industrial Intel has `intel_survey_events`, a more generic event table with actor type, actor ID, action, summary, payload, and created timestamp.

Resident loyalty reuse:

- Adapt the generic shape of `intel_survey_events` and `skill_activities` into a resident behaviour event ledger.
- Use a positive event vocabulary such as `notice_acknowledged`, `access_confirmed`, `maintenance_request_submitted_with_photos`, and `rent_streak_continued`.
- Do not reuse broker event names directly because they imply sales behaviour, not resident operations.

### 4. XP, Points, Streak, And Skills Logic

- XP constants and action mapping live in `apps/api/src/lib/gamification.ts`.
- Skill XP is awarded in storage methods after user actions.
- `broker_skills` stores cumulative XP tracks plus `last_activity` and `streak_days`.
- `apps/web/src/pages/stats.tsx` contains level/progress calculations and stat card UI patterns.
- `GamificationToast` and `gamificationUi` support lightweight feedback after actions.

Resident loyalty reuse:

- Reuse the idea of append-only point events and derived totals.
- Reuse progress bars, milestone cards, and positive feedback UX.
- Adapt streak logic to rent streaks, but keep it transparent and non-punitive. The UI should show "current streak" and "next milestone", not a resident risk score.

### 5. Follow-Up, Task, And Nudge Architecture

- `apps/web/src/pages/followup.tsx` is a strong operational queue pattern.
- It groups items by due state, supports filters, quick action buttons, snoozing, and drawer-based detail views.
- Backend interactions support `nextFollowUp`, which maps well to manager follow-ups avoided or still required.

Resident loyalty reuse:

- Adapt the follow-up queue UI to "manager actions" and "resident tasks".
- Reuse quick-action affordances for acknowledging notices, confirming access, reviewing maintenance, and marking renewal interest received.
- Avoid copying sales-specific language such as prospects, calls, or stale leads.

### 6. Dashboard And Stat Card Components

- `stats.tsx`, `admin-diag.tsx`, `workspaces.tsx`, and `followup.tsx` use reusable Shadcn `Card`, `Badge`, `Button`, `Tabs`, `Progress`, `Sheet`, `Table`, and icon patterns.
- The stat cards in `stats.tsx` already show a compact operational dashboard style with metric label, value, secondary text, and icon.

Resident loyalty reuse:

- Reuse the same cards and grid layout for Building Health Score, units, resident count, notice acknowledgement rate, maintenance photo rate, access confirmations, reward liability, and estimated follow-ups avoided.
- Keep the dashboard utilitarian and manager-focused.

### 7. Admin And Diagnostic Tooling

- `/admin/diag` is gated by env flag and reads `/api/diag/summary`.
- It checks route/API availability, database tables, event types, indexes, and sample counts.
- Backend diagnostic routes are read-only and guarded for development or env-enabled use.

Resident loyalty reuse:

- Later, add resident-loyalty diagnostics for event counts, reward pending counts, notice acknowledgement rates, and mock-vs-real data status.
- Do not include this in the smallest MVP unless it is effectively free.

### 8. Demo Mode And Seed Data

- `apps/api/src/demoStore.ts` persists demo data to `apps/api/src/demo-data.json`.
- It includes prospects, profiles, interactions, requirements, submarkets, market comps, listings, listing links, and listing members.
- Demo mode works without a real database in development.

Resident loyalty reuse:

- For the first prototype, use a typed frontend mock data module for speed and isolation.
- If server simulation becomes useful, extend demoStore with a separate resident loyalty namespace rather than mixing resident records into prospects/listings.
- Keep all mock data clearly labelled as demo data.

### 9. Map And Workspace Patterns

- `/app` and `/app/workspaces/:id` combine a map, a scoped asset set, a right-hand edit panel, saved filters, and workspace membership.
- `listings` are now effectively workspaces with members and linked prospects.
- Industrial Intel has inventory, requirements, surveys, public share pages, and listing assets.

Resident loyalty reuse:

- The workspace concept can translate to a property/building workspace with units instead of prospects.
- The map itself is not required for the first MVP. Multifamily operations are better demoed as building/unit tables and status cards first.
- Later, reuse workspace membership and share concepts for landlord teams and property managers.

### 10. API Route Structure

- Main routes are centralized in `apps/api/src/routes.ts`.
- Industrial Intel routes are separated into `apps/api/src/modules/industrial-intel/registerRoutes.ts`, which is a better pattern for a new contained module.
- API requests use REST endpoints, `requireAuth`, demo branching, and React Query invalidation.

Resident loyalty reuse:

- Prefer a separated module if API routes are added: `apps/api/src/modules/resident-loyalty/registerRoutes.ts`.
- For the first UI-only prototype, API routes can be skipped to avoid backend coupling.
- If mock actions need persistence, use local React state first, then mock API later.

### 11. Shared UI Components

- Reusable components exist under `apps/web/src/components/ui`.
- Icons are consistently Lucide.
- App shell, route error boundary, modal, sheet, card, badge, button, tabs, select, tooltip, progress, and table components are already available.

Resident loyalty reuse:

- Reuse the UI kit directly.
- Build resident loyalty as its own page/component module, not as changes inside existing prospect pages.
- Use icons for manager actions and compact controls.

### 12. Data Import And Export Patterns

- CSV import exists through `CSVUploader` and Papa Parse.
- Account export has been added in current local changes through `/api/account/export`.
- Listing/workspace CSV export exists for interactions.
- Track record supports CSV/Excel import patterns.

Resident loyalty reuse:

- Later, adapt import/export for property/unit/resident seed data and notice acknowledgement logs.
- Do not include PMS imports in the first MVP.
- Do not export private resident details in a demo beyond mock data.

### 13. Tests, Scripts, Migrations, And Deploy Assumptions

- Web tests use Node's test runner with TSX for focused tests.
- API tests currently cover `toolAReview`.
- API typecheck exists as `npm --workspace @apps/api run check`.
- Builds are `npm run build:web`, `npm run build:api`, or root `npm run build`.
- Deploy assumes a managed Postgres `DATABASE_URL`, Supabase public env vars, `pgcrypto`, and SSL.
- Existing migrations are under `drizzle/`; database push is used for schema sync.

Resident loyalty reuse:

- Add unit tests only for extracted points/reward logic if implemented as a library.
- Avoid a migration in the first pass.
- Run web build and API check/build after changes.

## Reuse Directly

- `ProtectedRoute`, `OnboardingCheck`, and `AppLayout` for manager-facing route placement.
- React Query `apiRequest` conventions if backend routes are added.
- Shadcn/Radix UI components and Lucide icon patterns.
- Dashboard card layout from `stats.tsx`.
- Follow-up queue interaction patterns from `followup.tsx`.
- Demo-mode mental model and "mock data first" strategy.
- Drizzle schema conventions for any future persistent tables.
- Admin diagnostic style for future read-only health checks.

## Adapt

- `skill_activities` pattern into `resident_events`.
- `broker_skills` cumulative XP into resident point balances and rent streak milestone state.
- `contact_interactions.nextFollowUp` into manager follow-up avoidance and remaining manager action queues.
- `listings/listing_members` into landlord/property/building membership when persistence is needed.
- `intel_survey_events.payload` into resident event `metadata`.
- CSV export helpers into resident notice and event exports later.

## Do Not Reuse

- Public broker leaderboard patterns for residents. Public tenant leaderboards are explicitly out of scope.
- Broker-specific skill taxonomy: prospecting, follow-up, consistency, market knowledge.
- Sales pipeline language such as prospect, lead, stale, no-go, or client.
- Google Maps and TerraDraw for the smallest MVP. A unit/building operations table is enough.
- Email/OAuth sync, industrial ingest, public listing link resolver, BCC intake, or heavy import pipelines.
- Any payments, banking, credit reporting, card reward, or PMS integration code.
- Any scoring model that could be interpreted as punitive tenant scoring.

## Technical Risks

- Existing `shared/schema.ts` and `packages/shared/src/schema.ts` appear duplicated. New schema work must update the canonical package schema and avoid divergence.
- Current local worktree already has unrelated changes in `apps/api/src/routes.ts`, `apps/api/src/modules/industrial-intel/publicLinkResolver.ts`, `apps/web/src/pages/profile.tsx`, and `db/rls_core_private_data.sql`; the resident MVP should avoid touching those unless necessary.
- Demo data writes to `apps/api/src/demo-data.json`; extending it for another domain can create merge noise.
- Root dev script runs both web and API. The API may try to connect to a fallback demo Postgres URL when no `DATABASE_URL` exists; demo-only frontend routes should not depend on API availability.
- Adding real resident tables introduces privacy and RLS risk. Resident data is more sensitive than broker prospects and should be designed deliberately.
- Naming needs care: "loyalty" should not drift into "tenant score". Use points, rewards, acknowledgements, tasks, and milestones.

## Recommended MVP Architecture

Build a frontend-contained prototype first:

- Route: `/resident-loyalty`
- Route: `/resident-loyalty/resident-demo`
- Module: `apps/web/src/features/resident-loyalty/`
- Page wrappers: `apps/web/src/pages/resident-loyalty.tsx` and `apps/web/src/pages/resident-loyalty-resident-demo.tsx`
- Data: typed mock data in `residentLoyaltyDemoData.ts`
- Logic: pure helper functions for points, milestones, reward status, building health score, and follow-ups avoided.
- State: page-local React state for manager simulation actions.
- Persistence: none for first pass.
- Backend: none for first pass unless a simple mock endpoint becomes necessary.
- Database: no migration for first pass.

Recommended conceptual data model:

- `ResidentProperty`: landlord, buildings.
- `ResidentBuilding`: property, address, unit count, health metrics.
- `ResidentUnit`: building, unit number, occupancy status.
- `Resident`: unit, display name, opt-in status, points balance, rent streak months.
- `ResidentEvent`: resident_id, building_id, unit_id, event_type, points_awarded, metadata, created_at.
- `ResidentTask`: resident, task type, status, due date, points.
- `ResidentReward`: reward type, point cost or milestone, status, value label.
- `MaintenanceRequest`: resident, unit, photo count, status, manager reviewed.
- `BuildingNotice`: title, status, acknowledgement counts.
- `RenewalStatus`: resident, unit, interest status, target date.

## Recommended Smallest Demo Scope

Use one mock building:

- 1 landlord/property manager.
- 1 building with 16 units.
- 16 residents.
- 30 to 50 events.
- 5 resident tasks.
- 6 to 8 rewards.
- 4 maintenance requests with mixed photo status.
- 2 notices with acknowledgement state.
- Renewal statuses for a few residents.

Manager dashboard should answer:

- Is the building healthy?
- How many residents have completed useful operational actions?
- How much manager chasing was avoided?
- Which notices, access confirmations, maintenance reviews, and renewals need attention?
- Which rewards are pending approval?

Resident demo should answer:

- What can I do next?
- How many points do I have?
- What streak or milestone am I working toward?
- What rewards are available?
- What actions earned points and why?

## Branch And Build Plan

1. Complete this audit document.
2. Create `feature/resident-loyalty-mvp`; if it exists, create a timestamped variation.
3. Add the contained frontend module and routes.
4. Keep the manager route inside the protected app shell so existing app navigation/auth remains intact.
5. Keep resident demo simple and clearly labelled as demo data.
6. Add `docs/resident-loyalty-mvp-notes.md`.
7. Run relevant checks:
   - `npm --workspace @apps/web run test`
   - `npm --workspace @apps/api run test`
   - `npm --workspace @apps/api run check`
   - `npm run build:web`
   - `npm run build:api`
8. Fix only errors caused by this resident loyalty work.

