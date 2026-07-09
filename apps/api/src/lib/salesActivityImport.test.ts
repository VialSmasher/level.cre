import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSalesActivityInteractionNotes,
  decideSalesActivityMatch,
  normalizeSalesActivityInput,
  shouldCreateInteractionFromSalesActivity,
} from './salesActivityImport';

test('normalizes a Codex follow-up send log row into a stable sent email activity', () => {
  const activity = normalizeSalesActivityInput({
    timestamp_mdt: '2026-07-08',
    contact: 'Brian Beckett',
    company: 'KSM RIG & EQUIPMENT',
    email: 'BB.KSM@KSMRIG.COM',
    status: 'sent',
    subject: 'Catch up',
    notes: 'Sent via Outlook desktop after approved wording.',
  });
  const duplicate = normalizeSalesActivityInput({
    timestamp_mdt: '2026-07-08',
    contact: 'Brian Beckett',
    company: 'KSM RIG & EQUIPMENT',
    email: 'bb.ksm@ksmrig.com',
    status: 'sent',
    subject: 'Catch up',
    notes: 'Different raw note should not change fallback identity.',
  });

  assert.equal(activity.source, 'codex_followup');
  assert.equal(activity.activityStatus, 'sent');
  assert.equal(activity.activityType, 'email');
  assert.equal(activity.email, 'bb.ksm@ksmrig.com');
  assert.equal(activity.emailDomain, 'ksmrig.com');
  assert.equal(activity.activityAt?.toISOString(), '2026-07-08T12:00:00.000Z');
  assert.equal(activity.externalActivityId, duplicate.externalActivityId);
  assert.equal(shouldCreateInteractionFromSalesActivity(activity), true);
});

test('hold and low priority rows are retained but not converted into CRM interactions', () => {
  const hold = normalizeSalesActivityInput({
    contact: 'Dennis Polansky',
    email: 'dpolansky@apexcontracting.net',
    status: 'hold',
  });
  const lowPriority = normalizeSalesActivityInput({
    contact: 'Ahmad Hussein',
    email: 'ahmad@accconstruction.ca',
    status: 'low priority',
  });

  assert.equal(shouldCreateInteractionFromSalesActivity(hold), false);
  assert.deepEqual(decideSalesActivityMatch(hold, null, null), {
    matchStatus: 'ignored',
    matchReason: 'status_hold',
    confidence: 0,
  });
  assert.equal(lowPriority.activityStatus, 'low_priority');
  assert.equal(decideSalesActivityMatch(lowPriority, null, null).matchStatus, 'ignored');
});

test('sent rows need a confident prospect match before becoming interactions', () => {
  const activity = normalizeSalesActivityInput({
    email: 'prospect@example.com',
    status: 'sent',
    subject: 'Follow up',
  });

  assert.deepEqual(decideSalesActivityMatch(activity, null, null), {
    matchStatus: 'needs_review',
    matchReason: 'no_confident_prospect_match',
    confidence: 0,
  });
  assert.deepEqual(decideSalesActivityMatch(activity, 'prospect-1', 'exact_contact_email'), {
    matchStatus: 'matched',
    matchReason: 'exact_contact_email',
    confidence: 95,
  });
});

test('interaction notes preserve useful context without raw body dumping', () => {
  const activity = normalizeSalesActivityInput({
    contact: 'Brian Beckett',
    company: 'KSM RIG & EQUIPMENT',
    email: 'bb.ksm@ksmrig.com',
    status: 'sent',
    subject: 'Catch up',
    notes: 'Short approved send note.',
  });

  assert.equal(
    buildSalesActivityInteractionNotes(activity),
    'Subject: Catch up\nShort approved send note.\nCodex activity: Brian Beckett | KSM RIG & EQUIPMENT | bb.ksm@ksmrig.com',
  );
});
