import {
  type CreateIntelAgentEventInput,
  type CreateIntelListingAssetInput,
  type CreateIntelPropertyDossierInput,
  type CreateIntelRequirementInput,
  type CreateIntelSurveyInput,
  type CreateIntelSurveyItemInput,
  type IntelChangeListItem,
  type IntelAgentEvent,
  type IntelRequirementDetail,
  type IntelRequirementListItem,
  type IntelRequirementPreference,
  type IntelRequirementListingDecision,
  type IntelPublicLinkCandidate,
  type IntelSurveyDetail,
  type IntelSurveyEvent,
  type IntelSurveyListItem,
  type UpsertIntelRequirementListingDecisionInput,
  industrialIntelRepository,
  type IntelListingListItem,
  type IntelListingAssetWithUrl,
  type IntelListingAssetType,
  type IntelPropertyDossierDetail,
  type IntelPropertyDossierListItem,
  type IntelDuplicateGroup,
  type IntelRunListItem,
  type IntelSourceListItem,
  type IntelSummary,
  type ReplaceIntelRequirementPreferencesInput,
  type UpdateIntelRequirementInput,
  type UpdateIntelPropertyDossierInput,
  type UpdateIntelSurveyInput,
  type UpdateIntelSurveyItemInput,
  type UpsertIntelDossierFactInput,
  type UpdateIntelDossierFactInput,
} from "./repo";
import { randomUUID } from "crypto";
import {
  ingestManualIntelListing,
  ingestManualIntelListingUpload,
  type ManualIntelListingInput,
  type ManualIntelListingUploadInput,
} from "./manualIngest";
import { previewManualIntelListing } from "./manualPreview";
import { resolvePublicLinkCandidates } from "./publicLinkResolver";
import { runIndustrialIntelSource } from "./sourceRegistry";
import {
  createIntelAssetSignedUpload,
  downloadIntelListingAsset,
  getIntelAssetBucket,
  signIntelListingAssets,
} from "./assetStorage";
import { extractSurveyFactsFromBuffer, type SurveySyncExtractionResult } from "./surveySyncExtraction";

export type CreateSurveyItemAssetUploadInput = {
  fileName: string;
  contentType: string;
  fileSize: number;
  assetType?: IntelListingAssetType | null;
};

export type CreateManualPublicLinkInput = {
  candidateUrl: string;
  title?: string | null;
  snippet?: string | null;
};

export type CreateDossierAssetUploadInput = CreateSurveyItemAssetUploadInput;

export type SurveySyncDossierAssetExtraction = {
  assetId: string;
  dossierId: string;
  extraction: SurveySyncExtractionResult;
  facts: Awaited<ReturnType<typeof industrialIntelRepository.upsertDossierFact>>[];
  dossier: IntelPropertyDossierDetail | null;
};

export type SurveySyncAgentJobInput = {
  dryRun?: boolean;
  attachCanonicalListingsToSurvey?: boolean;
  survey?: {
    id?: string | null;
    title?: string | null;
    clientName?: string | null;
    requirementId?: string | null;
  } | null;
  listings?: Array<CreateIntelSurveyItemInput>;
  dossiers?: Array<{
    dossierId?: string | null;
    canonicalListingId?: string | null;
    title?: string | null;
    address?: string | null;
    normalizedAddress?: string | null;
    market?: string | null;
    submarket?: string | null;
    assetType?: string | null;
    listingType?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    facts?: UpsertIntelDossierFactInput[];
    sourceAssets?: CreateDossierAssetUploadInput[];
    recommendationLabel?: string | null;
    brokerNotes?: string | null;
    clientNotes?: string | null;
    hidden?: boolean | null;
    sortOrder?: number | null;
  }>;
};

