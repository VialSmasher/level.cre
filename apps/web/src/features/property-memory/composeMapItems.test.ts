import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'

import { composePropertyMapItems, getLinkedMemoryMarkerTitle } from './composeMapItems'
import { composedPropertyFilterSource, findMemoryMapItem, findMemoryProspect, memoryPropertyFilterSource, propertyMapFitPoints } from './assetMapModel'
import { defaultInventoryFilters, matchesPropertyFilters, propertyFilterFacts } from '../map/inventoryFilters'
import { propertyPresentation } from '../map/propertyPresentation'

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
    prospectTypes: [],
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

test('pending dossier matches stay separate from the approved canonical dossier', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'older', persistence: { state: 'approved', dossierId: 'dossier-1' } }),
    anchor({
      id: 'pending',
      previewLayer: 'review',
      persistence: { state: 'pending', dossierId: 'dossier-1', importItemId: 'review-1' },
    }),
  ])

  assert.equal(items.length, 2)
  assert.equal(items[0]?.id, 'dossier:dossier-1')
  assert.equal(items[1]?.id, 'import-item:review-1')
})

test('anchors linked to the same unloaded prospect collapse to one standalone item', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'first', persistence: { state: 'approved', dossierId: 'dossier-1', linkedProspectId: 'prospect-unloaded' } }),
    anchor({ id: 'second', persistence: { state: 'approved', dossierId: 'dossier-2', linkedProspectId: 'prospect-unloaded' } }),
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.id, 'prospect:prospect-unloaded')
  assert.equal(items[0]?.memoryAnchors.length, 2)
})

test('linked listing identity deduplicates anchors before dossier identity', () => {
  const items = composePropertyMapItems([], [
    anchor({ id: 'first', persistence: { state: 'approved', dossierId: 'dossier-1', linkedListingId: 'listing-1' } }),
    anchor({ id: 'second', persistence: { state: 'approved', dossierId: 'dossier-2', linkedListingId: 'listing-1', savedAt:'2026-09-04T12:00:00Z' } }),
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.id, 'listing:listing-1')
  assert.equal(items[0]?.memoryAnchors.length, 2)
  assert.equal(items[0]?.primaryMemoryAnchor?.id, 'second')
})

const correction = (classification: 'single_tenant' | 'multi_tenant') => ({
  classification, source: 'broker' as const, reviewedAt: '2026-09-04T12:00:00Z', reviewedBy: 'broker',
})

test('a corrected research asset filters and renders its type without becoming a prospect or approving its evidence', () => {
  const pending = anchor({
    confidence: 'medium',
    persistence: { state: 'pending', importItemId: 'pending-one' },
    propertyClassification: correction('single_tenant'),
  })
  const before = structuredClone(pending)
  const source = memoryPropertyFilterSource(pending)
  assert.equal(propertyPresentation(source).marker, 'S')
  assert.equal(matchesPropertyFilters(source, {...defaultInventoryFilters(), includeOther:false, classes:['single_tenant']}), true)
  assert.equal(matchesPropertyFilters(source, {...defaultInventoryFilters(), classes:['multi_tenant']}), false)
  assert.equal(matchesPropertyFilters(source, {...defaultInventoryFilters(), confidence:['high']}), false)
  assert.equal(matchesPropertyFilters(source, {...defaultInventoryFilters(), tags:['has_occupant']}), false)
  assert.equal(findMemoryProspect(pending, []), null)
  assert.deepEqual(pending, before)
})

test('linked memory opens the exact loaded prospect and counts its canonical classification once', () => {
  const crm = prospect({aiMetadata:{propertyClassification:correction('multi_tenant')}})
  const memory = anchor({propertyClassification:correction('single_tenant'), persistence:{state:'approved', dossierId:'dossier-1', linkedProspectId:crm.id}})
  const items = composePropertyMapItems([crm], [memory, {...memory, id:'another-import'}])
  assert.equal(findMemoryProspect(memory,[crm]),crm)
  assert.equal(findMemoryProspect(memory,[]),null)
  assert.equal(items.length,1)
  assert.equal(propertyFilterFacts(composedPropertyFilterSource(items[0])).classification,'multi_tenant')
  assert.equal(findMemoryMapItem(memory,items)?.id,`prospect:${crm.id}`)
  assert.equal(items[0].memoryAnchors.length,2)
})

test('pending and preview matches cannot borrow a candidate prospect classification or route edits to it', () => {
  const crm = prospect({aiMetadata:{propertyClassification:correction('multi_tenant')}})
  for (const state of ['pending','local_preview'] as const) {
    const suggestion = anchor({
      propertyClassification:correction('single_tenant'),
      persistence:{state,importItemId:state === 'pending' ? 'pending-match' : null,linkedProspectId:crm.id,linkedListingId:'listing-match',dossierId:'dossier-match'},
    })
    const items=composePropertyMapItems([crm],[suggestion])
    assert.equal(items.length,2)
    assert.equal(items[0].memoryAnchors.length,0)
    assert.equal(items[1].kind,'memory')
    assert.equal(findMemoryProspect(suggestion,[crm]),null)
    assert.equal(propertyFilterFacts(composedPropertyFilterSource(items[1])).classification,'single_tenant')
    assert.notEqual(items[1].id,`prospect:${crm.id}`)
  }
})

test('memory registration filtering uses all transfer dates and never substitutes title pull dates', () => {
  const legal = (date: string | null) => ({titleIdentity:`title:${date}`,transferRegistrationDate:date,titlePulledDate:'2000-01-01'}) as MarketMemoryAnchor['legalIdentities'][number]
  const old = anchor({legalIdentities:[legal('2000-01-01')]})
  const newer = anchor({legalIdentities:[legal('2024-01-01')]})
  const now = new Date('2026-09-04T12:00:00Z')
  const longHold = {...defaultInventoryFilters(),tags:['long_hold']}
  assert.equal(matchesPropertyFilters(memoryPropertyFilterSource(old,now),longHold),true)
  assert.equal(matchesPropertyFilters(memoryPropertyFilterSource(anchor({legalIdentities:[legal(null)]}),now),longHold),false)
  const item = composePropertyMapItems([],[old,newer])[0]
  assert.equal(matchesPropertyFilters(composedPropertyFilterSource(item,now),longHold),false)
})

test('fit includes standalone memory and full prospect boundaries while deduplicating linked research', () => {
  const crm = prospect({geometry:{type:'Polygon',coordinates:[[[-114,53],[-114,54],[-113,54],[-114,53]]]}})
  const linked = anchor({persistence:{state:'approved',dossierId:'linked',linkedProspectId:crm.id}})
  const standalone = anchor({id:'elsewhere',latitude:55,longitude:-112,persistence:{state:'approved',dossierId:'standalone'}})
  const items=composePropertyMapItems([crm],[linked,standalone])
  assert.deepEqual(propertyMapFitPoints(items),[{lat:53,lng:-114},{lat:54,lng:-114},{lat:54,lng:-113},{lat:53,lng:-114},{lat:55,lng:-112}])
  assert.equal(findMemoryMapItem(standalone,items)?.id,'dossier:standalone')
})
