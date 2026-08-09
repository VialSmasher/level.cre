import { createHash } from 'crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'

import {
  normalizeMarketAddress,
  parseCurrentProjectsMarketMemoryValue,
  resolveMarketMemoryAgainstEntities,
  type CurrentProjectsMarketMemoryPreview,
  type MarketMemoryAnchor,
  type ResolvableMarketEntity,
} from '@level-cre/shared'

const BROKERAGE_MEMORY_SOURCE = 'current_projects_title_enrichment'

export const BrokerageMemoryPreviewInputSchema = z.object({
  sourceFileName: z.string().trim().min(1).max(500),
  payload: z.record(z.unknown()),
})

export const BrokerageMemoryImportInputSchema = BrokerageMemoryPreviewInputSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/i),
})

const FieldDecisionsSchema = z.object({
  location: z.boolean().default(true),
  municipal: z.boolean().default(true),
  legal: z.boolean().default(true),
  ownership: z.boolean().default(true),
  context: z.boolean().default(true),
}).default({
  location: true,
  municipal: true,
  legal: true,
  ownership: true,
  context: true,
})

export const BrokerageMemoryDecisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  targetDossierId: z.string().trim().min(1).nullable().optional(),
  targetProspectId: z.string().trim().min(1).nullable().optional(),
  targetListingId: z.string().trim().min(1).nullable().optional(),
  confirmConflicts: z.boolean().default(false),
  coordinateDecision: z.enum(['keep_existing', 'use_verified']).default('keep_existing'),
  fieldDecisions: FieldDecisionsSchema,
})

export type BrokerageMemoryFieldDecisions = z.infer<typeof FieldDecisionsSchema>

type BrokerageMemoryItemRow = {
  id: string
  import_id: string
  user_id: string
  external_anchor_id: string
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  base_layer: 'market_memory' | 'review'
  suggested_layer: 'existing' | 'market_memory' | 'review'
  address: string
  normalized_address: string | null
  lat: number | string
  lng: number | string
  matched_dossier_id: string | null
  matched_prospect_id: string | null
  matched_listing_id: string | null
  match_confidence: number | string
  resolution_json: Record<string, unknown> | null
  review_reasons: string[] | null
  anchor_payload: MarketMemoryAnchor
  decision_metadata: Record<string, unknown> | null
  decision_action: 'create_dossier' | 'link_dossier' | 'reject' | null
  decided_by_user_id: string | null
  approved_at: Date | string | null
  rejected_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  source_file_name?: string | null
  import_generated_at?: Date | string | null
}

type DossierFactDraft = {
  externalFactId: string
  factKey: string
  label: string
  valueText?: string | null
  valueNumber?: number | null
  valueJson?: Record<string, unknown> | null
  confidence: number
  observedAt?: string | null
  sourceMetadata: Record<string, unknown>
}

export class BrokerageMemoryServiceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'BrokerageMemoryServiceError'
    this.status = status
  }
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function itemToAnchor(row: BrokerageMemoryItemRow): MarketMemoryAnchor {
  const anchor = row.anchor_payload
  return {
    ...anchor,
    resolution: (row.resolution_json || undefined) as MarketMemoryAnchor['resolution'],
    latitude: numberOrNull(row.lat) ?? anchor.latitude,
    longitude: numberOrNull(row.lng) ?? anchor.longitude,
    reviewReasons: Array.isArray(row.review_reasons) ? row.review_reasons : anchor.reviewReasons,
    previewLayer: row.suggested_layer,
    persistence: {
      state: row.status === 'approved' ? 'approved' : 'pending',
      importId: row.import_id,
      importItemId: row.id,
      dossierId: row.matched_dossier_id,
      linkedProspectId: row.matched_prospect_id,
      linkedListingId: row.matched_listing_id,
      sourceFileName: row.source_file_name || null,
      savedAt: iso(row.updated_at),
    },
  }
}

function safeCandidate(candidate: NonNullable<MarketMemoryAnchor['resolution']>['candidates'][number]) {
  return {
    entityType: candidate.entityType,
    id: candidate.id,
    label: candidate.label,
    address: candidate.address || null,
    latitude: candidate.latitude ?? null,
    longitude: candidate.longitude ?? null,
    externalMemoryKey: candidate.externalMemoryKey || null,
    municipalAccountNumbers: candidate.municipalAccountNumbers || [],
    municipality: candidate.municipality || null,
    titleNumber: candidate.titleNumber || null,
    titleNumbers: candidate.titleNumbers || [],
    linc: candidate.linc || null,
    lincs: candidate.lincs || [],
    plan: candidate.plan || null,
    block: candidate.block || null,
    lot: candidate.lot || null,
    score: candidate.score,
    confidence: candidate.confidence,
    signals: candidate.signals,
    conflicts: candidate.conflicts,
    distanceMeters: candidate.distanceMeters,
  }
}

function safeResolution(resolution: MarketMemoryAnchor['resolution']) {
  if (!resolution) return undefined
  const candidates = resolution.candidates.map(safeCandidate)
  const topCandidate = resolution.topCandidate
    ? candidates.find((candidate) => candidate.entityType === resolution.topCandidate?.entityType && candidate.id === resolution.topCandidate?.id) || safeCandidate(resolution.topCandidate)
    : null
  return { decision: resolution.decision, topCandidate, candidates }
}

