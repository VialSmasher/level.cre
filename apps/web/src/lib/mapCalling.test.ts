import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMapPhoneEntry, directMapContacts, mapCallCandidate, mapPhoneKey } from './mapCalling'
import { parseStoredCallSession, createMobileCallSession, type CallingWorkspace } from './mobileCalling'

const primaryId = '00000000-0000-4000-8000-000000000001'
const alternateId = '00000000-0000-4000-8000-000000000002'
const companyLineId = '00000000-0000-4000-8000-000000000003'
function fixture(): CallingWorkspace {
  return {
    prospect: { id: 'asset-1', name: '', businessName: 'Example Manufacturing', status: 'prospect', address: 'Example address', lastContactDate: null, followUpDueDate: null, notes: null, buildingSf: null, lotSizeAcres: null, aiMetadata: {}, websiteUrl: null },
    primaryContactId: primaryId, unattributedActivityCount: 0, activity: [],
    contacts: [
      { id: primaryId, prospectId: 'asset-1', name: 'Alex Example', company: 'Example Manufacturing', email: 'alex@example.invalid', phone: null, additionalPhones: [{ label: 'Mobile', number: '780-555-0102' }], isPrimary: true, title: null, archivedAt: null },
      { id: alternateId, prospectId: 'asset-1', name: 'Jamie Example', company: 'Different Department', email: null, phone: '+1 780-555-0103 ext 204', additionalPhones: [], isPrimary: false, title: 'Manager', archivedAt: null },
      { id: companyLineId, prospectId: 'asset-1', name: 'Company main line', company: 'Example Manufacturing', email: null, phone: null, additionalPhones: [], isPrimary: false, title: 'Company switchboard', archivedAt: null },
    ],
    phoneReadiness: { status: 'ready', reason: 'usable_phone', usableChoices: [{ contactId: alternateId, contactName: 'Jamie Example', phoneKey: '7805550103:204', number: '+1 780-555-0103 ext 204', label: 'Direct', dialHref: 'tel:+17805550103', isPrimary: false }], blockedChoices: [], preferredContactId: alternateId, preferredPhoneKey: '7805550103:204', lastResearch: null, researchEligible: false },
  }
}

test('manual direct evidence binds exact saved person and captures a replayable snapshot without replacing other numbers', () => {
  const workspace = fixture()
  const previous = JSON.stringify(workspace)
  const entry = buildMapPhoneEntry(workspace, 'contact_direct', primaryId, '+1 (780) 555-0100 ext. 204', '2026-10-08T18:00:00.000Z')
  assert.equal(entry.contactId, primaryId)
  assert.equal(entry.contactName, 'Alex Example')
  assert.equal(entry.phoneEvidence.source, 'broker_confirmed')
  assert.equal(entry.contactPhone, '+1 (780) 555-0100 ext. 204')
  assert.deepEqual(entry.expectedContact, { name: 'Alex Example', email: 'alex@example.invalid', phone: null })
  assert.equal(JSON.stringify(workspace), previous)
})

test('company-main evidence omits individual target and uses primary CAS snapshot', () => {
  const workspace = fixture()
  const entry = buildMapPhoneEntry(workspace, 'company_main', alternateId, '780-555-0101')
  assert.equal('contactId' in entry, false)
  assert.equal('contactName' in entry, false)
  assert.equal(entry.company, 'Example Manufacturing')
  assert.equal(entry.expectedContact.name, 'Alex Example')
  assert.equal(directMapContacts(workspace).some((contact) => contact.id === companyLineId), false)
})

test('country codes and extensions match server keys without appending extension to native dial target', () => {
  assert.equal(mapPhoneKey('+1 (780) 555-0103 ext. 204'), '7805550103:204')
  assert.equal(mapPhoneKey('+44 20 7946 0100 x123'), '442079460100:123')
  for (const value of ['7805550103 / 7805550104', '5550103', '7805550103\n', '7805550103 ext 123456789', '++17805550103']) assert.equal(mapPhoneKey(value), null)
})

test('map snapshot keeps account identity and recovers a selected alternate contact with an empty asset name', () => {
  const workspace = fixture()
  const choice = workspace.phoneReadiness!.usableChoices[0]
  const candidate = mapCallCandidate(workspace, choice)
  assert.equal(candidate.contact.company, 'Example Manufacturing')
  assert.equal(candidate.prospect.name, 'Example Manufacturing')
  const session = createMobileCallSession('broker-1', candidate, workspace.contacts[1], choice)
  assert.ok(session)
  assert.equal(session.contactSnapshot?.name, 'Jamie Example')
  assert.equal(session.expectedPhone, '+1 780-555-0103 ext 204')
  assert.equal(parseStoredCallSession(JSON.stringify(session), 'broker-1')?.contactId, alternateId)
  assert.equal(parseStoredCallSession(JSON.stringify(session), 'broker-2'), null)
})

test('direct manual input cannot silently become a company line or target an unavailable contact', () => {
  assert.throws(() => buildMapPhoneEntry(fixture(), 'contact_direct', companyLineId, '7805550100'))
  assert.throws(() => buildMapPhoneEntry(fixture(), 'contact_direct', 'missing', '7805550100'))
  assert.throws(() => buildMapPhoneEntry(fixture(), 'company_main', '', '7805550100 ext abc'))
})
