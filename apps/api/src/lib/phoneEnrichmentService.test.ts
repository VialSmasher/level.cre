import test from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeBusinessPhone,normalizePhoneCapture,PhoneEnrichmentBatchSchema,enrichProspectPhoneBatch,getPhoneEnrichmentContext} from './phoneEnrichmentService';
import {normalizeSalesActivityInput} from './salesActivityImport';
import {importSalesActivityBatch,reviewSalesActivityImport,SalesActivityBatchSchema} from './salesActivityImportService';
import {linkSalesActivityReference} from './salesProspectMappingService';

const evidence={kind:'contact_direct',source:'company_website',url:'https://company.example.test/team',observedAt:'2026-10-07T12:00:00Z',verified:true} as const;
test('phone capture accepts one explicit number and provenance while rejecting lists and private payload fields',()=>{
  for(const value of ['780-555-0100 / 780-555-0101','Main:780-555-0100','7805550100\n7805550101','1-800-FLOWERS','780']) assert.equal(normalizeBusinessPhone(value),null,value);
  assert.equal(normalizeBusinessPhone('+1 (780) 555-0100;ext=12'),'+1 (780) 555-0100 ext 12');
  assert.deepEqual(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:evidence}),{contactPhone:'780-555-0100',phoneEvidence:evidence,phoneCaptureIssue:null});
  const flat=normalizePhoneCapture({contact_phone:'780-555-0100',phoneKind:'contact_direct',phoneSource:'company_website',phoneEvidenceUrl:evidence.url,phoneObservedAt:evidence.observedAt,phoneVerified:true});
  assert.deepEqual(flat.phoneEvidence,evidence);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100'}).phoneCaptureIssue,'incomplete_phone_evidence');
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,url:'file:///private'}}).phoneEvidence,null);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,source:'email_signature',url:undefined}}).phoneEvidence,null);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,source:'email_signature',providerId:'<verified-message@example.test>'}}).phoneCaptureIssue,null);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,source:'zoominfo',url:undefined,providerId:'16600394'}}).phoneCaptureIssue,null);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,source:'zoominfo',url:undefined}}).phoneEvidence,null);
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,directNumberType:'mobile'}}).phoneEvidence?.directNumberType,'mobile');
  assert.equal(normalizePhoneCapture({contactPhone:'780-555-0100',phoneEvidence:{...evidence,kind:'company_main',directNumberType:'mobile'}}).phoneEvidence,null);
  assert.equal(PhoneEnrichmentBatchSchema.safeParse({entries:[{prospectId:'p',contactPhone:'780-555-0100',phoneEvidence:evidence}]}).success,false);
  assert.equal(PhoneEnrichmentBatchSchema.safeParse({entries:[{prospectId:'p',contactPhone:'780-555-0100',phoneEvidence:evidence,userId:'foreign'}]}).success,false);
});
test('phone metadata survives activity normalization without changing event identity or retaining message contents',()=>{
  const original={email:'joe@example.test',contact:'Joe Owner',company:'Verified company',subject:'Catch up',status:'sent',activityAt:'2026-10-07T10:00:00Z'};
  const base=normalizeSalesActivityInput(original);
  const captured=normalizeSalesActivityInput({...original,contactPhone:'780-555-0100',phoneEvidence:evidence,body:'private body',html:'private html'});
  assert.equal(base.externalActivityId,captured.externalActivityId);assert.equal(captured.contactPhone,'780-555-0100');assert.deepEqual(captured.rawPayload.phoneEvidence,evidence);
  assert.equal(captured.rawPayload.body,undefined);assert.equal(captured.rawPayload.html,undefined);
  assert.equal(normalizeSalesActivityInput({...original,contactPhone:'780-555-0100 or 780-555-0101'}).contactPhone,null);
  const partial=normalizeSalesActivityInput({...original,contactPhone:'780-555-0100'});assert.equal(partial.contactPhone,'780-555-0100');assert.equal(partial.phoneEvidence,null);assert.equal(partial.rawPayload.phoneCaptureIssue,'incomplete_phone_evidence');
});
async function harness(){
  const db=new PGlite();await db.exec(`
    CREATE TABLE users(id varchar PRIMARY KEY);INSERT INTO users VALUES('owner'),('foreign');
    CREATE TABLE prospects(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id),name varchar,status varchar,business_name varchar,contact_company varchar,contact_name varchar,contact_email varchar,contact_phone varchar,address varchar,website_url varchar,last_contact_date varchar,follow_up_due_date timestamptz,ai_metadata jsonb,merged_into_prospect_id varchar,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE contact_interactions(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,type varchar,date varchar,source_provider varchar,source_message_id varchar,source_metadata jsonb DEFAULT '{}',UNIQUE(user_id,source_provider,source_message_id,prospect_id));
    CREATE TABLE activity_events(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,source varchar,event_type varchar,evidence_status varchar,match_status varchar,interaction_id varchar,source_metadata jsonb,external_event_id varchar,match_reason varchar,confidence int,updated_at timestamp DEFAULT now());
    CREATE TABLE skill_activities(id varchar); CREATE TABLE opportunities(id varchar,user_id varchar,prospect_id varchar,archived_at timestamp,status varchar,stage varchar);
    CREATE TABLE sales_activity_imports(id varchar PRIMARY KEY,user_id varchar,source varchar,run_id varchar,external_activity_id varchar,activity_status varchar,activity_type varchar,contact_name varchar,company varchar,email varchar,email_domain varchar,subject varchar,notes varchar,activity_at timestamptz,prospect_id varchar,listing_id varchar,match_status varchar,match_reason varchar,confidence integer,interaction_id varchar,raw_payload jsonb,updated_at timestamp DEFAULT now(),UNIQUE(user_id,source,external_activity_id));
    INSERT INTO prospects(id,user_id,name,status,business_name,contact_company,contact_name,contact_email,contact_phone,ai_metadata) VALUES
      ('blank','owner','Verified company','prospect','Verified company','Verified company','Joe Owner','joe@example.test',NULL,'{"propertyLink":{"propertyProspectId":"building"}}'),
      ('named','owner','Other company','prospect','Other company','Other company','Tim Director','tim@example.test','780-555-0199','{}'),
      ('foreign','foreign','Foreign company','prospect','Foreign company','Foreign company','Foreign Owner','foreign@example.test',NULL,'{}'),
      ('pending','owner','Pending company','prospect','Pending company','Pending company','Pat Manager','pat@example.test',NULL,'{}'),
      ('merged','owner','Merged company','prospect','Merged company','Merged company','Joe Owner','joe@example.test',NULL,'{}'),
      ('no-go','owner','No go company','no_go','No go company','No go company',NULL,NULL,NULL,'{}');
    UPDATE prospects SET merged_into_prospect_id='blank' WHERE id='merged';
    INSERT INTO activity_events(id,user_id,prospect_id,source,event_type,evidence_status,match_status,interaction_id,source_metadata) VALUES('pending-click','owner','pending','level_cre_mobile_calling','call_started','observed','matched',NULL,'{"sessionState":"started","contactSnapshot":{"name":"Pat Manager","phone":"780-555-0177"}}');
  `);
  await db.exec(await readFile(new URL('../../../../drizzle/0021_prospect_contacts.sql',import.meta.url),'utf8'));
  const pool:any={query:(sql:string,values?:any[])=>db.query(sql,values),connect:async()=>({query:(sql:string,values?:any[])=>db.query(sql,values),release(){}})};
  const apply=async(entry:any)=>{
    const row=(await db.query<any>('SELECT contact_name,contact_email,contact_phone FROM prospects WHERE id=$1',[entry.prospectId])).rows[0];
    return enrichProspectPhoneBatch({pool,userId:'owner',input:PhoneEnrichmentBatchSchema.parse({entries:[{expectedContact:{name:row?.contact_name ?? null,email:row?.contact_email ?? null,phone:row?.contact_phone ?? null},...entry}]})});
  };
  const entry=(prospectId='blank',extra:any={})=>({prospectId,contactName:'Joe Owner',email:'joe@example.test',company:'Verified company',contactPhone:'780-555-0100',phoneEvidence:evidence,...extra});
  return{db,pool,apply,entry};
}
test('verified enrichment uses real PostgreSQL locks and preserves identity, property facts and all activity credit',async(t)=>{
  const {db,pool,apply,entry}=await harness();try{
    await t.test('context is owned, minimal and read-only; pending state is explicit',async()=>{
      const context=await getPhoneEnrichmentContext({pool,userId:'owner'});assert.equal(context.total,3);assert.ok(context.rows.every((row)=>!['foreign','merged','no-go'].includes(row.prospectId)));assert.equal(context.rows.find((row)=>row.prospectId==='pending')!.pendingCall,true);
      assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,0);assert.equal((context.rows[0] as any).notes,undefined);
    });
    await t.test('context tolerates the live schema without a website column and reads only saved mapping provenance',async()=>{
      await db.query(`UPDATE prospects SET ai_metadata=ai_metadata || '{"salesProspectMapping":{"websiteUrl":"https://company.example.test"}}'::jsonb WHERE id='blank'`);
      await db.exec('ALTER TABLE prospects DROP COLUMN website_url');
      const context=await getPhoneEnrichmentContext({pool,userId:'owner'});assert.equal(context.rows.find((row)=>row.prospectId==='blank')!.websiteUrl,'https://company.example.test');
      assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,0);
    });
    await t.test('exact direct identity fills blank scalar and primary snapshot once; retries add no provenance',async()=>{
      const input=entry('blank',{expectedContact:{name:'Joe Owner',email:'joe@example.test',phone:null}});
      const first=await apply(input);assert.equal(first.applied,1);const primary=first.results[0].contactId;
      const before=(await db.query<any>("SELECT * FROM prospects WHERE id='blank'")).rows[0];assert.equal(before.contact_phone,'780-555-0100');assert.equal(before.contact_name,'Joe Owner');assert.equal(before.contact_email,'joe@example.test');assert.deepEqual(before.ai_metadata.propertyLink,{propertyProspectId:'building'});
      const retry=await apply(input);assert.equal(retry.unchanged,1);const after=(await db.query<any>("SELECT * FROM prospects WHERE id='blank'")).rows[0];assert.deepEqual(after,before);
      assert.equal((await db.query<any>('SELECT phone FROM prospect_contacts WHERE id=$1',[primary])).rows[0].phone,'780-555-0100');
      assert.equal((await apply({...input,phoneEvidence:{...evidence,url:'https://company.example.test/new-evidence'}})).results[0].reason,'stale_contact_snapshot');
      assert.equal((await apply({...input,expectedContact:{name:'Other person',email:'joe@example.test',phone:null}})).results[0].reason,'stale_contact_snapshot');
    });
    await t.test('existing nonblank phone and conflicting person remain unchanged with review evidence',async()=>{
      const different=await apply(entry('named',{contactName:'Tim Director',email:'tim@example.test',company:'Other company'}));assert.equal(different.results[0].reason,'existing_phone_conflict');
      const conflict=await apply(entry('named'));assert.equal(conflict.results[0].reason,'contact_identity_conflict');
      assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='named'")).rows[0].contact_phone,'780-555-0199');
    });
    await t.test('company main line creates a labeled switchboard relationship and never replaces named primary',async()=>{
      const input=entry('named',{company:'Other company',contactName:undefined,email:undefined,contactPhone:'780-555-0133',phoneEvidence:{...evidence,kind:'company_main'}});
      const added=await apply(input);assert.equal(added.applied,1);const row=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[added.results[0].contactId])).rows[0];assert.equal(row.name,'Company main line');assert.equal(row.title,'Company switchboard');assert.equal(row.is_primary,false);assert.equal(row.source,'broker_added');assert.equal(row.email,null);
      assert.equal((await apply(input)).unchanged,1);assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='named'")).rows[0].contact_phone,'780-555-0199');
      assert.equal((await apply({...input,contactPhone:'780-555-0144'})).results[0].reason,'existing_main_line_conflict');
    });
    await t.test('expected identity races, pending calls, merged or foreign targets cannot mutate phones',async()=>{
      const stale=await apply(entry('blank',{expectedContact:{name:'Old Joe',email:'joe@example.test',phone:'780-555-0100'}}));assert.equal(stale.results[0].reason,'stale_contact_snapshot');
      const pendingBefore=(await db.query<any>("SELECT * FROM prospects WHERE id='pending'")).rows[0];const eventBefore=(await db.query<any>("SELECT * FROM activity_events WHERE id='pending-click'")).rows[0];
      assert.equal((await apply(entry('pending',{contactName:'Pat Manager',email:'pat@example.test',company:'Pending company'}))).results[0].reason,'pending_call');
      assert.deepEqual((await db.query<any>("SELECT * FROM prospects WHERE id='pending'")).rows[0],pendingBefore);assert.deepEqual((await db.query<any>("SELECT * FROM activity_events WHERE id='pending-click'")).rows[0],eventBefore);
      const foreignBefore=(await db.query<any>("SELECT * FROM prospects WHERE id='foreign'")).rows[0];assert.equal((await apply(entry('foreign'))).results[0].reason,'prospect_not_found');assert.deepEqual((await db.query<any>("SELECT * FROM prospects WHERE id='foreign'")).rows[0],foreignBefore);
      assert.equal((await apply(entry('merged'))).results[0].reason,'prospect_merged');assert.equal((await apply(entry('no-go'))).results[0].reason,'inactive_prospect');
    });
    await t.test('cross-company contact ID and unsupported evidence are reviewable without changing target',async()=>{
      const main=(await db.query<any>("SELECT id FROM prospect_contacts WHERE name='Company main line'")).rows[0].id;
      assert.equal((await apply(entry('blank',{contactId:main}))).results[0].reason,'contact_not_found');
      assert.equal((await apply(entry('blank',{company:'Wrong company',phoneEvidence:{...evidence,kind:'company_main'}}))).results[0].reason,'company_identity_conflict');
      assert.equal((await apply(entry('blank',{phoneEvidence:{...evidence,observedAt:'2999-01-01T00:00:00Z'}}))).results[0].reason,'future_evidence');
    });
    await t.test('malformed observation arrays stay preserved and return review without mutation',async()=>{
      const before=(await db.query<any>("SELECT ai_metadata FROM prospects WHERE id='blank'")).rows[0].ai_metadata;
      await db.query("UPDATE prospects SET ai_metadata=$1::jsonb WHERE id='blank'",[JSON.stringify({...before,phoneEnrichment:{observations:[null]}})]);
      const corrupt=(await db.query<any>("SELECT * FROM prospects WHERE id='blank'")).rows[0];
      assert.equal((await apply(entry())).results[0].reason,'metadata_conflict');assert.deepEqual((await db.query<any>("SELECT * FROM prospects WHERE id='blank'")).rows[0],corrupt);
      await db.query("UPDATE prospects SET ai_metadata=$1::jsonb WHERE id='blank'",[JSON.stringify(before)]);
    });
    await t.test('a selected additional person receives only their verified blank phone and keeps their identity',async()=>{
      const id='b1e2690f-55f2-4c3c-9cc9-6ef1f07e5d51';
      await db.query(`INSERT INTO prospect_contacts(id,user_id,prospect_id,source,name,company,email,identity_key) VALUES($1,'owner','named','broker_added','Alex Buyer','Other company','alex@example.test',$2)`,[id,JSON.stringify({name:'alex buyer',email:'alex@example.test'})]);
      const before=(await db.query<any>("SELECT * FROM prospects WHERE id='named'")).rows[0];
      const input=entry('named',{contactId:id,contactName:'Alex Buyer',email:'alex@example.test',company:'Other company',contactPhone:'780-555-0166',expectedContact:{name:'Alex Buyer',email:'alex@example.test',phone:null}});
      assert.equal((await apply(input)).results[0].reason,'filled_contact_phone');assert.equal((await apply(input)).unchanged,1);
      const row=(await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1',[id])).rows[0];assert.equal(row.phone,'780-555-0166');assert.equal(row.name,'Alex Buyer');assert.equal(row.archived_at,null);assert.equal(row.is_primary,false);
      const after=(await db.query<any>("SELECT * FROM prospects WHERE id='named'")).rows[0];assert.equal(after.contact_phone,before.contact_phone);assert.equal(after.contact_name,before.contact_name);assert.equal(after.contact_email,before.contact_email);
    });
    await t.test('a duplicate real import can fill a missing phone without another event and omitted retries retain capture',async()=>{
      await db.query("UPDATE prospects SET contact_phone=NULL WHERE id='blank'");
      const input={externalActivityId:'verified-email-1',email:'joe@example.test',contact:'Joe Owner',company:'Verified company',subject:'Approved email',status:'sent',activityAt:'2026-10-07T10:00:00Z',prospectId:'blank'};
      const run=(row:any)=>importSalesActivityBatch({pool,userId:'owner',storage:{createContactInteraction:async()=>{throw new Error('Phone enrichment must not credit outreach');}},payload:SalesActivityBatchSchema.parse({createInteractions:false,activities:[row]})});
      assert.equal((await run(input)).errors,0);
      const partial=await run({...input,contactPhone:'780-555-0100'});assert.equal(partial.results[0].phoneEnrichment!.reason,'unverified_phone');assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='blank'")).rows[0].contact_phone,null);
      const enriched=await run({...input,contactPhone:'780-555-0100',phoneEvidence:evidence});assert.equal(enriched.errors,0);assert.equal(enriched.duplicates,1);assert.equal(enriched.results[0].phoneEnrichment!.status,'applied');
      assert.equal((await run(input)).errors,0);const row=(await db.query<any>("SELECT raw_payload FROM sales_activity_imports WHERE external_activity_id='verified-email-1'")).rows[0];assert.equal(row.raw_payload.contactPhone,'780-555-0100');assert.deepEqual(row.raw_payload.phoneEvidence,evidence);
      assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM sales_activity_imports')).rows[0].n,1);
    });
    assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM skill_activities')).rows[0].n,0);assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM contact_interactions')).rows[0].n,0);assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM prospects')).rows[0].n,6);
  } finally {await db.close();}
});

