import assert from "node:assert/strict";
import test from "node:test";

import { ActivityEventBatchSchema } from "./activityEventService";
import {
  buildPropertyTitleEvidenceDryRun,
  type PropertyAuditManifest,
} from "./propertyTitleEvidenceAdapter";

const generatedAt = "2026-08-08T18:00:00.000Z";
const titleHash = "a".repeat(64);
const corporateHash = "b".repeat(64);

function manifest(): PropertyAuditManifest {
  return {
    schemaVersion: "1",
    generatedAt,
    cases: [
      {
        case_id: "PLP-BR",
        folder_name: "B&R",
        verified_property_addresses: "16440 - 130 AVENUE NW, Edmonton, AB T5V 1J8",
        property_address_status: "municipal_verified",
        title_count: 1,
        corporate_search_count: 0,
        review_status: "municipal_verified_standalone",
      },
      {
        case_id: "PLP-CORP",
        folder_name: "Corporate lead",
        folder_address_observed: "999 Folder Guess Road",
        property_address_status: "unresolved",
        title_count: 0,
        corporate_search_count: 1,
        review_status: "corporate_only_needs_property_link",
      },
      {
        case_id: "PLP-LEGAL",
        folder_name: "Legal only",
        folder_address_observed: "123 Folder Name Avenue",
        property_address_status: "unresolved",
        title_count: 1,
        corporate_search_count: 0,
        review_status: "legal_lookup_required",
      },
    ],
    titles: [
      {
        case_id: "PLP-BR",
        source_relative_path: "B&R/title.pdf",
        source_sha256: titleHash,
        linc: "0012345678",
        title_number: "242 123 456",
        plan: "3443TR",
        block: "4",
        lot: "5",
        municipality: "Edmonton",
        municipal_address: "16440 - 130 AVENUE NW, Edmonton, AB T5V 1J8",
        legal_lookup_status: "municipal_verified",
        registered_owner: "489786 ALBERTA LTD. OF: 123 OWNER MAILING ROAD",
        title_pulled_date: "2026-08-01",
        extraction_confidence: 98,
      },
      {
        case_id: "PLP-LEGAL",
        source_relative_path: "Legal only/title.pdf",
        source_sha256: "c".repeat(64),
        linc: "0098765432",
        plan: "PLAN1",
        block: "2",
        lot: "3",
        registered_owner: "EXAMPLE OWNER LTD.",
        extraction_confidence: 90,
      },
    ],
    entities: [
      {
        case_id: "PLP-CORP",
        source_relative_path: "Corporate lead/search.pdf",
        source_sha256: corporateHash,
        legal_entity_name: "EXAMPLE INDUSTRIAL LTD.",
        corporate_access_number: "2012345678",
        search_date: "2026-08-02",
        extraction_confidence: 95,
        registered_office: "500 REGISTERED OFFICE STREET",
        records_address: "600 RECORDS OFFICE STREET",
        directors: [{ name: "Director", address: "700 DIRECTOR HOME" }],
        voting_shareholders: [{ name: "Shareholder", address: "800 SHAREHOLDER HOME" }],
      },
    ],
    evidence: [],
  };
}

test("manifest adaptation is deterministic and produces idempotent external event IDs", () => {
  const first = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  const second = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  assert.deepEqual(second, first);

  const eventIds = first.eventBatch.events.map((event) => event.externalEventId);
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.equal(first.marketRecordProposals.length, 0);
  assert.equal(ActivityEventBatchSchema.safeParse(first.eventBatch).success, true);
});

test("corporate and owner mailing addresses never become subject-property fields or metadata", () => {
  const result = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  const corporate = result.eventBatch.events.find((event) => event.eventType === "note" && event.sourceMetadata.recordKind === "corporate_search");
  const owner = result.eventBatch.events.find((event) => event.eventType === "owner_identified");

  assert.equal(corporate?.propertyAddress, null);
  assert.doesNotMatch(JSON.stringify(corporate), /REGISTERED OFFICE|RECORDS OFFICE|DIRECTOR HOME|SHAREHOLDER HOME/);
  assert.doesNotMatch(JSON.stringify(owner), /OWNER MAILING ROAD/);
});

