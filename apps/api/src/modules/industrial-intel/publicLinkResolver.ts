import type { IntelListingListItem, UpsertIntelPublicLinkCandidateInput } from "./repo";

const TRUSTED_DOMAINS = [
  "cwedm.com",
  "cushmanwakefield.com",
  "cbre.ca",
  "collierscanada.com",
  "avisonyoung.ca",
  "jll.ca",
  "loopnet.ca",
] as const;

type GoogleSearchItem = {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
};

type GoogleSearchResponse = {
  items?: GoogleSearchItem[];
  error?: {
    message?: string;
  };
};

export type PublicLinkResolverResult =
  | {
      status: "not_configured";
      message: string;
      candidates: [];
    }
  | {
      status: "resolved";
      message: string;
      candidates: UpsertIntelPublicLinkCandidateInput[];
      queries: string[];
    };

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function domainFromUrl(value: string, fallback?: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return normalizeText(fallback).replace(/\s+/g, ".");
  }
}

function addressTokens(address: string | null | undefined) {
  const normalized = normalizeText(address);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 2 || /^\d+$/.test(token));
}

function titleSimilarityScore(listingTitle: string, candidateTitle: string | null | undefined) {
  const listingWords = new Set(normalizeText(listingTitle).split(" ").filter((word) => word.length > 3));
  const candidateWords = new Set(normalizeText(candidateTitle).split(" ").filter((word) => word.length > 3));
  if (listingWords.size === 0 || candidateWords.size === 0) return 0;
  let overlap = 0;
  for (const word of listingWords) {
    if (candidateWords.has(word)) overlap += 1;
  }
  return Math.min(20, Math.round((overlap / listingWords.size) * 20));
}

function inferCity(listing: IntelListingListItem) {
  const fields = [listing.market, listing.submarket, listing.address, listing.title].filter(Boolean).join(" ");
  const normalized = normalizeText(fields);
  if (normalized.includes("edmonton")) return "Edmonton";
  if (normalized.includes("nisku")) return "Nisku";
  if (normalized.includes("leduc")) return "Leduc";
  if (normalized.includes("acheson")) return "Acheson";
  if (normalized.includes("sherwood park")) return "Sherwood Park";
  if (normalized.includes("st albert")) return "St. Albert";
  return listing.market || listing.submarket || "";
}

function buildQueries(listing: IntelListingListItem) {
  const city = inferCity(listing);
  const address = listing.normalizedAddress || listing.address || "";
  const typeWords = [listing.listingType, listing.assetType === "building" ? "industrial" : listing.assetType]
    .filter(Boolean)
    .join(" ");
  const coreParts = [
    address ? `"${address}"` : "",
    city ? `"${city}"` : "",
    typeWords,
    listing.listingType === "sale" ? "for sale" : "for lease",
  ].filter(Boolean);
  const titleParts = [`"${listing.title}"`, city ? `"${city}"` : "", "industrial"].filter(Boolean);
  const queries = [
    `${coreParts.join(" ")} (${TRUSTED_DOMAINS.map((domain) => `site:${domain}`).join(" OR ")})`,
    `${titleParts.join(" ")} (${TRUSTED_DOMAINS.map((domain) => `site:${domain}`).join(" OR ")})`,
    ...TRUSTED_DOMAINS.map((domain) => `${coreParts.join(" ")} site:${domain}`),
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, 10);
}

function scoreCandidate(listing: IntelListingListItem, candidate: GoogleSearchItem) {
  const url = normalizeUrl(candidate.link || "");
  const domain = domainFromUrl(url, candidate.displayLink);
  const haystack = normalizeText([candidate.title, candidate.snippet, url].filter(Boolean).join(" "));
  const address = listing.normalizedAddress || listing.address || "";
  const addressWords = addressTokens(address);
  const addressMatchCount = addressWords.filter((token) => haystack.includes(token)).length;
  const addressScore = addressWords.length > 0 && addressMatchCount >= Math.max(2, Math.ceil(addressWords.length * 0.6)) ? 35 : 0;
  const trustedScore = TRUSTED_DOMAINS.some((trustedDomain) => domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)) ? 20 : 0;
  const city = inferCity(listing);
  const cityScore = city && haystack.includes(normalizeText(city)) ? 10 : 0;
  const submarketScore = listing.submarket && haystack.includes(normalizeText(listing.submarket)) ? 8 : 0;
  const typeWords = [listing.listingType, listing.assetType, "industrial"].filter(Boolean);
  const typeScore = Math.min(15, typeWords.filter((word) => haystack.includes(normalizeText(word))).length * 5);
  const similarityScore = titleSimilarityScore(listing.title, candidate.title);
  const loopNetPenalty = domain.endsWith("loopnet.ca") && addressScore === 0 ? -15 : 0;

  return Math.max(0, Math.min(100, addressScore + trustedScore + cityScore + submarketScore + typeScore + similarityScore + loopNetPenalty));
}

async function runGoogleSearch(query: string, apiKey: string, cx: string): Promise<GoogleSearchItem[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");

  const response = await fetch(url);
  const data = (await response.json()) as GoogleSearchResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Google search failed with ${response.status}`);
  }
  return data.items || [];
}

export async function resolvePublicLinkCandidates(listing: IntelListingListItem): Promise<PublicLinkResolverResult> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) {
    return {
      status: "not_configured",
      message: "Search provider not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX to enable public listing resolution.",
      candidates: [],
    };
  }

  const queries = buildQueries(listing);
  const byUrl = new Map<string, UpsertIntelPublicLinkCandidateInput>();

  for (const query of queries) {
    const items = await runGoogleSearch(query, apiKey, cx);
    for (const item of items) {
      if (!item.link) continue;
      const candidateUrl = normalizeUrl(item.link);
      const confidence = scoreCandidate(listing, item);
      if (confidence < 20) continue;
      const existing = byUrl.get(candidateUrl);
      const candidate = {
        candidateUrl,
        domain: domainFromUrl(candidateUrl, item.displayLink),
        title: item.title || null,
        snippet: item.snippet || null,
        confidence,
        source: "resolver" as const,
      };
      if (!existing || candidate.confidence > existing.confidence) {
        byUrl.set(candidateUrl, candidate);
      }
    }
  }

  const candidates = Array.from(byUrl.values())
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 8);

  return {
    status: "resolved",
    message: candidates.length > 0 ? "Public link candidates resolved." : "No candidates found.",
    candidates,
    queries,
  };
}
