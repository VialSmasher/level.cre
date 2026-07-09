import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { z } from 'zod';

import {
  buildSalesActivityInteractionNotes,
  decideSalesActivityMatch,
  normalizeSalesActivityInput,
  shouldCreateInteractionFromSalesActivity,
  type NormalizedSalesActivity,
} from './salesActivityImport';

type ContactInteractionStorage = {
  createContactInteraction(interaction: any, options?: any): Promise<{ id: string }>;
};

export const SalesActivityBatchSchema = z.object({
  source: z.string().trim().min(1).max(80).optional(),
  runId: z.string().trim().max(120).nullable().optional(),
  createInteractions: z.boolean().optional().default(true),
  activities: z.array(z.record(z.unknown())).min(1).max(500),
});

export type SalesActivityBatchInput = z.infer<typeof SalesActivityBatchSchema>;

export type SalesActivityImportResult = {
  importId?: string;
  externalActivityId?: string;
  status?: string;
  email?: string | null;
  prospectId?: string | null;
  matchStatus?: string;
  matchReason?: string;
  interactionId?: string | null;
  duplicate?: boolean;
  error?: string;
};

export type SalesActivityImportSummary = {
  imported: number;
  createdInteractions: number;
  matched: number;
  needsReview: number;
  ignored: number;
  duplicates: number;
  errors: number;
  results: SalesActivityImportResult[];
};

