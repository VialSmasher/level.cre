import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findMatchingCodexEmailImport,
  findMatchingCapturedEmailMessage,
  findMatchingCapturedEmailInteraction,
  findMatchingSalesActivityInteraction,
  hasMatchingCapturedEmailEvidence,
  isSameEmailActivity,
  normalizeEmailActivitySubject,
  shouldSuppressDuplicateCapture,
  suppressEmailReviewsMatchingSalesActivity,
} from './emailActivityReconciliation';
import { normalizeSalesActivityInput } from './salesActivityImport';

test('normalizes reply and forward prefixes without weakening the subject match', () => {
  assert.equal(normalizeEmailActivitySubject(' RE: Fwd:  10735 214 St  '), '10735 214 st');
  assert.equal(normalizeEmailActivitySubject('Different property'), 'different property');
});

test('requires the same subject, counterparty, and a tight timestamp window', () => {
  const base = {
    subject: '10735 214 St follow-up',
    counterpartyEmails: ['Buyer@Example.com'],
    occurredAt: '2026-07-10T15:00:00.000Z',
  };

  assert.equal(isSameEmailActivity(base, {
    subject: 'RE: 10735 214 St follow-up',
    counterpartyEmails: ['buyer@example.com'],
    occurredAt: '2026-07-10T15:12:00.000Z',
  }), true);
  assert.equal(isSameEmailActivity(base, { ...base, occurredAt: '2026-07-10T15:16:00.000Z' }), false);
  assert.equal(isSameEmailActivity(base, { ...base, counterpartyEmails: ['other@example.com'] }), false);
  assert.equal(isSameEmailActivity(base, { ...base, subject: 'Another follow-up' }), false);
});

test('finds a matching Codex import only after strict in-memory subject verification', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [
        {
          id: 'wrong-subject',
          interaction_id: null,
          match_status: 'needs_review',
          subject: 'Different deal',
          email: 'buyer@example.com',
          activity_at: new Date('2026-07-10T15:00:00.000Z'),
        },
        {
          id: 'import-1',
          interaction_id: 'interaction-1',
          match_status: 'matched',
          subject: '10735 214 St follow-up',
          email: 'buyer@example.com',
          activity_at: new Date('2026-07-10T15:04:00.000Z'),
        },
      ] };
    },
  } as any;

  const result = await findMatchingCodexEmailImport({
    pool,
    userId: 'user-1',
    subject: 'RE: 10735 214 St follow-up',
    counterpartyEmails: ['buyer@example.com'],
    occurredAt: '2026-07-10T15:00:00.000Z',
  });

  assert.deepEqual(result, { id: 'import-1', interactionId: 'interaction-1', matchStatus: 'matched' });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params.slice(0, 2), ['user-1', ['buyer@example.com']]);
  assert.deepEqual(queries[0].params[3], ['codex_followup', 'outlook_sync']);
});

test('reuses one strict cross-channel sales interaction in either ingestion order', async () => {
  for (const [source, counterpartSource] of [
    ['outlook_sync', 'codex_followup'],
    ['codex_followup', 'outlook_sync'],
  ] as const) {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [
          {
            interaction_id: 'unrelated-interaction',
            prospect_id: 'unrelated-prospect',
            subject: 'Different property',
            email: 'buyer@example.com',
            activity_at: new Date('2026-07-10T15:01:00.000Z'),
          },
          {
            interaction_id: 'interaction-1',
            prospect_id: 'prospect-1',
            subject: 'RE: 10735 214 St follow-up',
            email: 'buyer@example.com',
            activity_at: new Date('2026-07-10T15:04:00.000Z'),
          },
        ] };
      },
    } as any;
    const activity = normalizeSalesActivityInput({
      source,
      status: 'sent',
      activityType: 'email',
      email: 'buyer@example.com',
      subject: '10735 214 St follow-up',
      activityAt: '2026-07-10T15:00:00.000Z',
    });

    assert.deepEqual(
      await findMatchingSalesActivityInteraction({ pool, userId: 'user-1', activity }),
      { interactionId: 'interaction-1', prospectId: 'prospect-1' },
    );
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].params.slice(0, 4), [
      'user-1',
      counterpartSource,
      'buyer@example.com',
      source,
    ]);
    assert.match(queries[0].sql, /NOT EXISTS/);
    assert.match(queries[0].sql, /claimed\.source = \$4/);
    assert.match(queries[0].sql, /claimed\.interaction_id = candidate\.interaction_id/);
  }
});

test('does not collapse a different cross-channel email with the same recipient and nearby timestamp', async () => {
  const pool = {
    query: async () => ({ rows: [{
      interaction_id: 'interaction-1',
      prospect_id: 'prospect-1',
      subject: 'Different property',
      email: 'buyer@example.com',
      activity_at: new Date('2026-07-10T15:04:00.000Z'),
    }] }),
  } as any;
  const activity = normalizeSalesActivityInput({
    source: 'outlook_sync',
    status: 'sent',
    activityType: 'email',
    email: 'buyer@example.com',
    subject: '10735 214 St follow-up',
    activityAt: '2026-07-10T15:00:00.000Z',
  });

  assert.equal(
    await findMatchingSalesActivityInteraction({ pool, userId: 'user-1', activity }),
    null,
  );
});

