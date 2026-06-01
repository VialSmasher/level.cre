import {
  type CreateIntelRequirementInput,
  type IntelChangeListItem,
  type IntelRequirementDetail,
  type IntelRequirementListItem,
  type IntelRequirementPreference,
  industrialIntelRepository,
  type IntelListingListItem,
  type IntelRunListItem,
  type IntelSourceListItem,
  type IntelSummary,
  type ReplaceIntelRequirementPreferencesInput,
  type UpdateIntelRequirementInput,
} from "./repo";
import {
  ingestManualIntelListing,
  ingestManualIntelListingUpload,
  type ManualIntelListingInput,
  type ManualIntelListingUploadInput,
} from "./manualIngest";
import { previewManualIntelListing } from "./manualPreview";
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
