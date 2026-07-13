import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSalesActivityInput } from './salesActivityImport';
import {
  ActivityEventBatchSchema,
  ActivityEventInputSchema,
  importActivityEventBatch,
  recordActivityEventFromSalesActivity,
} from './activityEventService';

test('activity events require a known type, bounded confidence, and brief evidence', () => {
  const valid = ActivityEventInputSchema.parse({
    externalEventId: 'message-1',
    eventType: 'email_sent',
    occurredAt: '2026-07-12T12:00:00-06:00',
    confidence: 90,
    summary: 'Short evidence only.',
    body: 'This field must not enter the canonical contract.',
  });

  assert.equal(valid.occurredAt.toISOString(), '2026-07-12T18:00:00.000Z');
  assert.equal('body' in valid, false);
  assert.equal(ActivityEventInputSchema.safeParse({
    externalEventId: 'bad-1',
    eventType: 'email_opened',
    occurredAt: new Date(),
  }).success, false);
  assert.equal(ActivityEventInputSchema.safeParse({
    externalEventId: 'bad-2',
    eventType: 'email_sent',
    occurredAt: new Date(),
    confidence: 101,
  }).success, false);
  assert.equal(ActivityEventInputSchema.safeParse({
    externalEventId: 'bad-3',
    eventType: 'email_sent',
    occurredAt: new Date(),
    sourceMetadata: { provider: { bodyHtml: '<p>Full message</p>' } },
  }).success, false);
});

test('activity event import is idempotent and reports an upsert as a duplicate', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'event-1', inserted: false }] };
    },
  } as any;

  const result = await importActivityEventBatch({
    pool,
    userId: 'user-1',
    payload: ActivityEventBatchSchema.parse({
      source: 'codex_followup',
      events: [{
        externalEventId: 'provider-message-1',
        eventType: 'email_sent',
        occurredAt: new Date('2026-07-12T18:00:00.000Z'),
        evidenceStatus: 'confirmed',
        matchStatus: 'needs_review',
      }],
    }),
  });

  assert.equal(result.imported, 1);
  assert.equal(result.inserted, 0);
  assert.equal(result.duplicates, 1);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /ON CONFLICT \(user_id, source, external_event_id\)/);
});

test('confirmed sent sales activity dual-writes metadata without raw payload or body', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'event-1', inserted: true }] };
    },
  } as any;
  const activity = normalizeSalesActivityInput({
    externalActivityId: 'provider-message-1',
    status: 'sent',
    activityType: 'email',
    contact: 'Pat Prospect',
    company: 'Prospect Co',
    email: 'pat@example.com',
    subject: 'Lease requirement',
    notes: 'Approved and sent.',
    body: 'A full body that must not be copied.',
    activityAt: '2026-07-12T18:00:00.000Z',
  });

  const result = await recordActivityEventFromSalesActivity({
    pool,
    userId: 'user-1',
    activity,
    importId: 'import-1',
    prospectId: null,
    listingId: null,
    interactionId: null,
    matchStatus: 'needs_review',
    matchReason: 'no_confident_prospect_match',
    confidence: 0,
  });

  assert.equal(result?.inserted, 1);
  const serializedMetadata = String(queries[0].params[23]);
  assert.equal(serializedMetadata.includes('full body'), false);
  assert.equal(queries[0].params[4], 'email_sent');
  assert.equal(queries[0].params[6], 'confirmed');
});

test('non-sent sales rows do not become canonical production activity', async () => {
  let queried = false;
  const pool = { query: async () => { queried = true; return { rows: [] }; } } as any;
  const activity = normalizeSalesActivityInput({ status: 'draft', email: 'pat@example.com' });
  const result = await recordActivityEventFromSalesActivity({
    pool,
    userId: 'user-1',
    activity,
    importId: 'import-1',
    prospectId: null,
    listingId: null,
    interactionId: null,
    matchStatus: 'needs_review',
    matchReason: 'status_draft',
    confidence: 0,
  });

  assert.equal(result, null);
  assert.equal(queried, false);
});
