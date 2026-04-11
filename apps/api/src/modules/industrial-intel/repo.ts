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
  availableSf: number | null;
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

const CORE_TABLES = [
  "intel_sources",
  "intel_listings",
  "intel_ingest_runs",
  "intel_listing_changes",
] as const;

const SHOULD_USE_SAMPLE_FALLBACK = process.env.NODE_ENV !== "production";

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
        available_sf: number | null;
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
            listings.available_sf,
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
        available_sf: number | null;
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
        availableSf: intOrNull(row.available_sf),
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
}

export const industrialIntelRepository = new IndustrialIntelRepository();
