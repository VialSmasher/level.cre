import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractSurveyFactsFromBuffer } from "../src/modules/industrial-intel/surveySyncExtraction";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: tsx scripts/extract-surveysync-file.ts <pdf-path>");
  process.exit(1);
}

const buffer = await readFile(filePath);
const result = await extractSurveyFactsFromBuffer(buffer, {
  contentType: "application/pdf",
  fileName: basename(filePath),
  sourceAssetId: "local-test",
});

console.log(JSON.stringify({
  title: result.title,
  address: result.address,
  market: result.market,
  submarket: result.submarket,
  assetType: result.assetType,
  listingType: result.listingType,
  textLength: result.textLength,
  facts: result.facts,
  textSample: result.textSample,
}, null, 2));