export type SurveySyncAgentJobResult = {
  jobId: string;
  status: "planned" | "completed";
  dryRun: boolean;
  survey: IntelSurveyDetail | null;
  listings: Array<{
    listingId: string;
    status: "planned" | "added" | "skipped";
    reason?: string;
  }>;
  dossiers: Array<{
    dossierId: string | null;
    status: "planned" | "matched" | "created" | "updated" | "skipped";
    title: string | null;
    canonicalListingId: string | null;
    factCount: number;
    uploadRequests: Array<{
      assetId: string;
      fileName: string;
      contentType: string;
      uploadUrl: string | null;
      storagePath: string | null;
    }>;
  }>;
  warnings: string[];
  nextActions: string[];
};

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._',!$@=;:+?()& -]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "asset";
}

function normalizeSurveySyncAddress(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || null;
}

export class IndustrialIntelService {
  async getSummary(): Promise<IntelSummary> {
    return industrialIntelRepository.getSummary();
  }

  async getSources(): Promise<IntelSourceListItem[]> {
    return industrialIntelRepository.getSources();
  }

  async getRuns(): Promise<IntelRunListItem[]> {
    return industrialIntelRepository.getRuns();
  }

  async getListings(): Promise<IntelListingListItem[]> {
    return industrialIntelRepository.getListings();
  }

  async logAgentEvent(input: CreateIntelAgentEventInput): Promise<IntelAgentEvent | null> {
    return industrialIntelRepository.createAgentEvent(input);
  }

  async getAgentEvents(userId: string, limit = 100): Promise<IntelAgentEvent[]> {
    return industrialIntelRepository.getAgentEvents(userId, limit);
  }

  async getListingDuplicates(): Promise<IntelDuplicateGroup[]> {
    return industrialIntelRepository.getListingDuplicates();
  }

  async getDossiers(userId: string): Promise<IntelPropertyDossierListItem[]> {
    return industrialIntelRepository.getDossiers(userId);
  }

  async getDossierById(userId: string, id: string): Promise<IntelPropertyDossierDetail | null> {
    const dossier = await industrialIntelRepository.getDossierById(userId, id);
    if (!dossier) return null;
    return {
      ...dossier,
      assets: await signIntelListingAssets(dossier.assets),
    };
  }

  async createDossier(userId: string, input: CreateIntelPropertyDossierInput): Promise<IntelPropertyDossierDetail> {
    const dossier = await industrialIntelRepository.createDossier(userId, input);
    return {
      ...dossier,
      assets: await signIntelListingAssets(dossier.assets),
    };
  }

  async updateDossier(
    userId: string,
    id: string,
    input: UpdateIntelPropertyDossierInput,
  ): Promise<IntelPropertyDossierDetail | null> {
    const dossier = await industrialIntelRepository.updateDossier(userId, id, input);
    if (!dossier) return null;
    return {
      ...dossier,
      assets: await signIntelListingAssets(dossier.assets),
    };
  }

  async createDossierAssetUpload(userId: string, dossierId: string, input: CreateDossierAssetUploadInput) {
    const dossier = await industrialIntelRepository.getDossierById(userId, dossierId);
    if (!dossier) return null;

    const assetId = randomUUID();
    const fileName = sanitizeFileName(input.fileName);
    const storagePath = `dossiers/${dossierId}/${assetId}-${fileName}`;
    const upload = await createIntelAssetSignedUpload(storagePath);
    const assetInput: CreateIntelListingAssetInput = {
      id: assetId,
      dossierId,
      listingId: dossier.canonicalListingId,
      assetType: input.assetType || (input.contentType === "application/pdf" ? "brochure" : "photo"),
      fileName,
      contentType: input.contentType,
      fileSize: input.fileSize,
      storageBucket: upload.bucket || getIntelAssetBucket(),
      storagePath: upload.path || storagePath,
      source: "upload",
      status: "pending",
    };

    const asset = await industrialIntelRepository.createDossierAsset(userId, dossierId, assetInput);
    if (!asset) return null;
    return { asset, upload };
  }

  async getDossierAssets(userId: string, dossierId: string): Promise<IntelListingAssetWithUrl[]> {
    const assets = await industrialIntelRepository.getDossierAssets(userId, dossierId);
    return signIntelListingAssets(assets);
  }

