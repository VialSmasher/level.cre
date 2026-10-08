import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { CallingSearchQuerySchema, searchCallingContacts } from './callingSearchService';
import { contactIdentityKey } from './phoneReadiness';

async function harness() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE users(id varchar PRIMARY KEY);INSERT INTO users VALUES('owner'),('foreign');
    CREATE TABLE prospects(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id),name varchar,business_name varchar,address varchar,status varchar,
      contact_name varchar,contact_company varchar,contact_email varchar,contact_phone varchar,merged_into_prospect_id varchar,archived_at timestamp);
    CREATE TABLE contact_interactions(id varchar,user_id varchar,prospect_id varchar,source_metadata jsonb);
    CREATE TABLE activity_events(id varchar,user_id varchar,prospect_id varchar,event_type varchar);
    CREATE TABLE skill_activities(id varchar,user_id varchar,xp_gained integer);
    INSERT INTO prospects(id,user_id,name,business_name,status,contact_name,contact_company,contact_email,contact_phone,address)
      SELECT 'account-' || value,'owner','Saved Company ' || value,'Saved Company ' || value,'prospect','Primary ' || value,
        'Saved Company ' || value,'primary' || value || '@example.test','780-555-0100','Edmonton' FROM generate_series(1,36) AS value;
    UPDATE prospects SET name='Sokill Transport',business_name=NULL,contact_company='Sokill Transport',contact_name='John Dispatcher',contact_email='john@sokill.test' WHERE id='account-35';
    INSERT INTO prospects(id,user_id,name,status,contact_name,contact_company,contact_email,contact_phone) VALUES
      ('foreign-account','foreign','Sokill Transport','prospect','Foreign Greg','Sokill Transport','greg@foreign.test','780-555-0199'),
      ('merged-account','owner','Sokill Transport','prospect','Merged Greg','Sokill Transport','merged@example.test','780-555-0188'),
      ('archived-account','owner','Sokill Transport','prospect','Archived Greg','Sokill Transport','archived@example.test','780-555-0187'),
      ('no-go-account','owner','Sokill Transport','no_go','No Go Greg','Sokill Transport','no-go@example.test','780-555-0186'),
      ('literal-account','owner','Percent %_ Company','prospect','Literal Person','Percent %_ Company','literal@example.test',NULL),
      ('split-account','owner','Split Account','prospect','Primary Split','Split Account','split@example.test',NULL);
    UPDATE prospects SET merged_into_prospect_id='account-35' WHERE id='merged-account';
    UPDATE prospects SET archived_at=now() WHERE id='archived-account';
    INSERT INTO activity_events VALUES('already-called','owner','account-35','call_attempted');
    INSERT INTO contact_interactions VALUES('original-history','owner','account-35','{}');
    INSERT INTO skill_activities VALUES('original-credit','owner',15);`);
  await db.exec(await readFile(new URL('../../../../drizzle/0021_prospect_contacts.sql',import.meta.url),'utf8'));
  const pool: any = {query:(sql:string,values?:any[])=>db.query(sql,values)};
  const addContact = async (prospectId:string, name:string, extra:any={}) => {
    const id=randomUUID();
    await db.query(`INSERT INTO prospect_contacts(id,user_id,prospect_id,source,is_primary,identity_key,name,company,email,phone,title,archived_at,additional_phones)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [id,extra.owner || 'owner',prospectId,extra.primary ? 'legacy_primary' : 'broker_added',Boolean(extra.primary),extra.identity || null,name,
        extra.company || 'Sokill Transport',extra.email || null,extra.phone || null,extra.title || null,extra.archivedAt || null,JSON.stringify(extra.additionalPhones || [])]);
    return id;
  };
  const gregId=await addContact('account-35','Greg Operations',{email:'greg@sokill.test',company:'Different Employer',title:'Operations manager'});
  await addContact('account-35','Company main line',{phone:'780-555-0155',title:'Company switchboard'});
  await addContact('account-35','Archived Greg',{archivedAt:'2026-10-01'});
  await addContact('account-35','Foreign Contact Greg',{owner:'foreign'});
  await addContact('split-account','Greg Split',{company:'First Firm'});
  await addContact('split-account','Mary Split',{company:'Second Firm'});
  const search = (q:string,limit=10,userId='owner') => searchCallingContacts({pool,userId,input:{q,limit}});
  const snapshot = async () => {
    const data:any={};
    for(const table of ['prospects','prospect_contacts','contact_interactions','activity_events','skill_activities']) {
      data[table]=(await db.query(`SELECT to_jsonb(row) AS row FROM ${table} AS row ORDER BY id`)).rows;
    }
    return data;
  };
  return {db,pool,search,addContact,gregId,snapshot};
}

test('calling search validates a short bounded query and never accepts actor authority or unknown parameters', () => {
  assert.deepEqual(CallingSearchQuerySchema.parse({q:' Greg Sokill '}),{q:'Greg Sokill',limit:10});
  for(const input of [{q:'g'},{q:'  '},{q:'x'.repeat(121)},{q:'one two three four five six seven eight nine'},
    {q:'Greg',limit:0},{q:'Greg',limit:21},{q:'Greg',limit:1.5},{q:['Greg','Sokill']},{q:'Greg',userId:'foreign'},{q:'Greg',includeArchived:true}]) {
    assert.equal(CallingSearchQuerySchema.safeParse(input).success,false,JSON.stringify(input));
  }
  assert.equal(CallingSearchQuerySchema.parse({q:'Greg',limit:'20'}).limit,20);
});

