export type RequirementForMatching = {
  id?: string;
  title?: string;
  dealType: string;
  market?: string | null;
  submarket?: string | null;
  minSf?: number | null;
  maxSf?: number | null;
  minClearHeightFt?: number | null;
  maxBudgetPsf?: number | null;
  requiredDockDoors?: number | null;
  requiredGradeDoors?: number | null;
  minYardAcres?: number | null;
  powerNotes?: string | null;
  specialNotes?: string | null;
  isOffMarketSearchEnabled?: boolean;
};

export type ListingForRequirementMatching = {
  id: string;
  sourceName?: string | null;
  title: string;
  address?: string | null;
  market?: string | null;
  submarket?: string | null;
  status?: string | null;
  listingType: string;
  assetType: string;
  availableSf?: number | null;
  landAcres?: number | null;
  totalPrice?: number | null;
  pricePerAcre?: number | null;
  leaseRatePsf?: number | null;
  clearHeightFt?: number | null;
  brochureUrl?: string | null;
  sourceUrl?: string | null;
  removedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dataQualityStatus?: string | null;
};

export type RequirementMatchTier = "strong" | "possible" | "stretch";

export type RequirementMatch<TListing extends ListingForRequirementMatching = ListingForRequirementMatching> = {
  listing: TListing;
  score: number;
  tier: RequirementMatchTier;
  reasons: string[];
  warnings: string[];
};

const KNOWN_AREAS = [
  "acheson",
  "nisku",
  "leduc",
  "sherwood park",
  "southeast edmonton",
  "south edmonton",
  "northwest edmonton",
  "west edmonton",
  "fort saskatchewan",
  "st albert",
  "edmonton",
  "calgary",
] as const;

