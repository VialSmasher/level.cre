export type IntelSourceAdapterSlug =
  | 'cwedm'
  | 'nai_edmonton'
  | 'avison_young'
  | 'jll'
  | 'cbre'
  | 'colliers'
  | 'manual_url';

export type NormalizedIntelListingRecord = {
  sourceRecordKey: string;
  externalId?: string | null;
  status?: string | null;
  listingType?: string | null;
  assetType?: string | null;
  title: string;
  address?: string | null;
  market?: string | null;
  submarket?: string | null;
  lat?: number | null;
  lng?: number | null;
  availableSf?: number | null;
  landAcres?: number | null;
  totalPrice?: number | null;
  pricePerAcre?: number | null;
  minDivisibleSf?: number | null;
  clearHeightFt?: number | null;
  brochureUrl?: string | null;
  sourceUrl?: string | null;
  rawPayload: Record<string, unknown>;
  contentHash: string;
};

export type IntelSourceRunContext = {
  sourceId: string;
  sourceSlug: IntelSourceAdapterSlug;
  triggerType?: string;
  initiatedByUserId?: string | null;
  preserveMissing?: boolean;
};

export type IntelSourceRunResult = {
  sourceSlug: IntelSourceAdapterSlug;
  records: NormalizedIntelListingRecord[];
};
