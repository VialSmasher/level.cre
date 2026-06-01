import type { NormalizedIntelListingRecord } from '../types';

const USER_AGENT = 'Mozilla/5.0 (compatible; VialIndustrialIntel/1.0)';
const TIMEOUT_MS = 30000;
const SEARCH_URL = 'https://cwedm.com/wp-json/wp/v2/search';
const DETAIL_URL = 'https://cwedm.com/wp-json/wp/v2/properties';
const INDUSTRIAL_SEARCH_TERMS = ['industrial', 'warehouse', 'shop', 'yard'];
const CITY_LABELS = [
  'Fort Saskatchewan',
  'Sherwood Park',
  'Strathcona County',
  'Sturgeon County',
  'Leduc County',
  'Grande Prairie',
  'Fort McMurray',
  'Red Deer',
  'Edmonton',
  'Acheson',
  'Nisku',
  'Leduc',
  'Edson',
  'Barrhead',
  'Morinville',
  'Bonnyville',
  'Warburg',
  'High Prairie',
  'Cold Lake',
  'Camrose',
  'Lloydminster',
] as const;

type CwedmSearchResult = {
  id: number;
  title: string;
  url: string;
  subtype: string;
};

type CwedmPropertyDetail = {
  id: number;
  date?: string;
  modified?: string;
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  yoast_head_json?: {
    og_description?: string;
    canonical?: string;
  };
};

function decodeHtml(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-');
}

