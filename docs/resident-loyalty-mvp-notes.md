# Resident Loyalty MVP Notes

Date: 2026-06-09

## What Was Built

Built a contained frontend MVP prototype for a multifamily resident loyalty and operations layer. The prototype emphasizes operational efficiency for landlords and property managers, not rent-payment rewards alone.

The MVP includes:

- Manager dashboard for a mock multifamily building.
- Resident-facing demo view.
- Typed mock data for 1 landlord, 1 building, 16 units, 16 residents, resident events, rewards, maintenance requests, notices, and renewal statuses.
- Resident behaviour event ledger.
- Points and rent streak milestone logic.
- Manager simulation actions for rent streaks, notices, access, renewal interest, maintenance review, and reward approval.
- Resident task completion and mock reward requests.

## How To Run Locally

For this frontend-contained prototype, from the repo root:

```powershell
npm.cmd run dev:web
```

Then open:

- `http://localhost:5173/resident-loyalty/resident-demo`
- `http://localhost:5173/resident-loyalty`

The manager route is protected by the existing app auth shell. Demo mode can be used through the existing Level CRE demo flow.

Note for Windows PowerShell: the existing root `npm.cmd run dev` currently invokes the API script with POSIX env syntax (`DOTENV_CONFIG_PATH=...`), which fails in this shell. A Windows-safe manual API start is:

```powershell
cd apps/api
$env:NODE_ENV = 'development'
$env:DOTENV_CONFIG_PATH = '../../.env'
..\..\node_modules\.bin\tsx.cmd -r dotenv/config src/index.ts
```

## Routes Added

- `/resident-loyalty`
  - Manager dashboard.
  - Protected by the existing `ProtectedRoute`, `OnboardingCheck`, and `AppLayout`.

- `/resident-loyalty/resident-demo`
  - Resident-facing demo route.
  - Public because it only uses local mock data.

## Components And Files Added

- `apps/web/src/features/resident-loyalty/ResidentLoyaltyManagerPage.tsx`
- `apps/web/src/features/resident-loyalty/ResidentLoyaltyResidentDemoPage.tsx`
- `apps/web/src/features/resident-loyalty/residentLoyaltyDemoData.ts`
- `apps/web/src/features/resident-loyalty/residentLoyaltyLogic.ts`
- `apps/web/src/features/resident-loyalty/types.ts`
- `apps/web/src/pages/resident-loyalty.tsx`
- `apps/web/src/pages/resident-loyalty-resident-demo.tsx`
- `docs/resident-loyalty-architecture-audit.md`
- `docs/resident-loyalty-mvp-notes.md`

Existing file updated:

- `apps/web/src/App.tsx`

## API Routes Added

None.

This pass is frontend-contained. It intentionally avoids adding backend coupling before product feedback.

## Data Model And Schema Changes

No database schema changes were made.

The mock model is typed in `types.ts` and currently includes:

- `Landlord`
- `ResidentBuilding`
- `ResidentUnit`
- `Resident`
- `ResidentEvent`
- `ResidentTask`
- `RewardOption`
- `RewardRedemption`
- `MaintenanceRequest`
- `BuildingNotice`
- `RenewalStatus`

Suggested future persistent tables are documented in `docs/resident-loyalty-architecture-audit.md`.

## Points System

Implemented point rules:

- Notice acknowledged: 25 points
- Access confirmed: 150 points
- Maintenance request submitted: 25 points
- Maintenance request submitted with photos: 100 points
- Move-in checklist completed: 250 points
- Renewal interest submitted: 500 points
- Renewal signed early: 500 points
- On-time rent streak continued: 100 points
- Rent paid on time: tracked as an event, 0 direct points
- Reward redeemed: tracked as an event, 0 direct points

Rent streak milestones:

- 3 months: `$10` reward equivalent
- 6 months: `$25` reward equivalent
- 12 months: `$100` reward equivalent

The manager dashboard also calculates:

- Building Health Score
- Maintenance photo rate
- Notice acknowledgement rate
- Access confirmations
- Renewal visibility
- Rewards pending and issued
- Estimated manager follow-ups avoided

## What Is Mocked Vs Real

Mocked:

- All resident, building, unit, maintenance, notice, renewal, reward, and event data.
- Manager actions and resident task completion.
- Reward approval and redemption requests.
- Building Health Score.
- Follow-ups avoided estimate.

Real/reused:

- React/Vite route integration.
- Existing app auth shell for manager route.
- Existing Shadcn/Radix UI components.
- Existing Lucide icon style.
- Existing route lazy-loading pattern.
- Existing build and test infrastructure.

Not built:

- Payments.
- Gift card fulfillment.
- Banking/PAD setup.
- PMS integrations.
- Credit reporting.
- Public resident leaderboards.
- Punitive tenant scoring.
- Persistent resident database tables.

## Quality Checks Run

Passed:

```powershell
npm.cmd --workspace @apps/web run test
npm.cmd --workspace @apps/api run test
npm.cmd --workspace @apps/api run check
npm.cmd run build:web
npm.cmd run build:api
```

Note: `npm.cmd run build:api` required running outside the sandbox because the sandboxed esbuild process hit an access-denied directory scan before reaching app code.

## What Still Needs To Be Built

- Product validation for landlord workflows and resident messaging.
- Real backend module and schema after feedback.
- RLS policies and privacy review for resident data.
- Manager invite/member model for properties.
- Auth model for residents.
- Notice acknowledgement exports.
- Maintenance photo upload flow.
- Reward approval audit trail.
- Admin diagnostics for resident loyalty.
- Tests for points and health-score logic if the module moves beyond prototype.

## Recommendations For Next Steps After Feedback Lunch

- Validate whether managers care more about notice acknowledgements, maintenance photos, access confirmations, or renewal visibility.
- Confirm whether "Building Health Score" is useful or should be broken into separate operational metrics.
- Decide whether rewards should be points-based, streak-based, manager-approved, or a mix.
- Keep rewards low-friction and mockable until there is a clear fulfillment partner.
- Design privacy and resident consent before any real tenant data is stored.
- Build persistent tables only after the demo confirms the core operating loop.