test('typed contact enrichment preserves healthy office, adds one owned mobile, and rejects conflicting types or company identities',async()=>{
  const {db,pool,apply,entry}=await harness();try{
    const mobile=entry('named',{contactName:'Tim Director',email:'tim@example.test',company:'Other company',contactPhone:'780-555-0188',phoneEvidence:{...evidence,directNumberType:'mobile',source:'zoominfo',providerId:'tim-director'}});
    const first=await apply(mobile);assert.equal(first.applied,1);assert.equal(first.results[0].reason,'added_contact_mobile');
    const saved=(await db.query<any>("SELECT * FROM prospects WHERE id='named'")).rows[0];assert.equal(saved.contact_phone,'780-555-0199');assert.equal(saved.contact_email,'tim@example.test');
    const roster=(await db.query<any>("SELECT * FROM prospect_contacts WHERE prospect_id='named' AND is_primary=true")).rows[0];assert.deepEqual(roster.additional_phones,[{label:'Mobile',number:'780-555-0188'}]);
    assert.equal((await apply(mobile)).unchanged,1);assert.equal((await apply({...mobile,contactPhone:'780-555-0189'})).results[0].reason,'existing_phone_type_conflict');
    assert.equal((await apply({...mobile,contactPhone:'780-555-0199',phoneEvidence:{...mobile.phoneEvidence,directNumberType:'office'}})).unchanged,1);
    assert.equal((await apply({...mobile,contactPhone:'780-555-0187',phoneEvidence:{...mobile.phoneEvidence,directNumberType:'office'}})).results[0].reason,'existing_phone_type_conflict');
    const context=(await getPhoneEnrichmentContext({pool,userId:'owner'})).rows.find(row=>row.prospectId==='named')!;assert.equal(context.phoneReadiness.usableChoices[0].number,'780-555-0188');assert.equal(context.phoneReadiness.usableChoices[0].phoneType,'mobile');assert.equal(context.phoneReadiness.usableChoices[1].phoneType,'office');
    const before=(await db.query<any>("SELECT * FROM prospect_contacts WHERE id=$1",[roster.id])).rows[0];
    assert.equal((await apply({...mobile,email:'other@example.test',contactPhone:'780-555-0187'})).results[0].reason,'contact_identity_conflict');
    assert.equal((await apply({...mobile,prospectId:'foreign',contactId:roster.id})).results[0].reason,'prospect_not_found');
    assert.deepEqual((await db.query<any>("SELECT * FROM prospect_contacts WHERE id=$1",[roster.id])).rows[0],before);
    await db.query("UPDATE prospects SET contact_name='Other company' WHERE id='named'");
    assert.equal((await apply({...mobile,contactName:'Other company'})).results[0].reason,'person_identity_required');
    for (const table of ['activity_events','contact_interactions','skill_activities']) assert.equal((await db.query<any>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,table==='activity_events'?1:0);
  } finally {await db.close();}
});
test('retained phone capture replays through manual and mapped links using real PostgreSQL', async (t) => {
  const { db, pool } = await harness();
  let storageCalls = 0;
  const storage = {
    linkProspectToListingAny: async () => { throw new Error('These fixtures do not link listings'); },
    createContactInteraction: async (input: any, options: any) => {
      assert.deepEqual(options, { skipXp: true });
      storageCalls++;
      const { rows } = await db.query<any>(
        `INSERT INTO contact_interactions(id,user_id,prospect_id,source_provider,source_message_id,source_metadata)
         VALUES($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT(user_id,source_provider,source_message_id,prospect_id)
         DO UPDATE SET source_message_id=contact_interactions.source_message_id RETURNING id`,
        [randomUUID(), input.userId, input.prospectId, input.sourceProvider, input.sourceMessageId, JSON.stringify(input.sourceMetadata)],
      );
      return rows[0];
    },
  };
  const counts = async () => (await db.query<any>(
    `SELECT (SELECT COUNT(*) FROM contact_interactions)::int AS interactions,
     (SELECT COUNT(*) FROM activity_events)::int AS events,
     (SELECT COUNT(*) FROM skill_activities)::int AS xp,
     (SELECT COUNT(*) FROM prospects)::int AS prospects`,
  )).rows[0];
  const capture = async (id: string, extra: any = {}) => {
    const result = await importSalesActivityBatch({
      pool, storage, userId: 'owner',
      payload: SalesActivityBatchSchema.parse({ activities: [{
        externalActivityId: id, email: `${id}@example.test`, contactName: 'Saved Buyer',
        company: `${id} company`, subject: 'Verified email', status: 'sent',
        activityAt: '2026-10-07T10:00:00Z', contactPhone: '780-555-0188',
        phoneEvidence: evidence, ...extra,
      }] }),
    });
    assert.equal(result.errors, 0);
    return result.results[0].importId!;
  };
  const addProspect = async (id: string, extra: any = {}) => {
    const row = { company: `${id} company`, name: 'Saved Buyer', email: `${id}@example.test`, phone: null, owner: 'owner', ...extra };
    await db.query(
      `INSERT INTO prospects(id,user_id,name,status,business_name,contact_company,contact_name,contact_email,contact_phone,ai_metadata)
       VALUES($1,$2,$3,'prospect',$3,$3,$4,$5,$6,'{"propertyLink":{"propertyProspectId":"building"}}')`,
      [id,row.owner,row.company,row.name,row.email,row.phone],
    );
  };
  const link = (importId: string, prospectId: string) => reviewSalesActivityImport({
    pool, storage, userId: 'owner', importId, decision: { action: 'link', prospectId },
  });
  try {
    await t.test('company main survives unmatched capture and omitted retry, then mapping attaches one switchboard', async () => {
      const importId = await capture('mapped-main', { phoneEvidence: { ...evidence, kind: 'company_main' } });
      assert.equal(storageCalls, 0);
      await importSalesActivityBatch({
        pool, storage, userId: 'owner', payload: SalesActivityBatchSchema.parse({ activities: [{
          externalActivityId: 'mapped-main', email: 'mapped-main@example.test', contactName: 'Saved Buyer',
          company: 'mapped-main company', status: 'sent', subject: 'Verified email', activityAt: '2026-10-07T10:00:00Z',
        }] }),
      });
      const retained = (await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE id=$1', [importId])).rows[0].raw_payload;
      assert.equal(retained.contactPhone, '780-555-0188');
      assert.equal(retained.phoneEvidence.kind, 'company_main');
      await addProspect('mapped-main');
      await db.query(`INSERT INTO activity_events(id,user_id,source,external_event_id,event_type,evidence_status,match_status,source_metadata)
        VALUES('mapped-email','owner','codex_followup','mapped-main','email_sent','confirmed','needs_review','{}')`);
      const before = await counts();
      const first = await linkSalesActivityReference({ pool, storage, userId: 'owner', externalActivityId: 'mapped-main', prospectId: 'mapped-main' });
      assert.equal(first.linked, true);
      const result = (first as any).result;
      assert.equal(result.phoneEnrichment.reason, 'added_company_main_line');
      assert.equal(result.phoneEnrichment.evidence.kind, 'company_main');
      const target = (await db.query<any>("SELECT * FROM prospects WHERE id='mapped-main'")).rows[0];
      assert.equal(target.contact_name, 'Saved Buyer');
      assert.equal(target.contact_email, 'mapped-main@example.test');
      assert.equal(target.contact_phone, null);
      assert.deepEqual(target.ai_metadata.propertyLink, { propertyProspectId: 'building' });
      const contact = (await db.query<any>('SELECT * FROM prospect_contacts WHERE id=$1', [result.phoneEnrichment.contactId])).rows[0];
      assert.equal(contact.name, 'Company main line');
      assert.equal(contact.title, 'Company switchboard');
      assert.equal(contact.is_primary, false);
      assert.equal(contact.phone, '780-555-0188');
      assert.equal(contact.email, null);
      const once = await counts();
      assert.deepEqual(once, { ...before, interactions: before.interactions + 1 });
      const calls = storageCalls;
      const retry = await linkSalesActivityReference({ pool, storage, userId: 'owner', externalActivityId: 'mapped-main', prospectId: 'mapped-main' });
      assert.equal((retry as any).result.phoneEnrichment.reason, 'existing_main_line_matches');
      assert.equal((retry as any).result.phoneEnrichment.contactId, contact.id);
      assert.deepEqual(await counts(), once);
      assert.equal(storageCalls, calls);
      const after = (await db.query<any>("SELECT ai_metadata FROM prospects WHERE id='mapped-main'")).rows[0].ai_metadata;
      assert.equal(after.phoneEnrichment.observations.length, 1);
      const event = (await db.query<any>("SELECT prospect_id,interaction_id FROM activity_events WHERE id='mapped-email'")).rows[0];
      assert.equal(event.prospect_id, 'mapped-main');
      assert.equal(event.interaction_id, result.interaction_id);
    });
    await t.test('manual exact-person link fills blank direct number once and preserves evidence', async () => {
      const importId = await capture('direct');
      await addProspect('direct');
      const first = await link(importId, 'direct');
      assert.equal((first.phoneEnrichment as any).reason, 'filled_primary_phone');
      const after = await counts();
      const target = (await db.query<any>("SELECT * FROM prospects WHERE id='direct'")).rows[0];
      assert.equal(target.contact_phone, '780-555-0188');
      assert.equal(target.contact_name, 'Saved Buyer');
      const primary = (await db.query<any>("SELECT * FROM prospect_contacts WHERE prospect_id='direct' AND is_primary")).rows[0];
      assert.equal(primary.phone, target.contact_phone);
      const retry = await link(importId, 'direct');
      assert.equal((retry.phoneEnrichment as any).reason, 'existing_phone_matches');
      assert.deepEqual(await counts(), after);
      const retained = (await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE id=$1', [importId])).rows[0].raw_payload;
      assert.deepEqual(retained.phoneEvidence, evidence);
      assert.equal(retained.phoneEnrichment.status, 'unchanged');
    });
    await t.test('person/company mismatches, unverified capture and nonblank phones remain reviewable', async () => {
      for (const fixture of [
        { id:'person-mismatch', prospect:{name:'Different Buyer'}, capture:{}, reason:'contact_identity_conflict' },
        { id:'company-mismatch', prospect:{company:'Different company'}, capture:{phoneEvidence:{...evidence,kind:'company_main'}}, reason:'company_identity_conflict' },
        { id:'unverified', prospect:{}, capture:{phoneEvidence:undefined}, reason:'unverified_phone' },
        { id:'existing', prospect:{phone:'780-555-0198'}, capture:{}, reason:'existing_phone_conflict' },
      ]) {
        const importId = await capture(fixture.id, fixture.capture);
        await addProspect(fixture.id, fixture.prospect);
        const result = await link(importId, fixture.id);
        assert.equal((result.phoneEnrichment as any).status, 'needs_review');
        assert.equal((result.phoneEnrichment as any).reason, fixture.reason);
        const target = (await db.query<any>('SELECT contact_phone,contact_name FROM prospects WHERE id=$1', [fixture.id])).rows[0];
        assert.equal(target.contact_phone, fixture.prospect.phone || null);
        assert.equal(target.contact_name, fixture.prospect.name || 'Saved Buyer');
        assert.equal((await db.query<any>('SELECT COUNT(*)::int AS n FROM prospect_contacts WHERE prospect_id=$1 AND phone IS NOT NULL', [fixture.id])).rows[0].n, fixture.prospect.phone ? 1 : 0);
      }
    });
    await t.test('foreign prospects/imports and cross-company contact IDs never acquire phone evidence', async () => {
      const importId = await capture('foreign-link');
      const before = await counts();
      await assert.rejects(link(importId, 'foreign'), (error:any) => error.status === 404);
      await assert.rejects(reviewSalesActivityImport({ pool, storage, userId:'foreign', importId, decision:{action:'link',prospectId:'foreign'} }), (error:any)=>error.status===404);
      assert.deepEqual(await counts(), before);
      const contactId = randomUUID();
      const crossId = await capture('cross-contact', { contactId });
      await db.query(`INSERT INTO prospect_contacts(id,user_id,prospect_id,source,name,email,company,identity_key)
        VALUES($1,'owner','blank','broker_added','Saved Buyer','cross-contact@example.test','cross-contact company','{}')`, [contactId]);
      await addProspect('cross-contact');
      const result = await link(crossId, 'cross-contact');
      assert.equal((result.phoneEnrichment as any).reason, 'contact_not_found');
      assert.equal((await db.query<any>('SELECT phone FROM prospect_contacts WHERE id=$1', [contactId])).rows[0].phone, null);
      assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='cross-contact'")).rows[0].contact_phone, null);
    });
    await t.test('an invalid legacy contact ID reviews the phone without rejecting the email link', async () => {
      const importId = await capture('bad-contact', { contactId:'legacy-slot' });
      await addProspect('bad-contact');
      const result = await link(importId, 'bad-contact');
      assert.equal(result.match_status, 'matched');
      assert.equal((result.phoneEnrichment as any).reason, 'invalid_contact_id');
      assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='bad-contact'")).rows[0].contact_phone, null);
    });
    await t.test('a pending-call deferral replays after cancellation without another interaction or credit', async () => {
      const importId = await capture('deferred');
      await addProspect('deferred');
      await db.query(`INSERT INTO activity_events(id,user_id,prospect_id,source,event_type,evidence_status,match_status,source_metadata)
        VALUES('deferred-click','owner','deferred','level_cre_mobile_calling','call_started','observed','matched','{"sessionState":"started"}')`);
      const deferred = await link(importId, 'deferred');
      assert.equal((deferred.phoneEnrichment as any).reason, 'pending_call');
      const once = await counts();
      const calls = storageCalls;
      await db.query("UPDATE activity_events SET match_status='ignored' WHERE id='deferred-click'");
      const retry = await link(importId, 'deferred');
      assert.equal((retry.phoneEnrichment as any).reason, 'filled_primary_phone');
      assert.deepEqual(await counts(), once);
      assert.equal(storageCalls, calls);
    });
    await t.test('phone replay rolls back when the link write fails, then recovers on the same link', async () => {
      const importId = await capture('rollback');
      await addProspect('rollback');
      const existing = await storage.createContactInteraction({
        userId:'owner',prospectId:'rollback',sourceProvider:'codex',sourceMessageId:'rollback',sourceMetadata:{},
      },{skipXp:true});
      await db.query('UPDATE sales_activity_imports SET prospect_id=$2,interaction_id=$3 WHERE id=$1', [importId,'rollback',existing.id]);
      const before = await counts();
      const retained = (await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE id=$1', [importId])).rows[0].raw_payload;
      await db.exec(`CREATE FUNCTION reject_phone_replay_link() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.external_activity_id='rollback' AND NEW.match_status='matched' THEN RAISE EXCEPTION 'injected link failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_phone_replay_link BEFORE UPDATE ON sales_activity_imports FOR EACH ROW EXECUTE FUNCTION reject_phone_replay_link();`);
      await assert.rejects(link(importId,'rollback'), /injected link failure/);
      assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='rollback'")).rows[0].contact_phone, null);
      assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM prospect_contacts WHERE prospect_id='rollback'")).rows[0].n, 0);
      assert.deepEqual((await db.query<any>('SELECT raw_payload FROM sales_activity_imports WHERE id=$1', [importId])).rows[0].raw_payload, retained);
      assert.deepEqual(await counts(), before);
      await db.exec('DROP TRIGGER reject_phone_replay_link ON sales_activity_imports; DROP FUNCTION reject_phone_replay_link();');
      assert.equal(((await link(importId,'rollback')).phoneEnrichment as any).reason, 'filled_primary_phone');
      assert.deepEqual(await counts(), before);
    });
    await t.test('ignore never replays a retained verified phone', async () => {
      const importId = await capture('ignored');
      await addProspect('ignored');
      const before = await counts();
      const result = await reviewSalesActivityImport({pool,storage,userId:'owner',importId,decision:{action:'ignore'}});
      assert.equal(result.match_status,'ignored');
      assert.equal(result.phoneEnrichment,undefined);
      assert.equal((await db.query<any>("SELECT contact_phone FROM prospects WHERE id='ignored'")).rows[0].contact_phone,null);
      assert.deepEqual(await counts(),before);
    });
    assert.equal((await db.query<any>('SELECT COUNT(*)::int AS n FROM skill_activities')).rows[0].n,0);
  } finally { await db.close(); }
});
