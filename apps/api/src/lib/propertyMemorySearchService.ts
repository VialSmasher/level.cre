import { createHash } from 'crypto'
import type { Pool } from 'pg'
import { z } from 'zod'

import type { MarketMemoryAnchor } from '@level-cre/shared'

import { getBrokerageMemoryMap } from './brokerageMemoryService'

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined,
  z.string().max(max).optional(),
)

export const PropertyMemorySearchQuerySchema = z.object({
  q: optionalText(240),
  owner: optionalText(180),
  legal: optionalText(240),
  linc: optionalText(80),
  zoning: optionalText(80),
  submarket: optionalText(120),
  prospectStatus: optionalText(120),
  layer: z.preprocess(
    (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined,
    z.enum(['existing', 'market_memory', 'review']).optional(),
  ),
  activityState: z.preprocess(
    (value) => typeof value === 'string' && value.trim() ? value.trim() : 'any',
    z.enum(['any', 'has_activity', 'never']).default('any'),
  ),
  activityRecency: z.preprocess(
    (value) => typeof value === 'string' && value.trim() ? value.trim() : 'any',
    z.enum(['any', '30d', '90d', '180d', '365d', 'never']).default('any'),
  ),
  activitySince: optionalText(40),
  activityBefore: optionalText(40),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: optionalText(500),
})

export type PropertyMemorySearchQuery = z.infer<typeof PropertyMemorySearchQuerySchema>

type EntityContext = {
  prospect?: {
    id: string
    name: string | null
    businessName: string | null
    contactCompany: string | null
    status: string | null
    submarket: string | null
    lastActivityAt: string | null
    activityCount: number
  }
  listing?: {
    id: string
    title: string | null
    submarket: string | null
    lastActivityAt: string | null
    activityCount: number
  }
  dossier?: {
    id: string
    submarket: string | null
    opportunityIds: string[]
  }
  opportunity?: {
    lastActivityAt: string | null
    activityCount: number
  }
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeIdentity(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, '')
}

function includesQuery(values: string[], query: string | undefined) {
  if (!query) return true
  const normalizedQuery = normalize(query)
  return values.some((value) => normalize(value).includes(normalizedQuery))
}

type SearchField = [field: string, values: string[]]

type PropertyMemorySearchCandidate = {
  address: string
  layer: 'existing' | 'market_memory' | 'review'
  owners: string[]
  legalDescriptions: string[]
  lincs: string[]
  zoning: string[]
  submarket: string | null
  prospectStatus: string | null
  lastActivityAt: string | null
  fields: SearchField[]
}

type PropertyMemorySearchRowInternal = PropertyMemorySearchCandidate & {
  canonicalKey: string
  dossierId: string | null
  importItemId: string | null
  linkedProspectId: string | null
  linkedListingId: string | null
  latitude: number
  longitude: number
  activityCount: number
  anchor: MarketMemoryAnchor
}

type RankedPropertyMemorySearchRow = PropertyMemorySearchRowInternal & {
  matchedFields: string[]
  relevance: number
}

function normalizedSearchForms(value: string) {
  const spaced = normalize(value)
  const compact = normalizeIdentity(value)
  return compact && compact !== spaced ? [spaced, compact] : [spaced]
}

function valueMatchesToken(value: string, token: string) {
  const spaced = normalize(value)
  const words = spaced.split(' ').filter(Boolean)
  const compact = normalizeIdentity(value)
  if (token.length <= 2) return words.includes(token) || compact === token
  return words.some((word) => word.includes(token)) || compact.includes(token)
}

function valueContainsPhrase(value: string, query: string) {
  const tokens = unique(normalize(query).split(' '))
  if (tokens.length === 1 && tokens[0].length <= 2) return valueMatchesToken(value, tokens[0])
  return normalizedSearchForms(value).some((valueForm) => (
    normalizedSearchForms(query).some((queryForm) => queryForm && valueForm.includes(queryForm))
  ))
}

function matchFreeText(fields: SearchField[], query: string | undefined) {
  if (!query) return { matches: true, matchedFields: [] as string[], phraseMatches: 0 }
  const normalizedQuery = normalize(query)
  const queryTokens = unique(normalizedQuery.split(' '))
  const normalizedFields = fields.map(([field, values]) => ({
    field,
    values,
  }))

  // A broker often remembers fragments from different parts of a property's story.
  // Require every term, but allow those terms to be distributed across owner, legal,
  // company, address, project, zoning, and submarket fields.
  const matches = queryTokens.length > 0 && queryTokens.every((token) => (
    normalizedFields.some((entry) => entry.values.some((value) => valueMatchesToken(value, token)))
  ))
  const matchedFields = matches
    ? normalizedFields
      .filter((entry) => queryTokens.some((token) => entry.values.some((value) => valueMatchesToken(value, token))))
      .map((entry) => entry.field)
    : []
  const phraseMatches = matches
    ? normalizedFields.reduce((count, entry) => count + (
      entry.values.some((value) => valueContainsPhrase(value, query)) ? 1 : 0
    ), 0)
    : 0

  return { matches, matchedFields, phraseMatches }
}

function maxIso(values: Array<string | null | undefined>) {
  let latest: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time
      latest = new Date(time).toISOString()
    }
  }
  return latest
}

