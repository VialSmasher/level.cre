import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketMemoryAnchor } from '@level-cre/shared'

import {
  buildApprovedBrokerageMemoryPayload,
  buildBrokerageMemoryFactDrafts,
  buildBrokerageMemoryReviewReasons,
  buildNewBrokerageMemoryDossierInsert,
  previewBrokerageMemoryImport,
} from './brokerageMemoryService'

function anchor(): MarketMemoryAnchor {
  return {
    id: 'edmonton-account-set:1000',
    address: '100 First Street NW',
    alternateAddresses: [],
    latitude: 53.5,
    longitude: -113.5,
    projects: ['First project'],
    municipality: 'CITY OF EDMONTON',
    neighbourhood: 'Industrial One',
    zoning: ['IM'],
    parcelAreaSqM: 4046.86,
    parcelAreaAcres: 1,
    accountNumbers: ['1000'],
    legalIdentities: [{
      titleIdentity: 'linc:001',
      linc: '001',
      titleNumber: '100 001',
      legalDescription: 'PLAN 1 BLOCK 2 LOT 3',
      plan: '1',
      block: '2',
      lot: '3',
      registeredOwner: 'OWNER ONE LTD.',
      transferRegistrationDate: '2020-01-01',
      titlePulledDate: '2026-01-01',
      sourcePath: 'First project\\Title.pdf',
      sourceHash: 'hash-one',
      sourceContext: 'property_evidence',
      extractionConfidence: 100,
    }],
    sourceUrls: ['https://maps.edmonton.ca/example'],
    capturedAt: '2026-08-08T12:00:00.000Z',
    reviewReasons: [],
    reviewStatuses: ['Verified'],
    suggestedUses: ['Master enrichment'],
    confidence: 'high',
    baseLayer: 'market_memory',
  }
}

function payload() {
  const item = anchor()
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-08T12:00:00.000Z',
    levelCreWriteAuthorized: false,
    counts: { identities: 1, lookups: 1 },
    records: [{
      titleIdentity: item.legalIdentities[0].titleIdentity,
      sourceTitle: {
        case_id: 'CPP-ONE',
        folder_name: item.projects[0],
        source_relative_path: item.legalIdentities[0].sourcePath,
        source_sha256: item.legalIdentities[0].sourceHash,
        linc: item.legalIdentities[0].linc,
        title_number: item.legalIdentities[0].titleNumber,
        legal_description: item.legalIdentities[0].legalDescription,
        plan: item.legalIdentities[0].plan,
        block: item.legalIdentities[0].block,
        lot: item.legalIdentities[0].lot,
        municipality: item.municipality,
        area_acres_title: 1,
        registered_owner: item.legalIdentities[0].registeredOwner,
        transfer_registration_date: item.legalIdentities[0].transferRegistrationDate,
        title_pulled_date: item.legalIdentities[0].titlePulledDate,
        extraction_confidence: 100,
        source_context: 'property_evidence',
      },
      municipal: {
        address: item.address,
        legalDescriptionMunicipal: item.legalIdentities[0].legalDescription,
        parcelAreaSqM: item.parcelAreaSqM,
        neighbourhood: item.neighbourhood,
        currentZone: 'IM',
        currentBylaw: '20001',
        sourceUrl: item.sourceUrls[0],
        capturedAt: item.capturedAt,
        municipalAddressesObserved: [item.address],
      },
      coordinate: {
        status: 'matched',
        latitude: item.latitude,
        longitude: item.longitude,
        accountNumber: item.accountNumbers[0],
        propertyInformationAddress: item.address,
        propertyInformationLegalDescription: item.legalIdentities[0].legalDescription,
        propertyInformationZoning: 'IM',
        propertyInformationLotSizeSqM: item.parcelAreaSqM,
        propertyInformationNeighbourhood: item.neighbourhood,
        coordinateConfidence: 'high',
        coordinateMatchReasons: ['legal description'],
        sourceDataset: 'Property Information',
        sourceDatasetId: 'dkk9-cj3x',
        sourceUrl: item.sourceUrls[0],
        capturedAt: item.capturedAt,
      },
      derived: {
        issues: [],
        systemPriority: 'Standard',
        reviewStatus: 'Verified',
        suggestedUse: 'Master enrichment',
        archiveOrHistoricalContext: false,
        titleAgeBucket: 'Recent',
        municipalAcresCalculated: 1,
        matchConfidence: 'high',
      },
    }],
  }
}

test('fact drafts are deterministic, source-backed, and field-selective', () => {
  const decisions = { location: true, municipal: true, legal: true, ownership: true, context: true }
  const first = buildBrokerageMemoryFactDrafts(anchor(), decisions)
  const second = buildBrokerageMemoryFactDrafts(anchor(), decisions)
  assert.deepEqual(second, first)
  assert.equal(new Set(first.map((fact) => fact.externalFactId)).size, first.length)
  assert.ok(first.some((fact) => fact.factKey === 'municipal_account'))
  assert.ok(first.some((fact) => fact.factKey === 'registered_owner'))
  assert.ok(first.every((fact) => fact.sourceMetadata && typeof fact.sourceMetadata === 'object'))

  const protectedFieldsOff = buildBrokerageMemoryFactDrafts(anchor(), {
    ...decisions,
    legal: false,
    ownership: false,
  })
  assert.equal(protectedFieldsOff.some((fact) => fact.factKey === 'registered_owner'), false)
  assert.equal(protectedFieldsOff.some((fact) => fact.factKey === 'title_number'), false)
})

