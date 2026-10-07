import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTelHref, callSessionStorageKey, nextCallFollowUpIso, parseStoredCallSession } from './mobileCalling'

test('tap-to-call keeps only dialable phone characters', () => {
  assert.equal(buildTelHref('+1 (780) 555-0100'), 'tel:+17805550100')
  assert.equal(buildTelHref(''), null)
  assert.equal(buildTelHref('780-555-0100 extension 123'), 'tel:7805550100')
  assert.equal(buildTelHref('780-555-0100 ext. 123'), 'tel:7805550100')
  assert.equal(buildTelHref('780-555-0100;ext=123'), 'tel:7805550100')
  assert.equal(buildTelHref('ask reception'), null)
  assert.equal(buildTelHref('123'), null)
  assert.equal(buildTelHref('++17805550100'), null)
})

test('next-call options resolve to stable noon UTC dates', () => {
  const now = new Date('2026-08-22T23:30:00.000Z')
  assert.equal(nextCallFollowUpIso('tomorrow', now), '2026-08-23T12:00:00.000Z')
  assert.equal(nextCallFollowUpIso('3d', now), '2026-08-25T12:00:00.000Z')
  assert.equal(nextCallFollowUpIso('1w', now), '2026-08-29T12:00:00.000Z')
  assert.equal(nextCallFollowUpIso('none', now), null)
  assert.equal(nextCallFollowUpIso('tomorrow', new Date('2026-08-23T04:00:00.000Z')), '2026-08-23T12:00:00.000Z')
})

test('stored call sessions restore only with complete attribution evidence', () => {
  const session = {
    brokerId: 'broker-1',
    clientEventId: 'call-session-123',
    prospectId: 'prospect-1',
    expectedPhone: '780-555-0100',
    startedAt: '2026-08-22T18:00:00.000Z',
    recorded: false,
    candidate: {
      prospect: { id: 'prospect-1', name: 'Test prospect' }, contact: { phone: '780-555-0100' },
      reasons: [], recentActivity: [], listingTitles: [],
    },
  }
  assert.deepEqual(parseStoredCallSession(JSON.stringify(session), 'broker-1'), session)
  assert.equal(parseStoredCallSession(JSON.stringify(session), 'broker-2'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, brokerId: undefined }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, candidate: { prospect: { id: 'another' } } }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ prospectId: 'prospect-1' }), 'broker-1'), null)
  assert.equal(parseStoredCallSession('not-json', 'broker-1'), null)
  assert.notEqual(callSessionStorageKey('broker-1'), callSessionStorageKey('broker-2'))
})