function mergeSearchFields(left: SearchField[], right: SearchField[]) {
  const valuesByField = new Map<string, string[]>()
  for (const [field, values] of [...left, ...right]) {
    valuesByField.set(field, unique([...(valuesByField.get(field) || []), ...values]))
  }
  return Array.from(valuesByField.entries())
}

function rowPriority(row: PropertyMemorySearchRowInternal) {
  const layerScore = row.layer === 'review' ? 300 : row.layer === 'existing' ? 200 : 100
  const pendingScore = row.anchor.persistence?.state === 'pending'
    || row.anchor.persistence?.state === 'local_preview'
    ? 25
    : 0
  const savedAt = row.anchor.persistence?.savedAt
    ? new Date(row.anchor.persistence.savedAt).getTime()
    : 0
  return layerScore + pendingScore + (Number.isFinite(savedAt) ? savedAt / 1e15 : 0)
}

/**
 * The map response can contain both an approved record and a pending review
 * record for one canonical property. Search returns one story, while retaining
 * all searchable title evidence and giving the review record visual priority.
 */
function groupCanonicalRows(rows: PropertyMemorySearchRowInternal[]) {
  const grouped = new Map<string, PropertyMemorySearchRowInternal>()
  for (const row of rows) {
    const current = grouped.get(row.canonicalKey)
    if (!current) {
      grouped.set(row.canonicalKey, row)
      continue
    }

    const preferred = rowPriority(row) > rowPriority(current) ? row : current
    const fallback = preferred === row ? current : row
    grouped.set(row.canonicalKey, {
      ...preferred,
      dossierId: preferred.dossierId || fallback.dossierId,
      importItemId: preferred.importItemId || fallback.importItemId,
      linkedProspectId: preferred.linkedProspectId || fallback.linkedProspectId,
      linkedListingId: preferred.linkedListingId || fallback.linkedListingId,
      owners: unique([...current.owners, ...row.owners]),
      legalDescriptions: unique([...current.legalDescriptions, ...row.legalDescriptions]),
      lincs: unique([...current.lincs, ...row.lincs]),
      zoning: unique([...current.zoning, ...row.zoning]),
      submarket: preferred.submarket || fallback.submarket,
      prospectStatus: preferred.prospectStatus || fallback.prospectStatus,
      lastActivityAt: maxIso([current.lastActivityAt, row.lastActivityAt]),
      // The same linked entity context is repeated on its anchors, so summing
      // here would double-count activity when evidence records are combined.
      activityCount: Math.max(current.activityCount, row.activityCount),
      fields: mergeSearchFields(current.fields, row.fields),
    })
  }
  return Array.from(grouped.values())
}

function parseDate(value: string | undefined, label: string) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new PropertyMemorySearchError(`${label} must be a valid date.`, 400)
  }
  return date
}

function cursorSignature(query: PropertyMemorySearchQuery) {
  return createHash('sha256').update(JSON.stringify({
    q: normalize(query.q),
    owner: normalize(query.owner),
    legal: normalize(query.legal),
    linc: normalizeIdentity(query.linc),
    zoning: normalize(query.zoning),
    submarket: normalize(query.submarket),
    prospectStatus: unique((query.prospectStatus || '').split(',')).map(normalize).sort(),
    layer: query.layer || '',
    activityState: query.activityState,
    activityRecency: query.activityRecency,
    activitySince: query.activitySince || '',
    activityBefore: query.activityBefore || '',
  })).digest('hex').slice(0, 16)
}