function normalizeMatchText(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getRequirementAreaTokens(requirement: RequirementForMatching) {
  const areaText = normalizeMatchText([
    requirement.submarket,
    requirement.market,
    requirement.specialNotes,
  ].filter(Boolean).join(" "));
  const detected = KNOWN_AREAS.filter((area) => areaText.includes(area));
  if (requirement.submarket) detected.push(normalizeMatchText(requirement.submarket) as typeof KNOWN_AREAS[number]);
  if (requirement.market) detected.push(normalizeMatchText(requirement.market) as typeof KNOWN_AREAS[number]);
  return uniqueValues([...detected]);
}

function listingMatchesArea(listing: ListingForRequirementMatching, areaTokens: string[]) {
  if (areaTokens.length === 0) return false;
  const listingArea = normalizeMatchText([
    listing.submarket,
    listing.market,
    listing.address,
    listing.title,
  ].filter(Boolean).join(" "));
  if (!listingArea) return false;
  return areaTokens.some((area) => listingArea.includes(area) || area.includes(listingArea));
}

function formatPsf(value: number) {
  return `$${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })} / SF`;
}

export function scoreRequirementListing<TListing extends ListingForRequirementMatching>(
  requirement: RequirementForMatching,
  listing: TListing,
): RequirementMatch<TListing> {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const dealType = normalizeMatchText(requirement.dealType);
  const listingType = normalizeMatchText(listing.listingType);
  const areaTokens = getRequirementAreaTokens(requirement);
  const listingText = normalizeMatchText([
    listing.title,
    listing.address,
    listing.submarket,
    listing.market,
    listing.sourceName,
  ].filter(Boolean).join(" "));

  if (dealType === "either" || dealType === listingType || (dealType === "lease" && listingType === "sublease")) {
    score += 22;
    reasons.push(`${listing.listingType} aligns with the requirement`);
  } else {
    warnings.push(`Deal type mismatch: requirement is ${requirement.dealType}, listing is ${listing.listingType}`);
  }

  if (listingMatchesArea(listing, areaTokens)) {
    score += 24;
    reasons.push(`Area matches ${listing.submarket || listing.market || "the target geography"}`);
  } else if (requirement.submarket || requirement.specialNotes) {
    score += 6;
    warnings.push("Target geography needs broker review");
  } else {
    score += 8;
    warnings.push("Requirement area is not structured yet");
  }

  if (listing.availableSf && (requirement.minSf || requirement.maxSf)) {
    const minSf = requirement.minSf || 0;
    const maxSf = requirement.maxSf || Number.POSITIVE_INFINITY;
    if (listing.availableSf >= minSf && listing.availableSf <= maxSf) {
      score += 30;
      reasons.push(`Size fits at ${listing.availableSf.toLocaleString("en-CA")} SF`);
    } else {
      const lowBound = minSf ? minSf * 0.75 : 0;
      const highBound = Number.isFinite(maxSf) ? maxSf * 1.25 : Number.POSITIVE_INFINITY;
      if (listing.availableSf >= lowBound && listing.availableSf <= highBound) {
        score += 15;
        reasons.push(`Size is adjacent at ${listing.availableSf.toLocaleString("en-CA")} SF`);
      } else {
        warnings.push(`Size is outside target at ${listing.availableSf.toLocaleString("en-CA")} SF`);
      }
    }
  } else if (listing.assetType === "land" && requirement.minYardAcres && listing.landAcres) {
    if (listing.landAcres >= requirement.minYardAcres) {
      score += 20;
      reasons.push(`Land size supports yard need at ${listing.landAcres.toLocaleString("en-CA")} ac`);
    }
  } else {
    score += 4;
    warnings.push("Size data is missing or incomplete");
  }

  if (requirement.maxBudgetPsf) {
    if (listing.leaseRatePsf && listing.leaseRatePsf <= requirement.maxBudgetPsf) {
      score += 8;
      reasons.push(`Lease rate is within budget at ${formatPsf(listing.leaseRatePsf)}`);
    } else if (listing.leaseRatePsf) {
      warnings.push(`Lease rate exceeds budget at ${formatPsf(listing.leaseRatePsf)}`);
    } else if (dealType !== "sale") {
      warnings.push("Lease rate is missing");
    }
  }

  if (requirement.minClearHeightFt) {
    if (listing.clearHeightFt && listing.clearHeightFt >= requirement.minClearHeightFt) {
      score += 8;
      reasons.push(`Clear height meets target at ${listing.clearHeightFt}'`);
    } else if (listing.clearHeightFt) {
      warnings.push(`Clear height is below target at ${listing.clearHeightFt}'`);
    } else {
      warnings.push("Clear height needs verification");
    }
  }

  if (requirement.minYardAcres && listing.assetType !== "land") {
    if (listing.landAcres && listing.landAcres >= requirement.minYardAcres) {
      score += 7;
      reasons.push(`Yard/land area supports ${requirement.minYardAcres} ac need`);
    } else {
      warnings.push("Yard requirement needs verification");
    }
  }

  if (requirement.requiredDockDoors || requirement.requiredGradeDoors) {
    const loadingLanguage = ["dock", "loading", "grade", "drive in", "drive-in"].some((term) => listingText.includes(term));
    if (loadingLanguage) {
      score += 5;
      reasons.push("Listing language references loading access");
    } else {
      warnings.push("Door count/loading needs verification");
    }
  }

  if (requirement.powerNotes) {
    if (listingText.includes("power") || listingText.includes("manufacturing") || listingText.includes("shop")) {
      score += 8;
      reasons.push("Listing language may support power/manufacturing use");
    } else {
      warnings.push("Power requirement cannot be verified from listing data");
    }
  }

  if (listing.latitude && listing.longitude) {
    score += 5;
    reasons.push("Mappable for client survey");
  } else {
    warnings.push("Needs coordinates before map-ready survey");
  }

  if (listing.brochureUrl || listing.sourceUrl) {
    score += 4;
    reasons.push("Source link available");
  } else {
    warnings.push("No brochure/source link attached");
  }

  if (listing.dataQualityStatus === "review") {
    score -= 8;
    warnings.push("Listing is flagged for data review");
  }

  if (requirement.isOffMarketSearchEnabled && score < 45) {
    score += 4;
    warnings.push("May be useful as off-market comp context");
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    listing,
    score: boundedScore,
    tier: boundedScore >= 70 ? "strong" : boundedScore >= 45 ? "possible" : "stretch",
    reasons,
    warnings,
  };
}

export function rankRequirementListings<TListing extends ListingForRequirementMatching>(
  requirement: RequirementForMatching,
  listings: TListing[],
) {
  return listings
    .filter((listing) => !listing.removedAt && listing.status !== "removed")
    .map((listing) => scoreRequirementListing(requirement, listing))
    .sort((left, right) => right.score - left.score || left.listing.title.localeCompare(right.listing.title));
}