function stagingAnchorPayload(anchor: MarketMemoryAnchor): MarketMemoryAnchor {
  const { resolution: _resolution, persistence: _persistence, previewLayer: _previewLayer, ...canonical } = anchor
  return canonical
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

export function buildApprovedBrokerageMemoryPayload(
  previousValue: Record<string, unknown> | null | undefined,
  anchor: MarketMemoryAnchor,
  decisions: BrokerageMemoryFieldDecisions,
): MarketMemoryAnchor {
  const previous = (previousValue && typeof previousValue === 'object'
    ? previousValue
    : {}) as Partial<MarketMemoryAnchor>
  const previousIdentities = Array.isArray(previous.legalIdentities) ? previous.legalIdentities : []
  const identityKey = (identity: MarketMemoryAnchor['legalIdentities'][number]) => (
    identity.sourceHash || identity.titleIdentity || identity.sourcePath
  )
  const identities = new Map(previousIdentities.map((identity) => [identityKey(identity), identity]))

  if (decisions.legal || decisions.ownership || decisions.context) {
    for (const identity of anchor.legalIdentities) {
      const key = identityKey(identity)
      const existing = identities.get(key)
      identities.set(key, {
        titleIdentity: identity.titleIdentity,
        linc: decisions.legal ? identity.linc : existing?.linc ?? null,
        titleNumber: decisions.legal ? identity.titleNumber : existing?.titleNumber ?? null,
        legalDescription: decisions.legal ? identity.legalDescription : existing?.legalDescription ?? null,
        plan: decisions.legal ? identity.plan : existing?.plan ?? null,
        block: decisions.legal ? identity.block : existing?.block ?? null,
        lot: decisions.legal ? identity.lot : existing?.lot ?? null,
        registeredOwner: decisions.ownership ? identity.registeredOwner : existing?.registeredOwner ?? null,
        transferRegistrationDate: decisions.ownership
          ? identity.transferRegistrationDate
          : existing?.transferRegistrationDate ?? null,
        titlePulledDate: decisions.legal || decisions.ownership
          ? identity.titlePulledDate
          : existing?.titlePulledDate ?? null,
        sourcePath: identity.sourcePath || existing?.sourcePath || '',
        sourceHash: identity.sourceHash || existing?.sourceHash || '',
        sourceContext: decisions.context ? identity.sourceContext : existing?.sourceContext ?? null,
        extractionConfidence: identity.extractionConfidence || existing?.extractionConfidence || 0,
      })
    }
  }

  return {
    id: anchor.id,
    address: decisions.location ? anchor.address : previous.address || anchor.address,
    alternateAddresses: decisions.location
      ? uniqueStrings([...(previous.alternateAddresses || []), ...anchor.alternateAddresses])
      : previous.alternateAddresses || [],
    latitude: decisions.location ? anchor.latitude : previous.latitude ?? anchor.latitude,
    longitude: decisions.location ? anchor.longitude : previous.longitude ?? anchor.longitude,
    projects: decisions.context
      ? uniqueStrings([...(previous.projects || []), ...anchor.projects])
      : previous.projects || [],
    municipality: decisions.municipal ? anchor.municipality : previous.municipality ?? null,
    neighbourhood: decisions.municipal ? anchor.neighbourhood : previous.neighbourhood ?? null,
    zoning: decisions.municipal
      ? uniqueStrings([...(previous.zoning || []), ...anchor.zoning])
      : previous.zoning || [],
    parcelAreaSqM: decisions.municipal ? anchor.parcelAreaSqM : previous.parcelAreaSqM ?? null,
    parcelAreaAcres: decisions.municipal ? anchor.parcelAreaAcres : previous.parcelAreaAcres ?? null,
    accountNumbers: decisions.municipal
      ? uniqueStrings([...(previous.accountNumbers || []), ...anchor.accountNumbers])
      : previous.accountNumbers || [],
    legalIdentities: Array.from(identities.values()),
    sourceUrls: decisions.municipal
      ? uniqueStrings([...(previous.sourceUrls || []), ...anchor.sourceUrls])
      : previous.sourceUrls || [],
    capturedAt: decisions.location || decisions.municipal
      ? anchor.capturedAt
      : previous.capturedAt ?? null,
    reviewReasons: decisions.context
      ? uniqueStrings([...(previous.reviewReasons || []), ...anchor.reviewReasons])
      : previous.reviewReasons || [],
    reviewStatuses: decisions.context
      ? uniqueStrings([...(previous.reviewStatuses || []), ...anchor.reviewStatuses])
      : previous.reviewStatuses || [],
    suggestedUses: decisions.context
      ? uniqueStrings([...(previous.suggestedUses || []), ...anchor.suggestedUses])
      : previous.suggestedUses || [],
    confidence: anchor.confidence,
    baseLayer: anchor.baseLayer,
  }
}

export function buildNewBrokerageMemoryDossierInsert(params: {
  prospectId: string | null
  anchor: MarketMemoryAnchor
  canonicalPayload: MarketMemoryAnchor
  provenanceDocument: Record<string, unknown>
  importItemId: string
  userId: string
}) {
  return {
    text: `
      INSERT INTO public.intel_property_dossiers (
        canonical_listing_id, prospect_id, external_memory_key, memory_class,
        title, address, normalized_address, market, status, lat, lng,
        memory_payload, source_provenance, approved_at, origin_import_item_id,
        created_by_user_id, updated_at
      ) VALUES (
        NULL, $1, $2, 'market_memory', $3, $4, $5, $6, 'active', $7, $8,
        $9::jsonb, $10::jsonb, now(), $11, $12, now()
      ) RETURNING id
    `,
    values: [
      params.prospectId,
      params.anchor.id,
      params.anchor.address,
      params.anchor.address,
      normalizeMarketAddress(params.anchor.address),
      params.anchor.municipality,
      params.anchor.latitude,
      params.anchor.longitude,
      JSON.stringify(params.canonicalPayload),
      JSON.stringify(params.provenanceDocument),
      params.importItemId,
      params.userId,
    ],
  }
}

export function buildBrokerageMemoryReviewReasons(anchor: MarketMemoryAnchor) {
  const resolution = anchor.resolution
  const multipleCandidateReason = resolution?.decision === 'review' && resolution.candidates.length > 1
    ? `Multiple existing Level CRE candidates are plausible (${resolution.candidates.length}): ${resolution.candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.label} [${candidate.entityType}]${candidate.distanceMeters == null ? '' : ` - ${candidate.distanceMeters} m away`}`)
        .join('; ')}. Choose the canonical property before approval.`
    : null
  return uniqueStrings([
    ...anchor.reviewReasons,
    ...(resolution?.topCandidate?.conflicts || []),
    multipleCandidateReason,
  ])
}

function itemResponse(row: BrokerageMemoryItemRow) {
  const resolution = (row.resolution_json || {}) as Partial<NonNullable<MarketMemoryAnchor['resolution']>>
  const current = resolution.topCandidate
  const currentValues = current ? {
    location: [
      current.address || null,
      current.latitude != null && current.longitude != null
        ? `${Number(current.latitude).toFixed(6)}, ${Number(current.longitude).toFixed(6)}`
        : null,
    ].filter((value): value is string => Boolean(value)),
    municipal: [
      current.municipality || null,
      ...(current.municipalAccountNumbers || []).map((account) => `Account ${account}`),
    ].filter((value): value is string => Boolean(value)),
    legal: [
      current.titleNumber ? `Title ${current.titleNumber}` : null,
      ...(current.titleNumbers || []).map((title) => `Title ${title}`),
      current.linc ? `LINC ${current.linc}` : null,
      ...(current.lincs || []).map((linc) => `LINC ${linc}`),
      current.plan ? `Plan ${current.plan}` : null,
      current.block ? `Block ${current.block}` : null,
      current.lot ? `Lot ${current.lot}` : null,
    ].filter((value): value is string => Boolean(value)),
  } : undefined
  return {
    id: row.id,
    importId: row.import_id,
    status: row.status,
    suggestedLayer: row.suggested_layer,
    matchedDossierId: row.matched_dossier_id,
    matchedProspectId: row.matched_prospect_id,
    matchedListingId: row.matched_listing_id,
    matchConfidence: Number(row.match_confidence || 0),
    resolution,
    reviewReasons: Array.isArray(row.review_reasons) ? row.review_reasons : [],
    sourceFileName: row.source_file_name || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    currentValues,
    anchor: itemToAnchor(row),
  }
}

export async function assertBrokerageMemorySchema(pool: Pool | PoolClient) {
  try {
    await pool.query(`
      SELECT items.decision_action, items.decided_by_user_id, dossiers.origin_import_item_id
      FROM public.brokerage_memory_items items
      LEFT JOIN public.intel_property_dossiers dossiers ON false
      LIMIT 0
    `)
    await pool.query(`SELECT id FROM public.intel_dossier_entity_links LIMIT 0`)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === '42P01' || code === '42703') {
      throw new BrokerageMemoryServiceError('Brokerage-memory storage is not ready. Apply migration 0018 before using this endpoint.', 503)
    }
    throw error
  }
}

async function loadResolvableEntities(pool: Pool, userId: string): Promise<ResolvableMarketEntity[]> {
  const [prospects, listings, dossiers] = await Promise.all([
    pool.query(`
      SELECT id, name, address, location_lat, location_lng,
             COALESCE(
               location_lat,
               CASE WHEN geometry IS NULL OR ST_IsEmpty(geometry) THEN NULL ELSE ST_Y(ST_Centroid(geometry)) END
             ) AS resolved_lat,
             COALESCE(
               location_lng,
               CASE WHEN geometry IS NULL OR ST_IsEmpty(geometry) THEN NULL ELSE ST_X(ST_Centroid(geometry)) END
             ) AS resolved_lng,
             market_key,
             contact_phone, contact_email, website_url, business_name, contact_company,
             ai_metadata -> 'googlePlace' ->> 'placeId' AS place_id,
             ai_metadata -> 'legalIdentity' ->> 'municipality' AS municipality,
             ai_metadata -> 'legalIdentity' ->> 'titleNumber' AS title_number,
             ai_metadata -> 'legalIdentity' ->> 'linc' AS linc,
             ai_metadata -> 'legalIdentity' ->> 'plan' AS plan,
             ai_metadata -> 'legalIdentity' ->> 'block' AS block,
             ai_metadata -> 'legalIdentity' ->> 'lot' AS lot
      FROM public.prospects
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1000
    `, [userId]),
    pool.query(`
      SELECT id, title, address, lat, lng
      FROM public.listings
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 750
    `, [userId]),
    pool.query(`
      SELECT d.id, d.title, d.address, d.lat, d.lng, d.external_memory_key,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'municipality') AS municipality,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'title_number') AS title_number,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'title_number'), NULL) AS title_numbers,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'linc') AS linc,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'linc'), NULL) AS lincs,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'municipal_account'), NULL) AS municipal_accounts,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'plan') AS plan,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'block') AS block,
             MAX(f.value_text) FILTER (WHERE f.status = 'approved' AND f.fact_key = 'lot') AS lot
      FROM public.intel_property_dossiers d
      LEFT JOIN public.intel_dossier_facts f ON f.dossier_id = d.id
      WHERE d.created_by_user_id = $1 AND d.status <> 'archived'
      GROUP BY d.id
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
      LIMIT 750
    `, [userId]),
  ])

  return [
    ...prospects.rows.map((row) => ({
      entityType: 'prospect' as const,
      id: row.id,
      label: row.business_name || row.contact_company || row.name || row.address || 'Untitled prospect',
      address: row.address || row.name || null,
      latitude: numberOrNull(row.resolved_lat),
      longitude: numberOrNull(row.resolved_lng),
      placeId: row.place_id || null,
      marketKey: row.market_key || null,
      phone: row.contact_phone || null,
      email: row.contact_email || null,
      websiteUrl: row.website_url || null,
      businessName: row.business_name || row.contact_company || null,
      municipality: row.municipality || null,
      titleNumber: row.title_number || null,
      linc: row.linc || null,
      plan: row.plan || null,
      block: row.block || null,
      lot: row.lot || null,
    })),
    ...listings.rows.map((row) => ({
      entityType: 'listing' as const,
      id: row.id,
      label: row.title || row.address || 'Untitled listing',
      address: row.address || null,
      latitude: numberOrNull(row.lat),
      longitude: numberOrNull(row.lng),
    })),
    ...dossiers.rows.map((row) => ({
      entityType: 'dossier' as const,
      id: row.id,
      label: row.title || row.address || 'Untitled property memory',
      address: row.address || null,
      latitude: numberOrNull(row.lat),
      longitude: numberOrNull(row.lng),
      municipality: row.municipality || null,
      titleNumber: row.title_number || null,
      linc: row.linc || null,
      plan: row.plan || null,
      block: row.block || null,
      lot: row.lot || null,
      externalMemoryKey: row.external_memory_key || null,
      municipalAccountNumbers: Array.isArray(row.municipal_accounts) ? row.municipal_accounts : [],
      titleNumbers: Array.isArray(row.title_numbers) ? row.title_numbers : [],
      lincs: Array.isArray(row.lincs) ? row.lincs : [],
    })),
  ]
}

function matchIds(anchor: MarketMemoryAnchor) {
  const candidate = anchor.resolution?.topCandidate || null
  return {
    matchedDossierId: candidate?.entityType === 'dossier' ? candidate.id : null,
    matchedProspectId: candidate?.entityType === 'prospect' ? candidate.id : null,
    matchedListingId: candidate?.entityType === 'listing' ? candidate.id : null,
    confidence: Math.round(candidate?.confidence || 0),
  }
}

async function loadImportItems(client: Pool | PoolClient, userId: string, importId?: string) {
  const values: unknown[] = [userId]
  const importFilter = importId ? `AND items.import_id = $${values.push(importId)}` : ''
  const result = await client.query<BrokerageMemoryItemRow>(`
    SELECT items.*, imports.source_file_name, imports.generated_at AS import_generated_at
    FROM public.brokerage_memory_items items
    INNER JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id
    WHERE items.user_id = $1
      ${importFilter}
      AND imports.status <> 'superseded'
      AND items.status IN ('pending', 'approved')
    ORDER BY
      CASE items.suggested_layer WHEN 'review' THEN 0 WHEN 'existing' THEN 1 ELSE 2 END,
      items.address ASC
  `, values)
  return result.rows
}

export async function previewBrokerageMemoryImport(params: {
  pool: Pool
  userId: string
  sourceFileName: string
  payload: unknown
}) {
  await assertBrokerageMemorySchema(params.pool)
  const parsed = parseCurrentProjectsMarketMemoryValue(params.payload)
  if (parsed.anchors.length !== parsed.expectedAnchors) {
    throw new BrokerageMemoryServiceError(
      `The file expects ${parsed.expectedAnchors} property anchors, but ${parsed.anchors.length} were resolved.`,
      409,
    )
  }
  if (new Set(parsed.anchors.map((anchor) => anchor.id)).size !== parsed.anchors.length) {
    throw new BrokerageMemoryServiceError('The file produced duplicate canonical property identities. Correct the parcel grouping before staging it.', 409)
  }
  const entities = await loadResolvableEntities(params.pool, params.userId)
  const anchors = resolveMarketMemoryAgainstEntities(parsed.anchors, entities)
  const sourceHash = stableHash(params.payload)
  return {
    sourceHash,
    preview: {
      ...parsed,
      sourceFileName: params.sourceFileName,
      anchors,
    } satisfies CurrentProjectsMarketMemoryPreview,
    summary: {
      identities: parsed.sourceIdentities,
      anchors: anchors.length,
      existing: anchors.filter((anchor) => anchor.previewLayer === 'existing').length,
      marketMemory: anchors.filter((anchor) => anchor.previewLayer === 'market_memory').length,
      review: anchors.filter((anchor) => anchor.previewLayer === 'review').length,
      pending: 0,
    },
  }
}

export async function stageBrokerageMemoryImport(params: {
  pool: Pool
  userId: string
  sourceFileName: string
  payload: unknown
  previewHash: string
}) {
  const resolved = await previewBrokerageMemoryImport(params)
  const parsed = resolved.preview
  const anchors = parsed.anchors
  const sourceHash = resolved.sourceHash
  if (params.previewHash.toLowerCase() !== sourceHash.toLowerCase()) {
    throw new BrokerageMemoryServiceError('The file changed after preview. Preview it again before saving to Review.', 409)
  }
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${params.userId}:${BROKERAGE_MEMORY_SOURCE}`])
    const existingImport = await client.query<{ id: string; status: string }>(`
      SELECT id, status FROM public.brokerage_memory_imports
      WHERE user_id = $1 AND source = $2 AND source_hash = $3
      LIMIT 1
    `, [params.userId, BROKERAGE_MEMORY_SOURCE, sourceHash])

    let importId = existingImport.rows[0]?.id || null
    let duplicate = Boolean(importId)
    if (!importId) {
      const partiallyApproved = await client.query<{ id: string }>(`
        SELECT id FROM public.brokerage_memory_imports
        WHERE user_id = $1 AND source = $2 AND status = 'partially_approved'
        LIMIT 1
      `, [params.userId, BROKERAGE_MEMORY_SOURCE])
      if (partiallyApproved.rows[0]) {
        throw new BrokerageMemoryServiceError('Finish or reject the remaining properties in the current partially approved import before staging a changed file.', 409)
      }
      const staleImports = await client.query<{ id: string }>(`
        UPDATE public.brokerage_memory_imports
        SET status = 'superseded', updated_at = now()
        WHERE user_id = $1 AND source = $2 AND status = 'preview'
        RETURNING id
      `, [params.userId, BROKERAGE_MEMORY_SOURCE])
      if (staleImports.rows.length) {
        await client.query(`
          UPDATE public.brokerage_memory_items
          SET status = 'superseded', updated_at = now()
          WHERE import_id = ANY($1::varchar[]) AND status = 'pending'
        `, [staleImports.rows.map((row) => row.id)])
      }
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO public.brokerage_memory_imports (
          user_id, source, source_file_name, source_hash, generated_at,
          status, identity_count, anchor_count, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'preview', $6, $7, now())
        RETURNING id
      `, [
        params.userId,
        BROKERAGE_MEMORY_SOURCE,
        params.sourceFileName,
        sourceHash,
        parsed.generatedAt,
        parsed.sourceIdentities,
        anchors.length,
      ])
      importId = inserted.rows[0].id
      duplicate = false
    } else {
      if (existingImport.rows[0]?.status === 'superseded') {
        const partiallyApproved = await client.query<{ id: string }>(`
          SELECT id FROM public.brokerage_memory_imports
          WHERE user_id = $1 AND source = $2 AND status = 'partially_approved' AND id <> $3
          LIMIT 1
        `, [params.userId, BROKERAGE_MEMORY_SOURCE, importId])
        if (partiallyApproved.rows[0]) {
          throw new BrokerageMemoryServiceError('Finish or reject the remaining properties in the current partially approved import before staging a changed file.', 409)
        }
        const staleImports = await client.query<{ id: string }>(`
          UPDATE public.brokerage_memory_imports
          SET status = 'superseded', updated_at = now()
          WHERE user_id = $1 AND source = $2 AND status = 'preview' AND id <> $3
          RETURNING id
        `, [params.userId, BROKERAGE_MEMORY_SOURCE, importId])
        if (staleImports.rows.length) {
          await client.query(`
            UPDATE public.brokerage_memory_items
            SET status = 'superseded', updated_at = now()
            WHERE import_id = ANY($1::varchar[]) AND status = 'pending'
          `, [staleImports.rows.map((row) => row.id)])
        }
        await client.query(`
          UPDATE public.brokerage_memory_items
          SET status = 'pending', updated_at = now()
          WHERE import_id = $1 AND status = 'superseded'
        `, [importId])
      }
      await client.query(`
        UPDATE public.brokerage_memory_imports
        SET source_file_name = $3, generated_at = $4, identity_count = $5, anchor_count = $6,
            status = CASE WHEN status = 'superseded' THEN 'preview' ELSE status END,
            updated_at = now()
        WHERE id = $1 AND user_id = $2
      `, [importId, params.userId, params.sourceFileName, parsed.generatedAt, parsed.sourceIdentities, anchors.length])
    }

    for (const anchor of anchors) {
      const matches = matchIds(anchor)
      await client.query(`
        INSERT INTO public.brokerage_memory_items (
          import_id, user_id, external_anchor_id, status, base_layer, suggested_layer,
          address, normalized_address, lat, lng,
          matched_dossier_id, matched_prospect_id, matched_listing_id, match_confidence,
          resolution_json, review_reasons, anchor_payload, updated_at
        ) VALUES (
          $1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, now()
        )
        ON CONFLICT (import_id, external_anchor_id) DO UPDATE SET
          base_layer = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.base_layer ELSE public.brokerage_memory_items.base_layer END,
          suggested_layer = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.suggested_layer ELSE public.brokerage_memory_items.suggested_layer END,
          address = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.address ELSE public.brokerage_memory_items.address END,
          normalized_address = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.normalized_address ELSE public.brokerage_memory_items.normalized_address END,
          lat = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.lat ELSE public.brokerage_memory_items.lat END,
          lng = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.lng ELSE public.brokerage_memory_items.lng END,
          matched_dossier_id = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.matched_dossier_id ELSE public.brokerage_memory_items.matched_dossier_id END,
          matched_prospect_id = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.matched_prospect_id ELSE public.brokerage_memory_items.matched_prospect_id END,
          matched_listing_id = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.matched_listing_id ELSE public.brokerage_memory_items.matched_listing_id END,
          match_confidence = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.match_confidence ELSE public.brokerage_memory_items.match_confidence END,
          resolution_json = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.resolution_json ELSE public.brokerage_memory_items.resolution_json END,
          review_reasons = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.review_reasons ELSE public.brokerage_memory_items.review_reasons END,
          anchor_payload = CASE WHEN public.brokerage_memory_items.status = 'pending' THEN EXCLUDED.anchor_payload ELSE public.brokerage_memory_items.anchor_payload END,
          updated_at = now()
      `, [
        importId,
        params.userId,
        anchor.id,
        anchor.baseLayer,
        anchor.previewLayer || anchor.baseLayer,
        anchor.address,
        normalizeMarketAddress(anchor.address),
        anchor.latitude,
        anchor.longitude,
        matches.matchedDossierId,
        matches.matchedProspectId,
        matches.matchedListingId,
        matches.confidence,
        JSON.stringify(safeResolution(anchor.resolution) || {}),
        JSON.stringify(buildBrokerageMemoryReviewReasons(anchor)),
        JSON.stringify(stagingAnchorPayload(anchor)),
      ])
    }
    await client.query('COMMIT')
    const rows = await loadImportItems(params.pool, params.userId, importId)
    const preview: CurrentProjectsMarketMemoryPreview = {
      ...parsed,
      importId,
      sourceFileName: params.sourceFileName,
      anchors: rows.map(itemToAnchor),
    }
    return {
      duplicate,
      importId,
      sourceHash,
      summary: {
        identities: parsed.sourceIdentities,
        anchors: rows.length,
        existing: rows.filter((row) => row.suggested_layer === 'existing').length,
        marketMemory: rows.filter((row) => row.suggested_layer === 'market_memory').length,
        review: rows.filter((row) => row.suggested_layer === 'review').length,
        pending: rows.filter((row) => row.status === 'pending').length,
      },
      preview,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listBrokerageMemoryReview(params: { pool: Pool; userId: string; limit?: number }) {
  await assertBrokerageMemorySchema(params.pool)
  const limit = Math.min(Math.max(params.limit || 100, 1), 250)
  const result = await params.pool.query<BrokerageMemoryItemRow>(`
    SELECT items.*, imports.source_file_name, imports.generated_at AS import_generated_at
    FROM public.brokerage_memory_items items
    INNER JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id
    WHERE items.user_id = $1 AND items.status = 'pending' AND imports.status <> 'superseded'
    ORDER BY
      CASE items.suggested_layer WHEN 'review' THEN 0 WHEN 'existing' THEN 1 ELSE 2 END,
      items.address ASC
    LIMIT $2
  `, [params.userId, limit])
  return { rows: result.rows.map(itemResponse) }
}

function factId(anchor: MarketMemoryAnchor, factKey: string, sourceIdentity: string, value: unknown) {
  return stableHash({ anchorId: anchor.id, factKey, sourceIdentity, value })
}

export function buildBrokerageMemoryFactDrafts(
  anchor: MarketMemoryAnchor,
  decisions: BrokerageMemoryFieldDecisions,
): DossierFactDraft[] {
  const drafts: DossierFactDraft[] = []
  const add = (draft: Omit<DossierFactDraft, 'externalFactId'> & { sourceIdentity?: string }) => {
    const value = draft.valueJson ?? draft.valueNumber ?? draft.valueText ?? null
    drafts.push({
      ...draft,
      externalFactId: factId(anchor, draft.factKey, draft.sourceIdentity || anchor.id, value),
    })
  }

  if (decisions.location) {
    add({ factKey: 'civic_address', label: 'Civic address', valueText: anchor.address, confidence: anchor.confidence === 'high' ? 100 : 80, observedAt: anchor.capturedAt, sourceMetadata: { alternateAddresses: anchor.alternateAddresses } })
    add({ factKey: 'coordinates', label: 'Coordinates', valueJson: { latitude: anchor.latitude, longitude: anchor.longitude }, confidence: anchor.confidence === 'high' ? 100 : 80, observedAt: anchor.capturedAt, sourceMetadata: { sourceUrls: anchor.sourceUrls } })
  }
  if (decisions.municipal) {
    if (anchor.municipality) add({ factKey: 'municipality', label: 'Municipality', valueText: anchor.municipality, confidence: 100, observedAt: anchor.capturedAt, sourceMetadata: { sourceUrls: anchor.sourceUrls } })
    if (anchor.neighbourhood) add({ factKey: 'neighbourhood', label: 'Neighbourhood', valueText: anchor.neighbourhood, confidence: 95, observedAt: anchor.capturedAt, sourceMetadata: { sourceUrls: anchor.sourceUrls } })
    if (anchor.zoning.length) add({ factKey: 'zoning', label: 'Zoning', valueText: anchor.zoning.join(' / '), confidence: 95, observedAt: anchor.capturedAt, sourceMetadata: { sourceUrls: anchor.sourceUrls } })
    if (anchor.parcelAreaAcres != null) add({ factKey: 'parcel_area_acres', label: 'Parcel area (acres)', valueNumber: anchor.parcelAreaAcres, confidence: 95, observedAt: anchor.capturedAt, sourceMetadata: { parcelAreaSqM: anchor.parcelAreaSqM, sourceUrls: anchor.sourceUrls } })
    for (const account of anchor.accountNumbers) add({ factKey: 'municipal_account', label: 'Municipal account', valueText: account, confidence: 95, observedAt: anchor.capturedAt, sourceMetadata: { sourceUrls: anchor.sourceUrls }, sourceIdentity: account })
  }
  for (const identity of anchor.legalIdentities) {
    const sourceMetadata = {
      sourcePath: identity.sourcePath,
      sourceHash: identity.sourceHash,
      sourceContext: identity.sourceContext,
      titlePulledDate: identity.titlePulledDate,
      transferRegistrationDate: identity.transferRegistrationDate,
    }
    if (decisions.legal) {
      add({ factKey: 'title_snapshot', label: identity.titleNumber ? `Title ${identity.titleNumber}` : 'Land title snapshot', valueJson: identity as unknown as Record<string, unknown>, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate || anchor.capturedAt, sourceMetadata, sourceIdentity: `${identity.titleIdentity}:${identity.sourceHash}` })
      if (identity.titleNumber) add({ factKey: 'title_number', label: 'Title number', valueText: identity.titleNumber, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
      if (identity.linc) add({ factKey: 'linc', label: 'LINC', valueText: identity.linc, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
      if (identity.legalDescription) add({ factKey: 'legal_description', label: 'Legal description', valueText: identity.legalDescription, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
      if (identity.plan) add({ factKey: 'plan', label: 'Plan', valueText: identity.plan, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
      if (identity.block) add({ factKey: 'block', label: 'Block', valueText: identity.block, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
      if (identity.lot) add({ factKey: 'lot', label: 'Lot', valueText: identity.lot, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
    }
    if (decisions.ownership && identity.registeredOwner) {
      add({ factKey: 'registered_owner', label: 'Registered owner shown on title', valueText: identity.registeredOwner, confidence: identity.extractionConfidence, observedAt: identity.titlePulledDate, sourceMetadata, sourceIdentity: identity.titleIdentity })
    }
  }
  if (decisions.context) {
    if (anchor.projects.length) add({ factKey: 'project_context', label: 'Projects touched', valueText: anchor.projects.join(' / '), confidence: 100, observedAt: anchor.capturedAt, sourceMetadata: { suggestedUses: anchor.suggestedUses, reviewStatuses: anchor.reviewStatuses } })
    if (anchor.reviewReasons.length) add({ factKey: 'review_context', label: 'Review context', valueJson: { reasons: anchor.reviewReasons, statuses: anchor.reviewStatuses }, confidence: 100, observedAt: anchor.capturedAt, sourceMetadata: {} })
  }
  return drafts
}

async function updateImportStatus(client: PoolClient, importId: string) {
  const counts = await client.query<{ pending: number | string; approved: number | string }>(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
    FROM public.brokerage_memory_items
    WHERE import_id = $1
  `, [importId])
  const pending = Number(counts.rows[0]?.pending || 0)
  const approved = Number(counts.rows[0]?.approved || 0)
  const status = pending === 0 ? 'completed' : approved > 0 ? 'partially_approved' : 'preview'
  await client.query(`UPDATE public.brokerage_memory_imports SET status = $2, updated_at = now() WHERE id = $1`, [importId, status])
}

