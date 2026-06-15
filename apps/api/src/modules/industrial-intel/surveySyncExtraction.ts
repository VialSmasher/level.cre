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
  return value
    .normalize("NFKC")
    .replace(/\u0000/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\u00b1/g, "+/-")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
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

function firstPlausibleMatchText(
  text: string,
  patterns: RegExp[],
  isPlausible: (value: string) => boolean,
): string | null {
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(globalPattern)) {
      const value = cleanText(match[1] || null);
      if (value && isPlausible(value)) return value;
    }
  }
  return null;
}

function cleanFileName(fileName?: string | null): string {
  return cleanText((fileName || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_()[\]{}]/g, " "));
}

function removeBrokerBoilerplate(text: string): string {
  return text.replace(/#201,\s*9038\s+51\s+Avenue\s+NW\s+Edmonton,\s*AB\s*T6E\s*5X4/gi, " ");
}

const streetSuffixPattern =
  "(?:Street|St\\.?|Avenue|Ave\\.?|Av\\.?|Road|Rd\\.?|Drive|Dr\\.?|Boulevard|Blvd\\.?|Trail|Way|Lane|Ln\\.?|Highway|Hwy\\.?)";

const addressPatterns = [
  new RegExp(
    `\\b(\\d{2,6}(?:\\s*-\\s*\\d{1,6})?\\s+(?:[A-Za-z0-9.'-]+\\s+){0,5}${streetSuffixPattern}\\s*(?:NW|NE|SW|SE)?(?:\\s*,\\s*[A-Za-z .]+)?)\\b`,
    "i",
  ),
];

function isPlausibleAddress(value: string): boolean {
  const lower = value.toLowerCase();
  if (!/\d/.test(value) || !new RegExp(streetSuffixPattern, "i").test(value)) return false;
  if (/vehicle|vpd|per day|for lease|for sale|exposure|marshalling|available|current configuration|acres?|price reduced/.test(lower)) {
    return false;
  }
  if (new RegExp(`^\\d{1,5}\\s+${streetSuffixPattern}(?:,\\s*[A-Za-z .]+)?$`, "i").test(value)) return false;
  const suffixCount = value.match(new RegExp(`\\b${streetSuffixPattern}\\b`, "gi"))?.length || 0;
  if (suffixCount > 1) return false;
  if (/^\s*0+\b/.test(value)) return false;
  return true;
}

function inferAddress(text: string, fileName?: string | null): string | null {
  const searchableText = removeBrokerBoilerplate(text);
  const fromFileName = firstPlausibleMatchText(cleanFileName(fileName), addressPatterns, isPlausibleAddress);
  if (fromFileName) return fromFileName;

  const municipalAddress = firstMatchText(searchableText, [
    /(?:municipal address|property address|address)\s*[:\-]?\s*(.{0,140})/i,
  ]);
  const fromMunicipalAddress = firstPlausibleMatchText(municipalAddress || "", addressPatterns, isPlausibleAddress);
  if (fromMunicipalAddress) return fromMunicipalAddress;

  return firstPlausibleMatchText(searchableText, addressPatterns, isPlausibleAddress);
}

function inferLocationDescription(text: string): string | null {
  return firstMatchText(text, [
    /\b([0-9]{2,5}(?:st|nd|rd|th)?\s+(?:Street|St\.?|Avenue|Ave\.?|Av\.?)\s*&\s*[0-9]{2,5}(?:st|nd|rd|th)?\s+(?:Street|St\.?|Avenue|Ave\.?|Av\.?)(?:\s+[A-Za-z]+(?:,\s*[A-Z]{2})?)?)/i,
  ]);
}

function inferTitle(text: string, address: string | null, fileName?: string | null): string | null {
  if (address) return address;
  const cleanedFileName = cleanFileName(fileName);
  if (cleanedFileName) return cleanedFileName;
  return firstMatchText(text, [/FOR (?:SALE|LEASE)\s+(.{8,80}?)(?:\s{2,}| \| |,)/i]);
}

function inferMarket(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("sherwood park") || lower.includes("strathcona county")) return "Sherwood Park / Strathcona County";
  if (lower.includes("nisku")) return "Nisku";
  if (lower.includes("acheson")) return "Acheson";
  if (lower.includes("red deer")) return "Red Deer";
  if (lower.includes("leduc")) return "Leduc";
  if (lower.includes("spruce grove")) return "Spruce Grove";
  if (lower.includes("edmonton")) return "Edmonton Metro";
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
  if (/parcel for sale|acres? in [a-z\s]+county|industrial land|land for sale/i.test(text)) return "land";
  const hasStrongBuildingSignal =
    /warehouse|office\s*\/\s*warehouse|office\s*\/\s*shop|office\/shop|shop|showroom|freestanding [a-z\s/]*building|stand alone [a-z\s/]*building|building area|building size|total building area|clear height|loading/i.test(
      lower,
    );
  const hasLandSignal = /\b(?:land|parcel|acres?|site)\b/i.test(lower);
  if (hasLandSignal && !hasStrongBuildingSignal) return "land";
  if (hasStrongBuildingSignal) return "building";
  if (lower.includes("yard")) return "yard";
  if ((lower.includes("land") || /\bac(?:res?)?\b/.test(lower)) && !lower.includes("building area")) return "land";
  if (lower.includes("industrial") || lower.includes("office")) return "building";
  return null;
}

