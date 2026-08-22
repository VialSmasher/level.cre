import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeCaptureHealth } from './captureHealthService'
import type { ProductionActivityRow } from './productionActivityService'

function canonical(timestamp: string): ProductionActivityRow {
  return {
    id: `activity:${timestamp}`,
    timestamp,
    date: timestamp,
    type: 'email',
    action: 'email_sent',
    direction: 'outbound',
    sourceProvider: 'codex_followup',
    sourceMetadata: {},
    prospectId: null,
    interactionId: null,
  }
}

test('flags the count gap that caused missing email production credit', () => {
  const capturedRows = Array.from({ length: 10 }, (_, index) => ({
    provider: 'postmark',
    provider_message_id: `message-${index}`,
    subject: `Prospecting ${index}`,
    recipient_emails: [`prospect-${index}@example.com`],
    sent_at: `2026-08-21T${String(index + 10).padStart(2, '0')}:00:00.000Z`,
    created_at: null,
  }))
  const canonicalRows = capturedRows.slice(0, 8).map((row) => canonical(row.sent_at))

  const health = summarizeCaptureHealth({
    capturedRows,
    canonicalRows,
    now: new Date('2026-08-22T12:00:00.000Z'),
    days: 7,
  })

  assert.equal(health.status, 'attention')
  assert.equal(health.unreconciledCount, 2)
  assert.equal(health.capturedOutboundEmails, 10)
  assert.equal(health.canonicalOutboundEmails, 8)
})

test('deduplicates the same captured message arriving through two providers', () => {
  const capturedRows = [
    {
      provider: 'outlook', provider_message_id: 'outlook-one', subject: 'Hello',
      recipient_emails: ['prospect@example.com'], sent_at: '2026-08-21T10:00:10.000Z', created_at: null,
    },
    {
      provider: 'postmark', provider_message_id: 'postmark-one', subject: 'Hello',
      recipient_emails: ['prospect@example.com'], sent_at: '2026-08-21T10:00:40.000Z', created_at: null,
    },
  ]
  const health = summarizeCaptureHealth({
    capturedRows,
    canonicalRows: [canonical('2026-08-21T10:00:20.000Z')],
    now: new Date('2026-08-22T12:00:00.000Z'),
  })

  assert.equal(health.status, 'healthy')
  assert.equal(health.capturedOutboundEmails, 1)
  assert.equal(health.canonicalOutboundEmails, 1)
})
