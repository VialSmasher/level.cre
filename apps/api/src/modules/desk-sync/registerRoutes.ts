import type { Express, Request, Response, RequestHandler } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'
import { getUserId, requireBrokerAuth, requireSalesActivityAuth } from '../../auth'

const brokerPath = '/api/desk/codex-sync'
const workerPath = '/api/agent/desk-sync'
const ticket = z.object({ requestId: z.string().uuid() }).strict()
const count = z.number().int().min(0).max(1_000_000)
const receipt = ticket.extend({
  state: z.enum(['complete', 'partial', 'failed']),
  recorded: count,
  needsReview: count,
  queued: count,
  reason: z.enum(['none', 'coverage', 'backlog', 'access', 'interrupted', 'other']),
}).strict().refine(r => r.state !== 'complete' || (r.queued === 0 && r.reason === 'none'))
const stale = "desk_sync.state = 'running' AND desk_sync.updated_at < now() - interval '5 minutes'"

function handle(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    fn(req, res).catch(next)
  }
}

function enabled(owner: string) {
  return owner !== 'demo-user' && !!process.env.SALES_ACTIVITY_AGENT_API_KEY &&
    owner === (process.env.SALES_ACTIVITY_AGENT_USER_ID || process.env.INTEL_AGENT_USER_ID)
}

export function registerDeskSync(app: Express, db: Pick<Pool, 'query'>) {
  async function status(owner: string) {
    const { rows } = await db.query(`
      SELECT request_id AS "requestId", CASE WHEN ${stale} THEN 'interrupted' ELSE state END AS state,
             last_success_at AS "lastSuccessAt", result
      FROM public.desk_sync WHERE owner_id = $1`, [owner])
    return { enabled: true, run: rows[0] ?? null }
  }

  app.get(brokerPath, requireBrokerAuth, handle(async (req, res) => {
    const owner = getUserId(req)
    res.json(enabled(owner) ? await status(owner) : { enabled: false, run: null })
  }))

  app.post(brokerPath, requireBrokerAuth, handle(async (req, res) => {
    const owner = getUserId(req)
    if (!enabled(owner)) return res.sendStatus(403)
    const input = ticket.safeParse(req.body)
    if (!input.success) return res.sendStatus(400)
    await db.query(`
      INSERT INTO public.desk_sync (owner_id, request_id, state) VALUES ($1, $2, 'queued')
      ON CONFLICT (owner_id) DO UPDATE SET request_id = EXCLUDED.request_id, state = 'queued',
        updated_at = now(), result = NULL
      WHERE desk_sync.request_id <> EXCLUDED.request_id AND
        (desk_sync.state IN ('complete', 'partial', 'failed') OR (${stale}))`, [owner, input.data.requestId])
    res.status(202).json(await status(owner))
  }))

  const workerOnly: RequestHandler = (req, res, next) => {
    if ((req as any).user?.role !== 'sales_activity_agent' || !enabled(getUserId(req))) {
      res.sendStatus(403)
      return
    }
    next()
  }

  app.post(workerPath + '/claim', requireSalesActivityAuth, workerOnly, handle(async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success) return res.sendStatus(400)
    const { rows } = await db.query(`
      UPDATE public.desk_sync SET state = 'running', updated_at = now()
      WHERE owner_id = $1 AND state = 'queued' RETURNING request_id AS "requestId"`, [getUserId(req)])
    res.json({ job: rows[0] ?? null })
  }))

  app.post(workerPath + '/heartbeat', requireSalesActivityAuth, workerOnly, handle(async (req, res) => {
    const input = ticket.safeParse(req.body)
    if (!input.success) return res.sendStatus(400)
    const { rowCount } = await db.query(`
      UPDATE public.desk_sync SET updated_at = now()
      WHERE owner_id = $1 AND request_id = $2 AND state = 'running'`, [getUserId(req), input.data.requestId])
    res.sendStatus(rowCount ? 204 : 409)
  }))

  app.post(workerPath + '/finish', requireSalesActivityAuth, workerOnly, handle(async (req, res) => {
    const input = receipt.safeParse(req.body)
    if (!input.success) return res.sendStatus(400)
    const { requestId, state, ...result } = input.data
    const { rowCount } = await db.query(`
      UPDATE public.desk_sync SET state = $3, result = $4::jsonb, updated_at = now(),
        last_success_at = CASE WHEN $3 = 'complete' THEN now() ELSE last_success_at END
      WHERE owner_id = $1 AND request_id = $2 AND state = 'running'`,
      [getUserId(req), requestId, state, JSON.stringify(result)])
    res.sendStatus(rowCount ? 204 : 409)
  }))
}