  async upsertDossierFact(userId: string, dossierId: string, input: UpsertIntelDossierFactInput) {
    return industrialIntelRepository.upsertDossierFact(userId, dossierId, input);
  }

  async updateDossierFact(userId: string, dossierId: string, factId: string, input: UpdateIntelDossierFactInput) {
    return industrialIntelRepository.updateDossierFact(userId, dossierId, factId, input);
  }

  private async findExistingDossierForAgentJob(
    userId: string,
    input: NonNullable<SurveySyncAgentJobInput["dossiers"]>[number],
  ): Promise<IntelPropertyDossierDetail | null> {
    if (input.dossierId) {
      return this.getDossierById(userId, input.dossierId);
    }

    const dossiers = await industrialIntelRepository.getDossiers(userId, 500);
    if (input.canonicalListingId) {
      const byListing = dossiers.find((dossier) => dossier.canonicalListingId === input.canonicalListingId);
      if (byListing) return this.getDossierById(userId, byListing.id);
    }

    const normalizedAddress = normalizeSurveySyncAddress(input.normalizedAddress || input.address);
    if (normalizedAddress) {
      const byAddress = dossiers.find(
        (dossier) => normalizeSurveySyncAddress(dossier.normalizedAddress || dossier.address) === normalizedAddress,
      );
      if (byAddress) return this.getDossierById(userId, byAddress.id);
    }

    return null;
  }

  private async buildDossierCreateInput(
    input: NonNullable<SurveySyncAgentJobInput["dossiers"]>[number],
  ): Promise<CreateIntelPropertyDossierInput | null> {
    const listing = input.canonicalListingId
      ? await industrialIntelRepository.getListingById(input.canonicalListingId)
      : null;
    const title = input.title?.trim() || listing?.title || input.address?.trim();
    if (!title) return null;

    return {
      canonicalListingId: input.canonicalListingId ?? null,
      title,
      address: input.address ?? listing?.address ?? null,
      normalizedAddress: normalizeSurveySyncAddress(input.normalizedAddress || input.address || listing?.normalizedAddress),
      market: input.market ?? listing?.market ?? null,
      submarket: input.submarket ?? listing?.submarket ?? null,
      assetType: input.assetType ?? listing?.assetType ?? null,
      listingType: input.listingType ?? listing?.listingType ?? null,
      status: "draft",
      latitude: input.latitude ?? listing?.latitude ?? null,
      longitude: input.longitude ?? listing?.longitude ?? null,
    };
  }

