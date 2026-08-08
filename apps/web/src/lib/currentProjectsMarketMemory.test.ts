import assert from 'node:assert/strict'
import test from 'node:test'

import type { Prospect } from '@level-cre/shared/schema'

import {
  parseCurrentProjectsMarketMemory,
  resolveMarketMemoryAgainstProspects,
} from './currentProjectsMarketMemory'

function record(overrides: Record<string, unknown>) {
  return {
    titleIdentity: 'linc:one',
    sourceTitle: {
      case_id: 'CPP-ONE',
      folder_name: 'First project',
      source_relative_path: 'First project\\Title.pdf',
      source_sha256: 'hash-one',
      linc: '001',
      title_number: '100 001',
      legal_description: 'PLAN 1 BLOCK 2 LOT 3',
      plan: '1',
      block: '2',
      lot: '3',
      municipality: 'CITY OF EDMONTON',
      area_acres_title: 1,
      registered_owner: 'OWNER ONE LTD.',
      transfer_registration_date: '2020-01-01',
      title_pulled_date: '2026-01-01',
      extraction_confidence: 100,
      source_context: 'property_evidence',
    },
    municipal: {
      address: '100 First Street NW',
      legalDescriptionMunicipal: 'Plan 1 Blk 2 Lot 3',
      parcelAreaSqM: 4046.86,
      neighbourhood: 'Industrial One',
      currentZone: 'Medium Industrial (IM)',
      currentBylaw: '20001',
      sourceUrl: 'https://maps.edmonton.ca/map.aspx',
      capturedAt: '2026-08-08',
      municipalAddressesObserved: ['100 First Street NW'],
    },
    coordinate: {
      status: 'matched',
      latitude: 53.5,
      longitude: -113.5,
      accountNumber: '1000',
      propertyInformationAddress: '100 FIRST STREET NW',
      propertyInformationLegalDescription: 'Plan: 1 Block: 2 Lot: 3',
      propertyInformationZoning: 'IM',
      propertyInformationLotSizeSqM: 4046.86,
      propertyInformationNeighbourhood: 'INDUSTRIAL ONE',
      coordinateConfidence: 'high',
      coordinateMatchReasons: ['legal description'],
      sourceDataset: 'Property Information',
      sourceDatasetId: 'dkk9-cj3x',
      sourceUrl: 'https://data.edmonton.ca/example',
      capturedAt: '2026-08-08',
    },
    derived: {
      issues: [],
      systemPriority: 'Standard',
      reviewStatus: 'Verified — decision pending',
      suggestedUse: 'Master enrichment',
      archiveOrHistoricalContext: false,
      titleAgeBucket: 'Recent',
      municipalAcresCalculated: 1,
      matchConfidence: 'high',
    },
    ...overrides,
  }
}

function filePayload() {
  const first = record({})
  const shared = record({
    titleIdentity: 'linc:two',
    sourceTitle: { ...record({}).sourceTitle, linc: '002', title_number: '100 002', source_sha256: 'hash-two' },
  })
  const second = record({
    titleIdentity: 'linc:three',
    sourceTitle: { ...record({}).sourceTitle, folder_name: 'Second project', linc: '003', source_sha256: 'hash-three' },
    municipal: { ...record({}).municipal, address: '200 Second Avenue NW' },
    coordinate: { ...record({}).coordinate, latitude: 53.6, longitude: -113.6, accountNumber: '2000' },
  })
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-08T12:00:00.000Z',
    levelCreWriteAuthorized: false,
    counts: { identities: 3, lookups: 2 },
    records: [first, shared, second],
  }
}

test('collapses multiple title identities at one coordinate into one anchor', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  assert.equal(preview.sourceIdentities, 3)
  assert.equal(preview.anchors.length, 2)
  assert.equal(preview.anchors[0]?.legalIdentities.length, 2)
  assert.equal(preview.anchors[0]?.baseLayer, 'review')
  assert.match(preview.anchors[0]?.reviewReasons.join(' ') || '', /2 title identities share this coordinate/)
})

test('resolves an exact existing map record without creating another anchor identity', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  const prospects = [{
    id: 'prospect-two',
    name: 'Second property',
    status: 'prospect',
    notes: '',
    address: '200 Second Avenue NW',
    geometry: { type: 'Point', coordinates: [-113.6, 53.6] },
  }] as Prospect[]
  const resolved = resolveMarketMemoryAgainstProspects(preview.anchors, prospects)
  const second = resolved.find((anchor) => anchor.address.includes('200 Second'))
  assert.equal(second?.resolution?.decision, 'link_existing')
  assert.equal(second?.resolution?.topCandidate?.id, 'prospect-two')
  assert.equal(second?.previewLayer, 'existing')
})

test('keeps a conflicted or shared anchor in review even when an existing record matches', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  const prospects = [{
    id: 'prospect-one',
    name: 'First property',
    status: 'prospect',
    notes: '',
    address: '100 First Street NW',
    geometry: { type: 'Point', coordinates: [-113.5, 53.5] },
  }] as Prospect[]
  const resolved = resolveMarketMemoryAgainstProspects(preview.anchors, prospects)
  const first = resolved.find((anchor) => anchor.address.includes('100 First'))
  assert.equal(first?.resolution?.decision, 'link_existing')
  assert.equal(first?.previewLayer, 'review')
})