test('approved map payload exposes only selected evidence and preserves prior approved groups', () => {
  const selectedLocationOnly = buildApprovedBrokerageMemoryPayload(null, anchor(), {
    location: true,
    municipal: false,
    legal: false,
    ownership: false,
    context: false,
  })
  assert.equal(selectedLocationOnly.address, anchor().address)
  assert.deepEqual(selectedLocationOnly.accountNumbers, [])
  assert.deepEqual(selectedLocationOnly.zoning, [])
  assert.deepEqual(selectedLocationOnly.legalIdentities, [])
  assert.deepEqual(selectedLocationOnly.projects, [])

  const preserved = buildApprovedBrokerageMemoryPayload(anchor() as unknown as Record<string, unknown>, {
    ...anchor(),
    zoning: ['IB'],
    accountNumbers: ['2000'],
    projects: ['Second project'],
  }, {
    location: true,
    municipal: false,
    legal: false,
    ownership: false,
    context: false,
  })
  assert.deepEqual(preserved.zoning, ['IM'])
  assert.deepEqual(preserved.accountNumbers, ['1000'])
  assert.deepEqual(preserved.projects, ['First project'])
  assert.equal(preserved.legalIdentities[0].registeredOwner, 'OWNER ONE LTD.')
})

test('new dossier insert binds varchar title and text address separately', () => {
  const property = {
    ...anchor(),
    address: '8210 - YELLOWHEAD TRAIL NW, T5B1G5',
  }
  const statement = buildNewBrokerageMemoryDossierInsert({
    prospectId: null,
    anchor: property,
    canonicalPayload: property,
    provenanceDocument: { latest: { source: 'test' }, history: [] },
    importItemId: 'import-item-one',
    userId: 'user-one',
  })

  assert.match(statement.text, /title, address, normalized_address/)
  assert.match(statement.text, /'market_memory', \$3, \$4, \$5, \$6, 'active'/)
  assert.equal(statement.text.match(/\$3(?!\d)/g)?.length, 1)
  assert.equal(statement.text.match(/\$4(?!\d)/g)?.length, 1)
  assert.equal(statement.values.length, 12)
  assert.equal(statement.values[2], property.address)
  assert.equal(statement.values[3], property.address)
  assert.equal(statement.values[4], '8210 YELLOWHEAD TRL')
})

test('server preview performs reads only and returns a stable source hash', async () => {
  const sqlSeen: string[] = []
  const fakePool = {
    query: async (sql: string) => {
      sqlSeen.push(sql.trim())
      return { rows: [] }
    },
  }
  const first = await previewBrokerageMemoryImport({
    pool: fakePool as never,
    userId: 'user-one',
    sourceFileName: 'enriched.json',
    payload: payload(),
  })
  const second = await previewBrokerageMemoryImport({
    pool: fakePool as never,
    userId: 'user-one',
    sourceFileName: 'enriched.json',
    payload: payload(),
  })
  assert.equal(first.sourceHash, second.sourceHash)
  assert.equal(first.preview.anchors.length, 1)
  assert.equal(first.preview.anchors[0].id, 'edmonton-account-set:1000')
  assert.ok(sqlSeen.length >= 5)
  assert.equal(sqlSeen.every((sql) => /^SELECT\b/i.test(sql)), true)
})

test('prospect geometry supplies missing coordinates while duplicate candidates remain in review', async () => {
  const sqlSeen: string[] = []
  const fakePool = {
    query: async (sql: string) => {
      const normalized = sql.trim()
      sqlSeen.push(normalized)
      if (/FROM public\.prospects/i.test(normalized)) {
        return {
          rows: [
            {
              id: 'manual-coordinate-candidate',
              name: 'Henry Van Steen Bergen Holdings',
              address: '100 First Street NW',
              location_lat: 53.5004,
              location_lng: -113.5,
              resolved_lat: 53.5004,
              resolved_lng: -113.5,
            },
            {
              id: 'geometry-coordinate-candidate',
              name: 'Henry Van Steen Bergen Holdings',
              address: '100 First Street NW',
              location_lat: null,
              location_lng: null,
              resolved_lat: 53.50015,
              resolved_lng: -113.5,
            },
          ],
        }
      }
      return { rows: [] }
    },
  }

  const result = await previewBrokerageMemoryImport({
    pool: fakePool as never,
    userId: 'user-one',
    sourceFileName: 'enriched.json',
    payload: payload(),
  })
  const resolved = result.preview.anchors[0]

  assert.equal(resolved.resolution?.topCandidate?.id, 'geometry-coordinate-candidate')
  assert.equal(resolved.resolution?.topCandidate?.distanceMeters, 17)
  assert.equal(resolved.resolution?.decision, 'review')
  assert.equal(resolved.previewLayer, 'review')
  assert.equal(resolved.resolution?.candidates.length, 2)
  assert.match(buildBrokerageMemoryReviewReasons(resolved).join(' '), /Multiple existing Level CRE candidates are plausible \(2\)/)
  assert.match(buildBrokerageMemoryReviewReasons(resolved).join(' '), /geometry-coordinate-candidate|Henry Van Steen Bergen Holdings/)

  const prospectSql = sqlSeen.find((sql) => /FROM public\.prospects/i.test(sql)) || ''
  assert.match(prospectSql, /COALESCE\([\s\S]*location_lat[\s\S]*ST_Y\(ST_Centroid\(geometry\)\)/i)
  assert.match(prospectSql, /COALESCE\([\s\S]*location_lng[\s\S]*ST_X\(ST_Centroid\(geometry\)\)/i)
})
