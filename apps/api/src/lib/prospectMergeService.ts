import { createHash, randomUUID } from 'crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'

import { normalizeMarketAddress } from '@level-cre/shared'

const MERGE_FIELD_KEYS = [
  'name',
  'status',
  'notes',
  'address',
  'businessName',
  'websiteUrl',
  'submarketId',
  'lastContactDate',
  'followUp',
  'contactName',
  'contactEmail',
  'contactPhone',
  'contactCompany',
  'buildingSf',
  'lotSizeAcres',
  'mapLocation',
  'aiMetadata',
  'marketIdentity',
] as const

export type ProspectMergeFieldKey = typeof MERGE_FIELD_KEYS[number]
export type ProspectMergeFieldChoice = 'canonical' | 'duplicate' | 'combine'

const prospectMergePairFields = {
  canonicalProspectId: z.string().trim().min(1),
  duplicateProspectId: z.string().trim().min(1),
} as const

const validateProspectMergePair = (
  value: { canonicalProspectId: string; duplicateProspectId: string },
  context: z.RefinementCtx,
) => {
  if (value.canonicalProspectId === value.duplicateProspectId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['duplicateProspectId'],
      message: 'The canonical and duplicate prospect must be different records.',
    })
  }
}

const ProspectMergePairSchema = z.object(prospectMergePairFields).superRefine(validateProspectMergePair)

export const ProspectMergePreviewInputSchema = ProspectMergePairSchema

export const ProspectMergeApplyInputSchema = z.object({
  ...prospectMergePairFields,
  previewHash: z.string().regex(/^[a-f0-9]{64}$/i),
  idempotencyKey: z.string().trim().min(8).max(160),
  confirmConflicts: z.literal(true),
  fieldChoices: z.record(
    z.enum(MERGE_FIELD_KEYS),
    z.enum(['canonical', 'duplicate', 'combine']),
  ),
}).superRefine(validateProspectMergePair)

export const ProspectMergeCandidateQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const ProspectMergeUndoInputSchema = z.object({
  confirmUndo: z.literal(true),
})

type Queryable = Pick<Pool | PoolClient, 'query'>

type ProspectSnapshot = {
  id: string
  user_id: string
  name: string
  status: string
  notes: string | null
  geometry_json: string | Record<string, unknown>
  submarket_id: string | null
  last_contact_date: string | null
  follow_up_timeframe: string | null
  follow_up_due_date: Date | string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_company: string | null
  building_sf: number | string | null
  lot_size_acres: number | string | null
  ai_metadata: Record<string, unknown> | null
  business_name: string | null
  website_url: string | null
  address: string | null
  location_lat: number | string | null
  location_lng: number | string | null
  resolved_lat: number | string | null
  resolved_lng: number | string | null
  geohash: string | null
  market_key: string | null
  market_confidence: number | string | null
  market_context_source: string | null
  market_context_status: string | null
  merged_into_prospect_id: string | null
  merged_at: Date | string | null
  merged_by_user_id: string | null
  merge_event_id: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
}

type RelationshipKey =
  | 'contactInteractions'
  | 'listingProspects'
  | 'opportunities'
  | 'activityEvents'
  | 'salesActivityImports'
  | 'emailProspectMatches'
  | 'propertyDossiers'
  | 'brokerageMemoryItems'
  | 'touches'
  | 'activityEventLinks'
  | 'dossierEntityLinks'
  | 'skillActivities'

type RelationshipRow = Record<string, unknown> & { id: string }
type RelationshipSnapshot = Record<RelationshipKey, RelationshipRow[]>

type FieldDefinition = {
  key: ProspectMergeFieldKey
  label: string
  group: 'property' | 'brokerage' | 'contact' | 'map' | 'system'
  value: (row: ProspectSnapshot) => unknown
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'name', label: 'Map record name', group: 'property', value: (row) => row.name },
  { key: 'status', label: 'Prospect status', group: 'brokerage', value: (row) => row.status },
  { key: 'notes', label: 'Broker notes', group: 'brokerage', value: (row) => row.notes || null },
  { key: 'address', label: 'Civic address', group: 'property', value: (row) => row.address || null },
  { key: 'businessName', label: 'Business name', group: 'contact', value: (row) => row.business_name || null },
  { key: 'websiteUrl', label: 'Website', group: 'contact', value: (row) => row.website_url || null },
  { key: 'submarketId', label: 'Brokerage submarket', group: 'brokerage', value: (row) => row.submarket_id || null },
  { key: 'lastContactDate', label: 'Last contact date', group: 'brokerage', value: (row) => row.last_contact_date || null },
  {
    key: 'followUp',
    label: 'Follow-up',
    group: 'brokerage',
    value: (row) => ({ timeframe: row.follow_up_timeframe || null, dueDate: iso(row.follow_up_due_date) }),
  },
  { key: 'contactName', label: 'Contact name', group: 'contact', value: (row) => row.contact_name || null },
  { key: 'contactEmail', label: 'Contact email', group: 'contact', value: (row) => row.contact_email || null },
  { key: 'contactPhone', label: 'Contact phone', group: 'contact', value: (row) => row.contact_phone || null },
  { key: 'contactCompany', label: 'Contact company', group: 'contact', value: (row) => row.contact_company || null },
  { key: 'buildingSf', label: 'Building area', group: 'property', value: (row) => numberOrNull(row.building_sf) },
  { key: 'lotSizeAcres', label: 'Lot size', group: 'property', value: (row) => numberOrNull(row.lot_size_acres) },
  {
    key: 'mapLocation',
    label: 'Map location and geometry',
    group: 'map',
    value: (row) => ({
      latitude: numberOrNull(row.location_lat),
      longitude: numberOrNull(row.location_lng),
      resolvedLatitude: numberOrNull(row.resolved_lat),
      resolvedLongitude: numberOrNull(row.resolved_lng),
      geometry: geometryValue(row.geometry_json),
      geohash: row.geohash || null,
    }),
  },
  { key: 'aiMetadata', label: 'Enrichment metadata', group: 'system', value: (row) => row.ai_metadata || null },
  {
    key: 'marketIdentity',
    label: 'Market identity',
    group: 'system',
    value: (row) => ({
      key: row.market_key || null,
      confidence: numberOrNull(row.market_confidence),
      source: row.market_context_source || null,
      status: row.market_context_status || null,
    }),
  },
]

const RELATIONSHIP_QUERIES: Array<{ key: RelationshipKey; sql: string }> = [
  {
    key: 'contactInteractions',
    sql: `SELECT id, prospect_id FROM public.contact_interactions WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'listingProspects',
    sql: `SELECT id, listing_id, prospect_id, role FROM public.listing_prospects WHERE prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'opportunities',
    sql: `SELECT id, prospect_id FROM public.opportunities WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'activityEvents',
    sql: `SELECT id, prospect_id FROM public.activity_events WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'salesActivityImports',
    sql: `SELECT id, prospect_id FROM public.sales_activity_imports WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'emailProspectMatches',
    sql: `SELECT id, email_message_id, prospect_id FROM public.email_prospect_matches WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'propertyDossiers',
    sql: `SELECT id, prospect_id FROM public.intel_property_dossiers WHERE created_by_user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'brokerageMemoryItems',
    sql: `SELECT id, matched_prospect_id AS prospect_id FROM public.brokerage_memory_items WHERE user_id = $1 AND matched_prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'touches',
    sql: `SELECT id, prospect_id FROM public.touches WHERE user_id = $1 AND prospect_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'activityEventLinks',
    sql: `SELECT id, event_id, entity_id AS prospect_id, role FROM public.activity_event_links WHERE user_id = $1 AND entity_type = 'prospect' AND entity_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'dossierEntityLinks',
    sql: `SELECT id, dossier_id, entity_id AS prospect_id, relationship FROM public.intel_dossier_entity_links WHERE user_id = $1 AND entity_type = 'prospect' AND entity_id IN ($2, $3) ORDER BY id`,
  },
  {
    key: 'skillActivities',
    sql: `SELECT id, related_id AS prospect_id FROM public.skill_activities WHERE user_id = $1 AND related_id IN ($2, $3) ORDER BY id`,
  },
]

