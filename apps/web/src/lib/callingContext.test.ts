import assert from 'node:assert/strict'
import test from 'node:test'
import { callingEmailLink } from './callingEmail'
import { callingTouchContext, callingTouchLabel, callingTouchNote, latestCallingTouch } from './callingContext'
import type { CallingActivity } from './mobileCalling'

const touch = (id: string, occurredAt: string, fields: Partial<CallingActivity> = {}): CallingActivity => ({ id, occurredAt, type: 'call', outcome: 'attempted', notes: '', contactId: 'person-a', contactName: 'Person A', phoneSnapshot: null, ...fields })

test('last touch uses the actual activity date when old history is imported later', () => {
  const older = touch('imported-later', '2026-10-02T18:00:00Z')
  const newer = touch('newer', '2026-10-07T18:00:00Z', { type: 'email', direction: 'outbound', evidenceStatus: 'confirmed' })
  assert.equal(latestCallingTouch([older, newer])?.id, 'newer')
  assert.equal(latestCallingTouch([touch('invalid', 'not-a-date'), older, newer])?.id, 'newer')
  assert.equal(latestCallingTouch([touch('date-only', '2026-10-08'), newer])?.id, 'date-only')
})

test('drafts, unconfirmed evidence and internal notes do not become last touches', () => {
  const confirmed = touch('confirmed', '2026-10-01')
  const excluded = [touch('note', '2026-10-08', { type: 'note' }), touch('internal', '2026-10-08', { type: 'email', direction: 'internal' }), touch('draft', '2026-10-08', { type: 'email', outcome: 'drafted' }), touch('queued', '2026-10-08', { type: 'email', outcome: 'queued' }), touch('click', '2026-10-08', { evidenceStatus: 'observed' }), touch('inferred', '2026-10-08', { evidenceStatus: 'inferred' }), touch('undo', '2026-10-08', { outcome: 'discarded' })]
  assert.equal(latestCallingTouch([...excluded, confirmed])?.id, 'confirmed')
  assert.equal(latestCallingTouch(excluded), null)
})

test('company or another person history never masquerades as the selected person', () => {
  const a = touch('a', '2026-10-05')
  const b = touch('b', '2026-10-07', { contactId: 'person-b', contactName: 'Person B' })
  assert.deepEqual(callingTouchContext([a, b], [b], 'person-a'), { scope: 'contact', activity: a })
  assert.deepEqual(callingTouchContext([b], [b], 'person-a'), { scope: 'account', activity: b })
  assert.deepEqual(callingTouchContext([a], [b], null), { scope: 'account', activity: b })
  assert.equal(callingTouchContext([], [], 'person-a'), null)
})

test('email labels distinguish confirmed sends and inbound messages without inventing replies', () => {
  const email = touch('mail', '2026-10-08', { type: 'email', outcome: 'contacted' })
  assert.equal(callingTouchLabel({ ...email, direction: 'outbound', evidenceStatus: 'confirmed' }), 'Email sent')
  assert.equal(callingTouchLabel({ ...email, direction: 'inbound', evidenceStatus: 'confirmed' }), 'Email received')
  assert.equal(callingTouchLabel({ ...email, direction: 'outbound' }), 'Email recorded')
  assert.equal(callingTouchLabel({ ...email, evidenceStatus: 'confirmed' }), 'Email recorded')
})

test('email context prefers its recorded subject and keeps notes short without changing evidence', () => {
  const email = touch('mail', '2026-10-08', { type: 'email', subject: 'Facility renewal timing', notes: 'Verified metadata-only sync receipt.' })
  assert.equal(callingTouchNote(email), 'Facility renewal timing')
  assert.equal(callingTouchNote({ ...email, subject: null, notes: 'Left voicemail.\nCheck back in November.' }), 'Left voicemail. Check back in November.')
  const long = { ...email, subject: 'A'.repeat(240) }
  assert.equal(callingTouchNote(long).length, 198)
  assert.equal(long.subject.length, 240)
})

test('email action opens one encoded saved recipient with no hidden compose headers', () => {
  assert.deepEqual(callingEmailLink('  pat.sales+vm@example.invalid  '), { email: 'pat.sales+vm@example.invalid', href: 'mailto:pat.sales%2Bvm@example.invalid' })
  for (const invalid of [null, undefined, '', 'mailto:pat@example.invalid', 'Pat <pat@example.invalid>', 'a@example.invalid,b@example.invalid', 'a@example.invalid;b@example.invalid', 'a@example.invalid?bcc=b@example.invalid', 'a@example.invalid\r\nBcc:b@example.invalid', 'javascript:alert(1)', 'a'.repeat(321) + '@example.invalid']) assert.equal(callingEmailLink(invalid), null)
})
