import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'
import { BrokerSchema, RelationshipSchema } from './schemas'
import { DirectoryContextSchema } from './context'
import { createProspectContactWithClient, listProspectContacts, requireContactProspect } from '../../lib/prospectContactService'
import { requireRunningDirectorySync, withoutSyncId } from './syncTracking'

export function stable(value: any): string {
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']'
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'
  return JSON.stringify(value)
}
export function contactSnapshot(contact: any) {
  return createHash('sha256').update(stable(Object.fromEntries(
    ['id','name','email','company','title','phone','additionalPhones','directoryContext','archivedAt','isPrimary'].map(k=>[k,contact[k]??null])
  ))).digest('hex')
}
const evidence = z.object({
  kind:z.enum(['public_source','correspondence','broker_direction','corporate_search']),
  reference:z.string().trim().min(1).max(2000), asOf:z.string().date(),
  fact:z.string().trim().min(1).max(2000),
}).strict()
const common = {externalKey:z.string().trim().min(1).max(240),evidence,syncRequestId:z.string().uuid().optional()}
const context = DirectoryContextSchema.refine(c=>!!c.sourceRef && !!c.asOf && c.evidenceStatus!=='inferred',
  'Direct saves need attributable evidence and a date. Stage inferences as findings.')
export const MaintenanceSchema = z.discriminatedUnion('kind',[
  z.object({...common,kind:z.literal('broker'),id:z.string().uuid(),broker:BrokerSchema.refine(b=>!b.archived,'Archiving requires a broker edit.')} ).strict(),
  z.object({...common,kind:z.literal('relationship'),id:z.string().uuid(),relationship:RelationshipSchema.refine(r=>!r.archived && !!r.scope,'Provide scope. Archiving requires a broker edit.')} ).strict(),
  z.object({...common,kind:z.literal('contact'),prospectId:z.string().min(1).max(240),contactId:z.string().uuid().optional(),
    expectedSnapshot:z.string().length(64).optional(),
    contact:z.object({name:z.string().trim().min(1).max(240),company:z.string().trim().max(240).optional(),
      email:z.string().trim().email().max(320).optional(),title:z.string().trim().max(240).optional(),directoryContext:context}).strict(),
  }).strict(),
])
function fail(message:string,status=409):never {throw Object.assign(new Error(message),{status})}
const normalize=(s:unknown)=>String(s??'').trim().toLowerCase()

