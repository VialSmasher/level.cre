import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { normalizeBusinessPhone, businessPhoneKey, derivePhoneReadiness, isPhoneBlocked, readPhoneReadinessMetadata } from './phoneReadiness';
export { normalizeBusinessPhone } from './phoneReadiness';
import { primaryContactIdentity, reconcilePrimaryContact } from './prospectContactService';

type Queryable = Pick<PoolClient, 'query'>;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const nameKey = (value: unknown) => (text(value) || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
const emailKey = (value: unknown) => (text(value) || '').toLowerCase();
const urlSchema = z.string().max(2000).url().refine((value) => { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password; }, 'Use a public HTTP(S) evidence URL.');
export const PhoneEvidenceSchema = z.object({
  kind: z.enum(['contact_direct','company_main']),
  source: z.enum(['company_website','email_signature','broker_confirmed','zoominfo','official_directory']),
  url: urlSchema.optional(), providerId: z.string().trim().min(1).max(500).optional(),
  observedAt: z.string().datetime({offset:true}), verified: z.literal(true),
}).strict().superRefine((value,ctx) => {
  if (['company_website','official_directory'].includes(value.source) && !value.url) ctx.addIssue({code:'custom',path:['url'],message:'Web evidence needs its source URL.'});
  if (value.source === 'zoominfo' && !value.url && !value.providerId) ctx.addIssue({code:'custom',path:['providerId'],message:'ZoomInfo evidence needs a source URL or stable provider identity.'});
  if (value.source === 'email_signature' && !value.providerId) ctx.addIssue({code:'custom',path:['providerId'],message:'Signature evidence needs a stable provider message identity.'});
});
export type PhoneEvidence = z.infer<typeof PhoneEvidenceSchema>;
const optionalText = z.string().trim().max(240).nullable().optional();
export const PhoneEnrichmentEntrySchema = z.object({
  prospectId:z.string().trim().min(1).max(240), contactId:z.string().uuid().optional(),
  contactName:optionalText, email:z.string().trim().email().max(320).nullable().optional(), company:optionalText,
  contactPhone:z.string().trim().min(1).max(80), phoneEvidence:PhoneEvidenceSchema,
  expectedContact:z.object({name:z.string().max(240).nullable(),email:z.string().max(320).nullable(),phone:z.string().max(80).nullable()}).strict(),
}).strict();
export const PhoneEnrichmentBatchSchema = z.object({entries:z.array(PhoneEnrichmentEntrySchema).min(1).max(100)}).strict();
export type PhoneEnrichmentEntry = z.infer<typeof PhoneEnrichmentEntrySchema>;
export type PhoneEnrichmentResult = {prospectId:string;status:'applied'|'unchanged'|'needs_review'|'error';reason:string;contactId?:string; evidence?:PhoneEvidence|null};
export class PhoneEnrichmentError extends Error {
  constructor(public status:number,public code:string,message:string) { super(message); this.name='PhoneEnrichmentError'; }
}

function phoneKey(value:unknown) { return businessPhoneKey(value) || text(value) || ''; }
/** Tolerant activity capture: invalid phone evidence must not discard an otherwise verified email. */
export function normalizePhoneCapture(input:Record<string,unknown>) {
  const raw=input.contactPhone ?? input.contact_phone ?? input.ContactPhone;
  const contactPhone=normalizeBusinessPhone(raw);
  const nested=input.phoneEvidence;
  const candidate=nested && typeof nested==='object' && !Array.isArray(nested) ? nested : {
    kind:input.phoneKind,source:input.phoneSource,url:text(input.phoneEvidenceUrl) || undefined,
    providerId:text(input.phoneEvidenceId) || undefined,observedAt:input.phoneObservedAt,
    verified:input.phoneVerified===true || input.phoneVerified==='true',
  };
  const parsed=PhoneEvidenceSchema.safeParse(candidate);
  return {contactPhone,phoneEvidence:parsed.success?Object.fromEntries(Object.entries(parsed.data).filter(([,value])=>value!==undefined)) as PhoneEvidence:null,
    phoneCaptureIssue:raw && !contactPhone ? 'invalid_phone' : contactPhone && !parsed.success ? 'incomplete_phone_evidence' : null};
}

type EnrichmentInput = {prospectId:string;contactId?:string|null;contactName?:string|null;email?:string|null;company?:string|null;contactPhone:string|null;phoneEvidence:PhoneEvidence|null;expectedContact?:{name:string|null;email:string|null;phone:string|null}};
/** Caller owns the transaction. The prospect lock also serializes call starts, contact edits and merges. */
export async function applyProspectPhoneEnrichment(params:{db:Queryable;userId:string;input:EnrichmentInput;now?:Date}):Promise<PhoneEnrichmentResult> {
  const {db,userId,input}=params; const now=params.now || new Date();
  const result=(status:PhoneEnrichmentResult['status'],reason:string,contactId?:string):PhoneEnrichmentResult=>({prospectId:input.prospectId,status,reason,...(contactId?{contactId}:{}),evidence:input.phoneEvidence});
  const found=await db.query('SELECT * FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE',[input.prospectId,userId]);
  const prospect=found.rows[0]; if(!prospect) throw new PhoneEnrichmentError(404,'prospect_not_found','Prospect was not found for this broker.');
  if(prospect.merged_into_prospect_id) throw new PhoneEnrichmentError(409,'prospect_merged','Use the surviving prospect before enriching its phone.');
  if(prospect.status==='no_go') return result('needs_review','inactive_prospect');
  const number=normalizeBusinessPhone(input.contactPhone); if(!number) return result('needs_review','invalid_phone');
  if(!input.phoneEvidence || !PhoneEvidenceSchema.safeParse(input.phoneEvidence).success) return result('needs_review','unverified_phone');
  const evidence=input.phoneEvidence;
  if(new Date(evidence.observedAt).getTime()>now.getTime()+300000) return result('needs_review','future_evidence');
  const metadata=prospect.ai_metadata || {};
  if(!readPhoneReadinessMetadata(prospect)) return result('needs_review','metadata_conflict');
  if(typeof metadata!=='object' || Array.isArray(metadata) || (metadata.phoneEnrichment && (typeof metadata.phoneEnrichment!=='object' || Array.isArray(metadata.phoneEnrichment)))) return result('needs_review','metadata_conflict');
  const previous=metadata.phoneEnrichment?.observations || [];
  if(!Array.isArray(previous) || previous.some((entry:any)=>!entry || typeof entry!=='object' || Array.isArray(entry))) return result('needs_review','metadata_conflict');
  const id=createHash('sha256').update(JSON.stringify([phoneKey(number),evidence,input.contactName || null,input.email || null,input.company || null,input.contactId || null])).digest('hex');
  let target:any=prospect;
  if(input.contactId) {
    const row=await db.query('SELECT * FROM public.prospect_contacts WHERE id=$1 AND user_id=$2 AND prospect_id=$3 AND archived_at IS NULL FOR UPDATE',[input.contactId,userId,prospect.id]);
    if(!row.rows[0]) throw new PhoneEnrichmentError(404,'contact_not_found','Contact was not found on this prospect.');
    target=row.rows[0].is_primary ? prospect : { ...row.rows[0],contact_name:row.rows[0].name,contact_company:row.rows[0].company,contact_email:row.rows[0].email,contact_phone:row.rows[0].phone };
  }
  if(input.expectedContact) {
    if(nameKey(input.expectedContact.name)!==nameKey(target.contact_name) || emailKey(input.expectedContact.email)!==emailKey(target.contact_email)) return result('needs_review','stale_contact_snapshot');
    if(phoneKey(input.expectedContact.phone)!==phoneKey(target.contact_phone)) {
      const recorded=previous.find((entry:any)=>entry.id===id && entry.status==='applied');
      let samePerson=Boolean(recorded && evidence.kind==='contact_direct' && phoneKey(target.contact_phone)===phoneKey(number));
      if(samePerson && target.id===prospect.id) {
        const anchor=await db.query('SELECT id,identity_key FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2 AND is_primary=true AND archived_at IS NULL',[userId,prospect.id]);
        samePerson=anchor.rows[0]?.id===recorded.contactId && anchor.rows[0]?.identity_key===primaryContactIdentity(prospect);
      } else if(samePerson) samePerson=target.id===recorded.contactId;
      if(!samePerson) return result('needs_review','stale_contact_snapshot');
      return isPhoneBlocked(prospect,target,number) ? result('needs_review','reported_bad_phone',recorded.contactId) : result('unchanged','existing_phone_matches',recorded.contactId);
    }
  }
  const pending=await db.query(`SELECT id FROM public.activity_events WHERE user_id=$1 AND prospect_id=$2
    AND source='level_cre_mobile_calling' AND event_type='call_started' AND evidence_status='observed'
    AND match_status<>'ignored' AND interaction_id IS NULL AND source_metadata->>'sessionState'='started' LIMIT 1`,[userId,prospect.id]);
  if(pending.rows.length) return result('needs_review','pending_call');
  let status:PhoneEnrichmentResult['status']='needs_review'; let reason='contact_identity_conflict'; let contactId=input.contactId || undefined;
  if(evidence.kind==='contact_direct') {
    const emailConflict=input.email && target.contact_email && emailKey(input.email)!==emailKey(target.contact_email);
    const nameConflict=input.contactName && target.contact_name && nameKey(input.contactName)!==nameKey(target.contact_name);
    const companyConflict=input.company && target.contact_company && nameKey(input.company)!==nameKey(target.contact_company);
    const identityMatches=(input.email && target.contact_email && emailKey(input.email)===emailKey(target.contact_email)) || (input.contactName && target.contact_name && nameKey(input.contactName)===nameKey(target.contact_name));
    if(identityMatches && !emailConflict && !nameConflict && !companyConflict) {
      const blockedIncoming=isPhoneBlocked(prospect,target,number);
      const replaceBad=Boolean(text(target.contact_phone) && phoneKey(target.contact_phone)!==phoneKey(number) && input.expectedContact && isPhoneBlocked(prospect,target,target.contact_phone));
      if(blockedIncoming) {status='needs_review';reason='reported_bad_phone';}
      else if(text(target.contact_phone) && !replaceBad) {status=phoneKey(target.contact_phone)===phoneKey(number)?'unchanged':'needs_review';reason=status==='unchanged'?'existing_phone_matches':'existing_phone_conflict';}
      else if(target.id!==prospect.id) {
        await db.query('UPDATE public.prospect_contacts SET phone=$4,updated_at=now() WHERE id=$1 AND user_id=$2 AND prospect_id=$3',[target.id,userId,prospect.id,number]);
        status='applied';reason=replaceBad?'replaced_bad_contact_phone':'filled_contact_phone';contactId=target.id;
      } else {
        const updated=await db.query('UPDATE public.prospects SET contact_phone=$3,updated_at=now() WHERE id=$1 AND user_id=$2 AND merged_into_prospect_id IS NULL RETURNING *',[prospect.id,userId,number]);
        contactId=(await reconcilePrimaryContact(db,userId,updated.rows[0])).id;status='applied';reason=replaceBad?'replaced_bad_primary_phone':'filled_primary_phone';
      }
    }
  } else {
    reason='company_identity_conflict';
    if(input.contactId) reason='main_line_cannot_target_person';
    else if(input.company && [prospect.business_name,prospect.contact_company,prospect.name].some((name)=>nameKey(name)===nameKey(input.company))) {
      const existing=await db.query(`SELECT * FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2 AND source='broker_added'
        AND name='Company main line' AND archived_at IS NULL FOR UPDATE`,[userId,prospect.id]);
      const same=existing.rows.find((row)=>nameKey(row.company)===nameKey(input.company) && phoneKey(row.phone)===phoneKey(number));
      if(same) {status=isPhoneBlocked(prospect,same,number)?'needs_review':'unchanged';reason=status==='unchanged'?'existing_main_line_matches':'reported_bad_phone';contactId=same.id;}
      else if(existing.rows.length) {
        const bad=existing.rows.find((row)=>nameKey(row.company)===nameKey(input.company) && isPhoneBlocked(prospect,row,row.phone));
        if(bad && input.expectedContact && !isPhoneBlocked(prospect,bad,number)) {
          await db.query('UPDATE public.prospect_contacts SET phone=$4,updated_at=now() WHERE id=$1 AND user_id=$2 AND prospect_id=$3',[bad.id,userId,prospect.id,number]);
          status='applied';reason='replaced_bad_main_line';contactId=bad.id;
        } else reason='existing_main_line_conflict';
      }
      else if(isPhoneBlocked(prospect,{name:'Company main line'},number)) reason='reported_bad_phone';
      else {
        contactId=randomUUID();
        await db.query(`INSERT INTO public.prospect_contacts(id,user_id,prospect_id,source,is_primary,name,company,phone,title,identity_key)
          VALUES($1,$2,$3,'broker_added',false,'Company main line',$4,$5,'Company switchboard',$6)`,[contactId,userId,prospect.id,input.company,number,primaryContactIdentity({contact_name:'Company main line'})]);
        status='applied';reason='added_company_main_line';
      }
    }
  }
  const existingObservation=previous.find((entry:any)=>entry.id===id);
  if(!existingObservation || (status==='applied' && existingObservation.status!=='applied')) {
    const observation={id,number,...evidence,status,reason,contactId:contactId || null,contactName:input.contactName || null,email:input.email || null,company:input.company || null,recordedAt:now.toISOString()};
    const observations=existingObservation
      ? previous.map((entry:any)=>entry.id===id ? {...entry,status,reason,contactId:contactId || null,appliedAt:now.toISOString()} : entry)
      : [...previous,observation].slice(-50);
    await db.query(`UPDATE public.prospects SET ai_metadata=$3::jsonb,updated_at=now() WHERE id=$1 AND user_id=$2 AND merged_into_prospect_id IS NULL`,[prospect.id,userId,JSON.stringify({...metadata,phoneEnrichment:{version:1,observations}})]);
  }
  return result(status,reason,contactId);
}

export async function enrichProspectPhoneBatch(params:{pool:Pool;userId:string;input:z.infer<typeof PhoneEnrichmentBatchSchema>}) {
  const summary={applied:0,unchanged:0,needsReview:0,errors:0,results:[] as PhoneEnrichmentResult[]};
  for(const input of params.input.entries) {
    const client=await params.pool.connect();
    try {await client.query('BEGIN');const result=await applyProspectPhoneEnrichment({db:client,userId:params.userId,input});await client.query('COMMIT');
      summary.results.push(result);if(result.status==='applied') summary.applied++; else if(result.status==='unchanged') summary.unchanged++;else summary.needsReview++;
    } catch(error) {await client.query('ROLLBACK');if(!(error instanceof PhoneEnrichmentError)) throw error;summary.errors++;summary.results.push({prospectId:input.prospectId,status:'error',reason:error.code});}
    finally {client.release();}
  }
  return summary;
}
/** Research context only: never reconcile anchors or read private message/history content. */
export async function getPhoneEnrichmentContext(params:{pool:Pool;userId:string;limit?:number}) {
  const {rows}=await params.pool.query(`SELECT p.id,p.name,p.business_name,p.contact_company,p.contact_name,p.contact_email,p.contact_phone,p.address,
    COALESCE(to_jsonb(p)->>'website_url',p.ai_metadata->'salesProspectMapping'->>'websiteUrl') AS website_url,
    p.ai_metadata,p.ai_metadata->'phoneEnrichment' AS phone_enrichment,COUNT(*) OVER()::int AS total,
    EXISTS(SELECT 1 FROM public.activity_events e WHERE e.user_id=p.user_id AND e.prospect_id=p.id AND e.source='level_cre_mobile_calling'
      AND e.event_type='call_started' AND e.evidence_status='observed' AND e.match_status<>'ignored' AND e.interaction_id IS NULL AND e.source_metadata->>'sessionState'='started') AS pending_call,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'company',c.company,'isPrimary',c.is_primary,'additionalPhones',c.additional_phones) ORDER BY c.is_primary DESC,c.created_at,c.id)
      FROM public.prospect_contacts c WHERE c.user_id=p.user_id AND c.prospect_id=p.id AND c.archived_at IS NULL),'[]'::jsonb) AS contacts
    FROM public.prospects p WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL AND COALESCE(p.status,'')<>'no_go' ORDER BY p.id LIMIT $2`,[params.userId,Math.min(1000,Math.max(1,Math.trunc(params.limit || 1000)))]);
  return {rows:rows.map((row)=>({prospectId:row.id,name:row.name,businessName:row.business_name,contactCompany:row.contact_company,address:row.address,websiteUrl:row.website_url,
    expectedContact:{name:row.contact_name,email:row.contact_email,phone:row.contact_phone},contacts:row.contacts,pendingCall:row.pending_call,phoneReadiness:derivePhoneReadiness(row,row.contacts,{pendingCall:row.pending_call}),phoneEnrichment:row.phone_enrichment})),total:rows[0]?.total || 0};
}
