import assert from 'node:assert/strict'
import test from 'node:test'

import { blockConfirmedPhone, buildTelHref, createMobileCallSession, freezeCallConfirmation, restorePendingCallSession, callSessionStorageKey, contactPhoneOptions, nextCallingChoice, preferredCallingChoice, nextCallFollowUpIso, nextUncalledContact, parseStoredCallSession, type CallQueueCandidate, type CallingContact, type CallingPhoneReadiness } from './mobileCalling'

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

const readiness: CallingPhoneReadiness = {
  status: 'ready', reason: 'usable_number', researchEligible: false, lastResearch: null,
  preferredContactId: primary.id, preferredPhoneKey: '17805550100', blockedChoices: [],
  usableChoices: [
    { contactId: primary.id, contactName: 'Morgan', phoneKey: '17805550100', number: primary.phone!, label: 'Main', dialHref: 'tel:+17805550100', isPrimary: true },
    { contactId: primary.id, contactName: 'Morgan', phoneKey: '17805550101', number: '780-555-0101', label: 'Mobile', dialHref: 'tel:+17805550101', isPrimary: true },
    { contactId: 'contact-2', contactName: 'Company main line', phoneKey: '17805550100', number: primary.phone!, label: 'Main', dialHref: 'tel:+17805550100', isPrimary: false },
  ],
}

test('server readiness chooses the company main line when the named primary has no usable number', () => {
  const companyMain = { ...readiness, usableChoices: [readiness.usableChoices[2]], preferredContactId: 'contact-2' }
  assert.equal(preferredCallingChoice(companyMain)?.contactName, 'Company main line')
  assert.equal(preferredCallingChoice(companyMain, primary.id), null)
  assert.equal(contactPhoneOptions(primary, null).some((option) => option.href), false)
})

test('confirmed bad-number feedback blocks only the frozen contact and exact phone choice', () => {
  const blocked = blockConfirmedPhone(readiness, { contactId: primary.id, phoneKey: '17805550100', expectedPhone: primary.phone! }, 'wrong_number')
  assert.equal(blocked.usableChoices.length, 2)
  assert.equal(blocked.usableChoices.find((choice) => choice.contactId === 'contact-2')?.number, primary.phone)
  assert.equal(blocked.preferredPhoneKey, '17805550101')
  const options = contactPhoneOptions(primary, blocked)
  assert.equal(options.find((option) => option.phoneKey === '17805550100')?.href, null)
  assert.equal(options.find((option) => option.phoneKey === '17805550100')?.blockedReason, 'wrong_number')
  assert.equal(options.find((option) => option.phoneKey === '17805550101')?.href, 'tel:+17805550101')
  assert.deepEqual(blockConfirmedPhone(blocked, { contactId: primary.id, phoneKey: '17805550100', expectedPhone: primary.phone! }, 'wrong_number'), blocked)
})

test('bad-number recovery prepares another exact phone before changing company and never guesses a raw number', () => {
  const current = { contactId: primary.id, phoneKey: '17805550100', expectedPhone: primary.phone! }
  assert.equal(nextCallingChoice(readiness, current)?.phoneKey, '17805550101')
  const onlySibling = { ...readiness, usableChoices: [readiness.usableChoices[2]] }
  assert.equal(nextCallingChoice(onlySibling, current)?.contactId, 'contact-2')
  assert.equal(nextCallingChoice(onlySibling, current, new Set(['contact-2'])), null)
  assert.equal(nextCallingChoice(null, current), null)
  const exhausted = blockConfirmedPhone({ ...readiness, usableChoices: [readiness.usableChoices[0]] }, current, 'disconnected')
  assert.equal(exhausted.status, 'needs_number')
  assert.equal(exhausted.preferredPhoneKey, null)
})

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
  const badNumber = { ...session, phoneKey: '17805550101', nextPhoneKey: '17805550100', confirmation: { outcome: 'wrong_number', notes: 'Frozen feedback' } }
  assert.deepEqual(parseStoredCallSession(JSON.stringify(badNumber), 'broker-1'), badNumber)
  assert.deepEqual(parseStoredCallSession(JSON.stringify({ ...badNumber, confirmation: { ...badNumber.confirmation, outcome: 'disconnected' } }), 'broker-1')?.confirmation?.outcome, 'disconnected')
  const normalized = { ...badNumber, expectedPhone: '780-555-0100 ext 123', phoneKey: '7805550100:123', contactSnapshot: { ...primary, phone: '780-555-0100 ext. 123' }, candidate: { ...badNumber.candidate, phoneReadiness: { ...readiness, usableChoices: [{ ...readiness.usableChoices[0], phoneKey: '7805550100:123', number: '780-555-0100 ext 123' }] } } }
  assert.deepEqual(parseStoredCallSession(JSON.stringify(normalized), 'broker-1'), normalized)
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

