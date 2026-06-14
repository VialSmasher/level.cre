import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
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

const MIN_PERSISTED_CONFIDENCE = 55;

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

type ResolverProviderName = "vertex" | "google";

type VertexServiceAccount = {
  client_email?: string;
  private_key?: string;
};

type VertexTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type VertexGroundingChunk = {
  web?: {
    uri?: string;
    title?: string;
  };
};

type VertexGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      groundingChunks?: VertexGroundingChunk[];
    };
  }>;
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

function cleanSnippet(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("```") || trimmed.startsWith("{") || trimmed.startsWith("[")) return undefined;
  return trimmed.replace(/\s+/g, " ").slice(0, 260);
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
    address ? `"${address}" ${city ? `"${city}" ` : ""}${listing.listingType === "sale" ? "sale" : "lease"} industrial` : "",
    `${coreParts.join(" ")} (${TRUSTED_DOMAINS.map((domain) => `site:${domain}`).join(" OR ")})`,
    `${titleParts.join(" ")} (${TRUSTED_DOMAINS.map((domain) => `site:${domain}`).join(" OR ")})`,
    ...["cwedm.com", "cushmanwakefield.com", "cbre.ca", "collierscanada.com"].map((domain) => `${coreParts.join(" ")} site:${domain}`),
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, 5);
}

function buildVertexPrompt(listing: IntelListingListItem) {
  const address = listing.normalizedAddress || listing.address || "";
  const city = inferCity(listing);
  const trustedDomains = TRUSTED_DOMAINS.join(", ");
  return [
    "Find public commercial real estate listing URLs for this imported industrial listing.",
    "Prioritize broker or landlord public listing pages, flyer pages, and brochure landing pages.",
    "Return only valid URLs from likely public sources. Do not include generic home pages, map links, or unrelated listings.",
    `Trusted domains: ${trustedDomains}. LoopNet is acceptable only when the listing match is straightforward.`,
    "Respond as JSON only with this shape:",
    '{"candidates":[{"url":"https://...","title":"...","snippet":"why this appears to match"}]}',
    "",
    `Listing title: ${listing.title}`,
    `Address: ${address || "unknown"}`,
    `City/market: ${city || listing.market || "unknown"}`,
    `Submarket: ${listing.submarket || "unknown"}`,
    `Listing type: ${listing.listingType}`,
    `Asset type: ${listing.assetType}`,
    `Size: ${listing.availableSf ? `${listing.availableSf} SF` : listing.landAcres ? `${listing.landAcres} acres` : "unknown"}`,
  ].join("\n");
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
  url.searchParams.set("num", "3");

  const response = await fetch(url);
  const data = (await response.json()) as GoogleSearchResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Google search failed with ${response.status}`);
  }
  return data.items || [];
}

function getVertexServiceAccount(): VertexServiceAccount | null {
  const rawJson = process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (rawJson) {
    return JSON.parse(rawJson) as VertexServiceAccount;
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    return JSON.parse(readFileSync(credentialsPath, "utf8")) as VertexServiceAccount;
  }

  return null;
}

function isVertexConfigured() {
  if (process.env.VERTEX_AI_ACCESS_TOKEN) return true;
  if (!(process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_AI_PROJECT_ID)) return false;
  try {
    return Boolean(getVertexServiceAccount());
  } catch {
    return false;
  }
}

async function getVertexAccessToken() {
  if (process.env.VERTEX_AI_ACCESS_TOKEN) return process.env.VERTEX_AI_ACCESS_TOKEN;

  const serviceAccount = getVertexServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount.private_key) {
    throw new Error("Vertex AI resolver requires VERTEX_AI_ACCESS_TOKEN, GOOGLE_APPLICATION_CREDENTIALS, or VERTEX_AI_SERVICE_ACCOUNT_JSON.");
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
    { algorithm: "RS256" },
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await response.json()) as VertexTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Vertex token request failed with ${response.status}`);
  }

  return data.access_token;
}

function parseVertexJsonCandidates(text: string): GoogleSearchItem[] {
  const trimmed = text.trim();
  const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] || trimmed.match(/```\s*([\s\S]*?)```/i)?.[1];
  const looseJsonStart = trimmed.indexOf("{");
  const looseJsonEnd = trimmed.lastIndexOf("}");
  const looseJson = looseJsonStart >= 0 && looseJsonEnd > looseJsonStart
    ? trimmed.slice(looseJsonStart, looseJsonEnd + 1)
    : "";
  const candidatesToParse = [fencedJson, looseJson, trimmed].filter((candidate): candidate is string => Boolean(candidate));

  for (const jsonText of candidatesToParse) {
    try {
      const parsed = JSON.parse(jsonText) as {
        candidates?: Array<{ url?: string; title?: string; snippet?: string }>;
      };
      return (parsed.candidates || [])
        .filter((candidate) => candidate.url)
        .map((candidate) => ({
          link: candidate.url,
          title: candidate.title,
          snippet: candidate.snippet,
          displayLink: candidate.url ? domainFromUrl(candidate.url) : undefined,
        }));
    } catch {
      // Try the next extraction strategy.
    }
  }

  try {
    const urlMatches = Array.from(trimmed.matchAll(/https?:\/\/[^\s"',)]+/g));
    return urlMatches.map((match) => ({
      link: match[0],
      title: domainFromUrl(match[0]),
      displayLink: domainFromUrl(match[0]),
    }));
  } catch {
    return [];
  }
}

async function resolveVertexRedirectUrl(url: string): Promise<string> {
  if (!domainFromUrl(url).endsWith("vertexaisearch.cloud.google.com")) return url;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });
    const resolved = normalizeUrl(response.url || url);
    return domainFromUrl(resolved).endsWith("vertexaisearch.cloud.google.com") ? url : resolved;
  } catch {
    return url;
  }
}

