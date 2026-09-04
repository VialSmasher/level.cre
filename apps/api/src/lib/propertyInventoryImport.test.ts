import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import type { PropertyInventoryRecord } from '@level-cre/shared'
import { importPropertyInventory, matchInventoryRecord } from './propertyInventoryImport'

function fixture(address='100 1 ST', title='00123'): PropertyInventoryRecord {
 return {latitude:53.33,longitude:-113.52,inventory:{version:1,datasetId:'test-inventory',name:address,address,municipality:'Nisku',businessPark:'Nisku Industrial Park',classification:'multi_tenant',confidence:'low',subFilters:['costar_partial'],occupant:null,ownerOccGuess:null,covenantStrength:null,zoning:null,assessment:null,yearBuilt:null,yearBuiltText:null,titleRecords:[{titleNumber:title,legal:'1;2;3',lastSaleDate:'2000-01-01',sourceRow:2}],notes:'Source research',costar:{propertyId:null,owner:null,contacts:null,buildingSf:10000,buildingSfText:'10,000 SF - grid only',notes:'PARTIAL'},source:{file:'test.xlsx',sheet:'Import',sha256:'a'.repeat(64),reviewedOn:'2026-09-04'}}}
}
test('inventory dry run, exact replay, metadata preservation and rollback use real PostgreSQL transactions',async()=>{
 const pg=new PGlite()
 try{
  await pg.exec(`CREATE TABLE users(id text PRIMARY KEY);INSERT INTO users VALUES('owner'),('other');
   CREATE TABLE submarkets(id text,name text,user_id text);INSERT INTO submarkets VALUES('nisku','Nisku','owner');
   CREATE TABLE prospects(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text REFERENCES users(id),name text,address text,status text,notes text,geometry jsonb,submarket_id text,building_sf integer,ai_metadata jsonb,location_lat double precision,location_lng double precision,market_key text,market_context_source text,market_context_status text,merged_into_prospect_id text,updated_at timestamp DEFAULT now());
   CREATE FUNCTION st_geomfromgeojson(text) RETURNS jsonb LANGUAGE SQL AS 'SELECT $1::jsonb';CREATE FUNCTION st_setsrid(jsonb,integer) RETURNS jsonb LANGUAGE SQL AS 'SELECT $1';`)
  // PGlite has a single connection; production advisory locking is not simulated as a concurrency proof.
  const pool={connect:async()=>({query:async(sql:string,params?:unknown[])=>{
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]}
    return pg.query(sql,params)
  },release(){}})} as unknown as Pick<Pool,'connect'>
  const rows=[fixture(),fixture('102 1 ST','00456')]
  assert.equal((await importPropertyInventory(pool,'owner',rows)).created,2)
  assert.equal((await pg.query('SELECT * FROM prospects')).rows.length,0)
  const first=await importPropertyInventory(pool,'owner',rows,true)
  assert.equal(first.created,2)
  assert.equal((await importPropertyInventory(pool,'owner',rows,true)).unchanged,2)
  assert.equal((await pg.query('SELECT * FROM prospects')).rows.length,2)
  const id=first.results[0].id
  await pg.query("UPDATE prospects SET status='listing',notes='Broker note',ai_metadata=ai_metadata || '{\"keep\":true}'::jsonb WHERE id=$1",[id])
  const changed=structuredClone(rows);changed[0].inventory.subFilters.push('vacant')
  assert.equal((await importPropertyInventory(pool,'owner',changed,true)).updated,1)
  const saved=(await pg.query<any>('SELECT * FROM prospects WHERE id=$1',[id])).rows[0]
  assert.equal(saved.status,'listing');assert.equal(saved.notes,'Broker note');assert.equal(saved.ai_metadata.keep,true)
  assert.equal(saved.building_sf,null,'Partial area is retained as source evidence, not copied to the main size field')
  assert.deepEqual(saved.geometry.coordinates,[-113.52,53.33])
  assert.equal(saved.submarket_id,'nisku')
  assert.equal(saved.ai_metadata.propertyInventory.titleRecords[0].titleNumber,'00123')
  assert.equal((await importPropertyInventory(pool,'other',rows,true)).created,2,'Matching is owner-scoped')
  await assert.rejects(importPropertyInventory(pool,'owner',[rows[0],rows[0]],true),/Combine repeated/)
  await pg.query("INSERT INTO prospects(user_id,name,address,status,location_lat,location_lng) VALUES('owner','Duplicate','102 1 Street, Nisku, AB','prospect',53.33,-113.52)")
  changed[0].inventory.notes='Must roll back'
  await assert.rejects(importPropertyInventory(pool,'owner',changed,true),/Multiple existing/)
  assert.equal((await pg.query<any>('SELECT ai_metadata FROM prospects WHERE id=$1',[id])).rows[0].ai_metadata.propertyInventory.notes,'Source research')
 }finally{await pg.close()}
})
test('title fallback works without trusting unnamed nearby points',()=>{
 const row={id:'one',name:'New marker',address:null,status:'prospect',notes:null,ai_metadata:null,location_lat:53.33,location_lng:-113.52}
 assert.equal(matchInventoryRecord(fixture(),[row]),undefined)
 const titled={...row,ai_metadata:{titleNumber:'00123'}}
 assert.equal(matchInventoryRecord(fixture(),[titled])?.id,'one')
 const otherCity={...row,name:'100 1 Street',address:'100 1 Street, Edmonton, AB',location_lat:53.55,location_lng:-113.5}
 assert.equal(matchInventoryRecord(fixture(),[otherCity]),undefined)
})
