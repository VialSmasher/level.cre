import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScorecardMapCoverage, isOutboundScorecardActivity } from './scorecardMetrics';

test('scorecard production excludes inbound email and internal notes', () => {
  assert.equal(isOutboundScorecardActivity({ type: 'email', direction: 'outbound' }), true);
  assert.equal(isOutboundScorecardActivity({ type: 'email', direction: 'inbound' }), false);
  assert.equal(isOutboundScorecardActivity({ type: 'note', direction: 'internal' }), false);
});

test('scorecard map coverage uses current-week outbound production only', () => {
  const coverage = buildScorecardMapCoverage([
    { timestamp: '2026-08-17T16:00:00.000Z', type: 'email', direction: 'outbound', prospectId: 'prospect-1' },
    { timestamp: '2026-08-18T16:00:00.000Z', type: 'call', direction: 'outbound', prospectId: 'prospect-1' },
    { timestamp: '2026-08-19T16:00:00.000Z', type: 'meeting', direction: 'outbound' },
    { timestamp: '2026-08-20T16:00:00.000Z', type: 'email', direction: 'inbound', prospectId: 'prospect-2' },
    { timestamp: '2026-08-21T16:00:00.000Z', type: 'note', direction: 'internal', prospectId: 'prospect-3' },
    { timestamp: '2026-08-10T16:00:00.000Z', type: 'email', direction: 'outbound', prospectId: 'prospect-old' },
  ], {
    now: new Date('2026-08-22T18:00:00.000Z'),
    timeZone: 'America/Edmonton',
  });

  assert.deepEqual(coverage, {
    totalActions: 3,
    mappedActions: 2,
    unmappedActions: 1,
    mappedPercent: 67,
    uniqueProspects: 1,
  });
});
