import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import {
  BrokerageMemoryClassificationInputSchema, BrokerageMemoryClassificationError,
  classificationProjection, latestClassificationOverride, patchBrokerageMemoryClassification,
} from './brokerageMemoryClassification'
import { BrokerageMemoryDecisionSchema, decideBrokerageMemoryItem, getBrokerageMemoryMap, previewBrokerageMemoryImport, stageBrokerageMemoryImport } from './brokerageMemoryService'

function document(generatedAt = '2026-09-04T12:00:00Z') {
  return { schemaVersion: 1, generatedAt, levelCreWriteAuthorized: false,
    counts: { identities: 1, lookups: 1 }, records: [{ titleIdentity: 'title:001',
      sourceTitle: { title_number: '001', municipality: 'Edmonton', source_sha256: 'original-title', registered_owner: 'Source Owner' },
      municipal: { address: '100 First Street', sourceUrl: 'https://example.test/parcel', capturedAt: generatedAt },
      coordinate: { latitude: 53.5, longitude: -113.5, accountNumber: '1000', coordinateConfidence: 'high' }, derived: {},
    }] }
}

async function database() {
  const pg = new PGlite()
  await pg.exec(`
    CREATE TABLE prospects(id text PRIMARY KEY,user_id text,location_lat float,location_lng float);
    CREATE TABLE brokerage_memory_imports(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text,source text,source_file_name text,source_hash text,generated_at timestamptz,status text,identity_count int,anchor_count int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(user_id,source,source_hash));
    CREATE TABLE brokerage_memory_items(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,import_id text,user_id text,external_anchor_id text,status text,base_layer text,suggested_layer text,address text,normalized_address text,lat float,lng float,matched_dossier_id text,matched_prospect_id text,matched_listing_id text,match_confidence int,resolution_json jsonb,review_reasons jsonb,anchor_payload jsonb,decision_metadata jsonb DEFAULT '{}',decision_action text,decided_by_user_id text,approved_at timestamptz,rejected_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(import_id,external_anchor_id));
    CREATE TABLE intel_property_dossiers(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,canonical_listing_id text,prospect_id text,external_memory_key text UNIQUE,memory_class text,title text,address text,normalized_address text,market text,status text,lat float,lng float,memory_payload jsonb DEFAULT '{}',source_provenance jsonb DEFAULT '{}',approved_at timestamptz,origin_import_item_id text,created_by_user_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE intel_dossier_entity_links(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,dossier_id text,user_id text,entity_type text,entity_id text,relationship text,source text,import_item_id text,updated_at timestamptz,UNIQUE(dossier_id,entity_type,entity_id));
    CREATE TABLE intel_dossier_facts(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,dossier_id text,fact_key text,label text,value_text text,value_number numeric,value_json jsonb,confidence int,status text,source text,external_fact_id text,import_item_id text,observed_at timestamptz,source_metadata jsonb,updated_at timestamptz);
    CREATE UNIQUE INDEX ON intel_dossier_facts(dossier_id,external_fact_id) WHERE external_fact_id IS NOT NULL;
  `)
  const query = async (sql: string, values?: unknown[]) => {
    // Identity matching is outside this persistence test; advisory concurrency needs real PostgreSQL.
    if (sql.includes('pg_advisory_xact_lock') || sql.includes('AS resolved_lat') || sql.includes('FROM public.listings')) return { rows: [] }
    return pg.query(sql, values)
  }
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool
  return { pg, pool }
}

