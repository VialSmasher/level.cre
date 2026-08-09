import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSalesActivityInput } from './salesActivityImport';
import {
  ActivityEventBatchSchema,
  ActivityEventInputSchema,
  ActivityEventReviewSchema,
  importActivityEventBatch,
  recordActivityEventFromSalesActivity,
  reviewActivityEvent,
} from './activityEventService';

function transactionalPool(handler: (sql: string, params?: unknown[]) => Promise<any>) {
  const client = {
    query: handler,
    release: () => undefined,
  };
  return { connect: async () => client, query: handler } as any;
}

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
  assert.equal(ActivityEventInputSchema.safeParse({
    externalEventId: 'market-proposal-1',
    eventType: 'market_record_proposed',
    occurredAt: new Date(),
    evidenceStatus: 'observed',
    matchStatus: 'needs_review',
    propertyAddress: '12345 67 Street NW, Edmonton, AB',
    sourceMetadata: { proposal: { latitude: 53.55, longitude: -113.45 } },
  }).success, true);
});

test('activity event import is idempotent and reports an upsert as a duplicate', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = transactionalPool(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO public.activity_events')) {
      return { rows: [{ id: 'event-1', inserted: false }] };
    }
    return { rows: [] };
  });

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
  const upsert = queries.find((query) => query.sql.includes('INSERT INTO public.activity_events'));
  assert.ok(upsert);
  assert.match(upsert.sql, /ON CONFLICT \(user_id, source, external_event_id\)/);
  assert.match(upsert.sql, /match_status IN \('matched', 'ignored'\)/);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('activity event import rejects a tombstoned direct or generic prospect reference', async () => {
  let inserted = false;
  const pool = transactionalPool(async (sql: string) => {
    if (sql.includes('FROM public.prospects')) {
      return { rows: [{ id: 'duplicate-1', merged_into_prospect_id: 'canonical-1' }] };
    }
    if (sql.includes('INSERT INTO public.activity_events')) inserted = true;
    return { rows: [] };
  });

  const result = await importActivityEventBatch({
    pool,
    userId: 'user-1',
    payload: ActivityEventBatchSchema.parse({
      events: [{
        externalEventId: 'message-tombstone',
        eventType: 'email_sent',
        occurredAt: new Date('2026-07-12T18:00:00.000Z'),
        prospectId: 'duplicate-1',
        links: [{ entityType: 'prospect', entityId: 'duplicate-1', role: 'subject' }],
      }],
    }),
  });

  assert.equal(result.errors, 1);
  assert.equal(result.results[0].code, 'prospect_merged');
  assert.equal(result.results[0].canonicalProspectId, 'canonical-1');
  assert.equal(inserted, false);
});

test('broker evidence review requires a prospect for link and preserves prior decisions', async () => {
  assert.equal(ActivityEventReviewSchema.safeParse({ action: 'link' }).success, false);
  assert.equal(ActivityEventReviewSchema.safeParse({ action: 'link', prospectId: 'prospect-1' }).success, true);
  assert.equal(ActivityEventReviewSchema.safeParse({ action: 'ignore' }).success, true);

  const queries: string[] = [];
  const pool = transactionalPool(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM public.prospects')) {
      return { rows: [{ id: 'prospect-1', merged_into_prospect_id: null }] };
    }
    if (sql.includes('FROM public.activity_events')) {
      return { rows: [{ id: 'event-1', match_status: 'ignored', prospect_id: null }] };
    }
    return { rows: [] };
  });
  const result = await reviewActivityEvent({
    pool,
    userId: 'user-1',
    eventId: 'event-1',
    review: ActivityEventReviewSchema.parse({ action: 'link', prospectId: 'prospect-1' }),
  });
  assert.equal(result?.matchStatus, 'ignored');
  assert.equal(result?.alreadyReviewed, true);
  assert.equal(queries.some((sql) => sql.includes('FROM public.prospects') && sql.includes('FOR UPDATE')), true);
  assert.equal(queries.some((sql) => sql.includes('UPDATE public.activity_events')), false);
});

test('confirmed sent sales activity dual-writes metadata without raw payload or body', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = transactionalPool(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO public.activity_events')) {
      return { rows: [{ id: 'event-1', inserted: true }] };
    }
    return { rows: [] };
  });
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
  const upsert = queries.find((query) => query.sql.includes('INSERT INTO public.activity_events'));
  assert.ok(upsert);
  const serializedMetadata = String(upsert.params[23]);
  assert.equal(serializedMetadata.includes('full body'), false);
  assert.equal(upsert.params[4], 'email_sent');
  assert.equal(upsert.params[6], 'confirmed');
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
