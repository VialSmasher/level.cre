import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { savePropertyLink, PropertyLinkError, PropertyLinkInputSchema } from './propertyLinkService'

async function setup() {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE prospects(id text PRIMARY KEY,user_id text,ai_metadata jsonb,merged_into_prospect_id text,updated_at timestamptz,contact_email text,notes text);
    CREATE TABLE listings(id text PRIMARY KEY,user_id text);
    CREATE TABLE listing_members(listing_id text,user_id text,role text);
    CREATE TABLE listing_prospects(listing_id text,prospect_id text);
    INSERT INTO prospects VALUES ('occupant','pat','{"source":"keep"}',null,now(),'person@example.test','Existing notes'),('building','other',null,null,now(),null,null),('private','other',null,null,now(),null,null),('second','pat',null,null,now(),null,null);
    INSERT INTO listings VALUES ('shared','other');
    INSERT INTO listing_members VALUES ('shared','pat','editor');
    INSERT INTO listing_prospects VALUES ('shared','building');`)
  const query = (sql:string, args?:unknown[]) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({rows:[]}) : pg.query(sql,args)
  const pool = {connect:async () => ({query,release(){}})} as unknown as Pool
  const save = (occupantId='occupant',propertyProspectId:string|null='building',expectedPropertyProspectId:string|null=null) => savePropertyLink({pool,userId:'pat',occupantId,propertyProspectId,expectedPropertyProspectId})
  return {pg,save}
}
test('shared editable building link preserves contact, notes, classification and evidence; retry and unlink are safe', async () => {
  const {pg,save}=await setup();try {
    const original=(await pg.query<any>('SELECT * FROM prospects WHERE id=\'occupant\'')).rows[0]
    const saved=await save();assert.equal(saved.aiMetadata.propertyLink.propertyProspectId,'building')
    assert.equal(saved.aiMetadata.source,'keep')
    assert.equal((await save()).unchanged,true)
    const row=(await pg.query<any>('SELECT * FROM prospects WHERE id=\'occupant\'')).rows[0]
    assert.equal(row.contact_email,original.contact_email);assert.equal(row.notes,original.notes)
    await assert.rejects(save('occupant','second',null),e=>e instanceof PropertyLinkError && e.status===409)
    const unlinked=await save('occupant',null,'building');assert.equal(unlinked.aiMetadata.propertyLink,undefined)
    assert.equal(unlinked.aiMetadata.propertyLinkHistory.length,2)
  } finally {await pg.close()}
})
test('private, viewer-only, self, nested and merged targets cannot be linked', async () => {
  const {pg,save}=await setup();try {
    await assert.rejects(save('occupant','private'),e=>e instanceof PropertyLinkError && e.status===404)
    await assert.rejects(save('occupant','occupant'),e=>e instanceof PropertyLinkError && e.status===400)
    await pg.exec("UPDATE listing_members SET role='viewer'")
    await assert.rejects(save(),e=>e instanceof PropertyLinkError && e.status===404)
    await pg.exec("UPDATE listing_members SET role='editor'")
    await save()
    await assert.rejects(save('building','occupant'),e=>e instanceof PropertyLinkError && e.status===409)
    await assert.rejects(save('second','occupant'),e=>e instanceof PropertyLinkError && e.status===409)
    await assert.rejects(save('building','second'),e=>e instanceof PropertyLinkError && e.status===409)
    await pg.exec("UPDATE prospects SET merged_into_prospect_id='private' WHERE id='second'")
    await assert.rejects(save('occupant','second','building'),e=>e instanceof PropertyLinkError && e.status===404)
  } finally {await pg.close()}
})
test('link input rejects extra fields and requires an explicit expected association',()=>{
  assert.equal(PropertyLinkInputSchema.safeParse({propertyProspectId:'building'}).success,false)
  assert.equal(PropertyLinkInputSchema.safeParse({propertyProspectId:'building',expectedPropertyProspectId:null,status:'contacted'}).success,false)
})

