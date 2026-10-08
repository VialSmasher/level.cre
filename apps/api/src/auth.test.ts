import test from 'node:test'
import assert from 'node:assert/strict'

import { SignJWT } from 'jose'
import { getUserId, legacyAgentRouteAllowed, phoneEnrichmentRouteAllowed, requireAuth, requireBrokerAuth, requireMarketRecordProposalAuth, requireSalesActivityAuth } from './auth'

function requestWithSalesKey(token: string) {
  return {
    headers: { 'x-levelcre-sales-key': token },
    app: { get: () => 'production' },
  } as any
}

function responseRecorder() {
  const response = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
  }
  return response as any
}

test('scoped sales activity credentials authenticate only through the sales middleware', async () => {
  const previous = {
    salesKey: process.env.SALES_ACTIVITY_AGENT_API_KEY,
    salesUserId: process.env.SALES_ACTIVITY_AGENT_USER_ID,
    intelKey: process.env.INTEL_AGENT_API_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  }

  process.env.SALES_ACTIVITY_AGENT_API_KEY = 'scoped-sales-key'
  process.env.SALES_ACTIVITY_AGENT_USER_ID = 'patrick-user-id'
  delete process.env.INTEL_AGENT_API_KEY
  delete process.env.SUPABASE_JWT_SECRET

  try {
    const scopedRequest = requestWithSalesKey('scoped-sales-key')
    const scopedResponse = responseRecorder()
    let scopedNextCalled = false
    await requireSalesActivityAuth(scopedRequest, scopedResponse, () => {
      scopedNextCalled = true
    })

    assert.equal(scopedNextCalled, true)
    assert.equal(scopedRequest.user.id, 'patrick-user-id')
    assert.equal(scopedRequest.user.role, 'sales_activity_agent')

    const generalRequest = requestWithSalesKey('scoped-sales-key')
    const generalResponse = responseRecorder()
    let generalNextCalled = false
    await requireAuth(generalRequest, generalResponse, () => {
      generalNextCalled = true
    })

    assert.equal(generalNextCalled, false)
    assert.equal(generalResponse.statusCode, 401)
  } finally {
    if (previous.salesKey === undefined) delete process.env.SALES_ACTIVITY_AGENT_API_KEY
    else process.env.SALES_ACTIVITY_AGENT_API_KEY = previous.salesKey
    if (previous.salesUserId === undefined) delete process.env.SALES_ACTIVITY_AGENT_USER_ID
    else process.env.SALES_ACTIVITY_AGENT_USER_ID = previous.salesUserId
    if (previous.intelKey === undefined) delete process.env.INTEL_AGENT_API_KEY
    else process.env.INTEL_AGENT_API_KEY = previous.intelKey
    if (previous.jwtSecret === undefined) delete process.env.SUPABASE_JWT_SECRET
    else process.env.SUPABASE_JWT_SECRET = previous.jwtSecret
  }
})

test('scoped sales activity credentials reject the wrong token', async () => {
  const previousKey = process.env.SALES_ACTIVITY_AGENT_API_KEY
  const previousUserId = process.env.SALES_ACTIVITY_AGENT_USER_ID
  process.env.SALES_ACTIVITY_AGENT_API_KEY = 'expected-key'
  process.env.SALES_ACTIVITY_AGENT_USER_ID = 'patrick-user-id'

  try {
    const request = requestWithSalesKey('wrong-key')
    const response = responseRecorder()
    let nextCalled = false
    await requireSalesActivityAuth(request, response, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, false)
    assert.equal(response.statusCode, 401)
  } finally {
    if (previousKey === undefined) delete process.env.SALES_ACTIVITY_AGENT_API_KEY
    else process.env.SALES_ACTIVITY_AGENT_API_KEY = previousKey
    if (previousUserId === undefined) delete process.env.SALES_ACTIVITY_AGENT_USER_ID
    else process.env.SALES_ACTIVITY_AGENT_USER_ID = previousUserId
  }
})

