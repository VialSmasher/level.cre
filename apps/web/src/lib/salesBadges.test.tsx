import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSalesBadgeSummary, SALES_BADGE_DEFINITIONS } from './salesBadges';

test('achievement diary contains 39 unique, data-backed milestones', () => {
  assert.equal(SALES_BADGE_DEFINITIONS.length, 39);
  assert.equal(new Set(SALES_BADGE_DEFINITIONS.map((badge) => badge.id)).size, 39);
  assert.ok(SALES_BADGE_DEFINITIONS.every((badge) => badge.threshold > 0));
  const tenXChallenges = SALES_BADGE_DEFINITIONS.filter((badge) => badge.series === '10x');
  assert.equal(tenXChallenges.length, 6);
  assert.ok(tenXChallenges.every((badge) => badge.tone === 'red'));
});

test('badges count canonical unmatched outbound activity and exclude inbound responses', () => {
  const rows = [
    {
      id: 'event-1',
      action: 'email_sent',
      timestamp: '2026-08-21T17:36:00.000Z',
      direction: 'outbound',
    },
    {
      id: 'import-2',
      action: 'email_sent',
      timestamp: '2026-08-21T19:32:00.000Z',
      direction: 'outbound',
    },
    {
      id: 'event-inbound',
      action: 'email_sent',
      timestamp: '2026-08-21T20:00:00.000Z',
      direction: 'inbound',
    },
  ];

  const summary = buildSalesBadgeSummary(rows, 'America/Edmonton');

  assert.equal(summary.bestDayCounts.email, 2);
  assert.equal(summary.trackedCounts.email, 2);
  assert.equal(summary.trackedCounts.touch, 2);
});

test('badges accept canonical activity types when no legacy XP action is present', () => {
  const summary = buildSalesBadgeSummary([{
    id: 'interaction-1',
    type: 'call',
    timestamp: '2026-08-21T20:00:00.000Z',
    direction: 'outbound',
  }], 'America/Edmonton');

  assert.equal(summary.bestDayCounts.call, 1);
});

test('new daily and tracked badge tiers unlock from activity history', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: `call-${index}`,
    type: 'call',
    timestamp: `2026-08-21T${String(16 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 10).padStart(2, '0')}:00.000Z`,
    direction: 'outbound',
  }));

  const summary = buildSalesBadgeSummary(rows, 'America/Edmonton');
  const byId = new Map(summary.badges.map((badge) => [badge.id, badge]));

  assert.equal(byId.get('daily_10_calls')?.unlocked, true);
  assert.equal(byId.get('daily_15_calls')?.unlocked, false);
  assert.equal(byId.get('daily_10_touches')?.unlocked, true);
  assert.equal(byId.get('tracked_50_calls')?.unlocked, false);
});

test('10X daily challenges unlock only at their extreme thresholds', () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: `tenx-call-${index}`,
    type: 'call',
    timestamp: '2026-08-21T18:00:00.000Z',
    direction: 'outbound',
  }));

  const summary = buildSalesBadgeSummary(rows, 'America/Edmonton');
  const byId = new Map(summary.badges.map((badge) => [badge.id, badge]));

  assert.equal(byId.get('tenx_daily_100_calls')?.unlocked, true);
  assert.equal(byId.get('tenx_daily_100_touches')?.unlocked, true);
  assert.equal(byId.get('tenx_tracked_1000_calls')?.unlocked, false);
});
