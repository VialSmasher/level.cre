import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeBusinessPhone,normalizePhoneCapture,PhoneEnrichmentBatchSchema,enrichProspectPhoneBatch,getPhoneEnrichmentContext} from './phoneEnrichmentService';
import {normalizeSalesActivityInput} from './salesActivityImport';
import {importSalesActivityBatch,SalesActivityBatchSchema} from './salesActivityImportService';

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
    CREATE TABLE prospects(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id),name varchar,status varchar,business_name varchar,contact_company varchar,contact_name varchar,contact_email varchar,contact_phone varchar,address varchar,website_url varchar,ai_metadata jsonb,merged_into_prospect_id varchar,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE contact_interactions(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,source_metadata jsonb DEFAULT '{}');
    CREATE TABLE activity_events(id varchar PRIMARY KEY,user_id varchar,prospect_id varchar,source varchar,event_type varchar,evidence_status varchar,match_status varchar,interaction_id varchar,source_metadata jsonb);
    CREATE TABLE skill_activities(id varchar);
    CREATE TABLE sales_activity_imports(id varchar PRIMARY KEY,user_id varchar,source varchar,run_id varchar,external_activity_id varchar,activity_status varchar,activity_type varchar,contact_name varchar,company varchar,email varchar,email_domain varchar,subject varchar,notes varchar,activity_at timestamptz,prospect_id varchar,listing_id varchar,match_status varchar,match_reason varchar,confidence integer,interaction_id varchar,raw_payload jsonb,updated_at timestamp DEFAULT now(),UNIQUE(user_id,source,external_activity_id));
    INSERT INTO prospects(id,user_id,name,status,business_name,contact_company,contact_name,contact_email,contact_phone,ai_metadata) VALUES
      ('blank','owner','Verified company','prospect','Verified company','Verified company','Joe Owner','joe@example.test',NULL,'{"propertyLink":{"propertyProspectId":"building"}}'),
      ('named','owner','Other company','prospect','Other company','Other company','Tim Director','tim@example.test','780-555-0199','{}'),
      ('foreign','foreign','Foreign company','prospect','Foreign company','Foreign company','Foreign Owner','foreign@example.test',NULL,'{}'),
      ('pending','owner','Pending company','prospect','Pending company','Pending company','Pat Manager','pat@example.test',NULL,'{}'),
      ('merged','owner','Merged company','prospect','Merged company','Merged company','Joe Owner','joe@example.test',NULL,'{}'),
      ('no-go','owner','No go company','no_go','No go company','No go company',NULL,NULL,NULL,'{}');
    UPDATE prospects SET merged_into_prospect_id='blank' WHERE id='merged';
    INSERT INTO activity_events VALUES('pending-click','owner','pending','level_cre_mobile_calling','call_started','observed','matched',NULL,'{"sessionState":"started","contactSnapshot":{"name":"Pat Manager","phone":"780-555-0177"}}');
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
