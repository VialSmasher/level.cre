# Resident Loyalty Bilt-Inspired Research Notes

Date: 2026-06-14

## Sources Reviewed

- Bilt app page: https://www.biltrewards.com/app
- Bilt Alliance page: https://alliance.biltrewards.com/
- Bilt Rewards Alliance support article: https://support.biltrewards.com/hc/en-us/articles/10173971993997-What-is-the-Bilt-Rewards-Alliance
- Bilt Google Play listing: https://play.google.com/store/apps/details?hl=en_US&id=com.biltrewards.bilt
- Entrata resident rewards article: https://www.entrata.com/blog/why-resident-rewards-are-becoming-multifamilys-new-loyalty-engine

## Product Pattern

Bilt is not primarily an operator dashboard. The resident-facing pattern is a rewards app centered on:

- rent as the anchor behavior;
- a points wallet;
- first-of-month reward moments;
- neighborhood benefits;
- flexible redemption across rent, travel, everyday value, and local partners;
- a partner/property layer behind the resident experience.

The Bilt Alliance positioning is also important: it frames the property as the center of resident engagement, with neighborhood benefits and renewal incentives layered around the home.

## Implications For This MVP

The previous resident loyalty prototype looked too much like Level CRE because it led with property-manager operations. That misses the Bilt-like lesson. The MVP should lead with:

- a resident wallet experience;
- visible points and rent streak progress;
- earn missions for operationally useful behaviors;
- a local benefits surface;
- a monthly rewards drop;
- a redemption marketplace.

The manager/operator console should remain, but it should be a secondary proof layer showing:

- notice acknowledgement rate;
- maintenance photo rate;
- access confirmations;
- renewal visibility;
- reward approvals;
- estimated follow-ups avoided.

## What Not To Copy

This MVP should not copy Bilt branding, trademarked program names, card products, payments, credit reporting, travel transfer economics, or real reward fulfillment. Those require deeper legal, financial, and partner work.

For now, the prototype should use mock rewards and generic language like "monthly drop", "resident wallet", "neighborhood benefits", and "partner console".

## Changes Recommended

- Reframe `/resident-loyalty` as the product demo and partner overview, not a manager table dashboard.
- Reframe `/resident-loyalty/resident-demo` as the resident wallet app.
- Rebrand the root landing page so the hosted MVP no longer opens on Level CRE broker messaging.
- Expand rewards beyond generic gift cards to include dining, fitness, home, travel-style mock transfers, rent credits, and building perks.
- Keep all data mocked until the product loop is validated.