const MOVE_QUERIES: Record<RelationshipKey, string> = {
  contactInteractions: `UPDATE public.contact_interactions SET prospect_id = $2 WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  listingProspects: `UPDATE public.listing_prospects SET prospect_id = $2 WHERE id = ANY($3::varchar[]) AND prospect_id = $4`,
  opportunities: `UPDATE public.opportunities SET prospect_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  activityEvents: `UPDATE public.activity_events SET prospect_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  salesActivityImports: `UPDATE public.sales_activity_imports SET prospect_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  emailProspectMatches: `UPDATE public.email_prospect_matches SET prospect_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  propertyDossiers: `UPDATE public.intel_property_dossiers SET prospect_id = $2, updated_at = now() WHERE created_by_user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  brokerageMemoryItems: `UPDATE public.brokerage_memory_items SET matched_prospect_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND matched_prospect_id = $4`,
  touches: `UPDATE public.touches SET prospect_id = $2 WHERE user_id = $1 AND id = ANY($3::varchar[]) AND prospect_id = $4`,
  activityEventLinks: `UPDATE public.activity_event_links SET entity_id = $2 WHERE user_id = $1 AND id = ANY($3::varchar[]) AND entity_type = 'prospect' AND entity_id = $4`,
  dossierEntityLinks: `UPDATE public.intel_dossier_entity_links SET entity_id = $2, updated_at = now() WHERE user_id = $1 AND id = ANY($3::varchar[]) AND entity_type = 'prospect' AND entity_id = $4`,
  skillActivities: `UPDATE public.skill_activities SET related_id = $2 WHERE user_id = $1 AND id = ANY($3::varchar[]) AND related_id = $4`,
}

export class ProspectMergeServiceError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(message: string, status = 400, code = 'prospect_merge_error', details?: Record<string, unknown>) {
    super(message)
    this.name = 'ProspectMergeServiceError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function geometryValue(value: ProspectSnapshot['geometry_json']) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return value
  }
}

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizedJson(nested)]),
    )
  }
  if (value instanceof Date) return value.toISOString()
  return value
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(normalizedJson(value))).digest('hex')
}

function meaningful(value: unknown): boolean {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.some(meaningful)
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(meaningful)
  return true
}

function equalValue(left: unknown, right: unknown) {
  return JSON.stringify(normalizedJson(left)) === JSON.stringify(normalizedJson(right))
}

function publicProspect(row: ProspectSnapshot) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    notes: row.notes || '',
    address: row.address,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    submarketId: row.submarket_id,
    lastContactDate: row.last_contact_date,
    followUpTimeframe: row.follow_up_timeframe,
    followUpDueDate: iso(row.follow_up_due_date),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactCompany: row.contact_company,
    buildingSf: numberOrNull(row.building_sf),
    lotSizeAcres: numberOrNull(row.lot_size_acres),
    aiMetadata: row.ai_metadata,
    locationLat: numberOrNull(row.location_lat),
    locationLng: numberOrNull(row.location_lng),
    resolvedLat: numberOrNull(row.resolved_lat),
    resolvedLng: numberOrNull(row.resolved_lng),
    geometry: geometryValue(row.geometry_json),
    geohash: row.geohash,
    marketKey: row.market_key,
    marketConfidence: numberOrNull(row.market_confidence),
    marketContextSource: row.market_context_source,
    marketContextStatus: row.market_context_status,
    mergedIntoProspectId: row.merged_into_prospect_id,
    mergedAt: iso(row.merged_at),
    mergedByUserId: row.merged_by_user_id,
    mergeEventId: row.merge_event_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

function prospectStateSnapshot(row: ProspectSnapshot) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    notes: row.notes,
    geometry: geometryValue(row.geometry_json),
    submarketId: row.submarket_id,
    lastContactDate: row.last_contact_date,
    followUpTimeframe: row.follow_up_timeframe,
    followUpDueDate: iso(row.follow_up_due_date),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactCompany: row.contact_company,
    buildingSf: numberOrNull(row.building_sf),
    lotSizeAcres: numberOrNull(row.lot_size_acres),
    aiMetadata: row.ai_metadata,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    address: row.address,
    locationLat: numberOrNull(row.location_lat),
    locationLng: numberOrNull(row.location_lng),
    geohash: row.geohash,
    marketKey: row.market_key,
    marketConfidence: numberOrNull(row.market_confidence),
    marketContextSource: row.market_context_source,
    marketContextStatus: row.market_context_status,
    mergedIntoProspectId: row.merged_into_prospect_id,
    mergedAt: iso(row.merged_at),
    mergedByUserId: row.merged_by_user_id,
    mergeEventId: row.merge_event_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

type ProspectStateSnapshot = ReturnType<typeof prospectStateSnapshot>

type ProspectPairStateSnapshot = {
  snapshotVersion: 2
  canonical: ProspectStateSnapshot
  duplicate: ProspectStateSnapshot
}

async function assertProspectMergeSchema(db: Queryable) {
  try {
    await db.query(`
      SELECT p.merged_into_prospect_id, p.merge_event_id, events.preview_hash
      FROM public.prospects p
      LEFT JOIN public.prospect_merge_events events ON false
      LIMIT 0
    `)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === '42P01' || code === '42703') {
      throw new ProspectMergeServiceError(
        'Prospect consolidation storage is not ready. Apply migration 0019 before using this endpoint.',
        503,
        'migration_required',
      )
    }
    throw error
  }
}

async function loadProspectPair(
  db: Queryable,
  userId: string,
  canonicalProspectId: string,
  duplicateProspectId: string,
  lock = false,
) {
  const orderedIds = [canonicalProspectId, duplicateProspectId].sort()
  const result = await db.query<ProspectSnapshot>(`
    SELECT p.*,
           ST_AsGeoJSON(p.geometry) AS geometry_json,
           COALESCE(
             p.location_lat,
             CASE WHEN p.geometry IS NULL OR ST_IsEmpty(p.geometry) THEN NULL ELSE ST_Y(ST_Centroid(p.geometry)) END
           ) AS resolved_lat,
           COALESCE(
             p.location_lng,
             CASE WHEN p.geometry IS NULL OR ST_IsEmpty(p.geometry) THEN NULL ELSE ST_X(ST_Centroid(p.geometry)) END
           ) AS resolved_lng
    FROM public.prospects p
    WHERE p.user_id = $1 AND p.id = ANY($2::varchar[])
    ORDER BY p.id
    ${lock ? 'FOR UPDATE' : ''}
  `, [userId, orderedIds])

  const byId = new Map(result.rows.map((row) => [row.id, row]))
  const canonical = byId.get(canonicalProspectId)
  const duplicate = byId.get(duplicateProspectId)
  if (!canonical || !duplicate) {
    throw new ProspectMergeServiceError(
      'Both prospects must exist and be owned by the signed-in broker.',
      404,
      'prospect_pair_not_found',
    )
  }
  if (canonical.merged_into_prospect_id || duplicate.merged_into_prospect_id) {
    throw new ProspectMergeServiceError(
      'One of these records has already been consolidated. Resolve its canonical prospect before continuing.',
      409,
      'prospect_already_merged',
      {
        canonicalRedirectId: canonical.merged_into_prospect_id,
        duplicateRedirectId: duplicate.merged_into_prospect_id,
      },
    )
  }
  return { canonical, duplicate }
}

