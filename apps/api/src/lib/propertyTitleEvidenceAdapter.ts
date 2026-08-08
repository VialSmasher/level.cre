import type {
  MarketEntityResolutionCandidate,
  MarketEntityResolutionInput,
} from "@level-cre/shared";

export const PROPERTY_TITLE_AUDIT_SOURCE = "codex_property_title_audit";

export const PROPERTY_TITLE_REVIEW_GROUPS = {
  existing_decisive_match: "Existing decisive match",
  probable_match: "Probable match needing Patrick's decision",
  verified_missing_coordinates: "Municipally verified but missing coordinates",
  proposal_ready: "Proposal-ready verified property",
  legal_lookup_required: "Title/legal lookup required",
  corporate_entity_lead: "Corporate entity lead only",
  multi_parcel_conflict: "Multi-parcel conflict",
  insufficient_evidence: "Insufficient evidence/root inbox",
} as const;

export type PropertyTitleReviewGroup = keyof typeof PROPERTY_TITLE_REVIEW_GROUPS;

type AuditCase = {
  case_id: string;
  folder_name?: string | null;
  folder_modified_at?: string | null;
  folder_address_observed?: string | null;
  verified_property_addresses?: string | string[] | null;
  municipality_hint?: string | null;
  property_address_status?: string | null;
  title_count?: number | string | null;
  corporate_search_count?: number | string | null;
  evidence_file_count?: number | string | null;
  review_status?: string | null;
  recommended_action?: string | null;
  legacy_match_status?: string | null;
  legacy_match_score?: number | string | null;
  legacy_match_reason?: string | null;
  legacy_prospect_name?: string | null;
  legacy_prospect_id?: string | null;
  legacy_warning?: string | null;
};

type AuditTitle = {
  case_id: string;
  folder_name?: string | null;
  source_relative_path?: string | null;
  source_sha256?: string | null;
  linc?: string | null;
  title_number?: string | null;
  short_legal?: string | null;
  legal_description?: string | null;
  plan?: string | null;
  block?: string | null;
  lot?: string | null;
  ats_reference?: string | null;
  municipality?: string | null;
  registered_owner?: string | null;
  title_pulled_date?: string | null;
  legal_lookup_status?: string | null;
  municipal_address?: string | null;
  parcel_area_sq_m?: number | string | null;
  neighbourhood?: string | null;
  current_zone?: string | null;
  current_bylaw?: string | null;
  boundary_confidence?: number | string | null;
  municipal_source_url?: string | null;
  municipal_captured_at?: string | null;
  extraction_confidence?: number | string | null;
  review_note?: string | null;
};

type AuditEntity = {
  case_id: string;
  folder_name?: string | null;
  source_relative_path?: string | null;
  source_sha256?: string | null;
  source_type?: string | null;
  legal_entity_name?: string | null;
  corporate_access_number?: string | null;
  legal_entity_status?: string | null;
  corporation_type?: string | null;
  registration_date?: string | null;
  search_date?: string | null;
  property_link_status?: string | null;
  extraction_confidence?: number | string | null;
  review_note?: string | null;
  // The source manifest contains office/director/shareholder fields. They are deliberately not adapted.
  registered_office?: unknown;
  records_address?: unknown;
  directors?: unknown;
  voting_shareholders?: unknown;
};

type AuditEvidence = {
  case_id: string;
  folder_name?: string | null;
  relative_path?: string | null;
  sha256?: string | null;
  document_type?: string | null;
  text_status?: string | null;
  modified_at?: string | null;
};

export type PropertyAuditManifest = {
  schemaVersion?: string | number;
  generatedAt: string;
  status?: string;
  counts?: Record<string, unknown>;
  cases: AuditCase[];
  titles: AuditTitle[];
  entities: AuditEntity[];
  evidence: AuditEvidence[];
};

export type VerifiedCoordinates = {
  latitude: number;
  longitude: number;
  sourceUrl: string;
  capturedAt: string;
};

export type EntityResolutionSnapshot = {
  decision: "link_existing" | "review" | "create_new";
  candidates: MarketEntityResolutionCandidate[];
  topCandidate?: MarketEntityResolutionCandidate | null;
};

