import { pool } from "../../db";

export type IndustrialIntelSeedPreview = {
  summary: {
    activeListings: number;
    newListings: number;
    changedListings: number;
    removedListings: number;
    lastRunAt: string | null;
  };
  sources: Array<{
    id: string;
    name: string;
    slug: string;
    kind: string;
    feedUrl: string | null;
    isActive: boolean;
    updatedAt: string | null;
  }>;
  runs: Array<{
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
  }>;
  listings: Array<{
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
  }>;
  changes: Array<{
    id: string;
    listingId: string;
    listingTitle: string;
    sourceName: string | null;
    changeType: string;
    changeSummary: string | null;
    observedAt: string | null;
  }>;
};

const SOURCE_IDS = {
  cbre: "intel-source-cbre-edmonton",
  loopnet: "intel-source-loopnet-industrial",
  direct: "intel-source-direct-broker",
} as const;

const RUN_IDS = {
  morning: "intel-run-seed-morning",
  afternoon: "intel-run-seed-afternoon",
} as const;

const LISTING_IDS = {
  nisku: "intel-listing-nisku-crossdock",
  sherwood: "intel-listing-sherwood-bay",
  yard: "intel-listing-50-street-yard",
  acheson: "intel-listing-acheson-bulk",
} as const;

const CHANGE_IDS = {
  nisku: "intel-change-nisku-new",
  sherwood: "intel-change-sherwood-updated",
  yard: "intel-change-yard-removed",
  acheson: "intel-change-acheson-reactivated",
} as const;

const CORE_TABLES = [
  "intel_sources",
  "intel_listings",
  "intel_ingest_runs",
  "intel_listing_changes",
] as const;

export type IndustrialIntelSeedResult = {
  seeded: true;
  sources: number;
  runs: number;
  listings: number;
  changes: number;
};

type SourceSeed = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  feedUrl: string | null;
  fieldMapping: Record<string, string>;
  isActive: boolean;
};

type RunSeed = {
  id: string;
  sourceId: string | null;
  triggerType: string;
  status: string;
  startedAt: Date;
  completedAt: Date;
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  recordsRemoved: number;
  errorMessage: string | null;
};

type ListingSeed = {
  id: string;
  sourceId: string;
  sourceRecordKey: string;
  externalId: string;
  status: string;
  listingType: string;
  assetType: string;
  title: string;
  address: string;
  market: string;
  submarket: string;
  lat: number;
  lng: number;
  availableSf: number;
  landAcres?: number | null;
  totalPrice?: number | null;
  pricePerAcre?: number | null;
  minDivisibleSf: number;
  clearHeightFt: number;
  brochureUrl: string;
  sourceUrl: string;
  rawPayload: Record<string, unknown>;
  contentHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  removedAt: Date | null;
};

type ChangeSeed = {
  id: string;
  listingId: string;
  ingestRunId: string;
  changeType: string;
  changeSummary: string;
  previousHash: string | null;
  newHash: string | null;
  observedAt: Date;
};

async function ensureCoreTables(): Promise<void> {
  const result = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('intel_sources', 'intel_listings', 'intel_ingest_runs', 'intel_listing_changes')
  `);

  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = CORE_TABLES.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Industrial Intel core tables are missing: ${missing.join(", ")}. Apply drizzle/0003_industrial_intel_core.sql first.`,
    );
  }
}

