import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { contactIdentityKey, derivePhoneReadiness, parseBusinessPhone, researchCompanyName } from './phoneReadiness';
import { listProspectsNeedingPhone, recordPhoneResearchStatus, PhoneResearchStatusSchema } from './phoneReadinessService';
import { getCallingWorkspace, createProspectContact, updateProspectContact } from './prospectContactService';
import { recordMobileCallStart, recordMobileCallOutcome, listMobileCallQueue, getMobileCallingProgress } from './mobileCallingService';
import { enrichProspectPhoneBatch, PhoneEnrichmentBatchSchema, getPhoneEnrichmentContext } from './phoneEnrichmentService';
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
  const pool: any = { query: (sql: string, values?: any[]) => db.query(sql, values), connect: async () => ({ query: (sql: string, values?: any[]) => db.query(sql, values), release() {} }) };
  const workspace = (id = 'account') => getCallingWorkspace({ pool, userId: 'owner', prospectId: id });
  const counts = async () => (await db.query<any>(`SELECT (SELECT COUNT(*) FROM contact_interactions)::int AS interactions,(SELECT COUNT(*) FROM activity_events)::int AS events,(SELECT COALESCE(SUM(xp_gained),0) FROM skill_activities)::int AS xp,(SELECT COUNT(*) FROM prospects)::int AS assets`)).rows[0];
  return { db, pool, workspace, counts };
}
const evidence = { kind: 'contact_direct', source: 'company_website', url: 'https://company.example.test/team', observedAt: '2026-10-08T12:00:00Z', verified: true } as const;
test('canonical phone readiness rejects ambiguous text, retains extension identity and projects current primary only', () => {
  assert.equal(parseBusinessPhone('Main: 780-555-0100 / 780-555-0101'), null);
  assert.equal(parseBusinessPhone('780-555-0100;ext=12')!.phoneKey, '7805550100:12');
  assert.equal(parseBusinessPhone('+1 (780) 555-0100 x12')!.phoneKey, '7805550100:12');
  assert.equal(parseBusinessPhone('780-555-0100 ext 13')!.phoneKey, '7805550100:13');
  const prospect = { contact_name: 'Current Person', contact_email: 'current@example.test', contact_phone: null };
  const stale = { id: 'old', is_primary: true, name: 'Old Person', email: 'old@example.test', phone: '780-555-0100', additional_phones: [{ label: 'Mobile', number: '780-555-0101' }], identity_key: contactIdentityKey({name:'Old Person',email:'old@example.test'}) };
  assert.equal(derivePhoneReadiness(prospect, [stale]).status, 'needs_number');
  assert.equal(derivePhoneReadiness(prospect, [{ id: 'additional', name: 'Other', phone: '780-555-0123' }]).preferredContactId, 'additional');
  assert.equal(researchCompanyName({name:'1234 Industrial Road',address:'1234 Industrial Road'}),null);
  assert.equal(researchCompanyName({name:'Warehouse'}),null);
  assert.equal(PhoneResearchStatusSchema.safeParse({prospectId:'p',expectedSnapshotToken:'a'.repeat(64),status:'not_found',userId:'foreign'}).success,false);
  assert.equal(PhoneResearchStatusSchema.safeParse({prospectId:'p',expectedSnapshotToken:'a'.repeat(64),status:'not_found',retryAfterDays:91}).success,false);
});
test('phone readiness and refill use owned actual PostgreSQL rows without synthetic activity', async (t) => {
  const { db, pool, workspace, counts } = await harness(); const now = new Date('2026-10-08T18:00:00Z');
  const needs = (eligibleOnly = false) => listProspectsNeedingPhone({ pool, userId:'owner', now, eligibleOnly, limit:100 });
  let primaryId = ''; let alternateId = '';
  try {
    await t.test('read-only needs queue excludes foreign, inactive, merged and address-only assets and ranks due companies', async () => {
      await db.exec(`INSERT INTO prospects(id,user_id,name,status,business_name,follow_up_due_date,merged_into_prospect_id) VALUES
        ('address','owner','1234 Industrial Road','prospect',NULL,NULL,NULL),('inactive','owner','Inactive company','no_go','Inactive company',NULL,NULL),
        ('merged','owner','Merged company','prospect','Merged company',NULL,'account'),('due-company','owner','Due company','prospect','Due company','2026-10-01T18:00:00Z',NULL);`);
      const before = await counts();
      const result = await needs(); assert.deepEqual(result.rows.map(row=>row.prospect.id), ['due-company','other-account']);
      assert.equal(result.total,2); assert.equal(result.eligibleNow,2); assert.ok(result.rows[0].priorityScore>result.rows[1].priorityScore);
      assert.equal((result.rows[0] as any).notes,undefined); assert.equal((result.rows[0] as any).aiMetadata,undefined);
      assert.deepEqual(await counts(),before);
      assert.equal((await db.query<any>('SELECT COUNT(*)::int AS n FROM prospect_contacts')).rows[0].n,0);
      const foreign=await listProspectsNeedingPhone({pool,userId:'foreign',now});assert.deepEqual(foreign.rows,[]);
    });
    await t.test('active roster and primary additional phones establish readiness without changing primary attribution', async () => {
      const w=await workspace(); primaryId=w.primaryContactId;
      const extra=await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Alex Manager',phone:'780-555-0110',additionalPhones:[{label:'Direct',number:'780-555-0111 ext 12'}]}});
      alternateId=extra.contacts.find(row=>row.name==='Alex Manager')!.id;
      assert.equal(extra.phoneReadiness.usableChoices.length,3);
      await db.query("UPDATE prospects SET contact_phone='Main: 780-555-0100 or 780-555-0101' WHERE id='account'");
      const rosterReady=await workspace();assert.equal(rosterReady.phoneReadiness.status,'ready');assert.equal(rosterReady.phoneReadiness.preferredContactId,alternateId);
      const queue=await listMobileCallQueue({pool,userId:'owner',limit:50,includeCalledToday:true});assert.equal(queue.rows.find(row=>row.prospect.id==='account')!.phoneReadiness!.preferredContactId,alternateId);
      assert.equal((await needs()).rows.some(row=>row.prospect.id==='account'),false);
      await db.query("UPDATE prospects SET contact_phone='780-555-0100' WHERE id='account'");
      assert.equal((await workspace()).primaryContactId,primaryId);
    });
    await t.test('wrong number creates one attempted call and blocks only its frozen person/phone', async () => {
      const input={clientEventId:'bad-number-call-primary',prospectId:'account',contactId:primaryId,expectedPhone:'780-555-0100'};
      const before=await counts();await recordMobileCallStart({pool,userId:'owner',input});
      const result=await recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'wrong_number',notes:'Reached a different company.'}});
      assert.equal(result.newXpGained,15);assert.equal((await recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'wrong_number',notes:''}})).duplicate,true);
      const after=await counts();assert.equal(after.xp-before.xp,15);assert.equal(after.interactions-before.interactions,1);assert.equal(after.assets,before.assets);
      const w=await workspace();assert.equal(w.phoneReadiness.blockedChoices.length,1);assert.equal(w.phoneReadiness.blockedChoices[0].contactId,primaryId);assert.equal(w.phoneReadiness.usableChoices.length,2);assert.equal(w.phoneReadiness.preferredContactId,alternateId);
      assert.equal((await needs()).rows.some(row=>row.prospect.id==='account'),false);
      const stored=(await db.query<any>('SELECT * FROM activity_events WHERE id=$1',[result.eventId])).rows[0];assert.equal(stored.event_type,'call_attempted');assert.equal(stored.source_metadata.contactId,primaryId);
      const target=(await db.query<any>("SELECT * FROM prospects WHERE id='account'")).rows[0];assert.equal(target.last_contact_date,'2026-09-01');assert.equal(target.status,'prospect');assert.deepEqual(target.ai_metadata.propertyLink,{propertyProspectId:'building',relationship:'occupant'});
      assert.equal((await getMobileCallingProgress({pool,userId:'owner'})).progress.connectedToday,0);
      await assert.rejects(recordMobileCallStart({pool,userId:'owner',input:{...input,clientEventId:'blocked-new-call-start'}}),(error:any)=>error.code==='phone_blocked');
    });
    await t.test('agent replacement research includes current bad choices on ready companies, while UI excludes them and cooldown applies', async () => {
      assert.equal((await needs()).rows.some(row=>row.prospect.id==='account'),false);
      const agent=await listProspectsNeedingPhone({pool,userId:'owner',includeReportedBad:true,eligibleOnly:true,now});
      const row=agent.rows.find(row=>row.prospect.id==='account')!;assert.ok(row);assert.equal(row.researchReason,'reported_bad_number');assert.equal(row.phoneReadiness.status,'ready');assert.equal(row.phoneReadiness.usableChoices.length,2);
      const before=await counts();const input=PhoneResearchStatusSchema.parse({prospectId:'account',expectedSnapshotToken:row.expectedSnapshotToken,status:'conflicting',retryAfterDays:10});
      await recordPhoneResearchStatus({pool,userId:'owner',input,now});
      assert.equal((await listProspectsNeedingPhone({pool,userId:'owner',includeReportedBad:true,eligibleOnly:true,now})).rows.some(row=>row.prospect.id==='account'),false);
      const visible=await listProspectsNeedingPhone({pool,userId:'owner',includeReportedBad:true,now});assert.equal(visible.rows.find(row=>row.prospect.id==='account')!.phoneReadiness.lastResearch!.status,'conflicting');
      assert.deepEqual(await counts(),before);
    });
    await t.test('disconnected choice keeps other extensions usable; frozen starts remain confirmable after findings', async () => {
      const input={clientEventId:'disconnected-extra-call',prospectId:'account',contactId:alternateId,expectedPhone:'780-555-0110'};
      await recordMobileCallStart({pool,userId:'owner',input});
      await recordMobileCallStart({pool,userId:'owner',input:{...input,clientEventId:'parallel-frozen-call'}});
      await recordMobileCallOutcome({pool,userId:'owner',input:{...input,outcome:'disconnected',notes:''}});
      await recordMobileCallOutcome({pool,userId:'owner',input:{...input,clientEventId:'parallel-frozen-call',outcome:'attempted',notes:''}});
      const w=await workspace();assert.equal(w.phoneReadiness.usableChoices.length,1);assert.equal(w.phoneReadiness.usableChoices[0].phoneKey,'7805550111:12');
      const last={clientEventId:'disconnected-last-call',prospectId:'account',contactId:alternateId,expectedPhone:'780-555-0111 ext 12'};
      await recordMobileCallOutcome({pool,userId:'owner',input:{...last,outcome:'disconnected',notes:''}});
      const list=await needs();assert.equal(list.rows.find(row=>row.prospect.id==='account')!.phoneReadiness.reason,'reported_bad_number');
      assert.equal((await listMobileCallQueue({pool,userId:'owner',limit:50,includeCalledToday:true})).rows.some(row=>row.prospect.id==='account'),false);
      assert.equal((await workspace()).activity.filter(row=>row.type==='call').length,4);
    });
    await t.test('research statuses require a current snapshot, apply bounded cooldown and retry without extending it', async () => {
      const row=(await needs()).rows.find(row=>row.prospect.id==='account')!;const before=await counts();
      const input=PhoneResearchStatusSchema.parse({prospectId:'account',expectedSnapshotToken:row.expectedSnapshotToken,status:'not_found',retryAfterDays:7,notes:'Official sources checked; no reliable number.'});
      const saved=await recordPhoneResearchStatus({pool,userId:'owner',input,now});assert.equal(saved.status,'saved');
      const retry=await recordPhoneResearchStatus({pool,userId:'owner',input,now:new Date(now.getTime()+60000)});assert.equal(retry.status,'unchanged');assert.deepEqual(retry.lastResearch,saved.lastResearch);
      assert.equal((await needs()).rows.find(row=>row.prospect.id==='account')!.phoneReadiness.researchEligible,false);assert.equal((await needs(true)).rows.some(row=>row.prospect.id==='account'),false);
      assert.equal((await listProspectsNeedingPhone({pool,userId:'owner',now:new Date('2026-10-16T18:00:00Z'),eligibleOnly:true})).rows.some(row=>row.prospect.id==='account'),true);
      await createProspectContact({pool,userId:'owner',prospectId:'account',input:{name:'Newly identified person'}});
      assert.equal((await needs()).rows.find(row=>row.prospect.id==='account')!.phoneReadiness.researchEligible,true);
      await assert.rejects(recordPhoneResearchStatus({pool,userId:'owner',input,now}),(error:any)=>error.code==='stale_phone_snapshot');
      await db.query("UPDATE prospects SET contact_email='newidentity@example.test' WHERE id='account'");
      await assert.rejects(recordPhoneResearchStatus({pool,userId:'owner',input,now}),(error:any)=>error.code==='stale_phone_snapshot');
      assert.equal((await getPhoneEnrichmentContext({pool,userId:'owner'})).rows.find(row=>row.prospectId==='account')!.phoneReadiness.lastResearch,null);
      await db.query("UPDATE prospects SET contact_email='joe@example.test' WHERE id='account'");
      await assert.rejects(recordPhoneResearchStatus({pool,userId:'foreign',input,now}),(error:any)=>error.status===404);
      assert.deepEqual(await counts(),before);
    });
    await t.test('company main line bad-number replacement keeps switchboard identity and retired bad findings', async () => {
      await db.exec(`INSERT INTO prospects(id,user_id,name,status,business_name,contact_name,contact_email,ai_metadata) VALUES('main-only','owner','Main only company','prospect','Main only company','Company Buyer','buyer@example.test','{}')`);
      const entry={prospectId:'main-only',company:'Main only company',contactPhone:'780-555-0150',phoneEvidence:{...evidence,kind:'company_main' as const},expectedContact:{name:'Company Buyer',email:'buyer@example.test',phone:null}};
      const enrich=(row:any)=>enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[row]})});
      const added=await enrich(entry);const id=added.results[0].contactId!;
      const call={clientEventId:'main-switchboard-bad-call',prospectId:'main-only',contactId:id,expectedPhone:'780-555-0150',outcome:'wrong_number' as const,notes:''};
      await recordMobileCallOutcome({pool,userId:'owner',input:call});const before=await counts();
      assert.equal((await needs()).rows.some(row=>row.prospect.id==='main-only'),true);
      assert.equal((await enrich(entry)).results[0].reason,'reported_bad_phone');
      const replaced=await enrich({...entry,contactPhone:'780-555-0151'});assert.equal(replaced.results[0].reason,'replaced_bad_main_line');assert.equal(replaced.results[0].contactId,id);
      assert.equal((await enrich({...entry,contactPhone:'780-555-0151'})).unchanged,1);
      const w=await workspace('main-only');assert.equal(w.contacts.find(row=>row.id===id)!.title,'Company switchboard');assert.equal(w.contacts.find(row=>row.isPrimary)!.phone,null);assert.equal(w.contacts.find(row=>row.isPrimary)!.name,'Company Buyer');assert.equal(w.phoneReadiness.status,'ready');
      assert.equal((await listProspectsNeedingPhone({pool,userId:'owner',includeReportedBad:true,now})).rows.some(row=>row.prospect.id==='main-only'),false);
      await updateProspectContact({pool,userId:'owner',prospectId:'main-only',contactId:id,input:{archived:true}});
      assert.equal((await enrich(entry)).results[0].reason,'reported_bad_phone');assert.equal((await workspace('main-only')).phoneReadiness.status,'needs_number');
      assert.deepEqual(await counts(),before);
    });
    await t.test('additional-person bad replacement retains UUID while mismatched and stale evidence cannot overwrite', async () => {
      const entry={prospectId:'account',contactId:alternateId,contactName:'Alex Manager',company:'Verified company',contactPhone:'780-555-0181',phoneEvidence:evidence,expectedContact:{name:'Alex Manager',email:null,phone:'780-555-0110'}};
      const before=await counts();
      const mismatch=await enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[{...entry,contactName:'Other person'}]})});assert.equal(mismatch.results[0].reason,'contact_identity_conflict');
      const stale=await enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[{...entry,expectedContact:{...entry.expectedContact,phone:null}}]})});assert.equal(stale.results[0].reason,'stale_contact_snapshot');
      const applied=await enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[entry]})});assert.equal(applied.results[0].reason,'replaced_bad_contact_phone');assert.equal(applied.results[0].contactId,alternateId);
      assert.equal((await workspace()).contacts.find(row=>row.id===alternateId)!.name,'Alex Manager');assert.deepEqual(await counts(),before);
      await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:alternateId,input:{phone:'780-555-0110'}});
    });
    await t.test('an exact earlier conflict observation becomes applied after a bad finding and its replay is harmless', async () => {
      await db.exec(`INSERT INTO prospects(id,user_id,name,status,business_name,contact_company,contact_name,contact_email,contact_phone,ai_metadata) VALUES('repeat-proposal','owner','Repeat company','prospect','Repeat company','Repeat company','Repeat Buyer','repeat@example.test','780-555-0160','{}')`);
      const w=await workspace('repeat-proposal');const id=w.primaryContactId;
      const entry={prospectId:'repeat-proposal',contactId:id,contactName:'Repeat Buyer',email:'repeat@example.test',company:'Repeat company',contactPhone:'780-555-0161',phoneEvidence:evidence,expectedContact:{name:'Repeat Buyer',email:'repeat@example.test',phone:'780-555-0160'}};
      const enrich=()=>enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[entry]})});
      assert.equal((await enrich()).results[0].reason,'existing_phone_conflict');
      const original=(await db.query<any>("SELECT ai_metadata FROM prospects WHERE id='repeat-proposal'")).rows[0].ai_metadata.phoneEnrichment.observations[0];
      assert.equal(original.status,'needs_review');
      await recordMobileCallOutcome({pool,userId:'owner',input:{clientEventId:'repeat-proposal-bad-number',prospectId:'repeat-proposal',contactId:id,expectedPhone:'780-555-0160',outcome:'wrong_number',notes:''}});
      const before=await counts();assert.equal((await enrich()).results[0].reason,'replaced_bad_primary_phone');
      const observations=(await db.query<any>("SELECT ai_metadata FROM prospects WHERE id='repeat-proposal'")).rows[0].ai_metadata.phoneEnrichment.observations;
      assert.equal(observations.length,1);assert.equal(observations[0].status,'applied');assert.equal(observations[0].contactId,id);
      for(const key of ['id','number','kind','source','url','observedAt','verified','recordedAt']) assert.deepEqual(observations[0][key],original[key]);
      assert.ok(observations[0].appliedAt);assert.equal((await enrich()).unchanged,1);
      assert.deepEqual((await db.query<any>("SELECT ai_metadata FROM prospects WHERE id='repeat-proposal'")).rows[0].ai_metadata.phoneEnrichment.observations,observations);
      assert.deepEqual(await counts(),before);
    });
    await t.test('fresh verified replacement repairs bad primary only; healthy choices and old bad findings survive retries', async () => {
      const entry={prospectId:'account',contactId:primaryId,contactName:'Joe Owner',email:'joe@example.test',company:'Verified company',contactPhone:'780-555-0198',phoneEvidence:evidence,expectedContact:{name:'Joe Owner',email:'joe@example.test',phone:'780-555-0100'}};
      const before=await counts();const payload=PhoneEnrichmentBatchSchema.parse({entries:[entry]});
      const applied=await enrichProspectPhoneBatch({pool,userId:'owner',input:payload});assert.equal(applied.results[0].reason,'replaced_bad_primary_phone');
      assert.equal((await enrichProspectPhoneBatch({pool,userId:'owner',input:payload})).unchanged,1);
      const w=await workspace();assert.equal(w.primaryContactId,primaryId);assert.equal(w.phoneReadiness.status,'ready');assert.equal(w.phoneReadiness.usableChoices[0].number,'780-555-0198');assert.equal(w.contacts.find(row=>row.id===alternateId)!.phone,'780-555-0110');
      assert.equal((await needs()).rows.some(row=>row.prospect.id==='account'),false);
      const conflict=await enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[{...entry,contactPhone:'780-555-0199',expectedContact:{...entry.expectedContact,phone:'780-555-0198'}}]})});assert.equal(conflict.results[0].reason,'existing_phone_conflict');
      await updateProspectContact({pool,userId:'owner',prospectId:'account',contactId:primaryId,input:{phone:'780-555-0100'}});
      assert.equal((await workspace()).phoneReadiness.usableChoices.length,0);
      const reintroduced=await enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[{...entry,contactPhone:'780-555-0100'}]})});assert.equal(reintroduced.results[0].reason,'reported_bad_phone');
      assert.deepEqual(await counts(),before);
      const context=await getPhoneEnrichmentContext({pool,userId:'owner'});assert.equal(context.rows.find(row=>row.prospectId==='account')!.phoneReadiness.status,'needs_number');
    });
  } finally {await db.close();}
});