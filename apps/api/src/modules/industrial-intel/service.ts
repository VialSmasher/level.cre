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
}

export const industrialIntelService = new IndustrialIntelService();
