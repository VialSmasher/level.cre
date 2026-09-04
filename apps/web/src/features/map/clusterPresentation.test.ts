import assert from 'node:assert/strict'
import test from 'node:test'
import { INVENTORY_CLASS_META } from '@level-cre/shared'
import { clusterPresentation } from './clusterPresentation'
import { UNCLASSIFIED_PROPERTY_META } from './propertyPresentation'

const multi = INVENTORY_CLASS_META.multi_tenant.color
const single = INVENTORY_CLASS_META.single_tenant.color
const unknown = UNCLASSIFIED_PROPERTY_META.color

test('homogeneous clusters retain their property color and name the type in the hover title', () => {
  for (const type of Object.values(INVENTORY_CLASS_META)) {
    const result = clusterPresentation([type.color, type.color.toLowerCase(), type.color])
    assert.equal(result.background, type.color)
    assert.equal(result.title, `3 properties: 3 ${type.label}`)
    assert.equal(result.segments[0].fraction, 1)
  }
})

test('mixed rings represent exact property proportions, including unclassified records', () => {
  const colors = [multi, single, multi, undefined, multi, unknown, single, multi]
  const result = clusterPresentation(colors)
  assert.deepEqual(result.segments.map(({ classification, count, fraction }) => ({ classification, count, fraction })), [
    { classification: 'multi_tenant', count: 4, fraction: 0.5 },
    { classification: 'single_tenant', count: 2, fraction: 0.25 },
    { classification: 'unknown', count: 2, fraction: 0.25 },
  ])
  assert.ok(result.background.startsWith('radial-gradient(circle closest-side, #0F172A'))
  assert.ok(result.background.includes(`conic-gradient(${multi} 0% 50%, ${single} 50% 75%, ${unknown} 75% 100%)`))
  assert.equal(result.title, '8 properties: 4 Multi-tenant, 2 Single-tenant, 2 Unclassified')
  assert.deepEqual(clusterPresentation([...colors].reverse()), result, 'Input ordering must not change ring positions')
})

test('missing and unsupported property colors remain grey rather than inventing a type', () => {
  const result = clusterPresentation([undefined, null, '', '#not-a-type', unknown])
  assert.equal(result.background, unknown)
  assert.equal(result.title, '5 properties: 5 Unclassified')
  assert.equal(result.segments[0].count, 5)
  assert.equal(clusterPresentation([]).background, unknown)
  assert.deepEqual(clusterPresentation([]).segments, [])
})
