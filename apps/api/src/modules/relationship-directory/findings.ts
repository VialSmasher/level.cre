import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'
import { createProspectContactWithClient, ProspectContactCreateSchema } from '../../lib/prospectContactService'
import { DirectoryContextSchema } from './context'
import { resolveCanonicalProspect } from '../../lib/prospectMergeService'
import { requireRunningDirectorySync, withoutSyncId } from './syncTracking'

export const FindingSchema = z.object({
  externalKey: z.string().trim().min(1).max(240),
  syncRequestId: z.string().uuid().optional(),
  prospectId: z.string().min(1).max(240),
  contact: ProspectContactCreateSchema.extend({
    directoryContext: DirectoryContextSchema.refine(value => Boolean(value.sourceRef && value.asOf), 'Agent observations need a source and date.'),
  }).strict(),
}).strict()

function stable(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+stable(value[key])).join(',') + '}'
  return JSON.stringify(value)
}

export async function recordFinding(pool: Pool, owner: string, finding: z.infer<typeof FindingSchema>) {
  await requireRunningDirectorySync(pool,owner,finding.syncRequestId)
  const payload = {syncRequestId:finding.syncRequestId,contact: {...finding.contact, directoryContext: {...finding.contact.directoryContext, evidenceStatus: finding.contact.directoryContext.evidenceStatus === 'inferred' ? 'inferred' : 'observed'}}}
  const result = await pool.query(
    `INSERT INTO public.directory_findings(id,user_id,prospect_id,external_key,payload)
     SELECT $1::uuid,$2::varchar,$3::varchar,$4,$5::jsonb WHERE EXISTS(
       SELECT 1 FROM public.prospects WHERE id=$3 AND user_id=$2 AND merged_into_prospect_id IS NULL)
     ON CONFLICT(user_id,external_key) DO NOTHING RETURNING id,status`,
    [randomUUID(),owner,finding.prospectId,finding.externalKey,JSON.stringify(payload)])
  if (result.rows[0]) return result.rows[0]
  const existing = await pool.query('SELECT id,status,payload,prospect_id FROM public.directory_findings WHERE user_id=$1 AND external_key=$2',[owner,finding.externalKey])
  const row = existing.rows[0]
  if (!row) throw Object.assign(new Error('Company not found for this broker.'),{status:404})
  if (row.prospect_id !== finding.prospectId || stable(withoutSyncId(row.payload)) !== stable(withoutSyncId(payload))) {
    throw Object.assign(new Error('This external key already identifies a different finding. Use a new key for new evidence.'),{status:409})
  }
  return {id:row.id,status:row.status,duplicate:true}
}

export async function reviewFinding(pool: Pool, owner: string, id: string, decision: 'accepted'|'rejected') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM public.directory_findings WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,owner])
    const row = result.rows[0]
    if (!row) throw Object.assign(new Error('Finding not found.'),{status:404})
    if (row.status !== 'observed') {
      if (row.status !== decision) throw Object.assign(new Error('This finding has already been reviewed.'),{status:409})
      await client.query('COMMIT')
      return {id,status:decision,duplicate:true}
    }
    if (decision === 'accepted') {
      const input = ProspectContactCreateSchema.parse(row.payload.contact)
      const resolved = await resolveCanonicalProspect({pool:client,userId:owner,prospectId:row.prospect_id})
      await createProspectContactWithClient(client,{userId:owner,prospectId:resolved.canonicalProspectId,input})
    }
    await client.query('UPDATE public.directory_findings SET status=$3,reviewed_at=now() WHERE id=$1 AND user_id=$2',[id,owner,decision])
    await client.query('COMMIT')
    return {id,status:decision}
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

export function coverage(contacts: Array<{name?:string|null;directoryContext?:any}>) {
  return ['real_estate','operations','facilities','finance','director'].map(role => ({
    role,
    recordedContacts: contacts.filter(contact => contact.name && contact.directoryContext?.evidenceStatus !== 'inferred' && contact.directoryContext?.roles?.includes(role)).map(contact => contact.name),
    inferredContacts: contacts.filter(contact => contact.name && contact.directoryContext?.evidenceStatus === 'inferred' && contact.directoryContext?.roles?.includes(role)).map(contact => contact.name),
    gap: !contacts.some(contact => contact.name && contact.directoryContext?.evidenceStatus !== 'inferred' && contact.directoryContext?.roles?.includes(role)),
  }))
}
