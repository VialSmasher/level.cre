import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import express, { type RequestHandler } from 'express'
import type { Pool } from 'pg'
import { SignJWT } from 'jose'
import type { PropertySiteInformationPreview } from '@level-cre/shared'
import { registerPropertyGisRoutes, type PropertyGisRouteDependencies } from './registerRoutes'

const timestamp = '2026-10-23T20:00:00.000Z'
const emptyPreview: PropertySiteInformationPreview = {
  schemaVersion: 1, status: 'not_found', candidates: [], currentZoning: [],
  sources: [], warnings: [], retrievedAt: timestamp, truncated: false,
}
const ownedDossier = {
  id: 'dossier-one', created_by_user_id: 'broker-one', lat: '53.56', lng: '-113.52',
  memory_payload: { latitude: 53.57, longitude: -113.53, municipality: 'Edmonton', privateNotes: 'Never send this' },
  linked_prospect_id: 'prospect-one' as string | null,
  prospect_id: 'prospect-one' as string | null,
  prospect_user_id: 'broker-one' as string | null,
  prospect_metadata: null as Record<string, unknown> | null,
  prospect_lat: 53.55, prospect_lng: -113.51, prospect_point_lat: 53.54, prospect_point_lng: -113.5,
  property_prospect_id: null as string | null,
  property_user_id: null as string | null,
  property_metadata: null as Record<string, unknown> | null,
  property_lat: null as number | null,
  property_lng: null as number | null,
  property_point_lat: null as number | null,
  property_point_lng: null as number | null,
}
type Dossier = typeof ownedDossier
const propertyLink = (propertyProspectId: string) => ({
  propertyLink: { propertyProspectId, relationship: 'occupant', source: 'broker', reviewedAt: timestamp, reviewedBy: 'broker-one' },
})
const linkedOccupant: Partial<Dossier> = {
  prospect_metadata: propertyLink('property-one'), property_prospect_id: 'property-one', property_user_id: 'broker-one',
  property_point_lat: 53.6, property_point_lng: -113.6, property_lat: 53.61, property_lng: -113.61,
}

async function serve(t: { after: (fn: () => Promise<void>) => void }, options: {
  enabled?: boolean
  useDefaultGate?: boolean
  row?: Partial<Dossier> | null
  role?: string
  userId?: string
  queryError?: boolean
  lookupError?: boolean
  authenticateBroker?: RequestHandler
  useRealAuth?: boolean
  recordTimeoutMs?: number
  queryWait?: Promise<void>
} = {}) {
  const queries: Array<{ sql: string; values: unknown[]; timeout: number }> = []
  const lookups: unknown[] = []
  const reader = {
    query: async (query: { text: string; values: unknown[]; query_timeout: number }) => {
      queries.push({ sql: query.text, values: query.values, timeout: query.query_timeout })
      await options.queryWait
      if (options.queryError) throw new Error('Private database details must not leak')
      return { rows: options.row === null ? [] : [{ ...ownedDossier, ...options.row }] }
    },
  } as unknown as Pick<Pool, 'query'>
  const authenticateBroker: RequestHandler = options.authenticateBroker ?? ((req, _res, next) => {
    ;(req as any).user = { id: options.userId ?? 'broker-one', role: options.role ?? 'authenticated' }
    next()
  })
  const dependencies: PropertyGisRouteDependencies = {
    ...(options.useDefaultGate ? {} : { enabled: () => options.enabled ?? true }),
    ...(options.useRealAuth ? {} : { authenticateBroker }),
    now: () => new Date(timestamp),
    recordTimeoutMs: options.recordTimeoutMs,
    lookup: async (input) => {
      lookups.push(input)
      if (options.lookupError) throw new Error('Private provider diagnostic URL')
      return structuredClone(emptyPreview)
    },
  }
  const app = express()
  app.use(express.json())
  registerPropertyGisRoutes(app, reader, dependencies)
  const downstream = { calls: 0 }
  app.use('/api/intel', (_req, res) => {
    downstream.calls++
    res.status(418).json({ downstream: true })
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const request = async (path = '/api/intel/dossiers/dossier-one/site-information', init: RequestInit = {}) => {
    const response = await fetch(url + path, {
      ...init,
      headers: { Authorization: 'Bearer signed-broker-test-session', 'Content-Type': 'application/json', ...init.headers },
    })
    const raw = await response.text()
    let body: any
    try { body = JSON.parse(raw) } catch { body = raw }
    return { status: response.status, headers: response.headers, body }
  }
  return { request, queries, lookups, downstream }
}

test('disabled previews do not authenticate, query a dossier or contact GIS', async (t) => {
  let authCalls = 0
  const fixture = await serve(t, { enabled: false, authenticateBroker: (_req, _res, next) => { authCalls++; next() } })
  for (const method of ['GET', 'POST']) {
    const path = method === 'GET' ? '/api/intel/dossiers/dossier-one/site-information' : '/api/intel/dossiers/dossier-one/parcel-match/preview'
    const result = await fixture.request(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) })
    assert.equal(result.status, 404)
    assert.equal(result.body.code, 'property_gis_preview_disabled')
    assert.match(result.headers.get('cache-control')!, /no-store/)
  }
  assert.equal(authCalls, 0)
  assert.equal(fixture.queries.length, 0)
  assert.equal(fixture.lookups.length, 0)
})

