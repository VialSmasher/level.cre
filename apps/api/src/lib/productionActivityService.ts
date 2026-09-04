import type { Pool } from 'pg';

import { isSameEmailActivity, normalizeEmailActivitySubject } from './emailActivityReconciliation';

export type ProductionActivityRow = {
  id: string;
  timestamp: string;
  date: string;
  type: 'email' | 'call' | 'meeting' | 'note';
  action: 'email_sent' | 'phone_call' | 'meeting_held' | 'note_added';
  direction: 'outbound' | 'inbound' | 'internal';
  sourceProvider: string;
  sourceIdentities?: string[];
  sourceMetadata: Record<string, unknown>;
  prospectId: string | null;
  interactionId: string | null;
};

type RawActivityRow = Record<string, any>;

type ProductionActivityCandidate = {
  activity: ProductionActivityRow;
  prefix: 'event' | 'import' | 'interaction';
  identities: string[];
  emailEvidence: {
    subject: string;
    counterpartyEmails: string[];
    occurredAt: string;
  } | null;
};

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

function stringsOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function nestedValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function externalIdentity(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return `external:${text.replace(/^internet-message:/i, '')}`;
}

function candidateIdentities(params: {
  row: RawActivityRow;
  sourceMetadata: Record<string, unknown>;
  interactionId: string | null;
}): string[] {
  const candidates = [
    params.row.external_event_id,
    params.row.external_activity_id,
    params.row.source_message_id,
    params.row.email_provider_message_id,
    nestedValue(params.sourceMetadata, 'externalActivityId'),
    nestedValue(params.sourceMetadata, 'providerMessageId'),
    nestedValue(params.sourceMetadata, 'graphMessageId'),
    nestedValue(params.sourceMetadata, 'internetMessageId'),
    nestedValue(params.sourceMetadata, 'reconciledIdentity', 'externalActivityId'),
    nestedValue(params.row.email_raw_metadata, 'graphMessageId'),
    nestedValue(params.row.email_raw_metadata, 'internetMessageId'),
  ];
  const identities = candidates
    .map(externalIdentity)
    .filter((identity): identity is string => Boolean(identity));
  if (params.interactionId) identities.push(`interaction:${params.interactionId}`);
  return [...new Set(identities)];
}

function emailEvidenceForCandidate(params: {
  row: RawActivityRow;
  activity: ProductionActivityRow;
  sourceMetadata: Record<string, unknown>;
}): ProductionActivityCandidate['emailEvidence'] {
  if (params.activity.type !== 'email') return null;
  const subject = String(
    params.row.subject
    || params.row.email_subject
    || params.sourceMetadata.subject
    || '',
  ).trim();
  const fallbackEmail = String(params.row.email || params.sourceMetadata.email || '').trim();
  const counterpartyEmails = params.activity.direction === 'inbound'
    ? stringsOf(params.row.email_sender_email || fallbackEmail)
    : [
        ...stringsOf(params.row.email_recipient_emails),
        ...stringsOf(params.row.email_cc_emails),
        ...stringsOf(fallbackEmail),
      ];
  if (!subject || counterpartyEmails.length === 0) return null;
  return {
    subject,
    counterpartyEmails: [...new Set(counterpartyEmails.map((email) => email.toLowerCase()))],
    occurredAt: params.activity.timestamp,
  };
}

function candidateScore(candidate: ProductionActivityCandidate): number {
  return (candidate.activity.prospectId ? 100 : 0)
    + (candidate.activity.interactionId ? 30 : 0)
    + (candidate.prefix === 'event' ? 3 : candidate.prefix === 'import' ? 2 : 1)
    + Math.min(candidate.identities.length, 5);
}

