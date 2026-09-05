import type { Pool } from 'pg'
import { z } from 'zod'
import { getPropertyLink } from '@level-cre/shared'

export const PropertyLinkInputSchema = z.object({
  propertyProspectId: z.string().min(1).nullable(),
  expectedPropertyProspectId: z.string().min(1).nullable(),
}).strict()
export class PropertyLinkError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function savePropertyLink(params: {
  pool: Pool; userId: string; occupantId: string;
  propertyProspectId: string | null; expectedPropertyProspectId: string | null;
}) {
  const { pool, userId, occupantId, propertyProspectId, expectedPropertyProspectId } = params
  if (occupantId === propertyProspectId) throw new PropertyLinkError(400, 'Choose a different building record.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize hierarchy changes, including two opposite links made concurrently.
    await client.query("SELECT pg_advisory_xact_lock(73419628)")
    const ids = [occupantId, propertyProspectId].filter(Boolean)
    const records = (await client.query(`SELECT p.id,p.user_id,p.ai_metadata,
      (p.user_id=$2 OR EXISTS(SELECT 1 FROM listing_prospects lp JOIN listings l ON l.id=lp.listing_id
       LEFT JOIN listing_members lm ON lm.listing_id=l.id AND lm.user_id=$2
       WHERE lp.prospect_id=p.id AND (l.user_id=$2 OR lm.role='editor'))) AS can_edit
      FROM prospects p WHERE p.id=ANY($1::text[]) AND p.merged_into_prospect_id IS NULL ORDER BY p.id FOR UPDATE OF p`, [ids,userId])).rows
    if (records.length !== ids.length || records.some(row => !row.can_edit)) throw new PropertyLinkError(404, 'Both records must be available to edit.')
    const occupant = records.find(row => row.id === occupantId)!
    const current = getPropertyLink({aiMetadata: occupant.ai_metadata})?.propertyProspectId || null
    if (current === propertyProspectId) { await client.query('COMMIT'); return { id: occupantId, aiMetadata: occupant.ai_metadata, unchanged: true } }
    if (current !== expectedPropertyProspectId) throw new PropertyLinkError(409, 'This building link changed. Refresh before trying again.')
    if (propertyProspectId) {
      const parent = records.find(row => row.id === propertyProspectId)!
      if (getPropertyLink({aiMetadata: parent.ai_metadata})) throw new PropertyLinkError(409, 'Select the building, not another occupant.')
      const children = await client.query(`SELECT id FROM prospects WHERE merged_into_prospect_id IS NULL AND ai_metadata->'propertyLink'->>'propertyProspectId'=$1 LIMIT 1`, [occupantId])
      if (children.rows.length) throw new PropertyLinkError(409, 'This record already has occupants. Unlink them before making it an occupant.')
    }
    const reviewedAt = new Date().toISOString()
    const metadata = {...(occupant.ai_metadata || {})}
    const history = Array.isArray(metadata.propertyLinkHistory) ? metadata.propertyLinkHistory : []
    metadata.propertyLinkHistory = [...history, {previous: metadata.propertyLink || null, propertyProspectId, reviewedAt, reviewedBy:userId}]
    if (propertyProspectId) metadata.propertyLink = {propertyProspectId, relationship:'occupant', source:'broker', reviewedAt, reviewedBy:userId}
    else delete metadata.propertyLink
    await client.query('UPDATE prospects SET ai_metadata=$2::jsonb,updated_at=now() WHERE id=$1',[occupantId,JSON.stringify(metadata)])
    await client.query('COMMIT')
    return {id:occupantId,aiMetadata:metadata,unchanged:false}
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}
