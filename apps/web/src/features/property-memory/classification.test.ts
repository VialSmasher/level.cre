import assert from 'node:assert/strict'
import test from 'node:test'
import type { MarketMemoryAnchor } from '@level-cre/shared'
import { applyMemoryClassification, memoryClassificationTarget, memoryClassificationUrl, readMemoryClassificationResponse } from './classification'

const correction = {classification:'single_tenant' as const, source:'broker' as const, reviewedAt:'2026-09-04T12:00:00Z', reviewedBy:'user'}
const memory = (persistence:MarketMemoryAnchor['persistence']) => ({id:'anchor', persistence, legalIdentities:[{titleNumber:'001234'}]} as MarketMemoryAnchor)

test('pending suggestions classify the research item; approved links use the CRM path', () => {
  const pending = memory({state:'pending', importItemId:'item-1', dossierId:'possible-dossier', linkedProspectId:'possible-prospect'})
  assert.deepEqual(memoryClassificationTarget(pending), {kind:'memory_item', id:'item-1'})
  assert.equal(memoryClassificationUrl(memoryClassificationTarget(pending)!), '/api/intel/brokerage-memory/items/item-1/classification')
  assert.equal(memoryClassificationTarget(memory({state:'approved', dossierId:'d1', linkedProspectId:'p1'})), null)
  assert.deepEqual(memoryClassificationTarget(memory({state:'approved', dossierId:'d1'})), {kind:'dossier', id:'d1'})
  assert.equal(memoryClassificationTarget(memory({state:'local_preview'})), null)
})

test('classification response must identify the exact saved asset and contain valid metadata', () => {
  const target = {kind:'memory_item' as const, id:'item-1'}
  assert.deepEqual(readMemoryClassificationResponse({target, propertyClassification:correction}, target), correction)
  assert.equal(readMemoryClassificationResponse({target, propertyClassification:null}, target), null)
  assert.throws(() => readMemoryClassificationResponse({target:{...target,id:'item-2'}, propertyClassification:correction}, target))
  assert.throws(() => readMemoryClassificationResponse({target, propertyClassification:{...correction,classification:'warehouse'}}, target))
  assert.throws(() => readMemoryClassificationResponse({target}, target))
})

test('late save updates only its target and never changes source evidence or review status', () => {
  const first = memory({state:'pending', importItemId:'item-1'})
  const other = memory({state:'pending', importItemId:'item-2'})
  const target = {kind:'memory_item' as const, id:'item-1'}
  const saved = applyMemoryClassification(first, target, correction)
  assert.equal(applyMemoryClassification(other, target, correction), other)
  assert.equal(saved.persistence, first.persistence)
  assert.equal(saved.legalIdentities, first.legalIdentities)
  assert.deepEqual(saved.propertyClassification, correction)
  assert.equal(applyMemoryClassification(saved, target, null).propertyClassification, null)
})