function cleanText(text?: string | null): string {
  return decodeHtml(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const num = Number(value.replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function parseAvailableSf(text: string): number | null {
  const patterns = [
    /available(?:\s+size|\s+sf|\s+\(sf\))?\s*[:\-]?\s*([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft)/i,
    /building(?:\s+size|\s+total)?\s*[:\-]?\s*([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft)/i,
    /features\s+([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft)/i,
    /([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = parseNumber(match?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parseLandAcres(text: string): number | null {
  const patterns = [
    /land\s+size\s*\(?acres?\)?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /site\s+size\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*acres?/i,
    /on\s+([0-9]+(?:\.[0-9]+)?)\s*acres?/i,
    /([0-9]+(?:\.[0-9]+)?)\s*acres?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = parseNumber(match?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parseCurrency(text: string): number | null {
  const patterns = [
    /price\s*[:\-]?\s*\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /sale\s+price\s*[:\-]?\s*\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /\$\s*([0-9][0-9,]{4,}(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = parseNumber(match?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parsePricePerAcre(text: string): number | null {
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/|per\s+)acre/i);
  return parseNumber(match?.[1]);
}

function inferCity(...parts: Array<string | null | undefined>): string | null {
  const combined = parts.filter(Boolean).join(' ').toLowerCase();
  for (const label of CITY_LABELS) {
    if (combined.includes(label.toLowerCase())) return label;
  }
  return null;
}

function inferListingType(title: string, description: string): string {
  const combined = `${title} ${description}`.toLowerCase();
  if (combined.includes('sublease') || combined.includes('sub-lease')) return 'sublease';
  if (combined.includes('lease') && combined.includes('sale')) return 'sale';
  if (combined.includes('sale')) return 'sale';
  return 'lease';
}

function inferStatus(title: string, description: string): string {
  const combined = `${title} ${description}`.toLowerCase();
  if (combined.includes('leased')) return 'leased';
  if (combined.includes('sold')) return 'sold';
  if (combined.includes('pending')) return 'pending';
  return 'active';
}

function inferAssetType(title: string, description: string): string {
  const combined = `${title} ${description}`.toLowerCase();
  if (combined.includes('industrial land') || combined.includes('development land') || combined.includes('land for')) {
    return 'land';
  }
  if (/\b(building|warehouse|bay|bays|shop|office)\b/.test(combined)) return 'building';
  if (combined.includes('yard') && !combined.includes('building')) return 'yard';
  return 'building';
}

function isIndustrial(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  if (/\bindustrial\b/.test(combined)) return true;
  return [/\bwarehouse\b/, /\byard\b/, /\bshop\b/, /\bmanufacturing\b/, /\bdistribution\b/].some((pattern) =>
    pattern.test(combined),
  );
}

function inferAddress(title: string, description: string, city: string | null): string | null {
  const combined = `${title}. ${description}`;
  const explicitAddress =
    combined.match(/\bat\s+([0-9][A-Za-z0-9 .#'&/-]+?)\s+in\s+[A-Z][A-Za-z .'-]+/i)?.[1] ||
    combined.match(/\b([0-9][A-Za-z0-9 .#'&/-]+?(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Trail|Way|Crescent|Cres\.?|Boulevard|Blvd\.?|Range Road|RGE RD)[A-Za-z0-9 .#'&/-]*)\b/i)?.[1];

  if (explicitAddress) {
    const cleaned = cleanText(explicitAddress).replace(/[,.]$/, '');
    if (cleaned.length > 80) return null;
    return city && !cleaned.toLowerCase().includes(city.toLowerCase()) ? `${cleaned}, ${city}, AB` : cleaned;
  }

  return null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverIndustrialProperties(): Promise<CwedmSearchResult[]> {
  const byId = new Map<number, CwedmSearchResult>();

  for (const term of INDUSTRIAL_SEARCH_TERMS) {
    for (let page = 1; page <= 5; page += 1) {
      const url = `${SEARCH_URL}?search=${encodeURIComponent(term)}&subtype=rem_property&per_page=100&page=${page}`;
      let results: CwedmSearchResult[];
      try {
        results = await fetchJson<CwedmSearchResult[]>(url);
      } catch (error) {
        if (page > 1) break;
        throw error;
      }

      for (const result of results) {
        if (result.subtype === 'rem_property' && result.url?.includes('/property/')) {
          byId.set(result.id, result);
        }
      }

      if (results.length < 100) break;
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.id - a.id);
}

async function fetchPropertyDetail(id: number): Promise<CwedmPropertyDetail> {
  return fetchJson<CwedmPropertyDetail>(`${DETAIL_URL}/${id}`);
}

function toRecord(detail: CwedmPropertyDetail, fallback: CwedmSearchResult): Omit<NormalizedIntelListingRecord, 'contentHash'> | null {
  const title = cleanText(detail.title?.rendered || fallback.title);
  const content = cleanText(detail.content?.rendered);
  const excerpt = cleanText(detail.excerpt?.rendered);
  const description = cleanText(detail.yoast_head_json?.og_description || content || excerpt);

  if (!isIndustrial(title, description)) return null;

  const city = inferCity(title) || inferCity(description);
  const address = inferAddress(title, description, city);
  const listingType = inferListingType(title, description);
  const assetType = inferAssetType(title, description);
  const availableSf = parseAvailableSf(description);
  const landAcres = parseLandAcres(description);
  const url = detail.link || detail.yoast_head_json?.canonical || fallback.url;

  return {
    sourceRecordKey: `wp:${detail.id || fallback.id}`,
    externalId: String(detail.id || fallback.id),
    status: inferStatus(title, description),
    listingType,
    assetType,
    title: title || address || url,
    address,
    market: city,
    submarket: city,
    lat: null,
    lng: null,
    availableSf,
    landAcres,
    totalPrice: listingType === 'sale' ? parseCurrency(description) : null,
    pricePerAcre: parsePricePerAcre(description),
    minDivisibleSf: null,
    clearHeightFt: null,
    brochureUrl: null,
    sourceUrl: url,
    rawPayload: {
      discovery: 'wp_rest_search',
      wpId: detail.id || fallback.id,
      date: detail.date ?? null,
      modified: detail.modified ?? null,
      slug: detail.slug ?? null,
      title,
      description,
      address,
      city,
      availableSf,
      landAcres,
      listingType,
      assetType,
      status: inferStatus(title, description),
    },
  };
}

export async function runCwedmSource(): Promise<Array<Omit<NormalizedIntelListingRecord, 'contentHash'>>> {
  const discovered = await discoverIndustrialProperties();
  const records: Array<Omit<NormalizedIntelListingRecord, 'contentHash'>> = [];

  for (const result of discovered) {
    try {
      const detail = await fetchPropertyDetail(result.id);
      const record = toRecord(detail, result);
      if (record) records.push(record);
    } catch {
      const title = cleanText(result.title);
      if (!isIndustrial(title, '')) continue;
      records.push({
        sourceRecordKey: `wp:${result.id}`,
        externalId: String(result.id),
        status: inferStatus(title, ''),
        listingType: inferListingType(title, ''),
        assetType: inferAssetType(title, ''),
        title,
        address: null,
        market: inferCity(title),
        submarket: inferCity(title),
        lat: null,
        lng: null,
        availableSf: null,
        landAcres: null,
        totalPrice: null,
        pricePerAcre: null,
        minDivisibleSf: null,
        clearHeightFt: null,
        brochureUrl: null,
        sourceUrl: result.url,
        rawPayload: {
          discovery: 'wp_rest_search_fallback',
          wpId: result.id,
          title,
        },
      });
    }
  }

  return records;
}
