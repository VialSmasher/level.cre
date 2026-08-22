import { createHash } from 'crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'

export const PursuitHistoryBackfillPlanQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(250),
})

export const PursuitHistoryBackfillApplySchema = z.object({
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  limit: z.coerce.number().int().min(1).max(500).default(250),
  maxLinks: z.coerce.number().int().min(1).max(500).default(250),
  confirmation: z.literal('link_exact_pursuit_history'),
})

type BackfillRow = {
  listing_id: string
  listing_title: string
  prospect_id: string
  prospect_label: string
  source_kinds: string[] | null
  evidence_count: string | number
  last_activity_at: Date | string | null
}

export type PursuitHistoryBackfillItem = {
  listingId: string
  listingTitle: string
  prospectId: string
  prospectLabel: string
  sourceKinds: string[]
  evidenceCount: number
  lastActivityAt: string | null
  disposition: 'safe_to_link'
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
  return value
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(normalizedJson(value))).digest('hex')
}

function toIso(value: Date | string | null) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function exactReferenceCte() {
  return `
    WITH editable_listings AS (
      SELECT l.id, l.title
      FROM public.listings l
      WHERE l.archived_at IS NULL
        AND (
          l.user_id = $1
          OR EXISTS (
            SELECT 1
            FROM public.listing_members lm
            WHERE lm.listing_id = l.id
              AND lm.user_id = $1
              AND lm.role IN ('owner', 'editor')
          )
        )
    ), exact_refs AS (
      SELECT ci.listing_id, ci.prospect_id, 'contact_interaction'::text AS source_kind,
             ci.created_at AS occurred_at
      FROM public.contact_interactions ci
      WHERE ci.listing_id IS NOT NULL AND ci.prospect_id IS NOT NULL

      UNION ALL

      SELECT ae.listing_id, ae.prospect_id, 'activity_event'::text AS source_kind,
             ae.occurred_at AS occurred_at
      FROM public.activity_events ae
      WHERE ae.listing_id IS NOT NULL AND ae.prospect_id IS NOT NULL

      UNION ALL

      SELECT sai.listing_id, sai.prospect_id, 'sales_activity_import'::text AS source_kind,
             COALESCE(sai.activity_at, sai.created_at) AS occurred_at
      FROM public.sales_activity_imports sai
      WHERE sai.listing_id IS NOT NULL AND sai.prospect_id IS NOT NULL

      UNION ALL

      SELECT epm.listing_id, epm.prospect_id, 'email_match'::text AS source_kind,
             COALESCE(em.sent_at, em.received_at, epm.created_at) AS occurred_at
      FROM public.email_prospect_matches epm
      LEFT JOIN public.email_messages em ON em.id = epm.email_message_id
      WHERE epm.listing_id IS NOT NULL AND epm.prospect_id IS NOT NULL
        AND epm.match_status IN ('auto_logged', 'approved')
    ), exact_candidates AS (
      SELECT el.id AS listing_id, el.title AS listing_title,
             p.id AS prospect_id,
             COALESCE(NULLIF(p.business_name, ''), NULLIF(p.contact_company, ''), p.name) AS prospect_label,
             ARRAY_AGG(DISTINCT refs.source_kind ORDER BY refs.source_kind) AS source_kinds,
             COUNT(*)::int AS evidence_count,
             MAX(refs.occurred_at) AS last_activity_at
      FROM exact_refs refs
      JOIN editable_listings el ON el.id = refs.listing_id
      JOIN public.prospects p ON p.id = refs.prospect_id AND p.merged_into_prospect_id IS NULL
      LEFT JOIN public.listing_prospects lp
        ON lp.listing_id = refs.listing_id AND lp.prospect_id = refs.prospect_id
      WHERE lp.id IS NULL
      GROUP BY el.id, el.title, p.id, prospect_label
    )
  `
}