export type PropertyTitleActivityDraft = {
  source: typeof PROPERTY_TITLE_AUDIT_SOURCE;
  externalEventId: string;
  eventType: "title_pulled" | "owner_identified" | "note";
  direction: "internal";
  evidenceStatus: "observed";
  occurredAt: string;
  company?: string | null;
  subject: string;
  summary: string;
  propertyAddress: string | null;
  confidence: number;
  matchStatus: "matched" | "needs_review";
  matchReason: string;
  prospectId?: string | null;
  sourceMetadata: Record<string, unknown>;
};

export type PropertyTitleMarketProposalDraft = {
  externalId: string;
  source: typeof PROPERTY_TITLE_AUDIT_SOURCE;
  observedAt: string;
  evidenceStatus: "observed";
  confidence: number;
  address: string;
  latitude: number;
  longitude: number;
  notes: string;
  legalIdentity: {
    municipality?: string | null;
    titleNumber?: string | null;
    linc?: string | null;
    plan?: string | null;
    block?: string | null;
    lot?: string | null;
  };
  sourceMetadata: Record<string, unknown>;
};

export type PropertyTitleDryRunCase = {
  caseId: string;
  folderName: string;
  group: PropertyTitleReviewGroup;
  groupLabel: string;
  verifiedAddress: string | null;
  eventDrafts: PropertyTitleActivityDraft[];
  proposalDraft: PropertyTitleMarketProposalDraft | null;
  resolverRequest: MarketEntityResolutionInput | null;
  candidateIds: string[];
  matchSignals: string[];
  matchConflicts: string[];
  fieldsThatWouldBeWritten: string[];
  noMapMutationReason: string | null;
  recommendedAction: string | null;
};

export type PropertyTitleDryRun = {
  mode: "dry_run";
  source: typeof PROPERTY_TITLE_AUDIT_SOURCE;
  generatedAt: string;
  manifest: {
    schemaVersion: string | number | null;
    generatedAt: string;
    caseCount: number;
    titleCount: number;
    entityCount: number;
    evidenceCount: number;
  };
  summary: {
    cases: number;
    eventDrafts: number;
    proposalDrafts: number;
    groups: Record<PropertyTitleReviewGroup, number>;
  };
  cases: PropertyTitleDryRunCase[];
  eventBatch: {
    source: typeof PROPERTY_TITLE_AUDIT_SOURCE;
    events: PropertyTitleActivityDraft[];
  };
  marketRecordProposals: PropertyTitleMarketProposalDraft[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function confidence(value: unknown, fallback = 50) {
  const parsed = numberValue(value);
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(percent || fallback)));
}

function isoDate(value: unknown, fallback: string) {
  const parsed = new Date(text(value) || fallback);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback).toISOString() : parsed.toISOString();
}

function addressList(value: AuditCase["verified_property_addresses"]) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/\s*[|;]\s*/).map(text).filter(Boolean);
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null && item !== ""));
}

function safeHash(value: unknown, fallback: string) {
  const normalized = text(value).toLowerCase().replace(/[^a-f0-9]/g, "");
  return normalized || fallback.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function stableToken(value: unknown, fallback: string) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64)
    || fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function evidenceExternalId(params: {
  caseId: string;
  recordKind: "title" | "owner" | "corporate" | "root-evidence";
  sourceHash: string;
  recordIdentity?: string | null;
}) {
  const base = `plp:${stableToken(params.caseId, "unknown-case")}:${params.recordKind}:${params.sourceHash}`;
  return params.recordIdentity ? `${base}:${stableToken(params.recordIdentity, "record")}` : base;
}

function dedupeEventDrafts(events: PropertyTitleActivityDraft[]) {
  const byExternalId = new Map<string, PropertyTitleActivityDraft>();
  for (const event of events) if (!byExternalId.has(event.externalEventId)) byExternalId.set(event.externalEventId, event);
  return [...byExternalId.values()];
}

function registeredOwnerLabel(value: unknown) {
  return text(value)
    .split(/\r?\n/)[0]
    .replace(/\s+(?:BOTH\s+OF|ALL\s+OF|ADDRESS)\s*:.*$/i, "")
    .replace(/\s+OF\s*:\s*.*$/i, "")
    .slice(0, 240)
    .trim();
}

function legalIdentity(title: AuditTitle | undefined, fallbackMunicipality?: string | null) {
  if (!title) return null;
  const identity = compact({
    municipality: text(title.municipality) || text(fallbackMunicipality) || null,
    titleNumber: text(title.title_number) || null,
    linc: text(title.linc) || null,
    plan: text(title.plan) || null,
    block: text(title.block) || null,
    lot: text(title.lot) || null,
  });
  return Object.keys(identity).length ? identity : null;
}

