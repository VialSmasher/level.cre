import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { importSalesActivityBatch, reviewSalesActivityImport, SalesActivityBatchSchema } from './salesActivityImportService';
import { normalizeSalesActivityInput } from './salesActivityImport';
import { resolveSalesActivityContact, fillSalesActivityContactAttribution } from './salesActivityContactAttribution';
import { PGlite } from '@electric-sql/pglite';
import { createProspectContact, getCallingWorkspace, updateProspectContact, ProspectContactCreateSchema, ProspectContactUpdateSchema } from './prospectContactService';
import { recordMobileCallStart, recordMobileCallOutcome, discardMobileCallStart, getMobileCallingProgress, listMobileCallQueue } from './mobileCallingService';

const schema = `
CREATE TABLE users(id varchar PRIMARY KEY);
CREATE TABLE prospects(id varchar PRIMARY KEY,user_id varchar NOT NULL REFERENCES users(id),name varchar,status varchar,notes varchar DEFAULT '',address varchar,business_name varchar,website_url varchar,building_sf integer,lot_size_acres numeric,ai_metadata jsonb,last_contact_date varchar,follow_up_due_date timestamptz,contact_name varchar,contact_company varchar,contact_email varchar,contact_phone varchar,merged_into_prospect_id varchar,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
CREATE TABLE listings(id varchar PRIMARY KEY,title varchar,archived_at timestamp);
CREATE TABLE listing_prospects(id varchar,listing_id varchar,prospect_id varchar);
CREATE TABLE contact_interactions(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,date varchar,type varchar,outcome varchar,notes varchar,next_follow_up varchar,source_provider varchar,source_message_id varchar,source_metadata jsonb DEFAULT '{}',created_at timestamp DEFAULT now());
CREATE TABLE activity_events(id varchar PRIMARY KEY,user_id varchar,source varchar,external_event_id varchar,event_type varchar,direction varchar,evidence_status varchar,occurred_at timestamptz,contact_name varchar,company varchar,email varchar,phone varchar,summary varchar,property_address varchar,confidence integer,match_status varchar,match_reason varchar,prospect_id varchar,interaction_id varchar,source_metadata jsonb DEFAULT '{}',created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),UNIQUE(user_id,source,external_event_id));
CREATE TABLE activity_event_links(id varchar,user_id varchar,event_id varchar,entity_type varchar,entity_id varchar,role varchar,confidence integer,metadata jsonb,UNIQUE(event_id,entity_type,entity_id,role));
CREATE TABLE skill_activities(id varchar,user_id varchar,skill_type varchar,action varchar,xp_gained integer,related_id varchar,multiplier integer,timestamp timestamp DEFAULT now());
CREATE TABLE broker_skills(id varchar,user_id varchar UNIQUE,prospecting integer,follow_up integer,consistency integer,market_knowledge integer,last_activity timestamp,streak_days integer,created_at timestamp,updated_at timestamp);
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
INSERT INTO users VALUES ('owner'),('foreign');
INSERT INTO prospects(id,user_id,name,status,contact_name,contact_company,contact_email,contact_phone,notes,ai_metadata,last_contact_date,follow_up_due_date) VALUES
 ('account','owner','Verified company','prospect','Joe Owner','Verified company','joe@example.test','780-555-0100','Broker note','{"propertyLink":{"propertyProspectId":"building","relationship":"occupant"}}','2026-09-01','2026-09-04T00:00:00.000Z'),
 ('other-account','owner','Other company','prospect',NULL,NULL,NULL,NULL,'',NULL,NULL,NULL),
 ('foreign-account','foreign','Foreign company','prospect','Foreign','Foreign company','foreign@example.test','780-555-0101','',NULL,NULL,NULL);
INSERT INTO contact_interactions(id,user_id,prospect_id,date,type,outcome,notes) VALUES ('old-history','owner','account','2026-09-01','email','contacted','Legacy company history');
`;
async function harness() {
  const db = new PGlite(); await db.exec(schema);
  await db.exec(await readFile(new URL('../../../../drizzle/0021_prospect_contacts.sql', import.meta.url), 'utf8'));
  let tail = Promise.resolve();
  async function acquire() { const prior = tail; let release!: () => void; tail = new Promise<void>((resolve) => { release = resolve; }); await prior; return release; }
  const pool: any = {
    async query(sql: string, values?: any[]) { const release = await acquire(); try { return await db.query(sql,values); } finally { release(); } },
    async connect() { const release = await acquire(); return {query:(sql:string,values?:any[])=>db.query(sql,values),release}; },
  };
  const workspace = (contactId?: string) => getCallingWorkspace({pool,userId:'owner',prospectId:'account',contactId});
  const count = async (table:string) => Number((await db.query<{count:number}>(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count);
  return {db,pool,workspace,count};
}

test('contact mutations reject caller authority, promotion and excessive phone options', () => {
  assert.equal(ProspectContactCreateSchema.safeParse({name:'Alex',userId:'foreign'}).success,false);
  assert.equal(ProspectContactUpdateSchema.safeParse({isPrimary:true}).success,false);
  assert.equal(ProspectContactCreateSchema.safeParse({name:'Alex',additionalPhones:Array.from({length:6},()=>({label:'Office',number:'780-555-0123'}))}).success,false);
});

test('owned contact roster and calling attribution use actual disposable PostgreSQL statements', async (t) => {
  const h = await harness(); const {db,pool,workspace,count}=h;
  let primaryId=''; let extraId=''; let savedStart:any;
  try {
    await t.test('private migration denies browser roles and does not backfill historical activity', async () => {
      await db.exec('SET ROLE authenticated');
      await assert.rejects(db.query('SELECT * FROM public.prospect_contacts'),/permission denied/);
      await db.exec('RESET ROLE');
      assert.equal(await count('prospect_contacts'),0);
      assert.equal((await db.query<any>('SELECT source_metadata FROM contact_interactions')).rows[0].source_metadata.contactId,undefined);
    });
    await t.test('primary anchor is durable, read reconciliation is unchanged, and asset facts stay intact', async () => {
      const initial=await workspace(); primaryId=initial.primaryContactId;
      assert.equal(initial.contacts.length,1); assert.equal(initial.contacts[0].name,'Joe Owner');
      assert.equal(initial.unattributedActivityCount,1); assert.equal(initial.activity[0].contactId,null);
      assert.equal(initial.activity[0].occurredAt,'2026-09-01');
      const before=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[primaryId])).rows[0];
      const parallel=await Promise.all([workspace(),workspace()]);
      assert.ok(parallel.every((value)=>value.primaryContactId===primaryId));
      const after=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[primaryId])).rows[0];
      assert.deepEqual(after,before); assert.equal(await count('prospects'),3);
      assert.deepEqual(initial.prospect.aiMetadata,{propertyLink:{propertyProspectId:'building',relationship:'occupant'}});
    });
    await t.test('cosmetic identity and a named contact phone edit retain the relationship ID', async () => {
      await db.query("UPDATE prospects SET contact_name='JOE   OWNER',contact_email='JOE@example.test',contact_phone='780-555-0102' WHERE id='account'");
      const changed=await workspace(); assert.equal(changed.primaryContactId,primaryId); assert.equal(changed.contacts[0].phone,'780-555-0102');
    });
    await t.test('additional people and labeled numbers never replace the primary or create map assets', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Alex Manager',email:'alex@example.test',company:'Manager employer',phone:'780-555-0110',title:'Manager',additionalPhones:[{label:'Mobile',number:'780-555-0111'},{label:'Direct',number:'780-555-0112 ext 9'}]}});
      extraId=added.contacts.find((value)=>!value.isPrimary)!.id;
      assert.equal(added.primaryContactId,primaryId); assert.equal(added.contacts[1].additionalPhones.length,2);
      assert.equal((await db.query<any>("SELECT contact_name FROM prospects WHERE id='account'")).rows[0].contact_name,'JOE   OWNER');
      assert.equal(await count('prospects'),3);
    });
    await t.test('selected labeled phone starts persist exact person attribution without confirmed credit', async () => {
      savedStart=await recordMobileCallStart({pool,userId:'owner',input:{clientEventId:'roster-call-start-1',prospectId:'account',contactId:extraId,expectedPhone:'780-555-0111'}});
      assert.equal(savedStart.contactId,extraId); assert.equal(savedStart.contactSnapshot.name,'Alex Manager');
      const progress=await getMobileCallingProgress({pool,userId:'owner'});
      assert.equal(progress.progress.confirmedToday,0); assert.equal(progress.pendingSessions[0].contactId,extraId);
      assert.equal(progress.pendingSessions[0].candidate.contact.company,'Verified company');
      assert.equal(progress.pendingSessions[0].candidate.contact.name,'JOE   OWNER');
      assert.equal(progress.pendingSessions[0].contactSnapshot?.company,'Manager employer');
      assert.equal(progress.pendingSessions[0].phoneSnapshot,'780-555-0111'); assert.equal(await count('skill_activities'),0);
    });
    await t.test('legacy primary replacement versions the person and does not relabel old snapshots', async () => {
      await db.query("UPDATE prospects SET contact_name='Tim Director',contact_email='tim@example.test',contact_phone='780-555-0120' WHERE id='account'");
      const changed=await workspace(); assert.notEqual(changed.primaryContactId,primaryId);
      const old=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[primaryId])).rows[0];
      assert.equal(old.name,'JOE   OWNER'); assert.equal(old.is_primary,false); assert.ok(old.archived_at);
      primaryId=changed.primaryContactId;
      const oldFeed=await workspace(old.id); assert.equal(oldFeed.activity.length,0);
    });
    await t.test('archived or edited contact cannot alter the target already saved at start', async () => {
      await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:extraId,input:{phone:'780-555-0119',archived:true}});
      const input={clientEventId:'roster-call-start-1',prospectId:'account',contactId:extraId,expectedPhone:'780-555-0111',outcome:'attempted' as const,notes:''};
      await assert.rejects(recordMobileCallOutcome({pool,userId:'owner',input:{...input,contactId:primaryId}}),(error:any)=>error.code==='idempotency_conflict');
      const result=await recordMobileCallOutcome({pool,userId:'owner',input}); assert.equal(result.duplicate,false);
      const replay=await recordMobileCallOutcome({pool,userId:'owner',input}); assert.equal(replay.duplicate,true);
      assert.equal(await count('skill_activities'),1);
      const stored=(await db.query<any>('SELECT * FROM contact_interactions WHERE id=$1',[result.interactionId])).rows[0];
      assert.equal(stored.prospect_id,'account'); assert.equal(stored.source_metadata.contactId,extraId);
      assert.equal(stored.source_metadata.contactSnapshot.name,'Alex Manager'); assert.equal(stored.source_metadata.phoneSnapshot,'780-555-0111');
      assert.equal((await db.query<any>("SELECT follow_up FROM broker_skills WHERE user_id='owner'")).rows[0].follow_up,15);
      const prospect=(await db.query<any>("SELECT * FROM prospects WHERE id='account'")).rows[0];
      assert.equal(prospect.status,'prospect'); assert.equal(prospect.last_contact_date,'2026-09-01');
      assert.equal(new Date(prospect.follow_up_due_date).toISOString(),'2026-09-04T00:00:00.000Z');
    });
    await t.test('contact history includes only known attribution and All retains legacy context', async () => {
      const selected=await workspace(extraId); assert.equal(selected.activity.length,1); assert.equal(selected.activity[0].contactName,'Alex Manager');
      assert.equal((await workspace(primaryId)).activity.length,0);
      const all=await workspace(); assert.equal(all.activity.length,2); assert.equal(all.unattributedActivityCount,1);
    });
    await t.test('explicit alternate workflow retains company completion and counts each real confirmation once', async () => {
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:20})).rows.some((row)=>row.prospect.id==='account'),false);
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:20,includeCalledToday:true})).rows.some((row)=>row.prospect.id==='account'),true);
      const start={clientEventId:'roster-call-start-2',prospectId:'account',contactId:primaryId,expectedPhone:'780-555-0120'};
      await recordMobileCallStart({pool,userId:'owner',input:start});
      await recordMobileCallOutcome({pool,userId:'owner',input:{...start,outcome:'contacted',notes:''}});
      const progress=await getMobileCallingProgress({pool,userId:'owner'}); assert.equal(progress.progress.confirmedToday,2); assert.equal(progress.progress.connectedToday,1);
      assert.equal((await db.query<any>("SELECT follow_up FROM broker_skills WHERE user_id='owner'")).rows[0].follow_up,30);
      assert.equal(await count('prospects'),3);
    });
    await t.test('foreign owner, wrong relationship, archived contact and changed number are denied', async () => {
      await assert.rejects(getCallingWorkspace({pool,userId:'foreign',prospectId:'account'}),(error:any)=>error.code==='prospect_not_found');
      await assert.rejects(createProspectContact({pool,userId:'foreign',prospectId:'account',input:{name:'No'}}),(error:any)=>error.code==='prospect_not_found');
      await assert.rejects(updateProspectContact({pool,userId:'foreign',prospectId:'account',contactId:primaryId,input:{phone:'780-555-0199'}}),(error:any)=>error.code==='prospect_not_found');
      await assert.rejects(recordMobileCallStart({pool,userId:'owner',input:{clientEventId:'wrong-relation-call',prospectId:'other-account',contactId:primaryId,expectedPhone:'780-555-0120'}}),(error:any)=>error.code==='contact_not_found');
      await assert.rejects(recordMobileCallStart({pool,userId:'owner',input:{clientEventId:'archived-contact-call',prospectId:'account',contactId:extraId,expectedPhone:'780-555-0111'}}),(error:any)=>error.code==='contact_not_found');
      await assert.rejects(recordMobileCallStart({pool,userId:'owner',input:{clientEventId:'changed-number-call',prospectId:'account',contactId:primaryId,expectedPhone:'780-555-0199'}}),(error:any)=>error.code==='contact_phone_changed');
      assert.equal(await count('skill_activities'),2);
    });
    await t.test('undo is attribution-bound and does not create a confirmed interaction or XP', async () => {
      const start={clientEventId:'roster-call-undo-3',prospectId:'account',contactId:primaryId,expectedPhone:'780-555-0120'};
      await recordMobileCallStart({pool,userId:'owner',input:start});
      await assert.rejects(discardMobileCallStart({pool,userId:'owner',input:{clientEventId:start.clientEventId,prospectId:'account',contactId:extraId}}),(error:any)=>error.code==='idempotency_conflict');
      await discardMobileCallStart({pool,userId:'owner',input:{clientEventId:start.clientEventId,prospectId:'account',contactId:primaryId}});
      assert.equal(await count('skill_activities'),2); assert.equal(await count('contact_interactions'),3);
    });
    await t.test('primary roster editing writes legacy fields and versions identity; phone limits are enforced in SQL', async () => {
      const edited=await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:primaryId,input:{name:'Taylor Director',email:'taylor@example.test',additionalPhones:[{label:'Office',number:'780-555-0150'}]}});
      assert.notEqual(edited.primaryContactId,primaryId); assert.equal(edited.contacts[0].name,'Taylor Director'); assert.equal(edited.contacts[0].additionalPhones.length,1);
      assert.equal((await db.query<any>("SELECT contact_name FROM prospects WHERE id='account'")).rows[0].contact_name,'Taylor Director');
      await assert.rejects(updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:edited.primaryContactId,input:{archived:true}}),(error:any)=>error.code==='primary_contact_archive');
      await assert.rejects(db.query('UPDATE prospect_contacts SET additional_phones=$2::jsonb WHERE id=$1',[edited.primaryContactId,JSON.stringify(Array.from({length:6},()=>({label:'Bad',number:'780-555-0123'})))]),/prospect_contacts_phone_options/);
    });
    await t.test('replacement of a named additional contact versions its ID rather than relabeling person history', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Max Contact',email:'max@example.test',phone:'780-555-0160'}});
      const max=added.contacts.find((item)=>item.name==='Max Contact')!;
      const changed=await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:max.id,input:{name:'Morgan Contact',email:'morgan@example.test'}});
      const morgan=changed.contacts.find((item)=>item.name==='Morgan Contact')!; assert.notEqual(morgan.id,max.id);
      const retired=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[max.id])).rows[0];
      assert.equal(retired.name,'Max Contact'); assert.ok(retired.archived_at);
    });
    await t.test('unknown primary phones stay research context while a named additional person is callable', async () => {
      const blank=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'});
      await db.query("UPDATE prospects SET contact_phone='780-555-0131' WHERE id='other-account'");
      const numbered=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'}); assert.notEqual(numbered.primaryContactId,blank.primaryContactId);
      await db.query("UPDATE prospects SET contact_phone='(780) 555-0131' WHERE id='other-account'");
      assert.equal((await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'})).primaryContactId,numbered.primaryContactId);
      await db.query("UPDATE prospects SET contact_phone=NULL WHERE id='other-account'");
      const empty=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'});
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:20})).rows.some((item)=>item.prospect.id==='other-account'),false);
      await updateProspectContact({pool,userId:'owner',prospectId:'other-account',contactId:empty.primaryContactId,input:{additionalPhones:[{label:'Saved office',number:'780-555-0133'}]}});
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:20})).rows.some((item)=>item.prospect.id==='other-account'),false);
      await updateProspectContact({pool,userId:'owner',prospectId:'other-account',contactId:empty.primaryContactId,input:{additionalPhones:[]}});
      await createProspectContact({pool,userId:'owner',prospectId:'other-account',input:{name:'Only Callable Person',additionalPhones:[{label:'Office',number:'780-555-0132'}]}});
      const queue=await listMobileCallQueue({pool,userId:'owner',limit:20}); assert.ok(queue.rows.some((item)=>item.prospect.id==='other-account'));
    });
    await t.test('a primary edit after start preserves the original person and number on confirmation', async () => {
      const old=(await workspace()).contacts[0];
      const input={clientEventId:'primary-version-call-4',prospectId:'account',contactId:old.id,expectedPhone:old.phone!};
      await recordMobileCallStart({pool,userId:'owner',input});
      await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:old.id,input:{name:'Jordan Director',email:'jordan@example.test',phone:'780-555-0170'}});
      const result=await recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'attempted',notes:''}});
      const stored=(await db.query<any>('SELECT source_metadata FROM contact_interactions WHERE id=$1',[result.interactionId])).rows[0].source_metadata;
      assert.equal(stored.contactId,old.id); assert.equal(stored.contactSnapshot.name,'Taylor Director'); assert.equal(stored.phoneSnapshot,old.phone);
      assert.equal((await workspace(old.id)).activity.length,1);
    });
    await t.test('interaction storage failure rolls back confirmation, frozen attribution and XP together', async () => {
      const current=(await workspace()).contacts[0];
      const input={clientEventId:'failing-call-test-5',prospectId:'account',contactId:current.id,expectedPhone:current.phone!};
      await recordMobileCallStart({pool,userId:'owner',input});
      const before=(await db.query<any>("SELECT * FROM activity_events WHERE external_event_id='failing-call-test-5'")).rows[0];
      const xpBefore=await count('skill_activities');
      await db.exec("ALTER TABLE contact_interactions ADD CONSTRAINT test_failed_write CHECK (source_message_id IS DISTINCT FROM 'failing-call-test-5')");
      await assert.rejects(recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'attempted',notes:''}}),/test_failed_write/);
      const after=(await db.query<any>("SELECT * FROM activity_events WHERE external_event_id='failing-call-test-5'")).rows[0];
      assert.deepEqual(after,before); assert.equal(await count('skill_activities'),xpBefore);
      await db.exec('ALTER TABLE contact_interactions DROP CONSTRAINT test_failed_write');
    });
    await t.test('a missing or rejected start can be cancelled without contact validation and its late start cannot revive it', async () => {
      const current=(await workspace()).contacts[0];
      const input={clientEventId:'rejected-start-cancel-6',prospectId:'account',contactId:current.id,expectedPhone:'780-555-0199'};
      await assert.rejects(recordMobileCallStart({pool,userId:'owner',input}),(error:any)=>error.code==='contact_phone_changed');
      const before=await getMobileCallingProgress({pool,userId:'owner'}); const xp=await count('skill_activities'); const history=await count('contact_interactions');
      const cancelled=await discardMobileCallStart({pool,userId:'owner',input:{clientEventId:input.clientEventId,prospectId:input.prospectId,contactId:input.contactId}});
      assert.equal(cancelled.status,'discarded'); assert.equal(cancelled.duplicate,false);
      const late=await recordMobileCallStart({pool,userId:'owner',input}); assert.equal(late.status,'discarded'); assert.equal(late.duplicate,true);
      await assert.rejects(recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'attempted',notes:''}}),(error:any)=>error.code==='call_start_discarded');
      assert.deepEqual((await getMobileCallingProgress({pool,userId:'owner'})).progress,before.progress);
      assert.equal(await count('skill_activities'),xp); assert.equal(await count('contact_interactions'),history);
      const stored=(await db.query<any>('SELECT * FROM activity_events WHERE id=$1',[cancelled.eventId])).rows[0];
      assert.equal(stored.match_status,'ignored'); assert.equal(stored.source_metadata.candidate,undefined);
    });
    await t.test('missing-start cancellation on an inactive or merged owned record remains safe and replayable', async () => {
      await db.query("UPDATE prospects SET status='no_go',merged_into_prospect_id='account' WHERE id='other-account'");
      const input={clientEventId:'inactive-cancel-first-7',prospectId:'other-account'};
      assert.equal((await discardMobileCallStart({pool,userId:'owner',input})).status,'discarded');
      assert.equal((await recordMobileCallStart({pool,userId:'owner',input:{...input,expectedPhone:'780-555-0188'}})).status,'discarded');
      await db.query("UPDATE prospects SET status='prospect',merged_into_prospect_id=NULL WHERE id='other-account'");
    });
    await t.test('foreign or deleted targets allow local dismissal while making zero ledger or activity writes', async () => {
      const events=await count('activity_events'); const xp=await count('skill_activities');
      const foreign=await discardMobileCallStart({pool,userId:'foreign',input:{clientEventId:'foreign-cancel-absent-8',prospectId:'account'}});
      assert.equal(foreign.status,'unavailable'); assert.ok('canDismissLocally' in foreign && foreign.canDismissLocally);
      await db.query("INSERT INTO prospects(id,user_id,name,status) VALUES ('deleted-target','owner','Deleted company','prospect')");
      await db.query("DELETE FROM prospects WHERE id='deleted-target'");
      const deleted=await discardMobileCallStart({pool,userId:'owner',input:{clientEventId:'deleted-cancel-absent-9',prospectId:'deleted-target'}});
      assert.equal(deleted.status,'unavailable'); assert.ok('canDismissLocally' in deleted && deleted.canDismissLocally);
      assert.equal(await count('activity_events'),events); assert.equal(await count('skill_activities'),xp);
    });
    await t.test('an owned frozen event can be discarded after its prospect disappears; confirmed calls cannot be cancelled', async () => {
      await db.query("INSERT INTO prospects(id,user_id,name,status,contact_name,contact_phone) VALUES ('removed-after-start','owner','Temporary company','prospect','Temporary person','780-555-0190')");
      const input={clientEventId:'owned-event-delete-10',prospectId:'removed-after-start',expectedPhone:'780-555-0190'};
      const started=await recordMobileCallStart({pool,userId:'owner',input});
      await db.query("DELETE FROM prospects WHERE id='removed-after-start'");
      await db.query('UPDATE activity_events SET prospect_id=NULL WHERE id=$1',[started.eventId]);
      const discarded=await discardMobileCallStart({pool,userId:'owner',input:{clientEventId:input.clientEventId,prospectId:input.prospectId,contactId:started.contactId!}});
      assert.equal(discarded.status,'discarded');
      await assert.rejects(discardMobileCallStart({pool,userId:'owner',input:{clientEventId:'roster-call-start-2',prospectId:'account',contactId:primaryId}}),(error:any)=>error.code==='call_already_confirmed');
    });
  } finally { await db.close(); }
});

