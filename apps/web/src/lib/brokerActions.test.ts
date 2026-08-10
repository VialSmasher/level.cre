import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrokerActivityPayload,
  buildProspectActivityPatch,
  getFollowUpDueDate,
  hasContactCoverage,
  isActionableFollowUpDue,
  isFollowUpDue,
} from './brokerActions';

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

test('follow-up due is evaluated by the Edmonton calendar day', () => {
  const morningInEdmonton = new Date('2026-08-10T14:00:00.000Z');

  assert.equal(isFollowUpDue({ followUpDueDate: '2026-08-11T05:30:00.000Z' }, morningInEdmonton), true);
  assert.equal(isFollowUpDue({ followUpDueDate: '2026-08-11T06:30:00.000Z' }, morningInEdmonton), false);
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

test('logging a touch consumes a due stored date and restarts the timeframe from the new contact', () => {
  const activityAt = new Date('2026-08-10T16:00:00.000Z');
  const prospect = {
    status: 'prospect' as const,
    followUpDueDate: '2026-08-09T12:00:00.000Z',
    followUpTimeframe: '1_month' as const,
    lastContactDate: '2026-07-01T12:00:00.000Z',
  };

  const patch = buildProspectActivityPatch(prospect, 'call', activityAt);

  assert.deepEqual(patch, {
    lastContactDate: activityAt.toISOString(),
    status: 'contacted',
    followUpDueDate: null,
  });
  assert.equal(getFollowUpDueDate({ ...prospect, ...patch })?.toISOString(), '2026-09-10T16:00:00.000Z');
});

test('logging a touch preserves a future stored follow-up date', () => {
  const activityAt = new Date('2026-08-10T16:00:00.000Z');
  const patch = buildProspectActivityPatch({
    status: 'contacted',
    followUpDueDate: '2026-08-12T12:00:00.000Z',
  }, 'email', activityAt);

  assert.deepEqual(patch, {
    lastContactDate: activityAt.toISOString(),
  });
});

test('logging a touch consumes a reminder later on the same Edmonton day', () => {
  const activityAt = new Date('2026-08-10T14:00:00.000Z');
  const patch = buildProspectActivityPatch({
    status: 'contacted',
    followUpDueDate: '2026-08-11T05:30:00.000Z',
  }, 'meeting', activityAt);

  assert.deepEqual(patch, {
    lastContactDate: activityAt.toISOString(),
    followUpDueDate: null,
  });
});

test('logging a note preserves an overdue reminder', () => {
  const activityAt = new Date('2026-08-10T16:00:00.000Z');
  const patch = buildProspectActivityPatch({
    status: 'contacted',
    followUpDueDate: '2026-08-09T12:00:00.000Z',
  }, 'note', activityAt);

  assert.deepEqual(patch, {
    lastContactDate: activityAt.toISOString(),
  });
});