test('rejects an import payload that claims Level CRE writes are authorized', () => {
  const payload = { ...filePayload(), levelCreWriteAuthorized: true }
  assert.throws(() => parseCurrentProjectsMarketMemory(JSON.stringify(payload)), /not the Current Projects Edmonton enrichment file/)
})

test('uses municipal account identity so coordinate corrections do not change the anchor key', () => {
  const original = filePayload()
  original.counts = { identities: 1, lookups: 1 }
  original.records = [record({})]
  const corrected = structuredClone(original)
  corrected.records[0].coordinate.latitude += 0.0002
  corrected.records[0].coordinate.longitude -= 0.0002

  const originalAnchor = parseCurrentProjectsMarketMemory(JSON.stringify(original)).anchors[0]
  const correctedAnchor = parseCurrentProjectsMarketMemory(JSON.stringify(corrected)).anchors[0]
  assert.equal(originalAnchor.id, 'edmonton-account-set:1000')
  assert.equal(correctedAnchor.id, originalAnchor.id)
})

test('consolidates the same municipal parcel across conflicting coordinates', () => {
  const first = record({})
  const corrected = record({
    titleIdentity: 'linc:coordinate-correction',
    sourceTitle: {
      ...record({}).sourceTitle,
      source_sha256: 'hash-coordinate-correction',
    },
    coordinate: {
      ...record({}).coordinate,
      latitude: 53.5002,
      longitude: -113.5002,
    },
  })
  const input = {
    schemaVersion: 1,
    generatedAt: '2026-08-08T12:00:00.000Z',
    levelCreWriteAuthorized: false,
    counts: { identities: 2, lookups: 1 },
    records: [first, corrected],
  }

  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(input))
  assert.equal(preview.anchors.length, 1)
  assert.equal(preview.anchors[0]?.id, 'edmonton-account-set:1000')
  assert.equal(preview.anchors[0]?.legalIdentities.length, 2)
  assert.equal(preview.anchors[0]?.baseLayer, 'review')
  assert.match(preview.anchors[0]?.reviewReasons.join(' ') || '', /resolve to 2 coordinates/i)
})

test('keeps distinct parcels separate when they share the same civic address', () => {
  const first = record({})
  const second = record({
    titleIdentity: 'linc:other-parcel',
    sourceTitle: { ...record({}).sourceTitle, linc: '009', title_number: '100 009', source_sha256: 'hash-nine' },
    coordinate: { ...record({}).coordinate, latitude: 53.5005, accountNumber: '1001' },
  })
  const input = {
    schemaVersion: 1,
    generatedAt: '2026-08-08T12:00:00.000Z',
    levelCreWriteAuthorized: false,
    counts: { identities: 2, lookups: 2 },
    records: [first, second],
  }
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(input))
  assert.equal(preview.anchors.length, 2)
  assert.equal(new Set(preview.anchors.map((anchor) => anchor.id)).size, 2)
  assert.deepEqual(preview.anchors.map((anchor) => anchor.address), ['100 First Street NW', '100 First Street NW'])
})

test('folder-name-only similarity does not become a property match', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  const prospects = [{
    id: 'same-project-name',
    name: 'Second project',
    businessName: 'Second project',
    status: 'prospect',
    notes: '',
  }] as Prospect[]
  const resolved = resolveMarketMemoryAgainstProspects(preview.anchors, prospects)
  const second = resolved.find((anchor) => anchor.address.includes('200 Second'))
  assert.equal(second?.resolution?.decision, 'create_new')
  assert.equal(second?.resolution?.candidates.length, 0)
})

test('address alone remains reviewable and never auto-links', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  const prospects = [{
    id: 'address-only',
    name: '200 Second Avenue NW',
    address: '200 Second Avenue NW',
    status: 'prospect',
    notes: '',
  }] as Prospect[]
  const resolved = resolveMarketMemoryAgainstProspects(preview.anchors, prospects)
  const second = resolved.find((anchor) => anchor.address.includes('200 Second'))
  assert.equal(second?.resolution?.decision, 'review')
  assert.equal(second?.previewLayer, 'review')
})

test('keeps equally strong existing candidates in review instead of choosing by array order', () => {
  const preview = parseCurrentProjectsMarketMemory(JSON.stringify(filePayload()))
  const duplicateCandidates = ['candidate-one', 'candidate-two'].map((id) => ({
    id,
    name: id,
    address: '200 Second Avenue NW',
    status: 'prospect',
    notes: '',
    geometry: { type: 'Point', coordinates: [-113.6, 53.6] },
  })) as Prospect[]

  const resolved = resolveMarketMemoryAgainstProspects(preview.anchors, duplicateCandidates)
  const second = resolved.find((anchor) => anchor.address.includes('200 Second'))
  assert.equal(second?.resolution?.decision, 'review')
  assert.equal(second?.resolution?.candidates.length, 2)
  assert.equal(second?.resolution?.candidates[0]?.confidence, second?.resolution?.candidates[1]?.confidence)
  assert.equal(second?.previewLayer, 'review')
})