async function resolveSalesActivityProspect(
  pool: Pool,
  userId: string,
  activity: NormalizedSalesActivity,
): Promise<{ prospectId: string | null; matchReason: string | null }> {
  if (activity.prospectId) {
    const provided = await pool.query(
      `SELECT id FROM public.prospects WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [activity.prospectId, userId],
    );
    if (provided.rows[0]) {
      return { prospectId: provided.rows[0].id, matchReason: 'provided_prospect_id' };
    }
    return { prospectId: null, matchReason: 'provided_prospect_id_not_found' };
  }

  if (activity.email) {
    const byEmail = await pool.query(
      `
        SELECT id
        FROM public.prospects
        WHERE user_id = $1
          AND contact_email IS NOT NULL
          AND lower(contact_email) = lower($2)
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
      `,
      [userId, activity.email],
    );
    if (byEmail.rows[0]) {
      return { prospectId: byEmail.rows[0].id, matchReason: 'exact_contact_email' };
    }
  }

  return { prospectId: null, matchReason: null };
}

async function upsertSalesActivityImport(
  pool: Pool,
  userId: string,
  activity: NormalizedSalesActivity,
  match: { matchStatus: string; matchReason: string; confidence: number },
  prospectId: string | null,
  interactionId: string | null,
): Promise<{
  row: { id: string; interaction_id: string | null; match_status: string; prospect_id: string | null };
  existing: { id: string; interaction_id: string | null } | null;
}> {
  const existing = await pool.query(
    `
      SELECT id, interaction_id
      FROM public.sales_activity_imports
      WHERE user_id = $1 AND source = $2 AND external_activity_id = $3
      LIMIT 1
    `,
    [userId, activity.source, activity.externalActivityId],
  );
  const existingRow = existing.rows[0] || null;
  const result = await pool.query(
    `
      INSERT INTO public.sales_activity_imports (
        id,
        user_id,
        source,
        run_id,
        external_activity_id,
        activity_status,
        activity_type,
        contact_name,
        company,
        email,
        email_domain,
        subject,
        notes,
        activity_at,
        prospect_id,
        listing_id,
        match_status,
        match_reason,
        confidence,
        interaction_id,
        raw_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb
      )
      ON CONFLICT (user_id, source, external_activity_id)
      DO UPDATE SET
        run_id = EXCLUDED.run_id,
        activity_status = EXCLUDED.activity_status,
        activity_type = EXCLUDED.activity_type,
        contact_name = EXCLUDED.contact_name,
        company = EXCLUDED.company,
        email = EXCLUDED.email,
        email_domain = EXCLUDED.email_domain,
        subject = EXCLUDED.subject,
        notes = EXCLUDED.notes,
        activity_at = EXCLUDED.activity_at,
        prospect_id = COALESCE(public.sales_activity_imports.prospect_id, EXCLUDED.prospect_id),
        listing_id = COALESCE(public.sales_activity_imports.listing_id, EXCLUDED.listing_id),
        match_status = CASE
          WHEN public.sales_activity_imports.interaction_id IS NOT NULL THEN public.sales_activity_imports.match_status
          ELSE EXCLUDED.match_status
        END,
        match_reason = CASE
          WHEN public.sales_activity_imports.interaction_id IS NOT NULL THEN public.sales_activity_imports.match_reason
          ELSE EXCLUDED.match_reason
        END,
        confidence = GREATEST(public.sales_activity_imports.confidence, EXCLUDED.confidence),
        interaction_id = COALESCE(public.sales_activity_imports.interaction_id, EXCLUDED.interaction_id),
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
      RETURNING id, interaction_id, match_status, prospect_id
    `,
    [
      existingRow?.id || randomUUID(),
      userId,
      activity.source,
      activity.runId,
      activity.externalActivityId,
      activity.activityStatus,
      activity.activityType,
      activity.contactName,
      activity.company,
      activity.email,
      activity.emailDomain,
      activity.subject,
      activity.notes,
      activity.activityAt,
      prospectId,
      activity.listingId,
      match.matchStatus,
      match.matchReason,
      match.confidence,
      interactionId,
      JSON.stringify(activity.rawPayload),
    ],
  );
  return { row: result.rows[0], existing: existingRow };
}

export async function importSalesActivityBatch(params: {
  pool: Pool;
  storage: ContactInteractionStorage;
  userId: string;
  payload: SalesActivityBatchInput;
  requireEditAccess?: (listingId: string) => Promise<unknown>;
}): Promise<SalesActivityImportSummary> {
  const summary: SalesActivityImportSummary = {
    imported: 0,
    createdInteractions: 0,
    matched: 0,
    needsReview: 0,
    ignored: 0,
    duplicates: 0,
    errors: 0,
    results: [],
  };

  for (const rawActivity of params.payload.activities) {
    try {
      const activity = normalizeSalesActivityInput(rawActivity, {
        source: params.payload.source,
        runId: params.payload.runId,
      });
      if (activity.listingId && params.requireEditAccess) {
        await params.requireEditAccess(activity.listingId);
      }

      const resolved = await resolveSalesActivityProspect(params.pool, params.userId, activity);
      const match = decideSalesActivityMatch(activity, resolved.prospectId, resolved.matchReason);
      const { row: importRow, existing } = await upsertSalesActivityImport(
        params.pool,
        params.userId,
        activity,
        match,
        resolved.prospectId,
        null,
      );
      summary.imported += 1;
      if (existing) summary.duplicates += 1;

      let interactionId: string | null = importRow.interaction_id || existing?.interaction_id || null;
      let duplicateInteraction = Boolean(interactionId);
      if (
        params.payload.createInteractions
        && shouldCreateInteractionFromSalesActivity(activity)
        && resolved.prospectId
      ) {
        const existingInteraction = await params.pool.query(
          `
            SELECT id
            FROM public.contact_interactions
            WHERE user_id = $1
              AND source_provider = $2
              AND source_message_id = $3
              AND prospect_id = $4
            LIMIT 1
          `,
          [params.userId, 'codex', activity.externalActivityId, resolved.prospectId],
        );

        if (existingInteraction.rows[0]) {
          interactionId = existingInteraction.rows[0].id;
          duplicateInteraction = true;
        } else if (!interactionId) {
          const interactionDate = (activity.activityAt || new Date()).toISOString();
          const interaction = await params.storage.createContactInteraction({
            userId: params.userId,
            prospectId: resolved.prospectId,
            listingId: activity.listingId,
            date: interactionDate,
            type: activity.activityType,
            outcome: 'contacted',
            notes: buildSalesActivityInteractionNotes(activity),
            nextFollowUp: null,
            sourceProvider: 'codex',
            sourceMessageId: activity.externalActivityId,
            sourceThreadId: null,
            sourceEmailMessageId: null,
            sourceMetadata: {
              source: activity.source,
              runId: activity.runId,
              importId: importRow.id,
              subject: activity.subject,
              email: activity.email,
              company: activity.company,
              contactName: activity.contactName,
            },
          });
          interactionId = interaction.id;
          summary.createdInteractions += 1;
        }

        if (interactionId) {
          await params.pool.query(
            `
              UPDATE public.sales_activity_imports
              SET interaction_id = $4,
                  prospect_id = $3,
                  match_status = 'matched',
                  match_reason = COALESCE(match_reason, $5),
                  confidence = GREATEST(confidence, $6),
                  updated_at = now()
              WHERE id = $1 AND user_id = $2
            `,
            [importRow.id, params.userId, resolved.prospectId, interactionId, resolved.matchReason, match.confidence],
          );
        }

        if (!duplicateInteraction) {
          const interactionDate = (activity.activityAt || new Date()).toISOString();
          await params.pool.query(
            `
              UPDATE public.prospects
              SET
                last_contact_date = $3,
                status = CASE WHEN status = 'prospect' THEN 'contacted' ELSE status END,
                updated_at = now()
              WHERE id = $1 AND user_id = $2
            `,
            [resolved.prospectId, params.userId, interactionDate],
          );
        }
      }

      const finalMatchStatus = interactionId ? 'matched' : importRow.match_status;
      const effectiveProspectId = resolved.prospectId || importRow.prospect_id || null;
      if (finalMatchStatus === 'matched') summary.matched += 1;
      if (finalMatchStatus === 'needs_review') summary.needsReview += 1;
      if (finalMatchStatus === 'ignored') summary.ignored += 1;

      summary.results.push({
        importId: importRow.id,
        externalActivityId: activity.externalActivityId,
        status: activity.activityStatus,
        email: activity.email,
        prospectId: effectiveProspectId,
        matchStatus: finalMatchStatus,
        matchReason: interactionId ? (resolved.matchReason || match.matchReason) : match.matchReason,
        interactionId,
        duplicate: Boolean(existing || duplicateInteraction),
      });
    } catch (error: any) {
      summary.errors += 1;
      summary.results.push({
        error: error?.message || 'Failed to import sales activity',
      });
    }
  }

  return summary;
}

export async function listSalesActivityImports(params: {
  pool: Pool;
  userId: string;
  limit: number;
  matchStatus?: string;
  source?: string;
}): Promise<unknown[]> {
  const queryParams: any[] = [params.userId];
  const filters = ['user_id = $1'];
  if (params.matchStatus) {
    queryParams.push(params.matchStatus);
    filters.push(`match_status = $${queryParams.length}`);
  }
  if (params.source) {
    queryParams.push(params.source);
    filters.push(`source = $${queryParams.length}`);
  }
  queryParams.push(params.limit);
  const { rows } = await params.pool.query(
    `
      SELECT
        id,
        source,
        run_id,
        external_activity_id,
        activity_status,
        activity_type,
        contact_name,
        company,
        email,
        subject,
        activity_at,
        prospect_id,
        listing_id,
        match_status,
        match_reason,
        confidence,
        interaction_id,
        created_at,
        updated_at
      FROM public.sales_activity_imports
      WHERE ${filters.join(' AND ')}
      ORDER BY COALESCE(activity_at, created_at) DESC, created_at DESC
      LIMIT $${queryParams.length}
    `,
    queryParams,
  );
  return rows;
}