function legalIdentityIsProposalReady(title: AuditTitle | undefined, fallbackMunicipality?: string | null) {
  const identity = legalIdentity(title, fallbackMunicipality);
  if (!identity) return false;
  const municipality = text(identity.municipality);
  const hasStableParcelIdentity = Boolean(
    text(identity.titleNumber)
    || text(identity.linc)
    || (text(identity.plan) && text(identity.lot)),
  );
  return Boolean(municipality && !/^unknown$/i.test(municipality) && hasStableParcelIdentity);
}

function isRootInbox(auditCase: AuditCase) {
  return auditCase.case_id === "PLP-ROOT-INBOX"
    || /root[ _-]?inbox/i.test(text(auditCase.folder_name));
}

function hasMultiParcelConflict(auditCase: AuditCase, titles: AuditTitle[]) {
  const reviewText = `${text(auditCase.review_status)} ${text(auditCase.recommended_action)}`;
  if (/multi[\s_-]?parcel|multiple parcels|parcel conflict|conflicting parcel/i.test(reviewText)) return true;
  const municipalAddresses = new Set(titles.map((title) => text(title.municipal_address).toUpperCase()).filter(Boolean));
  return municipalAddresses.size > 1;
}

function legacyResolution(auditCase: AuditCase): EntityResolutionSnapshot | null {
  const id = text(auditCase.legacy_prospect_id);
  if (!id) return null;
  const score = confidence(auditCase.legacy_match_score, 50);
  const candidate = {
    entityType: "prospect" as const,
    id,
    label: text(auditCase.legacy_prospect_name) || id,
    score,
    confidence: score,
    signals: [text(auditCase.legacy_match_reason) || `Legacy audit status: ${text(auditCase.legacy_match_status) || "candidate"}`],
    conflicts: [
      "Candidate is from the audit snapshot; rerun the current entity resolver before linking",
      text(auditCase.legacy_warning),
    ].filter(Boolean),
    distanceMeters: null,
  };
  return { decision: "review", candidates: [candidate], topCandidate: candidate };
}

function resolutionForCase(
  auditCase: AuditCase,
  supplied: Record<string, EntityResolutionSnapshot | undefined>,
) {
  const current = supplied[auditCase.case_id];
  if (current) return { ...current, topCandidate: current.topCandidate || current.candidates[0] || null };
  return legacyResolution(auditCase);
}

function subjectPropertyAddress(auditCase: AuditCase, titles: AuditTitle[]) {
  if (text(auditCase.property_address_status) !== "municipal_verified") return null;
  return addressList(auditCase.verified_property_addresses)[0]
    || titles.map((title) => text(title.municipal_address)).find(Boolean)
    || null;
}

function titleMetadata(auditCase: AuditCase, title: AuditTitle) {
  return compact({
    caseId: auditCase.case_id,
    sourceRelativePath: text(title.source_relative_path),
    sourceSha256: text(title.source_sha256),
    recordKind: "land_title",
    extractionConfidence: confidence(title.extraction_confidence),
    reviewStatus: text(auditCase.review_status),
    titleNumber: text(title.title_number),
    linc: text(title.linc),
    plan: text(title.plan),
    block: text(title.block),
    lot: text(title.lot),
    municipality: text(title.municipality),
    legalLookupStatus: text(title.legal_lookup_status),
    verifiedAddressStatus: text(auditCase.property_address_status),
    municipalAddress: text(title.municipal_address),
    municipalSourceUrl: text(title.municipal_source_url),
    municipalCapturedAt: text(title.municipal_captured_at),
  });
}