  async runSurveySyncAgentJob(userId: string, input: SurveySyncAgentJobInput): Promise<SurveySyncAgentJobResult> {
    const jobId = randomUUID();
    const dryRun = Boolean(input.dryRun);
    const warnings: string[] = [];
    const nextActions = new Set<string>();
    const listingResults: SurveySyncAgentJobResult["listings"] = [];
    const dossierResults: SurveySyncAgentJobResult["dossiers"] = [];

    let survey: IntelSurveyDetail | null = null;
    if (input.survey?.id) {
      survey = await this.getSurveyById(userId, input.survey.id);
      if (!survey) warnings.push(`Survey ${input.survey.id} was not found; listing attachments were skipped.`);
    } else if (input.survey?.title?.trim()) {
      if (dryRun) {
        warnings.push(`Dry run: survey "${input.survey.title.trim()}" would be created.`);
      } else {
        survey = await this.createSurvey(userId, {
          title: input.survey.title.trim(),
          clientName: input.survey.clientName ?? null,
          requirementId: input.survey.requirementId ?? null,
        });
      }
    }

    const listingInputs = input.listings || [];
    for (const listingInput of listingInputs) {
      if (dryRun) {
        listingResults.push({ listingId: listingInput.listingId, status: "planned" });
        continue;
      }
      if (!survey) {
        listingResults.push({
          listingId: listingInput.listingId,
          status: "skipped",
          reason: "No survey was selected or created for this job.",
        });
        continue;
      }
      const updatedSurvey = await this.addSurveyItem(userId, survey.id, listingInput);
      if (!updatedSurvey) {
        listingResults.push({
          listingId: listingInput.listingId,
          status: "skipped",
          reason: "Survey or listing was not found.",
        });
        continue;
      }
      survey = updatedSurvey;
      listingResults.push({ listingId: listingInput.listingId, status: "added" });
    }

    const dossierInputs = input.dossiers || [];
    for (const dossierInput of dossierInputs) {
      if (dryRun) {
        dossierResults.push({
          dossierId: dossierInput.dossierId ?? null,
          status: "planned",
          title: dossierInput.title ?? dossierInput.address ?? null,
          canonicalListingId: dossierInput.canonicalListingId ?? null,
          factCount: dossierInput.facts?.length || 0,
          uploadRequests: [],
        });
        continue;
      }

      let dossier = await this.findExistingDossierForAgentJob(userId, dossierInput);
      let dossierStatus: SurveySyncAgentJobResult["dossiers"][number]["status"] = dossier ? "matched" : "created";
      if (!dossier) {
        const createInput = await this.buildDossierCreateInput(dossierInput);
        if (!createInput) {
          dossierResults.push({
            dossierId: null,
            status: "skipped",
            title: dossierInput.title ?? null,
            canonicalListingId: dossierInput.canonicalListingId ?? null,
            factCount: 0,
            uploadRequests: [],
          });
          warnings.push("Skipped dossier because it had no dossierId, listingId, title, or address.");
          continue;
        }

        try {
          dossier = await this.createDossier(userId, createInput);
        } catch (error: any) {
          if (String(error?.code || "") === "23505") {
            dossier = await this.findExistingDossierForAgentJob(userId, dossierInput);
            dossierStatus = dossier ? "matched" : "skipped";
          } else {
            throw error;
          }
        }
      } else {
        const patch: UpdateIntelPropertyDossierInput = {};
        if (dossierInput.title) patch.title = dossierInput.title;
        if (dossierInput.address) patch.address = dossierInput.address;
        if (dossierInput.normalizedAddress || dossierInput.address) {
          patch.normalizedAddress = normalizeSurveySyncAddress(dossierInput.normalizedAddress || dossierInput.address);
        }
        if (dossierInput.market) patch.market = dossierInput.market;
        if (dossierInput.submarket) patch.submarket = dossierInput.submarket;
        if (dossierInput.assetType) patch.assetType = dossierInput.assetType;
        if (dossierInput.listingType) patch.listingType = dossierInput.listingType;
        if (dossierInput.latitude !== undefined) patch.latitude = dossierInput.latitude;
        if (dossierInput.longitude !== undefined) patch.longitude = dossierInput.longitude;
        if (Object.keys(patch).length > 0) {
          const updated = await this.updateDossier(userId, dossier.id, patch);
          if (updated) {
            dossier = updated;
            dossierStatus = "updated";
          }
        }
      }

      if (!dossier) {
        dossierResults.push({
          dossierId: null,
          status: "skipped",
          title: dossierInput.title ?? null,
          canonicalListingId: dossierInput.canonicalListingId ?? null,
          factCount: 0,
          uploadRequests: [],
        });
        continue;
      }

      let factCount = 0;
      for (const fact of dossierInput.facts || []) {
        const saved = await this.upsertDossierFact(userId, dossier.id, fact);
        if (saved) factCount += 1;
      }

      const uploadRequests: SurveySyncAgentJobResult["dossiers"][number]["uploadRequests"] = [];
      for (const assetInput of dossierInput.sourceAssets || []) {
        try {
          const upload = await this.createDossierAssetUpload(userId, dossier.id, assetInput);
          if (upload) {
            uploadRequests.push({
              assetId: upload.asset.id,
              fileName: upload.asset.fileName,
              contentType: upload.asset.contentType,
              uploadUrl: upload.upload.signedUrl || null,
              storagePath: upload.asset.storagePath,
            });
          }
        } catch (error: any) {
          warnings.push(`Could not create upload URL for ${assetInput.fileName}: ${String(error?.message || error)}`);
        }
      }
      if (uploadRequests.length > 0) {
        nextActions.add("Upload source bytes to each signed uploadUrl, then POST /api/intel/assets/:assetId/complete.");
        nextActions.add("For uploaded PDFs, POST /api/intel/dossiers/:dossierId/assets/:assetId/extract after completion.");
      }

      const shouldAttachListing = input.attachCanonicalListingsToSurvey !== false;
      if (survey && shouldAttachListing && dossier.canonicalListingId) {
        const updatedSurvey = await this.addSurveyItem(userId, survey.id, {
          listingId: dossier.canonicalListingId,
          recommendationLabel: dossierInput.recommendationLabel ?? null,
          brokerNotes: dossierInput.brokerNotes ?? null,
          clientNotes: dossierInput.clientNotes ?? null,
          hidden: dossierInput.hidden ?? null,
          sortOrder: dossierInput.sortOrder ?? null,
        });
        if (updatedSurvey) {
          survey = updatedSurvey;
          listingResults.push({ listingId: dossier.canonicalListingId, status: "added" });
        }
      } else if (survey && shouldAttachListing && !dossier.canonicalListingId) {
        warnings.push(
          `Dossier ${dossier.id} was saved but not added to the survey because dossier-only survey items are not implemented yet.`,
        );
        nextActions.add("Link the dossier to an inventory listing or build dossier-to-survey item support.");
      }

      dossierResults.push({
        dossierId: dossier.id,
        status: dossierStatus,
        title: dossier.title,
        canonicalListingId: dossier.canonicalListingId,
        factCount,
        uploadRequests,
      });
    }

    return {
      jobId,
      status: dryRun ? "planned" : "completed",
      dryRun,
      survey,
      listings: listingResults,
      dossiers: dossierResults,
      warnings,
      nextActions: Array.from(nextActions),
    };
  }