async function loadRelationshipSnapshot(
  db: Queryable,
  userId: string,
  canonicalProspectId: string,
  duplicateProspectId: string,
  lock = false,
): Promise<RelationshipSnapshot> {
  const snapshot = {} as RelationshipSnapshot
  for (const definition of RELATIONSHIP_QUERIES) {
    const result = await db.query<RelationshipRow>(
      `${definition.sql}${lock ? ' FOR UPDATE' : ''}`,
      [userId, canonicalProspectId, duplicateProspectId],
    )
    snapshot[definition.key] = result.rows
  }
  return snapshot
}

function rowsForProspect(rows: RelationshipRow[], prospectId: string) {
  return rows.filter((row) => row.prospect_id === prospectId)
}

function intersectingValues(
  rows: RelationshipRow[],
  canonicalProspectId: string,
  duplicateProspectId: string,
  key: string | ((row: RelationshipRow) => string),
) {
  const value = typeof key === 'function' ? key : (row: RelationshipRow) => String(row[key] || '')
  const canonicalValues = new Set(rowsForProspect(rows, canonicalProspectId).map(value).filter(Boolean))
  return Array.from(new Set(
    rowsForProspect(rows, duplicateProspectId)
      .map(value)
      .filter((candidate) => candidate && canonicalValues.has(candidate)),
  ))
}

function relationshipSummary(
  relationships: RelationshipSnapshot,
  canonicalProspectId: string,
  duplicateProspectId: string,
) {
  const counts = Object.fromEntries(
    (Object.keys(relationships) as RelationshipKey[]).map((key) => [key, {
      canonical: rowsForProspect(relationships[key], canonicalProspectId).length,
      duplicate: rowsForProspect(relationships[key], duplicateProspectId).length,
    }]),
  )
  const blockers: Array<{ code: string; message: string; ids: string[] }> = []
  const listingIds = intersectingValues(relationships.listingProspects, canonicalProspectId, duplicateProspectId, 'listing_id')
  if (listingIds.length) blockers.push({
    code: 'listing_link_collision',
    message: 'Both prospects are already linked to the same workspace/listing. Resolve that link before merging.',
    ids: listingIds,
  })
  const emailIds = intersectingValues(relationships.emailProspectMatches, canonicalProspectId, duplicateProspectId, 'email_message_id')
  if (emailIds.length) blockers.push({
    code: 'email_match_collision',
    message: 'Both prospects are linked to the same captured email. Resolve the duplicate email match before merging.',
    ids: emailIds,
  })
  const activityLinkIds = intersectingValues(
    relationships.activityEventLinks,
    canonicalProspectId,
    duplicateProspectId,
    (row) => `${row.event_id || ''}:${row.role || ''}`,
  )
  if (activityLinkIds.length) blockers.push({
    code: 'activity_link_collision',
    message: 'Both prospects have the same activity-event relationship. Resolve the duplicate link before merging.',
    ids: activityLinkIds,
  })
  const dossierLinkIds = intersectingValues(
    relationships.dossierEntityLinks,
    canonicalProspectId,
    duplicateProspectId,
    'dossier_id',
  )
  if (dossierLinkIds.length) blockers.push({
    code: 'dossier_link_collision',
    message: 'Both prospects are already linked to the same property dossier. Resolve the duplicate dossier link before merging.',
    ids: dossierLinkIds,
  })
  const canonicalDossiers = rowsForProspect(relationships.propertyDossiers, canonicalProspectId)
  const duplicateDossiers = rowsForProspect(relationships.propertyDossiers, duplicateProspectId)
  if (canonicalDossiers.length && duplicateDossiers.length) blockers.push({
    code: 'two_property_dossiers',
    message: 'Each prospect already owns a canonical property dossier. Consolidate those dossiers before merging the prospects.',
    ids: [...canonicalDossiers, ...duplicateDossiers].map((row) => row.id),
  })
  return { counts, blockers }
}

function completenessScore(row: ProspectSnapshot) {
  return [
    row.address,
    row.business_name,
    row.contact_name,
    row.contact_email,
    row.contact_phone,
    row.contact_company,
    row.building_sf,
    row.lot_size_acres,
    row.submarket_id,
    row.notes,
    row.location_lat,
    row.location_lng,
  ].filter(meaningful).length
}

function canonicalScore(row: ProspectSnapshot, relationships: RelationshipSnapshot) {
  const relationshipWeight: Partial<Record<RelationshipKey, number>> = {
    propertyDossiers: 14,
    listingProspects: 10,
    contactInteractions: 4,
    activityEvents: 4,
    opportunities: 4,
    salesActivityImports: 2,
    emailProspectMatches: 2,
    touches: 2,
  }
  let score = completenessScore(row)
  for (const key of Object.keys(relationships) as RelationshipKey[]) {
    score += rowsForProspect(relationships[key], row.id).length * (relationshipWeight[key] || 1)
  }
  if (row.status !== 'no_go') score += 4
  if (numberOrNull(row.location_lat) != null && numberOrNull(row.location_lng) != null) score += 2
  return score
}

function buildPreview(
  canonical: ProspectSnapshot,
  duplicate: ProspectSnapshot,
  relationships: RelationshipSnapshot,
) {
  const relationship = relationshipSummary(relationships, canonical.id, duplicate.id)
  const fieldComparisons = FIELD_DEFINITIONS.map((definition) => {
    const canonicalValue = definition.value(canonical)
    const duplicateValue = definition.value(duplicate)
    const conflict = meaningful(canonicalValue) && meaningful(duplicateValue) && !equalValue(canonicalValue, duplicateValue)
    const defaultChoice: ProspectMergeFieldChoice = definition.key === 'notes' && conflict
      ? 'combine'
      : !meaningful(canonicalValue) && meaningful(duplicateValue)
        ? 'duplicate'
        : 'canonical'
    return {
      key: definition.key,
      label: definition.label,
      group: definition.group,
      canonicalValue,
      duplicateValue,
      conflict,
      defaultChoice,
      allowCombine: definition.key === 'notes',
    }
  })
  const canonicalScoreValue = canonicalScore(canonical, relationships)
  const duplicateScoreValue = canonicalScore(duplicate, relationships)
  const recommendedCanonicalId = duplicateScoreValue > canonicalScoreValue ? duplicate.id : canonical.id
  const recommendedReasons = [
    `${rowsForProspect(relationships.listingProspects, recommendedCanonicalId).length} listing link(s)`,
    `${rowsForProspect(relationships.propertyDossiers, recommendedCanonicalId).length} property dossier(s)`,
    `${rowsForProspect(relationships.contactInteractions, recommendedCanonicalId).length + rowsForProspect(relationships.activityEvents, recommendedCanonicalId).length} recorded activity item(s)`,
    `${recommendedCanonicalId === canonical.id ? canonicalScoreValue : duplicateScoreValue} preservation score`,
  ]
  const hashInput = {
    canonical: publicProspect(canonical),
    duplicate: publicProspect(duplicate),
    relationships,
    blockers: relationship.blockers,
  }
  return {
    canonicalProspect: publicProspect(canonical),
    duplicateProspect: publicProspect(duplicate),
    fieldComparisons,
    defaultFieldChoices: Object.fromEntries(fieldComparisons.map((field) => [field.key, field.defaultChoice])),
    relationshipCounts: relationship.counts,
    blockers: relationship.blockers,
    canApply: relationship.blockers.length === 0,
    recommendation: {
      prospectId: recommendedCanonicalId,
      reasons: recommendedReasons,
      canonicalScore: canonicalScoreValue,
      duplicateScore: duplicateScoreValue,
    },
    previewHash: stableHash(hashInput),
  }
}

