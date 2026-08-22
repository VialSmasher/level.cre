import test from 'node:test'
import assert from 'node:assert/strict'

import { buildActivityPulse } from './activityPulse'

test('buildActivityPulse creates a user-friendly 28-day activity series and streak', () => {
  const pulse = buildActivityPulse([
    { date: '2026-07-10T16:00:00.000Z', type: 'email', sourceProvider: 'codex' },
    { date: '2026-07-10T17:00:00.000Z', type: 'phone_call', sourceProvider: 'manual' },
    { date: '2026-07-09T18:00:00.000Z', type: 'tour', sourceProvider: 'outlook' },
    { date: '2026-07-08T19:00:00.000Z', type: 'note' },
  ], {
    days: 28,
    now: new Date('2026-07-10T18:00:00.000Z'),
    timeZone: 'America/Edmonton',
  })

  assert.equal(pulse.series.length, 28)
  assert.equal(pulse.total, 3)
  assert.equal(pulse.activeDays, 2)
  assert.equal(pulse.streakDays, 2)
  assert.equal(pulse.automated, 2)
  assert.equal(pulse.manual, 1)
  assert.equal(pulse.series.at(-1)?.email, 1)
  assert.equal(pulse.series.at(-1)?.call, 1)
  assert.equal(pulse.series.at(-2)?.meeting, 1)
})

test('buildActivityPulse respects Edmonton day boundaries and ignores invalid activity dates', () => {
  const pulse = buildActivityPulse([
    { date: '2026-07-11T05:30:00.000Z', type: 'email', sourceProvider: 'postmark' },
    { date: 'not-a-date', type: 'call' },
  ], {
    days: 14,
    now: new Date('2026-07-11T06:30:00.000Z'),
    timeZone: 'America/Edmonton',
  })

  assert.equal(pulse.total, 1)
  assert.equal(pulse.series.at(-2)?.date, '2026-07-10')
  assert.equal(pulse.series.at(-1)?.date, '2026-07-11')
  assert.equal(pulse.series.at(-2)?.email, 1)
})

test('buildActivityPulse compares the current half of the window with the prior half', () => {
  const pulse = buildActivityPulse([
    { date: '2026-07-10T18:00:00.000Z', type: 'call' },
    { date: '2026-07-09T18:00:00.000Z', type: 'call' },
    { date: '2026-06-26T18:00:00.000Z', type: 'email' },
  ], {
    days: 28,
    now: new Date('2026-07-10T18:00:00.000Z'),
    timeZone: 'America/Edmonton',
  })

  assert.equal(pulse.currentPeriodTotal, 2)
  assert.equal(pulse.previousPeriodTotal, 1)
  assert.equal(pulse.trendPercent, 100)
})

test('keeps received email as an outcome signal instead of production credit', () => {
  const pulse = buildActivityPulse([
    {
      date: '2026-07-10T16:00:00.000Z',
      type: 'email',
      sourceProvider: 'outlook',
      sourceMetadata: { captureDirection: 'received' },
    },
    {
      date: '2026-07-10T17:00:00.000Z',
      type: 'email',
      sourceProvider: 'outlook',
      sourceMetadata: { captureDirection: 'sent' },
    },
  ], {
    days: 14,
    now: new Date('2026-07-10T18:00:00.000Z'),
    timeZone: 'America/Edmonton',
  })

  assert.equal(pulse.total, 1)
  assert.equal(pulse.inboundEmail, 1)
  assert.equal(pulse.activeDays, 1)
  assert.equal(pulse.automated, 1)
  assert.equal(pulse.series.at(-1)?.email, 1)
  assert.equal(pulse.series.at(-1)?.inboundEmail, 1)
  assert.equal(pulse.series.at(-1)?.total, 1)
})

test('excludes internal notes and non-production activity from outbound totals', () => {
  const pulse = buildActivityPulse([
    {
      date: '2026-07-10T16:00:00.000Z',
      type: 'note',
      direction: 'internal',
      sourceProvider: 'codex',
    },
    {
      date: '2026-07-10T17:00:00.000Z',
      type: 'email',
      direction: 'outbound',
      sourceProvider: 'codex',
    },
  ], {
    days: 14,
    now: new Date('2026-07-10T18:00:00.000Z'),
    timeZone: 'America/Edmonton',
  })

  assert.equal(pulse.total, 1)
  assert.equal(pulse.series.at(-1)?.email, 1)
  assert.equal(pulse.series.at(-1)?.other, 0)
})
