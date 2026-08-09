import type { Pool, PoolClient } from 'pg'

type Queryable = Pick<Pool | PoolClient, 'query'>

export class ProspectReferenceError extends Error {
  status: number
  code: 'prospect_not_found' | 'prospect_merged'
  canonicalProspectId?: string

  constructor(params: {
    message: string
    status: number
    code: 'prospect_not_found' | 'prospect_merged'
    canonicalProspectId?: string
  }) {
    super(params.message)
    this.name = 'ProspectReferenceError'
    this.status = params.status
    this.code = params.code
    this.canonicalProspectId = params.canonicalProspectId
  }
}
export async function requireActiveOwnedProspect(params: {
  db: Queryable
  userId: string
  prospectId: string
  lock?: boolean
}): Promise<{ id: string }> {
  const result = await params.db.query<{
    id: string
    merged_into_prospect_id: string | null
  }>(`
    SELECT id, merged_into_prospect_id
    FROM public.prospects
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    ${params.lock ? 'FOR UPDATE' : ''}
  `, [params.prospectId, params.userId])
  const prospect = result.rows[0]
  if (!prospect) {
    throw new ProspectReferenceError({
      message: 'Prospect was not found for the signed-in broker.',
      status: 404,
      code: 'prospect_not_found',
    })
  }
  if (prospect.merged_into_prospect_id) {
    throw new ProspectReferenceError({
      message: 'This prospect was consolidated into another record.',
      status: 409,
      code: 'prospect_merged',
      canonicalProspectId: prospect.merged_into_prospect_id,
    })
  }
  return { id: prospect.id }
}