/** One private transaction: exact replay, ownership, optimistic conflict checks, then durable before/after evidence. */
export async function maintainDirectory(pool:Pool,owner:string,input:z.infer<typeof MaintenanceSchema>) {
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['directory-maintenance:'+owner])
    await requireRunningDirectorySync(client,owner,input.syncRequestId)
    const prior=await client.query('SELECT request,result FROM public.directory_changes WHERE user_id=$1 AND external_key=$2',[owner,input.externalKey])
    if(prior.rows[0]) {
      if(stable(withoutSyncId(prior.rows[0].request))!==stable(withoutSyncId(input))) fail('This external key identifies different evidence. Use a new key for a new change.')
      await client.query('COMMIT')
      return {...prior.rows[0].result,duplicate:true}
    }
    let before:any=null, result:any
    if(input.kind==='broker') {
      const b=input.broker
      const current=await client.query('SELECT * FROM public.directory_brokers WHERE user_id=$1 AND id=$2 FOR UPDATE',[owner,input.id])
      before=current.rows[0]??null
      if(before ? before.version!==b.version || before.archived : b.version!==0) fail('Broker changed. Read the current broker brief before saving.')
      if(!before) {
        const duplicate=await client.query(`SELECT id FROM public.directory_brokers WHERE user_id=$1 AND NOT archived AND
          (lower(trim(name))=lower(trim($2)) AND lower(trim(firm))=lower(trim($3)) OR ($4<>'' AND lower(email)=lower($4)))`,[owner,b.name,b.firm,b.email])
        if(duplicate.rows.length) fail('A matching broker already exists. Resolve that profile before saving.')
        await client.query(`INSERT INTO public.directory_brokers(id,user_id,name,firm,office,email,phone,linkedin_url,source_url,notes)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[input.id,owner,b.name,b.firm,b.office,b.email,b.phone,b.linkedinUrl,b.sourceUrl,b.notes])
      } else {
        await client.query(`UPDATE public.directory_brokers SET name=$3,firm=$4,office=$5,email=$6,phone=$7,linkedin_url=$8,source_url=$9,notes=$10,version=version+1,updated_at=now()
          WHERE id=$1 AND user_id=$2`,[input.id,owner,b.name,b.firm,b.office,b.email,b.phone,b.linkedinUrl,b.sourceUrl,b.notes])
      }
      result={kind:input.kind,id:input.id,version:b.version+1}
    } else if(input.kind==='relationship') {
      const r=input.relationship
      if(r.status==='active' && !['correspondence','broker_direction'].includes(input.evidence.kind)) fail('A public biography alone cannot establish current representation.',400)
      await requireContactProspect(client,owner,r.prospectId)
      const broker=await client.query('SELECT id FROM public.directory_brokers WHERE id=$1 AND user_id=$2 AND NOT archived FOR SHARE',[r.brokerId,owner])
      if(!broker.rows.length) fail('Broker not found for this owner.',404)
      const current=await client.query('SELECT * FROM public.directory_relationships WHERE id=$1 AND user_id=$2 FOR UPDATE',[input.id,owner])
      before=current.rows[0]??null
      if(before ? before.version!==r.version || before.archived || before.prospect_id!==r.prospectId || before.broker_id!==r.brokerId : r.version!==0) fail('Connection changed. Read the current company brief before saving.')
      if(!before) await client.query(`INSERT INTO public.directory_relationships(id,user_id,broker_id,prospect_id,status,scope,notes,source_url,learned_on)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[input.id,owner,r.brokerId,r.prospectId,r.status,r.scope,r.notes,r.sourceUrl,r.learnedOn])
      else await client.query(`UPDATE public.directory_relationships SET status=$3,scope=$4,notes=$5,source_url=$6,learned_on=$7,version=version+1,updated_at=now()
        WHERE id=$1 AND user_id=$2`,[input.id,owner,r.status,r.scope,r.notes,r.sourceUrl,r.learnedOn])
      result={kind:input.kind,id:input.id,version:r.version+1}
    } else {
      const prospect=await requireContactProspect(client,owner,input.prospectId)
      const contacts=await listProspectContacts(client,owner,prospect)
      const c={...input.contact,directoryContext:{...input.contact.directoryContext,evidenceStatus:'observed' as const}}
      if(input.contactId) {
        const existing=contacts.find(c=>c.id===input.contactId)
        if(!existing) fail('Contact not found on this account.',404)
        if(!input.expectedSnapshot || contactSnapshot(existing)!==input.expectedSnapshot) fail('Contact changed. Read its fresh snapshot before saving.')
        before=existing
        if(normalize(existing.name)!==normalize(c.name) || (c.email && existing.email && normalize(c.email)!==normalize(existing.email)))
          fail('Contact identity conflicts with the saved person. Keep the evidence in review.')
        // The phone enrichment contract owns dialing details. This route cannot change phone readiness.
        if(c.email && !existing.email) fail('Use the verified email enrichment workflow to fill an existing contact email.')
        await client.query(`UPDATE public.prospect_contacts SET title=COALESCE($4,title),company=COALESCE($5,company),directory_context=$6::jsonb,updated_at=now()
          WHERE user_id=$1 AND prospect_id=$2 AND id=$3`,[owner,input.prospectId,input.contactId,c.title??null,c.company??null,JSON.stringify(c.directoryContext)])
        // Primary company is reconciled from the prospect snapshot on reads; keep the authoritative value in sync.
        if(existing.isPrimary && c.company!==undefined) await client.query('UPDATE public.prospects SET contact_company=$3,updated_at=now() WHERE user_id=$1 AND id=$2',[owner,input.prospectId,c.company])
        result={kind:input.kind,id:input.contactId,prospectId:input.prospectId}
      } else {
        if(input.expectedSnapshot) fail('New contacts cannot specify an existing snapshot.',400)
        if(contacts.some(e=>normalize(e.name)===normalize(c.name)||(c.email&&normalize(e.email)===normalize(c.email)))) fail('A matching contact already exists. Resolve the saved contact first.')
        const saved=await createProspectContactWithClient(client,{userId:owner,prospectId:input.prospectId,input:c})
        const added=saved.contacts.find(c=>!contacts.some(e=>e.id===c.id))!
        result={kind:input.kind,id:added.id,prospectId:input.prospectId}
      }
    }
    await client.query(`INSERT INTO public.directory_changes(id,user_id,external_key,request,before_record,result) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
      [randomUUID(),owner,input.externalKey,JSON.stringify(input),JSON.stringify(before),JSON.stringify(result)])
    await client.query('COMMIT')
    return {...result,duplicate:false}
  } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
}