test("folder-name-only and legal-only evidence cannot produce a map proposal", () => {
  const result = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  const legalOnly = result.cases.find((item) => item.caseId === "PLP-LEGAL");

  assert.equal(legalOnly?.group, "legal_lookup_required");
  assert.equal(legalOnly?.proposalDraft, null);
  assert.equal(legalOnly?.eventDrafts.every((event) => event.propertyAddress === null), true);
});

test("a municipally verified address remains blocked until source-backed coordinates exist", () => {
  const blocked = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  const blockedCase = blocked.cases.find((item) => item.caseId === "PLP-BR");
  assert.equal(blockedCase?.group, "verified_missing_coordinates");
  assert.match(blockedCase?.noMapMutationReason || "", /coordinates are missing/i);

  const ready = buildPropertyTitleEvidenceDryRun({
    manifest: manifest(),
    generatedAt,
    coordinatesByCaseId: {
      "PLP-BR": {
        latitude: 53.584,
        longitude: -113.605,
        sourceUrl: "https://maps.edmonton.ca/example",
        capturedAt: "2026-08-08T17:00:00.000Z",
      },
    },
  });
  const readyCase = ready.cases.find((item) => item.caseId === "PLP-BR");
  assert.equal(readyCase?.group, "proposal_ready");
  assert.equal(readyCase?.proposalDraft?.address, "16440 - 130 AVENUE NW, Edmonton, AB T5V 1J8");
  assert.deepEqual(readyCase?.proposalDraft?.legalIdentity, {
    municipality: "Edmonton",
    titleNumber: "242 123 456",
    linc: "0012345678",
    plan: "3443TR",
    block: "4",
    lot: "5",
  });
});

test("multi-parcel review status overrides stale match candidates and blocks proposals", () => {
  const input = manifest();
  input.cases.push({
    case_id: "PLP-MULTI",
    folder_name: "Two title site",
    property_address_status: "needs_review",
    title_count: 2,
    review_status: "multi_parcel_review",
    legacy_match_status: "likely_match",
    legacy_match_score: 95,
    legacy_prospect_id: "stale-candidate",
  });
  input.titles.push(
    { case_id: "PLP-MULTI", source_sha256: "d".repeat(64), title_number: "TITLE-1", plan: "P1", lot: "1" },
    { case_id: "PLP-MULTI", source_sha256: "e".repeat(64), title_number: "TITLE-2", plan: "P1", lot: "2" },
  );
  const result = buildPropertyTitleEvidenceDryRun({ manifest: input, generatedAt });
  const multi = result.cases.find((item) => item.caseId === "PLP-MULTI");
  assert.equal(multi?.group, "multi_parcel_conflict");
  assert.equal(multi?.proposalDraft, null);
});

test("verified coordinates cannot bypass missing legal and municipality identity", () => {
  const input = manifest();
  input.cases.push({
    case_id: "PLP-NO-LEGAL",
    folder_name: "Address only",
    verified_property_addresses: "100 Verified Avenue, Edmonton, AB",
    property_address_status: "municipal_verified",
    title_count: 0,
    review_status: "address_needs_verification",
  });
  const result = buildPropertyTitleEvidenceDryRun({
    manifest: input,
    generatedAt,
    coordinatesByCaseId: {
      "PLP-NO-LEGAL": {
        latitude: 53.5,
        longitude: -113.5,
        sourceUrl: "https://maps.edmonton.ca/example",
        capturedAt: generatedAt,
      },
    },
  });
  const addressOnly = result.cases.find((item) => item.caseId === "PLP-NO-LEGAL");
  assert.equal(addressOnly?.proposalDraft, null);
  assert.notEqual(addressOnly?.group, "proposal_ready");
});

test("the dry run cannot create opportunities, interactions, XP, or canonical pins", () => {
  const result = buildPropertyTitleEvidenceDryRun({ manifest: manifest(), generatedAt });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /opportunityId|interactionId|\"xp\"|createProspect/);
  assert.equal(result.mode, "dry_run");
});
