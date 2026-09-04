import assert from 'node:assert/strict'
import test from 'node:test'
import { isTelemetryQuery, telemetryKeys } from './telemetryQueries'
import { polygonIntersectsViewport } from '../features/map/viewportClustering'
test('change invalidation matches parameterized legacy queries and scoped new keys', () => {
  assert.equal(isTelemetryQuery(['/api/activity-events?limit=50&matchStatus=needs_review']), true)
  assert.equal(isTelemetryQuery(telemetryKeys.insights('u1')), true)
  assert.equal(isTelemetryQuery(['/api/stats/header']), true)
  assert.equal(isTelemetryQuery(['/api/prospects-unrelated']), false)
  assert.equal(isTelemetryQuery(['property-memory', 'u1']), true)
})
test('covering and crossing polygons remain visible with no vertex in the viewport', () => {
  const bounds = { north: 2, south: 1, east: 2, west: 1 }
  assert.equal(polygonIntersectsViewport([{lat:0,lng:0},{lat:0,lng:3},{lat:3,lng:3},{lat:3,lng:0}], bounds), true)
  assert.equal(polygonIntersectsViewport([{lat:1.4,lng:0},{lat:1.4,lng:3},{lat:1.6,lng:3},{lat:1.6,lng:0}], bounds), true)
  assert.equal(polygonIntersectsViewport([{lat:3,lng:3},{lat:3,lng:4},{lat:4,lng:4}], bounds), false)
})