test('broker-private calling search uses actual read-only PostgreSQL statements across saved accounts', async(t) => {
  const {db,search,addContact,gregId,snapshot}=await harness();
  try {
    await t.test('contact and company tokens match the exact saved person beyond the queue and after a recorded call', async () => {
      const result=await search('gReG soKILL TRANSPORT');
      assert.equal(result.rows.length,1);assert.equal(result.hasMore,false);
      assert.equal(result.rows[0].prospect.id,'account-35');assert.equal(result.rows[0].contact.id,gregId);
      assert.equal(result.rows[0].prospect.businessName,null);assert.equal(result.rows[0].companyName,'Sokill Transport');
      assert.equal(result.rows[0].contact.company,'Different Employer');
      assert.equal(result.rows[0].contact.name,'Greg Operations');assert.equal(result.rows[0].contact.title,'Operations manager');
      assert.equal(result.rows[0].contact.phone,null);assert.equal(result.rows[0].contact.isPrimary,false);
      assert.equal((result.rows[0] as any).notes,undefined);assert.equal((result.rows[0].prospect as any).userId,undefined);
    });
    await t.test('missing Greg phone never borrows a primary or company switchboard number', async () => {
      const greg=(await search('Greg Sokill')).rows[0];assert.equal(greg.contact.phone,null);
      const company=await search('Sokill Transport');
      assert.ok(company.rows.some(row=>row.contact.name==='John Dispatcher' && row.contact.phone==='780-555-0100'));
      assert.ok(company.rows.some(row=>row.contact.name==='Company main line' && row.contact.phone==='780-555-0155'));
      assert.ok(company.rows.some(row=>row.contact.id===gregId && row.contact.phone===null));
    });
    await t.test('foreign, archived, merged and inactive rows remain excluded under either actor', async () => {
      const owner=await search('Greg');assert.ok(owner.rows.every(row=>!['foreign-account','merged-account','archived-account','no-go-account'].includes(row.prospect.id)));
      assert.ok(owner.rows.every(row=>!['Archived Greg','Foreign Contact Greg'].includes(row.contact.name || '')));
      const foreign=await search('Greg',10,'foreign');assert.equal(foreign.rows.length,1);assert.equal(foreign.rows[0].prospect.id,'foreign-account');
    });
    await t.test('token AND never joins one person name to another person company', async () => {
      assert.equal((await search('Greg Second Firm')).rows.length,0);
      assert.equal((await search('Greg First Firm')).rows.length,1);
    });
    await t.test('wildcards, quotes and SQL-like text remain literal values', async () => {
      const literal=await search('%_');assert.equal(literal.rows.length,1);assert.equal(literal.rows[0].prospect.id,'literal-account');
      assert.equal((await search("Greg' OR 1=1")).rows.length,0);
      await assert.rejects(search('_'));
    });
    await t.test('bounded stable results report hasMore without scanning only the current queue', async () => {
      const first=await search('Saved Company',5);assert.equal(first.rows.length,5);assert.equal(first.hasMore,true);
      const repeat=await search('Saved Company',5);assert.deepEqual(repeat,first);
      const max=await search('Saved Company',20);assert.equal(max.rows.length,20);assert.equal(max.hasMore,true);
      assert.equal((await search('No match anywhere')).hasMore,false);
    });
    await t.test('primary uses current scalar identity and returns no stale anchor ID or stale title', async () => {
      const primary={contact_name:'John Dispatcher',contact_email:'john@sokill.test',contact_phone:'780-555-0100'};
      const id=await addContact('account-35','John Dispatcher',{primary:true,email:primary.contact_email,phone:primary.contact_phone,identity:contactIdentityKey(primary),title:'Dispatcher',additionalPhones:[{label:'Office',number:'780-555-0144'}]});
      const current=(await search('John Sokill')).rows[0];assert.equal(current.contact.id,id);assert.equal(current.contact.title,'Dispatcher');assert.equal(current.contact.hasAdditionalPhones,true);
      await db.query("UPDATE prospects SET contact_name='New Person',contact_email='new@sokill.test' WHERE id='account-35'");
      assert.equal((await search('John Sokill')).rows.length,0);
      const changed=(await search('New Person Sokill')).rows[0];assert.equal(changed.contact.id,null);assert.equal(changed.contact.title,null);assert.equal(changed.contact.hasAdditionalPhones,false);
      assert.equal(changed.contact.email,'new@sokill.test');assert.equal(changed.contact.phone,'780-555-0100');
      const old=(await db.query<any>('SELECT name,title FROM prospect_contacts WHERE id=$1',[id])).rows[0];assert.equal(old.name,'John Dispatcher');assert.equal(old.title,'Dispatcher');
    });
    await t.test('additional-only saved options are explicit without borrowing another person phone', async () => {
      const id=await addContact('account-36','Additional Only',{additionalPhones:[{label:'Mobile',number:'780-555-0166'}]});
      const saved=(await search('Additional Only')).rows[0];assert.equal(saved.contact.id,id);
      assert.equal(saved.contact.phone,null);assert.equal(saved.contact.hasAdditionalPhones,true);
      assert.equal((await search('Greg Sokill')).rows[0].contact.hasAdditionalPhones,false);
    });
    await t.test('read-only search creates no anchors, updates no fields and records no activity or credit', async () => {
      const before=await snapshot();
      await search('Primary 36');await search('Greg Sokill');await search('Percent');await search('New Person');
      assert.deepEqual(await snapshot(),before);
      assert.equal((await db.query<any>("SELECT count(*)::int AS n FROM prospect_contacts WHERE prospect_id='account-36' AND is_primary=true")).rows[0].n,0);
    });
    await t.test('the optional archived column can be absent in the actual legacy prospect schema', async () => {
      await db.exec('ALTER TABLE prospects DROP COLUMN archived_at');
      assert.ok((await search('Greg Sokill')).rows.some(row=>row.contact.id===gregId));
    });
  } finally {await db.close();}
});