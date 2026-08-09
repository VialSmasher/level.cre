import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'

import { composePropertyMapItems, getLinkedMemoryMarkerTitle } from './composeMapItems'

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'prospect-1',
    name: '100 Test Street',
    address: '100 Test Street',
    status: 'prospect',
    notes: '',
    geometry: { type: 'Point', coordinates: [-113.5, 53.5] },
    createdDate: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

function anchor(overrides: Partial<MarketMemoryAnchor> = {}): MarketMemoryAnchor {
  return {
    id: 'edmonton-point:53.510000:-113.510000',
    address: '100 Test Street',
    alternateAddresses: [],
    latitude: 53.51,
    longitude: -113.51,
    projects: ['Test project'],
    municipality: 'Edmonton',
    neighbourhood: 'Industrial Test',
    zoning: ['IM'],
    parcelAreaSqM: 4046.86,
    parcelAreaAcres: 1,
    accountNumbers: ['1000'],
    legalIdentities: [],
    sourceUrls: [],
    capturedAt: '2026-08-08T00:00:00.000Z',
    reviewReasons: [],
    reviewStatuses: [],
    suggestedUses: [],
    confidence: 'high',
    baseLayer: 'market_memory',
    previewLayer: 'market_memory',
    persistence: { state: 'approved', dossierId: 'dossier-1' },
    ...overrides,
  }
}

test('linked memory enriches a prospect instead of producing a second map item', () => {
  const items = composePropertyMapItems(
    [prospect()],
    [anchor({ persistence: { state: 'approved', dossierId: 'dossier-1', linkedProspectId: 'prospect-1' } })],
  )

  assert.equal(items.length, 1)
  assert.equal(items[0]?.kind, 'prospect')
  assert.equal(items[0]?.primaryMemoryAnchor?.persistence?.dossierId, 'dossier-1')
})

test('linked prospect coordinates win over incoming memory coordinates', () => {
  const items = composePropertyMapItems(
    [prospect({ locationLat: 53.6, locationLng: -113.6 })],
    [anchor({ persistence: { state: 'approved', dossierId: 'dossier-1', linkedProspectId: 'prospect-1' } })],
  )

  assert.deepEqual(items[0]?.position, { lat: 53.6, lng: -113.6 })
  assert.equal(items[0]?.positionSource, 'prospect')
})

test('approved memory gives a generic dropped pin a useful address label', () => {
  const title = getLinkedMemoryMarkerTitle(
    prospect({ name: 'New marker', address: null, contactCompany: null, businessName: null }),
    anchor({ address: '12404 - 153 STREET NW, T5V1S5' }),
  )

  assert.equal(title, '12404 - 153 STREET NW, T5V1S5 · brokerage memory saved')
})

test('an unmatched pending item remains visible in the review layer', () => {
  const items = composePropertyMapItems([], [anchor({
    previewLayer: 'review',
    baseLayer: 'review',
    reviewReasons: ['Coordinate conflict'],
    persistence: { state: 'pending', importItemId: 'review-1' },
  })])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.kind, 'memory')
  assert.equal(items[0]?.memoryLayer, 'review')
  assert.equal(items[0]?.hasPendingReview, true)
})

test('multiple anchors for the same dossier collapse to one standalone item', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'older', persistence: { state: 'approved', dossierId: 'dossier-1' } }),
    anchor({
      id: 'pending',
      previewLayer: 'review',
      persistence: { state: 'pending', dossierId: 'dossier-1', importItemId: 'review-1' },
    }),
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.memoryAnchors.length, 2)
  assert.equal(items[0]?.primaryMemoryAnchor?.id, 'pending')
})

test('anchors linked to the same unloaded prospect collapse to one standalone item', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'first', persistence: { state: 'approved', dossierId: 'dossier-1', linkedProspectId: 'prospect-unloaded' } }),
    anchor({ id: 'second', persistence: { state: 'pending', dossierId: 'dossier-2', linkedProspectId: 'prospect-unloaded' } }),
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.id, 'prospect:prospect-unloaded')
  assert.equal(items[0]?.memoryAnchors.length, 2)
})

test('linked listing identity deduplicates anchors before dossier identity', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'first', persistence: { state: 'approved', dossierId: 'dossier-1', linkedListingId: 'listing-1' } }),
    anchor({ id: 'second', persistence: { state: 'pending', dossierId: 'dossier-2', linkedListingId: 'listing-1' } }),
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.id, 'listing:listing-1')
  assert.equal(items[0]?.memoryAnchors.length, 2)
  assert.equal(items[0]?.primaryMemoryAnchor?.id, 'second')
})