test('memory classification survives replay, changed imports, approval and reset without rewriting source evidence', async () => {
  const { pg, pool } = await database()
  try {
    const stage = async (payload: ReturnType<typeof document>) => {
      const preview = await previewBrokerageMemoryImport({ pool, userId: 'owner', sourceFileName: 'memory.json', payload })
      return stageBrokerageMemoryImport({ pool, userId: 'owner', sourceFileName: 'memory.json', payload, previewHash: preview.sourceHash })
    }
    const first = await stage(document())
    const firstId = first.preview.anchors[0].persistence!.importItemId!
    const before = (await pg.query<any>('SELECT anchor_payload FROM brokerage_memory_items WHERE id=$1', [firstId])).rows[0].anchor_payload
    await pg.query("UPDATE brokerage_memory_items SET decision_metadata=$2::jsonb, matched_prospect_id='suggested-only' WHERE id=$1", [firstId, JSON.stringify({ keep: 'review note' })])
    const saved = await patchBrokerageMemoryClassification({ pool, userId: 'owner', kind: 'memory_item', id: firstId, propertyClassification: 'multi_tenant' })
    assert.equal(saved.propertyClassification?.classification, 'multi_tenant', 'A fuzzy match is not treated as a confirmed prospect link')
    const replay = await stage(document())
    assert.equal(replay.duplicate, true)
    assert.equal(replay.preview.anchors[0].propertyClassification?.classification, 'multi_tenant')
    const changed = await stage(document('2026-09-04T12:01:00Z'))
    const itemId = changed.preview.anchors[0].persistence!.importItemId!
    assert.notEqual(itemId, firstId)
    assert.equal(changed.preview.anchors[0].propertyClassification?.classification, 'multi_tenant')
    await assert.rejects(patchBrokerageMemoryClassification({ pool, userId: 'owner', kind: 'memory_item', id: firstId, propertyClassification: 'office' }), (error: unknown) => error instanceof BrokerageMemoryClassificationError && error.status === 409)
    assert.deepEqual((await pg.query<any>('SELECT anchor_payload FROM brokerage_memory_items WHERE id=$1', [firstId])).rows[0].anchor_payload, before)
    assert.equal((await pg.query<any>('SELECT decision_metadata FROM brokerage_memory_items WHERE id=$1', [firstId])).rows[0].decision_metadata.keep, 'review note')
    assert.equal((await pg.query('SELECT * FROM prospects')).rows.length, 0)
    assert.equal((await pg.query('SELECT * FROM intel_property_dossiers')).rows.length, 0)

    const approval = await decideBrokerageMemoryItem({ pool, userId: 'owner', itemId, decision: BrokerageMemoryDecisionSchema.parse({ action: 'approve', targetProspectId: null, confirmConflicts: true }) })
    const dossierId = approval.dossierId!
    assert.equal((await getBrokerageMemoryMap({ pool, userId: 'owner' })).anchors[0].propertyClassification?.classification, 'multi_tenant')
    const dossierBefore = (await pg.query<any>('SELECT * FROM intel_property_dossiers WHERE id=$1', [dossierId])).rows[0]
    const reset = await patchBrokerageMemoryClassification({ pool, userId: 'owner', kind: 'dossier', id: dossierId, propertyClassification: null })
    assert.equal(reset.propertyClassification, null)
    const dossierAfter = (await pg.query<any>('SELECT * FROM intel_property_dossiers WHERE id=$1', [dossierId])).rows[0]
    assert.deepEqual(dossierAfter.memory_payload, dossierBefore.memory_payload)
    assert.deepEqual(dossierAfter.source_provenance.history, dossierBefore.source_provenance.history)
    assert.equal(dossierAfter.approved_at.toISOString(), dossierBefore.approved_at.toISOString())
    assert.equal(dossierAfter.source_provenance.propertyClassification.classification, null)
    const next = await stage(document('2026-09-04T12:02:00Z'))
    assert.equal(next.preview.anchors[0].propertyClassification, null, 'Restage retains the newer reset instead of restoring the old classification')
    const nextId = next.preview.anchors[0].persistence!.importItemId!
    await decideBrokerageMemoryItem({ pool, userId: 'owner', itemId: nextId, decision: BrokerageMemoryDecisionSchema.parse({ action: 'approve', targetProspectId: null, targetDossierId: dossierId, confirmConflicts: true }) })
    assert.equal((await getBrokerageMemoryMap({ pool, userId: 'owner' })).anchors[0].propertyClassification, null)
    assert.equal((await pg.query('SELECT * FROM intel_property_dossiers')).rows.length, 1)
    assert.equal((await pg.query('SELECT * FROM prospects')).rows.length, 0)
  } finally { await pg.close() }
})

