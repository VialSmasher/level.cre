import test from "node:test";
import assert from "node:assert/strict";

import { extractSurveyFactsFromText, type SurveySyncExtractionResult } from "./surveySyncExtraction";

function textFact(result: SurveySyncExtractionResult, factKey: string): string | null {
  return result.facts.find((fact) => fact.factKey === factKey)?.valueText || null;
}

function numberFact(result: SurveySyncExtractionResult, factKey: string): number | null {
  return result.facts.find((fact) => fact.factKey === factKey)?.valueNumber || null;
}

test("extractSurveyFactsFromText prefers flyer filename addresses over traffic-count copy", () => {
  const result = extractSurveyFactsFromText(
    "Skyline Westpoint 111 Avenue & 178 Street Edmonton, AB Exposure to over 28,600 vehicles per day Large marshalling areas between buildings. 28' clear ceiling heights. Total Building Area 186,872 SF Area Available 12,102 sf Loading 2-Dock with levellers (10' x 8') Zoning IM",
    { fileName: "Westpoint Business Park - 9927 178 Street NW - Avison Young.pdf" },
  );

  assert.equal(result.address, "9927 178 Street NW");
  assert.equal(textFact(result, "location_description"), "111 Avenue & 178 Street Edmonton, AB");
  assert.equal(numberFact(result, "clear_height_ft"), 28);
  assert.equal(textFact(result, "loading")?.includes("Zoning"), false);
});

test("extractSurveyFactsFromText captures reduced sublease economics and short zoning codes", () => {
  const result = extractSurveyFactsFromText(
    "High exposure office/warehouse facility for sublease 6316 Roper Road NW Edmonton, AB LEASE RATE REDUCED: $7.95 PSF Building Area 10,420 SF Zoning IB Clear Height 24' Loading (1) 8'x10' Dock with hydraulic lift (1) 12'x16' Ramp to Grade Power 250 Amp Lease Rate $10.25 PSF",
    { fileName: "Colliers 6316 Roper Road Sublease 10K SF.pdf" },
  );

  assert.equal(result.address, "6316 Roper Road");
  assert.equal(result.listingType, "sublease");
  assert.equal(textFact(result, "lease_rate"), "$7.95 PSF");
  assert.equal(textFact(result, "zoning"), "IB");
  assert.equal(numberFact(result, "clear_height_ft"), 24);
  assert.equal(textFact(result, "loading")?.includes("Power"), false);
});

test("extractSurveyFactsFromText captures asking rates in office-style CBRE brochures", () => {
  const result = extractSurveyFactsFromText(
    "PEACE HILLS INSURANCE BUILDING 10709 Jasper Avenue | Edmonton, AB Asking Rate $14.00 per sq. ft. Additional Rent $12.98 per sq. ft. Suite 501 5,781 sq. ft.",
    { fileName: "Westcor Bldg & Peacehills Option - CBRE Brochures.pdf" },
  );

  assert.equal(result.address, "10709 Jasper Avenue");
  assert.equal(textFact(result, "lease_rate"), "$14.00 per sq. ft.");
});

test("extractSurveyFactsFromText classifies freestanding building flyers with land as building assets", () => {
  const result = extractSurveyFactsFromText(
    "8,612 sq.ft.+/- freestanding showroom/warehouse building on 2.11 acres. Corner site with exposure to 25,000 vehicles per day on 149 Street. RATE REDUCED! NOW: $14/SF Two 12'x12' grade loading doors LEASE TERM 3 - 10 years",
    { fileName: "14820 123 Avenue NW - NAI Commercial.pdf" },
  );

  assert.equal(result.address, "14820 123 Avenue NW");
  assert.equal(result.assetType, "building");
  assert.equal(numberFact(result, "building_size_sf"), 8612);
  assert.equal(numberFact(result, "land_size_acres"), 2.11);
  assert.equal(textFact(result, "lease_rate"), "$14/SF");
  assert.equal(textFact(result, "loading")?.includes("LEASE TERM"), false);
});

test("extractSurveyFactsFromText prioritizes municipal address over broker office boilerplate", () => {
  const result = extractSurveyFactsFromText(
    "royalparkrealty.com #201, 9038 51 Avenue NW Edmonton, AB T6E 5X4 FOR LEASE NISKU INDUSTRIAL OFFICE & SHOP 501 14 Avenue, Nisku, AB HIGHLIGHTS MUNICIPAL ADDRESS 501-14 Avenue, Nisku, AB 10,796 sq ft +/- stand alone office/shop with cranes on 1.25 acres +/- ZONING GI (General Industrial) CLEAR HEIGHT 23' LEASE RATE $16.00/sq ft",
    { fileName: "For-Lease-Nisku-Industrial-Office-Shop-1.pdf" },
  );

  assert.equal(result.address, "501-14 Avenue, Nisku");
  assert.equal(result.market, "Nisku");
  assert.equal(result.assetType, "building");
  assert.equal(numberFact(result, "building_size_sf"), 10796);
});

test("extractSurveyFactsFromText keeps land intersection flyers from becoming broker office buildings", () => {
  const result = extractSurveyFactsFromText(
    "royalparkrealty.com #201, 9038 51 Avenue NW Edmonton, AB T6E 5X4 Rare 3.58 acre +/- parcel for sale in Strathcona County. IM (Medium Industrial) zoning allows for a variety of uses. FOR SALE 3.58 ACRES IN STRATHCONA COUNTY 13 Street & 90 Avenue, Strathcona County, AB MUNICIPAL ADDRESS 13 Street & 90 Avenue, Strathcona County PRICE REDUCED! Price $785,000.00",
    { fileName: "13-Street-90-Avenue_For-Sale-3.pdf" },
  );

  assert.equal(result.address, null);
  assert.equal(textFact(result, "location_description"), "13 Street & 90 Avenue");
  assert.equal(result.assetType, "land");
  assert.equal(textFact(result, "zoning"), "IM");
});

test("extractSurveyFactsFromText handles Red Deer lease ranges and unit size ranges", () => {
  const result = extractSurveyFactsFromText(
    "7719 EDGAR INDUSTRIAL DRIVE RED DEER, AB FOR LEASE LOCATION Edgar Industrial Park LEASE RATES $12.00 PSF - $13.00 PSF ZONING I1 - Industrial (Business Service) District UNIT SIZES 4,067 SF - 9,705 SF",
    { fileName: "Brochure_-7719_Edgar_v7.pdf" },
  );

  assert.equal(result.address, "7719 EDGAR INDUSTRIAL DRIVE");
  assert.equal(result.market, "Red Deer");
  assert.equal(textFact(result, "lease_rate"), "$12.00 PSF");
  assert.equal(numberFact(result, "building_size_sf"), null);
  assert.equal(numberFact(result, "available_size_sf"), 9705);
});
