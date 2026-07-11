import type { Pool } from 'pg';

import type { NormalizedSalesActivity } from './salesActivityImport';

const RECONCILIATION_WINDOW_MINUTES = 15;

type EmailEvidence = {
  subject?: string | null;
  counterpartyEmails?: Array<string | null | undefined>;
  occurredAt?: Date | string | null;
};

function normalizeEmailList(values: Array<string | null | undefined> = []): string[] {
  return [...new Set(values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeEmailActivitySubject(value: string | null | undefined): string {
  let normalized = String(value || '').trim().toLowerCase();
  while (/^(?:re|fw|fwd)\s*:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^(?:re|fw|fwd)\s*:\s*/i, '');
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

export function isSameEmailActivity(
  left: EmailEvidence,
  right: EmailEvidence,
  windowMinutes = RECONCILIATION_WINDOW_MINUTES,
): boolean {
  const leftSubject = normalizeEmailActivitySubject(left.subject);
  const rightSubject = normalizeEmailActivitySubject(right.subject);
  if (!leftSubject || leftSubject !== rightSubject) return false;

  const leftEmails = normalizeEmailList(left.counterpartyEmails);
  const rightEmails = new Set(normalizeEmailList(right.counterpartyEmails));
  if (leftEmails.length === 0 || !leftEmails.some((email) => rightEmails.has(email))) return false;

  const leftAt = parseDate(left.occurredAt);
  const rightAt = parseDate(right.occurredAt);
  if (!leftAt || !rightAt) return false;

  return Math.abs(leftAt.getTime() - rightAt.getTime()) <= windowMinutes * 60_000;
}

export async function findMatchingCodexEmailImport(params: {
  pool: Pool;
  userId: string;
  subject?: string | null;
  counterpartyEmails?: Array<string | null | undefined>;
  occurredAt?: Date | string | null;
}): Promise<{ id: string; interactionId: string | null; matchStatus: string } | null> {
  const occurredAt = parseDate(params.occurredAt);
  const emails = normalizeEmailList(params.counterpartyEmails);
  const subject = normalizeEmailActivitySubject(params.subject);
  if (!occurredAt || emails.length === 0 || !subject) return null;

  const { rows } = await params.pool.query(
    `
      SELECT id, interaction_id, match_status, subject, email, activity_at
      FROM public.sales_activity_imports
      WHERE user_id = $1
        AND source = 'codex_followup'
        AND activity_status = 'sent'
        AND activity_type = 'email'
        AND lower(email) = ANY($2::varchar[])
        AND activity_at BETWEEN $3::timestamp - interval '${RECONCILIATION_WINDOW_MINUTES} minutes'
                            AND $3::timestamp + interval '${RECONCILIATION_WINDOW_MINUTES} minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM (activity_at - $3::timestamp))) ASC
      LIMIT 20
    `,
    [params.userId, emails, occurredAt],
  );

  const matching = rows.find((row) => isSameEmailActivity(
    { subject: params.subject, counterpartyEmails: emails, occurredAt },
    { subject: row.subject, counterpartyEmails: [row.email], occurredAt: row.activity_at },
  ));
  return matching
    ? { id: matching.id, interactionId: matching.interaction_id || null, matchStatus: matching.match_status }
    : null;
}

async function findMatchingCapturedEmailMessageIds(params: {
  pool: Pool;
  userId: string;
  activity: NormalizedSalesActivity;
}): Promise<string[]> {
  const { activity } = params;
  const occurredAt = parseDate(activity.activityAt);
  const subject = normalizeEmailActivitySubject(activity.subject);
  if (
    activity.source !== 'codex_followup'
    || activity.activityStatus !== 'sent'
    || activity.activityType !== 'email'
    || !activity.email
    || !occurredAt
    || !subject
  ) return [];

  const { rows } = await params.pool.query(
    `
      SELECT id, subject, recipient_emails, sent_at, received_at
      FROM public.email_messages
      WHERE user_id = $1
        AND direction = 'sent'
        AND lower($2) = ANY(
          SELECT lower(recipient)
          FROM unnest(COALESCE(recipient_emails, ARRAY[]::varchar[])) AS recipient
        )
        AND COALESCE(sent_at, received_at)
          BETWEEN $3::timestamp - interval '${RECONCILIATION_WINDOW_MINUTES} minutes'
              AND $3::timestamp + interval '${RECONCILIATION_WINDOW_MINUTES} minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(sent_at, received_at) - $3::timestamp))) ASC
      LIMIT 20
    `,
    [params.userId, activity.email, occurredAt],
  );

  return rows
    .filter((row) => isSameEmailActivity(
      { subject: activity.subject, counterpartyEmails: [activity.email], occurredAt },
      {
        subject: row.subject,
        counterpartyEmails: row.recipient_emails || [],
        occurredAt: row.sent_at || row.received_at,
      },
    ))
    .map((row) => row.id);
}

export async function hasMatchingCapturedEmailEvidence(params: {
  pool: Pool;
  userId: string;
  activity: NormalizedSalesActivity;
}): Promise<boolean> {
  const matchingMessageIds = await findMatchingCapturedEmailMessageIds(params);
  return matchingMessageIds.length > 0;
}

export async function suppressEmailReviewsMatchingSalesActivity(params: {
  pool: Pool;
  userId: string;
  activity: NormalizedSalesActivity;
}): Promise<number> {
  const matchingMessageIds = await findMatchingCapturedEmailMessageIds(params);
  if (matchingMessageIds.length === 0) return 0;

  const result = await params.pool.query(
    `
      UPDATE public.email_prospect_matches
      SET match_status = 'ignored',
          match_reason = 'duplicate_codex_activity',
          reviewed_at = COALESCE(reviewed_at, now()),
          updated_at = now()
      WHERE user_id = $1
        AND email_message_id = ANY($2::varchar[])
        AND interaction_id IS NULL
        AND match_status IN ('needs_context', 'pending_review')
      RETURNING id
    `,
    [params.userId, matchingMessageIds],
  );
  return result.rowCount || result.rows.length;
}