test('feature is off by default and requires the exact enable value', async (t) => {
  const previous = process.env.PROPERTY_GIS_PREVIEW_ENABLED
  try {
    const fixture = await serve(t, { useDefaultGate: true })
    delete process.env.PROPERTY_GIS_PREVIEW_ENABLED
    assert.equal((await fixture.request()).status, 404)
    process.env.PROPERTY_GIS_PREVIEW_ENABLED = 'true'
    assert.equal((await fixture.request()).status, 404)
    process.env.PROPERTY_GIS_PREVIEW_ENABLED = '1'
    assert.equal((await fixture.request()).status, 200)
  } finally {
    if (previous === undefined) delete process.env.PROPERTY_GIS_PREVIEW_ENABLED
    else process.env.PROPERTY_GIS_PREVIEW_ENABLED = previous
  }
})

test('real-broker guard excludes absent auth, demo and harness-only credentials', async (t) => {
  const fixture = await serve(t)
  for (const [headers, expected] of [
    [{ Authorization: '' }, 401],
    [{ 'x-demo-mode': 'true' }, 401],
    [{ 'x-levelcre-broker-key': 'harness-only' }, 403],
  ] as Array<[Record<string, string>, number]>) {
    const result = await fixture.request(undefined, { headers })
    assert.equal(result.status, expected)
  }
  assert.equal(fixture.queries.length, 0)
})

