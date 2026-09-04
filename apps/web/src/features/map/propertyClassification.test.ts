import assert from 'node:assert/strict'
import test from 'node:test'
import { getPropertyClassification, registrationHistory, PropertyClassificationValue } from '@level-cre/shared'
import { propertyPresentation } from './propertyPresentation'
import { defaultInventoryFilters, matchesPropertyFilters } from './inventoryFilters'
import type { Prospect } from '@level-cre/shared/schema'
import { mergeProspectClassification, ProspectClassificationResponseGuard } from './prospectSaveResponses'

const manual = (classification: string) => ({aiMetadata:{propertyClassification:{classification,source:'broker',reviewedAt:'2026-09-04T12:00:00Z',reviewedBy:'broker'}}})
test('existing assets can be classified, filtered, and rendered without inventing title evidence', () => {
  const prospect = manual('single_tenant')
  assert.equal(getPropertyClassification(prospect), 'single_tenant')
  assert.equal(propertyPresentation(prospect).marker, 'S')
  assert.equal(matchesPropertyFilters(prospect, {...defaultInventoryFilters(), includeOther:false}), true)
  assert.equal(matchesPropertyFilters(prospect, {...defaultInventoryFilters(), classes:['multi_tenant']}), false)
  assert.equal(matchesPropertyFilters(prospect, {...defaultInventoryFilters(), tags:['long_hold']}), false)
  assert.equal(getPropertyClassification(manual('invented')), 'unknown')
  assert.equal(PropertyClassificationValue.safeParse('client').success, false)
})
test('latest registration controls tenure and the 15-year boundary is date-aware', () => {
  const now = new Date('2026-09-04T12:00:00Z')
  assert.equal(registrationHistory(['1999-05-25'],now)?.years,27)
  assert.equal(registrationHistory(['1999-05-25','2020-01-01'],now)?.longHeld,false)
  assert.equal(registrationHistory(['2011-09-04'],now)?.longHeld,true)
  assert.equal(registrationHistory(['2011-09-05'],now)?.longHeld,false)
  for(const dates of [[],['bad'],['2026-02-30'],['9999-99-99'],['2027-01-01']]) assert.equal(registrationHistory(dates,now),null)
})

test('a delayed field response cannot revert a classification acknowledged during that request', async () => {
  const guard = new ProspectClassificationResponseGuard()
  const started = guard.capture('asset-a')
  let release!: (value: Prospect) => void
  const response = new Promise<Prospect>(resolve => {release=resolve})
  const pending = response.then(saved => guard.reconcile(saved,started))
  guard.record({id:'asset-a',aiMetadata:manual('single_tenant').aiMetadata})
  release({id:'asset-a',notes:'Saved note',aiMetadata:{sourceReceipt:'newly imported evidence'}} as Prospect)
  const saved = await pending
  assert.equal(getPropertyClassification(saved),'single_tenant')
  assert.equal(saved.notes,'Saved note')
  assert.equal((saved.aiMetadata as any).sourceReceipt,'newly imported evidence')
})

test('a concurrent reset remains cleared and unrelated assets and later server responses remain authoritative', () => {
  const guard = new ProspectClassificationResponseGuard()
  guard.record({id:'asset-a',aiMetadata:manual('single_tenant').aiMetadata})
  const started=guard.capture('asset-a')
  guard.record({id:'asset-a',aiMetadata:{}})
  const stale={id:'asset-a',aiMetadata:{...manual('single_tenant').aiMetadata,sourceReceipt:'keep'}} as Prospect
  const reset=guard.reconcile(stale,started)
  assert.equal(getPropertyClassification(reset),'unknown')
  assert.equal(Object.hasOwn(reset.aiMetadata || {},'propertyClassification'),false)
  assert.equal((reset.aiMetadata as any).sourceReceipt,'keep')
  const other={...stale,id:'asset-b'}
  assert.equal(guard.reconcile(other,0),other)
  assert.equal(guard.reconcile(stale,guard.capture('asset-a')),stale)
})

test('classification-only responses preserve newer source metadata and unsaved fields on the current profile', () => {
  const current={id:'asset-a',notes:'Still typing',aiMetadata:{sourceReceipt:'latest',propertyInventory:{titleNumber:'001234'}}} as Prospect
  const saved={id:'asset-a',aiMetadata:{...manual('single_tenant').aiMetadata,sourceReceipt:'old'}}
  const merged=mergeProspectClassification(current,saved)
  assert.equal(merged.notes,'Still typing')
  assert.equal((merged.aiMetadata as any).sourceReceipt,'latest')
  assert.equal((merged.aiMetadata as any).propertyInventory,current.aiMetadata?.propertyInventory)
  assert.equal(getPropertyClassification(merged),'single_tenant')
  assert.equal(mergeProspectClassification(current,{...saved,id:'asset-b'}),current)
})