function decodeCursor(value: string | undefined, signature: string) {
  if (!value) return 0
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { offset?: unknown; signature?: unknown }
    if (parsed.signature !== signature || !Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error('invalid')
    return Number(parsed.offset)
  } catch {
    throw new PropertyMemorySearchError('Search cursor is invalid or belongs to different filters.', 400)
  }
}

function encodeCursor(offset: number, signature: string) {
  return Buffer.from(JSON.stringify({ offset, signature }), 'utf8').toString('base64url')
}

export class PropertyMemorySearchError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PropertyMemorySearchError'
    this.status = status
  }
}

// Contact interactions keep the business event time as ISO text so imported
// historical calls/emails sort by when they happened, not when they entered
// Level CRE. Validate the calendar components before casting; malformed legacy
// values safely fall back to the durable row creation timestamp.
const CONTACT_INTERACTION_ACTIVITY_AT_SQL = `
  CASE
    WHEN ci.date ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])([T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])?)?$'
      THEN CASE
        WHEN substring(ci.date, 9, 2)::integer <= CASE substring(ci.date, 6, 2)::integer
          WHEN 2 THEN CASE
            WHEN substring(ci.date, 1, 4)::integer % 400 = 0
              OR (substring(ci.date, 1, 4)::integer % 4 = 0 AND substring(ci.date, 1, 4)::integer % 100 <> 0)
              THEN 29
            ELSE 28
          END
          WHEN 4 THEN 30
          WHEN 6 THEN 30
          WHEN 9 THEN 30
          WHEN 11 THEN 30
          ELSE 31
        END
          THEN ci.date::timestamptz
        ELSE ci.created_at AT TIME ZONE 'UTC'
      END
    ELSE ci.created_at AT TIME ZONE 'UTC'
  END
`

