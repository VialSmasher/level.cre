import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrokerActivityPayload, hasContactCoverage, isFollowUpDue } from './brokerActions';

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

test('contact coverage requires actual contact or company information', () => {
  assert.equal(hasContactCoverage({ contactName: null, contactEmail: null, contactPhone: null, contactCompany: null }), false);
  assert.equal(hasContactCoverage({ contactName: null, contactEmail: 'owner@example.com', contactPhone: null, contactCompany: null }), true);
});

test('follow-up due uses the recorded due date rather than record staleness', () => {
  const now = new Date('2026-08-09T18:00:00.000Z');
  assert.equal(isFollowUpDue({ followUpDueDate: new Date('2026-08-09T12:00:00.000Z') }, now), true);
  assert.equal(isFollowUpDue({ followUpDueDate: new Date('2026-08-10T12:00:00.000Z') }, now), false);
  assert.equal(isFollowUpDue({ followUpDueDate: null }, now), false);
});
