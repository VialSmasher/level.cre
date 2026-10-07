import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTelHref, callSessionStorageKey, contactPhoneOptions, nextCallFollowUpIso, nextUncalledContact, parseStoredCallSession, type CallingContact } from './mobileCalling'

test('tap-to-call keeps only dialable phone characters', () => {
  assert.equal(buildTelHref('+1 (780) 555-0100'), 'tel:+17805550100')
  assert.equal(buildTelHref(''), null)
  assert.equal(buildTelHref('780-555-0100 extension 123'), 'tel:7805550100')
  assert.equal(buildTelHref('780-555-0100 ext. 123'), 'tel:7805550100')
  assert.equal(buildTelHref('780-555-0100;ext=123'), 'tel:7805550100')
  assert.equal(buildTelHref('ask reception'), null)
  assert.equal(buildTelHref('123'), null)
  assert.equal(buildTelHref('++17805550100'), null)
  assert.equal(buildTelHref('780-555-0100, 780-555-0101'), null)
  assert.equal(buildTelHref('780-555-0100 ext. ask reception'), null)
})

const primary: CallingContact = { id: 'contact-1', prospectId: 'prospect-1', isPrimary: true, name: 'Morgan', company: 'Test company', email: null, phone: '780-555-0100', additionalPhones: [{ label: 'Mobile', number: '780-555-0101' }], title: null, archivedAt: null }

test('contact phone choices preserve the exact selected number and do not guess invalid options', () => {
  const options = contactPhoneOptions({ ...primary, additionalPhones: [...primary.additionalPhones, { label: 'Repeated', number: primary.phone! }, { label: 'Office', number: 'ask reception' }] })
  assert.deepEqual(options.map((option) => option.number), ['780-555-0100', '780-555-0101', 'ask reception'])
  assert.equal(options[1].href, 'tel:7805550101')
  assert.equal(options[2].href, null)
})

test('alternate contact selection skips only attributed same-day calls and invalid or archived contacts', () => {
  const contacts = [primary, { ...primary, id: 'contact-2' }, { ...primary, id: 'contact-3' }, { ...primary, id: 'contact-4', archivedAt: '2026-10-07' }]
  const history = [{ id: 'call-1', type: 'call', outcome: 'attempted', occurredAt: '2026-10-07T18:00:00Z', notes: '', contactId: 'contact-2', contactName: null, phoneSnapshot: null }]
  assert.equal(nextUncalledContact(contacts, primary.id, history, new Set(), new Date('2026-10-07T20:00:00Z'))?.id, 'contact-3')
  assert.equal(nextUncalledContact(contacts, primary.id, history, new Set(['contact-3']), new Date('2026-10-07T20:00:00Z')), null)
  assert.equal(nextUncalledContact(contacts, primary.id, [{ ...history[0], contactId: null }], new Set(), new Date('2026-10-07T20:00:00Z'))?.id, 'contact-2')
  assert.equal(nextUncalledContact(contacts, primary.id, [{ ...history[0], occurredAt: '2026-10-07T04:00:00Z' }], new Set(), new Date('2026-10-07T20:00:00Z'))?.id, 'contact-2')
  assert.equal(nextUncalledContact(contacts, primary.id, [{ ...history[0], occurredAt: '2026-10-07' }], new Set(), new Date('2026-10-07T20:00:00Z'))?.id, 'contact-3')
})

test('restored contact snapshot and alternate intent retain person and number attribution', () => {
  const session = {
    brokerId: 'broker-1', clientEventId: 'call-contact-1', prospectId: 'prospect-1',
    expectedPhone: '780-555-0101', startedAt: '2026-10-07T18:00:00Z', recorded: true,
    candidate: { prospect: { id: 'prospect-1', name: 'Test company' }, contact: { phone: '780-555-0100' }, reasons: [], recentActivity: [], listingTitles: [] },
    contactId: primary.id, contactSnapshot: primary,
    confirmation: { outcome: 'attempted', notes: 'Frozen note' },
    afterConfirmation: 'another_contact', nextContactId: 'contact-2',
  }
  assert.deepEqual(parseStoredCallSession(JSON.stringify(session), 'broker-1'), session)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, contactId: 'other-contact' }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, contactSnapshot: null }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, expectedPhone: '780-555-0199' }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify({ ...session, afterConfirmation: 'unexpected' }), 'broker-1'), null)
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
