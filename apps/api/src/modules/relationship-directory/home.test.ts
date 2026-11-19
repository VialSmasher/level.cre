import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { directoryHome, DirectoryHomeQuery } from './home'

test('company previews use owned confirmed activity, preserve link status, resolve merges and never write activity',async t=>{
  const db=new PGlite();t.after(()=>db.close())
  const fixture=await readFile(new URL('../../lib/prospectContactService.test.ts',import.meta.url),'utf8')
  const quote=String.fromCharCode(96)
  await db.exec(fixture.split('const schema = '+quote)[1].split(quote+';')[0])
  for(const migration of ['0021_prospect_contacts.sql','0023_relationship_directory.sql','0024_relationship_graph.sql','0025_relationship_maintenance.sql']) {
    await db.exec(await readFile(new URL('../../../../../drizzle/'+migration,import.meta.url),'utf8'))
  }
  await db.exec(`INSERT INTO prospects(id,user_id,name,merged_into_prospect_id) VALUES
    ('former','owner','Former company','account'),('connected','owner','Connected company',null),
    ('cycle-a','owner','Cycle A','cycle-b'),('cycle-b','owner','Cycle B','cycle-a');
    INSERT INTO activity_events(id,user_id,prospect_id,event_type,evidence_status,occurred_at) VALUES
    ('a','owner','former','email_received','confirmed',now()-interval '1 hour'),
    ('b','owner','other-account','call_attempted','confirmed',now()-interval '2 hours'),
    ('draft','owner','connected','call_started','confirmed',now()),
    ('inferred','owner','connected','email_sent','inferred',now()),
    ('future','owner','connected','email_sent','confirmed',now()+interval '1 day'),
    ('private','foreign','connected','email_received','confirmed',now());
    INSERT INTO prospect_contacts(id,user_id,prospect_id,source,is_primary,name,title) VALUES
    ('person','owner','account','broker_added',false,'Facilities person','Facilities Manager'),
    ('line','owner','account','broker_added',false,'Company main line','Company switchboard'),
    ('foreign-person','foreign','account','broker_added',false,'Private person','Private title');
    INSERT INTO prospect_contacts(id,user_id,prospect_id,source,is_primary,name,archived_at) VALUES
    ('archived','owner','account','broker_added',false,'Archived person',now());`)
  const broker=randomUUID(),archivedBroker=randomUUID()
  await db.query('INSERT INTO directory_brokers(id,user_id,name,firm,archived) VALUES($1,\'owner\',\'Known broker\',\'C&W\',false),($2,\'owner\',\'Archived broker\',\'C&W\',true)',[broker,archivedBroker])
  for(const [company,id] of [['former',broker],['connected',broker],['connected',archivedBroker]]) {
    await db.query('INSERT INTO directory_relationships(id,user_id,broker_id,prospect_id,status,scope,learned_on) VALUES($1,\'owner\',$2,$3,\'historical\',\'Past national assignment only\',current_date)',[randomUUID(),id,company])
  }
  const pool:any={query:(sql:string,values:unknown[])=>db.query(sql,values)}
  const before=(await db.query('SELECT (SELECT count(*) FROM activity_events) AS events,(SELECT count(*) FROM prospects) AS companies,(SELECT count(*) FROM prospect_contacts) AS people')).rows
  const home=await directoryHome(pool,'owner',[])
  assert.deepEqual(home.engaged.map(c=>c.id),['account','other-account'])
  assert.equal(home.engaged[0].activityType,'email_received')
  assert.deepEqual(home.engaged[0].contacts.map(c=>c.name),['Joe Owner','Facilities person'])
  assert.equal(home.engaged[0].brokers[0].status,'historical')
  assert.equal(home.engaged[0].brokers[0].scope,'Past national assignment only')
  assert.deepEqual(home.connected.map(c=>c.id),['connected'])
  assert.equal(home.connected[0].brokerCount,1)
  const reopened=await directoryHome(pool,'owner',['foreign-account','former','account','missing','cycle-a'])
  assert.deepEqual(reopened.recent.map(c=>c.id),['account'])
  assert.deepEqual(reopened.engaged.map(c=>c.id),['other-account'])
  assert.equal(JSON.stringify(reopened).includes('Private person'),false)
  assert.equal(JSON.stringify(reopened).includes('Archived person'),false)
  assert.equal(JSON.stringify(reopened).includes('Company main line'),false)
  const foreign=await directoryHome(pool,'foreign',['account'])
  assert.equal(foreign.recent.length,0)
  assert.deepEqual(foreign.suggested.map(c=>c.id),['foreign-account'])
  assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM activity_events) AS events,(SELECT count(*) FROM prospects) AS companies,(SELECT count(*) FROM prospect_contacts) AS people')).rows,before)
  assert.deepEqual(await directoryHome(pool,'nobody',[]),{recent:[],engaged:[],connected:[],suggested:[]})
})

test('overview rejects caller identity and oversized or malformed history',()=>{
  assert.deepEqual(DirectoryHomeQuery.parse({}),{recent:[]})
  for(const input of [{userId:'foreign'},{recent:'a/b'},{recent:Array(9).fill('account').join(',')},{recent:['a','b']}]) {
    assert.equal(DirectoryHomeQuery.safeParse(input).success,false)
  }
})
