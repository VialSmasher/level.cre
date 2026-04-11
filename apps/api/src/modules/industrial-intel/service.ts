import {
  type IntelChangeListItem,
  industrialIntelRepository,
  type IntelListingListItem,
  type IntelRunListItem,
  type IntelSourceListItem,
  type IntelSummary,
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
}

export const industrialIntelService = new IndustrialIntelService();
