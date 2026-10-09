import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { NormalizedSalesActivity } from './salesActivityImport';
import { isNamedPersonContact } from './phoneReadiness';
import { primaryContactIdentity, reconcilePrimaryContact } from './prospectContactService';

type Queryable = Pick<PoolClient, 'query'>;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const identity = (value: unknown) => (text(value) || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const emailKey = (value: unknown) => (text(value) || '').toLowerCase();
const singleEmail = z.string().trim().max(320).email().refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const VerifiedEmailEvidenceSchema = z.object({
  source: z.literal('outlook_desktop'),
  verification: z.enum(['matched_sent_items', 'matched_inbox']),
  providerMessageId: z.string().min(1).max(500).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type VerifiedEmailEvidence = z.infer<typeof VerifiedEmailEvidenceSchema>;
export const ExpectedEmailContactSchema = z.object({
  name: z.string().max(240).nullable(), email: z.string().max(320).nullable(),
  phone: z.string().max(80).nullable(), company: z.string().max(240).nullable(),
}).strict();
export type ExpectedEmailContact = z.infer<typeof ExpectedEmailContactSchema>;
export type EmailEnrichmentResult = {
  status: 'applied' | 'unchanged' | 'needs_review' | 'not_requested'; reason: string;
  prospectId?: string; contactId?: string; previousContactId?: string;
  evidence: VerifiedEmailEvidence | null;
};

/** Capture only explicit Outlook proof. Invalid enrichment must not reject otherwise valid activity. */
export function normalizeEmailCapture(input: Record<string, unknown>): {
  emailEvidence: VerifiedEmailEvidence | null; emailCaptureIssue: string | null; expectedEmailContact?: ExpectedEmailContact;
} {
  if (input.emailEvidence == null) return { emailEvidence: null, emailCaptureIssue: null };
  const proof = VerifiedEmailEvidenceSchema.safeParse(input.emailEvidence);
  if (!proof.success) return { emailEvidence: null, emailCaptureIssue: 'invalid_email_evidence' };
  const rawEmail = input.email ?? input.Email ?? input.contactEmail ?? input.contact_email;
  if (typeof rawEmail !== 'string' || /[\u0000-\u001f\u007f]/.test(rawEmail) || !singleEmail.safeParse(rawEmail).success) {
    return { emailEvidence: proof.data, emailCaptureIssue: 'invalid_email' };
  }
  if (input.expectedEmailContact !== undefined) {
    const expected = ExpectedEmailContactSchema.safeParse(input.expectedEmailContact);
    if (!expected.success) return { emailEvidence: proof.data, emailCaptureIssue: 'invalid_expected_email_contact' };
    return { emailEvidence: proof.data, emailCaptureIssue: null, expectedEmailContact: expected.data };
  }
  return { emailEvidence: proof.data, emailCaptureIssue: null };
}

type Candidate = {
  prospect_id: string; contact_id: string | null; is_primary: boolean; name: string | null; email: string | null;
  company: string | null; phone: string | null; account_name: string | null; business_name: string | null;
  primary_identity_key: string | null;
};
type EmailActivity = NormalizedSalesActivity & {
  emailEvidence?: VerifiedEmailEvidence | null; emailCaptureIssue?: string | null; expectedEmailContact?: ExpectedEmailContact;
};

async function candidates(db: Queryable, userId: string, name: string, prospectId: string | null, contactId: string | null) {
  const { rows } = await db.query<Candidate>(`SELECT p.id AS prospect_id,c.id::text AS contact_id,true AS is_primary,
      p.contact_name AS name,p.contact_email AS email,p.contact_company AS company,p.contact_phone AS phone,
      p.name AS account_name,p.business_name,c.identity_key AS primary_identity_key
    FROM public.prospects p LEFT JOIN public.prospect_contacts c ON c.user_id=p.user_id AND c.prospect_id=p.id
      AND c.is_primary=true AND c.archived_at IS NULL
    WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL AND COALESCE(p.status,'') NOT IN ('no_go','archived') AND NULLIF(to_jsonb(p)->>'archived_at','') IS NULL
      AND lower(btrim(regexp_replace(normalize(COALESCE(p.contact_name,''),NFKC),'[[:space:]]+',' ','g')))=$2
      AND ($3::varchar IS NULL OR p.id=$3) AND ($4::text IS NULL OR c.id::text=$4)
    UNION ALL
    SELECT p.id,c.id::text,false,c.name,c.email,c.company,c.phone,p.name,p.business_name,NULL
    FROM public.prospects p JOIN public.prospect_contacts c ON c.user_id=p.user_id AND c.prospect_id=p.id
    WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL AND COALESCE(p.status,'') NOT IN ('no_go','archived') AND NULLIF(to_jsonb(p)->>'archived_at','') IS NULL
      AND c.is_primary=false AND c.archived_at IS NULL
      AND lower(btrim(regexp_replace(normalize(COALESCE(c.name,''),NFKC),'[[:space:]]+',' ','g')))=$2
      AND ($3::varchar IS NULL OR p.id=$3) AND ($4::text IS NULL OR c.id::text=$4)`, [userId, name, prospectId, contactId]);
  return rows.filter((row) => identity(row.name) === name && isNamedPersonContact({ name: row.account_name, business_name: row.business_name }, row));
}
function companyMatches(row: Candidate, company: string) {
  return [row.company, row.business_name, row.account_name].some((value) => identity(value) === company);
}

/** Caller owns the transaction. No activities, counts, credit, new companies, or historical snapshots are changed. */
export async function enrichSalesActivityEmail(params: {
  db: Queryable; userId: string; activity: NormalizedSalesActivity; now?: Date;
}): Promise<EmailEnrichmentResult> {
  const { db, userId } = params; const activity = params.activity as EmailActivity;
  const proof = VerifiedEmailEvidenceSchema.safeParse(activity.emailEvidence);
  const evidence = proof.success ? proof.data : null;
  const result = (status: EmailEnrichmentResult['status'], reason: string, target?: Candidate,
    contactId?: string, previousContactId?: string): EmailEnrichmentResult => ({ status, reason, evidence,
    ...(target ? { prospectId: target.prospect_id } : {}), ...(contactId ? { contactId } : {}),
    ...(previousContactId ? { previousContactId } : {}) });
  if (activity.emailCaptureIssue) return result('needs_review', activity.emailCaptureIssue);
  if (activity.emailEvidence == null) return result('not_requested', 'email_evidence_not_supplied');
  if (!proof.success) return result('needs_review', 'invalid_email_evidence');
  if (activity.activityType !== 'email'
    || !(activity.activityStatus === 'sent' && activity.direction === 'outbound' && evidence!.verification === 'matched_sent_items')
      && !(activity.activityStatus === 'received' && activity.direction === 'inbound' && evidence!.verification === 'matched_inbox')) {
    return result('needs_review', 'not_verified_email_direction');
  }
  const reconciled = activity.rawPayload.reconciledIdentity;
  const originalId = reconciled && typeof reconciled === 'object' && !Array.isArray(reconciled)
    ? (reconciled as Record<string, unknown>).externalActivityId : null;
  if (/^(?:codex_|sa_)/i.test(evidence!.providerMessageId)
    || evidence!.providerMessageId !== activity.externalActivityId && evidence!.providerMessageId !== originalId) {
    return result('needs_review', 'provider_message_mismatch');
  }
  const now = params.now || new Date();
  if (!activity.activityAt || activity.activityAt.getTime() > now.getTime() + 300000
    || Date.parse(evidence!.observedAt) > now.getTime() + 300000
    || Date.parse(evidence!.observedAt) !== activity.activityAt.getTime()) return result('needs_review', 'invalid_email_evidence_date');
  if (typeof activity.email !== 'string' || /[\u0000-\u001f\u007f]/.test(activity.email)
    || !singleEmail.safeParse(activity.email).success) return result('needs_review', 'invalid_email');
  const email = activity.email.trim().toLowerCase(); const name = identity(activity.contactName); const company = identity(activity.company);
  if (!name || /[\u0000-\u001f\u007f]/.test(activity.contactName || '')) return result('needs_review', 'contact_name_required');
  if (activity.contactId && !z.string().uuid().safeParse(activity.contactId).success) return result('needs_review', 'invalid_contact_id');
  if (!activity.prospectId && !activity.contactId && !company) return result('needs_review', 'company_context_required');
  if (/[\u0000-\u001f\u007f]/.test(activity.company || '')) return result('needs_review', 'invalid_company_context');
  const find = async () => {
    const rows = await candidates(db, userId, name, activity.prospectId || null, activity.contactId || null);
    return company ? rows.filter((row) => companyMatches(row, company)) : rows;
  };
  let matches = await find();
  if (!matches.length) return result('needs_review', 'no_exact_saved_contact');
  if (matches.length !== 1) return result('needs_review', 'ambiguous_saved_contact');
  let target = matches[0];
  // Serialize concurrent sync fills of the same address before checking cross-account reuse.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [userId + ':' + email]);
  const locked = await db.query(`SELECT * FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE`, [target.prospect_id, userId]);
  const prospect = locked.rows[0];
  if (!prospect || prospect.merged_into_prospect_id || ['no_go', 'archived'].includes(prospect.status) || Boolean(prospect.archived_at)) return result('needs_review', 'inactive_or_changed_prospect');
  matches = await find();
  if (matches.length !== 1 || matches[0].prospect_id !== target.prospect_id || matches[0].is_primary !== target.is_primary
    || !target.is_primary && matches[0].contact_id !== target.contact_id) return result('needs_review', 'saved_contact_changed');
  target = matches[0];
  if (activity.contactId && target.is_primary && target.primary_identity_key !== primaryContactIdentity(prospect)) {
    return result('needs_review', 'stale_contact_id', target);
  }
  const expected = activity.expectedEmailContact;
  if (expected !== undefined) {
    const parsed = ExpectedEmailContactSchema.safeParse(expected);
    if (!parsed.success) return result('needs_review', 'invalid_expected_email_contact', target);
    if (['name', 'email', 'phone', 'company'].some((key) => text((parsed.data as any)[key]) !== text((target as any)[key]))) {
      return result('needs_review', 'stale_contact_snapshot', target);
    }
  }
  if (text(target.email) && emailKey(target.email) !== email) return result('needs_review', 'existing_email_conflict', target);
  const shared = await db.query(`SELECT p.id FROM public.prospects p
    WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL AND COALESCE(p.status,'') NOT IN ('no_go','archived') AND NULLIF(to_jsonb(p)->>'archived_at','') IS NULL
      AND ((lower(btrim(p.contact_email))=$2 AND NOT (p.id=$3 AND $5::boolean)) OR EXISTS (
        SELECT 1 FROM public.prospect_contacts c WHERE c.user_id=p.user_id AND c.prospect_id=p.id
          AND c.is_primary=false AND c.archived_at IS NULL AND lower(btrim(c.email))=$2
          AND ($4::text IS NULL OR c.id::text<>$4))) LIMIT 1`, [userId, email, target.prospect_id, target.contact_id, target.is_primary]);
  if (shared.rows.length) return result('needs_review', 'shared_saved_email', target);
  if (text(target.email)) return result('unchanged', 'existing_email_matches', target, target.contact_id || undefined);
  const pending = await db.query(`SELECT id FROM public.activity_events WHERE user_id=$1 AND prospect_id=$2
    AND source='level_cre_mobile_calling' AND event_type='call_started' AND evidence_status='observed'
    AND match_status<>'ignored' AND interaction_id IS NULL AND source_metadata->>'sessionState'='started' LIMIT 1`, [userId, target.prospect_id]);
  if (pending.rows.length) return result('needs_review', 'pending_call', target);
  if (target.is_primary) {
    const old = (await db.query(`SELECT * FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2
      AND is_primary=true AND archived_at IS NULL FOR UPDATE`, [userId, target.prospect_id])).rows[0];
    if (old && old.identity_key !== primaryContactIdentity(prospect)) return result('needs_review', 'stale_primary_projection', target);
    const updated = await db.query(`UPDATE public.prospects SET contact_email=$3,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND NULLIF(btrim(contact_email),'') IS NULL RETURNING *`, [target.prospect_id, userId, email]);
    if (!updated.rows[0]) return result('needs_review', 'saved_contact_changed', target);
    const primary = await reconcilePrimaryContact(db, userId, updated.rows[0]);
    if (old) await db.query(`UPDATE public.prospect_contacts SET title=$4,additional_phones=$5::jsonb
      WHERE id=$1 AND user_id=$2 AND prospect_id=$3`, [primary.id, userId, target.prospect_id, old.title, JSON.stringify(old.additional_phones)]);
    return result('applied', 'filled_missing_contact_email', target, primary.id, old?.id);
  }
  const old = (await db.query(`SELECT * FROM public.prospect_contacts WHERE id=$1 AND user_id=$2 AND prospect_id=$3
    AND is_primary=false AND archived_at IS NULL FOR UPDATE`, [target.contact_id, userId, target.prospect_id])).rows[0];
  if (!old || text(old.email)) return result('needs_review', 'saved_contact_changed', target);
  const nextId = randomUUID();
  await db.query(`UPDATE public.prospect_contacts SET archived_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2`, [old.id, userId]);
  await db.query(`INSERT INTO public.prospect_contacts (id,user_id,prospect_id,is_primary,source,name,company,email,phone,title,additional_phones,identity_key)
    VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`, [nextId, userId, target.prospect_id, old.source,
    old.name, old.company, email, old.phone, old.title, JSON.stringify(old.additional_phones),
    primaryContactIdentity({ contact_name: old.name, contact_email: email, contact_phone: old.phone })]);
  return result('applied', 'filled_missing_contact_email', target, nextId, old.id);
}
