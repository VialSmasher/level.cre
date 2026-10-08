import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { NormalizedSalesActivity } from './salesActivityImport';
import { shouldCreateInteractionFromSalesActivity } from './salesActivityImport';
import { listProspectContacts, type ProspectContact } from './prospectContactService';

type Queryable = Pick<Pool | PoolClient, 'query'>;
export type SalesActivityContactAttribution = {
  status: 'attributed' | 'unattributed' | 'ambiguous' | 'conflict';
  reason: string;
  contactId: string | null;
  contactSnapshot: ProspectContact | null;
};
const emailKey = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const unassigned = (status: SalesActivityContactAttribution['status'], reason: string): SalesActivityContactAttribution =>
  ({ status, reason, contactId: null, contactSnapshot: null });

/** Resolve only confirmed email evidence to an active contact on the already-owned account.
 * The caller holds the prospect lock in its ingestion/review transaction. Primary
 * scalars remain authoritative; a stale projected primary email never wins a match.
 */
export async function resolveSalesActivityContact(params: {
  db: Queryable; userId: string; prospectId: string; activity: NormalizedSalesActivity;
}): Promise<SalesActivityContactAttribution> {
  const { activity } = params;
  if (activity.activityType !== 'email' || !shouldCreateInteractionFromSalesActivity(activity)) {
    return unassigned('unattributed', 'not_confirmed_email');
  }
  const email = emailKey(activity.email);
  if (!email) return unassigned('unattributed', 'email_not_recorded');
  if (activity.contactId && !z.string().uuid().safeParse(activity.contactId).success) {
    return unassigned('conflict', 'invalid_contact_id');
  }
  const account = await params.db.query(`SELECT * FROM public.prospects
    WHERE id=$1 AND user_id=$2 AND merged_into_prospect_id IS NULL FOR UPDATE`, [params.prospectId, params.userId]);
  const prospect = account.rows[0];
  if (!prospect) return unassigned('conflict', 'prospect_not_found');
  let contacts: ProspectContact[];
  if (emailKey(prospect.contact_email) === email) {
    contacts = await listProspectContacts(params.db, params.userId, prospect);
  } else {
    const saved = await params.db.query(`SELECT id,prospect_id,is_primary,name,company,email,phone,title,additional_phones
      FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2
      AND is_primary=false AND archived_at IS NULL AND lower(btrim(email))=$3 ORDER BY id`,
    [params.userId, params.prospectId, email]);
    contacts = saved.rows.map((row) => ({ id: row.id, prospectId: row.prospect_id, isPrimary: row.is_primary,
      name: row.name || null, company: row.company || null, email: row.email || null, phone: row.phone || null,
      title: row.title || null, additionalPhones: Array.isArray(row.additional_phones) ? row.additional_phones : [], archivedAt: null }));
  }
  const matches = contacts.filter((contact) => emailKey(contact.email) === email && !contact.archivedAt);
  const selected = activity.contactId ? matches.find((contact) => contact.id === activity.contactId) : null;
  if (activity.contactId && !selected) return unassigned('conflict', 'contact_email_or_target_mismatch');
  if (!selected && matches.length > 1) return unassigned('ambiguous', 'ambiguous_saved_contact_email');
  const contact = selected || matches[0];
  if (!contact) return unassigned('unattributed', 'no_exact_saved_contact_email');
  return { status: 'attributed', reason: 'exact_saved_contact_email', contactId: contact.id, contactSnapshot: contact };
}

export function salesActivityContactMetadata(attribution: SalesActivityContactAttribution) {
  return { contactAttribution: { status: attribution.status, reason: attribution.reason },
    ...(attribution.contactId ? { contactId: attribution.contactId, contactSnapshot: attribution.contactSnapshot } : {}) };
}

/** Incremental replay can fill missing attribution only on the same canonical receipt.
 * Existing person snapshots and all activity/evidence/credit fields are immutable.
 * Unknown legacy email, company or date evidence deliberately stays account-level.
 */
export async function fillSalesActivityContactAttribution(params: {
  db: Queryable; userId: string; prospectId: string; interactionId: string;
  activity: NormalizedSalesActivity; attribution: SalesActivityContactAttribution;
}) {
  if (!params.attribution.contactId || !params.activity.activityAt || params.activity.activityType !== 'email'
    || !shouldCreateInteractionFromSalesActivity(params.activity)) return;
  await params.db.query(`UPDATE public.contact_interactions SET source_metadata=source_metadata || $8::jsonb
    WHERE id=$1 AND user_id=$2 AND prospect_id=$3 AND type='email'
      AND source_provider=$4 AND source_message_id=$5
      AND lower(btrim(source_metadata->>'email'))=$6
      AND lower(btrim(COALESCE(source_metadata->>'company','')))=lower(btrim($9))
      AND date::text IN ($7,substring($7 from 1 for 10))
      AND source_metadata->>'evidenceStatus'='confirmed'
      AND source_metadata->>'direction'=$10
      AND COALESCE(source_metadata->>'subject','')=$11
      AND (NULLIF(btrim(source_metadata->>'contactName'),'') IS NULL
        OR lower(regexp_replace(btrim(source_metadata->>'contactName'),'\s+',' ','g'))=$12)
      AND NULLIF(source_metadata->>'contactId','') IS NULL`,
  [params.interactionId, params.userId, params.prospectId,
    params.activity.source === 'outlook_sync' ? 'outlook' : 'codex', params.activity.externalActivityId,
    emailKey(params.activity.email), params.activity.activityAt.toISOString(),
    JSON.stringify(salesActivityContactMetadata(params.attribution)), params.activity.company || '', params.activity.direction,
    params.activity.subject || '', params.attribution.contactSnapshot?.name?.trim().toLowerCase().replace(/\s+/g, ' ') || '']);
}
/** Report the stored person binding, separately from a retry's current resolution. */
export async function readSalesActivityContactAttribution(params: {
  db: Queryable; userId: string; prospectId: string; interactionId: string;
}): Promise<SalesActivityContactAttribution | undefined> {
  const { rows } = await params.db.query(`SELECT source_metadata FROM public.contact_interactions
    WHERE id=$1 AND user_id=$2 AND prospect_id=$3 AND type='email'`,
  [params.interactionId, params.userId, params.prospectId]);
  if (!rows[0]) return undefined;
  const metadata = rows[0].source_metadata;
  const contactId = typeof metadata?.contactId === 'string' && metadata.contactId.trim() ? metadata.contactId : null;
  if (contactId) return { status: 'attributed', reason: metadata?.contactAttribution?.reason || 'recorded_contact_attribution',
    contactId, contactSnapshot: metadata.contactSnapshot && typeof metadata.contactSnapshot === 'object'
      && !Array.isArray(metadata.contactSnapshot) ? metadata.contactSnapshot : null };
  const saved = metadata?.contactAttribution;
  return unassigned(['unattributed','ambiguous','conflict'].includes(saved?.status) ? saved.status : 'unattributed',
    typeof saved?.reason === 'string' ? saved.reason : 'canonical_contact_not_recorded');
}