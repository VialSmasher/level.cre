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
  market: string | null;
  submarket: string | null;
  status: string;
  listingType: string;
  assetType: string;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  removedAt: string | null;
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

  async getListings(limit = 100): Promise<IntelListingListItem[]> {
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
        market: string | null;
        submarket: string | null;
        status: string;
        listing_type: string;
        asset_type: string;
        available_sf: number | null;
        land_acres: string | null;
        total_price: string | null;
        price_per_acre: string | null;
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
            listings.market,
            listings.submarket,
            listings.status,
            listings.listing_type,
            listings.asset_type,
            listings.available_sf,
            listings.land_acres,
            listings.total_price,
            listings.price_per_acre,
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
        market: string | null;
        submarket: string | null;
        status: string;
        listing_type: string;
        asset_type: string;
        available_sf: number | null;
        land_acres: string | null;
        total_price: string | null;
        price_per_acre: string | null;
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
        market: row.market,
        submarket: row.submarket,
        status: row.status,
        listingType: row.listing_type,
        assetType: row.asset_type,
        availableSf: intOrNull(row.available_sf),
        landAcres: numOrNull(row.land_acres),
        totalPrice: numOrNull(row.total_price),
        pricePerAcre: numOrNull(row.price_per_acre),
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
}

export const industrialIntelRepository = new IndustrialIntelRepository();