  async extractDossierAsset(
    userId: string,
    dossierId: string,
    assetId: string,
  ): Promise<SurveySyncDossierAssetExtraction | null> {
    const asset = await industrialIntelRepository.getDossierAssetById(userId, dossierId, assetId);
    if (!asset) return null;
    if (asset.status !== "active") {
      throw new Error("Asset must be uploaded and active before extraction");
    }

    const buffer = await downloadIntelListingAsset(asset);
    const extraction = await extractSurveyFactsFromBuffer(buffer, {
      contentType: asset.contentType,
      fileName: asset.fileName,
      sourceAssetId: asset.id,
    });

    const dossierPatch: UpdateIntelPropertyDossierInput = {};
    if (extraction.title) dossierPatch.title = extraction.title;
    if (extraction.address) dossierPatch.address = extraction.address;
    if (extraction.address) dossierPatch.normalizedAddress = extraction.address;
    if (extraction.market) dossierPatch.market = extraction.market;
    if (extraction.submarket) dossierPatch.submarket = extraction.submarket;
    if (extraction.assetType) dossierPatch.assetType = extraction.assetType;
    if (extraction.listingType) dossierPatch.listingType = extraction.listingType;
    if (Object.keys(dossierPatch).length > 0) {
      await industrialIntelRepository.updateDossier(userId, dossierId, dossierPatch);
    }

    const facts = [];
    for (const fact of extraction.facts) {
      facts.push(await industrialIntelRepository.upsertDossierFact(userId, dossierId, fact));
    }

    return {
      assetId,
      dossierId,
      extraction,
      facts,
      dossier: await this.getDossierById(userId, dossierId),
    };
  }

  async archiveDuplicateListings(keepId: string, duplicateIds: string[]) {
    return industrialIntelRepository.archiveDuplicateListings(keepId, duplicateIds);
  }

  async getPublicLinkCandidates(listingId: string): Promise<IntelPublicLinkCandidate[]> {
    return industrialIntelRepository.getPublicLinkCandidates(listingId);
  }

