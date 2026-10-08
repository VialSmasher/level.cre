import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { applyProspectMerge, previewProspectMerge, undoProspectMerge } from './prospectMergeService'
import { reconcilePrimaryContact } from './prospectContactService'

// Real PostgreSQL merge/undo and roster SQL. Geometry shims keep this test about
// contact identity; the production PostGIS behavior is outside this test's scope.
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    CREATE FUNCTION st_asgeojson(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
    CREATE FUNCTION st_isempty(text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE FUNCTION st_centroid(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
    CREATE FUNCTION st_x(text) RETURNS numeric LANGUAGE sql AS 'SELECT -113.5';
    CREATE FUNCTION st_y(text) RETURNS numeric LANGUAGE sql AS 'SELECT 53.5';
    CREATE FUNCTION st_geomfromgeojson(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
    CREATE FUNCTION st_setsrid(text,integer) RETURNS text LANGUAGE sql AS 'SELECT $1';
    CREATE TABLE users (id varchar PRIMARY KEY);
    INSERT INTO users VALUES ('broker');
    CREATE TABLE prospects (
      id varchar PRIMARY KEY,user_id varchar,name varchar,status varchar DEFAULT 'prospect',notes text,
      geometry text DEFAULT '{"type":"Point","coordinates":[-113.5,53.5]}',
      submarket_id varchar,last_contact_date varchar,follow_up_timeframe varchar,follow_up_due_date timestamptz,
      contact_name varchar,contact_email varchar,contact_phone varchar,contact_company varchar,
      building_sf numeric,lot_size_acres numeric,ai_metadata jsonb,business_name varchar,website_url varchar,address varchar,
      location_lat numeric,location_lng numeric,geohash varchar,market_key varchar,market_confidence numeric,
      market_context_source varchar,market_context_status varchar DEFAULT 'unknown',
      merged_into_prospect_id varchar,merged_at timestamptz,merged_by_user_id varchar,merge_event_id varchar,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
    );
    INSERT INTO prospects (id,user_id,name,contact_name,contact_email,contact_phone) VALUES
      ('canonical','broker','Example Company','Alex One','alex@example.test','7805550101'),
      ('duplicate','broker','Example Co','Blair Two','blair@example.test','7805550102');
    CREATE TABLE contact_interactions (id varchar,user_id varchar,prospect_id varchar,source_metadata jsonb);
    CREATE TABLE listings (id varchar,user_id varchar);
    CREATE TABLE listing_prospects (id varchar,listing_id varchar,prospect_id varchar,role varchar);
    CREATE TABLE opportunities (id varchar,user_id varchar,prospect_id varchar,updated_at timestamptz);
    CREATE TABLE activity_events (id varchar,user_id varchar,prospect_id varchar,source varchar,event_type varchar,
      evidence_status varchar,match_status varchar,source_metadata jsonb,updated_at timestamptz);
    CREATE TABLE sales_activity_imports (id varchar,user_id varchar,prospect_id varchar,updated_at timestamptz);
    CREATE TABLE email_prospect_matches (id varchar,user_id varchar,prospect_id varchar,email_message_id varchar,updated_at timestamptz);
    CREATE TABLE intel_property_dossiers (id varchar,created_by_user_id varchar,prospect_id varchar,updated_at timestamptz);
    CREATE TABLE brokerage_memory_items (id varchar,user_id varchar,matched_prospect_id varchar,updated_at timestamptz);
    CREATE TABLE touches (id varchar,user_id varchar,prospect_id varchar);
    CREATE TABLE activity_event_links (id varchar,user_id varchar,entity_type varchar,entity_id varchar,event_id varchar,role varchar);
    CREATE TABLE intel_dossier_entity_links (id varchar,user_id varchar,entity_type varchar,entity_id varchar,dossier_id varchar,relationship varchar,updated_at timestamptz);
    CREATE TABLE skill_activities (id varchar,user_id varchar,related_id varchar);
    CREATE TABLE prospect_merge_events (id varchar,user_id varchar,canonical_prospect_id varchar,duplicate_prospect_ids varchar[],
      preview_hash varchar,idempotency_key varchar,field_choices jsonb,before_snapshot jsonb,relationship_snapshot jsonb,
      after_snapshot jsonb,moved_counts jsonb,status varchar,created_at timestamptz,completed_at timestamptz,reversed_at timestamptz,reversed_by_user_id varchar);
  `)
  await db.exec(await readFile(new URL('../../../../drizzle/0021_prospect_contacts.sql', import.meta.url), 'utf8'))
  const query = async (sql: string, values?: unknown[]) => {
    const result = await db.query(sql, values)
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
  }
  const client = { query, release() {} }
  const pool = { query, connect: async () => client } as never
  const prospects = (await db.query<Record<string, unknown>>('SELECT * FROM prospects ORDER BY id')).rows
  await db.exec('BEGIN')
  for (const prospect of prospects) await reconcilePrimaryContact(client as never, 'broker', prospect)
  await db.exec('COMMIT')
  const contacts = (await db.query<Record<string, unknown>>('SELECT * FROM prospect_contacts ORDER BY prospect_id')).rows
  return { db, pool, contacts }
}

async function merge(pool: never, choices: Record<string, 'canonical' | 'duplicate'> = {}) {
  const params = { pool, userId: 'broker', canonicalProspectId: 'canonical', duplicateProspectId: 'duplicate' }
  const preview = await previewProspectMerge(params)
  return applyProspectMerge({ ...params, previewHash: preview.previewHash, idempotencyKey: 'roster-merge', confirmConflicts: true,
    fieldChoices: { ...preview.defaultFieldChoices, ...choices } })
}

test('SQL merge preserves both contact IDs, attributed history and chosen primary; undo restores the exact roster', async () => {
  const { db, pool, contacts } = await fixture()
  try {
    const duplicateContact = contacts.find((row) => row.prospect_id === 'duplicate')!
    await db.query(`INSERT INTO contact_interactions VALUES ('call-one','broker','duplicate',$1::jsonb)`, [JSON.stringify({ contactId: duplicateContact.id })])
    const result = await merge(pool, { contactName: 'duplicate', contactEmail: 'duplicate', contactPhone: 'duplicate' })
    const moved = (await db.query<Record<string, unknown>>('SELECT * FROM prospect_contacts ORDER BY id')).rows
    assert.equal(moved.length, 2)
    assert.ok(moved.every((row) => row.prospect_id === 'canonical'))
    assert.equal(moved.find((row) => row.is_primary)?.id, duplicateContact.id)
    assert.equal((await db.query<any>('SELECT * FROM contact_interactions')).rows[0].source_metadata.contactId, duplicateContact.id)
    assert.equal((await db.query<any>('SELECT * FROM contact_interactions')).rows[0].prospect_id, 'canonical')
    await undoProspectMerge({ pool, userId: 'broker', mergeEventId: result.mergeEventId, confirmUndo: true })
    const restored = (await db.query('SELECT * FROM prospect_contacts ORDER BY prospect_id')).rows
    assert.deepEqual(restored, contacts)
    assert.equal((await db.query<any>('SELECT * FROM contact_interactions')).rows[0].prospect_id, 'duplicate')
  } finally { await db.close() }
})

test('SQL merge versions a mixed primary identity and undo removes only the generated anchor', async () => {
  const { db, pool, contacts } = await fixture()
  try {
    const result = await merge(pool, { contactName: 'duplicate' })
    const after = (await db.query<any>('SELECT * FROM prospect_contacts')).rows
    assert.equal(after.length, 3)
    assert.equal(after.filter((row) => row.is_primary).length, 1)
    assert.ok(!contacts.some((row) => row.id === after.find((row) => row.is_primary).id))
    await undoProspectMerge({ pool, userId: 'broker', mergeEventId: result.mergeEventId, confirmUndo: true })
    assert.deepEqual((await db.query('SELECT * FROM prospect_contacts ORDER BY prospect_id')).rows, contacts)
  } finally { await db.close() }
})

test('SQL merge blocks a pending call and allows it after confirmation', async () => {
  const { db, pool } = await fixture()
  try {
    await db.exec(`INSERT INTO activity_events (id,user_id,prospect_id,source,event_type,evidence_status,match_status,source_metadata)
      VALUES ('pending','broker','duplicate','level_cre_mobile_calling','call_started','observed','matched','{"sessionState":"started"}')`)
    const params = { pool, userId: 'broker', canonicalProspectId: 'canonical', duplicateProspectId: 'duplicate' }
    const blocked = await previewProspectMerge(params)
    assert.equal(blocked.canApply, false)
    assert.equal(blocked.blockers[0].code, 'call_confirmation_pending')
    await db.exec(`UPDATE activity_events SET event_type='call_attempted',evidence_status='confirmed',source_metadata='{"sessionState":"confirmed"}'`)
    assert.equal((await previewProspectMerge(params)).canApply, true)
  } finally { await db.close() }
})

test('SQL undo rejects a contact edited after merge without deleting or moving contacts', async () => {
  const { db, pool } = await fixture()
  try {
    const result = await merge(pool)
    await db.exec(`UPDATE prospect_contacts SET title='New title' WHERE is_primary=false`)
    const beforeUndo = (await db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows
    await assert.rejects(undoProspectMerge({ pool, userId: 'broker', mergeEventId: result.mergeEventId, confirmUndo: true }),
      (error: any) => error.code === 'undo_relationship_changed')
    assert.deepEqual((await db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows, beforeUndo)
  } finally { await db.close() }
})

test('SQL undo still accepts an older merge snapshot with no contact roster key', async () => {
  const { db, pool } = await fixture()
  try {
    await db.exec('DELETE FROM prospect_contacts')
    const result = await merge(pool)
    await db.exec(`UPDATE prospect_merge_events SET relationship_snapshot=relationship_snapshot-'prospectContacts',
      after_snapshot=after_snapshot-'contactRelationships'`)
    const restored = await undoProspectMerge({ pool, userId: 'broker', mergeEventId: result.mergeEventId, confirmUndo: true })
    assert.equal(restored.status, 'reversed')
    assert.equal((await db.query('SELECT * FROM prospect_contacts')).rows.length, 0)
  } finally { await db.close() }
})