export async function previewProspectMerge(params: {
  pool: Queryable
  userId: string
  canonicalProspectId: string
  duplicateProspectId: string
}) {
  await assertProspectMergeSchema(params.pool)
  const { canonical, duplicate } = await loadProspectPair(
    params.pool,
    params.userId,
    params.canonicalProspectId,
    params.duplicateProspectId,
  )
  const relationships = await loadRelationshipSnapshot(
    params.pool,
    params.userId,
    params.canonicalProspectId,
    params.duplicateProspectId,
  )
  return buildPreview(canonical, duplicate, relationships)
}

function notesValue(canonical: ProspectSnapshot, duplicate: ProspectSnapshot, choice: ProspectMergeFieldChoice) {
  if (choice !== 'combine') return choice === 'duplicate' ? duplicate.notes || '' : canonical.notes || ''
  const notes = [canonical.notes, duplicate.notes].map((value) => String(value || '').trim()).filter(Boolean)
  return Array.from(new Set(notes)).join('\n\n')
}

function sourceRow(
  canonical: ProspectSnapshot,
  duplicate: ProspectSnapshot,
  choice: ProspectMergeFieldChoice,
) {
  return choice === 'duplicate' ? duplicate : canonical
}

async function applyCanonicalFieldChoices(
  client: PoolClient,
  canonical: ProspectSnapshot,
  duplicate: ProspectSnapshot,
  choices: Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>,
) {
  const values: unknown[] = [canonical.id, canonical.user_id]
  const assignments: string[] = []
  const bind = (value: unknown) => {
    values.push(value)
    return `$${values.length}`
  }
  const scalar = (column: string, key: ProspectMergeFieldKey, sourceColumn: keyof ProspectSnapshot) => {
    const source = sourceRow(canonical, duplicate, choices[key])
    assignments.push(`${column} = ${bind(source[sourceColumn])}`)
  }

  scalar('name', 'name', 'name')
  scalar('status', 'status', 'status')
  assignments.push(`notes = ${bind(notesValue(canonical, duplicate, choices.notes))}`)
  scalar('address', 'address', 'address')
  scalar('business_name', 'businessName', 'business_name')
  scalar('website_url', 'websiteUrl', 'website_url')
  scalar('submarket_id', 'submarketId', 'submarket_id')
  scalar('last_contact_date', 'lastContactDate', 'last_contact_date')
  const followUp = sourceRow(canonical, duplicate, choices.followUp)
  assignments.push(`follow_up_timeframe = ${bind(followUp.follow_up_timeframe)}`)
  assignments.push(`follow_up_due_date = ${bind(followUp.follow_up_due_date)}`)
  scalar('contact_name', 'contactName', 'contact_name')
  scalar('contact_email', 'contactEmail', 'contact_email')
  scalar('contact_phone', 'contactPhone', 'contact_phone')
  scalar('contact_company', 'contactCompany', 'contact_company')
  scalar('building_sf', 'buildingSf', 'building_sf')
  scalar('lot_size_acres', 'lotSizeAcres', 'lot_size_acres')
  const mapLocation = sourceRow(canonical, duplicate, choices.mapLocation)
  assignments.push(`geometry = ST_SetSRID(ST_GeomFromGeoJSON(${bind(JSON.stringify(geometryValue(mapLocation.geometry_json)))}::text), 4326)`)
  assignments.push(`location_lat = ${bind(mapLocation.location_lat)}`)
  assignments.push(`location_lng = ${bind(mapLocation.location_lng)}`)
  assignments.push(`geohash = ${bind(mapLocation.geohash)}`)
  const aiMetadata = sourceRow(canonical, duplicate, choices.aiMetadata)
  assignments.push(`ai_metadata = ${bind(aiMetadata.ai_metadata)}`)
  const marketIdentity = sourceRow(canonical, duplicate, choices.marketIdentity)
  assignments.push(`market_key = ${bind(marketIdentity.market_key)}`)
  assignments.push(`market_confidence = ${bind(marketIdentity.market_confidence)}`)
  assignments.push(`market_context_source = ${bind(marketIdentity.market_context_source)}`)
  assignments.push(`market_context_status = ${bind(marketIdentity.market_context_status)}`)
  assignments.push('updated_at = now()')

  await client.query(`
    UPDATE public.prospects
    SET ${assignments.join(', ')}
    WHERE id = $1 AND user_id = $2 AND merged_into_prospect_id IS NULL
  `, values)
}

function validatedChoices(
  preview: ReturnType<typeof buildPreview>,
  input: Partial<Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>>,
) {
  const choices = { ...preview.defaultFieldChoices, ...input } as Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>
  for (const key of MERGE_FIELD_KEYS) {
    const value = choices[key]
    if (!value || (value === 'combine' && key !== 'notes')) {
      throw new ProspectMergeServiceError(
        `Invalid field choice for ${key}. Refresh the merge preview and try again.`,
        400,
        'invalid_field_choice',
      )
    }
  }
  return choices
}

function idsOriginallyOnDuplicate(rows: RelationshipRow[], duplicateProspectId: string) {
  return rowsForProspect(rows, duplicateProspectId).map((row) => row.id)
}

async function moveRelationships(
  client: PoolClient,
  userId: string,
  canonicalProspectId: string,
  duplicateProspectId: string,
  relationships: RelationshipSnapshot,
) {
  const movedCounts = {} as Record<RelationshipKey, number>
  for (const key of Object.keys(MOVE_QUERIES) as RelationshipKey[]) {
    const ids = idsOriginallyOnDuplicate(relationships[key], duplicateProspectId)
    if (!ids.length) {
      movedCounts[key] = 0
      continue
    }
    const result = await client.query(MOVE_QUERIES[key], [userId, canonicalProspectId, ids, duplicateProspectId])
    if ((result.rowCount || 0) !== ids.length) {
      throw new ProspectMergeServiceError(
        `The ${key} relationships changed while the merge was being applied. Nothing was saved.`,
        409,
        'relationship_changed',
        { relationship: key, expected: ids.length, moved: result.rowCount || 0 },
      )
    }
    movedCounts[key] = ids.length
  }
  return movedCounts
}