async function queryBackfillRows(client: Pool | PoolClient, userId: string, limit: number) {
  return client.query<BackfillRow>(`
    ${exactReferenceCte()}
    SELECT listing_id, listing_title, prospect_id, prospect_label,
           source_kinds, evidence_count, last_activity_at
    FROM exact_candidates
    ORDER BY last_activity_at DESC NULLS LAST, listing_title, prospect_label
    LIMIT $2
  `, [userId, limit])
}

export async function buildPursuitHistoryBackfillPlan(params: {
  pool: Pool | PoolClient
  userId: string
  limit?: number
}) {
  const limit = params.limit ?? 250
  const result = await queryBackfillRows(params.pool, params.userId, limit)
  const items: PursuitHistoryBackfillItem[] = result.rows.map((row) => ({
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    prospectId: row.prospect_id,
    prospectLabel: row.prospect_label,
    sourceKinds: Array.from(new Set(row.source_kinds || [])).sort(),
    evidenceCount: Number(row.evidence_count) || 0,
    lastActivityAt: toIso(row.last_activity_at),
    disposition: 'safe_to_link',
  }))
  const pursuitIds = new Set(items.map((item) => item.listingId))
  const evidenceCount = items.reduce((total, item) => total + item.evidenceCount, 0)
  const hashInput = items.map(({ listingId, prospectId, sourceKinds, evidenceCount: count }) => ({
    listingId,
    prospectId,
    sourceKinds,
    evidenceCount: count,
  }))

  return {
    planHash: stableHash(hashInput),
    generatedAt: new Date().toISOString(),
    summary: {
      exactLinks: items.length,
      pursuitsAffected: pursuitIds.size,
      evidenceRecords: evidenceCount,
    },
    items,
  }
}

export class PursuitHistoryBackfillError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'pursuit_history_backfill_error',
  ) {
    super(message)
  }
}

export async function applyPursuitHistoryBackfillPlan(params: {
  pool: Pool
  userId: string
  planHash: string
  limit?: number
  maxLinks?: number
}) {
  const limit = params.limit ?? 250
  const maxLinks = params.maxLinks ?? limit
  const currentPlan = await buildPursuitHistoryBackfillPlan({
    pool: params.pool,
    userId: params.userId,
    limit,
  })
  if (currentPlan.planHash !== params.planHash) {
    throw new PursuitHistoryBackfillError(
      'The exact pursuit-history plan changed. Generate a fresh plan before applying it.',
      409,
      'stale_pursuit_history_plan',
    )
  }

  const selected = currentPlan.items.slice(0, maxLinks)
  if (!selected.length) {
    return {
      appliedAt: new Date().toISOString(),
      requestedLinks: 0,
      createdLinks: 0,
      items: [],
    }
  }

  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    const values = selected
      .map((_, index) => `($${index * 2 + 2}::varchar, $${index * 2 + 3}::varchar)`)
      .join(', ')
    const bindings: unknown[] = [params.userId]
    selected.forEach((item) => bindings.push(item.listingId, item.prospectId))
    const inserted = await client.query<{ listing_id: string; prospect_id: string }>(`
      INSERT INTO public.listing_prospects (listing_id, prospect_id, role)
      SELECT requested.listing_id, requested.prospect_id, 'target'
      FROM (VALUES ${values}) AS requested(listing_id, prospect_id)
      JOIN public.listings l ON l.id = requested.listing_id AND l.archived_at IS NULL
      JOIN public.prospects p ON p.id = requested.prospect_id AND p.merged_into_prospect_id IS NULL
      WHERE l.user_id = $1
         OR EXISTS (
           SELECT 1 FROM public.listing_members lm
           WHERE lm.listing_id = l.id AND lm.user_id = $1 AND lm.role IN ('owner', 'editor')
         )
      ON CONFLICT (listing_id, prospect_id) DO NOTHING
      RETURNING listing_id, prospect_id
    `, bindings)
    await client.query('COMMIT')
    return {
      appliedAt: new Date().toISOString(),
      requestedLinks: selected.length,
      createdLinks: inserted.rowCount || 0,
      items: inserted.rows.map((row) => ({
        listingId: row.listing_id,
        prospectId: row.prospect_id,
      })),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