  async resolvePublicLinkCandidates(listingId: string) {
    const listing = await industrialIntelRepository.getListingById(listingId);
    if (!listing) return null;

    const result = await resolvePublicLinkCandidates(listing);
    if (result.status === "not_configured") {
      return {
        ...result,
        persistedCandidates: await industrialIntelRepository.getPublicLinkCandidates(listingId),
      };
    }

    const persistedCandidates = await industrialIntelRepository.upsertPublicLinkCandidates(listingId, result.candidates);
    return {
      ...result,
      persistedCandidates,
    };
  }

  async createManualPublicLinkCandidate(
    listingId: string,
    input: CreateManualPublicLinkInput,
  ): Promise<IntelPublicLinkCandidate | null> {
    const listing = await industrialIntelRepository.getListingById(listingId);
    if (!listing) return null;

    const url = new URL(input.candidateUrl);
    const candidates = await industrialIntelRepository.upsertPublicLinkCandidates(listingId, [
      {
        candidateUrl: url.toString(),
        domain: url.hostname.replace(/^www\./, ""),
        title: input.title || listing.title,
        snippet: input.snippet || "Manually verified broker listing link.",
        confidence: 100,
        source: "manual",
      },
    ]);
    const candidate = candidates.find((item) => item.candidateUrl === url.toString());
    if (!candidate) return null;

    return industrialIntelRepository.updatePublicLinkCandidateStatus(listingId, candidate.id, "approved");
  }

  async approvePublicLinkCandidate(listingId: string, candidateId: string): Promise<IntelPublicLinkCandidate | null> {
    return industrialIntelRepository.updatePublicLinkCandidateStatus(listingId, candidateId, "approved");
  }

  async rejectPublicLinkCandidate(listingId: string, candidateId: string): Promise<IntelPublicLinkCandidate | null> {
    return industrialIntelRepository.updatePublicLinkCandidateStatus(listingId, candidateId, "rejected");
  }

  async getRecentChanges(): Promise<IntelChangeListItem[]> {
    return industrialIntelRepository.getRecentChanges();
  }

  async getRequirements(userId: string): Promise<IntelRequirementListItem[]> {
    return industrialIntelRepository.getRequirements(userId);
  }

  async getRequirementById(userId: string, id: string): Promise<IntelRequirementDetail | null> {
    return industrialIntelRepository.getRequirementById(userId, id);
  }

  async createRequirement(userId: string, input: CreateIntelRequirementInput): Promise<IntelRequirementDetail> {
    return industrialIntelRepository.createRequirement(userId, input);
  }

  async updateRequirement(userId: string, id: string, input: UpdateIntelRequirementInput): Promise<IntelRequirementDetail | null> {
    return industrialIntelRepository.updateRequirement(userId, id, input);
  }

  async getRequirementPreferences(userId: string, requirementId: string): Promise<IntelRequirementPreference[]> {
    return industrialIntelRepository.getRequirementPreferences(userId, requirementId);
  }

  async replaceRequirementPreferences(
    userId: string,
    requirementId: string,
    input: ReplaceIntelRequirementPreferencesInput,
  ): Promise<IntelRequirementPreference[] | null> {
    return industrialIntelRepository.replaceRequirementPreferences(userId, requirementId, input);
  }

  async getRequirementListingDecisions(
    userId: string,
    requirementId: string,
  ): Promise<IntelRequirementListingDecision[]> {
    return industrialIntelRepository.getRequirementListingDecisions(userId, requirementId);
  }

  async upsertRequirementListingDecision(
    userId: string,
    requirementId: string,
    listingId: string,
    input: UpsertIntelRequirementListingDecisionInput,
  ): Promise<IntelRequirementListingDecision | null> {
    return industrialIntelRepository.upsertRequirementListingDecision(userId, requirementId, listingId, input);
  }

  async getSurveys(userId: string): Promise<IntelSurveyListItem[]> {
    return industrialIntelRepository.getSurveys(userId);
  }

