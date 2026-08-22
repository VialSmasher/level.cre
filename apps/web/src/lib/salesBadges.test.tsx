import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSalesBadgeSummary } from './salesBadges';

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