test('confirmed email sync attributes exact saved people using disposable PostgreSQL without replay credit', async (t) => {
  const { db, pool, workspace, count } = await harness();
  await db.exec(`CREATE TABLE opportunities(id varchar,user_id varchar,prospect_id varchar,archived_at timestamp,status varchar,stage varchar);
    CREATE TABLE sales_activity_imports(id varchar PRIMARY KEY,user_id varchar,source varchar,run_id varchar,external_activity_id varchar,activity_status varchar,activity_type varchar,contact_name varchar,company varchar,email varchar,email_domain varchar,subject varchar,notes varchar,activity_at timestamptz,prospect_id varchar,listing_id varchar,match_status varchar,match_reason varchar,confidence integer,interaction_id varchar,raw_payload jsonb,updated_at timestamp DEFAULT now(),UNIQUE(user_id,source,external_activity_id));
    CREATE TABLE automation_event_payloads(user_id varchar,producer_id varchar,source varchar,external_activity_id varchar,fingerprint varchar,UNIQUE(user_id,producer_id,source,external_activity_id));`);
  let storageCalls = 0;
  const storage = { async createContactInteraction(input: any, options?: any) {
    storageCalls++;
    const existing = await db.query<any>('SELECT id FROM contact_interactions WHERE user_id=$1 AND prospect_id=$2 AND source_provider=$3 AND source_message_id=$4',
      [input.userId,input.prospectId,input.sourceProvider,input.sourceMessageId]);
    if (existing.rows[0]) return { ...existing.rows[0], duplicate: true };
    const id = randomUUID();
    await db.query(`INSERT INTO contact_interactions(id,user_id,prospect_id,date,type,outcome,notes,source_provider,source_message_id,source_metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [id,input.userId,input.prospectId,input.date,input.type,input.outcome,input.notes,input.sourceProvider,input.sourceMessageId,JSON.stringify(input.sourceMetadata)]);
    if (!options?.skipXp) await db.query('INSERT INTO skill_activities(id,user_id,related_id,xp_gained) VALUES($1,$2,$3,10)',[randomUUID(),input.userId,id]);
    return { id };
  }};
  const activity = (id: string, extra: any = {}) => ({ externalActivityId: id, activityType:'email', status:'sent',
    email:'alex@example.test', contactName:'Alex Manager', company:'Verified company', subject:'Recorded catch up',
    activityAt:'2026-10-08T14:00:00.000Z', notes:'Verified sync context', ...extra });
  const sync = (id: string, extra: any = {}, userId = 'owner') => importSalesActivityBatch({pool,storage,userId,
    payload:SalesActivityBatchSchema.parse({source:'outlook_sync',activities:[activity(id,extra)]})});
  const row = async (id: string) => (await db.query<any>('SELECT * FROM contact_interactions WHERE source_message_id=$1',[id])).rows[0];
  let primaryId = ''; let alexId = '';
  try {
    await t.test('alternate saved email resolves an owned account and freezes that person without changing primary fields', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Alex Manager',email:'alex@example.test',company:'Manager employer',phone:'780-555-0110'}});
      primaryId=added.primaryContactId;alexId=added.contacts.find((contact)=>contact.name==='Alex Manager')!.id;
      const result=await sync('alternate-sent',{body:'Never retain this body',html:'Never retain this HTML'});
      assert.equal(result.errors,0);assert.equal(result.createdInteractions,1);assert.equal(result.results[0].prospectId,'account');
      const stored=await row('alternate-sent');assert.equal(stored.source_metadata.contactId,alexId);
      assert.equal(stored.source_metadata.contactSnapshot.name,'Alex Manager');assert.equal(stored.source_metadata.contactSnapshot.company,'Manager employer');
      assert.equal(stored.source_metadata.subject,'Recorded catch up');assert.equal(stored.source_metadata.direction,'outbound');assert.equal(stored.source_metadata.evidenceStatus,'confirmed');
      const account=(await db.query<any>("SELECT * FROM prospects WHERE id='account'")).rows[0];assert.equal(account.contact_name,'Joe Owner');assert.equal(account.contact_email,'joe@example.test');
      const imported=(await db.query<any>("SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id='alternate-sent'")).rows[0].raw_payload;
      assert.equal(imported.body,undefined);assert.equal(imported.html,undefined);assert.equal(await count('skill_activities'),1);assert.equal(await count('prospects'),3);
    });
    await t.test('workspace exposes structured confirmed subject/direction/evidence only within owned selected history', async () => {
      const selected=await workspace(alexId);assert.equal(selected.activity.length,1);
      assert.equal(selected.activity[0].subject,'Recorded catch up');assert.equal(selected.activity[0].email,'alex@example.test');
      assert.equal(selected.activity[0].direction,'outbound');assert.equal(selected.activity[0].evidenceStatus,'confirmed');
      assert.equal((await workspace(primaryId)).activity.length,0);assert.equal((await workspace()).unattributedActivityCount,1);
      await db.query(`INSERT INTO contact_interactions(id,user_id,prospect_id,date,type,source_metadata) VALUES
        ('foreign-evidence','foreign','account','2026-10-08','email',$1::jsonb),('unknown-evidence','owner','account','2026-10-07','email',$2::jsonb)`,
        [JSON.stringify({contactId:alexId,subject:'Foreign secret',direction:'inbound',evidenceStatus:'confirmed'}),JSON.stringify({direction:'sent',evidenceStatus:'guessed',subject:'Existing metadata'})]);
      assert.equal((await workspace(alexId)).activity.length,1);
      const unknown=(await workspace()).activity.find((item)=>item.id==='unknown-evidence')!;assert.equal(unknown.direction,null);assert.equal(unknown.evidenceStatus,null);
      await assert.rejects(getCallingWorkspace({pool,userId:'foreign',prospectId:'account'}));
    });
    await t.test('inbound confirmed email gets person history but no sent credit or fresh outbound follow-up', async () => {
      await db.query("UPDATE prospects SET follow_up_due_date=NULL WHERE id='account'");
      const before=await count('skill_activities');const result=await sync('alternate-received',{status:'received'});
      assert.equal(result.errors,0);assert.equal((await row('alternate-received')).source_metadata.contactId,alexId);
      assert.equal((await row('alternate-received')).source_metadata.direction,'inbound');assert.equal(await count('skill_activities'),before);
      assert.equal((await db.query<any>("SELECT follow_up_due_date FROM prospects WHERE id='account'")).rows[0].follow_up_due_date,null);
    });
    await t.test('retry preserves frozen attribution after a contact identity changes and never recreates or re-credits', async () => {
      const before=await count('skill_activities');const calls=storageCalls;const old=await row('alternate-sent');
      await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:alexId,input:{name:'Replacement Manager',email:'replacement@example.test'}});
      const retry=await sync('alternate-sent',{prospectId:'account',email:'replacement@example.test',contactName:'Replacement Manager'});
      assert.equal(retry.errors,0);assert.equal(retry.createdInteractions,0);assert.equal(storageCalls,calls);assert.equal(await count('skill_activities'),before);
      assert.deepEqual(await row('alternate-sent'),old);
      assert.equal(retry.results[0].contactAttribution?.contactId,alexId);
      assert.equal(retry.results[0].contactResolution?.contactSnapshot?.name,'Replacement Manager');
      const retained=(await db.query<any>("SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id='alternate-sent'")).rows[0].raw_payload;
      assert.equal(retained.contactAttribution.contactId,alexId);
      assert.equal((await workspace(alexId)).activity.length,2);
      const archived=await sync('archived-email');assert.equal(archived.needsReview,1);assert.equal(archived.results[0].prospectId,null);
    });
    await t.test('primary scalar replacement immediately excludes stale projected email and uses a new durable anchor', async () => {
      await db.query("UPDATE prospects SET contact_name='New Director',contact_email='new@example.test' WHERE id='account'");
      const stale=await sync('stale-primary',{email:'joe@example.test'});assert.equal(stale.needsReview,1);
      const current=await sync('current-primary',{email:'NEW@example.test',contactName:'New Director'});assert.equal(current.errors,0);
      const stored=await row('current-primary');assert.notEqual(stored.source_metadata.contactId,primaryId);assert.equal(stored.source_metadata.contactSnapshot.name,'New Director');
      const old=(await db.query<any>('SELECT archived_at FROM prospect_contacts WHERE id=$1',[primaryId])).rows[0];assert.ok(old.archived_at);
    });
    await t.test('shared email across accounts remains reviewable; one-account shared inbox remains unassigned', async () => {
      const common={name:'Shared Inbox One',email:'shared@example.test'};
      await createProspectContact({pool,userId:'owner',prospectId:'account',input:common});
      await createProspectContact({pool,userId:'owner',prospectId:'account',input:{...common,name:'Shared Inbox Two'}});
      const same=await sync('same-account-shared',{email:common.email,contactName:null});assert.equal(same.errors,0);
      const shared=await row('same-account-shared');assert.equal(shared.source_metadata.contactId,undefined);
      assert.equal(shared.source_metadata.contactAttribution.reason,'ambiguous_saved_contact_email');
      await createProspectContact({pool,userId:'owner',prospectId:'other-account',input:common});
      const multiple=await sync('cross-account-shared',{email:common.email});assert.equal(multiple.needsReview,1);
      assert.equal(multiple.results[0].matchReason,'ambiguous_contact_email');assert.equal(await row('cross-account-shared'),undefined);
    });
    await t.test('wrong actor/contact IDs and merged/archived relationships cannot assign a person by fallback', async () => {
      const foreign=await createProspectContact({pool,userId:'foreign',prospectId:'foreign-account',input:{name:'Foreign Alex',email:'replacement@example.test'}});
      const foreignId=foreign.contacts.find((contact)=>contact.name==='Foreign Alex')!.id;
      const denied=await sync('wrong-contact',{prospectId:'account',email:'replacement@example.test',contactId:foreignId});assert.equal(denied.errors,0);
      assert.equal((await row('wrong-contact')).source_metadata.contactId,undefined);assert.equal(denied.results[0].contactAttribution?.status,'conflict');assert.equal(denied.results[0].contactResolution?.status,'conflict');
      const actor=await sync('wrong-actor',{prospectId:'account'},'foreign');assert.equal(actor.errors,1);assert.equal(await row('wrong-actor'),undefined);
      await db.query("UPDATE prospects SET merged_into_prospect_id='account' WHERE id='other-account'");
      const merged=await sync('merged-target',{prospectId:'other-account'});assert.equal(merged.errors,1);assert.equal(await row('merged-target'),undefined);
      const justForeign=await sync('foreign-only-email',{email:'foreign@example.test'});assert.equal(justForeign.needsReview,1);
    });
    await t.test('an incremental exact canonical receipt fills missing attribution once while preserving evidence and credit', async () => {
      const original=activity('legacy-replayed',{email:'late@example.test',prospectId:'account',contactName:'Late Contact'});
      const first=await sync('legacy-replayed',original);assert.equal(first.errors,0);assert.equal((await row('legacy-replayed')).source_metadata.contactId,undefined);
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Late Contact',email:'late@example.test'}});
      const contact=added.contacts.find((item)=>item.name==='Late Contact')!;const stored=await row('legacy-replayed');const xp=await count('skill_activities');const calls=storageCalls;
      const retry=await sync('legacy-replayed',original);assert.equal(retry.createdInteractions,0);assert.equal(retry.errors,0);
      const filled=await row('legacy-replayed');assert.equal(filled.source_metadata.contactId,contact.id);
      assert.deepEqual({...filled,source_metadata:stored.source_metadata},stored);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);
      const second=await sync('legacy-replayed',original);assert.equal(second.errors,0);assert.deepEqual(await row('legacy-replayed'),filled);
      assert.equal((await db.query<any>("SELECT source_metadata FROM contact_interactions WHERE id='old-history'")).rows[0].source_metadata.contactId,undefined);
    });
    await t.test('duplicate receipt with changed email/company/date/type/direction or actor never fills missing attribution', async () => {
      const base=activity('strict-replay',{email:'unlisted@example.test',prospectId:'account',contactName:'Unlisted'});
      await sync('strict-replay',base);
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Unlisted',email:'unlisted@example.test'}});
      const saved=await row('strict-replay');const contact=added.contacts.find((item)=>item.name==='Unlisted')!;
      const dbActivity=normalizeSalesActivityInput(base,{source:'outlook_sync'});
      const attribution=await resolveSalesActivityContact({db:pool,userId:'owner',prospectId:'account',activity:dbActivity});assert.equal(attribution.contactId,contact.id);
      for(const extra of [{email:'new@example.test'},{company:'Different company'},{activityAt:'2026-10-09T14:00:00Z'},{activityType:'call'},{status:'received'},{subject:'Changed receipt subject'}]) {
        await fillSalesActivityContactAttribution({db:pool,userId:'owner',prospectId:'account',interactionId:saved.id,activity:normalizeSalesActivityInput({...base,...extra},{source:'outlook_sync'}),attribution});
        assert.deepEqual(await row('strict-replay'),saved);
      }
      await fillSalesActivityContactAttribution({db:pool,userId:'foreign',prospectId:'account',interactionId:saved.id,activity:dbActivity,attribution});assert.deepEqual(await row('strict-replay'),saved);
      const xp=await count('skill_activities');await sync('strict-replay',{...base,company:'Changed retry company'});assert.deepEqual(await row('strict-replay'),saved);assert.equal(await count('skill_activities'),xp);
    });
    await t.test('manual delayed link attributes the saved verified email without any second interaction or credit', async () => {
      const captured=await sync('manual-email',{email:'manual@example.test',contactName:'Manual Contact'});assert.equal(captured.needsReview,1);
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Manual Contact',email:'manual@example.test'}});
      const contact=added.contacts.find((item)=>item.name==='Manual Contact')!;const xp=await count('skill_activities');
      const input={pool,storage,userId:'owner',importId:captured.results[0].importId!,decision:{action:'link' as const,prospectId:'account'}};
      await reviewSalesActivityImport(input);const linked=await row('manual-email');assert.equal(linked.source_metadata.contactId,contact.id);assert.equal(linked.source_metadata.contactSnapshot.name,'Manual Contact');
      const calls=storageCalls;await reviewSalesActivityImport(input);assert.equal(storageCalls,calls);assert.deepEqual(await row('manual-email'),linked);assert.equal(await count('skill_activities'),xp);
    });
    await t.test('incremental retry never assigns an old named receipt to a replacement person with reused email', async () => {
      await sync('reused-email',{email:'reuse@example.test',prospectId:'account',contactName:'Original Person'});
      await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Replacement Person',email:'reuse@example.test'}});
      const saved=await row('reused-email');const xp=await count('skill_activities');
      const retry=await sync('reused-email',{email:'reuse@example.test',prospectId:'account',contactName:'Original Person'});
      assert.deepEqual(await row('reused-email'),saved);assert.equal(await count('skill_activities'),xp);
      assert.equal(retry.results[0].contactAttribution?.contactId,null);
      assert.equal(retry.results[0].contactResolution?.contactSnapshot?.name,'Replacement Person');
      const retained=(await db.query<any>("SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id='reused-email'")).rows[0].raw_payload;
      assert.equal(retained.contactAttribution.contactId,null);
    });
    await t.test('history caps original touch recency rather than late ingestion and safely ignores malformed dates', async () => {
      await db.query(`INSERT INTO contact_interactions(id,user_id,prospect_id,date,type,created_at,source_metadata)
        SELECT 'backfill-' || value,'owner','account','2020-01-01','email','2030-01-01','{}'
        FROM generate_series(1,105) AS value`);
      await db.query(`INSERT INTO contact_interactions(id,user_id,prospect_id,date,type,created_at,source_metadata)
        VALUES('latest-original','owner','account','2026-10-09T14:00:00.000Z','call','2000-01-01','{}'),
        ('malformed-date','owner','account','not a date','email','2031-01-01','{}')`);
      const history=await workspace();assert.equal(history.activity.length,100);assert.equal(history.activity[0].id,'latest-original');
      assert.equal(history.activity.some((item)=>item.id==='malformed-date'),false);
      assert.ok(history.activity.some((item)=>item.id==='old-history'));
    });
    await t.test('draft, research, and merely clicked email create neither person history nor activity credit', async () => {
      const calls=storageCalls;const xp=await count('skill_activities');
      for (const status of ['draft','research','skipped']) {
        const result=await sync(`no-confirmed-${status}`,{email:'manual@example.test',status});assert.equal(result.createdInteractions,0);assert.equal(await row(`no-confirmed-${status}`),undefined);
      }
      assert.equal(storageCalls,calls);assert.equal(await count('skill_activities'),xp);
    });
    const originalEmailAt = '2026-10-08T10:15:00.000Z';
    const proof = (id: string, verification: 'matched_sent_items' | 'matched_inbox' = 'matched_sent_items') => ({
      source:'outlook_desktop', verification, providerMessageId:id, observedAt:originalEmailAt,
    });
    const emailReceipt = (id: string, extra: any = {}) => activity(id, { email:'primary.observed@example.test',
      contactName:'Email Primary', company:'Verified company', prospectId:'account', activityAt:originalEmailAt,
      emailEvidence:proof(id), subject:'Original verified email receipt', ...extra });
    const syncEmail = (input: any) => sync(input.externalActivityId, input);
    const contactRow = async (id: string) => (await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[id])).rows[0];
    const snapshot = (contact: any) => ({ name:contact.name, email:contact.email, phone:contact.phone, company:contact.company });
    let primaryReceipt:any; let primaryBefore:any; let primaryFilledId='';
    let secondaryReceipt:any; let secondaryBefore:any; let secondaryFilledId='';

    await t.test('verified receipt fills an existing blank primary email and attributes only its returned identity at the original date', async () => {
      await db.query("UPDATE prospects SET contact_name='Email Primary',contact_company='Verified company',contact_email=NULL WHERE id='account'");
      const initial=await workspace();primaryBefore=initial.contacts.find((contact)=>contact.id===initial.primaryContactId)!;
      primaryReceipt=emailReceipt('provider-primary-blank', {contactId:primaryBefore.id,expectedEmailContact:snapshot(primaryBefore),body:'Private body must stay outside CRM',html:'Private HTML must stay outside CRM',attachments:['Private.pdf']});
      const prospects=await count('prospects');const interactions=await count('contact_interactions');const xp=await count('skill_activities');
      const imported=await syncEmail(primaryReceipt);assert.equal(imported.errors,0);assert.equal(imported.createdInteractions,1);
      assert.equal(imported.results[0].emailEnrichment?.status,'applied');
      primaryFilledId=imported.results[0].emailEnrichment!.contactId!;assert.notEqual(primaryFilledId,primaryBefore.id);
      assert.equal(imported.results[0].emailEnrichment?.previousContactId,primaryBefore.id);
      const filled=await contactRow(primaryFilledId);assert.equal(filled.email,'primary.observed@example.test');assert.equal(filled.name,primaryBefore.name);assert.equal(filled.phone,primaryBefore.phone);
      assert.ok((await contactRow(primaryBefore.id)).archived_at);
      const scalar=(await db.query<any>("SELECT contact_email FROM prospects WHERE id='account'")).rows[0];assert.equal(scalar.contact_email,filled.email);
      const interaction=await row(primaryReceipt.externalActivityId);assert.equal(interaction.date,originalEmailAt);assert.equal(interaction.source_metadata.contactId,primaryFilledId);
      assert.equal(interaction.source_metadata.contactSnapshot.email,filled.email);assert.equal(interaction.source_metadata.contactSnapshot.name,'Email Primary');
      assert.equal(interaction.source_metadata.direction,'outbound');assert.equal(interaction.source_metadata.evidenceStatus,'confirmed');
      const retained=(await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id=$1',[primaryReceipt.externalActivityId])).rows[0].raw_payload;
      assert.equal(retained.body,undefined);assert.equal(retained.html,undefined);assert.equal(retained.attachments,undefined);
      assert.deepEqual(retained.emailEvidence,proof(primaryReceipt.externalActivityId));
      assert.equal(await count('prospects'),prospects);assert.equal(await count('contact_interactions'),interactions+1);assert.equal(await count('skill_activities'),xp+1);
      assert.equal((await db.query<any>("SELECT source_metadata FROM contact_interactions WHERE id='old-history'")).rows[0].source_metadata.contactId,undefined);
    });
    await t.test('verified receipt replay retains the new primary identity without another interaction or XP', async () => {
      const stored=await row(primaryReceipt.externalActivityId);const contacts=await count('prospect_contacts');const interactions=await count('contact_interactions');const xp=await count('skill_activities');const calls=storageCalls;
      for(let attempt=0;attempt<2;attempt++) {
        const replay=await syncEmail(primaryReceipt);assert.equal(replay.errors,0);assert.equal(replay.createdInteractions,0);
        assert.equal(replay.results[0].emailEnrichment?.status,'unchanged');assert.equal(replay.results[0].emailEnrichment?.contactId,primaryFilledId);
        assert.deepEqual(await row(primaryReceipt.externalActivityId),stored);
      }
      assert.equal((await workspace()).primaryContactId,primaryFilledId);assert.equal(await count('prospect_contacts'),contacts);
      assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);
    });
    await t.test('verified inbox receipt fills a blank secondary only and replay earns no sent credit', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Email Secondary',company:'Secondary employer',phone:'780-555-0180',title:'Operations',additionalPhones:[{label:'Mobile',number:'780-555-0181'}]}});
      secondaryBefore=added.contacts.find((contact)=>contact.name==='Email Secondary')!;
      secondaryReceipt=emailReceipt('provider-secondary-inbox',{status:'received',email:'secondary.observed@example.test',contactName:secondaryBefore.name,company:secondaryBefore.company,contactId:secondaryBefore.id,expectedEmailContact:snapshot(secondaryBefore),emailEvidence:proof('provider-secondary-inbox','matched_inbox')});
      const primary=await contactRow(primaryFilledId);const xp=await count('skill_activities');const prospects=await count('prospects');
      const imported=await syncEmail(secondaryReceipt);assert.equal(imported.errors,0);assert.equal(imported.createdInteractions,1);assert.equal(imported.results[0].emailEnrichment?.status,'applied');
      secondaryFilledId=imported.results[0].emailEnrichment!.contactId!;assert.notEqual(secondaryFilledId,secondaryBefore.id);
      const filled=await contactRow(secondaryFilledId);assert.equal(filled.email,secondaryReceipt.email);assert.equal(filled.title,secondaryBefore.title);assert.deepEqual(filled.additional_phones,secondaryBefore.additionalPhones);
      const interaction=await row(secondaryReceipt.externalActivityId);assert.equal(interaction.date,originalEmailAt);assert.equal(interaction.source_metadata.contactId,secondaryFilledId);assert.equal(interaction.source_metadata.direction,'inbound');
      assert.deepEqual(await contactRow(primaryFilledId),primary);assert.equal(await count('prospects'),prospects);assert.equal(await count('skill_activities'),xp);
      const contacts=await count('prospect_contacts');const interactions=await count('contact_interactions');const calls=storageCalls;
      const replay=await syncEmail(secondaryReceipt);assert.equal(replay.createdInteractions,0);assert.equal(replay.results[0].emailEnrichment?.status,'unchanged');
      assert.equal(replay.results[0].emailEnrichment?.contactId,secondaryFilledId);assert.deepEqual(await row(secondaryReceipt.externalActivityId),interaction);
      assert.equal(await count('prospect_contacts'),contacts);assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);
    });
    await t.test('a later verified different address stays reviewable while the original saved email and identities remain intact', async () => {
      const contact=await contactRow(secondaryFilledId);const contacts=await count('prospect_contacts');const interactions=await count('contact_interactions');const xp=await count('skill_activities');
      const input=emailReceipt('provider-secondary-different',{status:'received',email:'different.secondary@example.test',contactName:contact.name,company:contact.company,contactId:contact.id,expectedEmailContact:snapshot(contact),emailEvidence:proof('provider-secondary-different','matched_inbox')});
      const imported=await syncEmail(input);assert.equal(imported.errors,0);assert.equal(imported.results[0].emailEnrichment?.status,'needs_review');
      assert.equal(imported.results[0].emailEnrichment?.reason,'existing_email_conflict');assert.deepEqual(await contactRow(secondaryFilledId),contact);
      assert.equal(await count('prospect_contacts'),contacts);assert.equal(await count('contact_interactions'),interactions+1);assert.equal((await row(input.externalActivityId)).date,originalEmailAt);assert.equal(await count('skill_activities'),xp);
    });
    await t.test('duplicate receipt mutations and repeated altered-person retries cannot fill another saved contact', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Receipt Hijack Target',company:'Verified company',phone:'780-555-0182'}});
      const target=added.contacts.find((contact)=>contact.name==='Receipt Hijack Target')!;const untouched=await contactRow(target.id);
      const frozen=await row(primaryReceipt.externalActivityId);const contacts=await count('prospect_contacts');const interactions=await count('contact_interactions');const xp=await count('skill_activities');const calls=storageCalls;
      const hijack={contactName:target.name,contactId:target.id,email:'hijack.target@example.test',expectedEmailContact:snapshot(target)};
      for(const extra of [hijack,hijack,{company:'Altered company'},{prospectId:'other-account'},
        {emailEvidence:proof('altered-provider-message')},{emailEvidence:proof(primaryReceipt.externalActivityId,'matched_inbox')}]) {
        const imported=await syncEmail({...primaryReceipt,...extra});
        if(!imported.errors) assert.equal(imported.results[0].emailEnrichment?.status,'needs_review');
        assert.deepEqual(await contactRow(target.id),untouched);assert.deepEqual(await row(primaryReceipt.externalActivityId),frozen);
        assert.equal(await count('prospect_contacts'),contacts);assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);
      }
      assert.equal((await contactRow(primaryFilledId)).email,'primary.observed@example.test');
    });
    await t.test('invalid, draft and missing-verification evidence never fill a saved blank contact', async () => {
      const variations=[{email:'invalid@example.test?bcc=other@example.test'},
        {emailEvidence:{source:'outlook_desktop',providerMessageId:'missing-verification',observedAt:originalEmailAt}},
        {status:'draft'}, {emailEvidence:undefined}];
      for(const [index,extra] of variations.entries()) {
        const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Unsafe Email Contact '+index,company:'Verified company',phone:'780-555-0183'}});
        const target=added.contacts.find((contact)=>contact.name==='Unsafe Email Contact '+index)!;const saved=await contactRow(target.id);const contacts=await count('prospect_contacts');
        const id='provider-unsafe-email-'+index;const input=emailReceipt(id,{email:'unsafe.'+index+'@example.test',contactName:target.name,contactId:target.id,expectedEmailContact:snapshot(target),...extra});
        const imported=await syncEmail(input);assert.equal(imported.errors,0);assert.deepEqual(await contactRow(target.id),saved);assert.equal(await count('prospect_contacts'),contacts);
        assert.notEqual(imported.results[0].emailEnrichment?.status,'applied');
        if(extra.status==='draft') {assert.equal(imported.createdInteractions,0);assert.equal(await row(id),undefined);}
      }
    });
    await t.test('an old unmatched exact receipt can fill a fresh explicit blank target with its snapshot and original source date', async () => {
      const input=emailReceipt('provider-old-unmatched',{email:'late.verified@example.test',contactName:'Late Email Contact',company:'Unrecorded employer',prospectId:null,contactId:null});
      const prospects=await count('prospects');const interactions=await count('contact_interactions');const xp=await count('skill_activities');
      const first=await syncEmail(input);assert.equal(first.errors,0);assert.equal(first.needsReview,1);assert.equal(first.createdInteractions,0);assert.equal(await row(input.externalActivityId),undefined);
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:input.contactName,company:input.company,phone:'780-555-0184'}});
      const target=added.contacts.find((contact)=>contact.name===input.contactName)!;
      const resolved=await syncEmail({...input,prospectId:'account',contactId:target.id,expectedEmailContact:snapshot(target)});
      assert.equal(resolved.errors,0);assert.equal(resolved.results[0].emailEnrichment?.status,'applied');assert.equal(resolved.createdInteractions,1);
      const filledId=resolved.results[0].emailEnrichment!.contactId!;assert.notEqual(filledId,target.id);assert.equal((await contactRow(filledId)).email,input.email);
      const interaction=await row(input.externalActivityId);assert.equal(interaction.date,originalEmailAt);assert.equal(interaction.source_message_id,input.externalActivityId);assert.equal(interaction.source_metadata.contactId,filledId);
      assert.equal(await count('prospects'),prospects);assert.equal(await count('contact_interactions'),interactions+1);assert.equal(await count('skill_activities'),xp+1);
      const contacts=await count('prospect_contacts');const replay=await syncEmail({...input,prospectId:'account',contactId:target.id,expectedEmailContact:snapshot(target)});
      assert.equal(replay.createdInteractions,0);assert.equal(replay.results[0].emailEnrichment?.status,'unchanged');assert.deepEqual(await row(input.externalActivityId),interaction);
      assert.equal(await count('prospect_contacts'),contacts);assert.equal(await count('contact_interactions'),interactions+1);assert.equal(await count('skill_activities'),xp+1);
    });
    await t.test('manual review replays retained canonical provider proof after a pending call clears without recreating the interaction', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Pending Review Contact',company:'Verified company',phone:'780-555-0185'}});
      const target=added.contacts.find((contact)=>contact.name==='Pending Review Contact')!;
      const pending={clientEventId:'email-review-pending-call',prospectId:'account',contactId:target.id,expectedPhone:target.phone!};
      await recordMobileCallStart({pool,userId:'owner',input:pending});
      const providerId='provider-pending-email-review';const canonicalId='canonical-pending-email-review';
      const input=emailReceipt(providerId,{email:'pending.review@example.test',contactName:target.name,company:target.company,contactId:target.id,expectedEmailContact:snapshot(target)});
      const imported=await importSalesActivityBatch({pool,storage,userId:'owner',payload:SalesActivityBatchSchema.parse({source:'outlook_sync',activities:[input]}),
        findDuplicateSalesActivityImport:async()=>({source:'outlook_sync',externalActivityId:canonicalId,interactionId:null,prospectId:'account',matchStatus:'needs_review'})});
      assert.equal(imported.errors,0);assert.equal(imported.createdInteractions,1);assert.equal(imported.results[0].emailEnrichment?.reason,'pending_call');
      assert.equal((await contactRow(target.id)).email,null);
      const retained=(await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id=$1',[canonicalId])).rows[0].raw_payload;
      assert.equal(retained.reconciledIdentity.externalActivityId,providerId);assert.equal(retained.emailEvidence.providerMessageId,providerId);
      const stored=await row(canonicalId);assert.equal(stored.date,originalEmailAt);assert.equal(stored.source_metadata.contactId,undefined);
      await discardMobileCallStart({pool,userId:'owner',input:{clientEventId:pending.clientEventId,prospectId:pending.prospectId,contactId:target.id}});
      const contacts=await count('prospect_contacts');const interactions=await count('contact_interactions');const xp=await count('skill_activities');const calls=storageCalls;
      const review={pool,storage,userId:'owner',importId:imported.results[0].importId!,decision:{action:'link' as const,prospectId:'account'}};
      const linked:any=await reviewSalesActivityImport(review);assert.equal(linked.emailEnrichment?.status,'applied');
      const filledId=linked.emailEnrichment.contactId;assert.notEqual(filledId,target.id);assert.equal((await contactRow(filledId)).email,input.email);
      const attributed=await row(canonicalId);assert.equal(attributed.source_metadata.contactId,filledId);assert.equal(attributed.date,originalEmailAt);assert.equal(attributed.id,stored.id);
      assert.deepEqual({...attributed,source_metadata:stored.source_metadata},stored);
      assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);assert.equal(await count('prospect_contacts'),contacts+1);
      const replay:any=await reviewSalesActivityImport(review);assert.equal(replay.emailEnrichment?.status,'unchanged');assert.equal(replay.emailEnrichment.contactId,filledId);
      assert.deepEqual(await row(canonicalId),attributed);assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);assert.equal(await count('prospect_contacts'),contacts+1);
    });
    await t.test('exact retained desktop receipt keeps its precise timestamp instead of reconciling to an older rounded connector receipt', async () => {
      const added=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Precise Receipt Contact',company:'Verified company',phone:'780-555-0186'}});
      const target=added.contacts.find((contact)=>contact.name==='Precise Receipt Contact')!;
      const connectorId='connector-rounded-email-receipt';const desktopId='desktop-exact-email-receipt';
      const roundedAt='2026-10-08T10:15:00.000Z';const preciseAt='2026-10-08T10:15:00.827Z';
      const base={email:'precise.receipt@example.test',contactName:target.name,company:target.company,contactId:target.id,emailEvidence:undefined};
      const connector=emailReceipt(connectorId,{...base,activityAt:roundedAt});
      const desktop=emailReceipt(desktopId,{...base,activityAt:preciseAt});
      const payload=(input:any)=>SalesActivityBatchSchema.parse({source:'outlook_sync',createInteractions:false,activities:[input]});
      for(const input of [connector,desktop]) {
        const seeded=await importSalesActivityBatch({pool,storage,userId:'owner',payload:payload(input)});
        assert.equal(seeded.errors,0);assert.equal(seeded.createdInteractions,0);
      }
      const receipt=async(id:string)=>(await db.query<any>('SELECT * FROM sales_activity_imports WHERE user_id=$1 AND source=$2 AND external_activity_id=$3',['owner','outlook_sync',id])).rows[0];
      const connectorBefore=await receipt(connectorId);const desktopBefore=await receipt(desktopId);
      assert.equal(new Date(connectorBefore.activity_at).toISOString(),roundedAt);assert.equal(new Date(desktopBefore.activity_at).toISOString(),preciseAt);
      const retainedIds=(await db.query('SELECT id,source,external_activity_id FROM sales_activity_imports ORDER BY id')).rows;
      const contacts=await count('prospect_contacts');const prospects=await count('prospects');const interactions=await count('contact_interactions');const xp=await count('skill_activities');const calls=storageCalls;
      let finderCalls=0;
      const replay=(input:any)=>importSalesActivityBatch({pool,storage,userId:'owner',payload:payload(input),findDuplicateSalesActivityImport:async()=>{
        finderCalls++;return {source:'outlook_sync',externalActivityId:connectorId,interactionId:null,prospectId:'account',matchStatus:'matched'};
      }});
      const verified={...desktop,emailEvidence:{...proof(desktopId),observedAt:preciseAt},expectedEmailContact:snapshot(target)};
      const filled=await replay(verified);assert.equal(filled.errors,0);assert.equal(filled.createdInteractions,0);assert.equal(filled.results[0].emailEnrichment?.status,'applied',JSON.stringify(filled.results[0].emailEnrichment));
      assert.equal(filled.results[0].importId,desktopBefore.id);assert.equal(finderCalls,0);
      const filledId=filled.results[0].emailEnrichment!.contactId!;assert.notEqual(filledId,target.id);assert.equal((await contactRow(filledId)).email,desktop.email);
      const repeated=await replay(verified);assert.equal(repeated.errors,0);assert.equal(repeated.createdInteractions,0);assert.equal(repeated.results[0].emailEnrichment?.status,'unchanged');assert.equal(repeated.results[0].emailEnrichment?.contactId,filledId);
      const alteredAt='2026-10-08T10:15:00.900Z';
      const altered=await replay({...verified,activityAt:alteredAt,emailEvidence:{...verified.emailEvidence,observedAt:alteredAt}});
      assert.equal(altered.errors,0);assert.equal(altered.results[0].emailEnrichment?.status,'needs_review');assert.equal(finderCalls,0);
      assert.deepEqual(await receipt(connectorId),connectorBefore);
      const exact=await receipt(desktopId);assert.equal(exact.id,desktopBefore.id);assert.equal(new Date(exact.activity_at).toISOString(),preciseAt);
      assert.deepEqual((await db.query('SELECT id,source,external_activity_id FROM sales_activity_imports ORDER BY id')).rows,retainedIds);
      assert.equal((await contactRow(filledId)).email,desktop.email);assert.equal(await count('prospect_contacts'),contacts+1);
      assert.equal(await count('prospects'),prospects);assert.equal(await count('contact_interactions'),interactions);assert.equal(await count('skill_activities'),xp);assert.equal(storageCalls,calls);
      assert.equal(await row(connectorId),undefined);assert.equal(await row(desktopId),undefined);
    });
  } finally { await db.close(); }
});