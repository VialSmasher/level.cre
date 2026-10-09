import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeSalesActivityInput } from './salesActivityImport';
import { primaryContactIdentity, reconcilePrimaryContact } from './prospectContactService';
import { enrichSalesActivityEmail, normalizeEmailCapture, VerifiedEmailEvidenceSchema } from './emailEnrichmentService';

const evidence = { source: 'outlook_desktop', verification: 'matched_sent_items', providerMessageId: 'provider-1', observedAt: '2026-10-09T10:00:00Z' } as const;
const now = new Date('2026-10-09T13:00:00Z');
function activity(extra: Record<string, unknown> = {}) {
  const base = { source: 'outlook_sync', externalActivityId: 'provider-1', status: 'sent', activityType: 'email',
    contactName: 'Wayne Hebert', company: 'Trenton Cold Storage - Edmonton', email: 'wayne@example.test', activityAt: '2026-10-09T10:00:00Z' };
  return { ...normalizeSalesActivityInput({ ...base, ...extra }), emailEvidence: evidence, ...extra } as any;
}
async function harness() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE users(id varchar PRIMARY KEY); INSERT INTO users VALUES('owner'),('foreign');
    CREATE TABLE prospects(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id),name varchar,status varchar,business_name varchar,
      contact_name varchar,contact_company varchar,contact_email varchar,contact_phone varchar,merged_into_prospect_id varchar,
      notes varchar,address varchar,ai_metadata jsonb,archived_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE contact_interactions(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,source_metadata jsonb);
    CREATE TABLE activity_events(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,source varchar,event_type varchar,
      evidence_status varchar,match_status varchar,interaction_id varchar,source_metadata jsonb);
    CREATE TABLE skill_activities(id varchar PRIMARY KEY,xp_gained int);
    INSERT INTO prospects(id,user_id,name,status,business_name,contact_name,contact_company,contact_email,contact_phone,notes,address,ai_metadata) VALUES
      ('wayne','owner','Trenton Cold Storage - Edmonton','prospect','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton',NULL,'780-555-0100','Saved company notes','Saved address','{"propertyFacts":{"buildingSf":50000}}'),
      ('other','owner','Other Company','prospect','Other Company','Primary Person','Other Company','primary@example.test','780-555-0111','Other notes','Other address','{}');
    INSERT INTO contact_interactions VALUES('historical','owner','wayne','{"contactId":"old-identity","contactSnapshot":{"name":"Previous Person","email":"previous@example.test"},"evidenceStatus":"confirmed","direction":"outbound"}');
    INSERT INTO skill_activities VALUES('existing-credit',27);`);
  await db.exec(await readFile(new URL('../../../../drizzle/0021_prospect_contacts.sql', import.meta.url), 'utf8'));
  const queryable = { query: (sql: string, values?: any[]) => db.query(sql, values) } as any;
  const apply = async (input: any = activity(), userId = 'owner') => {
    await db.query('BEGIN');
    try { const result = await enrichSalesActivityEmail({ db: queryable, userId, activity: input, now }); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
  };
  const primary = async (prospectId = 'wayne') => {
    const prospect = (await db.query<any>('SELECT * FROM prospects WHERE id=$1', [prospectId])).rows[0];
    return reconcilePrimaryContact(queryable, prospect.user_id, prospect);
  };
  const secondary = async (extra: Record<string, unknown> = {}) => {
    const row = { id: randomUUID(), userId: 'owner', prospectId: 'other', name: 'Alex Contact', company: 'Other Company', email: null,
      phone: '780-555-0123', title: 'Operations Manager', additionalPhones: [{ label: 'Mobile', number: '780-555-0144' }], ...extra };
    await db.query(`INSERT INTO prospect_contacts(id,user_id,prospect_id,source,name,company,email,phone,title,additional_phones,identity_key)
      VALUES($1,$2,$3,'broker_added',$4,$5,$6,$7,$8,$9::jsonb,$10)`, [row.id, row.userId, row.prospectId, row.name, row.company, row.email,
      row.phone, row.title, JSON.stringify(row.additionalPhones), primaryContactIdentity(row)]);
    return row;
  };
  const untouchedActivity = async () => ({
    interactions: (await db.query('SELECT * FROM contact_interactions ORDER BY id')).rows,
    events: (await db.query('SELECT * FROM activity_events ORDER BY id')).rows,
    credit: (await db.query('SELECT * FROM skill_activities ORDER BY id')).rows,
  });
  return { db, apply, primary, secondary, untouchedActivity };
}

test('email proof capture accepts only explicit single-recipient proof and rejects private/unverified fields', () => {
  assert.deepEqual(normalizeEmailCapture({ email: 'wayne@example.test' }), { emailEvidence: null, emailCaptureIssue: null });
  assert.deepEqual(normalizeEmailCapture({ email: 'wayne@example.test', emailEvidence: evidence }), { emailEvidence: evidence, emailCaptureIssue: null });
  for (const raw of ['Wayne <wayne@example.test>', 'wayne@example.test,other@example.test', 'wayne@example.test\r\nBcc:other@example.test', 'wayne@example.test?subject=hidden']) {
    assert.equal(normalizeEmailCapture({ email: raw, emailEvidence: evidence }).emailCaptureIssue, 'invalid_email', raw);
  }
  for (const proof of [{ ...evidence, verified: true }, { ...evidence, body: 'private' }, { ...evidence, providerMessageId: 'provider-1\n' }, { ...evidence, verification: 'submitted' }, { ...evidence, source: 'inferred' }]) {
    assert.equal(VerifiedEmailEvidenceSchema.safeParse(proof).success, false);
  }
  assert.equal(normalizeEmailCapture({ email: 'wayne@example.test', emailEvidence: evidence, expectedEmailContact: { name: 'Wayne', email: null } }).emailCaptureIssue, 'invalid_expected_email_contact');
});

test('primary fill versions only the current identity, preserves saved fields/history/credit, and replays without another write', async () => {
  const h = await harness(); try {
    const old = await h.primary();
    const phones = [{ label: 'Mobile', number: '780-555-0144' }];
    await h.db.query('UPDATE prospect_contacts SET title=$2,additional_phones=$3::jsonb WHERE id=$1', [old.id, 'Operations Manager', JSON.stringify(phones)]);
    const previousActivities = await h.untouchedActivity();
    const before = (await h.db.query<any>('SELECT * FROM prospects WHERE id=$1', ['wayne'])).rows[0];
    const filled = await h.apply();
    assert.equal(filled.status, 'applied'); assert.equal(filled.prospectId, 'wayne'); assert.equal(filled.previousContactId, old.id);
    assert.notEqual(filled.contactId, old.id); assert.deepEqual(filled.evidence, evidence);
    const active = (await h.db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1', [filled.contactId])).rows[0];
    assert.equal(active.email, 'wayne@example.test'); assert.equal(active.phone, before.contact_phone); assert.equal(active.name, before.contact_name);
    assert.equal(active.company, before.contact_company); assert.equal(active.title, 'Operations Manager'); assert.deepEqual(active.additional_phones, phones);
    const archived = (await h.db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1', [old.id])).rows[0];
    assert.ok(archived.archived_at); assert.equal(archived.email, null); assert.equal(archived.is_primary, false);
    const after = (await h.db.query<any>('SELECT * FROM prospects WHERE id=$1', ['wayne'])).rows[0];
    assert.equal(after.contact_email, 'wayne@example.test');
    for (const key of ['notes', 'address', 'ai_metadata', 'name', 'business_name', 'contact_name', 'contact_company', 'contact_phone', 'status']) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(await h.untouchedActivity(), previousActivities);
    const snapshots = (await h.db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows;
    const replay = await h.apply(); assert.equal(replay.status, 'unchanged'); assert.equal(replay.contactId, filled.contactId);
    assert.deepEqual((await h.db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows, snapshots);
    assert.deepEqual((await h.db.query('SELECT * FROM prospects WHERE id=$1', ['wayne'])).rows[0], after);
  } finally { await h.db.close(); }
});

test('secondary fill keeps account primary email and every other secondary field while versioning the relationship', async () => {
  const h = await harness(); try {
    const old = await h.secondary();
    const account = (await h.db.query('SELECT * FROM prospects WHERE id=$1', ['other'])).rows[0];
    const prior = await h.untouchedActivity();
    const filled = await h.apply(activity({ contactName: 'Alex Contact', company: 'Other Company', email: 'alex@example.test', prospectId: 'other', contactId: old.id }));
    assert.equal(filled.status, 'applied'); assert.equal(filled.previousContactId, old.id); assert.notEqual(filled.contactId, old.id);
    const next = (await h.db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1', [filled.contactId])).rows[0];
    assert.equal(next.email, 'alex@example.test');
    for (const key of ['name', 'company', 'phone', 'title']) assert.equal(next[key], (old as any)[key]);
    assert.deepEqual(next.additional_phones, old.additionalPhones); assert.equal(next.source, 'broker_added'); assert.equal(next.is_primary, false);
    const archived = (await h.db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1', [old.id])).rows[0]; assert.ok(archived.archived_at); assert.equal(archived.email, null);
    assert.deepEqual((await h.db.query('SELECT * FROM prospects WHERE id=$1', ['other'])).rows[0], account);
    assert.deepEqual(await h.untouchedActivity(), prior);
    assert.equal((await h.apply(activity({ contactName: 'Alex Contact', company: 'Other Company', email: 'alex@example.test' }))).status, 'unchanged');
    assert.equal((await h.apply(activity({ contactName: 'Alex Contact', company: 'Other Company', email: 'alex@example.test', contactId: old.id }))).reason, 'no_exact_saved_contact');
  } finally { await h.db.close(); }
});

test('conservative target matching excludes foreign, inactive and archived records and refuses ambiguity/conflicts', async (t) => {
  const h = await harness(); try {
    await t.test('missing proof/name/company and unsupported direction do not mutate', async () => {
      for (const [extra, reason] of [
        [{ emailEvidence: null }, 'email_evidence_not_supplied'], [{ contactName: null }, 'contact_name_required'], [{ company: null }, 'company_context_required'],
        [{ email: 'wayne@example.test\nBcc:other@example.test' }, 'invalid_email'], [{ activityStatus: 'draft' }, 'not_verified_email_direction'],
        [{ emailEvidence: { ...evidence, verification: 'matched_inbox' } }, 'not_verified_email_direction'],
        [{ emailEvidence: { ...evidence, providerMessageId: 'other-provider' } }, 'provider_message_mismatch'],
        [{ externalActivityId: 'codex_synthetic', emailEvidence: { ...evidence, providerMessageId: 'codex_synthetic' } }, 'provider_message_mismatch'],
        [{ emailEvidence: { ...evidence, observedAt: '2027-01-01T00:00:00Z' } }, 'invalid_email_evidence_date'],
      ] as const) assert.equal((await h.apply(activity(extra))).reason, reason);
      assert.equal((await h.db.query<any>('SELECT contact_email FROM prospects WHERE id=$1', ['wayne'])).rows[0].contact_email, null);
    });
    await t.test('owned records are the only eligible scope; merged/no_go/archived targets cannot be inferred', async () => {
      await h.db.query(`INSERT INTO prospects(id,user_id,name,status,business_name,contact_name,contact_company) VALUES
        ('foreign','foreign','Trenton Cold Storage - Edmonton','prospect','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton'),
        ('merged','owner','Trenton Cold Storage - Edmonton','prospect','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton'),
        ('no-go','owner','Trenton Cold Storage - Edmonton','no_go','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton'),
        ('archived-status','owner','Trenton Cold Storage - Edmonton','archived','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton'),
        ('archived-date','owner','Trenton Cold Storage - Edmonton','prospect','Trenton Cold Storage - Edmonton','Wayne Hebert','Trenton Cold Storage - Edmonton')`);
      await h.db.query('UPDATE prospects SET merged_into_prospect_id=$2 WHERE id=$1', ['merged', 'wayne']);
      await h.db.query('UPDATE prospects SET archived_at=now() WHERE id=$1', ['archived-date']);
      for (const prospectId of ['foreign', 'merged', 'no-go', 'archived-status', 'archived-date']) assert.equal((await h.apply(activity({ prospectId }))).reason, 'no_exact_saved_contact');
      const archived = await h.secondary({ name: 'Archived Person' }); await h.db.query('UPDATE prospect_contacts SET archived_at=now() WHERE id=$1', [archived.id]);
      assert.equal((await h.apply(activity({ contactName: 'Archived Person', company: 'Other Company', contactId: archived.id }))).reason, 'no_exact_saved_contact');
      assert.equal((await h.apply(activity({ prospectId: 'wayne' }), 'foreign')).reason, 'no_exact_saved_contact');
    });
    await t.test('duplicate exact names remain ambiguous even when one has a nonblank email', async () => {
      const duplicate = await h.secondary({ prospectId: 'wayne', name: 'Wayne Hebert', company: 'Trenton Cold Storage - Edmonton', email: 'other-wayne@example.test' });
      assert.equal((await h.apply()).reason, 'ambiguous_saved_contact');
      await h.db.query('UPDATE prospect_contacts SET archived_at=now() WHERE id=$1', [duplicate.id]);
    });
    await t.test('existing differing email is never overwritten, and shared email cannot be borrowed', async () => {
      await h.db.query('UPDATE prospects SET contact_email=$2 WHERE id=$1', ['wayne', 'different@example.test']);
      assert.equal((await h.apply()).reason, 'existing_email_conflict');
      await h.db.query('UPDATE prospects SET contact_email=NULL WHERE id=$1', ['wayne']);
      const shared = await h.secondary({ email: 'wayne@example.test' });
      assert.equal((await h.apply()).reason, 'shared_saved_email');
      await h.db.query('UPDATE prospect_contacts SET archived_at=now() WHERE id=$1', [shared.id]);
    });
    await t.test('pending started call is left unchanged; stale expected snapshot does not overwrite later edits', async () => {
      await h.db.query(`INSERT INTO activity_events VALUES('pending','owner','wayne','level_cre_mobile_calling','call_started','observed','matched',NULL,'{"sessionState":"started","contactSnapshot":{"name":"Wayne Hebert","email":null}}')`);
      const before = await h.untouchedActivity(); assert.equal((await h.apply()).reason, 'pending_call'); assert.deepEqual(await h.untouchedActivity(), before);
      await h.db.query('DELETE FROM activity_events WHERE id=$1', ['pending']);
      assert.equal((await h.apply(activity({ prospectId: 'wayne', expectedEmailContact: { name: 'Wayne Hebert', email: null, phone: 'old phone', company: 'Trenton Cold Storage - Edmonton' } }))).reason, 'stale_contact_snapshot');
    });
    await t.test('NFKC case/whitespace normalization is exact; punctuation/fuzzy names are not accepted', async () => {
      assert.equal((await h.apply(activity({ contactName: 'Wayne H.' }))).reason, 'no_exact_saved_contact');
      assert.equal((await h.apply(activity({ contactName: 'ＷＡＹＮＥ   ＨＥＢＥＲＴ', company: '  trenton cold storage - edmonton  ' }))).status, 'applied');
    });
  } finally { await h.db.close(); }
});

test('explicit owned contact scope still checks identity, expected fields and inbox proof; canonical provider replay is supported', async () => {
  const h = await harness(); try {
    const old = await h.primary();
    assert.equal((await h.apply(activity({ contactId: old.id, contactName: 'Alex Contact' }))).reason, 'no_exact_saved_contact');
    const received = activity({ activityStatus: 'received', direction: 'inbound', company: null, prospectId: 'wayne', contactId: old.id,
      emailEvidence: { ...evidence, verification: 'matched_inbox' }, expectedEmailContact: { name: 'Wayne Hebert', email: null, phone: '780-555-0100', company: 'Trenton Cold Storage - Edmonton' },
      externalActivityId: 'canonical-provider', rawPayload: { reconciledIdentity: { externalActivityId: 'provider-1' } } });
    const result = await h.apply(received); assert.equal(result.status, 'applied');
    const stale = await h.apply(activity({ contactId: old.id })); assert.equal(stale.reason, 'no_exact_saved_contact');
  } finally { await h.db.close(); }
});

test('fresh locked target revalidation defers a prospect archived after candidate discovery', async () => {
  const h = await harness(); try {
    let archived = false;
    const db: any = { query: async (sql: string, values?: any[]) => {
      if (!archived && sql === 'SELECT * FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE') {
        archived = true;
        await h.db.query('UPDATE prospects SET archived_at=now() WHERE id=$1', ['wayne']);
      }
      return h.db.query(sql, values);
    } };
    await h.db.query('BEGIN');
    const result = await enrichSalesActivityEmail({ db, userId: 'owner', activity: activity(), now });
    await h.db.query('COMMIT');
    assert.equal(result.reason, 'inactive_or_changed_prospect');
    assert.equal((await h.db.query<any>('SELECT contact_email FROM prospects WHERE id=$1', ['wayne'])).rows[0].contact_email, null);
    assert.equal((await h.db.query<any>('SELECT count(*)::int AS count FROM prospect_contacts')).rows[0].count, 0);
  } finally { await h.db.close(); }
});

test('verified email evidence with a different original timestamp cannot fill or version a saved contact', async () => {
  const h = await harness(); try {
    await h.primary();
    const prospects = (await h.db.query('SELECT * FROM prospects ORDER BY id')).rows;
    const contacts = (await h.db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows;
    const activityBefore = await h.untouchedActivity();
    const result = await h.apply(activity({ emailEvidence: { ...evidence, observedAt: '2026-10-09T12:00:00Z' } }));
    assert.equal(result.status, 'needs_review');
    assert.equal((await h.db.query<any>('SELECT contact_email FROM prospects WHERE id=$1', ['wayne'])).rows[0].contact_email, null);
    assert.deepEqual((await h.db.query('SELECT * FROM prospects ORDER BY id')).rows, prospects);
    assert.deepEqual((await h.db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows, contacts);
    assert.deepEqual(await h.untouchedActivity(), activityBefore);
  } finally { await h.db.close(); }
});