export async function applyProspectMerge(params: {
  pool: Pool
  userId: string
  canonicalProspectId: string
  duplicateProspectId: string
  previewHash: string
  idempotencyKey: string
  confirmConflicts: true
  fieldChoices: Partial<Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>>
}) {
  await assertProspectMergeSchema(params.pool)
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    const existing = await client.query<{
      id: string
      canonical_prospect_id: string
      duplicate_prospect_ids: string[]
      preview_hash: string
      field_choices: Partial<Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>>
      status: string
      moved_counts: Record<string, number>
    }>(`
      SELECT id, canonical_prospect_id, duplicate_prospect_ids, preview_hash, field_choices, status, moved_counts
      FROM public.prospect_merge_events
      WHERE user_id = $1 AND idempotency_key = $2
      LIMIT 1
      FOR UPDATE
    `, [params.userId, params.idempotencyKey])
    if (existing.rows[0]) {
      const prior = existing.rows[0]
      if (
        prior.canonical_prospect_id !== params.canonicalProspectId
        || prior.duplicate_prospect_ids[0] !== params.duplicateProspectId
        || prior.preview_hash !== params.previewHash
        || Object.entries(params.fieldChoices).some(([key, value]) => (
          prior.field_choices?.[key as ProspectMergeFieldKey] !== value
        ))
      ) {
        throw new ProspectMergeServiceError(
          'This idempotency key was already used for a different merge request.',
          409,
          'idempotency_conflict',
        )
      }
      await client.query('COMMIT')
      return {
        alreadyApplied: true,
        mergeEventId: prior.id,
        canonicalProspectId: prior.canonical_prospect_id,
        duplicateProspectId: prior.duplicate_prospect_ids[0],
        status: prior.status,
        movedCounts: prior.moved_counts,
      }
    }

    const { canonical, duplicate } = await loadProspectPair(
      client,
      params.userId,
      params.canonicalProspectId,
      params.duplicateProspectId,
      true,
    )
    const relationships = await loadRelationshipSnapshot(
      client,
      params.userId,
      params.canonicalProspectId,
      params.duplicateProspectId,
      true,
    )
    const preview = buildPreview(canonical, duplicate, relationships)
    if (preview.previewHash !== params.previewHash) {
      throw new ProspectMergeServiceError(
        'The prospects or their relationships changed after this preview. Refresh before merging.',
        409,
        'stale_preview',
        { currentPreviewHash: preview.previewHash },
      )
    }
    if (!preview.canApply) {
      throw new ProspectMergeServiceError(
        'This merge has relationship conflicts that require separate review.',
        409,
        'merge_blocked',
        { blockers: preview.blockers },
      )
    }
    const choices = validatedChoices(preview, params.fieldChoices)
    const mergeEventId = randomUUID()
    await client.query(`
      INSERT INTO public.prospect_merge_events (
        id, user_id, canonical_prospect_id, duplicate_prospect_ids,
        preview_hash, idempotency_key, field_choices, before_snapshot,
        relationship_snapshot, status, created_at
      ) VALUES ($1, $2, $3, ARRAY[$4]::varchar[], $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, 'completed', now())
    `, [
      mergeEventId,
      params.userId,
      canonical.id,
      duplicate.id,
      preview.previewHash,
      params.idempotencyKey,
      JSON.stringify(choices),
      JSON.stringify({
        snapshotVersion: 2,
        canonical: prospectStateSnapshot(canonical),
        duplicate: prospectStateSnapshot(duplicate),
      } satisfies ProspectPairStateSnapshot),
      JSON.stringify(relationships),
    ])

    await applyCanonicalFieldChoices(client, canonical, duplicate, choices)
    const movedCounts = await moveRelationships(
      client,
      params.userId,
      canonical.id,
      duplicate.id,
      relationships,
    )
    const tombstoned = await client.query(`
      UPDATE public.prospects
      SET merged_into_prospect_id = $1,
          merged_at = now(),
          merged_by_user_id = $2,
          merge_event_id = $3,
          updated_at = now()
      WHERE id = $4 AND user_id = $2 AND merged_into_prospect_id IS NULL
    `, [canonical.id, params.userId, mergeEventId, duplicate.id])
    if (tombstoned.rowCount !== 1) {
      throw new ProspectMergeServiceError('The duplicate prospect changed before it could be archived.', 409, 'duplicate_changed')
    }

    const remaining = await loadRelationshipSnapshot(client, params.userId, canonical.id, duplicate.id)
    const remainingCounts = Object.fromEntries(
      (Object.keys(remaining) as RelationshipKey[]).map((key) => [key, rowsForProspect(remaining[key], duplicate.id).length]),
    )
    if (Object.values(remainingCounts).some((count) => count > 0)) {
      throw new ProspectMergeServiceError(
        'A relationship remained on the duplicate prospect. The merge was rolled back.',
        409,
        'relationship_move_incomplete',
        { remainingCounts },
      )
    }

    const after = await loadProspectPairIncludingMerged(client, params.userId, canonical.id, duplicate.id)
    await client.query(`
      UPDATE public.prospect_merge_events
      SET after_snapshot = $2::jsonb,
          moved_counts = $3::jsonb,
          completed_at = now()
      WHERE id = $1 AND user_id = $4
    `, [
      mergeEventId,
      JSON.stringify({
        snapshotVersion: 2,
        canonical: prospectStateSnapshot(after.canonical),
        duplicate: prospectStateSnapshot(after.duplicate),
      } satisfies ProspectPairStateSnapshot),
      JSON.stringify(movedCounts),
      params.userId,
    ])
    await client.query('COMMIT')
    return {
      alreadyApplied: false,
      mergeEventId,
      canonicalProspectId: canonical.id,
      duplicateProspectId: duplicate.id,
      status: 'completed',
      movedCounts,
      canonicalProspect: publicProspect(after.canonical),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === '40001' || code === '40P01') {
      throw new ProspectMergeServiceError(
        'Another update landed while the merge was running. Refresh the preview and try again.',
        409,
        'serialization_retry',
      )
    }
    throw error
  } finally {
    client.release()
  }
}

async function loadProspectPairIncludingMerged(
  db: Queryable,
  userId: string,
  canonicalProspectId: string,
  duplicateProspectId: string,
  lock = false,
) {
  const result = await db.query<ProspectSnapshot>(`
    SELECT p.*,
           ST_AsGeoJSON(p.geometry) AS geometry_json,
           COALESCE(p.location_lat, ST_Y(ST_Centroid(p.geometry))) AS resolved_lat,
           COALESCE(p.location_lng, ST_X(ST_Centroid(p.geometry))) AS resolved_lng
    FROM public.prospects p
    WHERE p.user_id = $1 AND p.id = ANY($2::varchar[])
    ORDER BY p.id
    ${lock ? 'FOR UPDATE' : ''}
  `, [userId, [canonicalProspectId, duplicateProspectId]])
  const byId = new Map(result.rows.map((row) => [row.id, row]))
  const canonical = byId.get(canonicalProspectId)
  const duplicate = byId.get(duplicateProspectId)
  if (!canonical || !duplicate) throw new ProspectMergeServiceError('Merged prospect snapshot could not be reloaded.', 500)
  return { canonical, duplicate }
}

const PROSPECT_STATE_KEYS: Array<keyof ProspectStateSnapshot> = [
  'id',
  'userId',
  'name',
  'status',
  'notes',
  'geometry',
  'submarketId',
  'lastContactDate',
  'followUpTimeframe',
  'followUpDueDate',
  'contactName',
  'contactEmail',
  'contactPhone',
  'contactCompany',
  'buildingSf',
  'lotSizeAcres',
  'aiMetadata',
  'businessName',
  'websiteUrl',
  'address',
  'locationLat',
  'locationLng',
  'geohash',
  'marketKey',
  'marketConfidence',
  'marketContextSource',
  'marketContextStatus',
  'mergedIntoProspectId',
  'mergedAt',
  'mergedByUserId',
  'mergeEventId',
  'createdAt',
  'updatedAt',
]