test('a pending suggested dossier match does not suppress approved map evidence', async () => {
  const { pg, pool } = await database()
  try {
    const stage = async (payload: ReturnType<typeof document>) => {
      const preview = await previewBrokerageMemoryImport({ pool, userId: 'owner', sourceFileName: 'memory.json', payload })
      return stageBrokerageMemoryImport({ pool, userId: 'owner', sourceFileName: 'memory.json', payload, previewHash: preview.sourceHash })
    }
    const first = await stage(document())
    const itemId = first.preview.anchors[0].persistence!.importItemId!
    const approval = await decideBrokerageMemoryItem({ pool, userId: 'owner', itemId, decision: BrokerageMemoryDecisionSchema.parse({ action: 'approve', targetProspectId: null, confirmConflicts: true }) })
    const dossierId = approval.dossierId!
    await patchBrokerageMemoryClassification({ pool, userId: 'owner', kind: 'dossier', id: dossierId, propertyClassification: 'office' })
    const proposed = document('2026-09-04T13:00:00Z')
    proposed.records[0].coordinate.accountNumber = '2000'
    proposed.records[0].municipal.address = '200 Other Street'
    proposed.records[0].sourceTitle.registered_owner = 'Proposed Owner'
    const next = await stage(proposed)
    const pendingId = next.preview.anchors[0].persistence!.importItemId!
    // A resolver suggestion alone must not hide the canonical dossier or inherit its classification.
    await pg.query('UPDATE brokerage_memory_items SET matched_dossier_id=$2 WHERE id=$1', [pendingId, dossierId])
    const map = await getBrokerageMemoryMap({ pool, userId: 'owner' })
    assert.equal(map.anchors.length, 2)
    const saved = map.anchors.find(anchor => anchor.persistence?.state === 'approved')!
    const pending = map.anchors.find(anchor => anchor.persistence?.state === 'pending')!
    assert.equal(saved.persistence?.dossierId, dossierId)
    assert.equal(saved.address, '100 First Street')
    assert.equal(saved.legalIdentities[0].registeredOwner, 'Source Owner')
    assert.equal(saved.propertyClassification?.classification, 'office')
    assert.equal(pending.persistence?.importItemId, pendingId)
    assert.equal(pending.persistence?.dossierId, dossierId)
    assert.equal(pending.address, '200 Other Street')
    assert.equal(pending.legalIdentities[0].registeredOwner, 'Proposed Owner')
    assert.equal(pending.propertyClassification, undefined)
    assert.equal((await pg.query('SELECT * FROM intel_property_dossiers')).rows.length, 1)
  } finally { await pg.close() }
})

test('classification is owner scoped, rejects linked dossiers and keeps audit metadata on reset', async () => {
  const { pg, pool } = await database()
  try {
    await pg.exec("INSERT INTO intel_property_dossiers(id,created_by_user_id,prospect_id,status,approved_at,source_provenance) VALUES('linked','owner','canonical-prospect','active',now(),'{\"keep\":true}')")
    await assert.rejects(patchBrokerageMemoryClassification({ pool, userId: 'other', kind: 'dossier', id: 'linked', propertyClassification: 'office' }), (error: unknown) => error instanceof BrokerageMemoryClassificationError && error.status === 404)
    await assert.rejects(patchBrokerageMemoryClassification({ pool, userId: 'owner', kind: 'dossier', id: 'linked', propertyClassification: 'office' }), (error: unknown) => error instanceof BrokerageMemoryClassificationError && error.status === 409 && error.prospectId === 'canonical-prospect')
    assert.deepEqual((await pg.query<any>('SELECT source_provenance FROM intel_property_dossiers')).rows[0].source_provenance, { keep: true })
  } finally { await pg.close() }
})

test('strict classification payload and latest manual correction handle reset tombstones', () => {
  assert.equal(BrokerageMemoryClassificationInputSchema.safeParse({ propertyClassification: 'office', status: 'approved' }).success, false)
  assert.equal(BrokerageMemoryClassificationInputSchema.safeParse({ propertyClassification: null }).success, true)
  const old = { propertyClassification: { classification: 'office', source: 'broker', reviewedAt: '2026-09-04T12:00:00Z', reviewedBy: 'owner' } }
  const reset = { propertyClassification: { ...old.propertyClassification, classification: null, reviewedAt: '2026-09-04T13:00:00Z' } }
  assert.equal(latestClassificationOverride(reset, old)?.classification, null)
  assert.deepEqual(classificationProjection(old, reset), { propertyClassification: null })
  assert.deepEqual(classificationProjection({ propertyClassification: { ...old.propertyClassification, source: 'agent' } }), {})
})