function sessionCandidate(): CallQueueCandidate {
  return { id: 'call:prospect-1', priorityScore: 1, priority: 'medium', reasons: ['Owned record'],
    contact: { name: primary.name, company: primary.company, email: primary.email, phone: primary.phone! },
    prospect: { id: 'prospect-1', name: 'Test company', status: 'prospect', businessName: 'Test company',
      address: null, followUpDueDate: null, lastContactDate: null }, listingTitles: [], recentActivity: [],
    phoneReadiness: structuredClone(readiness) }
}

test('shared start freezes the canonical contact, phone and account independently of later edits', () => {
  const candidate = sessionCandidate()
  const contact = structuredClone(primary)
  const choice = candidate.phoneReadiness!.usableChoices[1]
  const session = createMobileCallSession('broker-1', candidate, contact, choice, {
    clientEventId: 'call-frozen-map', startedAt: '2026-10-08T18:00:00Z',
  })!
  assert.equal(session.expectedPhone, '780-555-0101')
  assert.equal(session.phoneKey, choice.phoneKey)
  candidate.prospect.name = 'Changed account'
  candidate.phoneReadiness!.usableChoices[1].number = '780-555-0199'
  contact.name = 'Different person'
  contact.additionalPhones[0].number = '780-555-0198'
  assert.equal(session.candidate.prospect.name, 'Test company')
  assert.equal(session.contactSnapshot?.name, 'Morgan')
  assert.equal(session.contactSnapshot?.additionalPhones[0].number, '780-555-0101')
  assert.equal(session.candidate.phoneReadiness?.usableChoices[1].number, '780-555-0101')
  assert.equal(parseStoredCallSession(JSON.stringify(session), 'broker-1')?.clientEventId, 'call-frozen-map')
  assert.equal(parseStoredCallSession(JSON.stringify(session), 'broker-2'), null)
})

test('shared start rejects absent or blocked readiness and mismatched contact or phone identity', () => {
  const candidate = sessionCandidate()
  const choice = candidate.phoneReadiness!.usableChoices[0]
  assert.ok(createMobileCallSession('broker-1', candidate, primary, choice))
  assert.equal(createMobileCallSession('', candidate, primary, choice), null)
  assert.equal(createMobileCallSession('broker-1', { ...candidate, phoneReadiness: undefined }, primary, choice), null)
  const blocked = { ...candidate, phoneReadiness: blockConfirmedPhone(candidate.phoneReadiness!, { contactId: primary.id, expectedPhone: primary.phone!, phoneKey: choice.phoneKey }, 'wrong_number') }
  assert.equal(createMobileCallSession('broker-1', blocked, primary, choice), null)
  assert.equal(createMobileCallSession('broker-1', candidate, { ...primary, prospectId: 'foreign-record' }, choice), null)
  assert.equal(createMobileCallSession('broker-1', candidate, { ...primary, archivedAt: '2026-10-08' }, choice), null)
  assert.equal(createMobileCallSession('broker-1', candidate, primary, { ...choice, contactId: 'another-contact' }), null)
  assert.equal(createMobileCallSession('broker-1', candidate, primary, { ...choice, number: '780-555-0199' }), null)
  assert.equal(createMobileCallSession('broker-1', candidate, primary, { ...choice, dialHref: 'tel:7805550199' }), null)
})

