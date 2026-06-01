import { pool } from '../../db';
import { applyNormalizedRecords } from './ingest/applyNormalizedRecords';
import { ensureContentHash } from './ingest/runSource';
import type { IntelSourceAdapterSlug, NormalizedIntelListingRecord } from './ingest/types';

export type ManualIntelListingInput = {
  sourceUrl?: string | null;
  title: string;
  brochureUrl?: string | null;
  address?: string | null;
  market?: string | null;
  submarket?: string | null;
  listingType?: string | null;
  assetType?: string | null;
  recordKeySuffix?: string | null;
  lat?: number | null;
  lng?: number | null;
  availableSf?: number | null;
  landAcres?: number | null;
  totalPrice?: number | null;
  pricePerAcre?: number | null;
};

export type ManualIntelListingUploadInput = {
  sourceName?: string | null;
  records: ManualIntelListingInput[];
};

const MANUAL_SOURCE: { slug: IntelSourceAdapterSlug; name: string; kind: string; feedUrl: string | null } = {
  slug: 'manual_url',
  name: 'Manual URL Intake',
  kind: 'manual',
  feedUrl: null,
};

const MANUAL_UPLOAD_SOURCE: { slug: IntelSourceAdapterSlug; name: string; kind: string; feedUrl: string | null } = {
  slug: 'manual_upload',
  name: 'Spreadsheet Upload Intake',
  kind: 'manual_upload',
  feedUrl: null,
};

function slugifySourceName(value?: string | null): string {
  return String(value || 'spreadsheet-upload')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'spreadsheet-upload';
}

function uploadSourceFor(sourceName?: string | null): { slug: string; name: string; kind: string; feedUrl: string | null } {
  const name = String(sourceName || '').trim() || MANUAL_UPLOAD_SOURCE.name;
  return {
    slug: `manual-upload-${slugifySourceName(name)}`,
    name,
    kind: MANUAL_UPLOAD_SOURCE.kind,
    feedUrl: null,
  };
}

function buildManualSourceRecordKey(sourceUrl: string, recordKeySuffix?: string | null): string {
  const base = sourceUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const suffix = String(recordKeySuffix || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return suffix ? `${base}#${suffix}` : base;
}

function buildUploadRecordKey(input: ManualIntelListingInput, index: number): string {
  if (input.sourceUrl) return buildManualSourceRecordKey(input.sourceUrl, input.recordKeySuffix);
  const suffix = String(input.recordKeySuffix || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (suffix) {
    return [suffix, input.listingType]
      .filter(Boolean)
      .join('|')
      .toLowerCase()
      .replace(/[^a-z0-9|_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  const base = [input.address, input.title, input.listingType, input.availableSf]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `row-${index + 1}`;
}

function normalizeManualRecord(input: ManualIntelListingInput, sourceRecordKey: string, intakeMethod: string): NormalizedIntelListingRecord {
  return ensureContentHash({
    sourceRecordKey,
    externalId: null,
    status: 'active',
    listingType: input.listingType || 'lease',
    assetType: input.assetType || 'building',
    title: input.title,
    address: input.address ?? null,
    market: input.market ?? null,
    submarket: input.submarket ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    availableSf: input.availableSf ?? null,
    landAcres: input.landAcres ?? null,
    totalPrice: input.totalPrice ?? null,
    pricePerAcre: input.pricePerAcre ?? null,
    minDivisibleSf: null,
    clearHeightFt: null,
    brochureUrl: input.brochureUrl ?? null,
    sourceUrl: input.sourceUrl ?? null,
    rawPayload: {
      intakeMethod,
      title: input.title,
      sourceUrl: input.sourceUrl ?? null,
      recordKeySuffix: input.recordKeySuffix ?? null,
      brochureUrl: input.brochureUrl ?? null,
      address: input.address ?? null,
      market: input.market ?? null,
      submarket: input.submarket ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      listingType: input.listingType || 'lease',
      assetType: input.assetType || 'building',
      availableSf: input.availableSf ?? null,
      landAcres: input.landAcres ?? null,
      totalPrice: input.totalPrice ?? null,
      pricePerAcre: input.pricePerAcre ?? null,
    },
  });
}

async function ensureManualSource(source: { slug: string; name: string; kind: string; feedUrl: string | null } = MANUAL_SOURCE): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    'select id from public.intel_sources where slug = $1 limit 1',
    [source.slug],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.intel_sources (name, slug, kind, feed_url, field_mapping, is_active)
      values ($1, $2, $3, $4, '{}'::jsonb, true)
      returning id
    `,
    [source.name, source.slug, source.kind, source.feedUrl],
  );

  return inserted.rows[0].id;
}

export async function ingestManualIntelListing(
  userId: string | null,
  input: ManualIntelListingInput,
): Promise<{ runId: string; recordsSeen: number; recordsNew: number; recordsUpdated: number; recordsRemoved: number }> {
  const sourceId = await ensureManualSource();
  const normalized = normalizeManualRecord(input, buildManualSourceRecordKey(input.sourceUrl || input.title, input.recordKeySuffix), 'manual_url');

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

export async function ingestManualIntelListingUpload(
  userId: string | null,
  input: ManualIntelListingUploadInput,
): Promise<{ runId: string; recordsSeen: number; recordsNew: number; recordsUpdated: number; recordsRemoved: number }> {
  const uploadSource = uploadSourceFor(input.sourceName);
  const sourceId = await ensureManualSource(uploadSource);
  const normalized = input.records.map((record, index) => {
    const normalizedRecord = normalizeManualRecord(record, buildUploadRecordKey(record, index), 'manual_upload');
    return {
      ...normalizedRecord,
      rawPayload: {
        ...normalizedRecord.rawPayload,
        uploadSourceName: input.sourceName || null,
        uploadRow: index + 1,
      },
    };
  });

  return applyNormalizedRecords(
    {
      sourceId,
      sourceSlug: MANUAL_UPLOAD_SOURCE.slug,
      triggerType: 'manual_upload',
      initiatedByUserId: userId,
      preserveMissing: true,
    },
    {
      sourceSlug: MANUAL_UPLOAD_SOURCE.slug,
      records: normalized,
    },
  );
}