function inferListingType(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("sublease")) return "sublease";
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
  const address = inferAddress(normalized, options.fileName);
  const locationDescription = inferLocationDescription(normalized);
  const title = inferTitle(normalized, address, options.fileName);
  const market = inferMarket(normalized);
  const submarket = inferSubmarket(normalized);
  const assetType = inferAssetType(normalized);
  const listingType = inferListingType(normalized);
  const sourceAssetId = options.sourceAssetId || null;

  const facts: UpsertIntelDossierFactInput[] = [];
  addTextFact(facts, "address", "Address", address, sourceAssetId, 88);
  addTextFact(facts, "location_description", "Location Description", locationDescription, sourceAssetId, 58);
  addTextFact(facts, "market", "Market", market, sourceAssetId, 65);
  addTextFact(facts, "submarket", "Submarket", submarket, sourceAssetId, 62);
  addTextFact(facts, "asset_type", "Asset Type", assetType, sourceAssetId, 65);
  addTextFact(facts, "listing_type", "Listing Type", listingType, sourceAssetId, 70);

  addNumberFact(facts, "building_size_sf", "Building Size", firstMatchNumber(normalized, [
    /(?:total area|total building area)\s*[:\-]?\s*(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s*[-]\s*total area/i,
    /(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s+building includes\b/i,
    /(?:building size|building area)\s*[:\-]?.{0,220}?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s+total\b/i,
    /(?:building size|building area|building)\s*[:\-]?\s*(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)(?:\s*\+\/-)?\s+(?:freestanding|stand alone|building|warehouse|office|showroom)/i,
  ]), sourceAssetId, 72);

  addNumberFact(facts, "available_size_sf", "Available Size", firstMatchNumber(normalized, [
    /(?:unit sizes?|available|premises|space available)\s*[:\-]?\s*(?:\+\/-\s*)?[0-9][0-9,]*\s*(?:sf|sq\.?\s*ft\.?)\s*[-–]\s*(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:available|premises|space available)\s*[:\-]?\s*(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)/i,
    /(?:\+\/-\s*)?([0-9][0-9,]*)\s*(?:sf|sq\.?\s*ft\.?)\s+(?:available|for lease)/i,
  ]), sourceAssetId, 70);

  addNumberFact(facts, "land_size_acres", "Land Size", firstMatchNumber(normalized, [
    /(?:site size|land size|site area|land area)\s*[:\-]?\s*(?:\+\/-\s*)?([0-9]+(?:\.[0-9]+)?)\s*ac(?:res?)?\.?/i,
    /(?:\+\/-\s*)?([0-9]+(?:\.[0-9]+)?)\s*ac(?:res?)?\.?\s+(?:site|yard|land)/i,
    /\bon\s+([0-9]+(?:\.[0-9]+)?)\s*ac(?:res?)?\b/i,
  ]), sourceAssetId, 72);

  addNumberFact(facts, "clear_height_ft", "Clear Height", firstMatchNumber(normalized, [
    /(?:clear height|ceiling height)\s*[:\-]?\s*(?:up to\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:'|ft|feet|clear)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:'|ft|feet)\s*(?:clear|clear ceiling|clear height|ceiling heights?)/i,
  ]), sourceAssetId, 70);

  addTextFact(facts, "zoning", "Zoning", firstMatchText(normalized, [
    /\b([A-Z]{1,8})\s*\([^)]+(?:Industrial|Business|Commercial|District)[^)]*\)\s+zoning/i,
    /(?:zoning|zone)\s*[:\-]?\s*([A-Z]{1,6}\s*-\s*[A-Za-z ]{4,48}?(?:Industrial|Commercial|Business|District))/i,
    /(?:zoning|zone)\s*[:\-]?\s*([A-Z0-9]{1,8})(?=\s+(?:Clear Height|Loading|Ceiling|Power|Operating|Lease Term|Tax|CAM|Sprinklers|$))/i,
    /(?:zoning|zone)\s*[:\-]?\s*([A-Z0-9]{1,8})\b/i,
  ]), sourceAssetId, 68);

  addTextFact(facts, "loading", "Loading", firstMatchText(normalized, [
    /Loading(?:\s*\([^)]+\))?\s*[:\-]?\s*((?:\([0-9]+\)|[0-9]+|Two|One)?.{0,160}?(?:Dock|Grade|Ramp).{0,90}?)(?=\s+(?:Ceiling|Heating|Power|Additional|Zoning|Clear Height|Lease Term|Operating Cost|Operating Costs|Tax|CAM|Sprinklers|Marshalling Area)|$)/i,
    /((?:[0-9]+\s*)?(?:dock|grade)(?:\s+loading)?(?:\s+doors?)?(?:\s*(?:and|,)\s*(?:[0-9]+\s*)?(?:dock|grade)(?:\s+loading)?(?:\s+doors?)?)?)/i,
  ]), sourceAssetId, 62);

  addTextFact(facts, "lease_rate", "Lease Rate", firstMatchText(normalized, [
    /(?:rate reduced!\s*)?now\s*[:\-]?\s*(\$?\s*[0-9][0-9,.]*\s*(?:(?:\/|per)\s*)?(?:sf|psf|sq\.?\s*ft\.?)?)/i,
    /lease rates? reduced\s*[:\-]?\s*(\$?\s*[0-9][0-9,.]*\s*(?:(?:\/|per)\s*)?(?:sf|psf|sq\.?\s*ft\.?)?)/i,
    /(?:asking rate|lease rates?|asking rent|net rent)\s*[:\-]?\s*(\$?\s*[0-9][0-9,.]*\s*(?:(?:\/|per)\s*)?(?:sf|psf|sq\.?\s*ft\.?)?)(?:\s*[-]\s*\$?\s*[0-9][0-9,.]*\s*(?:(?:\/|per)\s*)?(?:sf|psf|sq\.?\s*ft\.?)?)?/i,
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