test('unsupported verbs terminate on exact GIS paths, including trailing slashes', async (t) => {
  const fixture = await serve(t)
  for (const [path, allow, methods] of [
    ['/api/intel/dossiers/dossier-one/site-information', 'GET, HEAD', ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']],
    ['/api/intel/dossiers/dossier-one/parcel-match/preview', 'POST', ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']],
  ] as const) {
    for (const suffix of ['', '/']) {
      for (const method of methods) {
        const result = await fixture.request(path + suffix, { method })
        assert.equal(result.status, 405)
        assert.equal(result.headers.get('allow'), allow)
        assert.match(result.headers.get('cache-control')!, /no-store/)
      }
    }
  }
  assert.equal(fixture.downstream.calls, 0)
  assert.equal(fixture.queries.length, 0)
  assert.equal(fixture.lookups.length, 0)
})

test('GIS success, auth rejection, validation and disabled responses cannot enter downstream Intel middleware', async (t) => {
  const fixture = await serve(t)
  assert.equal((await fixture.request()).status, 200)
  assert.equal((await fixture.request('/api/intel/dossiers/dossier-one/parcel-match/preview', { method: 'POST', body: '{}' })).status, 200)
  assert.equal((await fixture.request(undefined, { headers: { Authorization: '' } })).status, 401)
  assert.equal((await fixture.request('/api/intel/dossiers/dossier-one/site-information?userId=someone')).status, 400)
  assert.equal(fixture.downstream.calls, 0)
  const denied = await serve(t, { role: 'agent' })
  assert.equal((await denied.request()).status, 403)
  assert.equal(denied.downstream.calls, 0)
  const disabled = await serve(t, { enabled: false })
  assert.equal((await disabled.request()).status, 404)
  assert.equal((await disabled.request(undefined, { method: 'DELETE' })).status, 404)
  assert.equal(disabled.downstream.calls, 0)
  // Positive control: the downstream observer is active for unrelated routes.
  assert.equal((await fixture.request('/api/intel/unrelated')).status, 418)
  assert.equal(fixture.downstream.calls, 1)
})

test('agent identities cannot use GIS broker previews', async (t) => {
  for (const role of ['agent', 'market_record_agent', 'broker_harness_agent', 'sales_activity_agent']) {
    const fixture = await serve(t, { role })
    assert.equal((await fixture.request()).status, 403)
    assert.equal(fixture.queries.length, 0)
  }
})

test('production broker middleware verifies a JWT and refuses the broad legacy agent key', async (t) => {
  const keys = ['SUPABASE_JWT_SECRET', 'VITE_SUPABASE_URL', 'INTEL_AGENT_API_KEY', 'INTEL_AGENT_USER_ID'] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  process.env.SUPABASE_JWT_SECRET = 'gis-unit-test-secret-with-at-least-32-bytes'
  process.env.VITE_SUPABASE_URL = 'https://gis-unit-test.invalid'
  process.env.INTEL_AGENT_API_KEY = 'gis-unit-test-agent-key'
  process.env.INTEL_AGENT_USER_ID = 'broker-one'
  try {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('broker-one')
      .setIssuer('https://gis-unit-test.invalid/auth/v1')
      .setExpirationTime('2m')
      .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET))
    const fixture = await serve(t, { useRealAuth: true })
    assert.equal((await fixture.request(undefined, { headers: { Authorization: 'Bearer gis-unit-test-agent-key' } })).status, 403)
    assert.equal(fixture.queries.length, 0)
    assert.equal((await fixture.request(undefined, { headers: { Authorization: `Bearer ${token}` } })).status, 200)
    assert.equal(fixture.queries.length, 1)
    assert.equal((await fixture.request(undefined, { headers: { Authorization: 'Bearer invalid' } })).status, 401)
    assert.equal(fixture.queries.length, 1)
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})

test('demo identities are rejected even if an authentication dependency supplies one', async (t) => {
  const fixture = await serve(t, { userId: 'demo-user' })
  assert.equal((await fixture.request()).status, 401)
  assert.equal(fixture.queries.length, 0)
})

test('lookup is tenant-bound and uses the rendered Point geometry when saved location fields disagree', async (t) => {
  const fixture = await serve(t)
  const result = await fixture.request()
  assert.equal(result.status, 200)
  assert.deepEqual(fixture.queries[0].values, ['dossier-one', 'broker-one'])
  assert.equal(fixture.queries[0].timeout, 5000)
  assert.match(fixture.queries[0].sql, /d\.created_by_user_id = \$2/)
  assert.match(fixture.queries[0].sql, /p\.user_id = \$2/)
  assert.match(fixture.queries[0].sql, /property_p\.user_id = \$2/)
  assert.match(fixture.queries[0].sql, /property_p\.merged_into_prospect_id IS NULL/)
  assert.notEqual(ownedDossier.prospect_lat, ownedDossier.prospect_point_lat)
  assert.notEqual(ownedDossier.prospect_lng, ownedDossier.prospect_point_lng)
  assert.deepEqual(fixture.lookups, [{ latitude: 53.54, longitude: -113.5, municipality: 'Edmonton' }])
  assert.equal(result.body.coordinateBasis, 'prospect_point')
  assert.deepEqual(result.body.existingPin, { latitude: 53.54, longitude: -113.5 })
  assert.equal(result.body.dossierId, 'dossier-one')
  assert.equal(result.body.canonicalProspectId, 'prospect-one')
  assert.equal(result.body.lookupOrigin, 'saved_property')
  assert.equal(result.body.persistence, 'preview_only')
  assert.equal(JSON.stringify(result.body).includes('privateNotes'), false)
})

test('an occupant dossier resolves the displayed owned property pin instead of occupant or dossier coordinates', async (t) => {
  const fixture = await serve(t, { row: linkedOccupant })
  const result = await fixture.request()
  assert.equal(result.status, 200)
  assert.equal(result.body.canonicalProspectId, 'property-one')
  assert.equal(result.body.coordinateBasis, 'property_point')
  assert.deepEqual(result.body.existingPin, { latitude: 53.6, longitude: -113.6 })
  assert.deepEqual(fixture.lookups, [{ latitude: 53.6, longitude: -113.6 }])
  assert.equal(fixture.queries.length, 1)
})

test('a linked property without Point geometry may use its own saved point, never the occupant point', async (t) => {
  const fixture = await serve(t, { row: { ...linkedOccupant, property_point_lat: null, property_point_lng: null } })
  const result = await fixture.request()
  assert.equal(result.status, 200)
  assert.equal(result.body.coordinateBasis, 'property_location')
  assert.deepEqual(fixture.lookups, [{ latitude: 53.61, longitude: -113.61 }])
})

test('unresolved, malformed, self, chained or inaccessible property links require review without public lookup', async (t) => {
  for (const row of [
    { ...linkedOccupant, property_prospect_id: null, property_user_id: null },
    { ...linkedOccupant, property_user_id: 'another-broker' },
    { ...linkedOccupant, property_prospect_id: 'different-property' },
    { ...linkedOccupant, prospect_metadata: propertyLink('prospect-one') },
    { ...linkedOccupant, prospect_metadata: { propertyLink: { propertyProspectId: 'property-one' } } },
    { ...linkedOccupant, property_metadata: propertyLink('third-level') },
    { ...linkedOccupant, property_metadata: { propertyLink: {} } },
    { ...linkedOccupant, property_point_lat: null, property_point_lng: null, property_lat: null, property_lng: null },
    { ...linkedOccupant, prospect_id: null, prospect_user_id: null },
    { ...linkedOccupant, prospect_user_id: 'another-broker' },
  ] satisfies Array<Partial<Dossier>>) {
    const fixture = await serve(t, { row })
    const result = await fixture.request()
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'property_location_needs_review')
    assert.equal(JSON.stringify(result.body).includes('another-broker'), false)
    assert.equal(result.body.canonicalProspectId, undefined)
    assert.equal(result.body.existingPin, undefined)
    assert.equal(fixture.lookups.length, 0)
    assert.equal(fixture.downstream.calls, 0)
  }
})

