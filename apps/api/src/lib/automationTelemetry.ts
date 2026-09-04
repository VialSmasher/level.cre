import { createHash, randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'

export const RunReceiptSchema = z.object({
  producerId: z.string().trim().min(1).max(120),
  runId: z.string().trim().min(1).max(120),
  schemaVersion: z.literal(1).default(1),
  status: z.enum(['applied', 'queued_local', 'blocked', 'needs_review', 'idle']),
  applied: z.number().int().min(0).max(1_000_000).default(0),
  needsReview: z.number().int().min(0).max(1_000_000).default(0),
  failed: z.number().int().min(0).max(1_000_000).default(0),
  queued: z.number().int().min(0).max(1_000_000).nullable().optional(),
  scannedThrough: z.string().datetime({ offset: true }).nullable().optional(),
})
export async function recordRunReceipt(pool: Pick<Pool, 'query'>, userId: string, input: z.infer<typeof RunReceiptSchema>) {
  const { rows } = await pool.query(`
    INSERT INTO public.automation_runs (user_id, producer_id, run_id, schema_version, status, applied, needs_review, failed, queued, scanned_through)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (user_id, producer_id, run_id) DO UPDATE SET
      status = EXCLUDED.status, applied = EXCLUDED.applied, needs_review = EXCLUDED.needs_review,
      failed = EXCLUDED.failed, queued = EXCLUDED.queued,
      scanned_through = COALESCE(EXCLUDED.scanned_through, automation_runs.scanned_through), acknowledged_at = now()
    RETURNING producer_id, run_id, status, acknowledged_at, scanned_through
  `, [userId, input.producerId, input.runId, input.schemaVersion, input.status, input.applied, input.needsReview, input.failed, input.queued ?? null, input.scannedThrough ?? null])
  return rows[0]
}
export async function listRunReceipts(pool: Pick<Pool, 'query'>, userId: string) {
  const { rows } = await pool.query(`
    SELECT producer_id, run_id, status, applied, needs_review, failed, queued, scanned_through, started_at, acknowledged_at
    FROM public.automation_runs WHERE user_id = $1 ORDER BY acknowledged_at DESC LIMIT 12
  `, [userId])
  return rows
}
export function ingestionTrace(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID()
  res.setHeader('X-Request-Id', requestId)
  res.locals.requestId = requestId
  const started = Date.now()
  res.on('finish', () => console.info(JSON.stringify({
    event: 'ingestion_request', requestId, route: req.path, status: res.statusCode,
    elapsedMs: Date.now() - started, userId: (req as any).user?.id || null,
    runId: typeof req.body?.runId === 'string' ? req.body.runId.slice(0,120) : null,
    producerId: typeof req.body?.producerId === 'string' ? req.body.producerId.slice(0,120) : null,
  })))
  next()
}
export function ingestionRateLimit(pool: Pick<Pool, 'query'>, limit = 120) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.id === 'demo-user') return next()
    const owner = (req as any).user?.id || 'inbound-provider'
    const identity = createHash('sha256').update(String(owner)).digest('hex')
    try {
      const { rows } = await pool.query(`
        INSERT INTO public.ingestion_rate_windows (identity, window_started_at, requests)
        VALUES ($1, date_trunc('minute', now()), 1)
        ON CONFLICT (identity) DO UPDATE SET
          requests = CASE WHEN ingestion_rate_windows.window_started_at < date_trunc('minute', now()) THEN 1 ELSE ingestion_rate_windows.requests + 1 END,
          window_started_at = date_trunc('minute', now())
        RETURNING requests, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_started_at + interval '1 minute' - now())))) AS retry_after
      `, [identity])
      if (Number(rows[0].requests) > limit) {
        res.setHeader('Retry-After', String(rows[0].retry_after))
        return res.status(429).json({ message: 'Ingestion rate limit reached. Retain the outbox and retry.', requestId: res.locals.requestId })
      }
      next()
    } catch (error) { next(error) }
  }
}
