import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessLegacyDuplicatePair,
  resolveRecommendedMergeDirection,
} from './legacyProspectCleanupService'

function prospect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    status: 'prospect',
    notes: '',
    address: null,
    businessName: null,
    websiteUrl: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contactCompany: null,
    locationLat: null,
    locationLng: null,
    resolvedLat: null,
    resolvedLng: null,
    marketKey: null,
    relationshipCounts: {
      listings: 0,
      interactions: 0,
      activities: 0,
      opportunities: 0,
      dossiers: 0,
    },
    preservationScore: 0,
    ...overrides,
  } as never
}

test('an address-only legacy pin can be absorbed into a richer company record', () => {
  const canonical = prospect('company', {
    name: 'Logoplaste',
    businessName: 'Logoplaste',
    contactEmail: 'joe@logoplaste.com',
    address: '17420 116 Avenue NW, Edmonton, AB',
    resolvedLat: 53.567475,
    resolvedLng: -113.620995,
  })
  const duplicate = prospect('old-pin', {
    name: '17420 116 Ave NW',
    address: '17420 116 Ave NW, Edmonton',
    resolvedLat: 53.56748,
    resolvedLng: -113.621,
  })

  const assessment = assessLegacyDuplicatePair(canonical, duplicate)

  assert.equal(assessment.eligible, true)
  assert.equal(assessment.confidence, 'high')
  assert.ok(assessment.signals.includes('same normalized civic address'))
  assert.ok(assessment.signals.some((signal) => signal.includes('address-only legacy pin')))
})

test('two different companies at the same building remain separate', () => {
  const first = prospect('tenant-one', {
    name: 'Tenant One',
    businessName: 'Tenant One Ltd.',
    address: '100 First Street NW, Edmonton',
  })
  const second = prospect('tenant-two', {
    name: 'Tenant Two',
    businessName: 'Tenant Two Inc.',
    address: '100 First St NW, Edmonton',
  })

  const assessment = assessLegacyDuplicatePair(first, second)

  assert.equal(assessment.eligible, false)
  assert.ok(assessment.blockers.includes('distinct company identities would be collapsed'))
})

test('different contacts are not collapsed merely because company and address agree', () => {
  const first = prospect('contact-one', {
    name: 'Acme',
    businessName: 'Acme Industrial Ltd.',
    contactEmail: 'first@acme.test',
    address: '200 Second Avenue NW, Edmonton',
  })
  const second = prospect('contact-two', {
    name: 'Acme Industrial',
    contactCompany: 'Acme Industrial Inc.',
    contactEmail: 'second@acme.test',
    address: '200 Second Ave NW, Edmonton',
  })

  const assessment = assessLegacyDuplicatePair(first, second)

  assert.equal(assessment.eligible, false)
  assert.ok(assessment.blockers.includes('distinct contact emails would be collapsed'))
})

test('identity agreement without a shared place is not enough for a map-pin merge', () => {
  const first = prospect('west', {
    name: 'Acme',
    businessName: 'Acme',
    contactEmail: 'sales@acme.test',
    address: '100 West Road NW, Edmonton',
    resolvedLat: 53.5,
    resolvedLng: -113.7,
  })
  const second = prospect('east', {
    name: 'Acme',
    businessName: 'Acme',
    contactEmail: 'sales@acme.test',
    address: '900 East Road NW, Edmonton',
    resolvedLat: 53.6,
    resolvedLng: -113.3,
  })

  const assessment = assessLegacyDuplicatePair(first, second)

  assert.equal(assessment.eligible, false)
  assert.ok(assessment.blockers.includes('the records do not have a corroborated shared place'))
})

test('the executor follows the lower-level recommendation when the richer record is the planned duplicate', () => {
  const direction = resolveRecommendedMergeDirection({
    canonicalProspectId: 'planned-canonical',
    duplicateProspectId: 'richer-record',
  }, 'richer-record')

  assert.deepEqual(direction, {
    canonicalProspectId: 'richer-record',
    duplicateProspectId: 'planned-canonical',
    swapped: true,
  })
})

test('an unrelated recommendation cannot redirect a cleanup merge', () => {
  const direction = resolveRecommendedMergeDirection({
    canonicalProspectId: 'first',
    duplicateProspectId: 'second',
  }, 'third')

  assert.equal(direction, null)
})
