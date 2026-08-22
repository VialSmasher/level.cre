import { createHash } from 'crypto'
import type { Pool } from 'pg'
import { z } from 'zod'

import { decideBrokerageMemoryItem } from './brokerageMemoryService'

export const BrokerageMemoryMaintenancePlanQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(250),
})

export const BrokerageMemoryMaintenanceApplySchema = z.object({
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  runKey: z.string().trim().min(8).max(120),
  limit: z.coerce.number().int().min(1).max(250).default(250),
  maxItems: z.coerce.number().int().min(1).max(50).default(25),
  confirmation: z.literal('approve_map_ready_memory'),
})

type MaintenanceRow = {
  id: string
  import_id: string
  suggested_layer: 'existing' | 'market_memory' | 'review'
  address: string
  lat: number | string | null
  lng: number | string | null
  matched_dossier_id: string | null
  matched_prospect_id: string | null
  matched_listing_id: string | null
  match_confidence: number | string | null
  review_reasons: string[] | null
  updated_at: Date | string
  source_file_name: string | null
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function finiteCoordinate(value: unknown) {
  return value != null && value !== '' && Number.isFinite(Number(value))
}

function maintenanceItem(row: MaintenanceRow) {
  const blockers: string[] = []
  if (!row.address?.trim()) blockers.push('missing civic address')
  if (!finiteCoordinate(row.lat) || !finiteCoordinate(row.lng)) blockers.push('missing usable map coordinates')
  const ready = blockers.length === 0
  return {
    itemId: row.id,
    importId: row.import_id,
    address: row.address,
    suggestedLayer: row.suggested_layer,
    matchedDossierId: row.matched_dossier_id,
    matchedProspectId: row.matched_prospect_id,
    matchedListingId: row.matched_listing_id,
    matchConfidence: Number(row.match_confidence || 0),
    reviewReasons: row.review_reasons || [],
    mapLocation: {
      latitude: finiteCoordinate(row.lat) ? Number(row.lat) : null,
      longitude: finiteCoordinate(row.lng) ? Number(row.lng) : null,
    },
    sourceFileName: row.source_file_name,
    disposition: ready ? 'approve_in_background' as const : 'hold_as_exception' as const,
    blockers,
  }
}

export async function buildBrokerageMemoryMaintenancePlan(params: {
  pool: Pool
  userId: string
  limit?: number
}) {
  const limit = Math.min(Math.max(params.limit || 250, 1), 250)
  const result = await params.pool.query<MaintenanceRow>(`
    SELECT items.id, items.import_id, items.suggested_layer, items.address,
           items.lat, items.lng, items.matched_dossier_id, items.matched_prospect_id,
           items.matched_listing_id, items.match_confidence, items.review_reasons,
           items.updated_at, imports.source_file_name
    FROM public.brokerage_memory_items items
    INNER JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id
    WHERE items.user_id = $1
      AND items.status = 'pending'
      AND imports.status <> 'superseded'
    ORDER BY items.updated_at ASC, items.id ASC
    LIMIT $2
  `, [params.userId, limit])
  const items = result.rows.map(maintenanceItem)
  const hashInput = items.map((item) => ({
    itemId: item.itemId,
    importId: item.importId,
    disposition: item.disposition,
    matchedDossierId: item.matchedDossierId,
    matchedProspectId: item.matchedProspectId,
    matchedListingId: item.matchedListingId,
    address: item.address,
    suggestedLayer: item.suggestedLayer,
    matchConfidence: item.matchConfidence,
    reviewReasons: item.reviewReasons,
    mapLocation: item.mapLocation,
    blockers: item.blockers,
  }))
  return {
    generatedAt: new Date().toISOString(),
    planHash: stableHash(hashInput),
    summary: {
      pendingItems: items.length,
      backgroundApprovals: items.filter((item) => item.disposition === 'approve_in_background').length,
      heldExceptions: items.filter((item) => item.disposition === 'hold_as_exception').length,
      linkedProspects: items.filter((item) => Boolean(item.matchedProspectId)).length,
      standaloneMapMemory: items.filter((item) => !item.matchedProspectId && item.disposition === 'approve_in_background').length,
    },
    items,
  }
}

export class BrokerageMemoryMaintenanceError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'brokerage_memory_maintenance_error') {
    super(message)
    this.name = 'BrokerageMemoryMaintenanceError'
    this.status = status
    this.code = code
  }
}

export async function applyBrokerageMemoryMaintenancePlan(params: {
  pool: Pool
  userId: string
  planHash: string
  runKey: string
  limit?: number
  maxItems?: number
}) {
  const plan = await buildBrokerageMemoryMaintenancePlan({
    pool: params.pool,
    userId: params.userId,
    limit: params.limit || 250,
  })
  if (plan.planHash !== params.planHash) {
    throw new BrokerageMemoryMaintenanceError(
      'The background-maintenance plan changed. Generate a new dry run before applying it.',
      409,
      'stale_maintenance_plan',
    )
  }
  const items = plan.items
    .filter((item) => item.disposition === 'approve_in_background')
    .slice(0, Math.min(Math.max(params.maxItems || 25, 1), 50))
  const results: Array<Record<string, unknown>> = []
  for (const item of items) {
    try {
      const result = await decideBrokerageMemoryItem({
        pool: params.pool,
        userId: params.userId,
        itemId: item.itemId,
        decision: {
          action: 'approve',
          targetDossierId: item.matchedDossierId,
          targetProspectId: item.matchedProspectId,
          targetListingId: item.matchedListingId,
          confirmConflicts: true,
          coordinateDecision: 'keep_existing',
          fieldDecisions: {
            location: true,
            municipal: true,
            legal: false,
            ownership: false,
            context: true,
          },
        },
        decisionContext: {
          source: 'legacy_background_maintenance',
          runKey: params.runKey,
          planHash: params.planHash,
          policy: 'map-first-additive-enrichment',
        },
      })
      results.push({
        itemId: item.itemId,
        address: item.address,
        status: result.alreadyReviewed ? 'already_reviewed' : 'approved',
        dossierId: result.dossierId || null,
      })
    } catch (error) {
      results.push({
        itemId: item.itemId,
        address: item.address,
        status: 'held_as_exception',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    planHash: plan.planHash,
    attempted: items.length,
    approved: results.filter((result) => result.status === 'approved').length,
    alreadyReviewed: results.filter((result) => result.status === 'already_reviewed').length,
    heldExceptions: plan.summary.heldExceptions + results.filter((result) => result.status === 'held_as_exception').length,
    results,
  }
}