function storedProspectPairSnapshot(
  value: unknown,
  event: { id: string; user_id: string; canonical_prospect_id: string; duplicate_prospect_ids: string[] },
  label: 'before' | 'after',
): ProspectPairStateSnapshot {
  if (!value || typeof value !== 'object') {
    throw new ProspectMergeServiceError(
      `The ${label}-merge prospect snapshot is missing. Undo was not attempted.`,
      409,
      'undo_snapshot_invalid',
    )
  }
  const candidate = value as Partial<ProspectPairStateSnapshot>
  if (candidate.snapshotVersion !== 2 || !candidate.canonical || !candidate.duplicate) {
    throw new ProspectMergeServiceError(
      'This merge predates exact reversible snapshots and cannot be safely undone automatically.',
      409,
      'undo_snapshot_unsupported',
    )
  }
  for (const snapshot of [candidate.canonical, candidate.duplicate]) {
    if (
      !snapshot
      || typeof snapshot !== 'object'
      || PROSPECT_STATE_KEYS.some((key) => !(key in snapshot))
      || typeof snapshot.id !== 'string'
      || typeof snapshot.userId !== 'string'
      || typeof snapshot.name !== 'string'
      || typeof snapshot.status !== 'string'
      || !snapshot.geometry
      || typeof snapshot.geometry !== 'object'
    ) {
      throw new ProspectMergeServiceError(
        `The ${label}-merge prospect snapshot is incomplete. Undo was not attempted.`,
        409,
        'undo_snapshot_invalid',
      )
    }
  }
  const duplicateId = event.duplicate_prospect_ids[0]
  if (
    event.duplicate_prospect_ids.length !== 1
    || candidate.canonical.id !== event.canonical_prospect_id
    || candidate.duplicate.id !== duplicateId
    || candidate.canonical.userId !== event.user_id
    || candidate.duplicate.userId !== event.user_id
  ) {
    throw new ProspectMergeServiceError(
      `The ${label}-merge prospect snapshot does not match this merge event. Undo was not attempted.`,
      409,
      'undo_snapshot_invalid',
    )
  }
  return candidate as ProspectPairStateSnapshot
}

function storedRelationshipSnapshot(
  value: unknown,
  canonicalProspectId: string,
  duplicateProspectId: string,
): RelationshipSnapshot {
  if (!value || typeof value !== 'object') {
    throw new ProspectMergeServiceError('The merge relationship snapshot is missing.', 409, 'undo_snapshot_invalid')
  }
  const candidate = value as Partial<RelationshipSnapshot>
  const result = {} as RelationshipSnapshot
  for (const key of Object.keys(MOVE_QUERIES) as RelationshipKey[]) {
    const rows = candidate[key]
    if (!Array.isArray(rows) || rows.some((row) => (
      !row
      || typeof row !== 'object'
      || typeof row.id !== 'string'
      || (row.prospect_id !== canonicalProspectId && row.prospect_id !== duplicateProspectId)
    ))) {
      throw new ProspectMergeServiceError(
        `The saved ${key} relationship snapshot is incomplete. Undo was not attempted.`,
        409,
        'undo_snapshot_invalid',
        { relationship: key },
      )
    }
    result[key] = rows as RelationshipRow[]
  }
  return result
}

function orderedRelationshipSnapshot(snapshot: RelationshipSnapshot) {
  return Object.fromEntries(
    (Object.keys(MOVE_QUERIES) as RelationshipKey[]).map((key) => [
      key,
      [...snapshot[key]].sort((left, right) => left.id.localeCompare(right.id)),
    ]),
  )
}

function expectedRelationshipsAfterMerge(
  before: RelationshipSnapshot,
  canonicalProspectId: string,
  duplicateProspectId: string,
): RelationshipSnapshot {
  return Object.fromEntries(
    (Object.keys(MOVE_QUERIES) as RelationshipKey[]).map((key) => [
      key,
      before[key].map((row) => row.prospect_id === duplicateProspectId
        ? { ...row, prospect_id: canonicalProspectId }
        : { ...row }),
    ]),
  ) as RelationshipSnapshot
}

function relationshipSnapshotsEqual(left: RelationshipSnapshot, right: RelationshipSnapshot) {
  return stableHash(orderedRelationshipSnapshot(left)) === stableHash(orderedRelationshipSnapshot(right))
}

async function restoreProspectSnapshot(
  client: PoolClient,
  userId: string,
  snapshot: ProspectStateSnapshot,
) {
  const values: unknown[] = [snapshot.id, userId]
  const bind = (value: unknown) => {
    values.push(value)
    return `$${values.length}`
  }
  const geometryJson = snapshot.geometry == null ? null : JSON.stringify(snapshot.geometry)
  const geometryBind = bind(geometryJson)
  const assignments = [
    `name = ${bind(snapshot.name)}`,
    `status = ${bind(snapshot.status)}`,
    `notes = ${bind(snapshot.notes)}`,
    `geometry = CASE WHEN ${geometryBind}::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(${geometryBind}::text), 4326) END`,
    `submarket_id = ${bind(snapshot.submarketId)}`,
    `last_contact_date = ${bind(snapshot.lastContactDate)}`,
    `follow_up_timeframe = ${bind(snapshot.followUpTimeframe)}`,
    `follow_up_due_date = ${bind(snapshot.followUpDueDate)}`,
    `contact_name = ${bind(snapshot.contactName)}`,
    `contact_email = ${bind(snapshot.contactEmail)}`,
    `contact_phone = ${bind(snapshot.contactPhone)}`,
    `contact_company = ${bind(snapshot.contactCompany)}`,
    `building_sf = ${bind(snapshot.buildingSf)}`,
    `lot_size_acres = ${bind(snapshot.lotSizeAcres)}`,
    `ai_metadata = ${bind(snapshot.aiMetadata)}`,
    `business_name = ${bind(snapshot.businessName)}`,
    `website_url = ${bind(snapshot.websiteUrl)}`,
    `address = ${bind(snapshot.address)}`,
    `location_lat = ${bind(snapshot.locationLat)}`,
    `location_lng = ${bind(snapshot.locationLng)}`,
    `geohash = ${bind(snapshot.geohash)}`,
    `market_key = ${bind(snapshot.marketKey)}`,
    `market_confidence = ${bind(snapshot.marketConfidence)}`,
    `market_context_source = ${bind(snapshot.marketContextSource)}`,
    `market_context_status = ${bind(snapshot.marketContextStatus)}`,
    `merged_into_prospect_id = ${bind(snapshot.mergedIntoProspectId)}`,
    `merged_at = ${bind(snapshot.mergedAt)}`,
    `merged_by_user_id = ${bind(snapshot.mergedByUserId)}`,
    `merge_event_id = ${bind(snapshot.mergeEventId)}`,
    `created_at = ${bind(snapshot.createdAt)}`,
    `updated_at = ${bind(snapshot.updatedAt)}`,
  ]
  const result = await client.query(`
    UPDATE public.prospects
    SET ${assignments.join(', ')}
    WHERE id = $1 AND user_id = $2
  `, values)
  if (result.rowCount !== 1) {
    throw new ProspectMergeServiceError(
      'A prospect disappeared while the undo was running. Nothing was changed.',
      409,
      'undo_prospect_changed',
      { prospectId: snapshot.id },
    )
  }
}

async function restoreRelationships(
  client: PoolClient,
  userId: string,
  canonicalProspectId: string,
  duplicateProspectId: string,
  before: RelationshipSnapshot,
) {
  const restoredCounts = {} as Record<RelationshipKey, number>
  for (const key of Object.keys(MOVE_QUERIES) as RelationshipKey[]) {
    const ids = idsOriginallyOnDuplicate(before[key], duplicateProspectId)
    if (!ids.length) {
      restoredCounts[key] = 0
      continue
    }
    const result = await client.query(MOVE_QUERIES[key], [userId, duplicateProspectId, ids, canonicalProspectId])
    if ((result.rowCount || 0) !== ids.length) {
      throw new ProspectMergeServiceError(
        `The ${key} relationships changed after the merge. Nothing was restored.`,
        409,
        'undo_relationship_changed',
        { relationship: key, expected: ids.length, restored: result.rowCount || 0 },
      )
    }
    restoredCounts[key] = ids.length
  }
  return restoredCounts
}