function titleEvents(params: {
  auditCase: AuditCase;
  titles: AuditTitle[];
  verifiedAddress: string | null;
  resolution: EntityResolutionSnapshot | null;
  manifestGeneratedAt: string;
}) {
  const decisiveProspect = params.resolution?.decision === "link_existing"
    && params.resolution.topCandidate?.entityType === "prospect"
    && params.resolution.topCandidate.conflicts.length === 0
    ? params.resolution.topCandidate
    : null;

  return params.titles.flatMap<PropertyTitleActivityDraft>((title, index) => {
    const sourceHash = safeHash(title.source_sha256, `${params.auditCase.case_id}-title-${index + 1}`);
    const recordIdentity = text(title.title_number)
      || text(title.linc)
      || [text(title.plan), text(title.block), text(title.lot)].filter(Boolean).join("-")
      || String(index + 1);
    const metadata = titleMetadata(params.auditCase, title);
    const identityLabel = text(title.title_number) || text(title.linc) || text(title.short_legal) || "land title";
    const base = {
      source: PROPERTY_TITLE_AUDIT_SOURCE as typeof PROPERTY_TITLE_AUDIT_SOURCE,
      direction: "internal" as const,
      evidenceStatus: "observed" as const,
      occurredAt: isoDate(title.title_pulled_date, params.manifestGeneratedAt),
      propertyAddress: params.verifiedAddress,
      confidence: confidence(title.extraction_confidence),
      matchStatus: decisiveProspect ? "matched" as const : "needs_review" as const,
      matchReason: decisiveProspect ? "entity_resolution_decisive" : "property_title_audit_review",
      prospectId: decisiveProspect?.id || null,
    };
    const events: PropertyTitleActivityDraft[] = [{
      ...base,
      externalEventId: evidenceExternalId({ caseId: params.auditCase.case_id, recordKind: "title", sourceHash, recordIdentity }),
      eventType: "title_pulled",
      subject: `Land title pulled: ${text(params.auditCase.folder_name) || params.auditCase.case_id}`,
      summary: `Audited ${identityLabel}; property identity remains reviewable until linked or broker-approved.`,
      sourceMetadata: metadata,
    }];
    const owner = registeredOwnerLabel(title.registered_owner);
    if (owner) {
      events.push({
        ...base,
        externalEventId: evidenceExternalId({ caseId: params.auditCase.case_id, recordKind: "owner", sourceHash, recordIdentity }),
        eventType: "owner_identified",
        company: owner,
        subject: `Registered owner shown on title: ${text(params.auditCase.folder_name) || params.auditCase.case_id}`,
        summary: "The registered owner was observed on the audited land title; no mailing address was imported.",
        sourceMetadata: compact({ ...metadata, recordKind: "title_registered_owner" }),
      });
    }
    return events;
  });
}

function corporateEvents(params: {
  auditCase: AuditCase;
  entities: AuditEntity[];
  manifestGeneratedAt: string;
}) {
  return params.entities.map<PropertyTitleActivityDraft>((entity, index) => {
    const sourceHash = safeHash(entity.source_sha256, `${params.auditCase.case_id}-corporate-${index + 1}`);
    const company = text(entity.legal_entity_name) || null;
    return {
      source: PROPERTY_TITLE_AUDIT_SOURCE,
      externalEventId: evidenceExternalId({
        caseId: params.auditCase.case_id,
        recordKind: "corporate",
        sourceHash,
        recordIdentity: text(entity.corporate_access_number) || company || String(index + 1),
      }),
      eventType: "note",
      direction: "internal",
      evidenceStatus: "observed",
      occurredAt: isoDate(entity.search_date, params.manifestGeneratedAt),
      company,
      subject: `Corporate search reviewed: ${company || text(params.auditCase.folder_name) || params.auditCase.case_id}`,
      summary: "Corporate registry evidence is retained as an entity lead; office, director, and shareholder addresses were not treated as property evidence.",
      propertyAddress: null,
      confidence: confidence(entity.extraction_confidence),
      matchStatus: "needs_review",
      matchReason: "corporate_search_entity_lead",
      prospectId: null,
      sourceMetadata: compact({
        caseId: params.auditCase.case_id,
        sourceRelativePath: text(entity.source_relative_path),
        sourceSha256: text(entity.source_sha256),
        recordKind: "corporate_search",
        extractionConfidence: confidence(entity.extraction_confidence),
        reviewStatus: text(params.auditCase.review_status),
        sourceType: text(entity.source_type),
        legalEntityName: company,
        corporateAccessNumber: text(entity.corporate_access_number),
        legalEntityStatus: text(entity.legal_entity_status),
        corporationType: text(entity.corporation_type),
        registrationDate: text(entity.registration_date),
        searchDate: text(entity.search_date),
        propertyLinkStatus: text(entity.property_link_status),
      }),
    };
  });
}

