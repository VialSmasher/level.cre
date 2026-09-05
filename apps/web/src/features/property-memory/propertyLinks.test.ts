import test from 'node:test'
import assert from 'node:assert/strict'
import { groupPropertyRecords, getPropertyClassification } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'
import { composePropertyMapItems } from './composeMapItems'
import { composedPropertyFilterSource } from './assetMapModel'
import { getComposedPropertyProspectTypes } from '../map/prospectTypeFilters'

const broker={source:'broker',reviewedBy:'pat',reviewedAt:'2026-09-04T12:00:00.000Z'}
const building={id:'building',name:'11750 180 Street',status:'prospect',geometry:{type:'Point',coordinates:[-113.63,53.56]},aiMetadata:{propertyClassification:{...broker,classification:'single_tenant'}}} as Prospect
const occupant={id:'company',name:'Chemtrade',status:'contacted',contactName:'Henry',aiMetadata:{propertyLink:{...broker,relationship:'occupant',propertyProspectId:'building'},prospectTypes:['tenant_prospect']}} as Prospect
test('one building marker uses building classification while retaining occupant identity and filtering',()=>{
  const items=composePropertyMapItems([occupant,building],[])
  assert.equal(items.length,1);assert.equal(items[0].prospect,building)
  assert.equal(items[0].occupants?.[0],occupant)
  assert.equal(getPropertyClassification(composedPropertyFilterSource(items[0])),'single_tenant')
  assert.deepEqual(getComposedPropertyProspectTypes(items[0]),['tenant_prospect'])
})
test('unlinked, missing, malformed and cyclic records stay visible; no address guessing',()=>{
  assert.equal(composePropertyMapItems([occupant],[]).length,1)
  const unlinked={...occupant,aiMetadata:null,address:building.name}
  assert.equal(composePropertyMapItems([unlinked,building],[]).length,2)
  const cycle={...building,aiMetadata:{propertyLink:{...broker,relationship:'occupant',propertyProspectId:'company'}}}
  assert.equal(groupPropertyRecords([occupant,cycle]).roots.length,2)
  assert.equal(composePropertyMapItems([building,{...occupant,aiMetadata:{propertyLink:{propertyProspectId:'building'}}}],[]).length,2)
})
test('all occupants share the same building with no mutation of source records',()=>{
  const second={...occupant,id:'second'}
  const groups=groupPropertyRecords([building,occupant,second])
  assert.equal(groups.roots.length,1);assert.equal(groups.occupantsById.get(building.id)?.length,2)
  assert.equal(groups.rootById.get(second.id),building)
  assert.equal(occupant.contactName,'Henry')
})
