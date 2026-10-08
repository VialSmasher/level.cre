import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { derivePhoneReadiness, readPhoneReadinessMetadata, researchCompanyName, phoneText, phoneReadinessTargetKey, publicPhoneResearchStatus, type PhoneResearchStatus } from './phoneReadiness';
import { rankMobileCallCandidate } from './mobileCallingService';
export { derivePhoneReadiness as getProspectPhoneReadiness } from './phoneReadiness';
type Queryable = Pick<PoolClient, 'query'>;
export class PhoneReadinessError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'PhoneReadinessError'; }
}
export const PhoneResearchStatusSchema = z.object({
  prospectId: z.string().trim().min(1).max(240), expectedSnapshotToken: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['not_found', 'conflicting', 'identity_unclear', 'access_blocked']),
  retryAfterDays: z.number().int().min(1).max(90).default(14), notes: z.string().trim().max(500).optional(),
}).strict();
const iso = (value: any): string | null => value instanceof Date ? value.toISOString() : phoneText(value);
export function phoneResearchTargetSnapshot(prospect: Record<string, any>, contacts: Array<Record<string, any>>) {
  return { contactName: phoneText(prospect.contact_name), email: phoneText(prospect.contact_email), phone: phoneText(prospect.contact_phone), company: phoneText(prospect.contact_company),
    contacts: contacts.filter((row) => !row.archived_at).map((row) => ({ id: row.id, isPrimary: Boolean(row.is_primary), name: phoneText(row.name), email: phoneText(row.email), phone: phoneText(row.phone), additionalPhones: Array.isArray(row.additional_phones) ? row.additional_phones : [] })).sort((a, b) => a.id.localeCompare(b.id)) };
}
export function phoneResearchSnapshotToken(prospect: Record<string, any>, contacts: Array<Record<string, any>>) {
  return createHash('sha256').update(JSON.stringify([prospect.id,phoneReadinessTargetKey(prospect,contacts),readPhoneReadinessMetadata(prospect)?.research || null])).digest('hex');
}
/** All data reads are actor-qualified; no anchor creation, message bodies or private activity notes. */
export async function readOwnedPhoneContexts(params: { db: Queryable; userId: string }) {
  const { rows } = await params.db.query(`SELECT p.id,p.name,p.status,p.address,p.business_name,p.contact_company,p.contact_name,p.contact_email,p.contact_phone,p.follow_up_due_date,p.last_contact_date,p.created_at,p.ai_metadata,COALESCE(to_jsonb(p)->>'website_url',p.ai_metadata->'salesProspectMapping'->>'websiteUrl') AS website_url,
    (SELECT MAX(ci.created_at) FROM public.contact_interactions ci WHERE ci.user_id=p.user_id AND ci.prospect_id=p.id) AS last_interaction_at,
    COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.is_primary DESC,c.created_at,c.id) FROM public.prospect_contacts c
      WHERE c.user_id=p.user_id AND c.prospect_id=p.id AND c.archived_at IS NULL),'[]'::jsonb) AS contacts,
    EXISTS(SELECT 1 FROM public.activity_events e WHERE e.user_id=p.user_id AND e.prospect_id=p.id AND e.source='level_cre_mobile_calling'
      AND e.event_type='call_started' AND e.evidence_status='observed' AND e.match_status<>'ignored' AND e.interaction_id IS NULL AND e.source_metadata->>'sessionState'='started') AS pending_call
    FROM public.prospects p WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL AND COALESCE(p.status,'')<>'no_go' ORDER BY p.id`, [params.userId]);
  return rows;
}
export async function listProspectsNeedingPhone(params: { pool: Pool; userId: string; limit?: number; eligibleOnly?: boolean; includeReportedBad?: boolean; now?: Date }) {
  const now = params.now || new Date();
  const contexts = await readOwnedPhoneContexts({ db: params.pool, userId: params.userId });
  const needs = contexts.flatMap((row) => {
    const company = researchCompanyName(row); if (!company) return [];
    const contacts = Array.isArray(row.contacts) ? row.contacts : [];
    const readiness = derivePhoneReadiness(row, contacts, { now, pendingCall: row.pending_call });
    if (readiness.status === 'ready' && !readiness.missingPrimaryContactNumber && !(params.includeReportedBad && readiness.blockedChoices.length > 0)) return [];
    const rank = rankMobileCallCandidate({ status: row.status, followUpDueDate: row.follow_up_due_date, lastContactDate: row.last_contact_date, lastInteractionAt: row.last_interaction_at, createdAt: row.created_at, now });
    return [{ prospect: { id: row.id, name: row.name, businessName: row.business_name || null, address: row.address || null, status: row.status, followUpDueDate: iso(row.follow_up_due_date), lastContactDate: iso(row.last_contact_date) },
      company, researchReason: readiness.blockedChoices.length > 0 ? 'reported_bad_number' as const : readiness.missingPrimaryContactNumber ? 'missing_primary_contact_number' as const : 'missing_number' as const, websiteUrl: phoneText(row.website_url), contactName: phoneText(row.contact_name), priorityScore: rank.score, priority: rank.priority, reasons: rank.reasons, phoneReadiness: readiness,
      targetSnapshot: phoneResearchTargetSnapshot(row, contacts), expectedSnapshotToken: phoneResearchSnapshotToken(row, contacts), pendingCall: Boolean(row.pending_call) }];
  }).sort((a, b) => b.priorityScore - a.priorityScore || ((Date.parse(a.prospect.followUpDueDate || '') || Infinity) - (Date.parse(b.prospect.followUpDueDate || '') || Infinity)) || a.prospect.id.localeCompare(b.prospect.id));
  const eligible = needs.filter((row) => row.phoneReadiness.researchEligible);
  return { rows: (params.eligibleOnly ? eligible : needs).slice(0, Math.max(1, Math.min(1000, Math.trunc(params.limit || 100)))), total: needs.length, eligibleNow: eligible.length, generatedAt: now.toISOString() };
}
export async function recordPhoneResearchStatus(params: { pool: Pool; userId: string; input: z.infer<typeof PhoneResearchStatusSchema>; now?: Date }) {
  const input = PhoneResearchStatusSchema.parse(params.input); const now = params.now || new Date();
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE', [input.prospectId, params.userId]);
    const prospect = rows[0];
    if (!prospect) throw new PhoneReadinessError(404, 'prospect_not_found', 'Prospect was not found for this broker.');
    if (prospect.merged_into_prospect_id || prospect.status === 'no_go') throw new PhoneReadinessError(409, 'prospect_inactive', 'Use an active surviving prospect.');
    if (!researchCompanyName(prospect)) throw new PhoneReadinessError(409, 'company_identity_required', 'An identified company is required for phone research.');
    const contacts = (await client.query('SELECT * FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2 AND archived_at IS NULL ORDER BY id', [params.userId, prospect.id])).rows;
    const state = readPhoneReadinessMetadata(prospect);
    const targetKey = phoneReadinessTargetKey(prospect, contacts);
    const exactRetry = state?.research?.requestToken === input.expectedSnapshotToken && state.research.targetKey === targetKey
      && state.research.status === input.status && (state.research.notes || '') === (input.notes || '') && state.research.retryAfterDays === input.retryAfterDays;
    if (input.expectedSnapshotToken !== phoneResearchSnapshotToken(prospect, contacts) && !exactRetry) throw new PhoneReadinessError(409, 'stale_phone_snapshot', 'The company, contacts or research status changed. Refresh before saving research.');
    if (!state) throw new PhoneReadinessError(409, 'metadata_conflict', 'Phone metadata needs review before research can be saved.');
    const readiness = derivePhoneReadiness(prospect, contacts);
    if (readiness.status === 'ready' && !readiness.missingPrimaryContactNumber && !readiness.blockedChoices.length) throw new PhoneReadinessError(409, 'phone_already_ready', 'This company already has a usable phone.');
    const pending = await client.query(`SELECT id FROM public.activity_events WHERE user_id=$1 AND prospect_id=$2 AND source='level_cre_mobile_calling'
      AND event_type='call_started' AND evidence_status='observed' AND match_status<>'ignored' AND interaction_id IS NULL AND source_metadata->>'sessionState'='started' LIMIT 1`, [params.userId, prospect.id]);
    if (pending.rows.length) throw new PhoneReadinessError(409, 'pending_call', 'Log or cancel the saved call before updating phone research.');
    if (exactRetry) {
      await client.query('COMMIT'); return { status: 'unchanged' as const, prospectId: prospect.id, lastResearch: publicPhoneResearchStatus(state.research) };
    }
    const research: PhoneResearchStatus = { targetKey, requestToken: input.expectedSnapshotToken, retryAfterDays: input.retryAfterDays, status: input.status, attemptedAt: now.toISOString(), retryAt: new Date(now.getTime() + input.retryAfterDays * 86400000).toISOString(), ...(input.notes ? { notes: input.notes } : {}) };
    await client.query('UPDATE public.prospects SET ai_metadata=$3::jsonb,updated_at=now() WHERE id=$1 AND user_id=$2', [prospect.id, params.userId, JSON.stringify({ ...(prospect.ai_metadata || {}), phoneReadiness: { ...state, research } })]);
    await client.query('COMMIT'); return { status: 'saved' as const, prospectId: prospect.id, lastResearch: publicPhoneResearchStatus(research) };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
