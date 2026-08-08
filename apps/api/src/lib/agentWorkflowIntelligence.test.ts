import assert from "node:assert/strict";
import test from "node:test";
import { rankRequirementListings, resolveMarketEntities } from "@level-cre/shared";
import { ActivityEventInputSchema } from "./activityEventService";
import { OpportunityPromotionProposalInputSchema } from "./opportunityProposalService";

test("requirement matching returns explainable strong, possible, and stretch tiers", () => {
  const requirement = {
    dealType: "lease",
    market: "Edmonton",
    submarket: "Acheson",
    minSf: 40_000,
    maxSf: 60_000,
    minClearHeightFt: 28,
    maxBudgetPsf: 14,
  };
  const matches = rankRequirementListings(requirement, [
    {
      id: "strong",
      title: "Acheson distribution building",
      address: "100 Logistics Way, Acheson",
      market: "Edmonton",
      submarket: "Acheson",
      listingType: "lease",
      assetType: "industrial",
      availableSf: 50_000,
      clearHeightFt: 30,
      leaseRatePsf: 13,
      latitude: 53.55,
      longitude: -113.75,
      sourceUrl: "https://example.com/strong",
    },
    {
      id: "possible",
      title: "West Edmonton warehouse",
      address: "200 West Road, Edmonton",
      market: "Edmonton",
      submarket: "West Edmonton",
      listingType: "lease",
      assetType: "industrial",
      availableSf: 68_000,
      latitude: 53.54,
      longitude: -113.65,
    },
    {
      id: "stretch",
      title: "Calgary sale building",
      address: "300 South Road, Calgary",
      market: "Calgary",
      listingType: "sale",
      assetType: "industrial",
      availableSf: 100_000,
    },
  ]);
  assert.equal(matches[0].listing.id, "strong");
  assert.equal(matches[0].tier, "strong");
  assert.ok(matches[0].reasons.length > 2);
  assert.ok(new Set(matches.map((match) => match.tier)).has("stretch"));
});

test("entity resolver favors stable place identity over a similar business name", () => {
  const result = resolveMarketEntities({
    placeId: "place-123",
    address: "17527 107 Avenue NW, Edmonton, AB",
    businessName: "Nucor Grating",
    latitude: 53.553,
    longitude: -113.621,
  }, [
    {
      entityType: "prospect",
      id: "exact",
      label: "Nucor Grating Sales Office",
      address: "17527 107 Ave NW",
      placeId: "place-123",
      latitude: 53.553,
      longitude: -113.621,
    },
    {
      entityType: "prospect",
      id: "name-only",
      label: "Nucor Grating",
      address: "999 Other Street",
    },
  ]);
  assert.equal(result.decision, "link_existing");
  assert.equal(result.topCandidate?.id, "exact");
  assert.ok(result.topCandidate?.signals.includes("Exact Google Place ID"));
});

test("opportunity proposals only use the dedicated review event type", () => {
  const proposal = OpportunityPromotionProposalInputSchema.parse({
    sourceEventId: "confirmed-event",
    type: "listing_pursuit",
    reason: "Owner replied and asked for a valuation meeting.",
    confidence: 90,
  });
  assert.equal(proposal.type, "listing_pursuit");
  assert.equal(ActivityEventInputSchema.safeParse({
    externalEventId: "proposal-1",
    eventType: "opportunity_promotion_proposed",
    occurredAt: new Date(),
  }).success, true);
});