async function runVertexGroundedSearch(listing: IntelListingListItem): Promise<GoogleSearchItem[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_AI_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_AI_LOCATION || "global";
  const model = process.env.VERTEX_AI_MODEL || "gemini-2.5-flash";
  if (!project) {
    throw new Error("Vertex AI resolver requires GOOGLE_CLOUD_PROJECT or VERTEX_AI_PROJECT_ID.");
  }

  const accessToken = await getVertexAccessToken();
  const endpointLocation = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const endpoint = `https://${endpointLocation}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildVertexPrompt(listing) }],
        },
      ],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1600,
      },
    }),
  });
  const data = (await response.json()) as VertexGenerateContentResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Vertex grounded search failed with ${response.status}`);
  }

  const byUrl = new Map<string, GoogleSearchItem>();
  for (const candidate of data.candidates || []) {
    const text = candidate.content?.parts?.map((part) => part.text || "").join("\n") || "";
    for (const item of parseVertexJsonCandidates(text)) {
      if (!item.link) continue;
      const resolvedUrl = await resolveVertexRedirectUrl(normalizeUrl(item.link));
      if (domainFromUrl(resolvedUrl).endsWith("vertexaisearch.cloud.google.com")) continue;
      byUrl.set(resolvedUrl, {
        ...item,
        link: resolvedUrl,
        snippet: cleanSnippet(item.snippet) || undefined,
        displayLink: domainFromUrl(resolvedUrl, item.displayLink),
      });
    }
    for (const chunk of candidate.groundingMetadata?.groundingChunks || []) {
      if (!chunk.web?.uri) continue;
      const url = await resolveVertexRedirectUrl(normalizeUrl(chunk.web.uri));
      if (domainFromUrl(url).endsWith("vertexaisearch.cloud.google.com")) continue;
      byUrl.set(url, {
        link: url,
        title: chunk.web.title,
        snippet: cleanSnippet(text) || undefined,
        displayLink: domainFromUrl(url),
      });
    }
  }

  return Array.from(byUrl.values());
}

function getConfiguredProviders(): ResolverProviderName[] {
  const preferred = (process.env.PUBLIC_LINK_RESOLVER_PROVIDER || "auto").toLowerCase();
  const providers: ResolverProviderName[] = [];
  const vertexConfigured = isVertexConfigured();
  const googleConfigured = Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX);

  if (preferred === "vertex") {
    if (vertexConfigured) providers.push("vertex");
    return providers;
  }
  if (preferred === "google") {
    if (googleConfigured) providers.push("google");
    return providers;
  }

  if (vertexConfigured) providers.push("vertex");
  if (googleConfigured) providers.push("google");
  return providers;
}

function toCandidateMap(listing: IntelListingListItem, items: GoogleSearchItem[]) {
  const byUrl = new Map<string, UpsertIntelPublicLinkCandidateInput>();
  for (const item of items) {
    if (!item.link) continue;
    const candidateUrl = normalizeUrl(item.link);
    const confidence = scoreCandidate(listing, item);
    if (confidence < MIN_PERSISTED_CONFIDENCE) continue;
    const candidate = {
      candidateUrl,
      domain: domainFromUrl(candidateUrl, item.displayLink),
      title: item.title || null,
      snippet: cleanSnippet(item.snippet),
      confidence,
      source: "resolver" as const,
    };
    const existing = byUrl.get(candidateUrl);
    if (!existing || candidate.confidence > existing.confidence) {
      byUrl.set(candidateUrl, candidate);
    }
  }
  return byUrl;
}

export async function resolvePublicLinkCandidates(listing: IntelListingListItem): Promise<PublicLinkResolverResult> {
  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    return {
      status: "not_configured",
      message:
        "Search provider not configured. Set Vertex AI credentials or GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX to enable public listing resolution.",
      candidates: [],
    };
  }

  const queries = buildQueries(listing);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const byUrl = new Map<string, UpsertIntelPublicLinkCandidateInput>();
      if (provider === "vertex") {
        for (const [url, candidate] of toCandidateMap(listing, await runVertexGroundedSearch(listing))) {
          byUrl.set(url, candidate);
        }
      } else {
        const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const cx = process.env.GOOGLE_SEARCH_CX;
        if (!apiKey || !cx) continue;
        for (const query of queries) {
          for (const [url, candidate] of toCandidateMap(listing, await runGoogleSearch(query, apiKey, cx))) {
            const existing = byUrl.get(url);
            if (!existing || candidate.confidence > existing.confidence) {
              byUrl.set(url, candidate);
            }
          }
        }
      }

      const candidates = Array.from(byUrl.values())
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 8);

      return {
        status: "resolved",
        message:
          candidates.length > 0
            ? `High-confidence public link candidates resolved with ${provider}. Approve only after opening the source.`
            : `No high-confidence candidates found with ${provider}. Add the broker link manually instead of spending more search attempts.`,
        candidates,
        queries: provider === "google" ? queries : [buildVertexPrompt(listing)],
      };
    } catch (error) {
      errors.push(`${provider}: ${(error as Error)?.message || String(error)}`);
    }
  }

  throw new Error(`Public link resolver failed. ${errors.join(" | ")}`);
}
