import assert from 'node:assert/strict'
import test from 'node:test'
import { getPropertyClassification, registrationHistory, PropertyClassificationValue } from '@level-cre/shared'
import { propertyPresentation } from './propertyPresentation'
import { defaultInventoryFilters, matchesPropertyFilters } from './inventoryFilters'

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
