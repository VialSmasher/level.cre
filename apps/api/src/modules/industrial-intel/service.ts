import {
  type CreateIntelListingAssetInput,
  type CreateIntelPropertyDossierInput,
  type CreateIntelRequirementInput,
  type CreateIntelSurveyInput,
  type CreateIntelSurveyItemInput,
  type IntelChangeListItem,
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
  getIntelAssetBucket,
  signIntelListingAssets,
} from "./assetStorage";

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

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._',!$@=;:+?()& -]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "asset";
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
