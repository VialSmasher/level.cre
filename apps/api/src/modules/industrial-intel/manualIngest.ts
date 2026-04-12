import { pool } from '../../db';
import { applyNormalizedRecords } from './ingest/applyNormalizedRecords';
import { ensureContentHash } from './ingest/runSource';
import type { IntelSourceAdapterSlug, NormalizedIntelListingRecord } from './ingest/types';

export type ManualIntelListingInput = {
  sourceUrl: string;
  title: string;
  brochureUrl?: string | null;
  address?: string | null;
  market?: string | null;
  submarket?: string | null;
  listingType?: string | null;
  availableSf?: number | null;
};

const MANUAL_SOURCE: { slug: IntelSourceAdapterSlug; name: string; kind: string; feedUrl: string | null } = {
  slug: 'manual_url',
  name: 'Manual URL Intake',
  kind: 'manual',
  feedUrl: null,
};

async function ensureManualSource(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    'select id from public.intel_sources where slug = $1 limit 1',
    [MANUAL_SOURCE.slug],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.intel_sources (name, slug, kind, feed_url, field_mapping, is_active)
      values ($1, $2, $3, $4, '{}'::jsonb, true)
      returning id
    `,
    [MANUAL_SOURCE.name, MANUAL_SOURCE.slug, MANUAL_SOURCE.kind, MANUAL_SOURCE.feedUrl],
  );

  return inserted.rows[0].id;
}

export async function ingestManualIntelListing(
  userId: string | null,
  input: ManualIntelListingInput,
): Promise<{ runId: string; recordsSeen: number; recordsNew: number; recordsUpdated: number; recordsRemoved: number }> {
  const sourceId = await ensureManualSource();
  const normalized: NormalizedIntelListingRecord = ensureContentHash({
    sourceRecordKey: input.sourceUrl.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
    externalId: null,
    status: 'active',
    listingType: input.listingType || 'lease',
    title: input.title,
    address: input.address ?? null,
    market: input.market ?? null,
    submarket: input.submarket ?? null,
    lat: null,
    lng: null,
    availableSf: input.availableSf ?? null,
    minDivisibleSf: null,
    clearHeightFt: null,
    brochureUrl: input.brochureUrl ?? null,
    sourceUrl: input.sourceUrl,
    rawPayload: {
      intakeMethod: 'manual_url',
      title: input.title,
      sourceUrl: input.sourceUrl,
      brochureUrl: input.brochureUrl ?? null,
      address: input.address ?? null,
      market: input.market ?? null,
      submarket: input.submarket ?? null,
      listingType: input.listingType || 'lease',
      availableSf: input.availableSf ?? null,
    },
  });

  return applyNormalizedRecords(
    {
      sourceId,
      sourceSlug: MANUAL_SOURCE.slug,
      triggerType: 'manual_url',
      initiatedByUserId: userId,
      preserveMissing: true,
    },
    {
      sourceSlug: MANUAL_SOURCE.slug,
      records: [normalized],
    },
  );
}