test('standalone property memory retains its own point without requiring an active prospect', async (t) => {
  const fixture = await serve(t, { row: {
    linked_prospect_id: null, prospect_id: null, prospect_user_id: null,
    prospect_point_lat: null as any, prospect_point_lng: null as any,
    prospect_lat: null as any, prospect_lng: null as any,
  } })
  const result = await fixture.request()
  assert.equal(result.status, 200)
  assert.equal(result.body.coordinateBasis, 'dossier')
  assert.equal(result.body.canonicalProspectId, null)
  assert.deepEqual(fixture.lookups, [{ latitude: 53.56, longitude: -113.52, municipality: 'Edmonton' }])
})

test('another broker dossier and missing dossiers return the same not-found response', async (t) => {
  const missing = await serve(t, { row: null })
  const otherOwner = await serve(t, { row: { created_by_user_id: 'broker-two' } })
  const responses = await Promise.all([missing.request(), otherOwner.request()])
  assert.deepEqual(responses.map(({ status, body }) => ({ status, body })), [
    { status: 404, body: { code: 'property_not_found', message: 'Property not found.' } },
    { status: 404, body: { code: 'property_not_found', message: 'Property not found.' } },
  ])
  assert.equal(missing.lookups.length + otherOwner.lookups.length, 0)
})

test('client cannot override broker identity, point, parcel or upstream URL', async (t) => {
  const fixture = await serve(t)
  for (const body of [
    { userId: 'broker-two' }, { latitude: 53.5, longitude: -113.5 },
    { sourceParcelId: '12345' }, { url: 'http://127.0.0.1/private' }, [], null,
  ]) {
    const result = await fixture.request('/api/intel/dossiers/dossier-one/parcel-match/preview', { method: 'POST', body: JSON.stringify(body) })
    assert.equal(result.status, 400)
  }
  assert.equal((await fixture.request('/api/intel/dossiers/dossier-one/site-information?userId=broker-two')).status, 400)
  assert.equal((await fixture.request('/api/intel/dossiers/invalid%20id/site-information')).status, 400)
  assert.equal(fixture.queries.length, 0)
  assert.equal(fixture.lookups.length, 0)
})

