import { pool } from "../../db";
import { getIndustrialIntelSeedPreview } from "./seed";

export type IntelSummary = {
  activeListings: number;
  newListings: number;
  changedListings: number;
  removedListings: number;
  lastRunAt: string | null;
};

export type IntelSourceListItem = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  feedUrl: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

export type IntelRunListItem = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  triggerType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  recordsRemoved: number;
  errorMessage: string | null;
};

export type IntelListingListItem = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  title: string;
  address: string | null;
  normalizedAddress: string | null;
  market: string | null;
  submarket: string | null;
  status: string;
  listingType: string;
  assetType: string;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string | null;
  geocodeConfidence: number | null;
  geocodeSource: string | null;
  dataQualityStatus: string | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  leaseRatePsf: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  removedAt: string | null;
};

export type IntelDuplicateListingItem = IntelListingListItem & {
  sourceRecordKey: string;
  duplicateScore: number;
};

export type IntelDuplicateGroup = {
  key: string;
  reason: string;
  suggestedKeepId: string;
  listings: IntelDuplicateListingItem[];
};

export type IntelPublicLinkStatus = "pending" | "approved" | "rejected";
export type IntelPublicLinkSource = "resolver" | "manual";

export type IntelPublicLinkCandidate = {
  id: string;
  listingId: string;
  candidateUrl: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  confidence: number;
  status: IntelPublicLinkStatus;
  source: IntelPublicLinkSource;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UpsertIntelPublicLinkCandidateInput = {
  candidateUrl: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  confidence: number;
  source?: IntelPublicLinkSource;
};

export type IntelChangeListItem = {
  id: string;
  listingId: string;
  listingTitle: string;
  sourceName: string | null;
  changeType: string;
  changeSummary: string | null;
  observedAt: string | null;
};

export type IntelRequirementListItem = {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  dealType: string;
  market: string | null;
  submarket: string | null;
  minSf: number | null;
  maxSf: number | null;
  isOffMarketSearchEnabled: boolean;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type IntelRequirementPreference = {
  id: string;
  requirementId: string;
  key: string;
  operator: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  weight: number;
  updatedAt: string | null;
};

export type IntelRequirementDetail = IntelRequirementListItem & {
  minClearHeightFt: number | null;
  maxBudgetPsf: number | null;
  requiredDockDoors: number | null;
  requiredGradeDoors: number | null;
  minYardAcres: number | null;
  powerNotes: string | null;
  officeNotes: string | null;
  timingNotes: string | null;
  specialNotes: string | null;
  createdByUserId: string;
  createdAt: string | null;
  preferences: IntelRequirementPreference[];
};

export type CreateIntelRequirementInput = {
  title: string;
  clientName?: string | null;
  status?: string | null;
  dealType?: string | null;
  market?: string | null;
  submarket?: string | null;
  minSf?: number | null;
  maxSf?: number | null;
  minClearHeightFt?: number | null;
  maxBudgetPsf?: number | null;
  requiredDockDoors?: number | null;
  requiredGradeDoors?: number | null;
  minYardAcres?: number | null;
  powerNotes?: string | null;
  officeNotes?: string | null;
  timingNotes?: string | null;
  specialNotes?: string | null;
  isOffMarketSearchEnabled?: boolean | null;
};

export type UpdateIntelRequirementInput = Partial<CreateIntelRequirementInput>;

export type ReplaceIntelRequirementPreferencesInput = Array<{
  key: string;
  operator?: string | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  weight?: number | null;
}>;

export type IntelRequirementListingDecisionValue = "shortlist" | "maybe" | "rejected";

export type IntelRequirementListingDecision = {
  requirementId: string;
  listingId: string;
  decision: IntelRequirementListingDecisionValue;
  notes: string | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UpsertIntelRequirementListingDecisionInput = {
  decision: IntelRequirementListingDecisionValue;
  notes?: string | null;
  sortOrder?: number | null;
};

export type IntelSurveyStatus = "draft" | "shared" | "archived";

export type IntelSurveyListItem = {
  id: string;
  requirementId: string | null;
  requirementTitle: string | null;
  title: string;
  clientName: string | null;
  status: IntelSurveyStatus;
  shareToken: string | null;
  itemCount: number;
  visibleItemCount: number;
  createdByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type IntelSurveyListingBrief = IntelListingListItem;

export type IntelSurveyItem = {
  id: string;
  surveyId: string;
  listingId: string;
  sortOrder: number;
  recommendationLabel: string | null;
  brokerNotes: string | null;
  clientNotes: string | null;
  hidden: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  listing: IntelSurveyListingBrief;
};

export type IntelSurveyDetail = IntelSurveyListItem & {
  items: IntelSurveyItem[];
};

export type CreateIntelSurveyInput = {
  requirementId?: string | null;
  title: string;
  clientName?: string | null;
  status?: IntelSurveyStatus | null;
};

export type UpdateIntelSurveyInput = Partial<CreateIntelSurveyInput> & {
  shareToken?: string | null;
};

export type CreateIntelSurveyItemInput = {
  listingId: string;
  sortOrder?: number | null;
  recommendationLabel?: string | null;
  brokerNotes?: string | null;
  clientNotes?: string | null;
  hidden?: boolean | null;
};

export type UpdateIntelSurveyItemInput = Partial<Omit<CreateIntelSurveyItemInput, "listingId">>;

const CORE_TABLES = [
  "intel_sources",
  "intel_listings",
  "intel_ingest_runs",
  "intel_listing_changes",
] as const;

const SHOULD_USE_SAMPLE_FALLBACK = process.env.NODE_ENV !== "production";
const REQUIREMENT_TABLES = [
  "intel_requirements",
  "intel_requirement_preferences",
] as const;

const REQUIREMENT_DECISION_TABLES = [
  ...REQUIREMENT_TABLES,
  "intel_requirement_listing_decisions",
] as const;

const SURVEY_TABLES = [
  "intel_surveys",
  "intel_survey_items",
] as const;

const PUBLIC_LINK_TABLES = [
  "intel_listing_public_link_candidates",
] as const;

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function intOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function boolOrFalse(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function boolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

function isRecoverableIntelSchemaError(error: unknown): boolean {
  const code = String((error as any)?.code || "");
  const message = String((error as any)?.message || "");
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "ENOTFOUND" ||
    code === "ENETUNREACH" ||
    code === "ECONNREFUSED" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    /ENOTFOUND|ENETUNREACH|ECONNREFUSED|self-signed certificate|does not exist/i.test(message)
  );
}

export class IndustrialIntelRepository {
  async hasCoreTables(): Promise<boolean> {
    const result = await pool.query<{
      table_name: string;
    }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('intel_sources', 'intel_listings', 'intel_ingest_runs', 'intel_listing_changes')
    `);

    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    return CORE_TABLES.every((name) => found.has(name));
  }

  async hasRequirementTables(): Promise<boolean> {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('intel_requirements', 'intel_requirement_preferences')
    `);

    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    return REQUIREMENT_TABLES.every((name) => found.has(name));
  }

  async hasRequirementDecisionTables(): Promise<boolean> {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('intel_requirements', 'intel_requirement_preferences', 'intel_requirement_listing_decisions')
    `);

    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    return REQUIREMENT_DECISION_TABLES.every((name) => found.has(name));
  }

  async hasSurveyTables(): Promise<boolean> {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('intel_surveys', 'intel_survey_items')
    `);

    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    return SURVEY_TABLES.every((name) => found.has(name));
  }

  async hasPublicLinkTables(): Promise<boolean> {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('intel_listing_public_link_candidates')
    `);

    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    return PUBLIC_LINK_TABLES.every((name) => found.has(name));
  }

  async ensurePublicLinkTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.intel_listing_public_link_candidates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
        candidate_url text NOT NULL,
        domain varchar NOT NULL,
        title text,
        snippet text,
        confidence integer NOT NULL DEFAULT 0,
        status varchar NOT NULL DEFAULT 'pending',
        source varchar NOT NULL DEFAULT 'resolver',
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT chk_intel_public_link_candidate_status
          CHECK (status IN ('pending', 'approved', 'rejected')),
        CONSTRAINT chk_intel_public_link_candidate_source
          CHECK (source IN ('resolver', 'manual'))
      )
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_public_link_candidate_url
        ON public.intel_listing_public_link_candidates (listing_id, candidate_url)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_public_link_candidates_listing
        ON public.intel_listing_public_link_candidates (listing_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_public_link_candidates_status
        ON public.intel_listing_public_link_candidates (status)
    `);
  }

  async ensureSurveyTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.intel_surveys (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        requirement_id varchar REFERENCES public.intel_requirements(id) ON DELETE SET NULL,
        title varchar NOT NULL,
        client_name varchar,
        status varchar NOT NULL DEFAULT 'draft',
        share_token varchar UNIQUE,
        created_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT chk_intel_surveys_status
          CHECK (status IN ('draft', 'shared', 'archived'))
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_surveys_requirement
        ON public.intel_surveys (requirement_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_surveys_created_by_user
        ON public.intel_surveys (created_by_user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_surveys_status
        ON public.intel_surveys (status)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.intel_survey_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id varchar NOT NULL REFERENCES public.intel_surveys(id) ON DELETE CASCADE,
        listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
        sort_order integer NOT NULL DEFAULT 0,
        recommendation_label varchar,
        broker_notes text,
        client_notes text,
        hidden boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT uq_intel_survey_items_listing UNIQUE (survey_id, listing_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_survey_items_survey
        ON public.intel_survey_items (survey_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_survey_items_listing
        ON public.intel_survey_items (listing_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_survey_items_sort
        ON public.intel_survey_items (survey_id, sort_order)
    `);
  }

  async getSummary(): Promise<IntelSummary> {
    try {
      if (!(await this.hasCoreTables())) {
        if (SHOULD_USE_SAMPLE_FALLBACK) {
          return getIndustrialIntelSeedPreview().summary;
        }
        return {
          activeListings: 0,
          newListings: 0,
          changedListings: 0,
          removedListings: 0,
          lastRunAt: null,
        };
      }

      const result = await pool.query<{
        active_listings: string;
        new_listings: string;
        changed_listings: string;
        removed_listings: string;
        last_run_at: Date | null;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM public.intel_listings WHERE removed_at IS NULL) AS active_listings,
          (
            SELECT COUNT(*)::int
            FROM public.intel_listing_changes
            WHERE change_type = 'new'
              AND observed_at >= NOW() - INTERVAL '1 day'
          ) AS new_listings,
          (
            SELECT COUNT(*)::int
            FROM public.intel_listing_changes
            WHERE change_type = 'updated'
              AND observed_at >= NOW() - INTERVAL '1 day'
          ) AS changed_listings,
          (
            SELECT COUNT(*)::int
            FROM public.intel_listing_changes
            WHERE change_type = 'removed'
              AND observed_at >= NOW() - INTERVAL '1 day'
          ) AS removed_listings,
          (
            SELECT MAX(completed_at)
            FROM public.intel_ingest_runs
            WHERE status = 'completed'
          ) AS last_run_at
      `);

      const row = result.rows[0];
      return {
        activeListings: intOrZero(row?.active_listings),
        newListings: intOrZero(row?.new_listings),
        changedListings: intOrZero(row?.changed_listings),
        removedListings: intOrZero(row?.removed_listings),
        lastRunAt: isoOrNull(row?.last_run_at),
      };
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        if (SHOULD_USE_SAMPLE_FALLBACK) {
          return getIndustrialIntelSeedPreview().summary;
        }
        return {
          activeListings: 0,
          newListings: 0,
          changedListings: 0,
          removedListings: 0,
          lastRunAt: null,
        };
      }
      throw error;
    }
  }

  async getSources(): Promise<IntelSourceListItem[]> {
    try {
      if (!(await this.hasCoreTables())) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().sources : [];
      }

      const result = await pool.query<{
        id: string;
        name: string;
        slug: string;
        kind: string;
        feed_url: string | null;
        is_active: boolean;
        updated_at: Date | null;
      }>(`
        SELECT id, name, slug, kind, feed_url, is_active, updated_at
        FROM public.intel_sources
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      `);

      return result.rows.map((row: {
        id: string;
        name: string;
        slug: string;
        kind: string;
        feed_url: string | null;
        is_active: boolean;
        updated_at: Date | null;
      }) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        kind: row.kind,
        feedUrl: row.feed_url,
        isActive: Boolean(row.is_active),
        updatedAt: isoOrNull(row.updated_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().sources : [];
      }
      throw error;
    }
  }

  async getRuns(limit = 20): Promise<IntelRunListItem[]> {
    try {
      if (!(await this.hasCoreTables())) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().runs.slice(0, limit) : [];
      }

      const result = await pool.query<{
        id: string;
        source_id: string | null;
        source_name: string | null;
        trigger_type: string;
        status: string;
        started_at: Date | null;
        completed_at: Date | null;
        records_seen: string;
        records_new: string;
        records_updated: string;
        records_removed: string;
        error_message: string | null;
      }>(
        `
          SELECT
            runs.id,
            runs.source_id,
            sources.name AS source_name,
            runs.trigger_type,
            runs.status,
            runs.started_at,
            runs.completed_at,
            runs.records_seen,
            runs.records_new,
            runs.records_updated,
            runs.records_removed,
            runs.error_message
          FROM public.intel_ingest_runs runs
          LEFT JOIN public.intel_sources sources ON sources.id = runs.source_id
          ORDER BY runs.started_at DESC NULLS LAST
          LIMIT $1
        `,
        [limit],
      );

      return result.rows.map((row: {
        id: string;
        source_id: string | null;
        source_name: string | null;
        trigger_type: string;
        status: string;
        started_at: Date | null;
        completed_at: Date | null;
        records_seen: string;
        records_new: string;
        records_updated: string;
        records_removed: string;
        error_message: string | null;
      }) => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        triggerType: row.trigger_type,
        status: row.status,
        startedAt: isoOrNull(row.started_at),
        completedAt: isoOrNull(row.completed_at),
        recordsSeen: intOrZero(row.records_seen),
        recordsNew: intOrZero(row.records_new),
        recordsUpdated: intOrZero(row.records_updated),
        recordsRemoved: intOrZero(row.records_removed),
        errorMessage: row.error_message,
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().runs.slice(0, limit) : [];
      }
      throw error;
    }
  }

  async getListings(limit = 500): Promise<IntelListingListItem[]> {
    try {
      if (!(await this.hasCoreTables())) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().listings.slice(0, limit) : [];
      }

      const result = await pool.query<{
        id: string;
        source_id: string;
        source_name: string | null;
        title: string;
        address: string | null;
        normalized_address: string | null;
        market: string | null;
        submarket: string | null;
        status: string;
        listing_type: string;
        asset_type: string;
        lat: string | null;
        lng: string | null;
        geocode_status: string | null;
        geocode_confidence: string | null;
        geocode_source: string | null;
        data_quality_status: string | null;
        available_sf: number | null;
        land_acres: string | null;
        total_price: string | null;
        price_per_acre: string | null;
        raw_payload: Record<string, unknown> | null;
        brochure_url: string | null;
        source_url: string | null;
        last_seen_at: Date | null;
        removed_at: Date | null;
      }>(
        `
          SELECT
            listings.id,
            listings.source_id,
            sources.name AS source_name,
            listings.title,
            listings.address,
            COALESCE(listings.normalized_address, listings.address) AS normalized_address,
            listings.market,
            listings.submarket,
            listings.status,
            listings.listing_type,
            listings.asset_type,
            listings.lat,
            listings.lng,
            listings.geocode_status,
            listings.geocode_confidence,
            listings.geocode_source,
            listings.data_quality_status,
            listings.available_sf,
            listings.land_acres,
            listings.total_price,
            listings.price_per_acre,
            listings.raw_payload,
            listings.brochure_url,
            listings.source_url,
            listings.last_seen_at,
            listings.removed_at
          FROM public.intel_listings listings
          LEFT JOIN public.intel_sources sources ON sources.id = listings.source_id
          ORDER BY listings.last_seen_at DESC NULLS LAST, listings.created_at DESC NULLS LAST
          LIMIT $1
        `,
        [limit],
      );

      return result.rows.map((row: {
        id: string;
        source_id: string;
        source_name: string | null;
        title: string;
        address: string | null;
        normalized_address: string | null;
        market: string | null;
        submarket: string | null;
        status: string;
        listing_type: string;
        asset_type: string;
        lat: string | null;
        lng: string | null;
        geocode_status: string | null;
        geocode_confidence: string | null;
        geocode_source: string | null;
        data_quality_status: string | null;
        available_sf: number | null;
        land_acres: string | null;
        total_price: string | null;
        price_per_acre: string | null;
        raw_payload: Record<string, unknown> | null;
        brochure_url: string | null;
        source_url: string | null;
        last_seen_at: Date | null;
        removed_at: Date | null;
      }) => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        title: row.title,
        address: row.address,
        normalizedAddress: row.normalized_address,
        market: row.market,
        submarket: row.submarket,
        status: row.status,
        listingType: row.listing_type,
        assetType: row.asset_type,
        latitude: numOrNull(row.lat),
        longitude: numOrNull(row.lng),
        geocodeStatus: row.geocode_status,
        geocodeConfidence: numOrNull(row.geocode_confidence),
        geocodeSource: row.geocode_source,
        dataQualityStatus: row.data_quality_status,
        availableSf: intOrNull(row.available_sf),
        landAcres: numOrNull(row.land_acres),
        totalPrice: numOrNull(row.total_price),
        pricePerAcre: numOrNull(row.price_per_acre),
        leaseRatePsf: numOrNull(row.raw_payload?.leaseRatePsf),
        brochureUrl: row.brochure_url,
        sourceUrl: row.source_url,
        lastSeenAt: isoOrNull(row.last_seen_at),
        removedAt: isoOrNull(row.removed_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().listings.slice(0, limit) : [];
      }
      throw error;
    }
  }

  async getListingById(id: string): Promise<IntelListingListItem | null> {
    if (!(await this.hasCoreTables())) return null;

    const result = await pool.query<{
      id: string;
      source_id: string;
      source_name: string | null;
      title: string;
      address: string | null;
      normalized_address: string | null;
      market: string | null;
      submarket: string | null;
      status: string;
      listing_type: string;
      asset_type: string;
      lat: string | null;
      lng: string | null;
      geocode_status: string | null;
      geocode_confidence: string | null;
      geocode_source: string | null;
      data_quality_status: string | null;
      available_sf: number | null;
      land_acres: string | null;
      total_price: string | null;
      price_per_acre: string | null;
      raw_payload: Record<string, unknown> | null;
      brochure_url: string | null;
      source_url: string | null;
      last_seen_at: Date | null;
      removed_at: Date | null;
    }>(
      `
        SELECT
          listings.id,
          listings.source_id,
          sources.name AS source_name,
          listings.title,
          listings.address,
          COALESCE(listings.normalized_address, listings.address) AS normalized_address,
          listings.market,
          listings.submarket,
          listings.status,
          listings.listing_type,
          listings.asset_type,
          listings.lat,
          listings.lng,
          listings.geocode_status,
          listings.geocode_confidence,
          listings.geocode_source,
          listings.data_quality_status,
          listings.available_sf,
          listings.land_acres,
          listings.total_price,
          listings.price_per_acre,
          listings.raw_payload,
          listings.brochure_url,
          listings.source_url,
          listings.last_seen_at,
          listings.removed_at
        FROM public.intel_listings listings
        LEFT JOIN public.intel_sources sources ON sources.id = listings.source_id
        WHERE listings.id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      title: row.title,
      address: row.address,
      normalizedAddress: row.normalized_address,
      market: row.market,
      submarket: row.submarket,
      status: row.status,
      listingType: row.listing_type,
      assetType: row.asset_type,
      latitude: numOrNull(row.lat),
      longitude: numOrNull(row.lng),
      geocodeStatus: row.geocode_status,
      geocodeConfidence: numOrNull(row.geocode_confidence),
      geocodeSource: row.geocode_source,
      dataQualityStatus: row.data_quality_status,
      availableSf: intOrNull(row.available_sf),
      landAcres: numOrNull(row.land_acres),
      totalPrice: numOrNull(row.total_price),
      pricePerAcre: numOrNull(row.price_per_acre),
      leaseRatePsf: numOrNull(row.raw_payload?.leaseRatePsf),
      brochureUrl: row.brochure_url,
      sourceUrl: row.source_url,
      lastSeenAt: isoOrNull(row.last_seen_at),
      removedAt: isoOrNull(row.removed_at),
    };
  }

  async getPublicLinkCandidates(listingId: string): Promise<IntelPublicLinkCandidate[]> {
    if (!(await this.hasCoreTables())) return [];
    await this.ensurePublicLinkTables();

    const result = await pool.query<{
      id: string;
      listing_id: string;
      candidate_url: string;
      domain: string;
      title: string | null;
      snippet: string | null;
      confidence: number | string;
      status: IntelPublicLinkStatus;
      source: IntelPublicLinkSource;
      created_at: Date | null;
      updated_at: Date | null;
    }>(
      `
        SELECT
          id,
          listing_id,
          candidate_url,
          domain,
          title,
          snippet,
          confidence,
          status,
          source,
          created_at,
          updated_at
        FROM public.intel_listing_public_link_candidates
        WHERE listing_id = $1
        ORDER BY
          CASE status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
          confidence DESC,
          updated_at DESC NULLS LAST
      `,
      [listingId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      candidateUrl: row.candidate_url,
      domain: row.domain,
      title: row.title,
      snippet: row.snippet,
      confidence: intOrZero(row.confidence),
      status: row.status,
      source: row.source,
      createdAt: isoOrNull(row.created_at),
      updatedAt: isoOrNull(row.updated_at),
    }));
  }

  async upsertPublicLinkCandidates(
    listingId: string,
    candidates: UpsertIntelPublicLinkCandidateInput[],
  ): Promise<IntelPublicLinkCandidate[]> {
    if (!(await this.hasCoreTables())) return [];
    await this.ensurePublicLinkTables();

    for (const candidate of candidates) {
      await pool.query(
        `
          INSERT INTO public.intel_listing_public_link_candidates (
            listing_id,
            candidate_url,
            domain,
            title,
            snippet,
            confidence,
            source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (listing_id, candidate_url)
          DO UPDATE SET
            domain = EXCLUDED.domain,
            title = EXCLUDED.title,
            snippet = EXCLUDED.snippet,
            confidence = GREATEST(public.intel_listing_public_link_candidates.confidence, EXCLUDED.confidence),
            source = CASE
              WHEN public.intel_listing_public_link_candidates.source = 'manual' THEN 'manual'
              ELSE EXCLUDED.source
            END,
            updated_at = now()
        `,
        [
          listingId,
          candidate.candidateUrl,
          candidate.domain,
          candidate.title || null,
          candidate.snippet || null,
          Math.max(0, Math.min(100, Math.round(candidate.confidence))),
          candidate.source || "resolver",
        ],
      );
    }

    return this.getPublicLinkCandidates(listingId);
  }

  async updatePublicLinkCandidateStatus(
    listingId: string,
    candidateId: string,
    status: IntelPublicLinkStatus,
  ): Promise<IntelPublicLinkCandidate | null> {
    if (!(await this.hasCoreTables())) return null;
    await this.ensurePublicLinkTables();

    const result = await pool.query<{
      id: string;
      listing_id: string;
      candidate_url: string;
      domain: string;
      title: string | null;
      snippet: string | null;
      confidence: number | string;
      status: IntelPublicLinkStatus;
      source: IntelPublicLinkSource;
      created_at: Date | null;
      updated_at: Date | null;
    }>(
      `
        UPDATE public.intel_listing_public_link_candidates
        SET status = $3, updated_at = now()
        WHERE listing_id = $1 AND id = $2
        RETURNING
          id,
          listing_id,
          candidate_url,
          domain,
          title,
          snippet,
          confidence,
          status,
          source,
          created_at,
          updated_at
      `,
      [listingId, candidateId, status],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      listingId: row.listing_id,
      candidateUrl: row.candidate_url,
      domain: row.domain,
      title: row.title,
      snippet: row.snippet,
      confidence: intOrZero(row.confidence),
      status: row.status,
      source: row.source,
      createdAt: isoOrNull(row.created_at),
      updatedAt: isoOrNull(row.updated_at),
    };
  }

  async getListingDuplicates(limit = 50): Promise<IntelDuplicateGroup[]> {
    if (!(await this.hasCoreTables())) {
      return [];
    }

    const result = await pool.query<{
      id: string;
      source_id: string;
      source_name: string | null;
      source_record_key: string;
      title: string;
      address: string | null;
      normalized_address: string | null;
      market: string | null;
      submarket: string | null;
      status: string;
      listing_type: string;
      asset_type: string;
      lat: string | null;
      lng: string | null;
      geocode_status: string | null;
      geocode_confidence: string | null;
      geocode_source: string | null;
      data_quality_status: string | null;
      available_sf: number | null;
      land_acres: string | null;
      total_price: string | null;
      price_per_acre: string | null;
      raw_payload: Record<string, unknown> | null;
      brochure_url: string | null;
      source_url: string | null;
      last_seen_at: Date | null;
      removed_at: Date | null;
    }>(
      `
        SELECT
          listings.id,
          listings.source_id,
          sources.name AS source_name,
          listings.source_record_key,
          listings.title,
          listings.address,
          COALESCE(listings.normalized_address, listings.address) AS normalized_address,
          listings.market,
          listings.submarket,
          listings.status,
          listings.listing_type,
          listings.asset_type,
          listings.lat,
          listings.lng,
          listings.geocode_status,
          listings.geocode_confidence,
          listings.geocode_source,
          listings.data_quality_status,
          listings.available_sf,
          listings.land_acres,
          listings.total_price,
          listings.price_per_acre,
          listings.raw_payload,
          listings.brochure_url,
          listings.source_url,
          listings.last_seen_at,
          listings.removed_at
        FROM public.intel_listings listings
        LEFT JOIN public.intel_sources sources ON sources.id = listings.source_id
        WHERE listings.removed_at IS NULL
        ORDER BY listings.last_seen_at DESC NULLS LAST, listings.created_at DESC NULLS LAST
        LIMIT 2000
      `,
    );

    const listings = result.rows.map((row) => {
      const item: IntelDuplicateListingItem = {
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceRecordKey: row.source_record_key,
        title: row.title,
        address: row.address,
        normalizedAddress: row.normalized_address,
        market: row.market,
        submarket: row.submarket,
        status: row.status,
        listingType: row.listing_type,
        assetType: row.asset_type,
        latitude: numOrNull(row.lat),
        longitude: numOrNull(row.lng),
        geocodeStatus: row.geocode_status,
        geocodeConfidence: numOrNull(row.geocode_confidence),
        geocodeSource: row.geocode_source,
        dataQualityStatus: row.data_quality_status,
        availableSf: intOrNull(row.available_sf),
        landAcres: numOrNull(row.land_acres),
        totalPrice: numOrNull(row.total_price),
        pricePerAcre: numOrNull(row.price_per_acre),
        leaseRatePsf: numOrNull(row.raw_payload?.leaseRatePsf),
        brochureUrl: row.brochure_url,
        sourceUrl: row.source_url,
        lastSeenAt: isoOrNull(row.last_seen_at),
        removedAt: isoOrNull(row.removed_at),
        duplicateScore: 0,
      };
      item.duplicateScore = [
        item.latitude && item.longitude ? 25 : 0,
        item.availableSf ? 20 : 0,
        item.totalPrice || item.leaseRatePsf ? 20 : 0,
        item.normalizedAddress || item.address ? 15 : 0,
        item.sourceName?.toLowerCase().includes("costar") ? 10 : 0,
        item.sourceUrl || item.brochureUrl ? 10 : 0,
      ].reduce((sum, value) => sum + value, 0);
      return item;
    });

    const groups = new Map<string, { reason: string; listings: IntelDuplicateListingItem[] }>();
    const addGroup = (key: string, reason: string, listing: IntelDuplicateListingItem) => {
      const existing = groups.get(key) || { reason, listings: [] };
      existing.listings.push(listing);
      groups.set(key, existing);
    };

    for (const listing of listings) {
      const recordKey = listing.sourceRecordKey
        .split("|")[0]
        ?.replace(/^manual-upload-/i, "")
        .trim();
      if (recordKey && recordKey.length >= 5 && /^[a-z0-9_-]+$/i.test(recordKey)) {
        addGroup(`property:${listing.listingType}:${recordKey}`, "Same property/listing identifier", listing);
      }

      const addressKey = String(listing.normalizedAddress || listing.address || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .trim();
      if (addressKey.length >= 8) {
        addGroup(`address:${listing.listingType}:${addressKey}:${listing.availableSf || "nosf"}`, "Same address, listing type, and size", listing);
      }
    }

    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        reason: group.reason,
        listings: Array.from(new Map(group.listings.map((listing) => [listing.id, listing])).values())
          .sort((left, right) => right.duplicateScore - left.duplicateScore),
      }))
      .filter((group) => group.listings.length > 1)
      .map((group) => ({
        ...group,
        suggestedKeepId: group.listings[0].id,
      }))
      .sort((left, right) => right.listings.length - left.listings.length)
      .slice(0, limit);
  }

  async archiveDuplicateListings(keepId: string, duplicateIds: string[]): Promise<{ archived: number }> {
    const ids = Array.from(new Set(duplicateIds.filter((id) => id && id !== keepId)));
    if (ids.length === 0) return { archived: 0 };

    const result = await pool.query(
      `
        UPDATE public.intel_listings
        SET status = 'duplicate', removed_at = now(), updated_at = now()
        WHERE id = ANY($1::varchar[])
          AND id <> $2
          AND removed_at IS NULL
      `,
      [ids, keepId],
    );

    return { archived: result.rowCount || 0 };
  }

  async getRecentChanges(limit = 10): Promise<IntelChangeListItem[]> {
    try {
      if (!(await this.hasCoreTables())) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().changes.slice(0, limit) : [];
      }

      const result = await pool.query<{
        id: string;
        listing_id: string;
        listing_title: string;
        source_name: string | null;
        change_type: string;
        change_summary: string | null;
        observed_at: Date | null;
      }>(
        `
          SELECT
            changes.id,
            changes.listing_id,
            listings.title AS listing_title,
            sources.name AS source_name,
            changes.change_type,
            changes.change_summary,
            changes.observed_at
          FROM public.intel_listing_changes changes
          INNER JOIN public.intel_listings listings ON listings.id = changes.listing_id
          LEFT JOIN public.intel_sources sources ON sources.id = listings.source_id
          ORDER BY changes.observed_at DESC NULLS LAST
          LIMIT $1
        `,
        [limit],
      );

      return result.rows.map((row: {
        id: string;
        listing_id: string;
        listing_title: string;
        source_name: string | null;
        change_type: string;
        change_summary: string | null;
        observed_at: Date | null;
      }) => ({
        id: row.id,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        sourceName: row.source_name,
        changeType: row.change_type,
        changeSummary: row.change_summary,
        observedAt: isoOrNull(row.observed_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return SHOULD_USE_SAMPLE_FALLBACK ? getIndustrialIntelSeedPreview().changes.slice(0, limit) : [];
      }
      throw error;
    }
  }

  async getRequirements(userId: string): Promise<IntelRequirementListItem[]> {
    try {
      if (!(await this.hasRequirementTables())) {
        return [];
      }

      const result = await pool.query<{
        id: string;
        title: string;
        client_name: string | null;
        status: string;
        deal_type: string;
        market: string | null;
        submarket: string | null;
        min_sf: string | null;
        max_sf: string | null;
        is_off_market_search_enabled: boolean;
        updated_at: Date | null;
        archived_at: Date | null;
      }>(
        `
          SELECT
            id,
            title,
            client_name,
            status,
            deal_type,
            market,
            submarket,
            min_sf,
            max_sf,
            is_off_market_search_enabled,
            updated_at,
            archived_at
          FROM public.intel_requirements
          WHERE created_by_user_id = $1
          ORDER BY archived_at ASC NULLS FIRST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        `,
        [userId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        clientName: row.client_name,
        status: row.status,
        dealType: row.deal_type,
        market: row.market,
        submarket: row.submarket,
        minSf: intOrNull(row.min_sf),
        maxSf: intOrNull(row.max_sf),
        isOffMarketSearchEnabled: boolOrFalse(row.is_off_market_search_enabled),
        updatedAt: isoOrNull(row.updated_at),
        archivedAt: isoOrNull(row.archived_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getRequirementById(userId: string, id: string): Promise<IntelRequirementDetail | null> {
    try {
      if (!(await this.hasRequirementTables())) {
        return null;
      }

      const result = await pool.query<{
        id: string;
        created_by_user_id: string;
        title: string;
        client_name: string | null;
        status: string;
        deal_type: string;
        market: string | null;
        submarket: string | null;
        min_sf: string | null;
        max_sf: string | null;
        min_clear_height_ft: string | null;
        max_budget_psf: string | null;
        required_dock_doors: string | null;
        required_grade_doors: string | null;
        min_yard_acres: string | null;
        power_notes: string | null;
        office_notes: string | null;
        timing_notes: string | null;
        special_notes: string | null;
        is_off_market_search_enabled: boolean;
        created_at: Date | null;
        updated_at: Date | null;
        archived_at: Date | null;
      }>(
        `
          SELECT *
          FROM public.intel_requirements
          WHERE created_by_user_id = $1 AND id = $2
          LIMIT 1
        `,
        [userId, id],
      );

      const row = result.rows[0];
      if (!row) return null;

      const preferences = await this.getRequirementPreferences(userId, id);

      return {
        id: row.id,
        createdByUserId: row.created_by_user_id,
        title: row.title,
        clientName: row.client_name,
        status: row.status,
        dealType: row.deal_type,
        market: row.market,
        submarket: row.submarket,
        minSf: intOrNull(row.min_sf),
        maxSf: intOrNull(row.max_sf),
        minClearHeightFt: intOrNull(row.min_clear_height_ft),
        maxBudgetPsf: intOrNull(row.max_budget_psf),
        requiredDockDoors: intOrNull(row.required_dock_doors),
        requiredGradeDoors: intOrNull(row.required_grade_doors),
        minYardAcres: intOrNull(row.min_yard_acres),
        powerNotes: row.power_notes,
        officeNotes: row.office_notes,
        timingNotes: row.timing_notes,
        specialNotes: row.special_notes,
        isOffMarketSearchEnabled: boolOrFalse(row.is_off_market_search_enabled),
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
        archivedAt: isoOrNull(row.archived_at),
        preferences,
      };
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createRequirement(userId: string, input: CreateIntelRequirementInput): Promise<IntelRequirementDetail> {
    const result = await pool.query(
      `
        INSERT INTO public.intel_requirements (
          created_by_user_id,
          title,
          client_name,
          status,
          deal_type,
          market,
          submarket,
          min_sf,
          max_sf,
          min_clear_height_ft,
          max_budget_psf,
          required_dock_doors,
          required_grade_doors,
          min_yard_acres,
          power_notes,
          office_notes,
          timing_notes,
          special_notes,
          is_off_market_search_enabled,
          updated_at
        ) VALUES (
          $1, $2, $3, COALESCE($4, 'draft'), COALESCE($5, 'lease'), $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, COALESCE($19, false), now()
        )
        RETURNING id
      `,
      [
        userId,
        input.title,
        input.clientName ?? null,
        input.status ?? null,
        input.dealType ?? null,
        input.market ?? null,
        input.submarket ?? null,
        input.minSf ?? null,
        input.maxSf ?? null,
        input.minClearHeightFt ?? null,
        input.maxBudgetPsf ?? null,
        input.requiredDockDoors ?? null,
        input.requiredGradeDoors ?? null,
        input.minYardAcres ?? null,
        input.powerNotes ?? null,
        input.officeNotes ?? null,
        input.timingNotes ?? null,
        input.specialNotes ?? null,
        input.isOffMarketSearchEnabled ?? null,
      ],
    );

    const created = await this.getRequirementById(userId, result.rows[0]?.id);
    if (!created) throw new Error('Failed to load created industrial intel requirement');
    return created;
  }

  async updateRequirement(userId: string, id: string, input: UpdateIntelRequirementInput): Promise<IntelRequirementDetail | null> {
    const current = await this.getRequirementById(userId, id);
    if (!current) return null;

    await pool.query(
      `
        UPDATE public.intel_requirements
        SET
          title = $3,
          client_name = $4,
          status = $5,
          deal_type = $6,
          market = $7,
          submarket = $8,
          min_sf = $9,
          max_sf = $10,
          min_clear_height_ft = $11,
          max_budget_psf = $12,
          required_dock_doors = $13,
          required_grade_doors = $14,
          min_yard_acres = $15,
          power_notes = $16,
          office_notes = $17,
          timing_notes = $18,
          special_notes = $19,
          is_off_market_search_enabled = $20,
          updated_at = now()
        WHERE created_by_user_id = $1 AND id = $2
      `,
      [
        userId,
        id,
        input.title ?? current.title,
        input.clientName ?? current.clientName,
        input.status ?? current.status,
        input.dealType ?? current.dealType,
        input.market ?? current.market,
        input.submarket ?? current.submarket,
        input.minSf ?? current.minSf,
        input.maxSf ?? current.maxSf,
        input.minClearHeightFt ?? current.minClearHeightFt,
        input.maxBudgetPsf ?? current.maxBudgetPsf,
        input.requiredDockDoors ?? current.requiredDockDoors,
        input.requiredGradeDoors ?? current.requiredGradeDoors,
        input.minYardAcres ?? current.minYardAcres,
        input.powerNotes ?? current.powerNotes,
        input.officeNotes ?? current.officeNotes,
        input.timingNotes ?? current.timingNotes,
        input.specialNotes ?? current.specialNotes,
        input.isOffMarketSearchEnabled ?? current.isOffMarketSearchEnabled,
      ],
    );

    return this.getRequirementById(userId, id);
  }

  async getRequirementPreferences(userId: string, requirementId: string): Promise<IntelRequirementPreference[]> {
    if (!(await this.hasRequirementTables())) {
      return [];
    }

    const ownership = await pool.query<{ id: string }>(
      `SELECT id FROM public.intel_requirements WHERE created_by_user_id = $1 AND id = $2 LIMIT 1`,
      [userId, requirementId],
    );
    if (!ownership.rows[0]) return [];

    const result = await pool.query<{
      id: string;
      requirement_id: string;
      key: string;
      operator: string;
      value_text: string | null;
      value_number: string | null;
      value_boolean: boolean | null;
      weight: string;
      updated_at: Date | null;
    }>(
      `
        SELECT id, requirement_id, key, operator, value_text, value_number, value_boolean, weight, updated_at
        FROM public.intel_requirement_preferences
        WHERE requirement_id = $1
        ORDER BY weight DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      `,
      [requirementId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      requirementId: row.requirement_id,
      key: row.key,
      operator: row.operator,
      valueText: row.value_text,
      valueNumber: intOrNull(row.value_number),
      valueBoolean: boolOrNull(row.value_boolean),
      weight: intOrZero(row.weight),
      updatedAt: isoOrNull(row.updated_at),
    }));
  }

  async replaceRequirementPreferences(
    userId: string,
    requirementId: string,
    input: ReplaceIntelRequirementPreferencesInput,
  ): Promise<IntelRequirementPreference[] | null> {
    const current = await this.getRequirementById(userId, requirementId);
    if (!current) return null;

    await pool.query('DELETE FROM public.intel_requirement_preferences WHERE requirement_id = $1', [requirementId]);

    for (const pref of input) {
      await pool.query(
        `
          INSERT INTO public.intel_requirement_preferences (
            requirement_id,
            key,
            operator,
            value_text,
            value_number,
            value_boolean,
            weight,
            updated_at
          ) VALUES ($1, $2, COALESCE($3, 'preferred'), $4, $5, $6, COALESCE($7, 1), now())
        `,
        [
          requirementId,
          pref.key,
          pref.operator ?? null,
          pref.valueText ?? null,
          pref.valueNumber ?? null,
          pref.valueBoolean ?? null,
          pref.weight ?? null,
        ],
      );
    }

    return this.getRequirementPreferences(userId, requirementId);
  }

  async getRequirementListingDecisions(
    userId: string,
    requirementId: string,
  ): Promise<IntelRequirementListingDecision[]> {
    try {
      if (!(await this.hasRequirementDecisionTables())) {
        return [];
      }

      const ownership = await pool.query<{ id: string }>(
        `SELECT id FROM public.intel_requirements WHERE created_by_user_id = $1 AND id = $2 LIMIT 1`,
        [userId, requirementId],
      );
      if (!ownership.rows[0]) return [];

      const result = await pool.query<{
        requirement_id: string;
        listing_id: string;
        decision: IntelRequirementListingDecisionValue;
        notes: string | null;
        sort_order: string | number | null;
        created_at: Date | null;
        updated_at: Date | null;
      }>(
        `
          SELECT requirement_id, listing_id, decision, notes, sort_order, created_at, updated_at
          FROM public.intel_requirement_listing_decisions
          WHERE requirement_id = $1
          ORDER BY
            CASE decision
              WHEN 'shortlist' THEN 1
              WHEN 'maybe' THEN 2
              ELSE 3
            END,
            sort_order ASC,
            updated_at DESC NULLS LAST
        `,
        [requirementId],
      );

      return result.rows.map((row) => ({
        requirementId: row.requirement_id,
        listingId: row.listing_id,
        decision: row.decision,
        notes: row.notes,
        sortOrder: intOrZero(row.sort_order),
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) {
        return [];
      }
      throw error;
    }
  }

  async upsertRequirementListingDecision(
    userId: string,
    requirementId: string,
    listingId: string,
    input: UpsertIntelRequirementListingDecisionInput,
  ): Promise<IntelRequirementListingDecision | null> {
    const requirement = await this.getRequirementById(userId, requirementId);
    if (!requirement) return null;

    const result = await pool.query<{
      requirement_id: string;
      listing_id: string;
      decision: IntelRequirementListingDecisionValue;
      notes: string | null;
      sort_order: string | number | null;
      created_at: Date | null;
      updated_at: Date | null;
    }>(
      `
        INSERT INTO public.intel_requirement_listing_decisions (
          requirement_id,
          listing_id,
          decision,
          notes,
          sort_order,
          updated_at
        ) VALUES ($1, $2, $3, $4, COALESCE($5, 0), now())
        ON CONFLICT (requirement_id, listing_id)
        DO UPDATE SET
          decision = EXCLUDED.decision,
          notes = EXCLUDED.notes,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
        RETURNING requirement_id, listing_id, decision, notes, sort_order, created_at, updated_at
      `,
      [requirementId, listingId, input.decision, input.notes ?? null, input.sortOrder ?? null],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      requirementId: row.requirement_id,
      listingId: row.listing_id,
      decision: row.decision,
      notes: row.notes,
      sortOrder: intOrZero(row.sort_order),
      createdAt: isoOrNull(row.created_at),
      updatedAt: isoOrNull(row.updated_at),
    };
  }

  async getSurveys(userId: string): Promise<IntelSurveyListItem[]> {
    try {
      if (!(await this.hasSurveyTables())) return [];

      const result = await pool.query<{
        id: string;
        requirement_id: string | null;
        requirement_title: string | null;
        title: string;
        client_name: string | null;
        status: IntelSurveyStatus;
        share_token: string | null;
        item_count: string | number | null;
        visible_item_count: string | number | null;
        created_by_user_id: string | null;
        created_at: Date | null;
        updated_at: Date | null;
      }>(
        `
          SELECT
            surveys.id,
            surveys.requirement_id,
            requirements.title AS requirement_title,
            surveys.title,
            surveys.client_name,
            surveys.status,
            surveys.share_token,
            COUNT(items.id)::int AS item_count,
            COUNT(items.id) FILTER (WHERE items.hidden = false)::int AS visible_item_count,
            surveys.created_by_user_id,
            surveys.created_at,
            surveys.updated_at
          FROM public.intel_surveys surveys
          LEFT JOIN public.intel_requirements requirements ON requirements.id = surveys.requirement_id
          LEFT JOIN public.intel_survey_items items ON items.survey_id = surveys.id
          WHERE surveys.created_by_user_id = $1
          GROUP BY surveys.id, requirements.title
          ORDER BY surveys.updated_at DESC NULLS LAST, surveys.created_at DESC NULLS LAST
        `,
        [userId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        requirementId: row.requirement_id,
        requirementTitle: row.requirement_title,
        title: row.title,
        clientName: row.client_name,
        status: row.status,
        shareToken: row.share_token,
        itemCount: intOrZero(row.item_count),
        visibleItemCount: intOrZero(row.visible_item_count),
        createdByUserId: row.created_by_user_id,
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
      }));
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) return [];
      throw error;
    }
  }

  async getSurveyById(userId: string, id: string): Promise<IntelSurveyDetail | null> {
    try {
      if (!(await this.hasSurveyTables())) return null;

      const surveyResult = await pool.query<{
        id: string;
        requirement_id: string | null;
        requirement_title: string | null;
        title: string;
        client_name: string | null;
        status: IntelSurveyStatus;
        share_token: string | null;
        item_count: string | number | null;
        visible_item_count: string | number | null;
        created_by_user_id: string | null;
        created_at: Date | null;
        updated_at: Date | null;
      }>(
        `
          SELECT
            surveys.id,
            surveys.requirement_id,
            requirements.title AS requirement_title,
            surveys.title,
            surveys.client_name,
            surveys.status,
            surveys.share_token,
            COUNT(items.id)::int AS item_count,
            COUNT(items.id) FILTER (WHERE items.hidden = false)::int AS visible_item_count,
            surveys.created_by_user_id,
            surveys.created_at,
            surveys.updated_at
          FROM public.intel_surveys surveys
          LEFT JOIN public.intel_requirements requirements ON requirements.id = surveys.requirement_id
          LEFT JOIN public.intel_survey_items items ON items.survey_id = surveys.id
          WHERE surveys.created_by_user_id = $1 AND surveys.id = $2
          GROUP BY surveys.id, requirements.title
          LIMIT 1
        `,
        [userId, id],
      );

      const survey = surveyResult.rows[0];
      if (!survey) return null;

      const itemResult = await pool.query<{
        item_id: string;
        survey_id: string;
        listing_id: string;
        sort_order: string | number | null;
        recommendation_label: string | null;
        broker_notes: string | null;
        client_notes: string | null;
        hidden: boolean;
        item_created_at: Date | null;
        item_updated_at: Date | null;
        source_id: string;
        source_name: string | null;
        title: string;
        address: string | null;
        normalized_address: string | null;
        market: string | null;
        submarket: string | null;
        status: string;
        listing_type: string;
        asset_type: string;
        lat: string | null;
        lng: string | null;
        geocode_status: string | null;
        geocode_confidence: string | null;
        geocode_source: string | null;
        data_quality_status: string | null;
        available_sf: number | null;
        land_acres: string | null;
        total_price: string | null;
        price_per_acre: string | null;
        raw_payload: Record<string, unknown> | null;
        brochure_url: string | null;
        source_url: string | null;
        last_seen_at: Date | null;
        removed_at: Date | null;
      }>(
        `
          SELECT
            items.id AS item_id,
            items.survey_id,
            items.listing_id,
            items.sort_order,
            items.recommendation_label,
            items.broker_notes,
            items.client_notes,
            items.hidden,
            items.created_at AS item_created_at,
            items.updated_at AS item_updated_at,
            listings.source_id,
            sources.name AS source_name,
            listings.title,
            listings.address,
            COALESCE(listings.normalized_address, listings.address) AS normalized_address,
            listings.market,
            listings.submarket,
            listings.status,
            listings.listing_type,
            listings.asset_type,
            listings.lat,
            listings.lng,
            listings.geocode_status,
            listings.geocode_confidence,
            listings.geocode_source,
            listings.data_quality_status,
            listings.available_sf,
            listings.land_acres,
            listings.total_price,
            listings.price_per_acre,
            listings.raw_payload,
            listings.brochure_url,
            listings.source_url,
            listings.last_seen_at,
            listings.removed_at
          FROM public.intel_survey_items items
          INNER JOIN public.intel_listings listings ON listings.id = items.listing_id
          LEFT JOIN public.intel_sources sources ON sources.id = listings.source_id
          WHERE items.survey_id = $1
          ORDER BY items.sort_order ASC, items.created_at ASC
        `,
        [id],
      );

      const items = itemResult.rows.map((row) => ({
        id: row.item_id,
        surveyId: row.survey_id,
        listingId: row.listing_id,
        sortOrder: intOrZero(row.sort_order),
        recommendationLabel: row.recommendation_label,
        brokerNotes: row.broker_notes,
        clientNotes: row.client_notes,
        hidden: Boolean(row.hidden),
        createdAt: isoOrNull(row.item_created_at),
        updatedAt: isoOrNull(row.item_updated_at),
        listing: {
          id: row.listing_id,
          sourceId: row.source_id,
          sourceName: row.source_name,
          title: row.title,
          address: row.address,
          normalizedAddress: row.normalized_address,
          market: row.market,
          submarket: row.submarket,
          status: row.status,
          listingType: row.listing_type,
          assetType: row.asset_type,
          latitude: numOrNull(row.lat),
          longitude: numOrNull(row.lng),
          geocodeStatus: row.geocode_status,
          geocodeConfidence: numOrNull(row.geocode_confidence),
          geocodeSource: row.geocode_source,
          dataQualityStatus: row.data_quality_status,
          availableSf: intOrNull(row.available_sf),
          landAcres: numOrNull(row.land_acres),
          totalPrice: numOrNull(row.total_price),
          pricePerAcre: numOrNull(row.price_per_acre),
          leaseRatePsf: numOrNull(row.raw_payload?.leaseRatePsf),
          brochureUrl: row.brochure_url,
          sourceUrl: row.source_url,
          lastSeenAt: isoOrNull(row.last_seen_at),
          removedAt: isoOrNull(row.removed_at),
        },
      }));

      return {
        id: survey.id,
        requirementId: survey.requirement_id,
        requirementTitle: survey.requirement_title,
        title: survey.title,
        clientName: survey.client_name,
        status: survey.status,
        shareToken: survey.share_token,
        itemCount: intOrZero(survey.item_count),
        visibleItemCount: intOrZero(survey.visible_item_count),
        createdByUserId: survey.created_by_user_id,
        createdAt: isoOrNull(survey.created_at),
        updatedAt: isoOrNull(survey.updated_at),
        items,
      };
    } catch (error) {
      if (isRecoverableIntelSchemaError(error)) return null;
      throw error;
    }
  }

  async createSurvey(userId: string, input: CreateIntelSurveyInput): Promise<IntelSurveyDetail> {
    await this.ensureSurveyTables();

    const result = await pool.query<{ id: string }>(
      `
        INSERT INTO public.intel_surveys (
          requirement_id,
          title,
          client_name,
          status,
          created_by_user_id,
          updated_at
        ) VALUES ($1, $2, $3, COALESCE($4, 'draft'), $5, now())
        RETURNING id
      `,
      [input.requirementId ?? null, input.title, input.clientName ?? null, input.status ?? null, userId],
    );

    const created = await this.getSurveyById(userId, result.rows[0]?.id);
    if (!created) throw new Error("Failed to load created industrial intel survey");
    return created;
  }

  async updateSurvey(userId: string, id: string, input: UpdateIntelSurveyInput): Promise<IntelSurveyDetail | null> {
    await this.ensureSurveyTables();

    const current = await this.getSurveyById(userId, id);
    if (!current) return null;

    await pool.query(
      `
        UPDATE public.intel_surveys
        SET
          requirement_id = $3,
          title = $4,
          client_name = $5,
          status = $6,
          share_token = $7,
          updated_at = now()
        WHERE created_by_user_id = $1 AND id = $2
      `,
      [
        userId,
        id,
        input.requirementId === undefined ? current.requirementId : input.requirementId,
        input.title ?? current.title,
        input.clientName === undefined ? current.clientName : input.clientName,
        input.status ?? current.status,
        input.shareToken === undefined ? current.shareToken : input.shareToken,
      ],
    );

    return this.getSurveyById(userId, id);
  }

  async addSurveyItem(
    userId: string,
    surveyId: string,
    input: CreateIntelSurveyItemInput,
  ): Promise<IntelSurveyDetail | null> {
    await this.ensureSurveyTables();

    const survey = await this.getSurveyById(userId, surveyId);
    if (!survey) return null;

    const nextSortOrder =
      input.sortOrder ??
      (survey.items.length > 0 ? Math.max(...survey.items.map((item) => item.sortOrder)) + 10 : 10);

    await pool.query(
      `
        INSERT INTO public.intel_survey_items (
          survey_id,
          listing_id,
          sort_order,
          recommendation_label,
          broker_notes,
          client_notes,
          hidden,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), now())
        ON CONFLICT (survey_id, listing_id)
        DO UPDATE SET
          hidden = false,
          sort_order = EXCLUDED.sort_order,
          recommendation_label = COALESCE(EXCLUDED.recommendation_label, public.intel_survey_items.recommendation_label),
          broker_notes = COALESCE(EXCLUDED.broker_notes, public.intel_survey_items.broker_notes),
          client_notes = COALESCE(EXCLUDED.client_notes, public.intel_survey_items.client_notes),
          updated_at = now()
      `,
      [
        surveyId,
        input.listingId,
        nextSortOrder,
        input.recommendationLabel ?? null,
        input.brokerNotes ?? null,
        input.clientNotes ?? null,
        input.hidden ?? null,
      ],
    );

    await pool.query(`UPDATE public.intel_surveys SET updated_at = now() WHERE id = $1`, [surveyId]);
    return this.getSurveyById(userId, surveyId);
  }

  async updateSurveyItem(
    userId: string,
    surveyId: string,
    itemId: string,
    input: UpdateIntelSurveyItemInput,
  ): Promise<IntelSurveyDetail | null> {
    await this.ensureSurveyTables();

    const survey = await this.getSurveyById(userId, surveyId);
    if (!survey) return null;
    const current = survey.items.find((item) => item.id === itemId);
    if (!current) return null;

    await pool.query(
      `
        UPDATE public.intel_survey_items
        SET
          sort_order = $3,
          recommendation_label = $4,
          broker_notes = $5,
          client_notes = $6,
          hidden = $7,
          updated_at = now()
        WHERE survey_id = $1 AND id = $2
      `,
      [
        surveyId,
        itemId,
        input.sortOrder ?? current.sortOrder,
        input.recommendationLabel === undefined ? current.recommendationLabel : input.recommendationLabel,
        input.brokerNotes === undefined ? current.brokerNotes : input.brokerNotes,
        input.clientNotes === undefined ? current.clientNotes : input.clientNotes,
        input.hidden === undefined ? current.hidden : input.hidden,
      ],
    );

    await pool.query(`UPDATE public.intel_surveys SET updated_at = now() WHERE id = $1`, [surveyId]);
    return this.getSurveyById(userId, surveyId);
  }

  async deleteSurveyItem(userId: string, surveyId: string, itemId: string): Promise<IntelSurveyDetail | null> {
    await this.ensureSurveyTables();

    const survey = await this.getSurveyById(userId, surveyId);
    if (!survey) return null;

    await pool.query(
      `DELETE FROM public.intel_survey_items WHERE survey_id = $1 AND id = $2`,
      [surveyId, itemId],
    );
    await pool.query(`UPDATE public.intel_surveys SET updated_at = now() WHERE id = $1`, [surveyId]);
    return this.getSurveyById(userId, surveyId);
  }
}

export const industrialIntelRepository = new IndustrialIntelRepository();
