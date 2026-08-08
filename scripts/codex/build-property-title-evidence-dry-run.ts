import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActivityEventBatchSchema } from "../../apps/api/src/lib/activityEventService";
import { MarketRecordProposalInputSchema } from "../../apps/api/src/lib/marketRecordProposalService";
import {
  buildPropertyTitleEvidenceDryRun,
  renderPropertyTitleDryRunMarkdown,
  type EntityResolutionSnapshot,
  type PropertyAuditManifest,
  type VerifiedCoordinates,
} from "../../apps/api/src/lib/propertyTitleEvidenceAdapter";

type Args = {
  manifest?: string;
  coordinates?: string;
  resolutions?: string;
  outJson?: string;
  outMarkdown?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]) {
  const result: Args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--manifest" && next) { result.manifest = next; index += 1; }
    else if (value === "--coordinates" && next) { result.coordinates = next; index += 1; }
    else if (value === "--resolutions" && next) { result.resolutions = next; index += 1; }
    else if (value === "--out-json" && next) { result.outJson = next; index += 1; }
    else if (value === "--out-markdown" && next) { result.outMarkdown = next; index += 1; }
    else if (value === "--help" || value === "-h") {
      process.stdout.write([
        "Build a no-write Level CRE property-title evidence review artifact.",
        "",
        "Required:",
        "  --dry-run",
        "  --manifest <property-audit-manifest.json>",
        "",
        "Optional:",
        "  --coordinates <verified-coordinates-by-case.json>",
        "  --resolutions <entity-resolution-by-case.json>",
        "  --out-json <dry-run.json>",
        "  --out-markdown <dry-run.md>",
        "",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }
  if (!result.dryRun) throw new Error("This adapter requires --dry-run; it has no write mode.");
  if (!result.manifest) throw new Error("--manifest is required");
  return result;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as T;
}

async function writeOutput(filePath: string, contents: string) {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, contents, "utf8");
  return resolved;
}

const args = parseArgs(process.argv.slice(2));
const manifest = await readJson<PropertyAuditManifest>(args.manifest!);
const coordinatesByCaseId = args.coordinates
  ? await readJson<Record<string, VerifiedCoordinates>>(args.coordinates)
  : {};
const resolutionByCaseId = args.resolutions
  ? await readJson<Record<string, EntityResolutionSnapshot>>(args.resolutions)
  : {};

const dryRun = buildPropertyTitleEvidenceDryRun({
  manifest,
  coordinatesByCaseId,
  resolutionByCaseId,
});
const eventValidation = ActivityEventBatchSchema.safeParse(dryRun.eventBatch);
if (!eventValidation.success) {
  throw new Error(`Generated activity contract is invalid: ${eventValidation.error.message}`);
}
for (const proposal of dryRun.marketRecordProposals) {
  const validation = MarketRecordProposalInputSchema.safeParse(proposal);
  if (!validation.success) throw new Error(`Generated market proposal is invalid: ${validation.error.message}`);
}
const eventIds = dryRun.eventBatch.events.map((event) => event.externalEventId);
if (new Set(eventIds).size !== eventIds.length) {
  throw new Error("Generated event external IDs are not unique within the manifest");
}
const proposalIds = dryRun.marketRecordProposals.map((proposal) => proposal.externalId);
if (new Set(proposalIds).size !== proposalIds.length) {
  throw new Error("Generated proposal external IDs are not unique within the manifest");
}

const defaultStem = `property-title-evidence-dry-run-${new Date().toISOString().slice(0, 10)}`;
const jsonPath = await writeOutput(
  args.outJson || path.join("artifacts", `${defaultStem}.json`),
  `${JSON.stringify(dryRun, null, 2)}\n`,
);
const markdownPath = await writeOutput(
  args.outMarkdown || path.join("artifacts", `${defaultStem}.md`),
  renderPropertyTitleDryRunMarkdown(dryRun),
);

process.stdout.write(`${JSON.stringify({
  mode: dryRun.mode,
  summary: dryRun.summary,
  jsonPath,
  markdownPath,
}, null, 2)}\n`);
