import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import type { MarketMemoryAnchor } from '@level-cre/shared'

import {
  BrokerageMemoryDecisionSchema,
  BrokerageMemoryServiceError,
  buildApprovedBrokerageMemoryPayload,
  buildBrokerageMemoryFactDrafts,
  buildBrokerageMemoryReviewReasons,
  buildNewBrokerageMemoryDossierInsert,
  decideBrokerageMemoryItem,
  getBrokerageMemoryReviewItem,
  previewBrokerageMemoryImport,
  stageBrokerageMemoryImport,
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
    prospectTypes: [],
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

test('brokerage-memory approval rejects a tombstone before locking or writing the review item', async () => {
  const transactionalQueries: string[] = []
  const client = {
    query: async (sql: string) => {
      transactionalQueries.push(sql.trim())
      if (/FROM public\.prospects/i.test(sql)) {
        return { rows: [{ id: 'duplicate-1', merged_into_prospect_id: 'canonical-1' }] }
      }
      return { rows: [] }
    },
    release: () => undefined,
  }
  let topLevelQuery = 0
  const pool = {
    query: async (sql: string) => {
      topLevelQuery += 1
      if (topLevelQuery <= 2) return { rows: [] }
      if (/FROM public\.brokerage_memory_items/i.test(sql)) {
        return { rows: [{ matched_prospect_id: 'duplicate-1' }] }
      }
      return { rows: [] }
    },
    connect: async () => client,
  }

  await assert.rejects(
    decideBrokerageMemoryItem({
      pool: pool as never,
      userId: 'user-one',
      itemId: 'item-one',
      decision: BrokerageMemoryDecisionSchema.parse({ action: 'approve' }),
    }),
    (error: unknown) => error instanceof BrokerageMemoryServiceError && error.status === 409,
  )

  const prospectLock = transactionalQueries.findIndex((sql) => /FROM public\.prospects/i.test(sql) && /FOR UPDATE/i.test(sql))
  const itemLock = transactionalQueries.findIndex((sql) => /FOR UPDATE OF items/i.test(sql))
  assert.ok(prospectLock >= 0)
  assert.equal(itemLock, -1)
  assert.equal(transactionalQueries.includes('ROLLBACK'), true)
})

test('single-item review lookup scopes the selected item to its broker', async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = []
  const sourceAnchor = anchor()
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values })
      if (/WHERE items\.id = \$1 AND items\.user_id = \$2/i.test(sql)) {
        return { rows: [{
          id: 'item-one',
          import_id: 'import-one',
          user_id: 'user-one',
          status: 'pending',
          suggested_layer: 'review',
          matched_dossier_id: null,
          matched_prospect_id: null,
          matched_listing_id: null,
          match_confidence: 72,
          resolution_json: {},
          review_reasons: ['Confirm the canonical parcel'],
          anchor_payload: sourceAnchor,
          lat: sourceAnchor.latitude,
          lng: sourceAnchor.longitude,
          source_file_name: 'memory.json',
          created_at: '2026-08-08T12:00:00.000Z',
          updated_at: '2026-08-08T12:00:00.000Z',
        }] }
      }
      return { rows: [] }
    },
  }

  const result = await getBrokerageMemoryReviewItem({
    pool: pool as never,
    userId: 'user-one',
    itemId: 'item-one',
  })

  assert.equal(result.item.id, 'item-one')
  assert.equal(result.item.anchor.address, sourceAnchor.address)
  const selectedQuery = queries.find(({ sql }) => /WHERE items\.id = \$1/i.test(sql))
  assert.deepEqual(selectedQuery?.values, ['item-one', 'user-one'])
  assert.match(selectedQuery?.sql || '', /imports\.status <> 'superseded'/)
})

test('staging appends independent batches and replay restores only the identical historical batch', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE users(id varchar PRIMARY KEY);
      CREATE TABLE intel_property_dossiers(id varchar PRIMARY KEY, created_by_user_id varchar, external_memory_key varchar, status text, source_provenance jsonb);
      CREATE TABLE prospects(id varchar PRIMARY KEY);
      CREATE TABLE listings(id varchar PRIMARY KEY);
      INSERT INTO users VALUES ('broker');`)
    const migration = readFileSync(new URL('../../../../drizzle/0018_brokerage_memory.sql', import.meta.url), 'utf8')
    await pg.exec(migration.slice(0, migration.indexOf('ALTER TABLE')))
    const query = (sql: string, args?: unknown[]) => pg.query(sql, args)
    // Staging uses real SQL. The empty entity resolver keeps this fixture independent of PostGIS.
    const pool = {
      query: (sql: string, args?: unknown[]) => sql.includes('SELECT items.*') ? query(sql, args) : Promise.resolve({ rows: [] }),
      connect: async () => ({ query, release() {} }),
    } as never
    const stage = async (day: number) => {
      const input = payload()
      input.generatedAt = new Date(Date.UTC(2026, 1, day)).toISOString()
      const params = { pool, userId: 'broker', sourceFileName: 'properties.json', payload: input }
      const preview = await previewBrokerageMemoryImport(params)
      return stageBrokerageMemoryImport({ ...params, previewHash: preview.sourceHash })
    }
    const first = await stage(1)
    const second = await stage(2)
    assert.notEqual(first.importId, second.importId)
    await query("UPDATE brokerage_memory_imports SET status = 'partially_approved' WHERE id = $1", [first.importId])
    const third = await stage(3)
    const retry = await stage(3)
    assert.equal(retry.importId, third.importId)
    assert.equal(retry.duplicate, true)
    await query("UPDATE brokerage_memory_imports SET status = 'superseded' WHERE id = $1", [second.importId])
    await query("UPDATE brokerage_memory_items SET status = 'superseded' WHERE import_id = $1", [second.importId])
    const reopened = await stage(2)
    assert.equal(reopened.importId, second.importId)
    const rows = await query('SELECT b.status AS batch, i.status AS item FROM brokerage_memory_items i JOIN brokerage_memory_imports b ON b.id=i.import_id ORDER BY b.created_at')
    assert.deepEqual(rows.rows, [
      { batch: 'partially_approved', item: 'pending' },
      { batch: 'preview', item: 'pending' },
      { batch: 'preview', item: 'pending' },
    ])
  } finally {
    await pg.close()
  }
})
