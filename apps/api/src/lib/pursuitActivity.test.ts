import assert from 'node:assert/strict';
import test from 'node:test';

import { filterPursuitActivity, summarizePursuitActivity } from './pursuitActivity';

test('pursuit activity inherits global CRM interactions for linked prospects', () => {
  const rows = filterPursuitActivity({
    listingId: 'listing-1',
    linkedProspectIds: ['prospect-1'],
    rows: [
      { listingId: null, prospectId: 'prospect-1', date: '2026-08-20' },
      { listingId: 'listing-1', prospectId: null, date: '2026-08-21' },
      { listingId: null, prospectId: 'prospect-2', date: '2026-08-22' },
    ],
  });

  assert.equal(rows.length, 2);
});

test('pursuit activity summaries expose count and latest activity', () => {
  const summary = summarizePursuitActivity([
    { date: '2026-08-18T15:00:00.000Z' },
    { date: '2026-08-21T16:30:00.000Z' },
    { date: null },
  ]);

  assert.deepEqual(summary, {
    activityCount: 3,
    lastActivityAt: '2026-08-21T16:30:00.000Z',
  });
});