function deduplicateCandidates(candidates: ProductionActivityCandidate[]): ProductionActivityRow[] {
  const parents = candidates.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  const identityOwners = new Map<string, number>();
  candidates.forEach((candidate, index) => {
    for (const identity of candidate.identities) {
      const key = `${candidate.activity.type}\u0000${candidate.activity.direction}\u0000${identity}`;
      const owner = identityOwners.get(key);
      if (owner === undefined) identityOwners.set(key, index);
      else union(owner, index);
    }
  });

  const fuzzyEmailGroups = new Map<string, Array<{ index: number; occurredAt: number }>>();
  candidates.forEach((candidate, index) => {
    const evidence = candidate.emailEvidence;
    if (!evidence) return;
    const subject = normalizeEmailActivitySubject(evidence.subject);
    const occurredAt = new Date(evidence.occurredAt).getTime();
    if (!subject || !Number.isFinite(occurredAt)) return;
    for (const email of evidence.counterpartyEmails) {
      const key = `${candidate.activity.direction}\u0000${subject}\u0000${email}`;
      const entries = fuzzyEmailGroups.get(key) || [];
      entries.push({ index, occurredAt });
      fuzzyEmailGroups.set(key, entries);
    }
  });
  for (const entries of fuzzyEmailGroups.values()) {
    entries.sort((left, right) => left.occurredAt - right.occurredAt);
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        if (entries[right].occurredAt - entries[left].occurredAt > 15 * 60_000) break;
        const leftEvidence = candidates[entries[left].index].emailEvidence;
        const rightEvidence = candidates[entries[right].index].emailEvidence;
        if (leftEvidence && rightEvidence && isSameEmailActivity(leftEvidence, rightEvidence)) {
          union(entries[left].index, entries[right].index);
        }
      }
    }
  }

  const grouped = new Map<number, ProductionActivityCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = grouped.get(root) || [];
    group.push(candidate);
    grouped.set(root, group);
  });

  return [...grouped.values()].map((group) => {
    const preferred = [...group].sort((left, right) => candidateScore(right) - candidateScore(left))[0];

    return {
      ...preferred.activity,
      sourceIdentities: [...new Set(group.flatMap(candidate => candidate.identities))],
      sourceMetadata: {
        ...preferred.activity.sourceMetadata,
        deduplicatedActivityCount: group.length,
        deduplicatedSourceProviders: [...new Set(group.map((candidate) => candidate.activity.sourceProvider))],
      },
    };
  });
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
    sourceMetadata: {
      ...sourceMetadata,
      externalActivityId: sourceMetadata.externalActivityId || params.row.external_activity_id || params.row.external_event_id || params.row.source_message_id || null,
      subject: sourceMetadata.subject || params.row.subject || params.row.email_subject || null,
      email: sourceMetadata.email || params.row.email || params.row.email_sender_email || null,
      recipientEmails: sourceMetadata.recipientEmails || params.row.email_recipient_emails || [],
      company: sourceMetadata.company || params.row.company || null,
      sourceThreadId: sourceMetadata.sourceThreadId || params.row.source_thread_id || null,
    },
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
          prospect_id, interaction_id, external_event_id, subject, email
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
          activity_at, created_at, prospect_id, interaction_id, raw_payload,
          subject, email
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
          interaction.id, interaction.date, interaction.created_at, interaction.type,
          interaction.source_provider, interaction.source_message_id,
          interaction.source_email_message_id, interaction.source_metadata,
          interaction.prospect_id,
          email.provider_message_id AS email_provider_message_id,
          email.subject AS email_subject,
          email.sender_email AS email_sender_email,
          email.recipient_emails AS email_recipient_emails,
          email.cc_emails AS email_cc_emails,
          email.raw_metadata AS email_raw_metadata
        FROM public.contact_interactions interaction
        LEFT JOIN public.email_messages email
          ON email.id = interaction.source_email_message_id
         AND email.user_id = interaction.user_id
        WHERE interaction.user_id = $1
        ORDER BY interaction.created_at DESC
        LIMIT $2
      `,
      [params.userId, queryLimit],
    ),
  ]);

  const candidates: ProductionActivityCandidate[] = [];

  for (const row of eventResult.rows as RawActivityRow[]) {
    const sourceMetadata = metadataOf(row.source_metadata);
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
    if (activity) candidates.push({
      activity,
      prefix: 'event',
      identities: candidateIdentities({ row, sourceMetadata, interactionId: activity.interactionId }),
      emailEvidence: emailEvidenceForCandidate({ row, activity, sourceMetadata }),
    });
  }

  for (const row of importResult.rows as RawActivityRow[]) {
    const sourceMetadata = metadataOf(row.raw_payload);
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
    if (activity) candidates.push({
      activity,
      prefix: 'import',
      identities: candidateIdentities({ row, sourceMetadata, interactionId: activity.interactionId }),
      emailEvidence: emailEvidenceForCandidate({ row, activity, sourceMetadata }),
    });
  }

  for (const row of interactionResult.rows as RawActivityRow[]) {
    const sourceMetadata = metadataOf(row.source_metadata);
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
    if (activity) candidates.push({
      activity,
      prefix: 'interaction',
      identities: candidateIdentities({ row, sourceMetadata, interactionId: activity.interactionId }),
      emailEvidence: emailEvidenceForCandidate({ row, activity, sourceMetadata }),
    });
  }

  return deduplicateCandidates(candidates)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, limit);
}