async function loadEntityContext(pool: Pool, userId: string, anchors: MarketMemoryAnchor[]) {
  const prospectIds = unique(anchors.map((anchor) => anchor.persistence?.linkedProspectId))
  const listingIds = unique(anchors.map((anchor) => anchor.persistence?.linkedListingId))
  const dossierIds = unique(anchors.map((anchor) => anchor.persistence?.dossierId))

  const prospectPromise = prospectIds.length ? pool.query<{
    id: string
    name: string | null
    business_name: string | null
    contact_company: string | null
    status: string | null
    submarket_name: string | null
    last_activity_at: Date | string | null
    activity_count: number | string
  }>(`
    SELECT p.id, p.name, p.business_name, p.contact_company, p.status,
           COALESCE(sm.name, p.submarket_id) AS submarket_name,
           GREATEST(
             (SELECT MAX(${CONTACT_INTERACTION_ACTIVITY_AT_SQL})
              FROM public.contact_interactions ci
              WHERE ci.user_id = $1 AND ci.prospect_id = p.id),
             (SELECT MAX(ae.occurred_at) FROM public.activity_events ae
               WHERE ae.user_id = $1 AND ae.prospect_id = p.id
                 AND ae.match_status = 'matched' AND ae.evidence_status IN ('observed', 'confirmed')),
             (SELECT MAX(t.created_at) FROM public.touches t WHERE t.user_id = $1 AND t.prospect_id = p.id)
           ) AS last_activity_at,
           (
             (SELECT COUNT(*) FROM public.contact_interactions ci WHERE ci.user_id = $1 AND ci.prospect_id = p.id)
             + (SELECT COUNT(*) FROM public.activity_events ae
                  WHERE ae.user_id = $1 AND ae.prospect_id = p.id
                    AND ae.match_status = 'matched' AND ae.evidence_status IN ('observed', 'confirmed'))
             + (SELECT COUNT(*) FROM public.touches t WHERE t.user_id = $1 AND t.prospect_id = p.id)
           ) AS activity_count
    FROM public.prospects p
    LEFT JOIN public.submarkets sm
      ON sm.id = p.submarket_id AND sm.user_id = p.user_id
    WHERE p.user_id = $1 AND p.id = ANY($2::varchar[]) AND p.merged_into_prospect_id IS NULL
  `, [userId, prospectIds]) : Promise.resolve({ rows: [] as any[] })

  const listingPromise = listingIds.length ? pool.query<{
    id: string
    title: string | null
    submarket: string | null
    last_activity_at: Date | string | null
    activity_count: number | string
  }>(`
    SELECT l.id, l.title, l.submarket,
           GREATEST(
             (SELECT MAX(${CONTACT_INTERACTION_ACTIVITY_AT_SQL})
              FROM public.contact_interactions ci
              WHERE ci.user_id = $1 AND ci.listing_id = l.id),
             (SELECT MAX(ae.occurred_at) FROM public.activity_events ae
               WHERE ae.user_id = $1 AND ae.listing_id = l.id
                 AND ae.match_status = 'matched' AND ae.evidence_status IN ('observed', 'confirmed'))
           ) AS last_activity_at,
           (
             (SELECT COUNT(*) FROM public.contact_interactions ci WHERE ci.user_id = $1 AND ci.listing_id = l.id)
             + (SELECT COUNT(*) FROM public.activity_events ae
                  WHERE ae.user_id = $1 AND ae.listing_id = l.id
                    AND ae.match_status = 'matched' AND ae.evidence_status IN ('observed', 'confirmed'))
           ) AS activity_count
    FROM public.listings l
    WHERE l.id = ANY($2::varchar[])
      AND (l.user_id = $1 OR EXISTS (
        SELECT 1 FROM public.listing_members members WHERE members.listing_id = l.id AND members.user_id = $1
      ))
  `, [userId, listingIds]) : Promise.resolve({ rows: [] as any[] })

  const dossierPromise = dossierIds.length ? pool.query<{
    id: string
    submarket: string | null
    opportunity_ids: string[] | null
  }>(`
    SELECT d.id, d.submarket,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT links.entity_id)
             FILTER (WHERE links.entity_type = 'opportunity'), NULL) AS opportunity_ids
    FROM public.intel_property_dossiers d
    LEFT JOIN public.intel_dossier_entity_links links
      ON links.dossier_id = d.id AND links.user_id = d.created_by_user_id
    WHERE d.created_by_user_id = $1 AND d.id = ANY($2::varchar[])
    GROUP BY d.id
  `, [userId, dossierIds]) : Promise.resolve({ rows: [] as any[] })

  const [prospectRows, listingRows, dossierRows] = await Promise.all([
    prospectPromise,
    listingPromise,
    dossierPromise,
  ])
  const opportunityIds = unique(dossierRows.rows.flatMap((row) => row.opportunity_ids || []))
  const opportunityRows = opportunityIds.length ? await pool.query<{
    opportunity_id: string
    last_activity_at: Date | string | null
    activity_count: number | string
  }>(`
    SELECT o.id AS opportunity_id,
           MAX(ae.occurred_at) AS last_activity_at,
           COUNT(ae.id) AS activity_count
    FROM public.opportunities o
    LEFT JOIN public.activity_events ae
      ON ae.opportunity_id = o.id
     AND ae.user_id = o.user_id
     AND ae.match_status = 'matched'
     AND ae.evidence_status IN ('observed', 'confirmed')
    WHERE o.user_id = $1 AND o.id = ANY($2::varchar[])
    GROUP BY o.id
  `, [userId, opportunityIds]) : { rows: [] as any[] }

  const prospectById = new Map<string, NonNullable<EntityContext['prospect']>>(prospectRows.rows.map((row) => [row.id, {
    id: row.id,
    name: row.name,
    businessName: row.business_name,
    contactCompany: row.contact_company,
    status: row.status,
    submarket: row.submarket_name,
    lastActivityAt: iso(row.last_activity_at),
    activityCount: Number(row.activity_count || 0),
  }]))
  const listingById = new Map<string, NonNullable<EntityContext['listing']>>(listingRows.rows.map((row) => [row.id, {
    id: row.id,
    title: row.title,
    submarket: row.submarket,
    lastActivityAt: iso(row.last_activity_at),
    activityCount: Number(row.activity_count || 0),
  }]))
  const dossierById = new Map<string, NonNullable<EntityContext['dossier']>>(dossierRows.rows.map((row) => [row.id, {
    id: row.id,
    submarket: row.submarket,
    opportunityIds: row.opportunity_ids || [],
  }]))
  const opportunityById = new Map<string, NonNullable<EntityContext['opportunity']>>(opportunityRows.rows.map((row) => [row.opportunity_id, {
    lastActivityAt: iso(row.last_activity_at),
    activityCount: Number(row.activity_count || 0),
  }]))

  return anchors.map((anchor): EntityContext => {
    const dossier = anchor.persistence?.dossierId ? dossierById.get(anchor.persistence.dossierId) : undefined
    const opportunities = (dossier?.opportunityIds || [])
      .map((id: string) => opportunityById.get(id))
      .filter((value): value is NonNullable<EntityContext['opportunity']> => Boolean(value))
    return {
      prospect: anchor.persistence?.linkedProspectId ? prospectById.get(anchor.persistence.linkedProspectId) : undefined,
      listing: anchor.persistence?.linkedListingId ? listingById.get(anchor.persistence.linkedListingId) : undefined,
      dossier,
      opportunity: opportunities.length ? {
        lastActivityAt: maxIso(opportunities.map((value) => value?.lastActivityAt)),
        activityCount: opportunities.reduce((total, value) => total + Number(value?.activityCount || 0), 0),
      } : undefined,
    }
  })
}

