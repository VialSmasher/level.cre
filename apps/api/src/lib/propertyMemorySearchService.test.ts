import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'

import {
  __testing,
  PropertyMemorySearchError,
  PropertyMemorySearchQuerySchema,
} from './propertyMemorySearchService'

function query(overrides: Record<string, unknown> = {}) {
  return PropertyMemorySearchQuerySchema.parse(overrides)
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    address: '14840 123 Avenue NW',
    layer: 'existing' as const,
    owners: ['Henry Van Steen Bergen'],
    legalDescriptions: ['Plan 8021234 Block 7 Lot 12'],
    lincs: ['002-066-076'],
    zoning: ['IM'],
    submarket: 'Northwest Edmonton',
    prospectStatus: 'prospect',
    lastActivityAt: '2026-07-20T12:00:00.000Z',
    fields: [
      ['address', ['14840 123 Avenue NW']],
      ['owner', ['Henry Van Steen Bergen']],
      ['legal', ['Plan 8021234 Block 7 Lot 12']],
      ['linc', ['002-066-076']],
      ['zoning', ['IM']],
      ['submarket', ['Northwest Edmonton']],
      ['project', ['PL Listing Prospects']],
      ['company', ['Rebel Heart Water Hauling']],
    ] as Array<[string, string[]]>,
    ...overrides,
  }
}

function anchor(overrides: Partial<MarketMemoryAnchor> = {}): MarketMemoryAnchor {
  return {
    id: 'anchor-existing',
    address: '14840 123 Avenue NW',
    alternateAddresses: [],
    latitude: 53.57,
    longitude: -113.57,
    projects: ['PL Listing Prospects'],
    municipality: 'CITY OF EDMONTON',
    neighbourhood: null,
    zoning: ['IM'],
    parcelAreaSqM: null,
    parcelAreaAcres: null,
    accountNumbers: ['1000'],
    legalIdentities: [],
    sourceUrls: [],
    capturedAt: '2026-08-08T12:00:00.000Z',
    reviewReasons: [],
    reviewStatuses: [],
    suggestedUses: [],
    confidence: 'high',
    baseLayer: 'market_memory',
    previewLayer: 'existing',
    persistence: {
      state: 'approved',
      linkedProspectId: 'prospect-1',
      dossierId: 'dossier-1',
    },
    ...overrides,
  }
}

function searchRow(overrides: Record<string, unknown> = {}) {
  const base = {
    canonicalKey: 'prospect:prospect-1',
    layer: 'existing' as const,
    dossierId: 'dossier-1',
    importItemId: null,
    linkedProspectId: 'prospect-1',
    linkedListingId: null,
    address: '14840 123 Avenue NW',
    latitude: 53.57,
    longitude: -113.57,
    owners: ['Owner One Ltd.'],
    legalDescriptions: ['Plan 1 Block 2 Lot 3'],
    lincs: ['001-001-001'],
    zoning: ['IM'],
    submarket: 'Northwest Edmonton',
    prospectStatus: 'prospect',
    lastActivityAt: '2026-07-01T12:00:00.000Z',
    activityCount: 4,
    fields: [
      ['owner', ['Owner One Ltd.']],
      ['legal', ['Plan 1 Block 2 Lot 3']],
    ] as Array<[string, string[]]>,
    anchor: anchor(),
  }
  return { ...base, ...overrides } as typeof base
}

test('normalization is accent-insensitive and produces stable compact LINC identities', () => {
  assert.equal(__testing.normalize('  HéNRY—Bergen Ltd. '), 'HENRY BERGEN LTD')
  assert.equal(__testing.normalizeIdentity('002-066 076'), '002066076')
  assert.equal(__testing.normalizeIdentity('  002.066.076  '), '002066076')
})

test('free text requires every token but lets tokens match across the property story', () => {
  const sameField = __testing.matchFreeText(candidate().fields, 'Henry Bergen')
  assert.equal(sameField.matches, true)
  assert.deepEqual(sameField.matchedFields, ['owner'])

  const distributed = __testing.matchFreeText(candidate().fields, 'Henry Rebel PL')
  assert.equal(distributed.matches, true)
  assert.deepEqual(distributed.matchedFields.sort(), ['company', 'owner', 'project'])

  assert.equal(__testing.matchFreeText(candidate().fields, 'Henry Calgary').matches, false)
  assert.equal(__testing.matchFreeText(candidate().fields, '002066076').matches, true)
})

test('structured filters combine owner, legal, LINC, zoning, submarket, status, and layer', () => {
  const matching = query({
    owner: 'van steen',
    legal: 'block 7',
    linc: '002 066 076',
    zoning: 'im',
    submarket: 'northwest',
    prospectStatus: 'prospect,no_go',
    layer: 'existing',
  })
  assert.ok(__testing.evaluateCandidate(candidate(), matching))

  assert.equal(__testing.evaluateCandidate(candidate(), query({ owner: 'different owner' })), null)
  assert.equal(__testing.evaluateCandidate(candidate(), query({ linc: '999999999' })), null)
  assert.equal(__testing.evaluateCandidate(candidate(), query({ prospectStatus: 'client' })), null)
  assert.equal(__testing.evaluateCandidate(candidate(), query({ layer: 'review' })), null)
})

