import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'

import { composePropertyMapItems } from '../property-memory/composeMapItems'
import {
  createAllProspectTypeFilterSet,
  createProspectTypeFilterSet,
  getComposedPropertyProspectTypes,
  getProspectTypeCounts,
  matchesProspectTypeFilters,
} from './prospectTypeFilters'

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'prospect-1',
    name: '100 Example Street',
    status: 'prospect',
    notes: '',
    geometry: { type: 'Point', coordinates: [-113.5, 53.5] },
    createdDate: '2026-08-30T00:00:00.000Z',
    ...overrides,
  }
}

function anchor(overrides: Partial<MarketMemoryAnchor> = {}): MarketMemoryAnchor {
  return {
    id: 'memory-1',
    address: '100 Example Street',
    alternateAddresses: [],
    latitude: 53.5,
    longitude: -113.5,
    projects: [],
    municipality: 'Edmonton',
    neighbourhood: null,
    zoning: [],
    parcelAreaSqM: null,
    parcelAreaAcres: null,
    accountNumbers: [],
    legalIdentities: [],
    sourceUrls: [],
    capturedAt: null,
    reviewReasons: [],
    reviewStatuses: [],
    suggestedUses: [],
    prospectTypes: [],
    confidence: 'high',
    baseLayer: 'market_memory',
    ...overrides,
  }
}

test('combines explicit prospect metadata with linked brokerage-memory types', () => {
  const items = composePropertyMapItems(
    [prospect({ aiMetadata: { prospectTypes: ['tenant_prospect'] } })],
    [anchor({ prospectTypes: ['listing_prospect'], persistence: { state: 'pending', linkedProspectId: 'prospect-1' } })],
  )
  assert.deepEqual(getComposedPropertyProspectTypes(items[0]), ['listing_prospect', 'tenant_prospect'])
})

test('infers the uploaded listing-pursuit batch and counts unclassified properties once', () => {
  const items = composePropertyMapItems(
    [prospect()],
    [anchor({ id: 'listing-memory', suggestedUses: ['listing_pursuit'] })],
  )
  const counts = getProspectTypeCounts(items)
  assert.equal(counts.listing_prospect, 1)
  assert.equal(counts.unclassified, 1)
})

test('uses unclassified as a real filter and rejects unknown persisted keys', () => {
  assert.equal(matchesProspectTypeFilters(new Set(['unclassified']), []), true)
  assert.equal(matchesProspectTypeFilters(new Set(['listing_prospect']), []), false)
  assert.deepEqual(Array.from(createProspectTypeFilterSet(['listing_prospect', 'bad-value'])), ['listing_prospect'])
  assert.equal(createAllProspectTypeFilterSet().size, 4)
})
