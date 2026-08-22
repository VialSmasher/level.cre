import assert from 'node:assert/strict'
import test from 'node:test'

import { organizePursuits } from './pursuitLifecycle'

test('keeps worked, populated, and recently-created pursuits active', () => {
  const result = organizePursuits([
    { id: 'worked', createdAt: '2025-01-01', activityCount: 2, prospectCount: 0, lastActivityAt: '2026-08-20' },
    { id: 'populated', createdAt: '2025-01-01', activityCount: 0, prospectCount: 12 },
    { id: 'recent', createdAt: '2026-08-01', activityCount: 0, prospectCount: 0 },
    { id: 'dormant', createdAt: '2025-01-01', activityCount: 0, prospectCount: 0 },
  ], { now: new Date('2026-08-22T12:00:00Z'), recentDays: 90 })

  assert.deepEqual(result.active.map((item) => item.id), ['worked', 'populated', 'recent'])
  assert.deepEqual(result.dormant.map((item) => item.id), ['dormant'])
})

test('sorts active pursuits by latest work before prospect volume and creation date', () => {
  const result = organizePursuits([
    { id: 'older-work', activityCount: 4, prospectCount: 30, lastActivityAt: '2026-08-10' },
    { id: 'latest-work', activityCount: 1, prospectCount: 1, lastActivityAt: '2026-08-21' },
    { id: 'more-prospects', activityCount: 0, prospectCount: 12, createdAt: '2025-01-01' },
  ], { now: new Date('2026-08-22T12:00:00Z') })

  assert.deepEqual(result.active.map((item) => item.id), ['latest-work', 'older-work', 'more-prospects'])
})