export async function decideBrokerageMemoryItem(params: {
  pool: Pool
  userId: string
  itemId: string
  decision: z.infer<typeof BrokerageMemoryDecisionSchema>
}) {
  await assertBrokerageMemorySchema(params.pool)
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    const itemResult = await client.query<BrokerageMemoryItemRow>(`
      SELECT items.*, imports.source_file_name, imports.generated_at AS import_generated_at
      FROM public.brokerage_memory_items items
      INNER JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id
      WHERE items.id = $1 AND items.user_id = $2
      FOR UPDATE OF items
    `, [params.itemId, params.userId])
    const item = itemResult.rows[0]
    if (!item) throw new BrokerageMemoryServiceError('Brokerage-memory review item not found.', 404)
    if (item.status === 'approved' || item.status === 'rejected') {
      await client.query('COMMIT')
      return { alreadyReviewed: true, action: item.status, item: itemResponse(item), dossierId: item.matched_dossier_id }
    }
    if (item.status !== 'pending') throw new BrokerageMemoryServiceError('This brokerage-memory item is no longer active.', 409)

    if (params.decision.action === 'reject') {
      const rejected = await client.query<BrokerageMemoryItemRow>(`
        UPDATE public.brokerage_memory_items
        SET status = 'rejected', rejected_at = now(), updated_at = now(),
            decision_action = 'reject', decided_by_user_id = $2,
            decision_metadata = $3::jsonb
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [params.itemId, params.userId, JSON.stringify({ action: 'reject', reviewedAt: new Date().toISOString() })])
      await updateImportStatus(client, item.import_id)
      await client.query('COMMIT')
      return { alreadyReviewed: false, action: 'rejected', item: itemResponse({ ...rejected.rows[0], source_file_name: item.source_file_name }) }
    }

    const anchor = item.anchor_payload
    if (!params.decision.fieldDecisions.location) {
      throw new BrokerageMemoryServiceError('A map-visible property requires an approved civic location.', 409)
    }
    if (item.suggested_layer === 'review' && !params.decision.confirmConflicts) {
      throw new BrokerageMemoryServiceError('Confirm the displayed conflicts before approving this property.', 409)
    }

    const requestedProspectId = params.decision.targetProspectId === undefined
      ? item.matched_prospect_id
      : params.decision.targetProspectId
    const requestedListingId = params.decision.targetListingId === undefined
      ? item.matched_listing_id
      : params.decision.targetListingId
    if (requestedProspectId) {
      const prospect = await client.query(`SELECT id FROM public.prospects WHERE id = $1 AND user_id = $2 LIMIT 1`, [requestedProspectId, params.userId])
      if (!prospect.rows[0]) throw new BrokerageMemoryServiceError('Selected prospect was not found.', 404)
    }
    if (requestedListingId) {
      const listing = await client.query(`SELECT id FROM public.listings WHERE id = $1 AND user_id = $2 LIMIT 1`, [requestedListingId, params.userId])
      if (!listing.rows[0]) throw new BrokerageMemoryServiceError('Selected listing was not found.', 404)
    }

    let dossierId = params.decision.targetDossierId === undefined
      ? item.matched_dossier_id
      : params.decision.targetDossierId
    if (!dossierId && requestedProspectId) {
      const dossier = await client.query<{ id: string }>(`
        SELECT id FROM public.intel_property_dossiers
        WHERE created_by_user_id = $1 AND prospect_id = $2 AND status <> 'archived'
        ORDER BY updated_at DESC NULLS LAST LIMIT 1
      `, [params.userId, requestedProspectId])
      dossierId = dossier.rows[0]?.id || null
    }
    if (!dossierId) {
      const byMemoryKey = await client.query<{ id: string }>(`
        SELECT id FROM public.intel_property_dossiers
        WHERE created_by_user_id = $1 AND external_memory_key = $2 AND status <> 'archived'
        ORDER BY updated_at DESC NULLS LAST LIMIT 1
      `, [params.userId, anchor.id])
      dossierId = byMemoryKey.rows[0]?.id || null
    }

    type DossierAuditRow = {
      id: string
      canonical_listing_id: string | null
      prospect_id: string | null
      external_memory_key: string | null
      memory_class: string | null
      title: string
      address: string | null
      normalized_address: string | null
      market: string | null
      status: string
      lat: number | string | null
      lng: number | string | null
      memory_payload: Record<string, unknown> | null
      source_provenance: Record<string, unknown> | null
      approved_at: Date | string | null
      origin_import_item_id: string | null
    }
    let beforeDossier: DossierAuditRow | null = null
    if (dossierId) {
      const dossier = await client.query<DossierAuditRow>(`
        SELECT id, canonical_listing_id, prospect_id, external_memory_key, memory_class,
               title, address, normalized_address, market, status, lat, lng,
               memory_payload, source_provenance, approved_at, origin_import_item_id
        FROM public.intel_property_dossiers
        WHERE id = $1 AND created_by_user_id = $2 AND status <> 'archived'
        LIMIT 1
      `, [dossierId, params.userId])
      beforeDossier = dossier.rows[0] || null
      if (!beforeDossier) throw new BrokerageMemoryServiceError('Selected property dossier was not found or is archived.', 404)
      if (beforeDossier.external_memory_key && beforeDossier.external_memory_key !== anchor.id) {
        throw new BrokerageMemoryServiceError('The selected dossier belongs to a different canonical parcel key.', 409)
      }
      if (beforeDossier.prospect_id && requestedProspectId && beforeDossier.prospect_id !== requestedProspectId) {
        throw new BrokerageMemoryServiceError('The selected dossier is already linked to a different prospect.', 409)
      }
    }

    const provenance = {
      source: BROKERAGE_MEMORY_SOURCE,
      importId: item.import_id,
      importItemId: item.id,
      sourceFileName: item.source_file_name || null,
      approvedAt: new Date().toISOString(),
      fieldDecisions: params.decision.fieldDecisions,
      coordinateDecision: params.decision.coordinateDecision,
    }
    const canonicalPayload = buildApprovedBrokerageMemoryPayload(
      beforeDossier?.memory_payload,
      anchor,
      params.decision.fieldDecisions,
    )
    const provenanceDocument = { latest: provenance, history: [provenance] }
    let createdDossier = false
    if (!dossierId) {
      const insert = buildNewBrokerageMemoryDossierInsert({
        prospectId: requestedProspectId,
        anchor,
        canonicalPayload,
        provenanceDocument,
        importItemId: item.id,
        userId: params.userId,
      })
      const created = await client.query<{ id: string }>(insert.text, insert.values)
      dossierId = created.rows[0].id
      createdDossier = true
    } else {
      await client.query(`
        UPDATE public.intel_property_dossiers
        SET
          prospect_id = COALESCE(prospect_id, $3),
          external_memory_key = COALESCE(external_memory_key, $4),
          address = COALESCE(address, $5),
          normalized_address = COALESCE(normalized_address, $6),
          market = COALESCE(market, $7),
          lat = CASE WHEN $8 = 'use_verified' THEN $9 ELSE COALESCE(lat, $9) END,
          lng = CASE WHEN $8 = 'use_verified' THEN $10 ELSE COALESCE(lng, $10) END,
          memory_payload = $11::jsonb,
          source_provenance = COALESCE(source_provenance, '{}'::jsonb)
            || jsonb_build_object(
              'latest', $12::jsonb,
              'history', COALESCE(source_provenance -> 'history', '[]'::jsonb) || jsonb_build_array($12::jsonb)
            ),
          approved_at = now(),
          updated_at = now()
        WHERE id = $1 AND created_by_user_id = $2
      `, [
        dossierId,
        params.userId,
        requestedProspectId,
        anchor.id,
        anchor.address,
        normalizeMarketAddress(anchor.address),
        anchor.municipality,
        params.decision.coordinateDecision,
        anchor.latitude,
        anchor.longitude,
        JSON.stringify(canonicalPayload),
        JSON.stringify(provenance),
      ])
    }

    const effectiveProspectId = requestedProspectId || beforeDossier?.prospect_id || null
    for (const link of [
      effectiveProspectId ? { type: 'prospect', id: effectiveProspectId } : null,
      requestedListingId ? { type: 'listing', id: requestedListingId } : null,
    ].filter((value): value is { type: string; id: string } => Boolean(value))) {
      await client.query(`
        INSERT INTO public.intel_dossier_entity_links (
          dossier_id, user_id, entity_type, entity_id, relationship, source, import_item_id, updated_at
        ) VALUES ($1, $2, $3, $4, 'property_record', $5, $6, now())
        ON CONFLICT (dossier_id, entity_type, entity_id) DO UPDATE SET
          source = EXCLUDED.source,
          import_item_id = EXCLUDED.import_item_id,
          updated_at = now()
      `, [dossierId, params.userId, link.type, link.id, BROKERAGE_MEMORY_SOURCE, item.id])
    }

    const drafts = buildBrokerageMemoryFactDrafts(anchor, params.decision.fieldDecisions)
    for (const draft of drafts) {
      await client.query(`
        INSERT INTO public.intel_dossier_facts (
          dossier_id, fact_key, label, value_text, value_number, value_json,
          confidence, status, source, external_fact_id, import_item_id,
          observed_at, source_metadata, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb,
          $7, 'approved', $8, $9, $10,
          $11, $12::jsonb, now()
        )
        ON CONFLICT (dossier_id, external_fact_id) WHERE external_fact_id IS NOT NULL
        DO UPDATE SET
          label = EXCLUDED.label,
          value_text = EXCLUDED.value_text,
          value_number = EXCLUDED.value_number,
          value_json = EXCLUDED.value_json,
          confidence = EXCLUDED.confidence,
          status = 'approved',
          import_item_id = EXCLUDED.import_item_id,
          observed_at = EXCLUDED.observed_at,
          source_metadata = EXCLUDED.source_metadata,
          updated_at = now()
      `, [
        dossierId,
        draft.factKey,
        draft.label,
        draft.valueText ?? null,
        draft.valueNumber ?? null,
        draft.valueJson ? JSON.stringify(draft.valueJson) : null,
        draft.confidence,
        BROKERAGE_MEMORY_SOURCE,
        draft.externalFactId,
        item.id,
        draft.observedAt || anchor.capturedAt,
        JSON.stringify(draft.sourceMetadata),
      ])
    }

    const afterDossierResult = await client.query<DossierAuditRow>(`
      SELECT id, canonical_listing_id, prospect_id, external_memory_key, memory_class,
             title, address, normalized_address, market, status, lat, lng,
             memory_payload, source_provenance, approved_at, origin_import_item_id
      FROM public.intel_property_dossiers
      WHERE id = $1 AND created_by_user_id = $2
    `, [dossierId, params.userId])
    const decisionAction = createdDossier ? 'create_dossier' : 'link_dossier'
    const approved = await client.query<BrokerageMemoryItemRow>(`
      UPDATE public.brokerage_memory_items
      SET status = 'approved', matched_dossier_id = $3,
          matched_prospect_id = $4,
          matched_listing_id = $5,
          approved_at = now(), updated_at = now(),
          decision_action = $6, decided_by_user_id = $2,
          decision_metadata = $7::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [
      item.id,
      params.userId,
      dossierId,
      requestedProspectId,
      requestedListingId,
      decisionAction,
      JSON.stringify({
        ...provenance,
        action: 'approve',
        decisionAction,
        createdDossier,
        factCount: drafts.length,
        factIds: drafts.map((draft) => draft.externalFactId),
        beforeDossier,
        afterDossier: afterDossierResult.rows[0] || null,
      }),
    ])
    await updateImportStatus(client, item.import_id)
    await client.query('COMMIT')
    return {
      alreadyReviewed: false,
      action: 'approved',
      dossierId,
      factCount: drafts.length,
      item: itemResponse({ ...approved.rows[0], source_file_name: item.source_file_name }),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getBrokerageMemoryMap(params: { pool: Pool; userId: string }) {
  await assertBrokerageMemorySchema(params.pool)
  const [pendingRows, dossierRows, latestImport] = await Promise.all([
    params.pool.query<BrokerageMemoryItemRow>(`
      SELECT items.*, imports.source_file_name, imports.generated_at AS import_generated_at
      FROM public.brokerage_memory_items items
      INNER JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id
      WHERE items.user_id = $1 AND items.status = 'pending' AND imports.status <> 'superseded'
      ORDER BY items.address ASC
    `, [params.userId]),
    params.pool.query<{
      id: string
      prospect_id: string | null
      linked_listing_id: string | null
      title: string
      address: string | null
      lat: number | string | null
      lng: number | string | null
      memory_payload: MarketMemoryAnchor
      approved_at: Date | string | null
      source_file_name: string | null
      prospect_lat: number | string | null
      prospect_lng: number | string | null
    }>(`
      SELECT d.id, d.prospect_id, listing_link.entity_id AS linked_listing_id,
             d.title, d.address, d.lat, d.lng,
             d.memory_payload, d.approved_at,
             COALESCE(
               d.source_provenance -> 'latest' ->> 'sourceFileName',
               d.source_provenance ->> 'sourceFileName'
             ) AS source_file_name,
             p.location_lat AS prospect_lat, p.location_lng AS prospect_lng
      FROM public.intel_property_dossiers d
      LEFT JOIN public.prospects p ON p.id = d.prospect_id AND p.user_id = d.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT links.entity_id
        FROM public.intel_dossier_entity_links links
        WHERE links.dossier_id = d.id AND links.user_id = d.created_by_user_id AND links.entity_type = 'listing'
        ORDER BY links.updated_at DESC
        LIMIT 1
      ) listing_link ON true
      WHERE d.created_by_user_id = $1
        AND d.status <> 'archived'
        AND d.approved_at IS NOT NULL
        AND d.memory_payload <> '{}'::jsonb
      ORDER BY d.updated_at DESC NULLS LAST
    `, [params.userId]),
    params.pool.query<{
      id: string
      source_file_name: string | null
      generated_at: Date | string | null
      identity_count: number | string
      anchor_count: number | string
    }>(`
      SELECT id, source_file_name, generated_at, identity_count, anchor_count
      FROM public.brokerage_memory_imports
      WHERE user_id = $1 AND status <> 'superseded'
      ORDER BY created_at DESC LIMIT 1
    `, [params.userId]),
  ])

  const pendingDossierIds = new Set(pendingRows.rows.map((row) => row.matched_dossier_id).filter(Boolean))
  const approvedAnchors = dossierRows.rows
    .filter((row) => !pendingDossierIds.has(row.id))
    .map((row): MarketMemoryAnchor => {
      const payload = row.memory_payload || ({} as MarketMemoryAnchor)
      const displayLat = numberOrNull(row.prospect_lat) ?? numberOrNull(row.lat) ?? payload.latitude
      const displayLng = numberOrNull(row.prospect_lng) ?? numberOrNull(row.lng) ?? payload.longitude
      return {
        ...payload,
        id: payload.id || `dossier:${row.id}`,
        address: payload.address || row.address || row.title,
        latitude: displayLat,
        longitude: displayLng,
        previewLayer: row.prospect_id || row.linked_listing_id ? 'existing' : 'market_memory',
        persistence: {
          state: 'approved',
          dossierId: row.id,
          linkedProspectId: row.prospect_id,
          linkedListingId: row.linked_listing_id,
          sourceFileName: row.source_file_name,
          savedAt: iso(row.approved_at),
        },
      }
    })
  const pendingAnchors = pendingRows.rows.map(itemToAnchor)
  const latest = latestImport.rows[0]
  return {
    generatedAt: iso(latest?.generated_at) || new Date().toISOString(),
    sourceIdentities: Number(latest?.identity_count || 0),
    expectedAnchors: Number(latest?.anchor_count || approvedAnchors.length + pendingAnchors.length),
    importId: latest?.id || null,
    sourceFileName: latest?.source_file_name || null,
    linkedProspectIds: Array.from(new Set(
      [...approvedAnchors, ...pendingAnchors]
        .map((anchor) => anchor.persistence?.linkedProspectId)
        .filter((id): id is string => Boolean(id)),
    )),
    anchors: [...approvedAnchors, ...pendingAnchors],
  }
}