test('activity filters use inclusive since and exclusive before bounds', () => {
  const exactActivity = candidate({ lastActivityAt: '2026-07-20T12:00:00.000Z' })
  assert.ok(__testing.evaluateCandidate(exactActivity, query({
    activityState: 'has_activity',
    activitySince: '2026-07-20T12:00:00.000Z',
  })))
  assert.equal(__testing.evaluateCandidate(exactActivity, query({
    activityBefore: '2026-07-20T12:00:00.000Z',
  })), null)

  const now = Date.parse('2026-08-08T12:00:00.000Z')
  const recentBounds = __testing.activityBounds(query({ activityRecency: '30d' }), now)
  assert.equal(recentBounds.since?.toISOString(), '2026-07-09T12:00:00.000Z')
  assert.ok(__testing.evaluateCandidate(exactActivity, query({ activityRecency: '30d' }), recentBounds))
  assert.equal(__testing.evaluateCandidate(
    candidate({ lastActivityAt: '2026-06-01T12:00:00.000Z' }),
    query({ activityRecency: '30d' }),
    recentBounds,
  ), null)

  const noActivity = candidate({ lastActivityAt: null })
  assert.ok(__testing.evaluateCandidate(noActivity, query({ activityState: 'never' })))
  assert.equal(__testing.evaluateCandidate(noActivity, query({ activityState: 'has_activity' })), null)
})

test('invalid activity dates fail clearly before any search is run', () => {
  assert.throws(
    () => __testing.activityBounds(query({ activitySince: 'not-a-date' })),
    (error) => error instanceof PropertyMemorySearchError
      && error.status === 400
      && /activitySince/.test(error.message),
  )
})

test('cursor signatures are stable for equivalent filters and reject changed filters', () => {
  const firstQuery = query({
    q: '  HéNRY   Bergen ',
    linc: '002-066-076',
    prospectStatus: 'prospect,no_go',
    limit: 10,
  })
  const equivalentQuery = query({
    q: 'henry bergen',
    linc: '002 066 076',
    prospectStatus: 'no_go,prospect',
    limit: 50,
  })
  const signature = __testing.cursorSignature(firstQuery)
  assert.equal(__testing.cursorSignature(equivalentQuery), signature)

  const cursor = __testing.encodeCursor(20, signature)
  assert.equal(__testing.decodeCursor(cursor, signature), 20)
  assert.throws(
    () => __testing.decodeCursor(cursor, __testing.cursorSignature(query({ q: 'different' }))),
    (error) => error instanceof PropertyMemorySearchError && error.status === 400,
  )
})

test('canonical grouping combines evidence and gives a pending review anchor priority', () => {
  const reviewAnchor = anchor({
    id: 'anchor-review',
    previewLayer: 'review',
    persistence: {
      state: 'pending',
      linkedProspectId: 'prospect-1',
      importItemId: 'review-1',
    },
  })
  const grouped = __testing.groupCanonicalRows([
    searchRow(),
    searchRow({
      layer: 'review',
      dossierId: null,
      importItemId: 'review-1',
      owners: ['Owner Two Ltd.'],
      legalDescriptions: ['Title 242 000 001'],
      lincs: ['002-002-002'],
      zoning: ['IH'],
      lastActivityAt: '2026-08-01T12:00:00.000Z',
      activityCount: 4,
      fields: [
        ['owner', ['Owner Two Ltd.']],
        ['project', ['Current Projects Edmonton']],
      ],
      anchor: reviewAnchor,
    }),
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].layer, 'review')
  assert.equal(grouped[0].anchor.id, 'anchor-review')
  assert.equal(grouped[0].dossierId, 'dossier-1')
  assert.deepEqual(grouped[0].owners, ['Owner One Ltd.', 'Owner Two Ltd.'])
  assert.deepEqual(grouped[0].lincs, ['001-001-001', '002-002-002'])
  assert.deepEqual(grouped[0].zoning, ['IM', 'IH'])
  assert.equal(grouped[0].activityCount, 4)
  assert.equal(grouped[0].lastActivityAt, '2026-08-01T12:00:00.000Z')
  assert.ok(__testing.evaluateCandidate(grouped[0], query({ q: 'Owner Two Current' })))
})

test('canonical grouping does not combine unrelated property identities', () => {
  const grouped = __testing.groupCanonicalRows([
    searchRow(),
    searchRow({ canonicalKey: 'prospect:prospect-2' }),
  ])
  assert.equal(grouped.length, 2)
})
