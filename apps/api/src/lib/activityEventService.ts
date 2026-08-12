import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import type { NormalizedSalesActivity } from './salesActivityImport';
import { ProspectReferenceError, requireActiveOwnedProspect } from './prospectReferenceService';

export const ACTIVITY_EVENT_TYPES = [
  'email_sent',
  'email_received',
  'call_attempted',
  'call_connected',
  'meeting',
  'tour',
  'follow_up',
  'property_observation',
  'title_pulled',
  'owner_identified',
  'requirement_discovered',
  'market_record_proposed',
  'opportunity_promotion_proposed',
  'proposal_sent',
  'offer_sent',
  'offer_received',
  'negotiation_started',
  'stage_changed',
  'note',
  'opportunity_won',
  'opportunity_lost',
  'opportunity_stalled',
  'opportunity_revived',
] as const;

export const ActivityEvidenceStatusSchema = z.enum(['observed', 'inferred', 'confirmed']);
export const ActivityMatchStatusSchema = z.enum(['matched', 'needs_review', 'unassigned', 'ignored']);

const forbiddenMetadataKeys = new Set(['body', 'bodytext', 'bodyhtml', 'rawbody', 'messagebody', 'htmlbody']);

function containsForbiddenBodyField(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 8) return false;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenBodyField(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => (
    forbiddenMetadataKeys.has(key.toLowerCase().replace(/[^a-z]/g, ''))
    || containsForbiddenBodyField(nested, depth + 1)
  ));
}

const ActivitySourceMetadataSchema = z.record(z.unknown()).superRefine((value, context) => {
  if (containsForbiddenBodyField(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Full message bodies are not allowed in activity metadata' });
  }
  if (JSON.stringify(value).length > 20000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Activity metadata is too large' });
  }
});

const DateInputSchema = z.union([z.string().trim().min(1), z.date()]).transform((value, context) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid activity date' });
    return z.NEVER;
  }
  return date;
});

export const ActivityEventLinkInputSchema = z.object({
  entityType: z.enum(['prospect', 'listing', 'opportunity', 'company', 'contact', 'property', 'requirement']),
  entityId: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(80).optional().default('related'),
  confidence: z.number().int().min(0).max(100).optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const ActivityEventInputSchema = z.object({
  source: z.string().trim().min(1).max(80).optional(),
  externalEventId: z.string().trim().min(1).max(240),
  eventType: z.enum(ACTIVITY_EVENT_TYPES),
  direction: z.enum(['inbound', 'outbound', 'internal']).nullable().optional(),
  evidenceStatus: ActivityEvidenceStatusSchema.optional().default('observed'),
  occurredAt: DateInputSchema,
  contactName: z.string().trim().max(240).nullable().optional(),
  company: z.string().trim().max(240).nullable().optional(),
  email: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  subject: z.string().trim().max(1000).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  propertyAddress: z.string().trim().max(1000).nullable().optional(),
  confidence: z.number().int().min(0).max(100).optional().default(0),
  matchStatus: ActivityMatchStatusSchema.optional().default('unassigned'),
  matchReason: z.string().trim().max(1000).nullable().optional(),
  prospectId: z.string().trim().min(1).nullable().optional(),
  listingId: z.string().trim().min(1).nullable().optional(),
  opportunityId: z.string().trim().min(1).nullable().optional(),
  interactionId: z.string().trim().min(1).nullable().optional(),
  evidenceUrl: z.string().trim().url().max(2000).nullable().optional(),
  sourceMetadata: ActivitySourceMetadataSchema.optional().default({}),
  links: z.array(ActivityEventLinkInputSchema).max(50).optional().default([]),
});

export const ActivityEventBatchSchema = z.object({
  source: z.string().trim().min(1).max(80).optional(),
  events: z.array(ActivityEventInputSchema).min(1).max(500),
});

export const ActivityEventReviewSchema = z.object({
  action: z.enum(['link', 'ignore']),
  prospectId: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (value.action === 'link' && !value.prospectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['prospectId'], message: 'prospectId is required when linking evidence' });
  }
});

export type ActivityEventInput = z.infer<typeof ActivityEventInputSchema>;
export type ActivityEventBatchInput = z.infer<typeof ActivityEventBatchSchema>;

export type ActivityEventImportResult = {
  eventId?: string;
  externalEventId?: string;
  inserted?: boolean;
  error?: string;
  code?: string;
  canonicalProspectId?: string;
};

export type ActivityEventImportSummary = {
  imported: number;
  inserted: number;
  duplicates: number;
  errors: number;
  results: ActivityEventImportResult[];
};

