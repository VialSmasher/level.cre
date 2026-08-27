import assert from 'node:assert/strict'
import test from 'node:test'

import { buildActivityFootprint, getActivityProspectPosition } from './activityFootprintModel'

test('activity footprint keeps confirmed outbound production and honors the playhead', () => {
  const activities = [
    { id: 'call-1', timestamp: '2026-08-25T18:00:00Z', type: 'call', direction: 'outbound', prospectId: 'p1' },
    { id: 'email-1', timestamp: '2026-08-26T18:00:00Z', type: 'email', direction: 'outbound', prospectId: 'p1' },
    { id: 'reply-1', timestamp: '2026-08-26T19:00:00Z', type: 'email', direction: 'inbound', prospectId: 'p1' },
    { id: 'note-1', timestamp: '2026-08-26T20:00:00Z', type: 'note', direction: 'internal', prospectId: 'p1' },
  ]
  const prospects = [{ id: 'p1', name: 'West End', locationLat: 53.55, locationLng: -113.6 }]

  const throughTuesday = buildActivityFootprint(activities, prospects, {
    days: 3,
    now: new Date('2026-08-27T18:00:00Z'),
    throughIndex: 0,
  })
  assert.equal(throughTuesday.actions, 1)
  assert.equal(throughTuesday.markers[0].counts.call, 1)

  const fullPeriod = buildActivityFootprint(activities, prospects, {
    days: 3,
    now: new Date('2026-08-27T18:00:00Z'),
  })
  assert.equal(fullPeriod.actions, 2)
  assert.equal(fullPeriod.mappedActions, 2)
  assert.equal(fullPeriod.uniqueProspects, 1)
  assert.equal(fullPeriod.days.reduce((total, day) => total + day.total, 0), 2)
})

test('activity footprint reports linked events without usable geometry as unmapped', () => {
  const result = buildActivityFootprint([
    { id: 'call-1', timestamp: '2026-08-27T18:00:00Z', type: 'call', prospectId: 'p1' },
    { id: 'call-2', timestamp: '2026-08-27T19:00:00Z', type: 'call', prospectId: 'missing' },
  ], [{ id: 'p1', name: 'No coordinates' }], {
    days: 1,
    now: new Date('2026-08-27T20:00:00Z'),
  })

  assert.equal(result.actions, 2)
  assert.equal(result.mappedActions, 0)
  assert.equal(result.unmappedActions, 2)
  assert.equal(result.mappedPercent, 0)
})

test('polygon prospects use their coordinate centroid', () => {
  const position = getActivityProspectPosition({
    id: 'poly',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-113.6, 53.5], [-113.4, 53.5], [-113.4, 53.7], [-113.6, 53.7]]],
    },
  })

  assert.ok(position)
  assert.ok(Math.abs(position.lat - 53.6) < 0.000001)
  assert.ok(Math.abs(position.lng - -113.5) < 0.000001)
})

test('activity kind filters affect footprint totals without changing the period histogram', () => {
  const activities = [
    { id: 'call-1', timestamp: '2026-08-27T18:00:00Z', type: 'call', prospectId: 'p1' },
    { id: 'email-1', timestamp: '2026-08-27T19:00:00Z', type: 'email', prospectId: 'p1' },
  ]
  const result = buildActivityFootprint(activities, [{ id: 'p1', locationLat: 53.5, locationLng: -113.5 }], {
    days: 1,
    now: new Date('2026-08-27T20:00:00Z'),
    kind: 'call',
  })

  assert.equal(result.actions, 1)
  assert.equal(result.markers[0].counts.call, 1)
  assert.equal(result.days[0].total, 2)
})
