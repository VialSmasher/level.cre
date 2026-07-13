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

export const SalesActivityReviewActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('link'),
    prospectId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('ignore'),
  }),
]);

export type SalesActivityBatchInput = z.infer<typeof SalesActivityBatchSchema>;
export type SalesActivityReviewAction = z.infer<typeof SalesActivityReviewActionSchema>;

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

export class SalesActivityReviewError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SalesActivityReviewError';
    this.status = status;
  }
}

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
  hasCapturedEmailEvidence?: (activity: NormalizedSalesActivity) => Promise<boolean>;
  findCapturedEmailInteraction?: (activity: NormalizedSalesActivity) => Promise<{
    interactionId: string;
    prospectId: string;
  } | null>;
  reconcileEmailEvidence?: (activity: NormalizedSalesActivity) => Promise<number>;
  recordActivityEvent?: (input: {
    activity: NormalizedSalesActivity;
    importId: string;
    prospectId: string | null;
    listingId: string | null;
    interactionId: string | null;
    matchStatus: string;
    matchReason: string | null;
    confidence: number;
  }) => Promise<unknown>;
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

      let resolved = await resolveSalesActivityProspect(params.pool, params.userId, activity);
      let capturedEmailInteraction: { interactionId: string; prospectId: string } | null = null;
      if (params.findCapturedEmailInteraction && shouldCreateInteractionFromSalesActivity(activity)) {
        try {
          capturedEmailInteraction = await params.findCapturedEmailInteraction(activity);
        } catch (error) {
          console.warn('Failed to find a matching captured email interaction:', error);
        }
      }
      const capturedProspectConflict = Boolean(
        capturedEmailInteraction
        && resolved.prospectId
        && resolved.prospectId !== capturedEmailInteraction.prospectId,
      );
      if (capturedEmailInteraction && !capturedProspectConflict) {
        resolved = {
          prospectId: capturedEmailInteraction.prospectId,
          matchReason: 'matching_captured_email_interaction',
        };
      }
      const match = capturedProspectConflict
        ? {
            matchStatus: 'needs_review',
            matchReason: 'conflicting_captured_email_prospect',
            confidence: 50,
          }
        : decideSalesActivityMatch(activity, resolved.prospectId, resolved.matchReason);
      const { row: importRow, existing } = await upsertSalesActivityImport(
        params.pool,
        params.userId,
        activity,
        match,
        resolved.prospectId,
        capturedProspectConflict ? null : capturedEmailInteraction?.interactionId || null,
      );
      summary.imported += 1;
      if (existing) summary.duplicates += 1;
      if (!existing && capturedEmailInteraction && !capturedProspectConflict) summary.duplicates += 1;

      let interactionId: string | null = importRow.interaction_id || existing?.interaction_id || null;
      let duplicateInteraction = Boolean(interactionId);
      if (
        params.payload.createInteractions
        && shouldCreateInteractionFromSalesActivity(activity)
        && resolved.prospectId
        && !capturedProspectConflict
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
          let capturedEmailAlreadyAwardedXp = false;
          if (params.hasCapturedEmailEvidence) {
            try {
              capturedEmailAlreadyAwardedXp = await params.hasCapturedEmailEvidence(activity);
            } catch (error) {
              console.warn('Failed to check captured email evidence before creating interaction:', error);
            }
          }
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
          }, capturedEmailAlreadyAwardedXp ? { skipXp: true } : undefined);
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

      if (params.reconcileEmailEvidence) {
        try {
          await params.reconcileEmailEvidence(activity);
        } catch (error) {
          console.warn('Failed to reconcile Codex activity with captured email evidence:', error);
        }
      }

      if (params.recordActivityEvent) {
        try {
          await params.recordActivityEvent({
            activity,
            importId: importRow.id,
            prospectId: effectiveProspectId,
            listingId: activity.listingId,
            interactionId,
            matchStatus: finalMatchStatus,
            matchReason: interactionId ? (resolved.matchReason || match.matchReason) : match.matchReason,
            confidence: match.confidence,
          });
        } catch (error) {
          // Keep the legacy recorder available during rollout; the canonical event
          // endpoint can safely replay the same provider identity later.
          console.warn('Failed to dual-write canonical activity event:', error);
        }
      }

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

