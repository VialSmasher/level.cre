import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, DollarSign, Edit3, ExternalLink, Filter, MapPin, Mic, MicOff, Ruler, Save, Sparkles, Target, Wand2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const STATUS_OPTIONS = ["draft", "active", "paused", "filled", "archived"] as const;
const DEAL_TYPE_OPTIONS = ["lease", "sale", "either"] as const;

type IntelRequirement = {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  dealType: string;
  market: string | null;
  submarket: string | null;
  minSf: number | null;
  maxSf: number | null;
  minClearHeightFt?: number | null;
  maxBudgetPsf?: number | null;
  requiredDockDoors?: number | null;
  requiredGradeDoors?: number | null;
  minYardAcres?: number | null;
  powerNotes?: string | null;
  officeNotes?: string | null;
  timingNotes?: string | null;
  specialNotes?: string | null;
  isOffMarketSearchEnabled: boolean;
  updatedAt: string | null;
  archivedAt: string | null;
};

type IntelListing = {
  id: string;
  sourceName: string | null;
  title: string;
  address: string | null;
  market: string | null;
  submarket: string | null;
  status: string;
  listingType: string;
  assetType: string;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  leaseRatePsf: number | null;
  clearHeightFt?: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  removedAt: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodeStatus?: string | null;
  dataQualityStatus?: string | null;
};

type RequirementMatch = {
  listing: IntelListing;
  score: number;
  tier: "strong" | "adjacent" | "review";
  reasons: string[];
  warnings: string[];
};

type DecisionValue = "shortlist" | "maybe" | "rejected";