function buildSeedData() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const sources: SourceSeed[] = [
    {
      id: SOURCE_IDS.cbre,
      name: "CBRE Edmonton Industrial",
      slug: "cbre-edmonton-industrial",
      kind: "manual_upload",
      feedUrl: null,
      fieldMapping: {
        title: "Property Name",
        availableSf: "Available SF",
        submarket: "Submarket",
      },
      isActive: true,
    },
    {
      id: SOURCE_IDS.loopnet,
      name: "LoopNet Industrial Watchlist",
      slug: "loopnet-industrial-watchlist",
      kind: "csv_url",
      feedUrl: "https://example.com/feeds/loopnet-industrial.csv",
      fieldMapping: {
        title: "listing_title",
        availableSf: "available_sf",
        brochureUrl: "brochure_link",
      },
      isActive: true,
    },
    {
      id: SOURCE_IDS.direct,
      name: "Direct Broker Share",
      slug: "direct-broker-share",
      kind: "manual_upload",
      feedUrl: null,
      fieldMapping: {
        title: "Name",
        notes: "Comments",
      },
      isActive: true,
    },
  ];

  const runs: RunSeed[] = [
    {
      id: RUN_IDS.morning,
      sourceId: SOURCE_IDS.cbre,
      triggerType: "manual_seed",
      status: "completed",
      startedAt: fourHoursAgo,
      completedAt: threeHoursAgo,
      recordsSeen: 4,
      recordsNew: 2,
      recordsUpdated: 1,
      recordsRemoved: 0,
      errorMessage: null,
    },
    {
      id: RUN_IDS.afternoon,
      sourceId: SOURCE_IDS.loopnet,
      triggerType: "manual_seed",
      status: "completed",
      startedAt: twoHoursAgo,
      completedAt: oneHourAgo,
      recordsSeen: 5,
      recordsNew: 1,
      recordsUpdated: 2,
      recordsRemoved: 1,
      errorMessage: null,
    },
  ];

  const listings: ListingSeed[] = [
    {
      id: LISTING_IDS.nisku,
      sourceId: SOURCE_IDS.cbre,
      sourceRecordKey: "cbre:nisku-crossdock",
      externalId: "CBRE-1001",
      status: "active",
      listingType: "lease",
      assetType: "building",
      title: "Nisku Crossdock Opportunity",
      address: "1804 8 Street, Nisku, AB",
      market: "Edmonton Region",
      submarket: "Nisku",
      lat: 53.334422,
      lng: -113.544091,
      availableSf: 48420,
      minDivisibleSf: 22000,
      clearHeightFt: 32,
      brochureUrl: "https://example.com/brochures/nisku-crossdock.pdf",
      sourceUrl: "https://example.com/listings/nisku-crossdock",
      rawPayload: {
        source: "CBRE",
        askingNet: 15.75,
        dockDoors: 12,
      },
      contentHash: "seed-hash-nisku-v2",
      firstSeenAt: yesterday,
      lastSeenAt: oneHourAgo,
      removedAt: null,
    },
    {
      id: LISTING_IDS.sherwood,
      sourceId: SOURCE_IDS.loopnet,
      sourceRecordKey: "loopnet:sherwood-bay",
      externalId: "LNET-2209",
      status: "active",
      listingType: "sale",
      assetType: "building",
      title: "Sherwood Park Front-Load Bay",
      address: "120 Pembina Road, Sherwood Park, AB",
      market: "Edmonton Region",
      submarket: "Sherwood Park",
      lat: 53.542101,
      lng: -113.286851,
      availableSf: 18750,
      minDivisibleSf: 18750,
      clearHeightFt: 28,
      brochureUrl: "https://example.com/brochures/sherwood-bay.pdf",
      sourceUrl: "https://example.com/listings/sherwood-bay",
      rawPayload: {
        source: "LoopNet",
        salePrice: 5350000,
        siteCoverage: "38%",
      },
      contentHash: "seed-hash-sherwood-v3",
      firstSeenAt: twoDaysAgo,
      lastSeenAt: oneHourAgo,
      removedAt: null,
    },
    {
      id: LISTING_IDS.yard,
      sourceId: SOURCE_IDS.direct,
      sourceRecordKey: "direct:50-street-yard",
      externalId: "DIR-50YARD",
      status: "removed",
      listingType: "lease",
      assetType: "yard",
      title: "50 Street IOS Yard",
      address: "6820 50 Street NW, Edmonton, AB",
      market: "Edmonton Region",
      submarket: "East Edmonton",
      lat: 53.50541,
      lng: -113.41693,
      availableSf: 9600,
      minDivisibleSf: 9600,
      clearHeightFt: 18,
      brochureUrl: "https://example.com/brochures/50-street-yard.pdf",
      sourceUrl: "https://example.com/listings/50-street-yard",
      rawPayload: {
        source: "Direct",
        yardAcres: 2.14,
        comments: "Pulled after owner committed to tenant.",
      },
      contentHash: "seed-hash-yard-v1",
      firstSeenAt: twoDaysAgo,
      lastSeenAt: twoHoursAgo,
      removedAt: oneHourAgo,
    },
    {
      id: LISTING_IDS.acheson,
      sourceId: SOURCE_IDS.cbre,
      sourceRecordKey: "cbre:acheson-bulk",
      externalId: "CBRE-2044",
      status: "active",
      listingType: "lease",
      assetType: "building",
      title: "Acheson Bulk Distribution",
      address: "27721 Acheson Road, Acheson, AB",
      market: "Edmonton Region",
      submarket: "Acheson",
      lat: 53.56039,
      lng: -114.0124,
      availableSf: 102400,
      minDivisibleSf: 51200,
      clearHeightFt: 36,
      brochureUrl: "https://example.com/brochures/acheson-bulk.pdf",
      sourceUrl: "https://example.com/listings/acheson-bulk",
      rawPayload: {
        source: "CBRE",
        railPotential: false,
        trailerStalls: 40,
      },
      contentHash: "seed-hash-acheson-v4",
      firstSeenAt: twoDaysAgo,
      lastSeenAt: oneHourAgo,
      removedAt: null,
    },
  ];

  const changes: ChangeSeed[] = [
    {
      id: CHANGE_IDS.nisku,
      listingId: LISTING_IDS.nisku,
      ingestRunId: RUN_IDS.morning,
      changeType: "new",
      changeSummary: "New crossdock listing published with 48,420 SF available in Nisku.",
      previousHash: null,
      newHash: "seed-hash-nisku-v2",
      observedAt: threeHoursAgo,
    },
    {
      id: CHANGE_IDS.sherwood,
      listingId: LISTING_IDS.sherwood,
      ingestRunId: RUN_IDS.afternoon,
      changeType: "updated",
      changeSummary: "Sale listing updated with revised pricing package and refreshed brochure link.",
      previousHash: "seed-hash-sherwood-v2",
      newHash: "seed-hash-sherwood-v3",
      observedAt: oneHourAgo,
    },
    {
      id: CHANGE_IDS.yard,
      listingId: LISTING_IDS.yard,
      ingestRunId: RUN_IDS.afternoon,
      changeType: "removed",
      changeSummary: "Yard listing removed from active availability after direct tenant commitment.",
      previousHash: "seed-hash-yard-v1",
      newHash: null,
      observedAt: oneHourAgo,
    },
    {
      id: CHANGE_IDS.acheson,
      listingId: LISTING_IDS.acheson,
      ingestRunId: RUN_IDS.afternoon,
      changeType: "reactivated",
      changeSummary: "Acheson bulk distribution listing returned to market after prior hold.",
      previousHash: "seed-hash-acheson-v3",
      newHash: "seed-hash-acheson-v4",
      observedAt: oneHourAgo,
    },
  ];

  return { sources, runs, listings, changes };
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function getIndustrialIntelSeedPreview(): IndustrialIntelSeedPreview {
  const { sources, runs, listings, changes } = buildSeedData();
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  return {
    summary: {
      activeListings: listings.filter((listing) => !listing.removedAt).length,
      newListings: changes.filter((change) => change.changeType === "new").length,
      changedListings: changes.filter((change) => change.changeType === "updated").length,
      removedListings: changes.filter((change) => change.changeType === "removed").length,
      lastRunAt: isoOrNull(runs[0] ? runs[runs.length - 1].completedAt : null),
    },
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      slug: source.slug,
      kind: source.kind,
      feedUrl: source.feedUrl,
      isActive: source.isActive,
      updatedAt: new Date().toISOString(),
    })),
    runs: runs
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((run) => ({
        id: run.id,
        sourceId: run.sourceId,
        sourceName: run.sourceId ? sourceNameById.get(run.sourceId) ?? null : null,
        triggerType: run.triggerType,
        status: run.status,
        startedAt: isoOrNull(run.startedAt),
        completedAt: isoOrNull(run.completedAt),
        recordsSeen: run.recordsSeen,
        recordsNew: run.recordsNew,
        recordsUpdated: run.recordsUpdated,
        recordsRemoved: run.recordsRemoved,
        errorMessage: run.errorMessage,
      })),
    listings: listings
      .slice()
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((listing) => ({
        id: listing.id,
        sourceId: listing.sourceId,
        sourceName: sourceNameById.get(listing.sourceId) ?? null,
        title: listing.title,
        address: listing.address,
        market: listing.market,
        submarket: listing.submarket,
        status: listing.status,
        listingType: listing.listingType,
        assetType: listing.assetType,
        availableSf: listing.availableSf,
        landAcres: listing.landAcres ?? null,
        totalPrice: listing.totalPrice ?? null,
        pricePerAcre: listing.pricePerAcre ?? null,
        brochureUrl: listing.brochureUrl,
        sourceUrl: listing.sourceUrl,
        lastSeenAt: isoOrNull(listing.lastSeenAt),
        removedAt: isoOrNull(listing.removedAt),
      })),
    changes: changes
      .slice()
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      .map((change) => ({
        id: change.id,
        listingId: change.listingId,
        listingTitle: listingById.get(change.listingId)?.title ?? "Unknown listing",
        sourceName: sourceNameById.get(listingById.get(change.listingId)?.sourceId ?? "") ?? null,
        changeType: change.changeType,
        changeSummary: change.changeSummary,
        observedAt: isoOrNull(change.observedAt),
      })),
  };
}