async function assertOwnedReference(
  db: Pick<Pool | PoolClient, 'query'>,
  userId: string,
  table: 'listings' | 'opportunities' | 'contact_interactions',
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const { rows } = await db.query(
    `SELECT id FROM public.${table} WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId],
  );
  if (!rows[0]) throw new Error(`Referenced ${table} record was not found`);
  return rows[0].id;
}

async function upsertActivityEvent(params: {
  pool: Pool;
  userId: string;
  defaultSource?: string;
  event: ActivityEventInput;
}): Promise<{ id: string; inserted: boolean }> {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await upsertActivityEventInTransaction({ ...params, client });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertActivityEventInTransaction(params: {
  client: PoolClient;
  userId: string;
  defaultSource?: string;
  event: ActivityEventInput;
}): Promise<{ id: string; inserted: boolean }> {
  const source = params.event.source || params.defaultSource || 'codex';
  const prospectIds = Array.from(new Set([
    params.event.prospectId,
    ...(params.event.links || [])
      .filter((link) => link.entityType === 'prospect')
      .map((link) => link.entityId),
  ].filter((id): id is string => Boolean(id)))).sort();
  for (const prospectId of prospectIds) {
    await requireActiveOwnedProspect({
      db: params.client,
      userId: params.userId,
      prospectId,
      lock: true,
    });
  }
  const prospectId = params.event.prospectId || null;
  const [listingId, opportunityId, interactionId] = await Promise.all([
    assertOwnedReference(params.client, params.userId, 'listings', params.event.listingId),
    assertOwnedReference(params.client, params.userId, 'opportunities', params.event.opportunityId),
    assertOwnedReference(params.client, params.userId, 'contact_interactions', params.event.interactionId),
  ]);
  const { rows } = await params.client.query(
    `
      INSERT INTO public.activity_events (
        id, user_id, source, external_event_id, event_type, direction,
        evidence_status, occurred_at, contact_name, company, email, phone,
        subject, summary, property_address, confidence, match_status,
        match_reason, prospect_id, listing_id, opportunity_id, interaction_id,
        evidence_url, source_metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb
      )
      ON CONFLICT (user_id, source, external_event_id)
      DO UPDATE SET
        event_type = EXCLUDED.event_type,
        direction = COALESCE(EXCLUDED.direction, public.activity_events.direction),
        evidence_status = CASE
          WHEN public.activity_events.evidence_status = 'confirmed' THEN 'confirmed'
          WHEN EXCLUDED.evidence_status = 'confirmed' THEN 'confirmed'
          WHEN public.activity_events.evidence_status = 'observed' THEN 'observed'
          ELSE EXCLUDED.evidence_status
        END,
        occurred_at = EXCLUDED.occurred_at,
        contact_name = COALESCE(EXCLUDED.contact_name, public.activity_events.contact_name),
        company = COALESCE(EXCLUDED.company, public.activity_events.company),
        email = COALESCE(EXCLUDED.email, public.activity_events.email),
        phone = COALESCE(EXCLUDED.phone, public.activity_events.phone),
        subject = COALESCE(EXCLUDED.subject, public.activity_events.subject),
        summary = COALESCE(EXCLUDED.summary, public.activity_events.summary),
        property_address = COALESCE(EXCLUDED.property_address, public.activity_events.property_address),
        confidence = GREATEST(public.activity_events.confidence, EXCLUDED.confidence),
        match_status = CASE
          WHEN public.activity_events.match_status IN ('matched', 'ignored') THEN public.activity_events.match_status
          WHEN EXCLUDED.match_status = 'matched' THEN 'matched'
          ELSE EXCLUDED.match_status
        END,
        match_reason = COALESCE(EXCLUDED.match_reason, public.activity_events.match_reason),
        prospect_id = COALESCE(public.activity_events.prospect_id, EXCLUDED.prospect_id),
        listing_id = COALESCE(public.activity_events.listing_id, EXCLUDED.listing_id),
        opportunity_id = COALESCE(public.activity_events.opportunity_id, EXCLUDED.opportunity_id),
        interaction_id = COALESCE(public.activity_events.interaction_id, EXCLUDED.interaction_id),
        evidence_url = COALESCE(EXCLUDED.evidence_url, public.activity_events.evidence_url),
        source_metadata = COALESCE(public.activity_events.source_metadata, '{}'::jsonb) || EXCLUDED.source_metadata,
        updated_at = now()
      RETURNING id, (xmax = 0) AS inserted
    `,
    [
      randomUUID(),
      params.userId,
      source,
      params.event.externalEventId,
      params.event.eventType,
      params.event.direction || null,
      params.event.evidenceStatus,
      params.event.occurredAt,
      params.event.contactName || null,
      params.event.company || null,
      params.event.email || null,
      params.event.phone || null,
      params.event.subject || null,
      params.event.summary || null,
      params.event.propertyAddress || null,
      params.event.confidence,
      params.event.matchStatus,
      params.event.matchReason || null,
      prospectId,
      listingId,
      opportunityId,
      interactionId,
      params.event.evidenceUrl || null,
      JSON.stringify(params.event.sourceMetadata || {}),
    ],
  );
  const row = rows[0];

  for (const link of params.event.links || []) {
    await params.client.query(
      `
        INSERT INTO public.activity_event_links (
          id, user_id, event_id, entity_type, entity_id, role, confidence, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (event_id, entity_type, entity_id, role)
        DO UPDATE SET
          confidence = GREATEST(public.activity_event_links.confidence, EXCLUDED.confidence),
          metadata = COALESCE(public.activity_event_links.metadata, '{}'::jsonb) || EXCLUDED.metadata
      `,
      [randomUUID(), params.userId, row.id, link.entityType, link.entityId, link.role, link.confidence, JSON.stringify(link.metadata)],
    );
  }

  return { id: row.id, inserted: row.inserted === true || row.inserted === 'true' };
}

export async function importActivityEventBatch(params: {
  pool: Pool;
  userId: string;
  payload: ActivityEventBatchInput;
}): Promise<ActivityEventImportSummary> {
  const summary: ActivityEventImportSummary = {
    imported: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
    results: [],
  };

  for (const event of params.payload.events) {
    try {
      const result = await upsertActivityEvent({
        pool: params.pool,
        userId: params.userId,
        defaultSource: params.payload.source,
        event,
      });
      summary.imported += 1;
      if (result.inserted) summary.inserted += 1;
      else summary.duplicates += 1;
      summary.results.push({ eventId: result.id, externalEventId: event.externalEventId, inserted: result.inserted });
    } catch (error: any) {
      summary.errors += 1;
      summary.results.push({
        externalEventId: event.externalEventId,
        error: error?.message || 'Failed to import activity event',
        ...(error instanceof ProspectReferenceError ? {
          code: error.code,
          ...(error.canonicalProspectId ? { canonicalProspectId: error.canonicalProspectId } : {}),
        } : {}),
      });
    }
  }

  return summary;
}

function eventTypeFromSalesActivity(activity: NormalizedSalesActivity): typeof ACTIVITY_EVENT_TYPES[number] {
  if (activity.activityStatus === 'received' && activity.activityType === 'email') return 'email_received';
  if (activity.activityType === 'call') return 'call_attempted';
  if (activity.activityType === 'meeting') return 'meeting';
  if (activity.activityType === 'note') return 'note';
  return 'email_sent';
}

export async function recordActivityEventFromSalesActivity(params: {
  pool: Pool;
  userId: string;
  activity: NormalizedSalesActivity;
  importId: string;
  prospectId: string | null;
  listingId: string | null;
  interactionId: string | null;
  matchStatus: string;
  matchReason: string | null;
  confidence: number;
}): Promise<ActivityEventImportSummary | null> {
  if (
    params.activity.activityStatus !== 'sent'
    && !(params.activity.activityStatus === 'received' && params.activity.activityType === 'email')
  ) return null;
  return importActivityEventBatch({
    pool: params.pool,
    userId: params.userId,
    payload: ActivityEventBatchSchema.parse({
      source: params.activity.source,
      events: [{
        externalEventId: params.activity.externalActivityId,
        eventType: eventTypeFromSalesActivity(params.activity),
        direction: params.activity.direction,
        evidenceStatus: 'confirmed',
        occurredAt: params.activity.activityAt || new Date(),
        contactName: params.activity.contactName,
        company: params.activity.company,
        email: params.activity.email,
        subject: params.activity.subject,
        summary: params.activity.notes,
        propertyAddress: params.activity.propertyAddress,
        confidence: params.confidence,
        matchStatus: params.matchStatus === 'matched' ? 'matched' : 'needs_review',
        matchReason: params.matchReason,
        prospectId: params.prospectId,
        listingId: params.listingId,
        interactionId: params.interactionId,
        sourceMetadata: {
          salesActivityImportId: params.importId,
          runId: params.activity.runId,
          activityStatus: params.activity.activityStatus,
          direction: params.activity.direction,
          captureDirection: params.activity.activityStatus === 'received' ? 'received' : 'sent',
          ...(params.activity.propertyAddress ? {
            mapLocation: {
              address: params.activity.propertyAddress,
              latitude: params.activity.latitude,
              longitude: params.activity.longitude,
              placeId: params.activity.placeId,
              websiteUrl: params.activity.websiteUrl,
              addressSource: params.activity.addressSource,
              addressConfidence: params.activity.addressConfidence,
              addressVerified: params.activity.addressVerified,
            },
          } : {}),
        },
      }],
    }),
  });
}

export async function listActivityEvents(params: {
  pool: Pool;
  userId: string;
  limit: number;
  eventType?: string;
  matchStatus?: string;
  opportunityId?: string;
  source?: string;
}): Promise<unknown[]> {
  const values: unknown[] = [params.userId];
  const filters = ['event.user_id = $1'];
  const addFilter = (column: string, value: string | undefined) => {
    if (!value) return;
    values.push(value);
    filters.push(`${column} = $${values.length}`);
  };
  addFilter('event.event_type', params.eventType);
  addFilter('event.match_status', params.matchStatus);
  addFilter('event.opportunity_id', params.opportunityId);
  addFilter('event.source', params.source);
  values.push(params.limit);
  const { rows } = await params.pool.query(
    `
      SELECT
        event.id,
        event.source,
        event.external_event_id,
        event.event_type,
        event.direction,
        event.evidence_status,
        event.occurred_at,
        event.contact_name,
        event.company,
        event.email,
        event.phone,
        event.subject,
        event.summary,
        event.property_address,
        event.confidence,
        event.match_status,
        event.match_reason,
        event.prospect_id,
        event.listing_id,
        event.opportunity_id,
        event.interaction_id,
        event.evidence_url,
        event.source_metadata,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'entityType', link.entity_type,
              'entityId', link.entity_id,
              'role', link.role,
              'confidence', link.confidence
            )
          ) FILTER (WHERE link.id IS NOT NULL),
          '[]'::jsonb
        ) AS links
      FROM public.activity_events event
      LEFT JOIN public.activity_event_links link ON link.event_id = event.id
      WHERE ${filters.join(' AND ')}
      GROUP BY event.id
      ORDER BY event.occurred_at DESC
      LIMIT $${values.length}
    `,
    values,
  );
  return rows;
}

export async function reviewActivityEvent(params: {
  pool: Pool;
  userId: string;
  eventId: string;
  review: z.infer<typeof ActivityEventReviewSchema>;
}) {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    if (params.review.action === 'link') {
      await requireActiveOwnedProspect({
        db: client,
        userId: params.userId,
        prospectId: params.review.prospectId as string,
        lock: true,
      });
    }
    const existing = await client.query(
      `SELECT id, match_status, prospect_id FROM public.activity_events WHERE id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE`,
      [params.eventId, params.userId],
    );
    const event = existing.rows[0];
    if (!event) {
      await client.query('COMMIT');
      return null;
    }
    if (['matched', 'ignored'].includes(String(event.match_status))) {
      await client.query('COMMIT');
      return {
        id: event.id,
        action: event.match_status === 'matched' ? 'link' : 'ignore',
        matchStatus: event.match_status,
        prospectId: event.prospect_id || null,
        alreadyReviewed: true,
      };
    }

    const reviewedAt = new Date().toISOString();
    if (params.review.action === 'ignore') {
      const { rows } = await client.query(
        `
          UPDATE public.activity_events
          SET match_status = 'ignored', match_reason = 'broker_ignored_evidence', updated_at = now(),
              source_metadata = COALESCE(source_metadata, '{}'::jsonb) || $3::jsonb
          WHERE id = $1 AND user_id = $2 AND match_status NOT IN ('matched', 'ignored')
          RETURNING id, match_status, prospect_id
        `,
        [params.eventId, params.userId, JSON.stringify({ review: { action: 'ignore', reviewedAt } })],
      );
      await client.query('COMMIT');
      return rows[0] ? {
        id: rows[0].id,
        action: 'ignore' as const,
        matchStatus: rows[0].match_status,
        prospectId: rows[0].prospect_id || null,
        alreadyReviewed: false,
      } : null;
    }

    const { rows } = await client.query(
      `
        UPDATE public.activity_events
        SET prospect_id = $3, match_status = 'matched', match_reason = 'broker_linked_evidence', updated_at = now(),
            source_metadata = COALESCE(source_metadata, '{}'::jsonb) || $4::jsonb
        WHERE id = $1 AND user_id = $2 AND match_status NOT IN ('matched', 'ignored')
        RETURNING id, match_status, prospect_id
      `,
      [params.eventId, params.userId, params.review.prospectId, JSON.stringify({ review: { action: 'link', reviewedAt } })],
    );
    if (!rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      `
        INSERT INTO public.activity_event_links (
          id, user_id, event_id, entity_type, entity_id, role, confidence, metadata
        )
        VALUES ($1, $2, $3, 'prospect', $4, 'broker_reviewed_subject', 100, $5::jsonb)
        ON CONFLICT (event_id, entity_type, entity_id, role)
        DO UPDATE SET confidence = 100, metadata = EXCLUDED.metadata
      `,
      [randomUUID(), params.userId, params.eventId, params.review.prospectId, JSON.stringify({ reviewedAt })],
    );
    await client.query('COMMIT');
    return {
      id: rows[0].id,
      action: 'link' as const,
      matchStatus: rows[0].match_status,
      prospectId: rows[0].prospect_id,
      alreadyReviewed: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
