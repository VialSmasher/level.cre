import assert from 'node:assert/strict';
import test from 'node:test';

import { filterPursuitActivity } from './pursuitActivity';

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