type IntelRequirementListingDecision = {
  requirementId: string;
  listingId: string;
  decision: DecisionValue;
  notes: string | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type RequirementFormState = {
  title: string;
  clientName: string;
  status: string;
  dealType: string;
  market: string;
  submarket: string;
  minSf: string;
  maxSf: string;
  minClearHeightFt: string;
  maxBudgetPsf: string;
  requiredDockDoors: string;
  requiredGradeDoors: string;
  minYardAcres: string;
  powerNotes: string;
  officeNotes: string;
  timingNotes: string;
  specialNotes: string;
  isOffMarketSearchEnabled: boolean;
};

const EMPTY_FORM: RequirementFormState = {
  title: "",
  clientName: "",
  status: "draft",
  dealType: "lease",
  market: "",
  submarket: "",
  minSf: "",
  maxSf: "",
  minClearHeightFt: "",
  maxBudgetPsf: "",
  requiredDockDoors: "",
  requiredGradeDoors: "",
  minYardAcres: "",
  powerNotes: "",
  officeNotes: "",
  timingNotes: "",
  specialNotes: "",
  isOffMarketSearchEnabled: false,
};

const MARKET_OPTIONS = ["Edmonton", "Calgary", "Central Alberta", "Northern Alberta"] as const;
const SUBMARKET_OPTIONS = [
  "Acheson",
  "Calgary",
  "Edmonton",
  "Fort Saskatchewan",
  "Leduc",
  "Nisku",
  "Northwest Edmonton",
  "Sherwood Park",
  "South Edmonton",
  "Southeast Edmonton",
  "St. Albert",
  "West Edmonton",
] as const;

const TIMING_OPTIONS = [
  "Immediate",
  "30-60 days",
  "90 days",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Flexible",
] as const;

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatMoney(value: number | null | undefined) {
  if (!value) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

function formatPsf(value: number | null | undefined) {
  if (!value) return "-";
  return `${new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(value)} / SF`;
}

function formatMapReadiness(listing: IntelListing) {
  if (listing.latitude && listing.longitude) return "Map ready";
  if (listing.geocodeStatus === "pending") return "Pending geocode";
  return "Needs coordinates";
}

function formatListingSize(listing: IntelListing) {
  if (listing.assetType === "land") {
    return listing.landAcres ? `${listing.landAcres.toLocaleString()} ac` : "-";
  }
  return listing.availableSf ? `${listing.availableSf.toLocaleString()} SF` : "-";
}

function formatListingValue(listing: IntelListing) {
  if (listing.totalPrice) return formatMoney(listing.totalPrice);
  if (listing.pricePerAcre) return `${formatMoney(listing.pricePerAcre)} / ac`;
  return null;
}

function formatSizeRange(requirement: Pick<IntelRequirement, "minSf" | "maxSf">) {
  if (requirement.minSf && requirement.maxSf) return `${formatNumber(requirement.minSf)} - ${formatNumber(requirement.maxSf)} SF`;
  if (requirement.minSf) return `${formatNumber(requirement.minSf)}+ SF`;
  if (requirement.maxSf) return `Up to ${formatNumber(requirement.maxSf)} SF`;
  return "Size TBD";
}

function formatRequirementArea(requirement: Pick<IntelRequirement, "market" | "submarket">) {
  return [requirement.submarket, requirement.market].filter(Boolean).join(", ") || "Area TBD";
}

function formFromRequirement(requirement: IntelRequirement): RequirementFormState {
  return {
    title: requirement.title || "",
    clientName: requirement.clientName || "",
    status: requirement.status || "draft",
    dealType: requirement.dealType || "lease",
    market: requirement.market || "",
    submarket: requirement.submarket || "",
    minSf: requirement.minSf ? String(requirement.minSf) : "",
    maxSf: requirement.maxSf ? String(requirement.maxSf) : "",
    minClearHeightFt: requirement.minClearHeightFt ? String(requirement.minClearHeightFt) : "",
    maxBudgetPsf: requirement.maxBudgetPsf ? String(requirement.maxBudgetPsf) : "",
    requiredDockDoors: requirement.requiredDockDoors ? String(requirement.requiredDockDoors) : "",
    requiredGradeDoors: requirement.requiredGradeDoors ? String(requirement.requiredGradeDoors) : "",
    minYardAcres: requirement.minYardAcres ? String(requirement.minYardAcres) : "",
    powerNotes: requirement.powerNotes || "",
    officeNotes: requirement.officeNotes || "",
    timingNotes: requirement.timingNotes || "",
    specialNotes: requirement.specialNotes || "",
    isOffMarketSearchEnabled: Boolean(requirement.isOffMarketSearchEnabled),
  };
}

function buildRequirementPayload(form: RequirementFormState) {
  return {
    title: form.title.trim(),
    clientName: form.clientName.trim() || null,
    status: form.status,
    dealType: form.dealType,
    market: form.market.trim() || null,
    submarket: form.submarket.trim() || null,
    minSf: toNullableNumber(form.minSf),
    maxSf: toNullableNumber(form.maxSf),
    minClearHeightFt: toNullableNumber(form.minClearHeightFt),
    maxBudgetPsf: toNullableNumber(form.maxBudgetPsf),
    requiredDockDoors: toNullableNumber(form.requiredDockDoors),
    requiredGradeDoors: toNullableNumber(form.requiredGradeDoors),
    minYardAcres: toNullableNumber(form.minYardAcres),
    powerNotes: form.powerNotes.trim() || null,
    officeNotes: form.officeNotes.trim() || null,
    timingNotes: form.timingNotes.trim() || null,
    specialNotes: form.specialNotes.trim() || null,
    isOffMarketSearchEnabled: form.isOffMarketSearchEnabled,
  };
}

function getRequirementCompleteness(requirement: IntelRequirement) {
  const items = [
    Boolean(requirement.clientName),
    Boolean(requirement.dealType),
    Boolean(requirement.market || requirement.submarket),
    Boolean(requirement.minSf || requirement.maxSf || requirement.minYardAcres),
    Boolean(requirement.minClearHeightFt || requirement.maxBudgetPsf || requirement.requiredDockDoors || requirement.requiredGradeDoors),
    Boolean(requirement.timingNotes || requirement.specialNotes || requirement.powerNotes || requirement.officeNotes),
  ];
  const complete = items.filter(Boolean).length;
  return {
    complete,
    total: items.length,
    percent: Math.round((complete / items.length) * 100),
  };
}

function getMissingRequirementFields(requirement: IntelRequirement) {
  return [
    !requirement.clientName ? "client" : "",
    !(requirement.market || requirement.submarket) ? "area" : "",
    !(requirement.minSf || requirement.maxSf || requirement.minYardAcres) ? "size" : "",
    !(requirement.minClearHeightFt || requirement.maxBudgetPsf || requirement.requiredDockDoors || requirement.requiredGradeDoors) ? "building constraints" : "",
  ].filter(Boolean);
}

function getRequirementConstraintChips(requirement: IntelRequirement) {
  return [
    requirement.minClearHeightFt ? `${requirement.minClearHeightFt}' clear` : "",
    requirement.maxBudgetPsf ? `${formatPsf(requirement.maxBudgetPsf)} max` : "",
    requirement.requiredDockDoors ? `${requirement.requiredDockDoors} dock` : "",
    requirement.requiredGradeDoors ? `${requirement.requiredGradeDoors} grade` : "",
    requirement.minYardAcres ? `${requirement.minYardAcres} ac yard` : "",
    requirement.powerNotes ? "power noted" : "",
    requirement.officeNotes ? "office noted" : "",
  ].filter(Boolean);
}

function normalizeMatchText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getRequirementAreaTokens(requirement: IntelRequirement) {
  const areaText = normalizeMatchText([
    requirement.submarket,
    requirement.market,
    requirement.specialNotes,
    requirement.timingNotes,
  ].filter(Boolean).join(" "));

  const knownAreas = [
    "south edmonton",
    "southeast",
    "south east",
    "sherwood park",
    "leduc",
    "nisku",
    "acheson",
    "northwest",
    "north west",
    "west edmonton",
    "fort saskatchewan",
    "st albert",
    "edmonton",
    "calgary",
  ];

  const detected = knownAreas.filter((area) => areaText.includes(area));
  if (requirement.submarket) detected.push(normalizeMatchText(requirement.submarket));
  if (requirement.market) detected.push(normalizeMatchText(requirement.market));
  return uniqueValues(detected);
}

function listingMatchesArea(listing: IntelListing, areaTokens: string[]) {
  if (areaTokens.length === 0) return false;
  const listingArea = normalizeMatchText([listing.submarket, listing.market, listing.address, listing.title].filter(Boolean).join(" "));
  if (!listingArea) return false;
  return areaTokens.some((area) => listingArea.includes(area) || area.includes(listingArea));
}

function scoreListingForRequirement(requirement: IntelRequirement, listing: IntelListing): RequirementMatch {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const dealType = normalizeMatchText(requirement.dealType);
  const listingType = normalizeMatchText(listing.listingType);
  const areaTokens = getRequirementAreaTokens(requirement);
  const listingText = normalizeMatchText([listing.title, listing.address, listing.submarket, listing.market, listing.sourceName].filter(Boolean).join(" "));

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
      reasons.push(`Size fits at ${listing.availableSf.toLocaleString()} SF`);
    } else {
      const lowBound = minSf ? minSf * 0.75 : 0;
      const highBound = Number.isFinite(maxSf) ? maxSf * 1.25 : Number.POSITIVE_INFINITY;
      if (listing.availableSf >= lowBound && listing.availableSf <= highBound) {
        score += 15;
        reasons.push(`Size is adjacent at ${listing.availableSf.toLocaleString()} SF`);
      } else {
        warnings.push(`Size is outside target at ${listing.availableSf.toLocaleString()} SF`);
      }
    }
  } else if (listing.assetType === "land" && requirement.minYardAcres && listing.landAcres) {
    if (listing.landAcres >= requirement.minYardAcres) {
      score += 20;
      reasons.push(`Land size supports yard need at ${listing.landAcres.toLocaleString()} ac`);
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
    tier: boundedScore >= 70 ? "strong" : boundedScore >= 45 ? "adjacent" : "review",
    reasons,
    warnings,
  };
}

function extractNumber(value: string | undefined) {
  if (!value) return "";
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const parsed = Number(normalized.replace(/,/g, "").replace(/k$/, ""));
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function extractSpaceNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const multiplier = normalized.endsWith("k") ? 1000 : 1;
  const parsed = Number(normalized.replace(/,/g, "").replace(/k$/, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : null;
}

function sentenceContaining(text: string, keyword: string) {
  const found = text
    .split(/[.!?]\s*/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.toLowerCase().includes(keyword));
  return found || "";
}

function parseRequirementTranscript(transcript: string): Partial<RequirementFormState> {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const parsed: Partial<RequirementFormState> = {};

  if (!text) return parsed;

  parsed.title = text.split(/[.!?]/)[0]?.slice(0, 72).trim() || "Dictated requirement";
  parsed.status = "active";
  parsed.market = lower.includes("calgary") ? "Calgary" : lower.includes("edmonton") ? "Edmonton" : "";
  parsed.dealType = lower.includes("purchase") || lower.includes("buy") || lower.includes("sale")
    ? "sale"
    : lower.includes("lease")
      ? "lease"
      : lower.includes("either")
        ? "either"
        : undefined;

  const clientMatch = text.match(/\b(?:client|tenant|buyer|company)\s+(?:is\s+|called\s+|named\s+)?([A-Za-z0-9 &'’.-]{2,60})/i);
  if (clientMatch?.[1]) {
    parsed.clientName = clientMatch[1].replace(/\b(?:needs|is|looking|wants|requires)\b.*$/i, "").trim();
  }

  const sfRangeMatch = text.match(/(\d[\d,]*)\s*(?:-|to|and)\s*(\d[\d,]*)\s*(?:sf|square feet|sq ft)/i);
  const sfSingleMatch = text.match(/(?:about|around|approximately|needs|need|looking for)?\s*(\d[\d,]*)\s*(?:sf|square feet|sq ft)/i);
  if (sfRangeMatch) {
    parsed.minSf = extractNumber(sfRangeMatch[1]);
    parsed.maxSf = extractNumber(sfRangeMatch[2]);
  } else if (sfSingleMatch) {
    parsed.minSf = extractNumber(sfSingleMatch[1]);
  }

  const clearHeightMatch = text.match(/(?:clear height|clear|ceiling height)[^\d]*(\d+(?:\.\d+)?)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*clear/i);
  if (clearHeightMatch?.[1]) parsed.minClearHeightFt = clearHeightMatch[1];

  const dockMatch = text.match(/(\d+)\s*(?:dock|dock doors|dock door)/i);
  if (dockMatch?.[1]) parsed.requiredDockDoors = dockMatch[1];

  const gradeMatch = text.match(/(\d+)\s*(?:grade|grade doors|grade door)/i);
  if (gradeMatch?.[1]) parsed.requiredGradeDoors = gradeMatch[1];

  const yardMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:acre|acres|ac)\s*(?:yard|site|land)?/i);
  if (yardMatch?.[1]) parsed.minYardAcres = yardMatch[1];

  const budgetMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:psf|per square foot|net rent|net)/i);
  if (budgetMatch?.[1]) parsed.maxBudgetPsf = budgetMatch[1];

  const submarketMatch = text.match(/\b(?:in|near|around|focused on)\s+([A-Za-z ]+?)\s+(?:submarket|area|edmonton|calgary|with|for|from|and|$)/i);
  if (submarketMatch?.[1]) parsed.submarket = submarketMatch[1].trim();

  parsed.powerNotes = sentenceContaining(text, "power");
  parsed.officeNotes = sentenceContaining(text, "office");
  parsed.timingNotes =
    sentenceContaining(text, "immediate") ||
    sentenceContaining(text, "asap") ||
    sentenceContaining(text, "month") ||
    sentenceContaining(text, "quarter") ||
    sentenceContaining(text, "q1") ||
    sentenceContaining(text, "q2") ||
    sentenceContaining(text, "q3") ||
    sentenceContaining(text, "q4");
  parsed.specialNotes = text;
  parsed.isOffMarketSearchEnabled = lower.includes("off market") || lower.includes("off-market");

  return parsed;
}

function parseRequirementTranscriptV2(transcript: string): Partial<RequirementFormState> {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const parsed: Partial<RequirementFormState> = {};

  if (!text) return parsed;

  const knownAreas = [
    "South Edmonton",
    "Southeast Edmonton",
    "Sherwood Park",
    "Leduc",
    "Nisku",
    "Acheson",
    "Northwest Edmonton",
    "West Edmonton",
    "Fort Saskatchewan",
    "St. Albert",
    "Edmonton",
    "Calgary",
  ];
  const detectedAreas = knownAreas.filter((area) => lower.includes(area.toLowerCase()));
  const clientMatch = text.match(/\b(?:talk(?:ed|ing)?\s+to|spoke\s+with|finished\s+talking\s+to|met\s+with|client|tenant|buyer|company)\s+(?:is\s+|called\s+|named\s+)?([A-Za-z0-9 &'â€™.-]{2,60})/i);
  const clientName = clientMatch?.[1]
    ?.replace(/\b(?:they|they're|they are|is|are|needs|need|wants|want|looking|requires|require|in)\b.*$/i, "")
    .trim();

  if (clientName) parsed.clientName = clientName;
  parsed.status = "active";
  parsed.market = lower.includes("calgary") ? "Calgary" : lower.includes("edmonton") ? "Edmonton" : "";
  parsed.dealType = lower.includes("purchase") || lower.includes("buy") || lower.includes("sale")
    ? "sale"
    : lower.includes("lease")
      ? "lease"
      : lower.includes("either")
        ? "either"
        : undefined;

  const sfRangeMatch = text.match(/(\d[\d,]*(?:\.\d+)?\s*k?)\s*(?:-|to|and)\s*(\d[\d,]*(?:\.\d+)?\s*k?)\s*(?:sf|square feet|sq ft)/i);
  const sfMentions = Array.from(text.matchAll(/(\d[\d,]*(?:\.\d+)?\s*k?)\s*(?:sf|square feet|sq ft)/gi))
    .map((match) => extractSpaceNumber(match[1]))
    .filter((value): value is number => typeof value === "number");
  const targetSizeMatch = text.match(/(?:downsize(?: them)? to|rightsize(?: them)? to|target(?:ing)?|goal (?:is|would be) to find(?: something with)?|looking for|needs?|want(?:s)?|require(?:s)?)\s*(?:about|around|approximately)?\s*(\d[\d,]*(?:\.\d+)?\s*k?)/i);
  const sfSingleMatch = text.match(/(?:about|around|approximately|needs|need|looking for)?\s*(\d[\d,]*(?:\.\d+)?\s*k?)\s*(?:sf|square feet|sq ft)/i);

  if (sfRangeMatch) {
    const first = extractSpaceNumber(sfRangeMatch[1]);
    const second = extractSpaceNumber(sfRangeMatch[2]);
    if (first && second) {
      parsed.minSf = String(Math.min(first, second));
      parsed.maxSf = String(Math.max(first, second));
    }
  } else if (lower.includes("downsize") && sfMentions.length >= 2) {
    const target = Math.min(...sfMentions);
    parsed.minSf = String(Math.round(target * 0.85));
    parsed.maxSf = String(Math.round(target * 1.15));
  } else if (targetSizeMatch?.[1]) {
    const target = extractSpaceNumber(targetSizeMatch[1]);
    if (target) {
      parsed.minSf = String(Math.round(target * 0.85));
      parsed.maxSf = String(Math.round(target * 1.15));
    }
  } else if (sfSingleMatch) {
    const target = extractSpaceNumber(sfSingleMatch[1]);
    if (target) parsed.minSf = String(target);
  }

  const clearHeightMatch = text.match(/(?:clear height|clear|ceiling height)[^\d]*(\d+(?:\.\d+)?)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*clear/i);
  if (clearHeightMatch?.[1]) parsed.minClearHeightFt = clearHeightMatch[1];

  const dockMatch = text.match(/(\d+)\s*(?:dock|dock doors|dock door)/i);
  if (dockMatch?.[1]) parsed.requiredDockDoors = dockMatch[1];

  const gradeMatch = text.match(/(\d+)\s*(?:grade|grade doors|grade door)/i);
  if (gradeMatch?.[1]) parsed.requiredGradeDoors = gradeMatch[1];

  const yardMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:acre|acres|ac)\s*(?:yard|site|land)?/i);
  if (yardMatch?.[1]) parsed.minYardAcres = yardMatch[1];

  const budgetMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:psf|per square foot|net rent|net)/i);
  if (budgetMatch?.[1]) parsed.maxBudgetPsf = budgetMatch[1];

  const submarketMatch = text.match(/\b(?:in|near|around|focused on)\s+([A-Za-z ]+?)\s+(?:submarket|area|edmonton|calgary|with|for|from|and|$)/i);
  if (detectedAreas.length > 0) {
    parsed.submarket = detectedAreas.join(", ");
  } else if (submarketMatch?.[1]) {
    parsed.submarket = submarketMatch[1].trim();
  }

  parsed.title = [
    clientName,
    parsed.maxSf ? `${Number(parsed.maxSf).toLocaleString()} SF` : parsed.minSf ? `${Number(parsed.minSf).toLocaleString()} SF` : "",
    parsed.dealType && parsed.dealType !== "either" ? parsed.dealType : "",
    "requirement",
  ].filter(Boolean).join(" ") || text.split(/[.!?]/)[0]?.slice(0, 72).trim() || "Dictated requirement";

  parsed.powerNotes = sentenceContaining(text, "power") || (lower.includes("machine shop") ? "Machine shop use; verify heavy power." : "");
  parsed.officeNotes = sentenceContaining(text, "office");
  parsed.timingNotes =
    sentenceContaining(text, "immediate") ||
    sentenceContaining(text, "asap") ||
    sentenceContaining(text, "month") ||
    sentenceContaining(text, "quarter") ||
    sentenceContaining(text, "q1") ||
    sentenceContaining(text, "q2") ||
    sentenceContaining(text, "q3") ||
    sentenceContaining(text, "q4");
  parsed.specialNotes = text;
  parsed.isOffMarketSearchEnabled = lower.includes("off market") || lower.includes("off-market");

  return parsed;
}

function getDictationInsights(transcript: string) {
  const parsed = parseRequirementTranscriptV2(transcript);
  const items = [
    { label: "Client", value: parsed.clientName },
    { label: "Deal", value: parsed.dealType },
    {
      label: "Size",
      value: parsed.minSf || parsed.maxSf
        ? `${parsed.minSf ? Number(parsed.minSf).toLocaleString() : "-"} - ${parsed.maxSf ? Number(parsed.maxSf).toLocaleString() : "-"} SF`
        : undefined,
    },
    { label: "Area", value: parsed.submarket || parsed.market },
    { label: "Power", value: parsed.powerNotes ? "Captured" : undefined },
    { label: "Timing", value: parsed.timingNotes ? "Captured" : undefined },
  ];

  return items.filter((item) => item.value);
}

function SurveyDraftPanel({
  requirement,
  matches,
  decisionsByListingId,
}: {
  requirement: IntelRequirement | null;
  matches: RequirementMatch[];
  decisionsByListingId: Record<string, IntelRequirementListingDecision>;
}) {
  const shortlistedMatches = matches
    .filter((match) => decisionsByListingId[match.listing.id]?.decision === "shortlist")
    .sort((left, right) => {
      const leftDecision = decisionsByListingId[left.listing.id];
      const rightDecision = decisionsByListingId[right.listing.id];
      if (leftDecision.sortOrder !== rightDecision.sortOrder) {
        return leftDecision.sortOrder - rightDecision.sortOrder;
      }
      return right.score - left.score;
    });

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Survey draft</p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            {requirement ? `${requirement.title} preview` : "Select a requirement"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Internal client-facing draft built from shortlisted listings only.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {shortlistedMatches.length} shortlisted
        </span>
      </div>

      {shortlistedMatches.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
          Shortlist matches above to build the first survey draft.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Listing</th>
                <th className="px-3 py-2">Building SF</th>
                <th className="px-3 py-2">Land</th>
                <th className="px-3 py-2">Lease rate</th>
                <th className="px-3 py-2">Sale price</th>
                <th className="px-3 py-2">Submarket</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shortlistedMatches.map((match) => (
                <tr key={match.listing.id} className="align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-950">{match.listing.title}</p>
                    <p className="mt-1 text-slate-600">{match.listing.address || "Address still needs review"}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Score {match.score}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{formatNumber(match.listing.availableSf)}</td>
                  <td className="px-3 py-3 text-slate-700">{match.listing.landAcres ? `${match.listing.landAcres.toLocaleString()} ac` : "-"}</td>
                  <td className="px-3 py-3 text-slate-700">{formatPsf(match.listing.leaseRatePsf)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatMoney(match.listing.totalPrice) || "-"}</td>
                  <td className="px-3 py-3 text-slate-700">{match.listing.submarket || match.listing.market || "-"}</td>
                  <td className="px-3 py-3 text-slate-700">{match.listing.sourceName || "Manual"}</td>
                  <td className="px-3 py-3 text-slate-700">{formatMapReadiness(match.listing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  decision,
  onDecision,
}: {
  match: RequirementMatch;
  decision?: DecisionValue;
  onDecision: (decision: DecisionValue) => void;
}) {
  const listingValue = formatListingValue(match.listing);
  return (
    <div className={`rounded-2xl border p-4 ${
      match.tier === "strong"
        ? "border-emerald-200 bg-emerald-50/60"
        : match.tier === "adjacent"
          ? "border-blue-200 bg-blue-50/50"
          : "border-slate-200 bg-white"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">{match.score}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              match.tier === "strong"
                ? "bg-emerald-100 text-emerald-800"
                : match.tier === "adjacent"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-100 text-slate-700"
            }`}>
              {match.tier === "strong" ? "Strong match" : match.tier === "adjacent" ? "Compatible adjacent" : "Review later"}
            </span>
            {decision && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {decision}
              </span>
            )}
          </div>
          <h3 className="mt-3 line-clamp-2 text-base font-semibold text-slate-950">{match.listing.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{match.listing.address || "Address still needs review"}</p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="font-semibold text-slate-950">{formatListingSize(match.listing)}</p>
          {listingValue && <p className="mt-1 text-slate-500">{listingValue}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">{match.listing.listingType}</span>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">{match.listing.assetType}</span>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-slate-700">{match.listing.submarket || match.listing.market || "Unassigned"}</span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span>{match.listing.clearHeightFt ? `${match.listing.clearHeightFt}' clear` : "Clear TBD"}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
          <DollarSign className="h-4 w-4 text-slate-400" />
          <span>{formatPsf(match.listing.leaseRatePsf)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
          <Target className="h-4 w-4 text-slate-400" />
          <span>{match.listing.landAcres ? `${match.listing.landAcres.toLocaleString()} ac` : "Land TBD"}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
          <MapPin className="h-4 w-4 text-slate-400" />
          <span>{formatMapReadiness(match.listing)}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/80 bg-white/70 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Why it fits
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {(match.reasons.length ? match.reasons.slice(0, 3) : ["Needs broker review"]).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Gaps
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {(match.warnings.length ? match.warnings.slice(0, 3) : ["No major gaps flagged"]).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => onDecision("shortlist")} className="bg-slate-950 text-white hover:bg-slate-800">
          Shortlist
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDecision("maybe")}>
          Maybe
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDecision("rejected")}>
          Reject
        </Button>
        {match.listing.sourceUrl && (
          <a href={match.listing.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900">
            Source <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {match.listing.brochureUrl && (
          <a href={match.listing.brochureUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900">
            Brochure <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function IndustrialIntelRequirementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RequirementFormState>(EMPTY_FORM);
  const [dictationText, setDictationText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<InstanceType<SpeechRecognitionCtor> | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [matchTierFilter, setMatchTierFilter] = useState<"all" | RequirementMatch["tier"]>("all");
  const isEditing = Boolean(editingRequirementId);

  const { data: requirements = [], isLoading } = useQuery<IntelRequirement[]>({
    queryKey: ["/api/intel/requirements"],
  });

  const { data: listings = [], isLoading: isLoadingListings } = useQuery<IntelListing[]>({
    queryKey: ["/api/intel/listings"],
  });

  const selectedRequirement = requirements.find((requirement) => requirement.id === selectedRequirementId) || requirements[0] || null;
  const decisionQueryKey = selectedRequirement
    ? [`/api/intel/requirements/${selectedRequirement.id}/shortlist`]
    : ["/api/intel/requirements/_/shortlist"];

  const { data: requirementDecisions = [] } = useQuery<IntelRequirementListingDecision[]>({
    queryKey: decisionQueryKey,
    enabled: Boolean(selectedRequirement?.id),
  });

  const decisionsByListingId = useMemo(() => Object.fromEntries(
    requirementDecisions.map((decision) => [decision.listingId, decision]),
  ) as Record<string, IntelRequirementListingDecision>, [requirementDecisions]);

  const scoredMatches = useMemo(() => {
    if (!selectedRequirement) return [];
    return listings
      .filter((listing) => !listing.removedAt && listing.status !== "removed")
      .map((listing) => scoreListingForRequirement(selectedRequirement, listing))
      .sort((left, right) => right.score - left.score);
  }, [listings, selectedRequirement]);

  const filteredMatches = useMemo(() => (
    matchTierFilter === "all" ? scoredMatches : scoredMatches.filter((match) => match.tier === matchTierFilter)
  ), [matchTierFilter, scoredMatches]);

  const matches = useMemo(() => filteredMatches.slice(0, 24), [filteredMatches]);

  const matchGroups = useMemo(() => ({
    strong: matches.filter((match) => match.tier === "strong"),
    adjacent: matches.filter((match) => match.tier === "adjacent"),
    review: matches.filter((match) => match.tier === "review"),
  }), [matches]);

  const dictationInsights = useMemo(() => getDictationInsights(dictationText), [dictationText]);
  const activeRequirementsCount = requirements.filter((requirement) => requirement.status === "active").length;
  const selectedCompleteness = selectedRequirement ? getRequirementCompleteness(selectedRequirement) : null;

  const saveDecisionMutation = useMutation({
    mutationFn: async ({ requirementId, match, decision }: { requirementId: string; match: RequirementMatch; decision: DecisionValue }) => {
      const response = await apiRequest("PUT", `/api/intel/requirements/${requirementId}/shortlist/${match.listing.id}`, {
        decision,
        notes: null,
        sortOrder: Math.max(0, 100 - match.score),
      });
      return response.json() as Promise<IntelRequirementListingDecision>;
    },
    onSuccess: (decision) => {
      queryClient.setQueryData<IntelRequirementListingDecision[]>([`/api/intel/requirements/${decision.requirementId}/shortlist`], (current = []) => {
        const withoutCurrent = current.filter((item) => item.listingId !== decision.listingId);
        return [...withoutCurrent, decision];
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save decision",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleMatchDecision = (match: RequirementMatch, decision: DecisionValue) => {
    if (!selectedRequirement) {
      toast({ title: "Select a requirement before saving a decision", variant: "destructive" });
      return;
    }
    saveDecisionMutation.mutate({ requirementId: selectedRequirement.id, match, decision });
  };

  const saveRequirementMutation = useMutation({
    mutationFn: async () => {
      const payload = buildRequirementPayload(form);
      const response = editingRequirementId
        ? await apiRequest("PATCH", `/api/intel/requirements/${editingRequirementId}`, payload)
        : await apiRequest("POST", "/api/intel/requirements", payload);
      return response.json();
    },
    onSuccess: (requirement: IntelRequirement) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/requirements"] });
      setForm(EMPTY_FORM);
      setEditingRequirementId(null);
      setSelectedRequirementId(requirement.id);
      toast({ title: isEditing ? "Industrial Intel requirement updated" : "Industrial Intel requirement created" });
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? "Failed to update requirement" : "Failed to create requirement",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({
        title: "Title required",
        description: "Give this requirement a short working title first.",
        variant: "destructive",
      });
      return;
    }
    saveRequirementMutation.mutate();
  };

  const updateField = <K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyDictation = () => {
    const parsed = parseRequirementTranscriptV2(dictationText);
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined && value !== ""),
      ),
    }));
    toast({ title: "Requirement draft filled", description: "Review the fields, then save when ready." });
  };

  const startEditingRequirement = (requirement: IntelRequirement) => {
    setSelectedRequirementId(requirement.id);
    setEditingRequirementId(requirement.id);
    setForm(formFromRequirement(requirement));
  };

  const cancelEditingRequirement = () => {
    setEditingRequirementId(null);
    setForm(EMPTY_FORM);
  };

  const toggleDictation = async () => {
    if (isListening) {
      recognition?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Voice dictation unavailable",
        description: "Paste dictated notes into the transcript box and use Fill form instead.",
        variant: "destructive",
      });
      return;
    }

    if (!window.isSecureContext) {
      toast({
        title: "Voice dictation needs a secure page",
        description: "Open the app over HTTPS, or paste dictated notes into the transcript box and use Fill form.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      toast({
        title: "Microphone permission is blocked",
        description: "Allow microphone access for this site in Chrome, then try Dictate again. You can still paste notes and use Fill form.",
        variant: "destructive",
      });
      return;
    }

    const nextRecognition = new (SpeechRecognition as SpeechRecognitionCtor)();
    nextRecognition.continuous = true;
    nextRecognition.interimResults = true;
    nextRecognition.lang = "en-CA";
    nextRecognition.onresult = (event: any) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index][0]?.transcript || "";
      }
      setDictationText(spoken.trim());
    };
    nextRecognition.onerror = (event) => {
      setIsListening(false);
      const isPermissionError = event.error === "not-allowed" || event.error === "service-not-allowed";
      toast({
        title: isPermissionError ? "Microphone permission is blocked" : "Dictation stopped",
        description: isPermissionError
          ? "Allow microphone access for this site in Chrome, then try Dictate again. You can still paste notes and use Fill form."
          : event.error || "The browser stopped voice capture.",
        variant: "destructive",
      });
    };
    nextRecognition.onend = () => setIsListening(false);
    setRecognition(nextRecognition);
    setIsListening(true);
    nextRecognition.start();
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <ClipboardList className="h-3.5 w-3.5" />
            Matching inputs
          </span>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Requirements workbench</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Capture clean tenant and buyer demand so Industrial Intel can score inventory, flag gaps, and prepare client-ready shortlists.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Matching engine foundation
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved demand</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{requirements.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active searches</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{activeRequirementsCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tool B inventory</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{listings.filter((listing) => !listing.removedAt && listing.status !== "removed").length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected readiness</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{selectedCompleteness ? `${selectedCompleteness.percent}%` : "-"}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? "Update requirement" : "Create requirement"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-800">
                      <Mic className="h-4 w-4" />
                      Voice intake
                    </h3>
                    <p className="mt-1 text-sm text-blue-900/80">
                      Dictate a requirement, then let the workbench prefill the structured fields.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={toggleDictation} className={isListening ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-blue-600 text-white hover:bg-blue-700"}>
                      {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                      {isListening ? "Stop" : "Dictate"}
                    </Button>
                    <Button type="button" variant="outline" onClick={applyDictation} disabled={!dictationText.trim()}>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Fill form
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="mt-3 min-h-24 bg-white"
                  value={dictationText}
                  onChange={(event) => setDictationText(event.target.value)}
                  placeholder="Example: Client ABC needs 15,000 to 30,000 SF in West Edmonton, lease, 24 foot clear, two dock doors, one grade door, 1.5 acre yard, heavy power, immediate timing..."
                />
                <div className="mt-3 rounded-2xl border border-blue-100 bg-white/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">Requirement brief</p>
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                      {dictationInsights.length} fields detected
                    </span>
                  </div>
                  {dictationInsights.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dictationInsights.map((item) => (
                        <span key={item.label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                          {item.label}: <span className="text-slate-950">{item.value}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      Speak naturally, then use Fill form. The full transcript is still saved into special notes so no context gets lost.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Start with the basics, add any hard building constraints, then save the requirement
                when it is ready for review or matching.
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Basics</h3>
                  <p className="mt-1 text-sm text-slate-500">Who the requirement is for, where it should land, and what type of deal it is.</p>
                </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="West Edmonton lease requirement" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client</Label>
                  <Input id="clientName" value={form.clientName} onChange={(e) => updateField("clientName", e.target.value)} placeholder="Example client" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input id="market" list="intel-market-options" value={form.market} onChange={(e) => updateField("market", e.target.value)} placeholder="Edmonton" />
                  <datalist id="intel-market-options">
                    {MARKET_OPTIONS.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="submarket">Submarket</Label>
                  <Input id="submarket" list="intel-submarket-options" value={form.submarket} onChange={(e) => updateField("submarket", e.target.value)} placeholder="West Edmonton" />
                  <datalist id="intel-submarket-options">
                    {SUBMARKET_OPTIONS.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Pipeline status</Label>
                  <select id="status" value={form.status} onChange={(e) => updateField("status", e.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm capitalize">
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealType">Deal type</Label>
                  <select id="dealType" value={form.dealType} onChange={(e) => updateField("dealType", e.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm capitalize">
                    {DEAL_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Size and building</h3>
                  <p className="mt-1 text-sm text-slate-500">Capture the core size range and physical constraints that matter for screening listings.</p>
                </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="minSf">Min SF</Label>
                  <Input id="minSf" value={form.minSf} onChange={(e) => updateField("minSf", e.target.value)} inputMode="numeric" placeholder="15000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSf">Max SF</Label>
                  <Input id="maxSf" value={form.maxSf} onChange={(e) => updateField("maxSf", e.target.value)} inputMode="numeric" placeholder="30000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minClearHeightFt">Min clear height</Label>
                  <Input id="minClearHeightFt" value={form.minClearHeightFt} onChange={(e) => updateField("minClearHeightFt", e.target.value)} inputMode="decimal" placeholder="24" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBudgetPsf">Max budget / PSF</Label>
                  <Input id="maxBudgetPsf" value={form.maxBudgetPsf} onChange={(e) => updateField("maxBudgetPsf", e.target.value)} inputMode="decimal" placeholder="16.50" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="requiredDockDoors">Required dock doors</Label>
                  <Input id="requiredDockDoors" value={form.requiredDockDoors} onChange={(e) => updateField("requiredDockDoors", e.target.value)} inputMode="numeric" placeholder="2" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requiredGradeDoors">Required grade doors</Label>
                  <Input id="requiredGradeDoors" value={form.requiredGradeDoors} onChange={(e) => updateField("requiredGradeDoors", e.target.value)} inputMode="numeric" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minYardAcres">Min yard acres</Label>
                  <Input id="minYardAcres" value={form.minYardAcres} onChange={(e) => updateField("minYardAcres", e.target.value)} inputMode="decimal" placeholder="1.5" />
                </div>
              </div>

              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Notes and intent</h3>
                  <p className="mt-1 text-sm text-slate-500">Use notes for nuance that should influence matching, review, or off-market follow-up.</p>
                </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="powerNotes">Power notes</Label>
                  <Textarea id="powerNotes" value={form.powerNotes} onChange={(e) => updateField("powerNotes", e.target.value)} placeholder="Heavy power preferred" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="officeNotes">Office notes</Label>
                  <Textarea id="officeNotes" value={form.officeNotes} onChange={(e) => updateField("officeNotes", e.target.value)} placeholder="Minimal office preferred" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timingNotesQuick">Timing notes</Label>
                  <Input id="timingNotesQuick" list="intel-timing-options" value={form.timingNotes} onChange={(e) => updateField("timingNotes", e.target.value)} placeholder="Need occupancy by Q3" />
                  <datalist id="intel-timing-options">
                    {TIMING_OPTIONS.map((option) => <option key={option} value={option} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialNotes">Special notes</Label>
                  <Textarea id="specialNotes" value={form.specialNotes} onChange={(e) => updateField("specialNotes", e.target.value)} placeholder="Truck court matters, excess office avoid, etc." />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={form.isOffMarketSearchEnabled} onChange={(e) => updateField("isOffMarketSearchEnabled", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Include off-market search intent for this requirement
              </label>

              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={saveRequirementMutation.isPending} className="bg-slate-950 text-white hover:bg-slate-800">
                  {saveRequirementMutation.isPending ? (
                    "Saving..."
                  ) : isEditing ? (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update requirement
                    </>
                  ) : (
                    "Create requirement"
                  )}
                </Button>
                {isEditing && (
                  <Button type="button" variant="outline" onClick={cancelEditingRequirement}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel edit
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved requirements and matches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading requirements...</p>
            ) : requirements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-base font-medium text-slate-900">No saved requirements yet</p>
                <p className="mt-2 text-sm text-slate-600">
                  Your saved requirements will appear here. Start with one clear requirement, then Industrial Intel can score listings against it.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 lg:grid-cols-2">
                  {requirements.map((requirement) => {
                    const isSelected = selectedRequirement?.id === requirement.id;
                    const completeness = getRequirementCompleteness(requirement);
                    const missingFields = getMissingRequirementFields(requirement);
                    const constraintChips = getRequirementConstraintChips(requirement);
                    return (
                      <div
                        key={requirement.id}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-blue-300 bg-blue-50/80 shadow-sm"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                        }`}
                      >
                        <button type="button" onClick={() => setSelectedRequirementId(requirement.id)} className="w-full text-left">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                            <p className="text-base font-semibold text-slate-950">{requirement.title}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {requirement.clientName || "No client name yet"}
                            </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">{requirement.dealType}</span>
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{requirement.status}</span>
                            {requirement.isOffMarketSearchEnabled && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">off-market on</span>
                            )}
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                            <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-slate-400" />
                            {formatRequirementArea(requirement)}
                            </p>
                            <p className="flex items-center gap-2">
                            <Ruler className="h-4 w-4 text-slate-400" />
                            {formatSizeRange(requirement)}
                            </p>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                              <span>Intake completeness</span>
                              <span>{completeness.complete}/{completeness.total}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-blue-600" style={{ width: `${completeness.percent}%` }} />
                            </div>
                          </div>

                          {constraintChips.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                              {constraintChips.slice(0, 5).map((chip) => (
                                <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-slate-700">{chip}</span>
                              ))}
                            </div>
                          )}

                          {missingFields.length > 0 && (
                            <p className="mt-3 text-xs text-amber-700">
                              Needs {missingFields.slice(0, 3).join(", ")} for stronger matching.
                            </p>
                          )}

                          <p className="mt-3 text-xs text-slate-500">
                          Updated {formatDateTime(requirement.updatedAt)}
                          </p>
                        </button>
                        <div className="mt-3 flex justify-end">
                          <Button type="button" size="sm" variant="outline" onClick={() => startEditingRequirement(requirement)}>
                            <Edit3 className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Matchmaker</p>
                      <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                        {selectedRequirement ? selectedRequirement.title : "Select a requirement"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Ranked against current Industrial Intel inventory. Use decisions to stage a client shortlist.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-slate-700">
                        <Filter className="h-3.5 w-3.5" />
                        {filteredMatches.length} shown
                      </span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800">{matchGroups.strong.length} strong</span>
                      <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">{matchGroups.adjacent.length} adjacent</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{matchGroups.review.length} review</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["all", "strong", "adjacent", "review"] as const).map((tier) => (
                      <Button
                        key={tier}
                        type="button"
                        size="sm"
                        variant={matchTierFilter === tier ? "default" : "outline"}
                        onClick={() => setMatchTierFilter(tier)}
                        className={matchTierFilter === tier ? "bg-slate-950 text-white hover:bg-slate-800" : ""}
                      >
                        {tier === "all" ? "All matches" : tier}
                      </Button>
                    ))}
                  </div>

                  {isLoadingListings ? (
                    <p className="mt-5 text-sm text-slate-500">Scoring listings...</p>
                  ) : !selectedRequirement ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-600">
                      Save or select a requirement to see compatible listings.
                    </div>
                  ) : matches.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
                      <p className="font-medium text-slate-950">No active listings available to score yet</p>
                      <p className="mt-2 text-sm text-slate-600">Import inventory first, then return here to build a shortlist.</p>
                    </div>
                  ) : (
                    <div className="mt-5 max-h-[820px] space-y-4 overflow-y-auto pr-1">
                      {matches.map((match) => (
                        <MatchCard
                          key={match.listing.id}
                          match={match}
                          decision={decisionsByListingId[match.listing.id]?.decision}
                          onDecision={(decision) => handleMatchDecision(match, decision)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <SurveyDraftPanel
                  requirement={selectedRequirement}
                  matches={scoredMatches}
                  decisionsByListingId={decisionsByListingId}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
