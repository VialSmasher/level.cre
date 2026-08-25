import type { Express, Request, Response } from 'express'
import { z } from 'zod'

import {
  AccountExperienceReviewSchema,
  AccountIntelligenceBatchSchema,
  AccountIntelligenceSearchQuerySchema,
} from '@level-cre/shared'

import { getUserId, requireAccountIntelligenceAuth, requireBrokerAuth } from '../../auth'
import { pool } from '../../db'
import { ensureUser } from '../../ensureUser'
import {
  AccountIntelligenceError,
  getAccountBrief,
  getPersonBrief,
  importAccountIntelligenceBatch,
  listAccountIntelligenceReview,
  reviewAccountExperience,
  searchAccountIntelligence,
} from './service'

function isDemo(req: Request) {
  return req.headers['x-demo-mode'] === 'true'
    || process.env.VITE_DEMO_MODE === '1'
    || process.env.DEMO_MODE === '1'
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof AccountIntelligenceError) {
    return res.status(error.status).json({ message: error.message })
  }
  console.error(fallback, error)
  return res.status(500).json({ message: fallback })
}

const IdParamSchema = z.string().uuid()

export function registerAccountIntelligenceRoutes(app: Express) {
  app.get('/api/intel/account-intelligence/search', requireAccountIntelligenceAuth, async (req, res) => {
    try {
      const parsed = AccountIntelligenceSearchQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid account-intelligence search', issues: parsed.error.flatten() })
      }
      if (isDemo(req)) return res.json({ accounts: [], people: [], firms: [], demo: true })
      const result = await searchAccountIntelligence({ pool, userId: getUserId(req), query: parsed.data })
      return res.json(result)
    } catch (error) {
      return sendError(res, error, 'Failed to search account intelligence')
    }
  })

  app.get('/api/intel/account-intelligence/accounts/:id/brief', requireAccountIntelligenceAuth, async (req, res) => {
    try {
      const parsedId = IdParamSchema.safeParse(req.params.id)
      if (!parsedId.success) return res.status(400).json({ message: 'Invalid corporate account ID' })
      if (isDemo(req)) return res.status(404).json({ message: 'Corporate account was not found in demo mode.' })
      return res.json(await getAccountBrief({ pool, userId: getUserId(req), accountId: parsedId.data }))
    } catch (error) {
      return sendError(res, error, 'Failed to load the corporate-account briefing')
    }
  })

  app.get('/api/intel/account-intelligence/people/:id/brief', requireAccountIntelligenceAuth, async (req, res) => {
    try {
      const parsedId = IdParamSchema.safeParse(req.params.id)
      if (!parsedId.success) return res.status(400).json({ message: 'Invalid person ID' })
      if (isDemo(req)) return res.status(404).json({ message: 'Person was not found in demo mode.' })
      return res.json(await getPersonBrief({ pool, userId: getUserId(req), personId: parsedId.data }))
    } catch (error) {
      return sendError(res, error, 'Failed to load the broker briefing')
    }
  })

  app.post('/api/intel/agent/account-intelligence/batches', requireAccountIntelligenceAuth, async (req, res) => {
    try {
      const parsed = AccountIntelligenceBatchSchema.safeParse(req.body || {})
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid account-intelligence batch', issues: parsed.error.flatten() })
      }
      if (isDemo(req)) {
        return res.status(202).json({
          batchId: null,
          duplicate: false,
          counts: { created: 0, matched: 0, evidenceAdded: 0, review: 0 },
          results: [],
          skipped: true,
          reason: 'demo_mode',
        })
      }
      const userId = getUserId(req)
      await ensureUser(userId, (req as any)?.user?.email || null)
      const actorRole = String((req as any)?.user?.role || 'broker')
      const result = await importAccountIntelligenceBatch({
        pool,
        userId,
        actorRole,
        agentName: (req as any)?.user?.agentName || null,
        payload: parsed.data,
      })
      return res.status(result.duplicate ? 200 : 201).json(result)
    } catch (error) {
      return sendError(res, error, 'Failed to import account intelligence')
    }
  })

  app.get('/api/intel/account-intelligence/review', requireAccountIntelligenceAuth, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 250)
      if (isDemo(req)) return res.json({ rows: [], demo: true })
      return res.json(await listAccountIntelligenceReview({ pool, userId: getUserId(req), limit }))
    } catch (error) {
      return sendError(res, error, 'Failed to load account-intelligence review')
    }
  })

  app.patch('/api/intel/account-intelligence/experiences/:id/review', requireBrokerAuth, async (req, res) => {
    try {
      const parsedId = IdParamSchema.safeParse(req.params.id)
      if (!parsedId.success) return res.status(400).json({ message: 'Invalid account-experience ID' })
      const parsed = AccountExperienceReviewSchema.safeParse(req.body || {})
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid account-experience review', issues: parsed.error.flatten() })
      }
      if (isDemo(req)) return res.json({ id: parsedId.data, ...parsed.data, skipped: true, reason: 'demo_mode' })
      return res.json(await reviewAccountExperience({
        pool,
        userId: getUserId(req),
        experienceId: parsedId.data,
        action: parsed.data.action,
        note: parsed.data.note,
      }))
    } catch (error) {
      return sendError(res, error, 'Failed to review account experience')
    }
  })
}