export async function seedIndustrialIntelCore(): Promise<IndustrialIntelSeedResult> {
  await ensureCoreTables();
  const client = await pool.connect();
  const { sources, runs, listings, changes } = buildSeedData();

  try {
    await client.query("BEGIN");

    for (const source of sources) {
      await client.query(
        `
          INSERT INTO public.intel_sources (
            id, name, slug, kind, feed_url, field_mapping, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            kind = EXCLUDED.kind,
            feed_url = EXCLUDED.feed_url,
            field_mapping = EXCLUDED.field_mapping,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `,
        [
          source.id,
          source.name,
          source.slug,
          source.kind,
          source.feedUrl,
          JSON.stringify(source.fieldMapping),
          source.isActive,
        ],
      );
    }

    for (const run of runs) {
      await client.query(
        `
          INSERT INTO public.intel_ingest_runs (
            id, source_id, trigger_type, status, started_at, completed_at,
            records_seen, records_new, records_updated, records_removed, error_message
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            source_id = EXCLUDED.source_id,
            trigger_type = EXCLUDED.trigger_type,
            status = EXCLUDED.status,
            started_at = EXCLUDED.started_at,
            completed_at = EXCLUDED.completed_at,
            records_seen = EXCLUDED.records_seen,
            records_new = EXCLUDED.records_new,
            records_updated = EXCLUDED.records_updated,
            records_removed = EXCLUDED.records_removed,
            error_message = EXCLUDED.error_message
        `,
        [
          run.id,
          run.sourceId,
          run.triggerType,
          run.status,
          run.startedAt,
          run.completedAt,
          run.recordsSeen,
          run.recordsNew,
          run.recordsUpdated,
          run.recordsRemoved,
          run.errorMessage,
        ],
      );
    }

    for (const listing of listings) {
      await client.query(
        `
          INSERT INTO public.intel_listings (
            id, source_id, source_record_key, external_id, status, listing_type, title,
            address, market, submarket, lat, lng, available_sf, min_divisible_sf,
            clear_height_ft, brochure_url, source_url, raw_payload, content_hash,
            first_seen_at, last_seen_at, removed_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18::jsonb, $19,
            $20, $21, $22, NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            source_id = EXCLUDED.source_id,
            source_record_key = EXCLUDED.source_record_key,
            external_id = EXCLUDED.external_id,
            status = EXCLUDED.status,
            listing_type = EXCLUDED.listing_type,
            title = EXCLUDED.title,
            address = EXCLUDED.address,
            market = EXCLUDED.market,
            submarket = EXCLUDED.submarket,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            available_sf = EXCLUDED.available_sf,
            min_divisible_sf = EXCLUDED.min_divisible_sf,
            clear_height_ft = EXCLUDED.clear_height_ft,
            brochure_url = EXCLUDED.brochure_url,
            source_url = EXCLUDED.source_url,
            raw_payload = EXCLUDED.raw_payload,
            content_hash = EXCLUDED.content_hash,
            first_seen_at = EXCLUDED.first_seen_at,
            last_seen_at = EXCLUDED.last_seen_at,
            removed_at = EXCLUDED.removed_at,
            updated_at = NOW()
        `,
        [
          listing.id,
          listing.sourceId,
          listing.sourceRecordKey,
          listing.externalId,
          listing.status,
          listing.listingType,
          listing.title,
          listing.address,
          listing.market,
          listing.submarket,
          listing.lat,
          listing.lng,
          listing.availableSf,
          listing.minDivisibleSf,
          listing.clearHeightFt,
          listing.brochureUrl,
          listing.sourceUrl,
          JSON.stringify(listing.rawPayload),
          listing.contentHash,
          listing.firstSeenAt,
          listing.lastSeenAt,
          listing.removedAt,
        ],
      );
    }

    for (const change of changes) {
      await client.query(
        `
          INSERT INTO public.intel_listing_changes (
            id, listing_id, ingest_run_id, change_type, change_summary,
            previous_hash, new_hash, observed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            listing_id = EXCLUDED.listing_id,
            ingest_run_id = EXCLUDED.ingest_run_id,
            change_type = EXCLUDED.change_type,
            change_summary = EXCLUDED.change_summary,
            previous_hash = EXCLUDED.previous_hash,
            new_hash = EXCLUDED.new_hash,
            observed_at = EXCLUDED.observed_at
        `,
        [
          change.id,
          change.listingId,
          change.ingestRunId,
          change.changeType,
          change.changeSummary,
          change.previousHash,
          change.newHash,
          change.observedAt,
        ],
      );
    }

    await client.query("COMMIT");

    return {
      seeded: true,
      sources: sources.length,
      runs: runs.length,
      listings: listings.length,
      changes: changes.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
