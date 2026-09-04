import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultStatusFilterSet, readRelationshipFilters } from './statusFilters'
import { propertyPresentation, UNCLASSIFIED_PROPERTY_META } from './propertyPresentation'

test('new and migrated filters retain clients and hide No Go without erasing other selections', () => {
  assert.deepEqual([...createDefaultStatusFilterSet()].sort(), ['client','contacted','development','listing','prospect'])
  assert.deepEqual([...readRelationshipFilters(null, ['client', 'no_go'])], ['client'])
  assert.deepEqual([...readRelationshipFilters(null, [])], [])
})
test('explicit No Go opt-in survives persistence; invalid statuses are ignored', () => {
  assert.deepEqual([...readRelationshipFilters(['no_go','client','bogus'], ['prospect'])], ['no_go','client'])
  assert.deepEqual([...readRelationshipFilters([])], [])
})
test('missing or malformed property classification is gray rather than an inferred relationship color', () => {
  for (const aiMetadata of [null, {}, {propertyInventory:{classification:'multi_tenant'}}]) {
    assert.deepEqual(propertyPresentation({aiMetadata}), UNCLASSIFIED_PROPERTY_META)
  }
})
