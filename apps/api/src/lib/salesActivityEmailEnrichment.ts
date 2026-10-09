import type { PoolClient } from 'pg';
import { normalizeSalesActivityInput, type NormalizedSalesActivity } from './salesActivityImport';
import { enrichSalesActivityEmail, type EmailEnrichmentResult, type VerifiedEmailEvidence } from './emailEnrichmentService';

const key = (value: string | null) => (value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const observation = (activity: NormalizedSalesActivity) => JSON.stringify([
  activity.activityType, activity.activityStatus, activity.direction, activity.email,
  activity.activityAt?.toISOString() || null, activity.subject || '', key(activity.contactName), key(activity.company),
]);
type EmailEnrichmentReceipt = { observation: string; proof: VerifiedEmailEvidence | null; prospectId: string | null; contactId: string | null };
export type CanonicalEmailEnrichmentResult = EmailEnrichmentResult & { receipt: EmailEnrichmentReceipt };

/** Pin the original observation separately from legacy raw-payload overlays. A
 * rejected retry must never become the next retry's new identity baseline. */
export async function enrichEmailFromCanonicalReceipt(params: {
  db: Pick<PoolClient, 'query'>; userId: string; activity: NormalizedSalesActivity; capturedProspectId?: string | null;
}): Promise<CanonicalEmailEnrichmentResult | undefined> {
  const { activity } = params;
  if (!activity.emailEvidence && !activity.emailCaptureIssue) return undefined;
  await lockSalesActivityReceipt(params.db, params.userId, activity.source, activity.externalActivityId);
  const retained = await params.db.query(
    'SELECT raw_payload,prospect_id,activity_status,activity_type,email,company,contact_name,subject,activity_at FROM public.sales_activity_imports WHERE user_id=$1 AND source=$2 AND external_activity_id=$3 FOR UPDATE',
    [params.userId, activity.source, activity.externalActivityId],
  );
  const row = retained.rows[0];
  const saved = row ? normalizeSalesActivityInput({...row.raw_payload,source:activity.source,externalActivityId:activity.externalActivityId,
    activityStatus:row.activity_status,activityType:row.activity_type,email:row.email,company:row.company,
    contactName:row.contact_name,subject:row.subject,activityAt:row.activity_at}) : activity;
  const receipt: EmailEnrichmentReceipt = row?.raw_payload?.emailEnrichmentReceipt || {
    observation:observation(saved),proof:saved.emailEvidence || activity.emailEvidence || null,
    prospectId:row?.prospect_id || saved.prospectId || null,contactId:saved.contactId || null,
  };
  const conflict = (reason: string): CanonicalEmailEnrichmentResult => ({status:'needs_review',reason,evidence:activity.emailEvidence || null,receipt});
  if (observation(activity) !== receipt.observation) return conflict('receipt_observation_changed');
  if (params.capturedProspectId && [activity.prospectId,row?.prospect_id,receipt.prospectId].some((id) => id && id !== params.capturedProspectId)) return conflict('conflicting_captured_email_prospect');
  if ([row?.prospect_id,receipt.prospectId].some((id) => id && activity.prospectId && id !== activity.prospectId)) return conflict('receipt_target_changed');
  if (receipt.proof && JSON.stringify([receipt.proof.source,receipt.proof.verification,receipt.proof.providerMessageId,receipt.proof.observedAt])
    !== JSON.stringify([activity.emailEvidence?.source,activity.emailEvidence?.verification,activity.emailEvidence?.providerMessageId,activity.emailEvidence?.observedAt])) return conflict('receipt_email_evidence_changed');
  const prior = row?.raw_payload?.emailEnrichmentApplied || row?.raw_payload?.emailEnrichment;
  if (prior && ['applied','unchanged'].includes(prior.status) && typeof prior.prospectId === 'string' && typeof prior.contactId === 'string') {
    if (activity.prospectId && activity.prospectId !== prior.prospectId) return conflict('receipt_target_changed');
    if (activity.contactId && ![prior.contactId,prior.previousContactId].includes(activity.contactId)) return conflict('receipt_contact_changed');
    return {...prior,status:'unchanged',reason:'previously_enriched_receipt',receipt};
  }
  if (receipt.contactId && activity.contactId && activity.contactId !== receipt.contactId) return conflict('receipt_contact_changed');
  const result = await enrichSalesActivityEmail({...params,activity:{...activity,prospectId:activity.prospectId || row?.prospect_id || params.capturedProspectId || null}});
  return {...result,receipt};
}

export function emailEnrichmentMetadata(result: CanonicalEmailEnrichmentResult) {
  const {receipt,...enrichment} = result;
  return {emailEnrichment:enrichment,emailEnrichmentReceipt:receipt,
    ...(['applied','unchanged'].includes(result.status) && result.prospectId && result.contactId ? {emailEnrichmentApplied:enrichment} : {})};
}

export function publicEmailEnrichment(result: CanonicalEmailEnrichmentResult): EmailEnrichmentResult {
  const {receipt, ...enrichment} = result;
  return enrichment;
}

export async function lockSalesActivityReceipt(db: Pick<PoolClient, 'query'>, userId: string, source: string, externalActivityId: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['email-enrichment-receipt:' + userId + ':' + source + ':' + externalActivityId]);
}