test('cross-view confirmation retry keeps first outcome, note, follow-up and alternate intent', () => {
  const candidate = sessionCandidate()
  const session = createMobileCallSession('broker-1', candidate, primary, candidate.phoneReadiness!.usableChoices[0])!
  const frozen = freezeCallConfirmation({ ...session, origin: 'map' }, { outcome: 'wrong_number', notes: 'Verified wrong recipient', nextFollowUp: null }, {
    afterConfirmation: 'another_contact', nextContactId: 'contact-2', nextPhoneKey: '17805550101',
  })
  const retryFromAnotherView = freezeCallConfirmation(frozen, { outcome: 'contacted', notes: 'Different draft', nextFollowUp: '2026-10-09T12:00:00Z' })
  assert.equal(retryFromAnotherView, frozen)
  assert.equal(frozen.confirmation?.outcome, 'wrong_number')
  assert.equal(frozen.confirmation?.notes, 'Verified wrong recipient')
  assert.equal(frozen.confirmation?.nextFollowUp, null)
  assert.equal(frozen.nextContactId, 'contact-2')
  assert.equal(frozen.afterConfirmation, 'another_contact')
  assert.equal(frozen.origin, 'calls')
  assert.equal(frozen.clientEventId, session.clientEventId)
})

test('map confirmation preserves an omitted follow-up and never invents a second call', () => {
  const candidate = sessionCandidate()
  const session = createMobileCallSession('broker-1', candidate, primary, candidate.phoneReadiness!.usableChoices[0])!
  const frozen = freezeCallConfirmation(session, { outcome: 'attempted', notes: '' })
  assert.equal(Object.hasOwn(frozen.confirmation!, 'nextFollowUp'), false)
  assert.equal(frozen.origin, 'map')
  assert.equal(frozen.nextContactId, null)
  assert.equal(frozen.nextPhoneKey, null)
  assert.equal(frozen.clientEventId, session.clientEventId)
  assert.equal(frozen.expectedPhone, session.expectedPhone)
})

test('server-recovered normalized extension retains the saved outcome and note on another reload', () => {
  const candidate = sessionCandidate()
  // The real server snapshot contains scalar account fields, not readiness. A
  // company line can be callable even while the legacy primary phone is null.
  delete candidate.phoneReadiness
  candidate.contact.phone = null as unknown as string
  const contact = { ...structuredClone(primary), phone: '780-555-0100;ext=204', additionalPhones: [] }
  const recovered = restorePendingCallSession('broker-1', {
    clientEventId: 'call-server-extension', eventId: 'saved-server-event', prospectId: 'prospect-1',
    callStartedAt: '2026-10-08T18:00:00Z', phoneSnapshot: '780-555-0100 ext 204',
    candidate, contactId: contact.id, contactSnapshot: contact,
  })
  assert.equal(recovered.phoneKey, '7805550100:204')
  assert.equal(recovered.candidate.contact.phone, '')
  const frozen = freezeCallConfirmation(recovered, { outcome: 'no_answer', notes: 'Keep the switchboard extension.', nextFollowUp: null })
  const reloaded = parseStoredCallSession(JSON.stringify(frozen), 'broker-1')
  assert.ok(reloaded)
  assert.deepEqual(reloaded.confirmation, frozen.confirmation)
  assert.equal(reloaded.contactId, contact.id)
  assert.equal(reloaded.expectedPhone, '780-555-0100 ext 204')
  assert.equal(parseStoredCallSession(JSON.stringify({ ...frozen, expectedPhone: '780-555-0100 ext 205' }), 'broker-1'), null)
  assert.equal(parseStoredCallSession(JSON.stringify(frozen), 'broker-2'), null)
})