function activityBounds(query: PropertyMemorySearchQuery, now = Date.now()) {
  let since = parseDate(query.activitySince, 'activitySince')
  const before = parseDate(query.activityBefore, 'activityBefore')
  const days = query.activityRecency === '30d' ? 30
    : query.activityRecency === '90d' ? 90
      : query.activityRecency === '180d' ? 180
        : query.activityRecency === '365d' ? 365
          : null
  if (days != null) {
    since = new Date(now - days * 24 * 60 * 60 * 1000)
  }
  return { since, before }
}

function evaluateCandidate(
  candidate: PropertyMemorySearchCandidate,
  query: PropertyMemorySearchQuery,
  bounds = activityBounds(query),
) {
  if (query.layer && candidate.layer !== query.layer) return null
  if (!includesQuery(candidate.owners, query.owner)) return null
  if (!includesQuery(candidate.legalDescriptions, query.legal)) return null
  if (query.linc) {
    const lincQuery = normalizeIdentity(query.linc)
    if (!candidate.lincs.some((value) => normalizeIdentity(value).includes(lincQuery))) return null
  }
  if (!includesQuery(candidate.zoning, query.zoning)) return null
  if (query.submarket && !includesQuery(candidate.submarket ? [candidate.submarket] : [], query.submarket)) return null
  const statusFilters = unique((query.prospectStatus || '').split(','))
  if (statusFilters.length && !statusFilters.includes(candidate.prospectStatus || '')) return null

  const activityTime = candidate.lastActivityAt ? new Date(candidate.lastActivityAt).getTime() : null
  const never = query.activityState === 'never' || query.activityRecency === 'never'
  if (never && activityTime != null) return null
  if (query.activityState === 'has_activity' && activityTime == null) return null
  if (bounds.since && (activityTime == null || activityTime < bounds.since.getTime())) return null
  if (bounds.before && (activityTime == null || activityTime >= bounds.before.getTime())) return null

  const freeText = matchFreeText(candidate.fields, query.q)
  if (!freeText.matches) return null
  const normalizedQuery = normalize(query.q)
  const relevance = freeText.matchedFields.length
    + freeText.phraseMatches * 2
    + (normalizedQuery && normalize(candidate.address) === normalizedQuery ? 4 : 0)
    + (normalizedQuery && candidate.owners.some((owner) => normalize(owner) === normalizedQuery) ? 3 : 0)
    + (normalizedQuery && candidate.lincs.some((linc) => normalizeIdentity(linc) === normalizeIdentity(normalizedQuery)) ? 4 : 0)

  return { matchedFields: freeText.matchedFields, relevance }
}