test('finds the same captured email across providers without weakening the evidence', async () => {
  const pool = {
    query: async () => ({ rows: [
      {
        id: 'different-email',
        direction: 'sent',
        subject: 'Different property',
        sender_email: 'patrick@example.com',
        recipient_emails: ['buyer@example.com'],
        sent_at: new Date('2026-07-10T15:01:00.000Z'),
        received_at: null,
        interaction_id: null,
        prospect_id: null,
        match_status: 'needs_context',
      },
      {
        id: 'postmark-copy',
        direction: 'sent',
        subject: 'RE: 10735 214 St follow-up',
        sender_email: 'patrick@example.com',
        recipient_emails: ['buyer@example.com'],
        sent_at: new Date('2026-07-10T15:04:00.000Z'),
        received_at: null,
        interaction_id: 'interaction-1',
        prospect_id: 'prospect-1',
        match_status: 'auto_logged',
      },
    ] }),
  } as any;

  const result = await findMatchingCapturedEmailMessage({
    pool,
    userId: 'user-1',
    emailMessageId: 'outlook-copy',
    direction: 'sent',
    subject: '10735 214 St follow-up',
    senderEmail: 'patrick@example.com',
    recipientEmails: ['buyer@example.com'],
    occurredAt: '2026-07-10T15:00:00.000Z',
  });

  assert.deepEqual(result, {
    id: 'postmark-copy',
    interactionId: 'interaction-1',
    prospectId: 'prospect-1',
    matchStatus: 'auto_logged',
  });
});

test('chooses one canonical capture during simultaneous provider delivery', () => {
  assert.equal(shouldSuppressDuplicateCapture('message-b', {
    id: 'message-a',
    interactionId: null,
    matchStatus: null,
  }), true);
  assert.equal(shouldSuppressDuplicateCapture('message-a', {
    id: 'message-b',
    interactionId: null,
    matchStatus: null,
  }), false);
  assert.equal(shouldSuppressDuplicateCapture('message-a', {
    id: 'message-b',
    interactionId: 'interaction-1',
    matchStatus: 'auto_logged',
  }), true);
});

test('a later Codex import suppresses only unresolved duplicate email reviews', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) {
        return { rows: [{
          id: 'email-message-1',
          subject: 'RE: 10735 214 St follow-up',
          recipient_emails: ['buyer@example.com'],
          sent_at: new Date('2026-07-10T15:03:00.000Z'),
          received_at: new Date('2026-07-10T15:04:00.000Z'),
        }] };
      }
      return { rowCount: 1, rows: [{ id: 'review-1' }] };
    },
  } as any;
  const activity = normalizeSalesActivityInput({
    source: 'codex_followup',
    status: 'sent',
    activityType: 'email',
    email: 'buyer@example.com',
    subject: '10735 214 St follow-up',
    activityAt: '2026-07-10T15:00:00.000Z',
  });

  const suppressed = await suppressEmailReviewsMatchingSalesActivity({ pool, userId: 'user-1', activity });

  assert.equal(suppressed, 1);
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /interaction_id IS NULL/);
  assert.match(queries[1].sql, /duplicate_codex_activity/);
});

test('detects captured evidence before a direct interaction awards XP', async () => {
  const pool = {
    query: async () => ({ rows: [{
      id: 'email-message-1',
      subject: '10735 214 St follow-up',
      recipient_emails: ['buyer@example.com'],
      sent_at: new Date('2026-07-10T15:03:00.000Z'),
      received_at: new Date('2026-07-10T15:04:00.000Z'),
    }] }),
  } as any;
  const activity = normalizeSalesActivityInput({
    source: 'codex_followup',
    status: 'sent',
    activityType: 'email',
    email: 'buyer@example.com',
    subject: '10735 214 St follow-up',
    activityAt: '2026-07-10T15:00:00.000Z',
  });

  assert.equal(await hasMatchingCapturedEmailEvidence({ pool, userId: 'user-1', activity }), true);
});

test('reuses a matching captured email interaction when Postmark arrives before Outlook sync', async () => {
  let queryCount = 0;
  const pool = {
    query: async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return { rows: [{
          id: 'email-message-1',
          subject: '10735 214 St follow-up',
          recipient_emails: ['buyer@example.com'],
          sent_at: new Date('2026-07-10T15:03:00.000Z'),
          received_at: null,
        }] };
      }
      return { rows: [{ id: 'interaction-1', prospect_id: 'prospect-1' }] };
    },
  } as any;
  const activity = normalizeSalesActivityInput({
    source: 'outlook_sync',
    status: 'sent',
    activityType: 'email',
    email: 'buyer@example.com',
    subject: '10735 214 St follow-up',
    activityAt: '2026-07-10T15:00:00.000Z',
  });

  assert.deepEqual(await findMatchingCapturedEmailInteraction({ pool, userId: 'user-1', activity }), {
    interactionId: 'interaction-1',
    prospectId: 'prospect-1',
  });
});
