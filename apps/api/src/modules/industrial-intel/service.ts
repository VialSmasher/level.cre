import {
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
  type IntelDuplicateGroup,
  type IntelRunListItem,
  type IntelSourceListItem,
  type IntelSummary,
  type ReplaceIntelRequirementPreferencesInput,
  type UpdateIntelRequirementInput,
  type UpdateIntelSurveyInput,
  type UpdateIntelSurveyItemInput,
} from "./repo";
import {
  ingestManualIntelListing,
  ingestManualIntelListingUpload,
  type ManualIntelListingInput,
  type ManualIntelListingUploadInput,
} from "./manualIngest";
import { previewManualIntelListing } from "./manualPreview";
import { resolvePublicLinkCandidates } from "./publicLinkResolver";
import { runIndustrialIntelSource } from "./sourceRegistry";

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

  async deleteSurveyItem(userId: string, surveyId: string, itemId: string): Promise<IntelSurveyDetail | null> {
    return industrialIntelRepository.deleteSurveyItem(userId, surveyId, itemId);
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