test('scoped sales activity credentials can submit map proposals without crossing the approval gate', async () => {
  const previousKey = process.env.SALES_ACTIVITY_AGENT_API_KEY
  const previousUserId = process.env.SALES_ACTIVITY_AGENT_USER_ID
  process.env.SALES_ACTIVITY_AGENT_API_KEY = 'scoped-sales-key'
  process.env.SALES_ACTIVITY_AGENT_USER_ID = 'patrick-user-id'

  try {
    const request = requestWithSalesKey('scoped-sales-key')
    const response = responseRecorder()
    let nextCalled = false
    await requireMarketRecordProposalAuth(request, response, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, true)
    assert.equal(request.user.id, 'patrick-user-id')
    assert.equal(request.user.role, 'sales_activity_agent')
  } finally {
    if (previousKey === undefined) delete process.env.SALES_ACTIVITY_AGENT_API_KEY
    else process.env.SALES_ACTIVITY_AGENT_API_KEY = previousKey
    if (previousUserId === undefined) delete process.env.SALES_ACTIVITY_AGENT_USER_ID
    else process.env.SALES_ACTIVITY_AGENT_USER_ID = previousUserId
  }
})

test('agent credentials cannot cross the broker approval gate', async () => {
  const previousKey = process.env.INTEL_AGENT_API_KEY
  const previousUserId = process.env.INTEL_AGENT_USER_ID
  process.env.INTEL_AGENT_API_KEY = 'intel-agent-key'
  process.env.INTEL_AGENT_USER_ID = 'patrick-user-id'

  try {
    const request = {
      headers: { 'x-levelcre-agent-key': 'intel-agent-key' },
      app: { get: () => 'production' },
    } as any
    const response = responseRecorder()
    let nextCalled = false
    await requireBrokerAuth(request, response, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, false)
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.payload, { message: 'Broker approval is required for this action.' })
  } finally {
    if (previousKey === undefined) delete process.env.INTEL_AGENT_API_KEY
    else process.env.INTEL_AGENT_API_KEY = previousKey
    if (previousUserId === undefined) delete process.env.INTEL_AGENT_USER_ID
    else process.env.INTEL_AGENT_USER_ID = previousUserId
  }
})

test('scoped market-record credentials cannot cross the broker approval gate', async () => {
  const previousKey = process.env.MARKET_RECORD_AGENT_API_KEY
  const previousUserId = process.env.MARKET_RECORD_AGENT_USER_ID
  process.env.MARKET_RECORD_AGENT_API_KEY = 'market-agent-key'
  process.env.MARKET_RECORD_AGENT_USER_ID = 'patrick-user-id'

  try {
    const request = {
      headers: { 'x-levelcre-market-key': 'market-agent-key' },
      app: { get: () => 'production' },
    } as any
    const response = responseRecorder()
    let nextCalled = false
    await requireBrokerAuth(request, response, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, false)
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.payload, { message: 'Broker approval is required for this action.' })
  } finally {
    if (previousKey === undefined) delete process.env.MARKET_RECORD_AGENT_API_KEY
    else process.env.MARKET_RECORD_AGENT_API_KEY = previousKey
    if (previousUserId === undefined) delete process.env.MARKET_RECORD_AGENT_USER_ID
    else process.env.MARKET_RECORD_AGENT_USER_ID = previousUserId
  }
})

const phoneEnrichmentEndpoints = [
  { method: 'GET', path: '/api/agent/phone-enrichment/context' },
  { method: 'POST', path: '/api/agent/phone-enrichment/batch' },
] as const

