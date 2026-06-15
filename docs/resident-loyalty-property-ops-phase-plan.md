# Resident Loyalty Property Operations Phase Plan

Date: 2026-06-15

## Product Thesis

Living Rewards should become a lightweight property operations portal that residents actually want to use. The rewards layer is not the whole product. It is the engagement loop that gets residents to complete useful operational actions without the property manager chasing them.

The strongest wedge is:

- better move-in readiness;
- cleaner lease, deposit, inspection, and first-rent status;
- better maintenance requests with photos and access details;
- reliable notice acknowledgements;
- earlier renewal visibility;
- resident communication and community moments;
- rewards that feel like real tenant value.

This should not be positioned as a full PMS replacement yet. It should sit beside a landlord's current PMS and improve the resident-facing workflows those systems often handle poorly.

## Phase 1: Client-Demo Operating Portal

Goal: make the current MVP feel like a credible landlord product, not a Level CRE reskin.

Build:

- Manager cockpit for units, residents, onboarding, maintenance quality, notices, renewals, and reward budget.
- Resident wallet with points, rent streaks, missions, reward redemption, and community feed.
- Tenant onboarding flow for invite, lease packet acknowledgement, deposit confirmation, move-in inspection, first rent status, and building notice acknowledgement.
- Demo-ready reward catalog focused on rent, grocery, internet, transit, coffee, dining, home essentials, and community drops.
- Clear public landing page explaining the operational value proposition.

Keep mocked or lightweight:

- no rent payment processing;
- no banking, card rails, or credit reporting;
- no PMS integrations;
- no legal e-signing replacement;
- no punitive tenant score;
- no public resident leaderboard.

## Phase 2: Landlord Pilot Workflow

Goal: make it usable for one small landlord pilot without pretending to be enterprise software.

Build:

- property, building, unit, and resident CRUD;
- resident invite links by property or unit;
- manager-configured task templates;
- manager-created notices with acknowledgement records;
- maintenance request intake with photo upload;
- access confirmation workflow;
- renewal interest workflow;
- reward approval queue;
- activity ledger and audit trail;
- CSV import for units and residents.

Data:

- Supabase Postgres for records;
- Supabase Storage for maintenance and inspection photos;
- role-based access for landlord admin, property manager, and resident.

## Phase 3: Community And Retention Layer

Goal: make the product more than chores and compliance.

Build:

- building announcements and resident polls;
- move-out marketplace or resident swap board;
- community challenge goals, such as "90% notice acknowledgement by Friday unlocks a building-wide grocery wallet draw";
- curated local offers only where they are materially valuable;
- resident feedback pulse after maintenance, move-in, and renewal moments;
- retention dashboard showing renewal risk signals without turning residents into a punitive score.

Better reward ideas:

- internet bill credits;
- grocery wallet credits;
- local coffee credits in larger bundles;
- rent credits;
- transit or rideshare credits;
- home essentials credits;
- moving supply credits;
- renter insurance contribution where legally and operationally feasible;
- building-wide draws funded from avoided manager time or renewal-save budget.

## Phase 4: PMS-Adjacent Integrations

Goal: reduce duplicate entry after the workflow proves value.

Add integrations only when a pilot needs them:

- unit and resident import from PMS exports;
- one-way status sync first;
- webhook-based event import later;
- maintenance export or email forwarding into existing work-order systems;
- accounting-safe rent status flags, not payment processing.

Avoid early:

- replacing accounting;
- accepting rent;
- security deposit custody;
- credit reporting;
- lease legal workflows;
- full maintenance dispatch engine.

## Sales Narrative For Edmonton Landlords

Pitch this as a practical operations layer:

"We help multifamily landlords reduce property manager chasing and improve building operations by rewarding residents for useful behaviors: better maintenance requests, confirmed access, acknowledged notices, early renewal visibility, move-in readiness, and consistent rent habits."

Likely buyer pain points:

- managers chasing residents for access;
- weak photo/context quality on maintenance requests;
- notice acknowledgement gaps;
- move-in paperwork and inspection friction;
- unclear renewal intent;
- resident communication spread across email, phone, signs, and portals;
- resident portals that feel mandatory rather than useful.

## Next Build Priorities

1. Strengthen the manager cockpit into a real operating dashboard.
2. Make resident onboarding the primary workflow, from invite to move-in complete.
3. Replace weak perks with meaningful credits and community goals.
4. Add property-branded public invite links.
5. Add photo upload for move-in inspection and maintenance demo flows.
6. Add simple manager-created notices.
7. Add reward budget controls and approval queue.
8. Add CSV import for units and residents.

## Lunch Feedback Questions

- Which workflow would save your managers the most time: access, notices, maintenance photos, move-in, or renewals?
- Would you pay for this as an operations portal, a resident engagement portal, or both?
- Which rewards would tenants actually care about in your buildings?
- Would building-wide community goals feel useful or gimmicky?
- What data would need to sync from the PMS before a pilot is realistic?
- Who owns this day to day: leasing, property management, resident experience, or head office?
