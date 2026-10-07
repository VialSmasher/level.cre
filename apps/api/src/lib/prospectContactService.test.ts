import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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
    await t.test('unknown primary people use a conservative phone identity and companies with only additional phones are callable', async () => {
      const blank=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'});
      await db.query("UPDATE prospects SET contact_phone='780-555-0131' WHERE id='other-account'");
      const numbered=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'}); assert.notEqual(numbered.primaryContactId,blank.primaryContactId);
      await db.query("UPDATE prospects SET contact_phone='(780) 555-0131' WHERE id='other-account'");
      assert.equal((await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'})).primaryContactId,numbered.primaryContactId);
      await db.query("UPDATE prospects SET contact_phone=NULL WHERE id='other-account'");
      const empty=await getCallingWorkspace({pool,userId:'owner',prospectId:'other-account'});
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:20})).rows.some((item)=>item.prospect.id==='other-account'),false);
      await updateProspectContact({pool,userId:'owner',prospectId:'other-account',contactId:empty.primaryContactId,input:{additionalPhones:[{label:'Saved office',number:'780-555-0133'}]}});
      assert.ok((await listMobileCallQueue({pool,userId:'owner',limit:20})).rows.some((item)=>item.prospect.id==='other-account'));
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