export async function undoProspectMerge(params: {
  pool: Pool
  userId: string
  mergeEventId: string
  confirmUndo: true
}) {
  await assertProspectMergeSchema(params.pool)
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    const eventResult = await client.query<{
      id: string
      user_id: string
      canonical_prospect_id: string
      duplicate_prospect_ids: string[]
      before_snapshot: unknown
      relationship_snapshot: unknown
      after_snapshot: unknown
      status: string
    }>(`
      SELECT id, user_id, canonical_prospect_id, duplicate_prospect_ids,
             before_snapshot, relationship_snapshot, after_snapshot, status
      FROM public.prospect_merge_events
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      FOR UPDATE
    `, [params.mergeEventId, params.userId])
    const event = eventResult.rows[0]
    if (!event) {
      throw new ProspectMergeServiceError(
        'Merge event not found for the signed-in broker.',
        404,
        'merge_event_not_found',
      )
    }
    if (event.status === 'reversed') {
      throw new ProspectMergeServiceError('This merge has already been undone.', 409, 'merge_already_reversed')
    }
    if (event.status !== 'completed') {
      throw new ProspectMergeServiceError('Only a completed merge can be undone.', 409, 'merge_not_completed')
    }

    const before = storedProspectPairSnapshot(event.before_snapshot, event, 'before')
    const after = storedProspectPairSnapshot(event.after_snapshot, event, 'after')
    const duplicateProspectId = event.duplicate_prospect_ids[0]
    if (
      before.canonical.mergedIntoProspectId
      || before.duplicate.mergedIntoProspectId
      || after.canonical.mergedIntoProspectId
      || after.duplicate.mergedIntoProspectId !== event.canonical_prospect_id
      || after.duplicate.mergedByUserId !== params.userId
      || after.duplicate.mergeEventId !== event.id
    ) {
      throw new ProspectMergeServiceError(
        'The saved prospect states do not describe a reversible merge. Undo was not attempted.',
        409,
        'undo_snapshot_invalid',
      )
    }
    const savedRelationships = storedRelationshipSnapshot(
      event.relationship_snapshot,
      event.canonical_prospect_id,
      duplicateProspectId,
    )
    const snapshotBlockers = relationshipSummary(
      savedRelationships,
      event.canonical_prospect_id,
      duplicateProspectId,
    ).blockers
    if (snapshotBlockers.length) {
      throw new ProspectMergeServiceError(
        'The saved pre-merge relationships now conflict with uniqueness rules. Undo was not attempted.',
        409,
        'undo_unique_collision',
        { blockers: snapshotBlockers },
      )
    }

    const currentProspects = await loadProspectPairIncludingMerged(
      client,
      params.userId,
      event.canonical_prospect_id,
      duplicateProspectId,
      true,
    )
    const currentState: ProspectPairStateSnapshot = {
      snapshotVersion: 2,
      canonical: prospectStateSnapshot(currentProspects.canonical),
      duplicate: prospectStateSnapshot(currentProspects.duplicate),
    }
    if (stableHash(currentState) !== stableHash(after)) {
      throw new ProspectMergeServiceError(
        'One of the prospect records changed after the merge. Undo was not attempted.',
        409,
        'undo_prospect_changed',
      )
    }

    const currentRelationships = await loadRelationshipSnapshot(
      client,
      params.userId,
      event.canonical_prospect_id,
      duplicateProspectId,
      true,
    )
    const expectedCurrentRelationships = expectedRelationshipsAfterMerge(
      savedRelationships,
      event.canonical_prospect_id,
      duplicateProspectId,
    )
    if (!relationshipSnapshotsEqual(currentRelationships, expectedCurrentRelationships)) {
      throw new ProspectMergeServiceError(
        'Prospect relationships were added, removed, or reassigned after the merge. Undo was not attempted.',
        409,
        'undo_relationship_changed',
      )
    }

    const restoredCounts = await restoreRelationships(
      client,
      params.userId,
      event.canonical_prospect_id,
      duplicateProspectId,
      savedRelationships,
    )
    await restoreProspectSnapshot(client, params.userId, before.canonical)
    await restoreProspectSnapshot(client, params.userId, before.duplicate)

    const restoredRelationships = await loadRelationshipSnapshot(
      client,
      params.userId,
      event.canonical_prospect_id,
      duplicateProspectId,
    )
    if (!relationshipSnapshotsEqual(restoredRelationships, savedRelationships)) {
      throw new ProspectMergeServiceError(
        'The relationship restore did not reproduce the pre-merge snapshot. The undo was rolled back.',
        409,
        'undo_verification_failed',
      )
    }
    const restoredProspects = await loadProspectPairIncludingMerged(
      client,
      params.userId,
      event.canonical_prospect_id,
      duplicateProspectId,
    )
    const restoredState: ProspectPairStateSnapshot = {
      snapshotVersion: 2,
      canonical: prospectStateSnapshot(restoredProspects.canonical),
      duplicate: prospectStateSnapshot(restoredProspects.duplicate),
    }
    if (stableHash(restoredState) !== stableHash(before)) {
      throw new ProspectMergeServiceError(
        'The prospect restore did not reproduce the pre-merge snapshot. The undo was rolled back.',
        409,
        'undo_verification_failed',
      )
    }

    const reversed = await client.query(`
      UPDATE public.prospect_merge_events
      SET status = 'reversed', reversed_at = now(), reversed_by_user_id = $2
      WHERE id = $1 AND user_id = $2 AND status = 'completed'
    `, [event.id, params.userId])
    if (reversed.rowCount !== 1) {
      throw new ProspectMergeServiceError('The merge event changed while undo was running.', 409, 'merge_event_changed')
    }
    await client.query('COMMIT')
    return {
      mergeEventId: event.id,
      status: 'reversed' as const,
      canonicalProspectId: event.canonical_prospect_id,
      duplicateProspectId,
      restoredCounts,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === '23505') {
      throw new ProspectMergeServiceError(
        'Undo would create a duplicate relationship. Nothing was changed.',
        409,
        'undo_unique_collision',
      )
    }
    if (code === '40001' || code === '40P01') {
      throw new ProspectMergeServiceError(
        'Another update landed while undo was running. Try again after reviewing the records.',
        409,
        'serialization_retry',
      )
    }
    throw error
  } finally {
    client.release()
  }
}

export const __prospectMergeUndoTesting = {
  expectedRelationshipsAfterMerge,
  relationshipSnapshotsEqual,
  storedRelationshipSnapshot,
}

