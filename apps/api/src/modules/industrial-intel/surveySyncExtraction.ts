import { PDFParse } from "pdf-parse";
import type { UpsertIntelDossierFactInput } from "./repo";

export type SurveySyncExtractionResult = {
  contentType: string;
  textLength: number;
  title: string | null;
  address: string | null;
  market: string | null;
  submarket: string | null;
  assetType: string | null;
  listingType: string | null;
  facts: UpsertIntelDossierFactInput[];
  textSample: string;
};

function cleanText(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function numberFromMatch(match?: RegExpMatchArray | null): number | null {
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function firstMatchText(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanText(match?.[1] || null);
    if (value) return value;
  }
  return null;
}

function firstMatchNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const value = numberFromMatch(text.match(pattern));
    if (value !== null) return value;
  }
  return null;
}

function inferAddress(text: string): string | null {
  return firstMatchText(text, [
    /\b(\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Trail|Way|Lane|Ln\.?)\s*(?:NW|NE|SW|SE)?(?:,\s*[A-Za-z .]+)?)/i,
    /\b(\d{2,6}\s+Parsons\s+Road\s*(?:NW|NE|SW|SE)?)/i,
  ]);
}

function inferTitle(text: string, address: string | null, fileName?: string | null): string | null {
  if (address) return address;
  const cleanedFileName = cleanText(fileName?.replace(/\.[a-z0-9]+$/i, "") || "");
  if (cleanedFileName) return cleanedFileName;
  return firstMatchText(text, [/FOR (?:SALE|LEASE)\s+(.{8,80}?)(?:\s{2,}| \| |,)/i]);
}

function inferMarket(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("edmonton")) return "Edmonton Metro";
  if (lower.includes("nisku")) return "Nisku";
  if (lower.includes("acheson")) return "Acheson";
  return null;
}

function inferSubmarket(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("southeast edmonton") || lower.includes("south east edmonton")) return "Southeast Edmonton";
  if (lower.includes("south edmonton")) return "South Edmonton";
  if (lower.includes("northwest edmonton") || lower.includes("north west edmonton")) return "Northwest Edmonton";
  if (lower.includes("parsons")) return "Parsons Industrial";
  return null;
}

function inferAssetType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("land") && lower.includes("acre")) return "land";
  if (lower.includes("yard")) return "yard";
  if (lower.includes("warehouse") || lower.includes("industrial") || lower.includes("office")) return "building";
  return null;
}

function inferListingType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("industrial | sale") || lower.includes("for sale") || lower.includes("sale building")) return "sale";
  if (lower.includes("for lease") || lower.includes("lease rate")) return "lease";
  return null;
}

function addTextFact(
  facts: UpsertIntelDossierFactInput[],
  factKey: string,
  label: string,
  valueText: string | null,
  sourceAssetId: string | null,
  confidence = 70,
) {
  if (!valueText) return;
  facts.push({
    sourceAssetId,
    factKey,
    label,
    valueText,
    confidence,
    status: "proposed",
    source: "surveysync_pdf",
  });
}

function addNumberFact(
  facts: UpsertIntelDossierFactInput[],
  factKey: string,
  label: string,
  valueNumber: number | null,
  sourceAssetId: string | null,
  confidence = 70,
) {
  if (valueNumber === null) return;
  facts.push({
    sourceAssetId,
    factKey,
    label,
    valueNumber,
    confidence,
    status: "proposed",
    source: "surveysync_pdf",
  });
}