  async getSurveyById(userId: string, id: string): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.getSurveyById(userId, id);
  }

  async getSurveyByShareToken(token: string): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.getSurveyByShareToken(token);
  }

  async getSurveyEvents(userId: string, surveyId: string): Promise<IntelSurveyEvent[]> {
    return industrialIntelRepository.getSurveyEvents(userId, surveyId);
  }

  async createSurvey(userId: string, input: CreateIntelSurveyInput): Promise<IntelSurveyDetail> {
    return industrialIntelRepository.createSurvey(userId, input);
  }

  async updateSurvey(userId: string, id: string, input: UpdateIntelSurveyInput): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.updateSurvey(userId, id, input);
  }

  async addSurveyItem(
    userId: string,
    surveyId: string,
    input: CreateIntelSurveyItemInput,
  ): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.addSurveyItem(userId, surveyId, input);
  }

  async updateSurveyItem(
    userId: string,
    surveyId: string,
    itemId: string,
    input: UpdateIntelSurveyItemInput,
  ): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.updateSurveyItem(userId, surveyId, itemId, input);
  }

  async reorderSurveyItems(
    userId: string,
    surveyId: string,
    orderedItemIds: string[],
  ): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.reorderSurveyItems(userId, surveyId, orderedItemIds);
  }

  async deleteSurveyItem(userId: string, surveyId: string, itemId: string): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.deleteSurveyItem(userId, surveyId, itemId);
  }

  async createSurveyItemAssetUpload(
    userId: string,
    surveyId: string,
    itemId: string,
    input: CreateSurveyItemAssetUploadInput,
  ) {
    const survey = await industrialIntelRepository.getSurveyById(userId, surveyId);
    if (!survey) return null;
    const item = survey.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;

    const assetId = randomUUID();
    const fileName = sanitizeFileName(input.fileName);
    const storagePath = `surveys/${surveyId}/items/${itemId}/${assetId}-${fileName}`;
    const upload = await createIntelAssetSignedUpload(storagePath);

    const assetInput: CreateIntelListingAssetInput = {
      id: assetId,
      listingId: item.listingId,
      surveyId,
      surveyItemId: itemId,
      assetType: input.assetType || "brochure",
      fileName,
      contentType: input.contentType,
      fileSize: input.fileSize,
      storageBucket: upload.bucket || getIntelAssetBucket(),
      storagePath: upload.path || storagePath,
      source: "upload",
      status: "pending",
    };

    const asset = await industrialIntelRepository.createSurveyItemAsset(userId, surveyId, itemId, assetInput);
    if (!asset) return null;
    return { asset, upload };
  }

  async completeListingAsset(userId: string, assetId: string): Promise<IntelListingAssetWithUrl | null> {
    const asset = await industrialIntelRepository.completeListingAsset(userId, assetId);
    if (!asset) return null;
    const [signed] = await signIntelListingAssets([asset]);
    return signed;
  }

  async getSurveyAssets(userId: string, surveyId: string): Promise<IntelListingAssetWithUrl[]> {
    const assets = await industrialIntelRepository.getSurveyAssets(userId, surveyId);
    return signIntelListingAssets(assets);
  }

  async getSharedSurveyAssets(token: string): Promise<IntelListingAssetWithUrl[]> {
    const assets = await industrialIntelRepository.getSharedSurveyAssets(token);
    return signIntelListingAssets(assets);
  }

  async ingestManualListing(_userId: string, input: ManualIntelListingInput) {
    return ingestManualIntelListing(null, input);
  }

  async ingestManualListingUpload(_userId: string, input: ManualIntelListingUploadInput) {
    return ingestManualIntelListingUpload(null, input);
  }

  async previewManualListing(sourceUrl: string) {
    return previewManualIntelListing(sourceUrl);
  }

  async runSource(userId: string, sourceSlug: string) {
    return runIndustrialIntelSource(sourceSlug, {
      triggerType: "manual_ui",
      // Supabase auth users are not guaranteed to exist in public.users yet.
      // Keep source refreshes reliable until we add a proper Tool B audit actor model.
      initiatedByUserId: null,
    });
  }
}

export const industrialIntelService = new IndustrialIntelService();
