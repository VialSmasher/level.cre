import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { BrokerClassificationSchema, PropertyClassificationValue } from '@level-cre/shared'

export const BrokerageMemoryClassificationInputSchema = z.object({
  propertyClassification: PropertyClassificationValue.nullable(),
}).strict()

// A reset retains its timestamp so an older import cannot restore a correction.
const ClassificationOverrideSchema = BrokerClassificationSchema.extend({
  classification: PropertyClassificationValue.nullable(),
})
export type ClassificationOverride = z.infer<typeof ClassificationOverrideSchema>

export function latestClassificationOverride(...metadata: unknown[]): ClassificationOverride | undefined {
  let latest: ClassificationOverride | undefined
  for (const value of metadata) {
    const parsed = ClassificationOverrideSchema.safeParse((value as any)?.propertyClassification)
    if (parsed.success && (!latest || Date.parse(parsed.data.reviewedAt) >= Date.parse(latest.reviewedAt))) latest = parsed.data
  }
  return latest
}

export function classificationProjection(...metadata: unknown[]) {
  const override = latestClassificationOverride(...metadata)
  return override ? { propertyClassification: override.classification === null ? null : BrokerClassificationSchema.parse(override) } : {}
}

export async function loadMemoryClassificationOverride(client: Pick<PoolClient, 'query'>, userId: string, anchorId: string) {
  const { rows } = await client.query<{ metadata: unknown }>(`
    SELECT items.decision_metadata AS metadata
    FROM public.brokerage_memory_items items
    JOIN public.brokerage_memory_imports imports ON imports.id = items.import_id AND imports.user_id = items.user_id
    WHERE items.user_id = $1 AND items.external_anchor_id = $2
      AND imports.source = 'current_projects_title_enrichment'
      AND items.decision_metadata ? 'propertyClassification'
    UNION ALL
    SELECT source_provenance AS metadata FROM public.intel_property_dossiers
    WHERE created_by_user_id = $1 AND external_memory_key = $2
      AND status <> 'archived' AND source_provenance ? 'propertyClassification'
  `, [userId, anchorId])
  return latestClassificationOverride(...rows.map(row => row.metadata))
}

export class BrokerageMemoryClassificationError extends Error {
  constructor(message: string, public status = 400, public prospectId?: string) {
    super(message)
    this.name = 'BrokerageMemoryClassificationError'
  }
}

export async function patchBrokerageMemoryClassification(params: {
  pool: Pick<Pool, 'connect'>
  userId: string
  kind: 'memory_item' | 'dossier'
  id: string
  propertyClassification: z.infer<typeof PropertyClassificationValue> | null
}) {
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    // Coordinate with restaging so a correction cannot land on an item just superseded.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${params.userId}:current_projects_title_enrichment`])
    if (params.kind === 'memory_item') {
      const { rows } = await client.query<{ status: string; matched_prospect_id: string | null }>(`
        SELECT status, matched_prospect_id FROM public.brokerage_memory_items WHERE id = $1 AND user_id = $2 FOR UPDATE
      `, [params.id, params.userId])
      if (!rows[0]) throw new BrokerageMemoryClassificationError('Property review item not found.', 404)
      if (rows[0].status === 'approved' && rows[0].matched_prospect_id) throw new BrokerageMemoryClassificationError('Classify the linked map property instead.', 409, rows[0].matched_prospect_id)
      if (rows[0].status !== 'pending') throw new BrokerageMemoryClassificationError('This review item has changed. Refresh the property before classifying it.', 409)
      // matched_prospect_id is a suggestion until review; it is not a confirmed link.
    } else {
      const { rows } = await client.query<{ prospect_id: string | null; approved_at: unknown; status: string }>(`
        SELECT prospect_id, approved_at, status FROM public.intel_property_dossiers
        WHERE id = $1 AND created_by_user_id = $2 FOR UPDATE
      `, [params.id, params.userId])
      if (!rows[0] || rows[0].status === 'archived') throw new BrokerageMemoryClassificationError('Property memory not found.', 404)
      if (rows[0].prospect_id) throw new BrokerageMemoryClassificationError('Classify the linked map property instead.', 409, rows[0].prospect_id)
      if (!rows[0].approved_at) throw new BrokerageMemoryClassificationError('This dossier is not approved property memory.', 409)
    }
    const override: ClassificationOverride = {
      classification: params.propertyClassification, source: 'broker', reviewedAt: new Date().toISOString(), reviewedBy: params.userId,
    }
    const metadata = JSON.stringify({ propertyClassification: override })
    if (params.kind === 'memory_item') {
      await client.query(`UPDATE public.brokerage_memory_items
        SET decision_metadata = COALESCE(decision_metadata, '{}'::jsonb) || $3::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2`, [params.id, params.userId, metadata])
    } else {
      await client.query(`UPDATE public.intel_property_dossiers
        SET source_provenance = COALESCE(source_provenance, '{}'::jsonb) || $3::jsonb, updated_at = now()
        WHERE id = $1 AND created_by_user_id = $2`, [params.id, params.userId, metadata])
    }
    await client.query('COMMIT')
    return { target: { kind: params.kind, id: params.id }, ...classificationProjection({ propertyClassification: override }) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
