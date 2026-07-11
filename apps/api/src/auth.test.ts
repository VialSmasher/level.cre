import test from 'node:test'
import assert from 'node:assert/strict'

import { requireAuth, requireSalesActivityAuth } from './auth'

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