export async function resolveCanonicalProspect(params: { pool: Queryable; userId: string; prospectId: string }) {
  await assertProspectMergeSchema(params.pool)
  const result = await params.pool.query<{
    id: string
    merged_into_prospect_id: string | null
    merge_event_id: string | null
    origin_merge_event_id: string | null
    depth: number
  }>(`
    WITH RECURSIVE prospect_chain AS (
      SELECT id, merged_into_prospect_id, merge_event_id,
             merge_event_id AS origin_merge_event_id,
             0 AS depth, ARRAY[id]::varchar[] AS path
      FROM public.prospects
      WHERE id = $1 AND user_id = $2

      UNION ALL

      SELECT p.id, p.merged_into_prospect_id, p.merge_event_id,
             chain.origin_merge_event_id,
             chain.depth + 1, chain.path || p.id
      FROM prospect_chain chain
      INNER JOIN public.prospects p
        ON p.id = chain.merged_into_prospect_id
       AND p.user_id = $2
      WHERE chain.depth < 10 AND NOT p.id = ANY(chain.path)
    )
    SELECT id, merged_into_prospect_id, merge_event_id, origin_merge_event_id, depth
    FROM prospect_chain
    ORDER BY depth DESC
    LIMIT 1
  `, [params.prospectId, params.userId])
  const row = result.rows[0]
  if (!row) throw new ProspectMergeServiceError('Prospect not found.', 404, 'prospect_not_found')
  return {
    requestedProspectId: params.prospectId,
    canonicalProspectId: row.merged_into_prospect_id || row.id,
    merged: row.depth > 0 || Boolean(row.merged_into_prospect_id),
    mergeEventId: row.origin_merge_event_id,
  }
}

function distanceMeters(left: ProspectSnapshot, right: ProspectSnapshot) {
  const leftLat = numberOrNull(left.resolved_lat)
  const leftLng = numberOrNull(left.resolved_lng)
  const rightLat = numberOrNull(right.resolved_lat)
  const rightLng = numberOrNull(right.resolved_lng)
  if (leftLat == null || leftLng == null || rightLat == null || rightLng == null) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const earthRadius = 6_371_000
  const latDelta = radians(rightLat - leftLat)
  const lngDelta = radians(rightLng - leftLng)
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(leftLat)) * Math.cos(radians(rightLat)) * Math.sin(lngDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function streetNumber(value: string) {
  return value.match(/\b\d{2,6}\b/)?.[0] || null
}

class UnionFind {
  private parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
  }

  find(value: number): number {
    const parent = this.parent[value]
    if (parent !== value) this.parent[value] = this.find(parent)
    return this.parent[value]
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot
  }
}

export async function listProspectDuplicateCandidates(params: { pool: Queryable; userId: string; limit?: number }) {
  await assertProspectMergeSchema(params.pool)
  const result = await params.pool.query<ProspectSnapshot & {
    listing_count: number | string
    interaction_count: number | string
    activity_count: number | string
    opportunity_count: number | string
    dossier_count: number | string
  }>(`
    SELECT p.*,
           ST_AsGeoJSON(p.geometry) AS geometry_json,
           COALESCE(p.location_lat, ST_Y(ST_Centroid(p.geometry))) AS resolved_lat,
           COALESCE(p.location_lng, ST_X(ST_Centroid(p.geometry))) AS resolved_lng,
           (SELECT COUNT(*) FROM public.listing_prospects lp WHERE lp.prospect_id = p.id) AS listing_count,
           (SELECT COUNT(*) FROM public.contact_interactions ci WHERE ci.user_id = $1 AND ci.prospect_id = p.id) AS interaction_count,
           (SELECT COUNT(*) FROM public.activity_events ae WHERE ae.user_id = $1 AND ae.prospect_id = p.id) AS activity_count,
           (SELECT COUNT(*) FROM public.opportunities o WHERE o.user_id = $1 AND o.prospect_id = p.id) AS opportunity_count,
           (SELECT COUNT(*) FROM public.intel_property_dossiers d WHERE d.created_by_user_id = $1 AND d.prospect_id = p.id) AS dossier_count
    FROM public.prospects p
    WHERE p.user_id = $1 AND p.merged_into_prospect_id IS NULL
    ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
    LIMIT 2500
  `, [params.userId])
  const rows = result.rows
  const union = new UnionFind(rows.length)
  const reasons = new Map<string, Set<string>>()
  const addReason = (leftIndex: number, rightIndex: number, reason: string) => {
    union.union(leftIndex, rightIndex)
    const key = [rows[leftIndex].id, rows[rightIndex].id].sort().join(':')
    const values = reasons.get(key) || new Set<string>()
    values.add(reason)
    reasons.set(key, values)
  }
  const byAddress = new Map<string, number[]>()
  const byMarketKey = new Map<string, number[]>()
  const byStreetNumber = new Map<string, number[]>()
  rows.forEach((row, index) => {
    const addressKey = normalizeMarketAddress(row.address || row.name || '')
    if (/\d/.test(addressKey) && addressKey.length >= 8) {
      byAddress.set(addressKey, [...(byAddress.get(addressKey) || []), index])
    }
    if (row.market_key) byMarketKey.set(row.market_key, [...(byMarketKey.get(row.market_key) || []), index])
    const addressStreetNumber = streetNumber(row.address || row.name || '')
    if (addressStreetNumber) {
      byStreetNumber.set(addressStreetNumber, [...(byStreetNumber.get(addressStreetNumber) || []), index])
    }
  })
  for (const indexes of byAddress.values()) {
    for (let offset = 1; offset < indexes.length; offset += 1) addReason(indexes[0], indexes[offset], 'same normalized civic address')
  }
  for (const indexes of byMarketKey.values()) {
    for (let offset = 1; offset < indexes.length; offset += 1) addReason(indexes[0], indexes[offset], 'same durable market key')
  }
  for (const indexes of byStreetNumber.values()) {
    for (let leftOffset = 0; leftOffset < indexes.length; leftOffset += 1) {
      for (let rightOffset = leftOffset + 1; rightOffset < indexes.length; rightOffset += 1) {
        const left = indexes[leftOffset]
        const right = indexes[rightOffset]
        const distance = distanceMeters(rows[left], rows[right])
        if (distance != null && distance <= 60) addReason(left, right, `same street number and ${Math.round(distance)} m apart`)
      }
    }
  }

  const groups = new Map<number, number[]>()
  rows.forEach((_row, index) => {
    const root = union.find(index)
    groups.set(root, [...(groups.get(root) || []), index])
  })
  const candidates = Array.from(groups.values())
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => {
      const groupRows = indexes.map((index) => rows[index])
      const scored = groupRows.map((row) => {
        const relationScore = Number(row.listing_count || 0) * 10
          + Number(row.dossier_count || 0) * 14
          + Number(row.interaction_count || 0) * 4
          + Number(row.activity_count || 0) * 4
          + Number(row.opportunity_count || 0) * 4
        return { row, score: completenessScore(row) + relationScore + (row.status === 'no_go' ? 0 : 4) }
      }).sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
      const groupReasons = new Set<string>()
      for (let left = 0; left < groupRows.length; left += 1) {
        for (let right = left + 1; right < groupRows.length; right += 1) {
          const key = [groupRows[left].id, groupRows[right].id].sort().join(':')
          for (const reason of reasons.get(key) || []) groupReasons.add(reason)
        }
      }
      return {
        id: `duplicate:${groupRows.map((row) => row.id).sort().join('+')}`,
        recommendedCanonicalId: scored[0].row.id,
        reasons: Array.from(groupReasons),
        prospects: scored.map(({ row, score }) => ({
          ...publicProspect(row),
          preservationScore: score,
          relationshipCounts: {
            listings: Number(row.listing_count || 0),
            interactions: Number(row.interaction_count || 0),
            activities: Number(row.activity_count || 0),
            opportunities: Number(row.opportunity_count || 0),
            dossiers: Number(row.dossier_count || 0),
          },
        })),
      }
    })
    .sort((left, right) => right.prospects.length - left.prospects.length || left.id.localeCompare(right.id))
    .slice(0, Math.min(Math.max(params.limit || 20, 1), 50))

  return { groups: candidates }
}
