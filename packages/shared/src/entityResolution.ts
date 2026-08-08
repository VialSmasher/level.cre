export type ResolvableMarketEntity = {
  entityType: "prospect" | "listing" | "dossier";
  id: string;
  label: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  marketKey?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  businessName?: string | null;
  municipality?: string | null;
  titleNumber?: string | null;
  linc?: string | null;
  plan?: string | null;
  block?: string | null;
  lot?: string | null;
};

export type MarketEntityResolutionInput = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  businessName?: string | null;
  municipality?: string | null;
  titleNumber?: string | null;
  linc?: string | null;
  plan?: string | null;
  block?: string | null;
  lot?: string | null;
};

export type MarketEntityResolutionCandidate = ResolvableMarketEntity & {
  score: number;
  confidence: number;
  signals: string[];
  conflicts: string[];
  distanceMeters: number | null;
};

export function normalizeMarketAddress(value?: string | null) {
  const firstLine = String(value || "").split(",")[0] || "";
  return firstLine
    .toUpperCase()
    .replace(/\bNORTHWEST\b|\bNORTHEAST\b|\bSOUTHWEST\b|\bSOUTHEAST\b/g, "")
    .replace(/\bNW\b|\bNE\b|\bSW\b|\bSE\b/g, "")
    .replace(/\bSTREET\b|\bST\b/g, "ST")
    .replace(/\bAVENUE\b|\bAVE\b/g, "AVE")
    .replace(/\bROAD\b|\bRD\b/g, "RD")
    .replace(/\bDRIVE\b|\bDR\b/g, "DR")
    .replace(/\bTRAIL\b|\bTRL\b/g, "TRL")
    .replace(/\bBOULEVARD\b|\bBLVD\b/g, "BLVD")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function emailDomain(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized.split("@").pop() || "" : "";
}

export function websiteDomain(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  try {
    const url = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return normalized.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function normalizeName(value?: string | null) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeLegalToken(value?: string | null) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeMunicipality(value?: string | null) {
  return normalizeName(value)
    .replace(/\b(county|municipality|municipal district|md|city|town|village)\b/g, " ")
    .replace(/\bof\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latDelta = toRadians(bLat - aLat);
  const lngDelta = toRadians(bLng - aLng);
  const value = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(lngDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function scoreMarketEntityCandidate(
  input: MarketEntityResolutionInput,
  entity: ResolvableMarketEntity,
): MarketEntityResolutionCandidate {
  let score = 0;
  const signals: string[] = [];
  const conflicts: string[] = [];
  const inputAddress = normalizeMarketAddress(input.address);
  const entityAddress = normalizeMarketAddress(entity.address);
  const inputPhone = normalizePhone(input.phone);
  const entityPhone = normalizePhone(entity.phone);
  const inputEmail = String(input.email || "").trim().toLowerCase();
  const entityEmail = String(entity.email || "").trim().toLowerCase();
  const inputBusiness = normalizeName(input.businessName);
  const entityBusiness = normalizeName(entity.businessName || entity.label);
  const inputDomain = emailDomain(input.email) || websiteDomain(input.websiteUrl);
  const entityDomain = emailDomain(entity.email) || websiteDomain(entity.websiteUrl);
  const marketKey = input.placeId ? `google-place:${input.placeId}` : "";
  const inputMunicipality = normalizeMunicipality(input.municipality);
  const entityMunicipality = normalizeMunicipality(entity.municipality);
  const inputTitleNumber = normalizeLegalToken(input.titleNumber);
  const entityTitleNumber = normalizeLegalToken(entity.titleNumber);
  const inputLinc = normalizeLegalToken(input.linc);
  const entityLinc = normalizeLegalToken(entity.linc);
  const inputPlan = normalizeLegalToken(input.plan);
  const entityPlan = normalizeLegalToken(entity.plan);
  const inputBlock = normalizeLegalToken(input.block);
  const entityBlock = normalizeLegalToken(entity.block);
  const inputLot = normalizeLegalToken(input.lot);
  const entityLot = normalizeLegalToken(entity.lot);

  if (input.placeId && (entity.placeId === input.placeId || entity.marketKey === marketKey)) {
    score += 100;
    signals.push("Exact Google Place ID");
  }
  if (inputAddress && entityAddress) {
    if (inputAddress === entityAddress) {
      score += 84;
      signals.push("Exact normalized address");
    } else {
      conflicts.push("Address differs");
    }
  }
  if (inputMunicipality && entityMunicipality) {
    if (inputMunicipality === entityMunicipality) {
      score += 18;
      signals.push("Exact municipality");
    } else {
      conflicts.push(`Municipality differs (${input.municipality} vs ${entity.municipality})`);
    }
  }
  if (inputTitleNumber && entityTitleNumber && inputTitleNumber === entityTitleNumber) {
    score += 100;
    signals.push("Exact title number");
  }
  if (inputLinc && entityLinc && inputLinc === entityLinc) {
    score += 100;
    signals.push("Exact LINC");
  }
  if (inputPlan && entityPlan && inputPlan === entityPlan) {
    score += 35;
    signals.push("Exact plan");
    if (inputBlock && entityBlock && inputBlock === entityBlock) {
      score += 28;
      signals.push("Exact block");
    }
    if (inputLot && entityLot && inputLot === entityLot) {
      score += 37;
      signals.push("Exact lot");
    }
  }

  let distanceMeters: number | null = null;
  if (
    input.latitude != null && input.longitude != null
    && entity.latitude != null && entity.longitude != null
  ) {
    distanceMeters = Math.round(haversineMeters(input.latitude, input.longitude, entity.latitude, entity.longitude));
    if (distanceMeters <= 25) {
      score += 75;
      signals.push(`Coordinates within ${distanceMeters} m`);
    } else if (distanceMeters <= 100) {
      score += 55;
      signals.push(`Coordinates within ${distanceMeters} m`);
    } else if (distanceMeters > 1000) {
      conflicts.push("Coordinates are more than 1 km apart");
    }
  }

  if (inputPhone && entityPhone && inputPhone === entityPhone) {
    score += 60;
    signals.push("Exact phone number");
  }
  if (inputEmail && entityEmail && inputEmail === entityEmail) {
    score += 70;
    signals.push("Exact email address");
  } else if (inputDomain && entityDomain && inputDomain === entityDomain) {
    score += 30;
    signals.push(`Shared domain ${inputDomain}`);
  }
  if (inputBusiness && entityBusiness) {
    if (inputBusiness === entityBusiness) {
      score += 35;
      signals.push("Exact business name");
    } else if (inputBusiness.includes(entityBusiness) || entityBusiness.includes(inputBusiness)) {
      score += 18;
      signals.push("Similar business name");
    }
  }

  const confidence = Math.max(0, Math.min(100, score - conflicts.length * 10));
  return { ...entity, score, confidence, signals, conflicts, distanceMeters };
}

export function resolveMarketEntities(
  input: MarketEntityResolutionInput,
  entities: ResolvableMarketEntity[],
) {
  const candidates = entities
    .map((entity) => scoreMarketEntityCandidate(input, entity))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.confidence - left.confidence || right.score - left.score)
    .slice(0, 10);
  const top = candidates[0] || null;
  const runnerUp = candidates[1] || null;
  const decisive = Boolean(
    top
    && top.confidence >= 80
    && top.conflicts.length === 0
    && (!runnerUp || top.confidence - runnerUp.confidence >= 10),
  );
  return {
    candidates,
    topCandidate: top,
    decision: decisive ? "link_existing" as const : candidates.length ? "review" as const : "create_new" as const,
  };
}
