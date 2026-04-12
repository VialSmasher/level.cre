import { PDFParse } from 'pdf-parse';

export type ManualIntelListingPreview = {
  sourceUrl: string;
  title: string | null;
  brochureUrl: string | null;
  address: string | null;
  market: string | null;
  submarket: string | null;
  listingType: string | null;
  availableSf: number | null;
};

function cleanText(value?: string | null): string {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirst(pattern: RegExp, text: string): string | null {
  const match = text.match(pattern);
  return cleanText(match?.[1] || null) || null;
}

function resolveUrl(baseUrl: string, href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function inferListingType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('sublease')) return 'sublease';
  if (lower.includes('for sale') || lower.includes('sale')) return 'sale';
  if (lower.includes('for lease') || lower.includes('lease')) return 'lease';
  return null;
}

function inferAvailableSf(text: string): number | null {
  const match = text.match(/([0-9][0-9,]*)\s*(?:sf|sq\.? ?ft)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function inferAddress(text: string): string | null {
  const normalized = cleanText(text);
  const match = normalized.match(/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Street|St\b|Avenue|Ave\b|Road|Rd\b|Drive|Dr\b|Boulevard|Blvd\b|Trail|Way)\b[^.\n]*/i);
  return match ? cleanText(match[0]) : null;
}

async function extractBrochureText(brochureUrl: string | null): Promise<string> {
  if (!brochureUrl) return '';
  try {
    const parser = new PDFParse({ url: brochureUrl });
    const result = await parser.getText();
    await parser.destroy();
    return cleanText(result.text || '');
  } catch {
    return '';
  }
}

export async function previewManualIntelListing(sourceUrl: string): Promise<ManualIntelListingPreview> {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VialIndustrialIntel/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
  }

  const html = await response.text();
  const title =
    extractFirst(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, html) ||
    extractFirst(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i, html) ||
    extractFirst(/<title>(.*?)<\/title>/i, html);

  const brochureHref =
    extractFirst(/<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/i, html) ||
    extractFirst(/<meta[^>]+content=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i, html);

  const address =
    extractFirst(/<meta[^>]+property=["']og:street-address["'][^>]+content=["']([^"']+)["']/i, html) ||
    extractFirst(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+?\d{1,5}[^"']+)/i, html);

  const brochureUrl = resolveUrl(sourceUrl, brochureHref);
  const brochureText = await extractBrochureText(brochureUrl);
  const pageText = `${title || ''} ${extractFirst(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) || ''} ${brochureText}`;

  return {
    sourceUrl,
    title,
    brochureUrl,
    address: address || inferAddress(brochureText),
    market: pageText.toLowerCase().includes('edmonton') ? 'Edmonton Metro' : null,
    submarket: pageText.toLowerCase().includes('acheson') ? 'Acheson' : null,
    listingType: inferListingType(pageText),
    availableSf: inferAvailableSf(pageText),
  };
}