test('GET and POST previews make only one SELECT apiece and never modify source records', async (t) => {
  const before = structuredClone(ownedDossier)
  const fixture = await serve(t)
  const first = await fixture.request()
  const second = await fixture.request('/api/intel/dossiers/dossier-one/parcel-match/preview', { method: 'POST', body: '{}' })
  assert.deepEqual(first.body, second.body)
  assert.equal(fixture.queries.length, 2)
  for (const { sql } of fixture.queries) {
    assert.match(sql.trim(), /^SELECT\b/)
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i)
  }
  assert.deepEqual(ownedDossier, before)
})

test('coordinate fallback retains complete pairs and never mixes map and dossier coordinates', async (t) => {
  const fixture = await serve(t, { row: { prospect_lat: null as any, prospect_point_lat: null as any } })
  const result = await fixture.request()
  assert.equal(result.body.coordinateBasis, 'dossier')
  assert.deepEqual(fixture.lookups, [{ latitude: 53.56, longitude: -113.52, municipality: 'Edmonton' }])
})

test('a prospect without Point geometry falls back to its complete saved location', async (t) => {
  const fixture = await serve(t, { row: { prospect_point_lat: null as any, prospect_point_lng: null as any } })
  const result = await fixture.request()
  assert.equal(result.body.coordinateBasis, 'prospect_location')
  assert.deepEqual(fixture.lookups, [{ latitude: 53.55, longitude: -113.51, municipality: 'Edmonton' }])
})

test('a missing saved location is explicit and never causes a guessed or geocoded point', async (t) => {
  const fixture = await serve(t, { row: {
    lat: null as any, lng: null as any, memory_payload: {} as any,
    prospect_lat: null as any, prospect_lng: null as any,
    prospect_point_lat: null as any, prospect_point_lng: null as any,
  } })
  const result = await fixture.request()
  assert.equal(result.status, 422)
  assert.equal(result.body.code, 'property_location_missing')
  assert.equal(fixture.lookups.length, 0)
})

test('a municipal failure is explicit unavailable evidence, with the existing point retained', async (t) => {
  const fixture = await serve(t, { lookupError: true })
  const result = await fixture.request()
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'unavailable')
  assert.equal(result.body.candidates.length, 0)
  assert.equal(result.body.currentZoning.length, 0)
  assert.deepEqual(result.body.existingPin, { latitude: 53.54, longitude: -113.5 })
  assert.equal(JSON.stringify(result.body).includes('diagnostic'), false)
  assert.equal(fixture.queries.length, 1)
})

test('a database failure does not initiate public lookup or reveal diagnostics', async (t) => {
  const fixture = await serve(t, { queryError: true })
  const result = await fixture.request()
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'property_record_unavailable')
  assert.equal(JSON.stringify(result.body).includes('Private'), false)
  assert.equal(fixture.lookups.length, 0)
})

test('a stalled record read returns a retry state and never launches a late municipal lookup', async (t) => {
  let release!: () => void
  const queryWait = new Promise<void>((resolve) => { release = resolve })
  const fixture = await serve(t, { queryWait, recordTimeoutMs: 20 })
  const result = await fixture.request()
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'property_record_unavailable')
  assert.equal(fixture.lookups.length, 0)
  release()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(fixture.lookups.length, 0)
  assert.equal((await fixture.request()).status, 200)
})

test('record read retries are capped while a failed pool still has outstanding reads', async (t) => {
  let release!: () => void
  const queryWait = new Promise<void>((resolve) => { release = resolve })
  const fixture = await serve(t, { queryWait, recordTimeoutMs: 100 })
  const pending = Array.from({ length: 8 }, () => fixture.request())
  const firstBatch = await Promise.all(pending)
  assert.ok(firstBatch.every(result => result.status === 503))
  const ninth = await fixture.request()
  assert.equal(ninth.status, 503)
  assert.equal(ninth.body.code, 'property_record_busy')
  assert.equal(fixture.queries.length, 8)
  assert.equal(fixture.lookups.length, 0)
  release()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal((await fixture.request()).status, 200)
  assert.equal(fixture.queries.length, 9)
})