function rootInboxEvents(params: {
  auditCase: AuditCase;
  evidence: AuditEvidence[];
  manifestGeneratedAt: string;
}) {
  if (!isRootInbox(params.auditCase)) return [];
  return params.evidence.map<PropertyTitleActivityDraft>((evidence, index) => {
    const sourceHash = safeHash(evidence.sha256, `${params.auditCase.case_id}-evidence-${index + 1}`);
    return {
      source: PROPERTY_TITLE_AUDIT_SOURCE,
      externalEventId: evidenceExternalId({ caseId: params.auditCase.case_id, recordKind: "root-evidence", sourceHash }),
      eventType: "note",
      direction: "internal",
      evidenceStatus: "observed",
      occurredAt: isoDate(evidence.modified_at, params.manifestGeneratedAt),
      subject: `Unassigned PL evidence: ${text(evidence.relative_path) || sourceHash}`,
      summary: "Loose audit evidence remains unassigned in Review and cannot create or move a property.",
      propertyAddress: null,
      confidence: 25,
      matchStatus: "needs_review",
      matchReason: "root_inbox_evidence_unassigned",
      prospectId: null,
      sourceMetadata: compact({
        caseId: params.auditCase.case_id,
        sourceRelativePath: text(evidence.relative_path),
        sourceSha256: text(evidence.sha256),
        recordKind: "root_inbox_evidence",
        documentType: text(evidence.document_type),
        textStatus: text(evidence.text_status),
        reviewStatus: text(params.auditCase.review_status),
      }),
    };
  });
}

function resolverRequestFor(
  auditCase: AuditCase,
  titles: AuditTitle[],
  verifiedAddress: string | null,
) {
  if (hasMultiParcelConflict(auditCase, titles)) return null;
  const identity = legalIdentity(titles[0], auditCase.municipality_hint);
  if (!verifiedAddress && !identity) return null;
  return compact({ address: verifiedAddress, ...(identity || {}) }) as MarketEntityResolutionInput;
}

function classifyCase(params: {
  auditCase: AuditCase;
  titles: AuditTitle[];
  entities: AuditEntity[];
  evidence: AuditEvidence[];
  verifiedAddress: string | null;
  coordinates: VerifiedCoordinates | null;
  resolution: EntityResolutionSnapshot | null;
}): PropertyTitleReviewGroup {
  if (isRootInbox(params.auditCase) || (params.titles.length === 0 && params.entities.length === 0 && params.evidence.length > 0)) {
    return "insufficient_evidence";
  }
  if (hasMultiParcelConflict(params.auditCase, params.titles)) return "multi_parcel_conflict";
  if (params.resolution?.decision === "link_existing" && params.resolution.topCandidate?.conflicts.length === 0) {
    return "existing_decisive_match";
  }
  if (params.resolution?.candidates.length) return "probable_match";
  if (params.verifiedAddress && !params.coordinates) return "verified_missing_coordinates";
  if (params.verifiedAddress && params.coordinates) {
    return legalIdentityIsProposalReady(params.titles[0], params.auditCase.municipality_hint)
      ? "proposal_ready"
      : params.titles.length > 0 ? "legal_lookup_required" : "insufficient_evidence";
  }
  if (params.titles.length > 0) return "legal_lookup_required";
  if (params.entities.length > 0) return "corporate_entity_lead";
  return "insufficient_evidence";
}

function blockedReason(group: PropertyTitleReviewGroup) {
  const reasons: Record<PropertyTitleReviewGroup, string | null> = {
    existing_decisive_match: "Evidence may link to the decisive existing record, but this dry run performs no mutation.",
    probable_match: "Patrick must choose or reject the probable existing record before any link or map action.",
    verified_missing_coordinates: "The civic address is municipally verified, but source-backed coordinates are missing.",
    proposal_ready: null,
    legal_lookup_required: "The title/legal description has not been reconciled to a municipally verified subject address and coordinates.",
    corporate_entity_lead: "A corporate search identifies an entity, not the subject property; no office or personal address can create geometry.",
    multi_parcel_conflict: "Multiple or conflicting parcels require Patrick's review before property resolution.",
    insufficient_evidence: "The evidence is unassigned or insufficient and must remain in Review.",
  };
  return reasons[group];
}

