import type { Pool } from 'pg';
import { z } from 'zod';
import { normalizeMarketAddress } from '@level-cre/shared';

import type { IStorage } from '../storage';
import { submitMarketRecordProposal } from './marketRecordProposalService';
import { resolveMarketEntitiesForUser } from './marketEntityResolver';
import { reviewSalesActivityImport } from './salesActivityImportService';

export const SalesProspectMapCandidateSchema = z.object({
  externalActivityId: z.string().trim().min(1).max(240),
  activitySource: z.string().trim().min(1).max(80).optional().default('codex_followup'),
  observedAt: z.string().datetime().optional(),
  company: z.string().trim().min(1).max(240),
  contactName: z.string().trim().max(240).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  contactPhone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: z.string().trim().url().max(2000).nullable().optional(),
  address: z.string().trim().min(3).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().trim().max(240).nullable().optional(),
  googleMapsUrl: z.string().trim().url().max(2000).nullable().optional(),
  evidenceUrl: z.string().trim().url().max(2000).nullable().optional(),
  addressSource: z.enum(['company_website', 'google_maps', 'municipal', 'outlook', 'manual', 'other']),
  confidence: z.number().int().min(80).max(100),
  verified: z.literal(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const SalesProspectMapBatchSchema = z.object({
  source: z.string().trim().min(1).max(80).optional().default('codex_sales_prospect'),
  runId: z.string().trim().max(120).nullable().optional(),
  candidates: z.array(SalesProspectMapCandidateSchema).min(1).max(50),
});

export type SalesProspectMapCandidate = z.infer<typeof SalesProspectMapCandidateSchema>;
export type SalesProspectMapBatch = z.infer<typeof SalesProspectMapBatchSchema>;

type MappingAction = 'created' | 'linked_existing' | 'needs_review';

function compactAddressKey(address: string) {
  return normalizeMarketAddress(address).replace(/\s+/g, '');
}

type ExactProspectEvidence = {
  id: string;
  address: string | null;
  contactEmail: string | null;
  marketKey: string | null;
};

async function loadExactProspectEvidence(pool: Pool, userId: string): Promise<ExactProspectEvidence[]> {
  const { rows } = await pool.query(
    `
      SELECT id, address, contact_email, market_key
      FROM public.prospects
      WHERE user_id = $1 AND merged_into_prospect_id IS NULL
    `,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    address: row.address || null,
    contactEmail: row.contact_email || null,
    marketKey: row.market_key || null,
  }));
}

async function findActivityReference(params: {
  pool: Pool;
  userId: string;
  candidate: SalesProspectMapCandidate;
}) {
  const { rows } = await params.pool.query(
    `
      SELECT id, prospect_id, interaction_id
      FROM public.sales_activity_imports
      WHERE user_id = $1
        AND source = $2
        AND external_activity_id = $3
      LIMIT 1
    `,
    [params.userId, params.candidate.activitySource, params.candidate.externalActivityId],
  );
  return rows[0] || null;
}

function findExactProspectMatches(params: {
  prospects: ExactProspectEvidence[];
  candidate: SalesProspectMapCandidate;
}) {
  const addressKey = compactAddressKey(params.candidate.address);
  const placeMarketKey = params.candidate.placeId ? `google-place:${params.candidate.placeId}` : null;
  const contactEmail = params.candidate.contactEmail?.toLowerCase() || null;
  return params.prospects
    .filter((prospect) => (
      Boolean(contactEmail && prospect.contactEmail?.toLowerCase() === contactEmail)
      || Boolean(placeMarketKey && prospect.marketKey === placeMarketKey)
      || Boolean(addressKey && prospect.address && compactAddressKey(prospect.address) === addressKey)
    ))
    .slice(0, 3)
    .map((prospect) => prospect.id);
}

async function enrichExistingProspect(params: {
  pool: Pool;
  userId: string;
  prospectId: string;
  candidate: SalesProspectMapCandidate;
  source: string;
}) {
  const metadata = {
    salesProspectMapping: {
      source: params.source,
      externalActivityId: params.candidate.externalActivityId,
      addressSource: params.candidate.addressSource,
      confidence: params.candidate.confidence,
      evidenceUrl: params.candidate.evidenceUrl || null,
      verifiedAt: params.candidate.observedAt || new Date().toISOString(),
    },
    ...(params.candidate.placeId || params.candidate.googleMapsUrl ? {
      googlePlace: {
        ...(params.candidate.placeId ? { placeId: params.candidate.placeId } : {}),
        ...(params.candidate.googleMapsUrl ? { googleMapsUrl: params.candidate.googleMapsUrl } : {}),
      },
    } : {}),
  };
  await params.pool.query(
    `
      UPDATE public.prospects
      SET contact_name = COALESCE(NULLIF(contact_name, ''), $3),
          contact_email = COALESCE(NULLIF(contact_email, ''), $4),
          contact_phone = COALESCE(NULLIF(contact_phone, ''), $5),
          contact_company = COALESCE(NULLIF(contact_company, ''), $6),
          business_name = COALESCE(NULLIF(business_name, ''), $6),
          website_url = COALESCE(NULLIF(website_url, ''), $7),
          address = COALESCE(NULLIF(address, ''), $8),
          location_lat = COALESCE(location_lat, $9),
          location_lng = COALESCE(location_lng, $10),
          geometry = CASE
            WHEN ST_GeometryType(geometry) = 'ST_Point'
              AND (location_lat IS NULL OR location_lng IS NULL)
              THEN ST_SetSRID(ST_MakePoint($10, $9), 4326)
            ELSE geometry
          END,
          market_key = COALESCE(NULLIF(market_key, ''), $11),
          market_confidence = GREATEST(COALESCE(market_confidence, 0), $12),
          market_context_source = COALESCE(NULLIF(market_context_source, ''), $13),
          market_context_status = 'verified',
          ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || $14::jsonb,
          updated_at = now()
      WHERE id = $1 AND user_id = $2 AND merged_into_prospect_id IS NULL
    `,
    [
      params.prospectId,
      params.userId,
      params.candidate.contactName || null,
      params.candidate.contactEmail || null,
      params.candidate.contactPhone || null,
      params.candidate.company,
      params.candidate.websiteUrl || null,
      params.candidate.address,
      params.candidate.latitude,
      params.candidate.longitude,
      params.candidate.placeId ? `google-place:${params.candidate.placeId}` : null,
      params.candidate.confidence,
      params.source,
      JSON.stringify(metadata),
    ],
  );
}

export async function linkSalesActivityReference(params: {
  pool: Pool;
  storage: Pick<IStorage, 'createContactInteraction'>;
  userId: string;
  externalActivityId: string;
  activitySource?: string | null;
  prospectId: string;
}) {
  const source = params.activitySource || 'codex_followup';
  const importResult = await params.pool.query(
    `
      SELECT id
      FROM public.sales_activity_imports
      WHERE user_id = $1 AND source = $2 AND external_activity_id = $3
      LIMIT 1
    `,
    [params.userId, source, params.externalActivityId],
  );
  const importId = importResult.rows[0]?.id || null;
  if (!importId) return { linked: false, reason: 'sales_activity_not_found' };

  const result = await reviewSalesActivityImport({
    pool: params.pool,
    storage: params.storage,
    userId: params.userId,
    importId,
    decision: { action: 'link', prospectId: params.prospectId },
  });
  await params.pool.query(
    `
      UPDATE public.activity_events event
      SET prospect_id = activity.prospect_id,
          interaction_id = activity.interaction_id,
          match_status = 'matched',
          match_reason = 'verified_sales_prospect_map',
          confidence = 100,
          updated_at = now()
      FROM public.sales_activity_imports activity
      WHERE activity.id = $1
        AND activity.user_id = $2
        AND event.user_id = activity.user_id
        AND event.source = activity.source
        AND event.external_event_id = activity.external_activity_id
    `,
    [importId, params.userId],
  );
  return { linked: true, importId, result };
}

async function queueForReview(params: {
  pool: Pool;
  userId: string;
  candidate: SalesProspectMapCandidate;
  source: string;
  runId?: string | null;
  reason: string;
}) {
  return submitMarketRecordProposal({
    pool: params.pool,
    userId: params.userId,
    proposal: {
      externalId: `sales-map:${params.candidate.externalActivityId}`,
      source: params.source,
      observedAt: params.candidate.observedAt,
      evidenceStatus: 'observed',
      confidence: params.candidate.confidence,
      businessName: params.candidate.company,
      address: params.candidate.address,
      latitude: params.candidate.latitude,
      longitude: params.candidate.longitude,
      contactName: params.candidate.contactName,
      contactEmail: params.candidate.contactEmail,
      contactPhone: params.candidate.contactPhone,
      websiteUrl: params.candidate.websiteUrl,
      notes: params.candidate.notes || 'Verified sales prospect location; duplicate context requires review.',
      placeId: params.candidate.placeId,
      googleMapsUrl: params.candidate.googleMapsUrl,
      evidenceUrl: params.candidate.evidenceUrl,
      sourceMetadata: {
        salesActivityExternalId: params.candidate.externalActivityId,
        salesActivitySource: params.candidate.activitySource,
        runId: params.runId || null,
        addressSource: params.candidate.addressSource,
        reviewReason: params.reason,
      },
    },
    agentName: 'codex-sales-prospect-mapper',
  });
}

export async function processSalesProspectMapBatch(params: {
  pool: Pool;
  storage: Pick<IStorage, 'createProspect' | 'createContactInteraction'>;
  userId: string;
  payload: SalesProspectMapBatch;
}) {
  const summary = {
    processed: 0,
    created: 0,
    linkedExisting: 0,
    needsReview: 0,
    activityLinked: 0,
    errors: 0,
    results: [] as Array<Record<string, unknown>>,
  };
  const exactProspectEvidence = await loadExactProspectEvidence(params.pool, params.userId);

  for (const candidate of params.payload.candidates) {
    try {
      const activityReference = await findActivityReference({
        pool: params.pool,
        userId: params.userId,
        candidate,
      });
      const exactMatches = findExactProspectMatches({
        prospects: exactProspectEvidence,
        candidate,
      });

      let action: MappingAction;
      let prospectId: string | null = activityReference?.prospect_id || null;
      let matchReason = prospectId ? 'existing_sales_activity_prospect' : null;

      if (!prospectId && exactMatches.length === 1) {
        prospectId = exactMatches[0];
        matchReason = 'exact_existing_prospect';
      }

      if (!prospectId && exactMatches.length > 1) {
        await queueForReview({
          pool: params.pool,
          userId: params.userId,
          candidate,
          source: params.payload.source,
          runId: params.payload.runId,
          reason: 'multiple_exact_prospect_matches',
        });
        action = 'needs_review';
      } else if (!prospectId) {
        const resolution = await resolveMarketEntitiesForUser({
          pool: params.pool,
          userId: params.userId,
          input: {
            address: candidate.address,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            placeId: candidate.placeId,
            phone: candidate.contactPhone,
            email: candidate.contactEmail,
            websiteUrl: candidate.websiteUrl,
            businessName: candidate.company,
          },
        });
        const resolvedProspect = resolution.decision === 'link_existing'
          && resolution.topCandidate?.entityType === 'prospect'
          ? resolution.topCandidate
          : null;

        if (resolvedProspect) {
          prospectId = resolvedProspect.id;
          matchReason = 'entity_resolution_existing_prospect';
          action = 'linked_existing';
        } else if (resolution.decision === 'create_new' && candidate.confidence >= 85) {
          const prospect = await params.storage.createProspect({
            userId: params.userId,
            name: candidate.company,
            status: 'prospect',
            notes: candidate.notes || 'Mapped from a verified Codex sales follow-up.',
            geometry: { type: 'Point', coordinates: [candidate.longitude, candidate.latitude] },
            followUpDueDate: null,
            contactName: candidate.contactName || undefined,
            contactEmail: candidate.contactEmail || undefined,
            contactPhone: candidate.contactPhone || undefined,
            contactCompany: candidate.company,
            businessName: candidate.company,
            websiteUrl: candidate.websiteUrl || null,
            address: candidate.address,
            locationLat: candidate.latitude,
            locationLng: candidate.longitude,
            marketKey: candidate.placeId ? `google-place:${candidate.placeId}` : null,
            marketConfidence: candidate.confidence,
            marketContextSource: params.payload.source,
            marketContextStatus: 'verified',
            aiMetadata: {
              salesProspectMapping: {
                externalActivityId: candidate.externalActivityId,
                addressSource: candidate.addressSource,
                confidence: candidate.confidence,
                evidenceUrl: candidate.evidenceUrl || null,
                verifiedAt: candidate.observedAt || new Date().toISOString(),
              },
              ...(candidate.placeId || candidate.googleMapsUrl ? {
                googlePlace: {
                  ...(candidate.placeId ? { placeId: candidate.placeId } : {}),
                  ...(candidate.googleMapsUrl ? { googleMapsUrl: candidate.googleMapsUrl } : {}),
                },
              } : {}),
            },
          });
          prospectId = prospect.id;
          exactProspectEvidence.push({
            id: prospect.id,
            address: candidate.address,
            contactEmail: candidate.contactEmail || null,
            marketKey: candidate.placeId ? `google-place:${candidate.placeId}` : null,
          });
          matchReason = 'verified_new_sales_prospect';
          action = 'created';
        } else {
          await queueForReview({
            pool: params.pool,
            userId: params.userId,
            candidate,
            source: params.payload.source,
            runId: params.payload.runId,
            reason: resolution.decision === 'create_new' ? 'confidence_below_auto_create_threshold' : 'ambiguous_entity_resolution',
          });
          action = 'needs_review';
        }
      } else {
        action = 'linked_existing';
      }

      if (action === 'needs_review' || !prospectId) {
        summary.needsReview += 1;
        summary.processed += 1;
        summary.results.push({
          externalActivityId: candidate.externalActivityId,
          action: 'needs_review',
          prospectId: null,
        });
        continue;
      }

      await enrichExistingProspect({
        pool: params.pool,
        userId: params.userId,
        prospectId,
        candidate,
        source: params.payload.source,
      });
      const activityLink = await linkSalesActivityReference({
        pool: params.pool,
        storage: params.storage,
        userId: params.userId,
        externalActivityId: candidate.externalActivityId,
        activitySource: candidate.activitySource,
        prospectId,
      });

      summary.processed += 1;
      if (action === 'created') summary.created += 1;
      else summary.linkedExisting += 1;
      if (activityLink.linked) summary.activityLinked += 1;
      summary.results.push({
        externalActivityId: candidate.externalActivityId,
        action,
        prospectId,
        matchReason,
        activityLinked: activityLink.linked,
      });
    } catch (error) {
      summary.processed += 1;
      summary.errors += 1;
      summary.results.push({
        externalActivityId: candidate.externalActivityId,
        action: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
