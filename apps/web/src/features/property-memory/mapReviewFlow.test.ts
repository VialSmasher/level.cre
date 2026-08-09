import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'

import type { ProspectMergeCandidateGroup } from '@/features/prospect-merge/api'

import {
  findDuplicateProspectGroupForAnchor,
  reconcileSelectedMarketMemoryAnchor,
} from './mapReviewFlow'

function anchor(overrides: Partial<MarketMemoryAnchor> = {}): MarketMemoryAnchor {
  return {
    id: 'anchor-one',
    address: '14840 134 Avenue NW',
    alternateAddresses: [],
    latitude: 53.59,
    longitude: -113.57,
    projects: [],
    municipality: 'CITY OF EDMONTON',
    neighbourhood: null,
    zoning: ['IM'],
    parcelAreaSqM: null,
    parcelAreaAcres: null,
    accountNumbers: [],
    legalIdentities: [],
    sourceUrls: [],
    capturedAt: null,
    reviewReasons: [],
    reviewStatuses: [],
    suggestedUses: [],
    confidence: 'high',
    baseLayer: 'market_memory',
    persistence: {
      state: 'pending',
      importItemId: 'item-one',
      linkedProspectId: 'prospect-one',
    },
    ...overrides,
  }
}

function group(ids: string[]): ProspectMergeCandidateGroup {
  return {
    id: ids.join(':'),
    recommendedCanonicalId: ids[0],
    reasons: ['same normalized civic address'],
    prospects: ids.map((id) => ({
      id,
      name: id,
      status: 'prospect',
      address: null,
      businessName: null,
      contactCompany: null,
      buildingSf: null,
      lotSizeAcres: null,
      resolvedLat: 53.59,
      resolvedLng: -113.57,
      preservationScore: 1,
      relationshipCounts: { listings: 0, interactions: 0, activities: 0, opportunities: 0, dossiers: 0 },
    })),
  }
}

test('refresh reconciliation keeps the selected property on its stable import item', () => {
  const current = anchor()
  const approved = anchor({
    id: 'canonical-dossier-anchor',
    persistence: {
      state: 'approved',
      importItemId: 'item-one',
      dossierId: 'dossier-one',
      linkedProspectId: 'prospect-one',
    },
  })

  assert.equal(reconcileSelectedMarketMemoryAnchor(current, [approved]), approved)
  assert.equal(reconcileSelectedMarketMemoryAnchor(current, []), null)
  assert.equal(reconcileSelectedMarketMemoryAnchor(anchor({ persistence: { state: 'local_preview' } }), [])?.id, 'anchor-one')
})

test('refresh reconciliation prioritizes the exact import item over a reused anchor id', () => {
  const current = anchor()
  const reusedId = anchor({
    persistence: { state: 'approved', dossierId: 'unrelated-dossier', linkedProspectId: 'unrelated-prospect' },
  })
  const exactImport = anchor({
    id: 'pending-version',
    persistence: { state: 'pending', importItemId: 'item-one', linkedProspectId: 'prospect-one' },
  })

  assert.equal(reconcileSelectedMarketMemoryAnchor(current, [reusedId, exactImport]), exactImport)
})

test('duplicate merge prefers the group with the strongest overlap', () => {
  const property = anchor({
    resolution: {
      decision: 'review',
      topCandidate: null,
      candidates: [
        { entityType: 'prospect', id: 'prospect-one', label: 'Henry', score: 100, confidence: 100, signals: [], conflicts: [], distanceMeters: 17 },
        { entityType: 'prospect', id: 'prospect-two', label: '14840', score: 90, confidence: 90, signals: [], conflicts: [], distanceMeters: 44 },
      ],
    },
  })
  const linked = group(['prospect-one', 'other'])
  const precise = group(['prospect-one', 'prospect-two'])

  assert.equal(findDuplicateProspectGroupForAnchor(property, [linked, precise]), precise)
  assert.equal(findDuplicateProspectGroupForAnchor(property, [linked]), linked)
})

test('an approved property can surface the authoritative duplicate group for its linked prospect', () => {
  const approved = anchor({
    persistence: {
      state: 'approved',
      importItemId: null,
      dossierId: 'dossier-1',
      linkedProspectId: 'prospect-1',
      linkedListingId: null,
    },
    resolution: {
      decision: 'link_existing',
      topCandidate: null,
      candidates: [],
    },
  })
  const mergeGroup = group(['prospect-1', 'prospect-2'])

  assert.equal(findDuplicateProspectGroupForAnchor(approved, [mergeGroup]), mergeGroup)
})
