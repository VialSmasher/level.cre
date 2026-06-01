import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrokerActivityPayload } from './brokerActions';

test('buildBrokerActivityPayload maps a quick call to the broker action API shape', () => {
  const payload = buildBrokerActivityPayload({
    prospect: { id: 'prospect-1' },
    type: 'call',
    notes: 'Phone call follow-up',
    nextFollowUp: '2026-06-15T12:00:00.000Z',
  });

  assert.deepEqual(payload, {
    prospectId: 'prospect-1',
    listingId: undefined,
    date: undefined,
    type: 'call',
    outcome: 'contacted',
    notes: 'Phone call follow-up',
    nextFollowUp: '2026-06-15T12:00:00.000Z',
  });
});

test('buildBrokerActivityPayload defaults meeting outcome to scheduled meeting', () => {
  const payload = buildBrokerActivityPayload({
    prospect: { id: 'prospect-2' },
    type: 'meeting',
  });

  assert.equal(payload.outcome, 'scheduled_meeting');
  assert.equal(payload.notes, '');
});