export async function searchPropertyMemory(params: {
  pool: Pool
  userId: string
  query: PropertyMemorySearchQuery
}) {
  const memory = await getBrokerageMemoryMap({ pool: params.pool, userId: params.userId })
  const contexts = await loadEntityContext(params.pool, params.userId, memory.anchors)
  const { since, before } = activityBounds(params.query)

  const rawRows = memory.anchors.map((anchor, index): PropertyMemorySearchRowInternal => {
    const context = contexts[index] || {}
    const owners = unique(anchor.legalIdentities.map((identity) => identity.registeredOwner))
    const lincs = unique(anchor.legalIdentities.map((identity) => identity.linc))
    const legalDescriptions = unique(anchor.legalIdentities.flatMap((identity) => [
      identity.legalDescription,
      identity.titleNumber ? `Title ${identity.titleNumber}` : null,
      identity.plan ? `Plan ${identity.plan}` : null,
      identity.block ? `Block ${identity.block}` : null,
      identity.lot ? `Lot ${identity.lot}` : null,
    ]))
    const submarket = context.dossier?.submarket || context.prospect?.submarket || context.listing?.submarket || null
    const lastActivityAt = maxIso([
      context.prospect?.lastActivityAt,
      context.listing?.lastActivityAt,
      context.opportunity?.lastActivityAt,
    ])
    const activityCount = Number(context.prospect?.activityCount || 0)
      + Number(context.listing?.activityCount || 0)
      + Number(context.opportunity?.activityCount || 0)
    const layer = anchor.previewLayer || anchor.baseLayer

    const fields: SearchField[] = [
      ['address', unique([anchor.address, ...anchor.alternateAddresses])],
      ['owner', owners],
      ['legal', legalDescriptions],
      ['linc', lincs],
      ['zoning', anchor.zoning],
      ['submarket', submarket ? [submarket] : []],
      ['project', anchor.projects],
      ['company', unique([context.prospect?.businessName, context.prospect?.contactCompany, context.prospect?.name])],
    ]
    return {
      canonicalKey: anchor.persistence?.linkedProspectId
        ? `prospect:${anchor.persistence.linkedProspectId}`
        : anchor.persistence?.linkedListingId
          ? `listing:${anchor.persistence.linkedListingId}`
          : anchor.persistence?.dossierId
            ? `dossier:${anchor.persistence.dossierId}`
            : anchor.persistence?.importItemId
              ? `review:${anchor.persistence.importItemId}`
              : `anchor:${anchor.id}`,
      layer,
      dossierId: anchor.persistence?.dossierId || null,
      importItemId: anchor.persistence?.importItemId || null,
      linkedProspectId: anchor.persistence?.linkedProspectId || null,
      linkedListingId: anchor.persistence?.linkedListingId || null,
      address: anchor.address,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      owners,
      legalDescriptions,
      lincs,
      zoning: anchor.zoning,
      submarket,
      prospectStatus: context.prospect?.status || null,
      lastActivityAt,
      activityCount,
      fields,
      anchor,
    }
  })

  const rows = groupCanonicalRows(rawRows).flatMap((row): RankedPropertyMemorySearchRow[] => {
    const evaluation = evaluateCandidate(row, params.query, { since, before })
    return evaluation ? [{ ...row, ...evaluation }] : []
  })

  rows.sort((left, right) => {
    if (right.relevance !== left.relevance) return right.relevance - left.relevance
    const rightActivity = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0
    const leftActivity = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0
    if (rightActivity !== leftActivity) return rightActivity - leftActivity
    return left.address.localeCompare(right.address) || left.canonicalKey.localeCompare(right.canonicalKey)
  })

  const signature = cursorSignature(params.query)
  const offset = decodeCursor(params.query.cursor, signature)
  const page = rows.slice(offset, offset + params.query.limit)
  const nextOffset = offset + page.length
  return {
    rows: page.map(({ relevance: _relevance, fields: _fields, ...row }) => row),
    total: rows.length,
    nextCursor: nextOffset < rows.length ? encodeCursor(nextOffset, signature) : null,
    source: {
      importId: memory.importId,
      generatedAt: memory.generatedAt,
      anchorCount: memory.anchors.length,
    },
  }
}

export const __testing = {
  activityBounds,
  cursorSignature,
  decodeCursor,
  encodeCursor,
  evaluateCandidate,
  groupCanonicalRows,
  matchFreeText,
  normalize,
  normalizeIdentity,
}
