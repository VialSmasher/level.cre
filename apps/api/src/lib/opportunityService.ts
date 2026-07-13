import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export const OPPORTUNITY_TYPES = [
  'listing_pursuit',
  'tenant_requirement',
  'buyer_requirement',
  'renewal_relocation',
  'sale_opportunity',
] as const;

export const OPPORTUNITY_STAGES = [
  'target',
  'researching',
  'contacting',
  'engaged',
  'qualified',
  'pitching',
  'decision',
  'won',
  'nurture',
  'lost',
] as const;

export const LISTING_PURSUIT_STEPS = [
  'drive_by',
  'observe_property',
  'capture_photo_or_voice_note',
  'pull_title',
  'resolve_ownership',
  'identify_decision_maker',
  'find_contact_details',
  'contact_owner',
  'follow_up',
  'confirm_status',
  'discover_timing_motivation',
  'prepare_recommendation',
  'book_owner_meeting',
  'deliver_strategy',
  'send_listing_proposal',
] as const;

const OptionalDateSchema = z.union([z.string().trim().min(1), z.date()]).transform((value, context) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
    return z.NEVER;
  }
  return date;
}).nullable().optional();

export const OpportunityCreateSchema = z.object({
  type: z.enum(OPPORTUNITY_TYPES),
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().max(240).nullable().optional(),
  contactName: z.string().trim().max(240).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  propertyAddress: z.string().trim().max(1000).nullable().optional(),
  prospectId: z.string().trim().min(1).nullable().optional(),
  listingId: z.string().trim().min(1).nullable().optional(),
  estimatedFee: z.number().nonnegative().max(100000000).nullable().optional(),
  probabilityPercent: z.number().int().min(0).max(100).nullable().optional(),
  ownershipSharePercent: z.number().min(0).max(100).nullable().optional(),
  expectedCloseDate: OptionalDateSchema,
  confidence: z.number().int().min(0).max(100).optional().default(100),
  source: z.string().trim().min(1).max(80).optional().default('manual'),
  notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const OpportunityStageChangeSchema = z.object({
  toStage: z.enum(OPPORTUNITY_STAGES),
  evidenceStatus: z.enum(['observed', 'inferred', 'confirmed']).optional().default('confirmed'),
  confidence: z.number().int().min(0).max(100).optional().default(100),
  source: z.string().trim().min(1).max(80).optional().default('manual'),
  sourceEventId: z.string().trim().min(1).nullable().optional(),
  reason: z.string().trim().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const OpportunityPlaybookStepSchema = z.object({
  stepType: z.enum(LISTING_PURSUIT_STEPS),
  status: z.enum(['pending', 'completed', 'skipped']),
  completedAt: OptionalDateSchema,
  sourceEventId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type OpportunityCreateInput = z.infer<typeof OpportunityCreateSchema>;
export type OpportunityStageChangeInput = z.infer<typeof OpportunityStageChangeSchema>;
export type OpportunityPlaybookStepInput = z.infer<typeof OpportunityPlaybookStepSchema>;

export class OpportunityServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpportunityServiceError';
    this.status = status;
  }
}

async function assertOwnedReference(
  client: PoolClient,
  userId: string,
  table: 'prospects' | 'listings',
  id: string | null | undefined,
): Promise<void> {
  if (!id) return;
  const { rows } = await client.query(
    `SELECT id FROM public.${table} WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId],
  );
  if (!rows[0]) throw new OpportunityServiceError(400, `Referenced ${table} record was not found`);
}

function statusForStage(stage: typeof OPPORTUNITY_STAGES[number]): string {
  if (stage === 'won') return 'won';
  if (stage === 'lost') return 'lost';
  if (stage === 'nurture') return 'nurture';
  return 'active';
}

async function withTransaction<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createOpportunity(params: {
  pool: Pool;
  userId: string;
  input: OpportunityCreateInput;
}): Promise<unknown> {
  return withTransaction(params.pool, async (client) => {
    await Promise.all([
      assertOwnedReference(client, params.userId, 'prospects', params.input.prospectId),
      assertOwnedReference(client, params.userId, 'listings', params.input.listingId),
    ]);
    const id = randomUUID();
    const { rows } = await client.query(
      `
        INSERT INTO public.opportunities (
          id, user_id, type, title, stage, status, company, contact_name,
          contact_email, property_address, prospect_id, listing_id, estimated_fee,
          probability_percent, ownership_share_percent, expected_close_date,
          confidence, source, notes, metadata
        )
        VALUES (
          $1, $2, $3, $4, 'target', 'active', $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18::jsonb
        )
        RETURNING *
      `,
      [
        id,
        params.userId,
        params.input.type,
        params.input.title,
        params.input.company || null,
        params.input.contactName || null,
        params.input.contactEmail || null,
        params.input.propertyAddress || null,
        params.input.prospectId || null,
        params.input.listingId || null,
        params.input.estimatedFee ?? null,
        params.input.probabilityPercent ?? null,
        params.input.ownershipSharePercent ?? null,
        params.input.expectedCloseDate || null,
        params.input.confidence,
        params.input.source,
        params.input.notes || null,
        JSON.stringify(params.input.metadata || {}),
      ],
    );
    await client.query(
      `
        INSERT INTO public.opportunity_stage_events (
          id, user_id, opportunity_id, from_stage, to_stage, evidence_status,
          confidence, source, reason, metadata
        )
        VALUES ($1, $2, $3, NULL, 'target', 'confirmed', $4, $5, 'Opportunity created', '{}'::jsonb)
      `,
      [randomUUID(), params.userId, id, params.input.confidence, params.input.source],
    );

    if (params.input.type === 'listing_pursuit') {
      await client.query(
        `
          INSERT INTO public.opportunity_playbook_steps (
            id, user_id, opportunity_id, step_type, status
          )
          SELECT gen_random_uuid()::text, $1, $2, step_type, 'pending'
          FROM unnest($3::varchar[]) AS step_type
        `,
        [params.userId, id, [...LISTING_PURSUIT_STEPS]],
      );
    }

    return rows[0];
  });
}

export async function changeOpportunityStage(params: {
  pool: Pool;
  userId: string;
  opportunityId: string;
  input: OpportunityStageChangeInput;
}): Promise<unknown> {
  if ((params.input.toStage === 'won' || params.input.toStage === 'lost') && params.input.evidenceStatus !== 'confirmed') {
    throw new OpportunityServiceError(400, 'Won and lost stages require confirmed evidence');
  }
  return withTransaction(params.pool, async (client) => {
    const current = await client.query(
      `SELECT * FROM public.opportunities WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [params.opportunityId, params.userId],
    );
    if (!current.rows[0]) throw new OpportunityServiceError(404, 'Opportunity not found');
    if (current.rows[0].stage === params.input.toStage) return current.rows[0];

    if (params.input.sourceEventId) {
      const event = await client.query(
        `SELECT id FROM public.activity_events WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [params.input.sourceEventId, params.userId],
      );
      if (!event.rows[0]) throw new OpportunityServiceError(400, 'Source activity event was not found');
    }

    const updated = await client.query(
      `
        UPDATE public.opportunities
        SET stage = $3,
            status = $4,
            confidence = GREATEST(confidence, $5),
            updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [params.opportunityId, params.userId, params.input.toStage, statusForStage(params.input.toStage), params.input.confidence],
    );
    await client.query(
      `
        INSERT INTO public.opportunity_stage_events (
          id, user_id, opportunity_id, from_stage, to_stage, evidence_status,
          confidence, source, source_event_id, reason, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        randomUUID(),
        params.userId,
        params.opportunityId,
        current.rows[0].stage,
        params.input.toStage,
        params.input.evidenceStatus,
        params.input.confidence,
        params.input.source,
        params.input.sourceEventId || null,
        params.input.reason || null,
        JSON.stringify(params.input.metadata || {}),
      ],
    );
    return updated.rows[0];
  });
}

export async function recordOpportunityPlaybookStep(params: {
  pool: Pool;
  userId: string;
  opportunityId: string;
  input: OpportunityPlaybookStepInput;
}): Promise<unknown> {
  return withTransaction(params.pool, async (client) => {
    const opportunity = await client.query(
      `SELECT id, type FROM public.opportunities WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [params.opportunityId, params.userId],
    );
    if (!opportunity.rows[0]) throw new OpportunityServiceError(404, 'Opportunity not found');
    if (opportunity.rows[0].type !== 'listing_pursuit') {
      throw new OpportunityServiceError(400, 'Listing pursuit steps can only be used on listing pursuits');
    }
    if (params.input.sourceEventId) {
      const event = await client.query(
        `SELECT id FROM public.activity_events WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [params.input.sourceEventId, params.userId],
      );
      if (!event.rows[0]) throw new OpportunityServiceError(400, 'Source activity event was not found');
    }

    const existing = await client.query(
      `
        SELECT id
        FROM public.opportunity_playbook_steps
        WHERE opportunity_id = $1 AND user_id = $2 AND step_type = $3
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `,
      [params.opportunityId, params.userId, params.input.stepType],
    );
    const completedAt = params.input.status === 'completed'
      ? (params.input.completedAt || new Date())
      : null;
    if (existing.rows[0]) {
      const { rows } = await client.query(
        `
          UPDATE public.opportunity_playbook_steps
          SET status = $4,
              completed_at = $5,
              source_event_id = COALESCE($6, source_event_id),
              notes = COALESCE($7, notes),
              metadata = COALESCE(metadata, '{}'::jsonb) || $8::jsonb,
              updated_at = now()
          WHERE id = $1 AND opportunity_id = $2 AND user_id = $3
          RETURNING *
        `,
        [existing.rows[0].id, params.opportunityId, params.userId, params.input.status, completedAt, params.input.sourceEventId || null, params.input.notes || null, JSON.stringify(params.input.metadata || {})],
      );
      return rows[0];
    }
    const { rows } = await client.query(
      `
        INSERT INTO public.opportunity_playbook_steps (
          id, user_id, opportunity_id, step_type, status, completed_at,
          source_event_id, notes, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING *
      `,
      [randomUUID(), params.userId, params.opportunityId, params.input.stepType, params.input.status, completedAt, params.input.sourceEventId || null, params.input.notes || null, JSON.stringify(params.input.metadata || {})],
    );
    return rows[0];
  });
}

export async function listOpportunities(params: {
  pool: Pool;
  userId: string;
  limit: number;
  status?: string;
  type?: string;
}): Promise<unknown[]> {
  const values: unknown[] = [params.userId];
  const filters = ['opportunity.user_id = $1', 'opportunity.archived_at IS NULL'];
  if (params.status) {
    values.push(params.status);
    filters.push(`opportunity.status = $${values.length}`);
  }
  if (params.type) {
    values.push(params.type);
    filters.push(`opportunity.type = $${values.length}`);
  }
  values.push(params.limit);
  const { rows } = await params.pool.query(
    `
      SELECT
        opportunity.*,
        playbook.total_steps,
        playbook.completed_steps,
        activity.last_activity_at
      FROM public.opportunities opportunity
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_steps,
          COUNT(*) FILTER (WHERE step.status = 'completed')::int AS completed_steps
        FROM public.opportunity_playbook_steps step
        WHERE step.opportunity_id = opportunity.id
      ) playbook ON true
      LEFT JOIN LATERAL (
        SELECT MAX(event.occurred_at) AS last_activity_at
        FROM public.activity_events event
        WHERE event.opportunity_id = opportunity.id
      ) activity ON true
      WHERE ${filters.join(' AND ')}
      ORDER BY opportunity.updated_at DESC, opportunity.created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );
  return rows;
}
