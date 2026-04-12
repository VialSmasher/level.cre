import type { NormalizedIntelListingRecord } from '../types';

const USER_AGENT = 'Mozilla/5.0 (compatible; VialIndustrialIntel/1.0)';
const TIMEOUT_MS = 30000;
const DISCOVER_URL = 'https://cwedm.com/';
const PROPERTY_URL_PATTERN = /href=["'](https:\/\/cwedm\.com\/property\/[^"']+)["']/gi;
const CITY_LABELS = [
  'Fort Saskatchewan',
  'Sherwood Park',
  'Strathcona County',
  'Edmonton',
  'Nisku',
  'Leduc',
  'Leduc County',
] as const;

function cleanText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirst(pattern: RegExp, text: string): string {
  const match = text.match(pattern);
  return cleanText(match?.[1]);
}

function normalizeSize(value: string): string {
  return cleanText(value).replace(/sq\s*ft/gi, 'SF').replace(/ft²/gi, 'SF');
}

function parseAvailableSf(size: string): number | null {
  const sfMatch = size.match(/([0-9][0-9,]*)\s*SF/i);
  if (!sfMatch) return null;
  const value = Number(sfMatch[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
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
  return combined.includes('sale') ? 'sale' : 'lease';
}

function isIndustrial(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return ['industrial', 'warehouse', 'yard', 'shop'].some((token) => combined.includes(token));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function runCwedmSource(): Promise<Array<Omit<NormalizedIntelListingRecord, 'contentHash'>>> {
  const homePage = await fetchText(DISCOVER_URL);
  const urls = Array.from(homePage.matchAll(PROPERTY_URL_PATTERN)).map((match) => match[1]);
  const uniqueUrls = Array.from(new Set(urls)).sort();

  const records: Array<Omit<NormalizedIntelListingRecord, 'contentHash'>> = [];

  for (const url of uniqueUrls) {
    const page = await fetchText(url);
    const title =
      extractFirst(/<meta property="og:title" content="([^"]+)"/i, page) ||
      extractFirst(/<title>(.*?)<\/title>/i, page);
    const description =
      extractFirst(/<meta property="og:description" content="([^"]+)"/i, page) ||
      extractFirst(/<meta name="description" content="([^"]+)"/i, page);
    let address =
      extractFirst(/property_address\s*:\s*"([^"]+)"/i, page) ||
      extractFirst(/"address":"([^"]+)"/i, page);

    if (!address) {
      address = extractFirst(/<title>.*? ([0-9][^<]+?) - /i, page);
    }

    if (!isIndustrial(title, description)) {
      continue;
    }

    const normalizedSize = normalizeSize(
      extractFirst(/([0-9,]+\s*SF)/i, description) || extractFirst(/([0-9,.]+\s*acres?)/i, description),
    );

    records.push({
      sourceRecordKey: url.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
      externalId: null,
      status: 'active',
      listingType: inferListingType(title, description),
      title: title || address || url,
      address: address || null,
      market: inferCity(title, description, address),
      submarket: null,
      lat: null,
      lng: null,
      availableSf: parseAvailableSf(normalizedSize),
      minDivisibleSf: null,
      clearHeightFt: null,
      brochureUrl: null,
      sourceUrl: url,
      rawPayload: {
        discoverUrl: DISCOVER_URL,
        title,
        description,
        address,
        size: normalizedSize || null,
      },
    });
  }

  return records;
}
