import { pool } from '../../../db';
import type { IntelSourceRunContext, IntelSourceRunResult, NormalizedIntelListingRecord } from './types';

export type ApplyNormalizedRecordsResult = {
  runId: string;
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  recordsRemoved: number;
};

type ExistingListingRow = {
  id: string;
  source_record_key: string;
  content_hash: string;
  removed_at: Date | null;
};

function normalizeListingType(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sale') return 'sale';
  if (normalized === 'sublease') return 'sublease';
  return 'lease';
}

function normalizeAssetType(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'land') return 'land';
  if (normalized === 'yard') return 'yard';
  if (normalized === 'other') return 'other';
  return 'building';
}

function normalizeStatus(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'active';
}

function changeSummaryFor(record: NormalizedIntelListingRecord, changeType: string): string {
  switch (changeType) {
    case 'new':
      return `New ${record.listingType || 'listing'}: ${record.title}`;
    case 'updated':
      return `Updated listing: ${record.title}`;
    case 'reactivated':
      return `Reactivated listing: ${record.title}`;
    case 'removed':
      return `Removed listing: ${record.title}`;
    default:
      return `${changeType}: ${record.title}`;
  }
}

function normalizeAddress(value?: string | null): string | null {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function deriveGeocodeStatus(record: NormalizedIntelListingRecord): string {
  if (record.lat != null && record.lng != null) return 'success';
  if (normalizeAddress(record.address)) return 'pending';
  return 'blocked';
}

function deriveGeocodeConfidence(record: NormalizedIntelListingRecord): number | null {
  if (record.lat != null && record.lng != null) return 0.9;
  return null;
}

function deriveGeocodeSource(record: NormalizedIntelListingRecord): string | null {
  if (record.lat != null && record.lng != null) return 'source_feed';
  return null;
}

function deriveDataQualityStatus(record: NormalizedIntelListingRecord): string {
  return normalizeAddress(record.address) ? 'clean' : 'review';
}

export async function applyNormalizedRecords(
  context: IntelSourceRunContext,
  result: IntelSourceRunResult,
): Promise<ApplyNormalizedRecordsResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const runInsert = await client.query<{ id: string }>(
      `
        INSERT INTO public.intel_ingest_runs (
          source_id,
          trigger_type,
          status,
          started_at,
          initiated_by_user_id
        ) VALUES ($1, $2, 'running', now(), $3)
        RETURNING id
      `,
      [context.sourceId, context.triggerType ?? 'manual', context.initiatedByUserId ?? null],
    );

    const runId = runInsert.rows[0].id;

    const existing = await client.query<ExistingListingRow>(
      `
        SELECT id, source_record_key, content_hash, removed_at
        FROM public.intel_listings
        WHERE source_id = $1
      `,
      [context.sourceId],
    );

    const existingByKey = new Map(existing.rows.map((row) => [row.source_record_key, row]));
    const seenKeys = new Set<string>();

    let recordsNew = 0;
    let recordsUpdated = 0;
    let recordsRemoved = 0;

    for (const record of result.records) {
      seenKeys.add(record.sourceRecordKey);
      const current = existingByKey.get(record.sourceRecordKey);

      if (!current) {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO public.intel_listings (
              source_id,
              source_record_key,
              external_id,
              status,
              listing_type,
              asset_type,
              title,
              address,
              normalized_address,
              market,
              submarket,
              lat,
              lng,
              geocode_status,
              geocode_confidence,
              geocode_source,
              data_quality_status,
              available_sf,
              land_acres,
              total_price,
              price_per_acre,
              min_divisible_sf,
              clear_height_ft,
              brochure_url,
              source_url,
              raw_payload,
              content_hash,
              first_seen_at,
              last_seen_at,
              removed_at,
              created_at,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27, now(), now(), null, now(), now()
            )
            RETURNING id
          `,
          [
            context.sourceId,
            record.sourceRecordKey,
            record.externalId ?? null,
            normalizeStatus(record.status),
            normalizeListingType(record.listingType),
            normalizeAssetType(record.assetType),
            record.title,
            record.address ?? null,
            normalizeAddress(record.address),
            record.market ?? null,
            record.submarket ?? null,
            record.lat ?? null,
            record.lng ?? null,
            deriveGeocodeStatus(record),
            deriveGeocodeConfidence(record),
            deriveGeocodeSource(record),
            deriveDataQualityStatus(record),
            record.availableSf ?? null,
            record.landAcres ?? null,
            record.totalPrice ?? null,
            record.pricePerAcre ?? null,
            record.minDivisibleSf ?? null,
            record.clearHeightFt ?? null,
            record.brochureUrl ?? null,
            record.sourceUrl ?? null,
            JSON.stringify(record.rawPayload ?? {}),
            record.contentHash,
          ],
        );

        await client.query(
          `
            INSERT INTO public.intel_listing_changes (
              listing_id,
              ingest_run_id,
              change_type,
              change_summary,
              previous_hash,
              new_hash,
              observed_at
            ) VALUES ($1, $2, 'new', $3, null, $4, now())
          `,
          [inserted.rows[0].id, runId, changeSummaryFor(record, 'new'), record.contentHash],
        );

        recordsNew += 1;
        continue;
      }

      const wasRemoved = Boolean(current.removed_at);
      const contentChanged = current.content_hash !== record.contentHash;

      if (contentChanged || wasRemoved) {
        await client.query(
          `
            UPDATE public.intel_listings
            SET
              external_id = $3,
              status = $4,
              listing_type = $5,
              asset_type = $6,
              title = $7,
              address = $8,
              normalized_address = $9,
              market = $10,
              submarket = $11,
              lat = $12,
              lng = $13,
              geocode_status = $14,
              geocode_confidence = $15,
              geocode_source = $16,
              data_quality_status = $17,
              available_sf = $18,
              land_acres = $19,
              total_price = $20,
              price_per_acre = $21,
              min_divisible_sf = $22,
              clear_height_ft = $23,
              brochure_url = $24,
              source_url = $25,
              raw_payload = $26::jsonb,
              content_hash = $27,
              last_seen_at = now(),
              removed_at = null,
              updated_at = now()
            WHERE id = $1 AND source_id = $2
          `,
          [
            current.id,
            context.sourceId,
            record.externalId ?? null,
            normalizeStatus(record.status),
            normalizeListingType(record.listingType),
            normalizeAssetType(record.assetType),
            record.title,
            record.address ?? null,
            normalizeAddress(record.address),
            record.market ?? null,
            record.submarket ?? null,
            record.lat ?? null,
            record.lng ?? null,
            deriveGeocodeStatus(record),
            deriveGeocodeConfidence(record),
            deriveGeocodeSource(record),
            deriveDataQualityStatus(record),
            record.availableSf ?? null,
            record.landAcres ?? null,
            record.totalPrice ?? null,
            record.pricePerAcre ?? null,
            record.minDivisibleSf ?? null,
            record.clearHeightFt ?? null,
            record.brochureUrl ?? null,
            record.sourceUrl ?? null,
            JSON.stringify(record.rawPayload ?? {}),
            record.contentHash,
          ],
        );

        const changeType = wasRemoved ? 'reactivated' : 'updated';
        await client.query(
          `
            INSERT INTO public.intel_listing_changes (
              listing_id,
              ingest_run_id,
              change_type,
              change_summary,
              previous_hash,
              new_hash,
              observed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, now())
          `,
          [
            current.id,
            runId,
            changeType,
            changeSummaryFor(record, changeType),
            current.content_hash,
            record.contentHash,
          ],
        );

        recordsUpdated += 1;
      } else {
        await client.query(
          `
            UPDATE public.intel_listings
            SET last_seen_at = now(), updated_at = now()
            WHERE id = $1
          `,
          [current.id],
        );
      }
    }

    if (!context.preserveMissing) {
      for (const current of existing.rows) {
        if (seenKeys.has(current.source_record_key) || current.removed_at) {
          continue;
        }

        await client.query(
          `
            UPDATE public.intel_listings
            SET removed_at = now(), updated_at = now()
            WHERE id = $1
          `,
          [current.id],
        );

        const listingTitleResult = await client.query<{ title: string }>('select title from public.intel_listings where id = $1', [current.id]);
        const listingTitle = listingTitleResult.rows[0]?.title || current.source_record_key;

        await client.query(
          `
            INSERT INTO public.intel_listing_changes (
              listing_id,
              ingest_run_id,
              change_type,
              change_summary,
              previous_hash,
              new_hash,
              observed_at
            ) VALUES ($1, $2, 'removed', $3, $4, null, now())
          `,
          [current.id, runId, `Removed listing: ${listingTitle}`, current.content_hash],
        );

        recordsRemoved += 1;
      }
    }

    await client.query(
      `
        UPDATE public.intel_ingest_runs
        SET
          status = 'completed',
          completed_at = now(),
          records_seen = $2,
          records_new = $3,
          records_updated = $4,
          records_removed = $5
        WHERE id = $1
      `,
      [runId, result.records.length, recordsNew, recordsUpdated, recordsRemoved],
    );

    await client.query('COMMIT');

    return {
      runId,
      recordsSeen: result.records.length,
      recordsNew,
      recordsUpdated,
      recordsRemoved,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
