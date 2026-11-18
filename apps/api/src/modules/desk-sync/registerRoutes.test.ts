import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { SignJWT } from 'jose'
import { PGlite } from '@electric-sql/pglite'
import { registerDeskSync } from './registerRoutes'

test('Daily Desk requests are private, coalesced, claimed once, and recover after interruptions', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(await readFile(new URL('../../../../../drizzle/0022_desk_sync.sql', import.meta.url), 'utf8'))
  const owner = randomUUID()
  const secret = randomUUID()
  const worker = { 'x-levelcre-sales-key': randomUUID() }
  process.env.SALES_ACTIVITY_AGENT_API_KEY = worker['x-levelcre-sales-key']
  process.env.SALES_ACTIVITY_AGENT_USER_ID = owner
  process.env.SUPABASE_JWT_SECRET = secret
  const token = async (id: string) => ({
    Authorization: 'Bearer ' + await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id)
      .setIssuer((process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://localhost').replace(/\/$/, '') + '/auth/v1')
      .setExpirationTime('5m').sign(new TextEncoder().encode(secret)),
  })
  const broker = await token(owner)
  const other = await token(randomUUID())
  const app = express()
  app.use(express.json())
  registerDeskSync(app, { query: async (sql: string, args: unknown[]) => {
    const r = await db.query(sql, args)
    return { rows: r.rows, rowCount: r.affectedRows }
  } } as any)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(r => server.once('listening', r))
  t.after(() => new Promise<void>(r => server.close(() => r())))
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  const desk = '/api/desk/codex-sync'
  const agent = '/api/agent/desk-sync/'
  const call = (url: string, headers: Record<string,string>, body?: unknown) => fetch(base + url, {
    headers: { ...headers, 'content-type': 'application/json' }, method: body === undefined ? 'GET' : 'POST',
    body: JSON.stringify(body),
  })
  const get = async () => (await call(desk, broker)).json()
  assert.equal((await call(desk, {})).status, 401)
  assert.equal((await (await call(desk, other)).json()).enabled, false)
  assert.equal((await call(desk, other, { requestId: randomUUID() })).status, 403)
  assert.equal((await call(desk, worker, { requestId: randomUUID() })).status, 403)
  assert.equal((await call(agent + 'claim', broker, {})).status, 403)
  assert.equal((await call(desk, broker, { requestId: randomUUID(), prompt: 'other' })).status, 400)
  const queue = () => call(desk, broker, { requestId: randomUUID() })
  const requests = await Promise.all([queue(), queue()])
  for (const r of requests) assert.equal(r.status, 202)
  const { run } = await get()
  const ticket = { requestId: run.requestId }
  const claims = await Promise.all([1,2].map(async () => (await (await call(agent + 'claim', worker, {})).json()).job))
  assert.deepEqual(claims.filter(Boolean), [ticket])
  assert.equal((await call(agent + 'heartbeat', worker, ticket)).status, 204)
  assert.equal((await queue()).status, 202)
  assert.equal((await get()).run.requestId, run.requestId)
  const finish = { ...ticket, state: 'complete', reason: 'none', recorded: 2, needsReview: 1, queued: 0 }
  assert.equal((await call(agent + 'finish', worker, { ...finish, queued: 2 })).status, 400)
  assert.equal((await call(agent + 'finish', worker, finish)).status, 204)
  assert.equal((await call(desk, broker, ticket)).status, 202)
  const last = (await get()).run.lastSuccessAt
  assert.ok(last)
  await queue()
  const next = (await (await call(agent + 'claim', worker, {})).json()).job
  await db.exec("UPDATE public.desk_sync SET updated_at = now() - interval '6 minutes'")
  assert.equal((await get()).run.state, 'interrupted')
  await queue()
  assert.equal((await call(agent + 'finish', worker, { ...finish, ...next })).status, 409)
  const retry = (await (await call(agent + 'claim', worker, {})).json()).job
  assert.equal((await call(agent + 'finish', worker, { ...finish, ...retry, state: 'partial', reason: 'coverage' })).status, 204)
  assert.equal((await get()).run.lastSuccessAt, last)
})