export function extractSurveyFactsFromText(
  text: string,
  options: { fileName?: string | null; sourceAssetId?: string | null } = {},
): SurveySyncExtractionResult {
  const normalized = cleanText(text);
  const address = inferAddress(normalized);
  const title = inferTitle(normalized, address, options.fileName);
  const market = inferMarket(normalized);
  const submarket = inferSubmarket(normalized);
  const assetType = inferAssetType(normalized);
  const listingType = inferListingType(normalized);
  const sourceAssetId = options.sourceAssetId || null;

  const facts: UpsertIntelDossierFactInput[] = [];
  addTextFact(facts, "address", "Address", address, sourceAssetId, 88);
  addTextFact(facts, "market", "Market", market, sourceAssetId, 65);
  addTextFact(facts, "submarket", "Submarket", submarket, sourceAssetId, 62);
  addTextFact(facts, "asset_type", "Asset Type", assetType, sourceAssetId, 65);
  addTextFact(facts, "listing_type", "Listing Type", listingType, sourceAssetId, 70);

  addNumberFact(facts, "building_size_sf", "Building Size", firstMatchNumber(normalized, [
    /(?:total area|total building area)\s*[:\-]?\s*(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s*[–-]\s*total area/i,
    /(?:building size|building area|building)\s*[:\-]?\s*(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s+(?:building|warehouse|office)/i,
  ]), sourceAssetId, 72);

  addNumberFact(facts, "available_size_sf", "Available Size", firstMatchNumber(normalized, [
    /(?:available|premises|space available)\s*[:\-]?\s*(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:±\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s+(?:available|for lease)/i,
  ]), sourceAssetId, 70);

  addNumberFact(facts, "land_size_acres", "Land Size", firstMatchNumber(normalized, [
    /(?:site size|land size|site area|land area)\s*[:\-]?\s*(?:±\s*)?([0-9]+(?:\.[0-9]+)?)\s*ac(?:res?)?\.?/i,
    /(?:±\s*)?([0-9]+(?:\.[0-9]+)?)\s*ac(?:res?)?\.?\s+(?:site|yard|land)/i,
  ]), sourceAssetId, 72);

  addNumberFact(facts, "clear_height_ft", "Clear Height", firstMatchNumber(normalized, [
    /(?:clear height|ceiling height)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:'|ft|feet)/i,
    /(?:ceiling height|clear height)\s*[:\-]?\s*up to\s*([0-9]+(?:\.[0-9]+)?)[’']?\s*clear/i,
  ]), sourceAssetId, 70);

  addTextFact(facts, "zoning", "Zoning", firstMatchText(normalized, [
    /(?:zoning|zone)\s*[:\-]?\s*([A-Z0-9 \-/–]+?(?:Industrial|Commercial|Business|District)?)(?:\s{2,}| Loading| Ceiling| Power|$)/i,
  ]), sourceAssetId, 68);

  addTextFact(facts, "loading", "Loading", firstMatchText(normalized, [
    /Loading(?:\s*\([^)]+\))?\s*[:\-]?\s*((?:\([0-9]+\)|[0-9]+)?.{0,120}?(?:Dock|Grade|Ramp).{0,80}?)(?:\s+Ceiling|\s+Power|\s+Additional|$)/i,
    /((?:[0-9]+\s*)?(?:dock|grade)(?:\s+loading)?(?:\s+doors?)?(?:\s*(?:and|,)\s*(?:[0-9]+\s*)?(?:dock|grade)(?:\s+loading)?(?:\s+doors?)?)?)/i,
  ]), sourceAssetId, 62);

  addTextFact(facts, "lease_rate", "Lease Rate", firstMatchText(normalized, [
    /(?:lease rate|asking rent|net rent)\s*[:\-]?\s*(\$?\s*[0-9][0-9,.]*\s*(?:\/|per)?\s*(?:sf|sq\.?\s*ft\.?)?)/i,
  ]), sourceAssetId, 68);

  addTextFact(facts, "asking_price", "Asking Price", firstMatchText(normalized, [
    /(?:asking price|purchase price|sale price|price)\s*[:\-]?\s*(\$\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ]), sourceAssetId, 68);

  const summary = firstMatchText(normalized, [
    /(?:property highlights?|highlights?)\s*[:\-]?\s*(.{40,400})/i,
  ]);
  addTextFact(facts, "property_summary", "Property Summary", summary, sourceAssetId, 55);

  return {
    contentType: "text/plain",
    textLength: normalized.length,
    title,
    address,
    market,
    submarket,
    assetType,
    listingType,
    facts,
    textSample: normalized.slice(0, 1200),
  };
}

export async function extractSurveyFactsFromBuffer(
  buffer: Buffer,
  options: { contentType: string; fileName?: string | null; sourceAssetId?: string | null },
): Promise<SurveySyncExtractionResult> {
  if (options.contentType !== "application/pdf") {
    throw new Error(`SurveySync extraction currently supports PDF files only. Received ${options.contentType}.`);
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      ...extractSurveyFactsFromText(result.text || "", options),
      contentType: options.contentType,
    };
  } finally {
    await parser.destroy();
  }
}
