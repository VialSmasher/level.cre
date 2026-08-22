import type { Pool } from 'pg'

import { listProductionActivities, type ProductionActivityRow } from './productionActivityService'

type CapturedOutboundRow = {
  provider: string
  provider_message_id: string
  subject: string | null
  recipient_emails: string[] | null
  sent_at: Date | string | null
  created_at: Date | string | null
}

function parsedDate(value: unknown) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function capturedSignature(row: CapturedOutboundRow) {
  const occurredAt = parsedDate(row.sent_at || row.created_at)
  const minute = occurredAt ? Math.floor(occurredAt.getTime() / 60_000) : 0
  const recipients = (row.recipient_emails || []).map((email) => String(email).trim().toLowerCase()).sort().join(',')
  const subject = String(row.subject || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return subject || recipients
    ? `${minute}|${subject}|${recipients}`
    : `${String(row.provider).toLowerCase()}|${String(row.provider_message_id).toLowerCase()}`
}

export function summarizeCaptureHealth(params: {
  capturedRows: CapturedOutboundRow[]
  canonicalRows: ProductionActivityRow[]
  now?: Date
  days?: number
}) {
  const now = params.now ?? new Date()
  const days = params.days ?? 7
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  const captured = Array.from(new Map(
    params.capturedRows
      .filter((row) => (parsedDate(row.sent_at || row.created_at)?.getTime() || 0) >= cutoff)
      .map((row) => [capturedSignature(row), row]),
  ).values())
  const canonical = params.canonicalRows.filter((row) => (
    row.type === 'email'
      && row.direction === 'outbound'
      && (parsedDate(row.timestamp)?.getTime() || 0) >= cutoff
  ))
  const capturedCount = captured.length
  const canonicalCount = canonical.length
  const unreconciledCount = Math.max(0, capturedCount - canonicalCount)
  const lastCapturedAt = captured
    .map((row) => parsedDate(row.sent_at || row.created_at))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() || null
  const lastCanonicalAt = canonical
    .map((row) => parsedDate(row.timestamp))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() || null
  const status = unreconciledCount > 0
    ? 'attention' as const
    : capturedCount === 0 && canonicalCount === 0
      ? 'idle' as const
      : 'healthy' as const

  return {
    status,
    windowDays: days,
    capturedOutboundEmails: capturedCount,
    canonicalOutboundEmails: canonicalCount,
    unreconciledCount,
    lastCapturedAt,
    lastCanonicalAt,
    message: status === 'attention'
      ? `${unreconciledCount} captured outbound ${unreconciledCount === 1 ? 'email has' : 'emails have'} not reached the production ledger.`
      : status === 'idle'
        ? 'Capture is ready; there is no recent outbound email to reconcile.'
        : 'Captured outbound email and production credit are reconciled.',
  }
}

export async function getCaptureHealth(params: {
  pool: Pick<Pool, 'query'>
  userId: string
  days?: number
}) {
  const days = Math.min(Math.max(Math.trunc(params.days || 7), 1), 30)
  const [capturedResult, canonicalRows] = await Promise.all([
    params.pool.query<CapturedOutboundRow>(`
      SELECT provider, provider_message_id, subject, recipient_emails, sent_at, created_at
      FROM public.email_messages
      WHERE user_id = $1
        AND direction = 'sent'
        AND COALESCE(sent_at, created_at) >= now() - make_interval(days => $2::int)
      ORDER BY COALESCE(sent_at, created_at) DESC
    `, [params.userId, days]),
    listProductionActivities({ pool: params.pool, userId: params.userId, limit: 5000 }),
  ])

  return {
    generatedAt: new Date().toISOString(),
    ...summarizeCaptureHealth({
      capturedRows: capturedResult.rows,
      canonicalRows,
      days,
    }),
  }
}
