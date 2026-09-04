import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@level-cre/shared/schema'
import { sql } from 'drizzle-orm'

test('migration, durable interaction identity and XP rollback on PostgreSQL', async () => {
  process.env.DEMO_MODE = '1'
  const { DatabaseStorage } = await import('../storage')
  const pg = new PGlite()
  try {
    await pg.exec(`
      CREATE TABLE users (id varchar PRIMARY KEY);
      CREATE TABLE prospects (id varchar PRIMARY KEY, user_id varchar REFERENCES users(id), merged_into_prospect_id varchar);
      CREATE TABLE contact_interactions (id varchar PRIMARY KEY, user_id varchar, prospect_id varchar, listing_id varchar, date varchar, type varchar, outcome varchar, notes varchar DEFAULT '', next_follow_up varchar, source_provider varchar, source_message_id varchar, source_thread_id varchar, source_email_message_id varchar, source_metadata jsonb DEFAULT '{}', created_at timestamp DEFAULT now());
      CREATE TABLE broker_skills (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar UNIQUE, prospecting integer DEFAULT 0, follow_up integer DEFAULT 0, consistency integer DEFAULT 0, market_knowledge integer DEFAULT 0, last_activity timestamp DEFAULT now(), streak_days integer DEFAULT 0, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE skill_activities (id varchar PRIMARY KEY, user_id varchar, skill_type varchar, action varchar, xp_gained integer, timestamp timestamp DEFAULT now(), related_id varchar, multiplier integer DEFAULT 1);
      CREATE TABLE activity_events (id varchar, user_id varchar);
      CREATE TABLE sales_activity_imports (id varchar, user_id varchar);
      CREATE TABLE activity_event_links (id varchar, user_id varchar);
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA realtime;
      CREATE SCHEMA auth;
      CREATE TABLE realtime.messages (topic text, payload jsonb);
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.actor'', true), '''')::uuid';
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS 'SELECT current_setting(''request.topic'', true)';
      CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS 'INSERT INTO realtime.messages VALUES ($3,$1)';
      GRANT USAGE ON SCHEMA realtime, auth TO authenticated;
      INSERT INTO users VALUES ('broker'),('other');
      INSERT INTO prospects VALUES ('prospect','broker',NULL);
    `)
    const migration = await fs.readFile(new URL('../../../../drizzle/0020_telemetry_hardening.sql', import.meta.url), 'utf8')
    await pg.exec(migration)
    await pg.exec(migration) // Retry-safe DDL.
    const database = drizzle(pg, { schema })
    const storage = new DatabaseStorage(database as unknown as ConstructorParameters<typeof DatabaseStorage>[0])
    const interaction = { userId: 'broker', prospectId: 'prospect', date: '2026-09-04T16:00:00Z', type: 'email', outcome: 'contacted', sourceProvider: 'codex', sourceMessageId: 'sent-1' }
    const results = await Promise.all(Array.from({ length: 12 }, () => storage.createContactInteraction(interaction)))
    assert.equal(new Set(results.map(row => row.id)).size, 1)
    assert.equal((await pg.query('SELECT * FROM skill_activities')).rows.length, 1)
    const afterOne = (await pg.query<{ follow_up: number }>('SELECT follow_up FROM broker_skills')).rows[0].follow_up
    assert.ok(afterOne > 0)
    await Promise.all(Array.from({ length: 8 }, (_, index) => storage.createContactInteraction({ ...interaction, sourceMessageId: 'independent-' + index })))
    assert.equal((await pg.query<{ follow_up: number }>('SELECT follow_up FROM broker_skills')).rows[0].follow_up, afterOne * 9)
    await pg.exec(`CREATE FUNCTION reject_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected XP failure'; END $$;
      CREATE TRIGGER reject_credit BEFORE INSERT ON skill_activities FOR EACH ROW EXECUTE FUNCTION reject_credit();`)
    await assert.rejects(storage.createContactInteraction({ ...interaction, sourceMessageId: 'interrupted' }))
    assert.equal((await pg.query("SELECT * FROM contact_interactions WHERE source_message_id = 'interrupted'")).rows.length, 0)
    assert.equal((await pg.query("SELECT * FROM interaction_event_receipts WHERE source_message_id = 'interrupted'")).rows.length, 0)
    await pg.exec('DROP TRIGGER reject_credit ON skill_activities')
    await storage.createContactInteraction({ ...interaction, sourceMessageId: 'interrupted' })
    assert.equal((await pg.query("SELECT * FROM contact_interactions WHERE source_message_id = 'interrupted'")).rows.length, 1)
    await assert.rejects(storage.createContactInteraction({ ...interaction, userId: 'other' }))

    // Even an unrelated permissive broadcast policy must not allow other-user topics.
    await pg.exec(`CREATE POLICY unrelated_broad_policy ON realtime.messages FOR SELECT TO authenticated USING(true);`)
    await database.transaction(async tx => {
      await tx.execute(sql.raw("SET LOCAL ROLE authenticated"))
      await tx.execute(sql.raw("SET LOCAL request.actor = '11111111-1111-1111-1111-111111111111'"))
      await tx.execute(sql.raw("SET LOCAL request.topic = 'levelcre:user:22222222-2222-2222-2222-222222222222'"))
      assert.equal((await tx.execute(sql.raw('SELECT * FROM realtime.messages'))).rows.length, 0)
      await assert.rejects(tx.execute(sql.raw('SELECT * FROM public.sales_activity_imports')))
    }).catch(error => {
      // The deliberately rejected SQL aborts its transaction.
      if (!String(error).includes('current transaction is aborted')) throw error
    })
  } finally { await pg.close() }
})