async function withPhoneEnrichmentAuthEnvironment(action: () => Promise<void>) {
  const fixture = {
    SALES_ACTIVITY_AGENT_API_KEY: 'phone-enrichment-sales-key',
    SALES_ACTIVITY_AGENT_USER_ID: 'sales-credential-owner',
    SALES_ACTIVITY_AGENT_EMAIL: 'sales-owner@example.test',
    INTEL_AGENT_API_KEY: 'unrelated-intel-key',
    INTEL_AGENT_USER_ID: 'intel-credential-owner',
    SUPABASE_JWT_SECRET: 'phone-enrichment-jwt-test-secret-with-sufficient-length',
    SUPABASE_URL: 'https://phone-enrichment-test.supabase.co',
    VITE_SUPABASE_URL: 'https://phone-enrichment-test.supabase.co',
  }
  const previous = new Map(Object.keys(fixture).map(key => [key, process.env[key]]))
  Object.assign(process.env, fixture)
  try { await action() } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('phone enrichment exceptions require verified sales scope and exact endpoint methods', () => {
  for (const endpoint of phoneEnrichmentEndpoints) {
    assert.equal(phoneEnrichmentRouteAllowed(endpoint.method, endpoint.path), true)
    assert.equal(legacyAgentRouteAllowed(endpoint.method, endpoint.path), false)
    assert.equal(legacyAgentRouteAllowed(endpoint.method, endpoint.path, true), true)
  }
  for (const endpoint of [
    { method: 'POST', path: '/api/agent/phone-enrichment/context' },
    { method: 'GET', path: '/api/agent/phone-enrichment/batch' },
    { method: 'PATCH', path: '/api/agent/phone-enrichment/batch' },
    { method: 'POST', path: '/api/agent/phone-enrichment/batch/foreign-record' },
    { method: 'GET', path: '/api/agent/phone-enrichment/context/' },
    { method: 'GET', path: '/api/agent/phone-enrichment/context-other' },
  ]) {
    assert.equal(phoneEnrichmentRouteAllowed(endpoint.method, endpoint.path), false)
    assert.equal(legacyAgentRouteAllowed(endpoint.method, endpoint.path, true), false)
  }
  assert.equal(legacyAgentRouteAllowed('GET', '/api/prospects'), true)
  assert.equal(legacyAgentRouteAllowed('PATCH', '/api/prospects/some-record'), false)
})

test('phone enrichment binds header and bearer sales credentials to the configured owner', async () => {
  await withPhoneEnrichmentAuthEnvironment(async () => {
    for (const [index, endpoint] of phoneEnrichmentEndpoints.entries()) {
      const request = {
        ...requestWithSalesKey('phone-enrichment-sales-key'), ...endpoint,
        body: { userId: 'foreign-body-owner', actor: { userId: 'foreign-body-owner' } },
        query: { userId: 'foreign-query-owner' },
        user: { id: 'untrusted-preexisting-owner' },
      } as any
      if (index === 1) request.headers = { authorization: 'Bearer phone-enrichment-sales-key' }
      const response = responseRecorder()
      let nextCalled = false
      await requireSalesActivityAuth(request, response, () => { nextCalled = true })
      assert.equal(nextCalled, true)
      assert.equal(getUserId(request), 'sales-credential-owner')
      assert.equal(request.user.email, 'sales-owner@example.test')
      assert.equal(request.user.role, 'sales_activity_agent')
    }
  })
})

test('phone enrichment rejects Intel-only, invalid sales and unsupported scoped methods before a handler', async () => {
  await withPhoneEnrichmentAuthEnvironment(async () => {
    for (const endpoint of phoneEnrichmentEndpoints) {
      for (const headers of [
        { 'x-levelcre-agent-key': 'unrelated-intel-key' },
        { authorization: 'Bearer unrelated-intel-key' },
        { 'x-levelcre-sales-key': 'wrong-sales-key' },
        {},
      ]) {
        const request = { ...endpoint, headers, app: { get: () => 'production' }, body: { userId: 'sales-credential-owner' } } as any
        const response = responseRecorder()
        let handlerCalled = false
        await requireSalesActivityAuth(request, response, () => { handlerCalled = true })
        assert.equal(handlerCalled, false)
        assert.ok(response.statusCode === 401 || response.statusCode === 403)
        assert.equal(request.user, undefined)
      }
    }
    const request = { ...requestWithSalesKey('phone-enrichment-sales-key'), method: 'POST', path: '/api/agent/phone-enrichment/context' }
    const response = responseRecorder()
    let handlerCalled = false
    await requireSalesActivityAuth(request, response, () => { handlerCalled = true })
    assert.equal(handlerCalled, false)
    assert.equal(response.statusCode, 403)
  })
})

test('phone enrichment accepts a verified broker JWT and uses its subject instead of body owner', async () => {
  await withPhoneEnrichmentAuthEnvironment(async () => {
    const token = await new SignJWT({ email: 'signed-broker@example.test' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('signed-broker-owner')
      .setIssuer('https://phone-enrichment-test.supabase.co/auth/v1')
      .setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))
    for (const endpoint of phoneEnrichmentEndpoints) {
      const request = { ...endpoint, headers: { authorization: 'Bearer ' + token }, app: { get: () => 'production' }, body: { userId: 'foreign-body-owner' } } as any
      const response = responseRecorder()
      let handlerCalled = false
      await requireSalesActivityAuth(request, response, () => { handlerCalled = true })
      assert.equal(handlerCalled, true)
      assert.equal(getUserId(request), 'signed-broker-owner')
      assert.equal(request.user.email, 'signed-broker@example.test')
    }
  })
})