function proposalForCase(params: {
  auditCase: AuditCase;
  titles: AuditTitle[];
  verifiedAddress: string | null;
  coordinates: VerifiedCoordinates | null;
  group: PropertyTitleReviewGroup;
  eventDrafts: PropertyTitleActivityDraft[];
  manifestGeneratedAt: string;
}) {
  if (
    params.group !== "proposal_ready"
    || !params.verifiedAddress
    || !params.coordinates
    || !params.coordinates.sourceUrl
    || !params.coordinates.capturedAt
    || !legalIdentityIsProposalReady(params.titles[0], params.auditCase.municipality_hint)
  ) return null;
  const identity = legalIdentity(params.titles[0], params.auditCase.municipality_hint) || {};
  return {
    externalId: `plp:property:${params.auditCase.case_id.toLowerCase()}`,
    source: PROPERTY_TITLE_AUDIT_SOURCE,
    observedAt: isoDate(params.coordinates.capturedAt, params.manifestGeneratedAt),
    evidenceStatus: "observed",
    confidence: 95,
    address: params.verifiedAddress,
    latitude: params.coordinates.latitude,
    longitude: params.coordinates.longitude,
    notes: "Property-title audit evidence is ready for Patrick's broker review; approval may link or create the canonical map record.",
    legalIdentity: identity,
    sourceMetadata: {
      caseId: params.auditCase.case_id,
      coordinateSourceUrl: params.coordinates.sourceUrl,
      coordinateCapturedAt: params.coordinates.capturedAt,
      evidenceEventExternalIds: params.eventDrafts.map((event) => event.externalEventId),
      sourceSha256: params.titles.map((title) => text(title.source_sha256)).filter(Boolean),
    },
  } satisfies PropertyTitleMarketProposalDraft;
}

export function buildPropertyTitleEvidenceDryRun(params: {
  manifest: PropertyAuditManifest;
  coordinatesByCaseId?: Record<string, VerifiedCoordinates | undefined>;
  resolutionByCaseId?: Record<string, EntityResolutionSnapshot | undefined>;
  generatedAt?: string;
}): PropertyTitleDryRun {
  const coordinatesByCaseId = params.coordinatesByCaseId || {};
  const resolutionByCaseId = params.resolutionByCaseId || {};
  const cases = params.manifest.cases.map<PropertyTitleDryRunCase>((auditCase) => {
    const titles = params.manifest.titles.filter((title) => title.case_id === auditCase.case_id);
    const entities = params.manifest.entities.filter((entity) => entity.case_id === auditCase.case_id);
    const evidence = params.manifest.evidence.filter((item) => item.case_id === auditCase.case_id);
    const verifiedAddress = subjectPropertyAddress(auditCase, titles);
    const coordinates = coordinatesByCaseId[auditCase.case_id] || null;
    const resolution = resolutionForCase(auditCase, resolutionByCaseId);
    const resolverRequest = resolverRequestFor(auditCase, titles, verifiedAddress);
    const eventDrafts = dedupeEventDrafts([
      ...titleEvents({ auditCase, titles, verifiedAddress, resolution, manifestGeneratedAt: params.manifest.generatedAt }),
      ...corporateEvents({ auditCase, entities, manifestGeneratedAt: params.manifest.generatedAt }),
      ...rootInboxEvents({ auditCase, evidence, manifestGeneratedAt: params.manifest.generatedAt }),
    ]);
    const group = classifyCase({ auditCase, titles, entities, evidence, verifiedAddress, coordinates, resolution });
    const proposalDraft = proposalForCase({
      auditCase,
      titles,
      verifiedAddress,
      coordinates,
      group,
      eventDrafts,
      manifestGeneratedAt: params.manifest.generatedAt,
    });
    const candidates = resolution?.candidates || [];
    const fieldsThatWouldBeWritten = [
      ...new Set(eventDrafts.flatMap((event) => [
        `activity_events:${event.eventType}`,
        event.company ? "activity_events:company" : "",
        event.propertyAddress ? "activity_events:property_address" : "",
        "activity_events:source_metadata",
      ]).filter(Boolean)),
      ...(proposalDraft ? [
        "market_record_proposal:address",
        "market_record_proposal:coordinates",
        "market_record_proposal:legal_identity",
      ] : []),
    ];
    return {
      caseId: auditCase.case_id,
      folderName: text(auditCase.folder_name) || auditCase.case_id,
      group,
      groupLabel: PROPERTY_TITLE_REVIEW_GROUPS[group],
      verifiedAddress,
      eventDrafts,
      proposalDraft,
      resolverRequest,
      candidateIds: candidates.map((candidate) => `${candidate.entityType}:${candidate.id}`),
      matchSignals: [...new Set(candidates.flatMap((candidate) => candidate.signals))],
      matchConflicts: [...new Set(candidates.flatMap((candidate) => candidate.conflicts))],
      fieldsThatWouldBeWritten,
      noMapMutationReason: blockedReason(group),
      recommendedAction: text(auditCase.recommended_action) || null,
    };
  });
  const groups = Object.fromEntries(
    Object.keys(PROPERTY_TITLE_REVIEW_GROUPS).map((group) => [
      group,
      cases.filter((item) => item.group === group).length,
    ]),
  ) as Record<PropertyTitleReviewGroup, number>;
  const eventDrafts = cases.flatMap((item) => item.eventDrafts);
  const marketRecordProposals = cases.flatMap((item) => item.proposalDraft ? [item.proposalDraft] : []);
  return {
    mode: "dry_run",
    source: PROPERTY_TITLE_AUDIT_SOURCE,
    generatedAt: params.generatedAt || new Date().toISOString(),
    manifest: {
      schemaVersion: params.manifest.schemaVersion ?? null,
      generatedAt: params.manifest.generatedAt,
      caseCount: params.manifest.cases.length,
      titleCount: params.manifest.titles.length,
      entityCount: params.manifest.entities.length,
      evidenceCount: params.manifest.evidence.length,
    },
    summary: {
      cases: cases.length,
      eventDrafts: eventDrafts.length,
      proposalDrafts: marketRecordProposals.length,
      groups,
    },
    cases,
    eventBatch: { source: PROPERTY_TITLE_AUDIT_SOURCE, events: eventDrafts },
    marketRecordProposals,
  };
}