export async function reviewSalesActivityImport(params: {
  pool: Pool;
  storage: ContactInteractionStorage;
  userId: string;
  importId: string;
  decision: SalesActivityReviewAction;
}): Promise<Record<string, unknown>> {
  const importResult = await params.pool.query(
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
        notes,
        activity_at,
        prospect_id,
        listing_id,
        match_status,
        interaction_id
      FROM public.sales_activity_imports
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [params.importId, params.userId],
  );
  const row = importResult.rows[0];
  if (!row) {
    throw new SalesActivityReviewError(404, 'Sales activity import not found');
  }

  if (params.decision.action === 'ignore') {
    if (row.interaction_id) {
      throw new SalesActivityReviewError(409, 'Logged activity cannot be ignored');
    }
    const ignored = await params.pool.query(
      `
        UPDATE public.sales_activity_imports
        SET match_status = 'ignored',
            match_reason = 'manually_ignored',
            confidence = 100,
            updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, match_status, match_reason, prospect_id, interaction_id, updated_at
      `,
      [params.importId, params.userId],
    );
    return ignored.rows[0];
  }

  const prospectResult = await params.pool.query(
    `
      SELECT id, status
      FROM public.prospects
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [params.decision.prospectId, params.userId],
  );
  const prospect = prospectResult.rows[0];
  if (!prospect) {
    throw new SalesActivityReviewError(404, 'Prospect not found');
  }

  if (row.interaction_id && row.prospect_id !== prospect.id) {
    throw new SalesActivityReviewError(409, 'Activity is already logged to another prospect');
  }

  const existingInteraction = await params.pool.query(
    `
      SELECT id
      FROM public.contact_interactions
      WHERE user_id = $1
        AND source_provider = 'codex'
        AND source_message_id = $2
        AND prospect_id = $3
      LIMIT 1
    `,
    [params.userId, row.external_activity_id, prospect.id],
  );

  let interactionId = row.interaction_id || existingInteraction.rows[0]?.id || null;
  if (!interactionId) {
    if (row.activity_status !== 'sent') {
      throw new SalesActivityReviewError(409, 'Only sent activity can be logged as an interaction');
    }
    const interactionDate = row.activity_at
      ? new Date(row.activity_at).toISOString()
      : new Date().toISOString();
    const context = [row.contact_name, row.company, row.email].filter(Boolean).join(' | ');
    const noteParts = [
      row.subject ? `Subject: ${row.subject}` : null,
      row.notes || null,
      context ? `Codex activity: ${context}` : null,
    ].filter(Boolean);
    const interaction = await params.storage.createContactInteraction({
      userId: params.userId,
      prospectId: prospect.id,
      listingId: row.listing_id,
      date: interactionDate,
      type: row.activity_type || 'email',
      outcome: 'contacted',
      notes: noteParts.join('\n'),
      nextFollowUp: null,
      sourceProvider: 'codex',
      sourceMessageId: row.external_activity_id,
      sourceThreadId: null,
      sourceEmailMessageId: null,
      sourceMetadata: {
        source: row.source,
        runId: row.run_id,
        importId: row.id,
        subject: row.subject,
        email: row.email,
        company: row.company,
        contactName: row.contact_name,
        manuallyLinked: true,
      },
    }, { skipXp: true });
    interactionId = interaction.id;

    await params.pool.query(
      `
        UPDATE public.prospects
        SET last_contact_date = $3,
            status = CASE WHEN status = 'prospect' THEN 'contacted' ELSE status END,
            updated_at = now()
        WHERE id = $1 AND user_id = $2
      `,
      [prospect.id, params.userId, interactionDate],
    );
  }

  const linked = await params.pool.query(
    `
      UPDATE public.sales_activity_imports
      SET prospect_id = $3,
          interaction_id = $4,
          match_status = 'matched',
          match_reason = 'manual_prospect_link',
          confidence = 100,
          updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id, match_status, match_reason, prospect_id, interaction_id, updated_at
    `,
    [params.importId, params.userId, prospect.id, interactionId],
  );

  return linked.rows[0];
}
