import assert from 'node:assert/strict'
import test from 'node:test'

import type { PropertyMemoryReviewItem } from './api'
import {
  buildQuickPropertyMemoryApproval,
  canQuickApprovePropertyMemory,
  propertyMemoryTargetFromValue,
} from './reviewDecision'

test('create separate explicitly rejects every suggested target', () => {
  assert.deepEqual(propertyMemoryTargetFromValue('new'), {
    targetDossierId: null,
    targetProspectId: null,
    targetListingId: null,
  })
})

test('choosing one target explicitly clears the other target kinds', () => {
  assert.deepEqual(propertyMemoryTargetFromValue('dossier:dossier-one'), {
    targetDossierId: 'dossier-one',
    targetProspectId: null,
    targetListingId: null,
  })
  assert.deepEqual(propertyMemoryTargetFromValue('prospect:prospect-one'), {
    targetDossierId: null,
    targetProspectId: 'prospect-one',
    targetListingId: null,
  })
})

function reviewItem(overrides: Partial<PropertyMemoryReviewItem> = {}): PropertyMemoryReviewItem {
  return {
    id: 'item-one',
    importId: 'import-one',
    status: 'pending',
    suggestedLayer: 'market_memory',
    matchedDossierId: null,
    matchedProspectId: null,
    matchedListingId: null,
    matchConfidence: 0,
    resolution: { decision: 'create_new', topCandidate: null, candidates: [] },
    reviewReasons: [],
    sourceFileName: 'memory.json',
    createdAt: null,
    updatedAt: null,
    anchor: {
      id: 'anchor-one',
      address: '100 First Street NW',
      alternateAddresses: [],
      latitude: 53.5,
      longitude: -113.5,
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
    },
    ...overrides,
  }
}

test('quick approval is reserved for unambiguous proposals and preserves map coordinates', () => {
  const prospectCandidate = {
    entityType: 'prospect' as const,
    id: 'prospect-one',
    label: 'Existing prospect',
    score: 100,
    confidence: 100,
    signals: ['municipal account'],
    conflicts: [],
    distanceMeters: 0,
  }
  const item = reviewItem({
    matchedProspectId: 'prospect-one',
    suggestedLayer: 'existing',
    resolution: { decision: 'link_existing', topCandidate: prospectCandidate, candidates: [prospectCandidate] },
  })
  assert.equal(canQuickApprovePropertyMemory(item), true)
  assert.deepEqual(buildQuickPropertyMemoryApproval(item), {
    action: 'approve',
    targetDossierId: null,
    targetProspectId: 'prospect-one',
    targetListingId: null,
    confirmConflicts: false,
    coordinateDecision: 'keep_existing',
    fieldDecisions: { location: true, municipal: true, legal: true, ownership: true, context: true },
  })
  assert.equal(canQuickApprovePropertyMemory(reviewItem()), true)

  assert.equal(canQuickApprovePropertyMemory(reviewItem({ suggestedLayer: 'review' })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({ reviewReasons: ['Address differs'] })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({ status: 'approved' })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({
    resolution: {
      decision: 'review',
      topCandidate: null,
      candidates: [{ id: 'one' }, { id: 'two' }],
    },
  })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({
    matchedProspectId: 'different-prospect',
    suggestedLayer: 'existing',
    resolution: { decision: 'link_existing', topCandidate: prospectCandidate, candidates: [prospectCandidate] },
  })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({
    suggestedLayer: 'existing',
    resolution: { decision: 'review', topCandidate: prospectCandidate, candidates: [prospectCandidate] },
  })), false)
  assert.equal(canQuickApprovePropertyMemory(reviewItem({
    matchedProspectId: 'prospect-one',
    resolution: { decision: 'create_new', topCandidate: null, candidates: [] },
  })), false)
})