function markdownCell(value: unknown) {
  const joined = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return joined.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || "—";
}

export function renderPropertyTitleDryRunMarkdown(dryRun: PropertyTitleDryRun) {
  const lines = [
    "# Level CRE property-title evidence dry run",
    "",
    `Generated: ${dryRun.generatedAt}`,
    "",
    "> Dry run only. No API or database write was performed. Patrick's approval is required before ingestion.",
    "",
    `Manifest: ${dryRun.manifest.caseCount} cases, ${dryRun.manifest.titleCount} titles, ${dryRun.manifest.entityCount} corporate searches, ${dryRun.manifest.evidenceCount} evidence files.`,
    `Draft output: ${dryRun.summary.eventDrafts} idempotent evidence events and ${dryRun.summary.proposalDrafts} map proposals.`,
    "",
    "## Review groups",
    "",
    "| # | Group | Cases |",
    "|---:|---|---:|",
    ...Object.entries(PROPERTY_TITLE_REVIEW_GROUPS).map(([key, label], index) => (
      `| ${index + 1} | ${label} | ${dryRun.summary.groups[key as PropertyTitleReviewGroup]} |`
    )),
  ];

  Object.entries(PROPERTY_TITLE_REVIEW_GROUPS).forEach(([key, label], index) => {
    const rows = dryRun.cases.filter((item) => item.group === key);
    lines.push("", `## ${index + 1}. ${label}`, "");
    if (!rows.length) {
      lines.push("No cases.");
      return;
    }
    lines.push(
      "| Case | Proposed external IDs | Level CRE candidates | Signals / conflicts | Fields that would be written | Why no map mutation |",
      "|---|---|---|---|---|---|",
      ...rows.map((item) => {
        const ids = [
          ...item.eventDrafts.map((event) => event.externalEventId),
          ...(item.proposalDraft ? [item.proposalDraft.externalId] : []),
        ];
        const evidence = [
          ...item.matchSignals.map((signal) => `signal: ${signal}`),
          ...item.matchConflicts.map((conflict) => `conflict: ${conflict}`),
        ];
        return `| ${markdownCell(`${item.folderName} (${item.caseId})`)} | ${markdownCell(ids)} | ${markdownCell(item.candidateIds)} | ${markdownCell(evidence)} | ${markdownCell(item.fieldsThatWouldBeWritten)} | ${markdownCell(item.noMapMutationReason || "Proposal is eligible for Review; this dry run still performs no write.")} |`;
      }),
    );
  });
  lines.push(
    "",
    "## Approval boundary",
    "",
    "- Evidence ingestion is idempotent by `(user_id, source, external_event_id)`.",
    "- Corporate office, records-office, director, shareholder, and owner-mailing addresses are excluded from subject-property fields.",
    "- Only municipally verified properties with source-backed coordinates can produce a market-record proposal.",
    "- Only Patrick's signed-in broker action can link/create a map record or promote an opportunity.",
    "",
  );
  return lines.join("\n");
}
