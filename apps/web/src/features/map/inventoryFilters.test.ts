import assert from 'node:assert/strict'
import test from 'node:test'
import { inventoryAddressKey, type PropertyInventory } from '@level-cre/shared'
import { defaultInventoryFilters, inventorySignals, matchesInventoryFilters, matchesPropertyFilters, readInventoryFilters, inventoryMapExtent } from './inventoryFilters'
const inventory={classification:'multi_tenant',confidence:'low',subFilters:['owner_occupied','costar_partial'],occupant:'Recorded operator',businessPark:'Nisku Industrial Park',assessment:null,yearBuilt:null,costar:{propertyId:null,notes:'Partial research'},titleRecords:[{lastSaleDate:'2000-01-01'}]} as PropertyInventory
test('all confidence levels remain visible until explicitly filtered',()=>{
 const filters=defaultInventoryFilters();assert.equal(matchesInventoryFilters(inventory,filters),true)
 filters.confidence=['high','med'];assert.equal(matchesInventoryFilters(inventory,filters),false)
 assert.equal(matchesInventoryFilters(null,filters),false)
 filters.confidence.push('unrated');assert.equal(matchesInventoryFilters(null,filters),true)
 filters.includeOther=false;assert.equal(matchesInventoryFilters(null,filters),false)
})

test('including unclassified assets never bypasses confidence or source signal filters',()=>{
 const filters=defaultInventoryFilters()
 assert.equal(matchesPropertyFilters({},filters),true)
 assert.equal(matchesPropertyFilters({},{...filters,confidence:['high']}),false)
 assert.equal(matchesPropertyFilters({},{...filters,tags:['long_hold']}),false)
 assert.equal(matchesPropertyFilters({researchConfidence:'high',researchSignals:['long_hold']},{...filters,confidence:['high'],tags:['long_hold']}),true)
 assert.equal(matchesPropertyFilters({researchConfidence:'high',researchSignals:['long_hold']},{...filters,includeOther:false}),false)
})
test('priority isolates multi-tenant and supports any signal per group, all groups together',()=>{
 const filters={...defaultInventoryFilters(),includeOther:false,classes:['multi_tenant'],tags:['owner_occupied','vacant','costar_partial']}
 assert.equal(matchesInventoryFilters(inventory,filters),true)
 filters.tags.push('on_market');assert.equal(matchesInventoryFilters(inventory,filters),false)
 assert.equal(matchesInventoryFilters({...inventory,classification:'single_tenant'},defaultInventoryFilters()),true)
})
test('data completeness and long hold do not fabricate missing source facts',()=>{
 const signals=inventorySignals(inventory,new Date('2026-09-04T12:00:00Z'))
 for(const key of ['has_occupant','has_costar','missing_assessment','missing_year_built','long_hold','nisku_park'])assert.equal(signals.has(key),true)
 assert.equal(inventorySignals({...inventory,titleRecords:[{lastSaleDate:'2020-01-01'}] as any}).has('long_hold'),false)
 assert.equal(readInventoryFilters({classes:['multi_tenant','invented'],tags:['invented']}).classes.length,1)
})
test('address identity handles punctuation and ordinals while keeping unit distinctions',()=>{
 assert.equal(inventoryAddressKey('511 12th Avenue, Nisku, AB','Nisku'),inventoryAddressKey('511 12 AVE (GI)','Nisku'))
 assert.notEqual(inventoryAddressKey('2106A 7 ST','Nisku'),inventoryAddressKey('2106 7 ST','Nisku'))
 assert.notEqual(inventoryAddressKey('BAY 1-4, 703 11 AVE','Nisku'),inventoryAddressKey('703 11 AVE','Nisku'))
 assert.equal(inventoryAddressKey('','Nisku'),'')
})
test('fitting one asset keeps surrounding property context and retains a wider collection extent',()=>{
 const one=inventoryMapExtent([{lat:53.33,lng:-113.52}])!
 assert.ok(one.north-one.south>=.0029);assert.ok(one.east-one.west>=.0049)
 assert.deepEqual(inventoryMapExtent([{lat:53,lng:-114},{lat:54,lng:-113}]),{north:54,south:53,east:-113,west:-114})
 assert.equal(inventoryMapExtent([]),null)
})
