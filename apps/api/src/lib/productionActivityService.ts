import type { Pool } from 'pg';

export type ProductionActivityRow = {
  id: string;
  timestamp: string;
  date: string;
  type: 'email' | 'call' | 'meeting' | 'note';
  action: 'email_sent' | 'phone_call' | 'meeting_held' | 'note_added';
  direction: 'outbound' | 'inbound' | 'internal';
  sourceProvider: string;
  sourceMetadata: Record<string, unknown>;
  prospectId: string | null;
  interactionId: string | null;
};

type RawActivityRow = Record<string, any>;

const PRODUCTION_EVENT_TYPES = [
  'email_sent',
  'email_received',
  'call_attempted',
  'meeting',
  'note',
] as const;

function parseDate(value: unknown, fallback?: unknown): Date | null {
  for (const candidate of [value, fallback]) {
    if (!candidate) continue;
    const parsed = candidate instanceof Date ? candidate : new Date(String(candidate));
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return null;
}

function normalizeType(value: unknown): ProductionActivityRow['type'] | null {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'email' || type === 'email_sent' || type === 'email_received') return 'email';
  if (type === 'call' || type === 'phone_call' || type === 'call_attempted') return 'call';
  if (type === 'meeting' || type === 'meeting_held' || type === 'tour' || type === 'showing') return 'meeting';
  if (type === 'note' || type === 'note_added') return 'note';
  return null;
}

function actionForType(type: ProductionActivityRow['type']): ProductionActivityRow['action'] {
  if (type === 'email') return 'email_sent';
  if (type === 'call') return 'phone_call';
  if (type === 'meeting') return 'meeting_held';
  return 'note_added';
}

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeDirection(
  value: unknown,
  metadata: Record<string, unknown>,
  type: ProductionActivityRow['type'],
): ProductionActivityRow['direction'] {
  const direction = String(
    value
    || metadata.direction
    || metadata.captureDirection
    || metadata.emailDirection
    || '',
  ).trim().toLowerCase();
  if (direction === 'received' || direction === 'inbound') return 'inbound';
  if (direction === 'internal' || type === 'note') return 'internal';
  return 'outbound';
}

function normalizedRow(params: {
  prefix: 'event' | 'import' | 'interaction';
  row: RawActivityRow;
  occurredAt: unknown;
  occurredAtFallback?: unknown;
  type: unknown;
  direction?: unknown;
  sourceProvider?: unknown;
  sourceMetadata?: unknown;
  prospectId?: unknown;
  interactionId?: unknown;
}): ProductionActivityRow | null {
  const type = normalizeType(params.type);
  const occurredAt = parseDate(params.occurredAt, params.occurredAtFallback);
  if (!type || !occurredAt) return null;
  const sourceMetadata = metadataOf(params.sourceMetadata);
  const direction = normalizeDirection(params.direction, sourceMetadata, type);
  return {
    id: `${params.prefix}:${String(params.row.id)}`,
    timestamp: occurredAt.toISOString(),
    date: occurredAt.toISOString(),
    type,
    action: actionForType(type),
    direction,
    sourceProvider: String(params.sourceProvider || params.prefix),
    sourceMetadata,
    prospectId: params.prospectId ? String(params.prospectId) : null,
    interactionId: params.interactionId ? String(params.interactionId) : null,
  };
}

export async function listProductionActivities(params: {
  pool: Pick<Pool, 'query'>;
  userId: string;
  limit?: number;
}): Promise<ProductionActivityRow[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit || 1500), 1), 5000);
  const queryLimit = Math.min(limit * 2, 7500);
  const [eventResult, importResult, interactionResult] = await Promise.all([
    params.pool.query(
      `
        SELECT
          id, event_type, direction, occurred_at, source, source_metadata,
          prospect_id, interaction_id, external_event_id
        FROM public.activity_events
        WHERE user_id = $1
          AND evidence_status = 'confirmed'
          AND event_type = ANY($2::varchar[])
        ORDER BY occurred_at DESC
        LIMIT $3
      `,
      [params.userId, [...PRODUCTION_EVENT_TYPES], queryLimit],
    ),
    params.pool.query(
      `
        SELECT
          id, source, external_activity_id, activity_status, activity_type,
          activity_at, created_at, prospect_id, interaction_id, raw_payload
        FROM public.sales_activity_imports
        WHERE user_id = $1
          AND (
            activity_status = 'sent'
            OR (activity_status = 'received' AND activity_type = 'email')
          )
        ORDER BY activity_at DESC NULLS LAST, created_at DESC
        LIMIT $2
      `,
      [params.userId, queryLimit],
    ),
    params.pool.query(
      `
        SELECT
          id, date, created_at, type, source_provider, source_message_id,
          source_metadata, prospect_id
        FROM public.contact_interactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [params.userId, queryLimit],
    ),
  ]);

  const eventIdentities = new Set<string>();
  const representedInteractionIds = new Set<string>();
  const activities: ProductionActivityRow[] = [];

  for (const row of eventResult.rows as RawActivityRow[]) {
    eventIdentities.add(`${String(row.source)}\u0000${String(row.external_event_id)}`);
    if (row.interaction_id) representedInteractionIds.add(String(row.interaction_id));
    const activity = normalizedRow({
      prefix: 'event',
      row,
      occurredAt: row.occurred_at,
      type: row.event_type,
      direction: row.direction,
      sourceProvider: row.source,
      sourceMetadata: row.source_metadata,
      prospectId: row.prospect_id,
      interactionId: row.interaction_id,
    });
    if (activity) activities.push(activity);
  }

  for (const row of importResult.rows as RawActivityRow[]) {
    const identity = `${String(row.source)}\u0000${String(row.external_activity_id)}`;
    if (eventIdentities.has(identity)) continue;
    if (row.interaction_id && representedInteractionIds.has(String(row.interaction_id))) continue;
    if (row.interaction_id) representedInteractionIds.add(String(row.interaction_id));
    const activity = normalizedRow({
      prefix: 'import',
      row,
      occurredAt: row.activity_at,
      occurredAtFallback: row.created_at,
      type: row.activity_type,
      direction: row.activity_status === 'received' ? 'inbound' : undefined,
      sourceProvider: row.source,
      sourceMetadata: row.raw_payload,
      prospectId: row.prospect_id,
      interactionId: row.interaction_id,
    });
    if (activity) activities.push(activity);
  }

  for (const row of interactionResult.rows as RawActivityRow[]) {
    if (representedInteractionIds.has(String(row.id))) continue;
    const activity = normalizedRow({
      prefix: 'interaction',
      row,
      occurredAt: row.date,
      occurredAtFallback: row.created_at,
      type: row.type,
      sourceProvider: row.source_provider || 'manual',
      sourceMetadata: row.source_metadata,
      prospectId: row.prospect_id,
      interactionId: row.id,
    });
    if (activity) activities.push(activity);
  }

  return activities
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, limit);
}
