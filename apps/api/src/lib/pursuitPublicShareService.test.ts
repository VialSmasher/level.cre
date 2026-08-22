import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicPursuitSnapshot,
  createPursuitShareToken,
  isValidPursuitShareToken,
} from './pursuitPublicShareService';

test('pursuit share tokens are high-entropy URL-safe values', () => {
  const token = createPursuitShareToken();
  assert.equal(isValidPursuitShareToken(token), true);
  assert.notEqual(token, createPursuitShareToken());
  assert.equal(isValidPursuitShareToken('short'), false);
});

test('public pursuit snapshots expose activity without private CRM details', () => {
  const snapshot = buildPublicPursuitSnapshot({
    listing: {
      title: '2959 Parsons Road',
      address: '2959 Parsons Road NW',
      owner_first_name: 'Patrick',
      owner_last_name: 'Livingston',
    },
    prospects: [{
      id: 'prospect-1',
      business_name: 'Example Industrial',
      address: '123 Industrial Way',
      status: 'contacted',
      location_lat: 53.5,
      location_lng: -113.4,
      contact_email: 'private@example.com',
      notes: 'private prospect note',
    } as any],
    interactions: [{
      id: 'activity-1',
      prospect_id: 'prospect-1',
      date: '2026-08-21T16:30:00.000Z',
      type: 'email',
      outcome: 'contacted',
      notes: 'private email body',
      next_follow_up: '2026-09-01',
    } as any],
    generatedAt: '2026-08-22T18:00:00.000Z',
  });

  assert.equal(snapshot.summary.prospectCount, 1);
  assert.equal(snapshot.summary.activityCount, 1);
  assert.equal(snapshot.prospects[0].activityCount, 1);
  assert.equal(snapshot.activities[0].type, 'email');
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /private@example\.com|private prospect note|private email body|next_follow_up/);
});
