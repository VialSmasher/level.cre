import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrokerActivityPayload, hasContactCoverage, isActionableFollowUpDue, isFollowUpDue } from './brokerActions';

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

test('follow-up due falls back to timeframe from the last contact or creation date', () => {
  const now = new Date('2026-08-10T18:00:00.000Z');

  assert.equal(isFollowUpDue({
    followUpDueDate: null,
    followUpTimeframe: '1_month',
    lastContactDate: '2026-07-09T12:00:00.000Z',
    createdDate: '2026-01-01T12:00:00.000Z',
  }, now), true);
  assert.equal(isFollowUpDue({
    followUpDueDate: null,
    followUpTimeframe: '1_month',
    createdDate: '2026-07-20T12:00:00.000Z',
  }, now), false);
});

test('a stored due date takes precedence over the timeframe fallback', () => {
  const now = new Date('2026-08-10T18:00:00.000Z');

  assert.equal(isFollowUpDue({
    followUpDueDate: '2026-09-01T12:00:00.000Z',
    followUpTimeframe: '1_month',
    lastContactDate: '2026-01-01T12:00:00.000Z',
  }, now), false);
});

test('no-go prospects do not enter an actionable follow-up lane', () => {
  const now = new Date('2026-08-10T18:00:00.000Z');
  const dueDate = '2026-08-09T12:00:00.000Z';

  assert.equal(isActionableFollowUpDue({ status: 'no_go', followUpDueDate: dueDate }, now), false);
  assert.equal(isActionableFollowUpDue({ status: 'prospect', followUpDueDate: dueDate }, now), true);
});
