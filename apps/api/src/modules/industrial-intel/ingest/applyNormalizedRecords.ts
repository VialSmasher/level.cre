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
  return 'lease';
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
              title,
              address,
              market,
              submarket,
              lat,
              lng,
              available_sf,
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
              $15, $16, $17::jsonb, $18, now(), now(), null, now(), now()
            )
            RETURNING id
          `,
          [
            context.sourceId,
            record.sourceRecordKey,
            record.externalId ?? null,
            normalizeStatus(record.status),
            normalizeListingType(record.listingType),
            record.title,
            record.address ?? null,
            record.market ?? null,
            record.submarket ?? null,
            record.lat ?? null,
            record.lng ?? null,
            record.availableSf ?? null,
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
              title = $6,
              address = $7,
              market = $8,
              submarket = $9,
              lat = $10,
              lng = $11,
              available_sf = $12,
              min_divisible_sf = $13,
              clear_height_ft = $14,
              brochure_url = $15,
              source_url = $16,
              raw_payload = $17::jsonb,
              content_hash = $18,
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
            record.title,
            record.address ?? null,
            record.market ?? null,
            record.submarket ?? null,
            record.lat ?? null,
            record.lng ?? null,
            record.availableSf ?? null,
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
