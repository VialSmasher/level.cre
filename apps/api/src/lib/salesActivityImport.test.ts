import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSalesActivityInteractionNotes,
  decideSalesActivityMatch,
  normalizeSalesActivityInput,
  shouldCreateInteractionFromSalesActivity,
} from './salesActivityImport';
import {
  importSalesActivityBatch,
  protectOutboundEmailFollowUp,
  reviewSalesActivityImport,
  SalesActivityBatchSchema,
  SalesActivityReviewActionSchema,
} from './salesActivityImportService';

function transactionalPool(handler: (sql: string, params?: unknown[]) => Promise<any>) {
  const client = {
    query: handler,
    release: () => undefined,
  };
  return { connect: async () => client, query: handler } as any;
}

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
  assert.equal(activity.direction, 'outbound');
  assert.equal(activity.email, 'bb.ksm@ksmrig.com');
  assert.equal(activity.emailDomain, 'ksmrig.com');
  assert.equal(activity.activityAt?.toISOString(), '2026-07-08T12:00:00.000Z');
  assert.equal(activity.externalActivityId, duplicate.externalActivityId);
  assert.equal(shouldCreateInteractionFromSalesActivity(activity), true);
});

test('normalizes confirmed received mail as inbound metadata with a direction-safe identity', () => {
  const received = normalizeSalesActivityInput({
    source: 'outlook_sync',
    status: 'received',
    direction: 'outbound',
    externalActivityId: 'outlook-inbox-message-1',
    activityType: 'email',
    email: 'sender@example.com',
    subject: 'RE: Lease requirement',
    activityAt: '2026-08-10T15:00:00.000Z',
    body: 'Do not retain this body.',
  });

  assert.equal(received.activityStatus, 'received');
  assert.equal(received.direction, 'inbound');
  assert.equal(received.externalActivityId, 'outlook-inbox-message-1');
  assert.equal(received.rawPayload.direction, 'inbound');
  assert.equal(Object.prototype.hasOwnProperty.call(received.rawPayload, 'body'), false);
  assert.equal(shouldCreateInteractionFromSalesActivity(received), true);
  assert.deepEqual(decideSalesActivityMatch(received, 'prospect-1', 'exact_contact_email'), {
    matchStatus: 'matched',
    matchReason: 'exact_contact_email',
    confidence: 100,
  });
});

test('received status is accepted only as email evidence', () => {
  const activity = normalizeSalesActivityInput({
    status: 'received',
    activityType: 'call',
    prospectId: 'prospect-1',
  });

  assert.equal(shouldCreateInteractionFromSalesActivity(activity), false);
  assert.deepEqual(decideSalesActivityMatch(activity, 'prospect-1', 'provided_prospect_id'), {
    matchStatus: 'needs_review',
    matchReason: 'unsupported_received_activity',
    confidence: 0,
  });
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

test('sales activity normalization retains metadata but drops Outlook message content', () => {
  const activity = normalizeSalesActivityInput({
    externalActivityId: 'outlook-message-1',
    activityAt: '2026-07-11T06:00:00.000Z',
    contact: 'Pat Prospect',
    company: 'Prospect Co',
    email: 'pat@example.com',
    status: 'sent',
    subject: 'Follow up',
    notes: 'Captured during the scheduled Outlook sync.',
    body: 'Full plain-text message body must not be retained.',
    htmlBody: '<p>Full HTML message body must not be retained.</p>',
    attachments: [{ name: 'confidential.pdf' }],
  });

  assert.equal(activity.rawPayload.externalActivityId, 'outlook-message-1');
  assert.equal(activity.rawPayload.subject, 'Follow up');
  assert.equal(activity.rawPayload.notes, 'Captured during the scheduled Outlook sync.');
  assert.equal(Object.prototype.hasOwnProperty.call(activity.rawPayload, 'body'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(activity.rawPayload, 'htmlBody'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(activity.rawPayload, 'attachments'), false);
});

test('sales activity normalization retains verified map evidence without creating a prospect', () => {
  const activity = normalizeSalesActivityInput({
    externalActivityId: 'outlook-message-map-1',
    status: 'sent',
    company: 'Norquest Industries',
    email: 'doug@example.com',
    propertyAddress: '3911 74 Avenue NW, Edmonton, AB',
    latitude: '53.5101',
    longitude: '-113.4012',
    placeId: 'google-place-1',
    websiteUrl: 'https://example.com',
    addressSource: 'company_website',
    addressConfidence: 95,
    addressVerified: true,
  });

  assert.equal(activity.propertyAddress, '3911 74 Avenue NW, Edmonton, AB');
  assert.equal(activity.latitude, 53.5101);
  assert.equal(activity.longitude, -113.4012);
  assert.equal(activity.addressVerified, true);
  assert.equal(activity.rawPayload.propertyAddress, activity.propertyAddress);
  assert.equal(activity.rawPayload.addressSource, 'company_website');
});

function salesActivityPersistenceHarness(initialFollowUpDueDate: string | null = null) {
  const state = {
    importRow: null as null | {
      id: string;
      interaction_id: string | null;
      match_status: string;
      prospect_id: string | null;
    },
    interactionId: null as string | null,
    createdInteractions: 0,
    followUpDueDate: initialFollowUpDueDate,
    followUpWrites: 0,
  };

  const handler = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM public.prospects') && sql.includes('SELECT')) {
      return { rows: [{ id: 'prospect-1', merged_into_prospect_id: null }] };
    }
    if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) {
      return { rows: state.importRow ? [{ id: state.importRow.id, interaction_id: state.importRow.interaction_id }] : [] };
    }
    if (sql.includes('INSERT INTO public.sales_activity_imports')) {
      state.importRow = state.importRow || {
        id: String(params[0]),
        interaction_id: (params[19] as string | null) || null,
        match_status: String(params[16]),
        prospect_id: (params[14] as string | null) || null,
      };
      return { rows: [{ ...state.importRow }] };
    }
    if (sql.includes('FROM public.contact_interactions')) {
      return { rows: state.interactionId ? [{ id: state.interactionId }] : [] };
    }
    if (sql.includes('UPDATE public.sales_activity_imports') && sql.includes('SET interaction_id')) {
      if (state.importRow) state.importRow.interaction_id = String(params[3]);
      return { rows: [] };
    }
    if (sql.includes('UPDATE public.prospects') && sql.includes('follow_up_due_date = $3')) {
      if (state.followUpDueDate === null) {
        state.followUpDueDate = String(params[2]);
        state.followUpWrites += 1;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  };

  const pool = transactionalPool(handler);
  const storage = {
    createContactInteraction: async () => {
      state.createdInteractions += 1;
      state.interactionId = 'interaction-1';
      return { id: state.interactionId };
    },
  };

  return { state, pool, storage };
}

test('an exact-email matched Outlook activity creates one interaction and protects a missing follow-up across retries', async () => {
  const harness = salesActivityPersistenceHarness();
  const payload = SalesActivityBatchSchema.parse({
    source: 'outlook_sync',
    activities: [{
      externalActivityId: 'outlook-message-1',
      status: 'sent',
      activityType: 'email',
      email: 'pat@example.com',
      subject: 'Follow up',
      activityAt: '2026-07-11T06:00:00.000Z',
    }],
  });

  const first = await importSalesActivityBatch({
    pool: harness.pool,
    storage: harness.storage,
    userId: 'user-1',
    payload,
  });
  const retry = await importSalesActivityBatch({
    pool: harness.pool,
    storage: harness.storage,
    userId: 'user-1',
    payload,
  });

  assert.equal(first.createdInteractions, 1);
  assert.equal(first.results[0].matchReason, 'exact_contact_email');
  assert.equal(retry.createdInteractions, 0);
  assert.equal(retry.duplicates, 1);
  assert.equal(harness.state.createdInteractions, 1);
  assert.equal(harness.state.followUpDueDate, '2026-07-25T12:00:00.000Z');
  assert.equal(harness.state.followUpWrites, 1);
});

test('a matched Outlook email never overwrites an existing prospect follow-up', async () => {
  const existingFollowUp = '2026-08-01T16:00:00.000Z';
  const harness = salesActivityPersistenceHarness(existingFollowUp);

  await importSalesActivityBatch({
    pool: harness.pool,
    storage: harness.storage,
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      source: 'outlook_sync',
      activities: [{
        externalActivityId: 'outlook-message-with-existing-follow-up',
        status: 'sent',
        activityType: 'email',
        prospectId: 'prospect-1',
        activityAt: '2026-07-11T06:00:00.000Z',
      }],
    }),
  });

  assert.equal(harness.state.createdInteractions, 1);
  assert.equal(harness.state.followUpDueDate, existingFollowUp);
  assert.equal(harness.state.followUpWrites, 0);
});

test('an exact-email received Outlook activity logs one inbound interaction without XP or outbound follow-up', async () => {
  const queries: string[] = [];
  const pool = transactionalPool(async (sql: string, params: unknown[] = []) => {
    queries.push(sql);
    if (sql.includes('FROM public.prospects') && sql.includes('SELECT')) {
      return { rows: [{ id: 'prospect-1', merged_into_prospect_id: null }] };
    }
    if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: [] };
    if (sql.includes('INSERT INTO public.sales_activity_imports')) {
      return { rows: [{
        id: String(params[0]),
        interaction_id: null,
        match_status: String(params[16]),
        prospect_id: String(params[14]),
      }] };
    }
    if (sql.includes('FROM public.contact_interactions')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });
  const created: Array<{ payload: any; options: any }> = [];

  const result = await importSalesActivityBatch({
    pool,
    storage: {
      createContactInteraction: async (payload: any, options: any) => {
        created.push({ payload, options });
        return { id: 'interaction-inbound-1' };
      },
    },
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      source: 'outlook_sync',
      activities: [{
        externalActivityId: 'outlook-inbox-message-1',
        status: 'received',
        activityType: 'email',
        email: 'sender@example.com',
        subject: 'Lease requirement',
        activityAt: '2026-08-10T15:00:00.000Z',
      }],
    }),
  });

  assert.equal(result.createdInteractions, 1);
  assert.equal(result.matched, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].payload.sourceProvider, 'outlook');
  assert.equal(created[0].payload.sourceMessageId, 'outlook-inbox-message-1');
  assert.equal(created[0].payload.sourceMetadata.direction, 'inbound');
  assert.equal(created[0].payload.sourceMetadata.captureDirection, 'received');
  assert.deepEqual(created[0].options, { skipXp: true });
  assert.equal(queries.some((sql) => sql.includes('follow_up_due_date = $3')), false);
  assert.equal(queries.some((sql) => /last_contact_date\s+IS NULL OR last_contact_date < \$3/.test(sql)), true);
});

test('ambiguous exact contact-email evidence stays in review and creates no interaction', async () => {
  let created = false;
  const pool = transactionalPool(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM public.prospects') && sql.includes('SELECT')) {
      return { rows: [{ id: 'prospect-1' }, { id: 'prospect-2' }] };
    }
    if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: [] };
    if (sql.includes('INSERT INTO public.sales_activity_imports')) {
      return { rows: [{
        id: String(params[0]),
        interaction_id: null,
        match_status: String(params[16]),
        prospect_id: null,
      }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await importSalesActivityBatch({
    pool,
    storage: {
      createContactInteraction: async () => {
        created = true;
        return { id: 'unexpected' };
      },
    },
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      source: 'outlook_sync',
      activities: [{
        externalActivityId: 'ambiguous-inbound-1',
        status: 'received',
        email: 'shared@example.com',
        subject: 'Reply',
      }],
    }),
  });

  assert.equal(result.needsReview, 1);
  assert.equal(result.results[0].matchReason, 'ambiguous_contact_email');
  assert.equal(created, false);
});

test('automatic email follow-up is limited to pre-qualified business-development records', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  await protectOutboundEmailFollowUp({
    pool: {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
    } as any,
    userId: 'user-1',
    prospectId: 'prospect-1',
    activityAt: '2026-07-11T06:00:00.000Z',
  });

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [
    'prospect-1',
    'user-1',
    '2026-07-25T12:00:00.000Z',
  ]);
  assert.match(queries[0].sql, /prospect\.status IN \('prospect', 'contacted'\)/);
  assert.match(queries[0].sql, /opportunity\.archived_at IS NULL/);
  assert.match(queries[0].sql, /opportunity\.status IN \('won', 'lost'\)/);
  assert.match(
    queries[0].sql,
    /opportunity\.stage NOT IN \('target', 'researching', 'contacting', 'engaged', 'nurture'\)/,
  );
  assert.match(queries[0].sql, /NOT EXISTS/);
});

test('sales activity review actions accept only link or ignore decisions', () => {
  assert.equal(SalesActivityReviewActionSchema.safeParse({ action: 'ignore' }).success, true);
  assert.equal(SalesActivityReviewActionSchema.safeParse({ action: 'link', prospectId: 'prospect-1' }).success, true);
  assert.equal(SalesActivityReviewActionSchema.safeParse({ action: 'link' }).success, false);
  assert.equal(SalesActivityReviewActionSchema.safeParse({ action: 'send' }).success, false);
});

test('manual review can ignore an unmatched activity without creating an interaction', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) {
        return { rows: [{ id: 'import-1', interaction_id: null }] };
      }
      return { rows: [{ id: 'import-1', match_status: 'ignored', match_reason: 'manually_ignored' }] };
    },
  } as any;
  let created = false;
  const storage = {
    createContactInteraction: async () => {
      created = true;
      return { id: 'interaction-1' };
    },
  };

  const result = await reviewSalesActivityImport({
    pool,
    storage,
    userId: 'user-1',
    importId: 'import-1',
    decision: { action: 'ignore' },
  });

  assert.equal(result.match_status, 'ignored');
  assert.equal(created, false);
  assert.equal(queries.length, 2);
});

test('manual review links sent Codex activity to a prospect exactly once', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = transactionalPool(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM public.sales_activity_imports') && sql.includes('SELECT')) {
        return { rows: [{
          id: 'import-1',
          source: 'codex_followup',
          run_id: 'run-1',
          external_activity_id: 'activity-1',
          activity_status: 'sent',
          activity_type: 'email',
          contact_name: 'Pat Prospect',
          company: 'Prospect Co',
          email: 'pat@example.com',
          subject: 'Follow up',
          notes: 'Approved and sent.',
          activity_at: new Date('2026-07-10T15:00:00.000Z'),
          prospect_id: null,
          listing_id: null,
          match_status: 'needs_review',
          interaction_id: null,
        }] };
      }
      if (sql.includes('FROM public.prospects')) {
        return { rows: [{ id: 'prospect-1', status: 'prospect', merged_into_prospect_id: null }] };
      }
      if (sql.includes('UPDATE public.sales_activity_imports')) {
        return { rows: [{
          id: 'import-1',
          match_status: 'matched',
          match_reason: 'manual_prospect_link',
          prospect_id: 'prospect-1',
          interaction_id: 'interaction-1',
        }] };
      }
      return { rows: [] };
  });
  const created: any[] = [];
  const storage = {
    createContactInteraction: async (payload: any, options: any) => {
      created.push({ payload, options });
      return { id: 'interaction-1' };
    },
  };

  const result = await reviewSalesActivityImport({
    pool,
    storage,
    userId: 'user-1',
    importId: 'import-1',
    decision: { action: 'link', prospectId: 'prospect-1' },
  });

  assert.equal(result.match_status, 'matched');
  assert.equal(created.length, 1);
  assert.equal(created[0].payload.sourceProvider, 'codex');
  assert.equal(created[0].payload.notes.includes('Subject: Follow up'), true);
  assert.deepEqual(created[0].options, { skipXp: true });
  assert.equal(queries.some((query) => query.sql.includes('FROM public.prospects') && query.sql.includes('FOR UPDATE')), true);
  assert.equal(queries.some((query) => query.sql === 'COMMIT'), true);
});

test('manual review links received Outlook evidence without XP or an outbound follow-up', async () => {
  const queries: string[] = [];
  const pool = transactionalPool(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM public.sales_activity_imports') && sql.includes('SELECT')) {
      return { rows: [{
        id: 'import-inbound-1',
        source: 'outlook_sync',
        run_id: 'inbox-run-1',
        external_activity_id: 'outlook-inbox-message-1',
        activity_status: 'received',
        activity_type: 'email',
        contact_name: 'Pat Prospect',
        company: 'Prospect Co',
        email: 'pat@example.com',
        subject: 'RE: Follow up',
        notes: 'Received in Outlook.',
        activity_at: new Date('2026-08-10T15:00:00.000Z'),
        prospect_id: null,
        listing_id: null,
        match_status: 'needs_review',
        interaction_id: null,
      }] };
    }
    if (sql.includes('FROM public.prospects')) {
      return { rows: [{ id: 'prospect-1', status: 'prospect', merged_into_prospect_id: null }] };
    }
    if (sql.includes('UPDATE public.sales_activity_imports')) {
      return { rows: [{
        id: 'import-inbound-1',
        match_status: 'matched',
        match_reason: 'manual_prospect_link',
        prospect_id: 'prospect-1',
        interaction_id: 'interaction-inbound-1',
      }] };
    }
    return { rows: [] };
  });
  const created: Array<{ payload: any; options: any }> = [];

  const result = await reviewSalesActivityImport({
    pool,
    storage: {
      createContactInteraction: async (payload: any, options: any) => {
        created.push({ payload, options });
        return { id: 'interaction-inbound-1' };
      },
    },
    userId: 'user-1',
    importId: 'import-inbound-1',
    decision: { action: 'link', prospectId: 'prospect-1' },
  });

  assert.equal(result.match_status, 'matched');
  assert.equal(created.length, 1);
  assert.equal(created[0].payload.sourceProvider, 'outlook');
  assert.equal(created[0].payload.sourceMetadata.direction, 'inbound');
  assert.equal(created[0].payload.sourceMetadata.captureDirection, 'received');
  assert.deepEqual(created[0].options, { skipXp: true });
  assert.equal(queries.some((sql) => sql.includes('follow_up_due_date = $3')), false);
  assert.equal(queries.some((sql) => /last_contact_date\s+IS NULL OR last_contact_date < \$3/.test(sql)), true);
});

test('a Postmark-first direct match creates one interaction without duplicate XP', async () => {
  const pool = transactionalPool(async (sql: string) => {
      if (sql.includes('FROM public.prospects') && sql.includes('LIMIT 1')) return { rows: [{ id: 'prospect-1' }] };
      if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: [] };
      if (sql.includes('INSERT INTO public.sales_activity_imports')) {
        return { rows: [{ id: 'import-1', interaction_id: null, match_status: 'matched', prospect_id: 'prospect-1' }] };
      }
      if (sql.includes('FROM public.contact_interactions')) return { rows: [] };
      return { rows: [], rowCount: 0 };
  });
  const created: any[] = [];
  const storage = {
    createContactInteraction: async (payload: any, options: any) => {
      created.push({ payload, options });
      return { id: 'interaction-1' };
    },
  };

  const result = await importSalesActivityBatch({
    pool,
    storage,
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      source: 'codex_followup',
      activities: [{
        externalActivityId: 'activity-1',
        status: 'sent',
        activityType: 'email',
        prospectId: 'prospect-1',
        email: 'buyer@example.com',
        subject: 'Follow up',
        activityAt: '2026-07-11T06:00:00.000Z',
      }],
    }),
    hasCapturedEmailEvidence: async () => true,
  });

  assert.equal(result.createdInteractions, 1);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].options, { skipXp: true });
});

test('sales activity import rolls back before upsert when the prospect was consolidated', async () => {
  const queries: string[] = [];
  const pool = transactionalPool(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM public.prospects')) {
      return { rows: [{ id: 'duplicate-1', merged_into_prospect_id: 'canonical-1' }] };
    }
    return { rows: [] };
  });

  const result = await importSalesActivityBatch({
    pool,
    storage: { createContactInteraction: async () => ({ id: 'unused' }) },
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      activities: [{
        externalActivityId: 'activity-tombstone',
        status: 'sent',
        prospectId: 'duplicate-1',
        email: 'buyer@example.com',
      }],
    }),
  });

  assert.equal(result.errors, 1);
  assert.equal(result.results[0].code, 'prospect_merged');
  assert.equal(result.results[0].canonicalProspectId, 'canonical-1');
  assert.equal(queries.some((sql) => sql.includes('INSERT INTO public.sales_activity_imports')), false);
  assert.equal(queries.includes('ROLLBACK'), true);
});

test('a captured interaction is reused when Codex records the same sent email later', async () => {
  const pool = transactionalPool(async (sql: string) => {
      if (sql.includes('FROM public.prospects') && sql.includes('LIMIT 1')) {
        return { rows: [{ id: 'prospect-1' }] };
      }
      if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO public.sales_activity_imports')) {
        return { rows: [{
          id: 'import-1',
          interaction_id: 'captured-interaction-1',
          match_status: 'matched',
          prospect_id: 'prospect-1',
        }] };
      }
      if (sql.includes('FROM public.contact_interactions')) return { rows: [] };
      return { rows: [], rowCount: 0 };
  });
  let created = false;
  const storage = {
    createContactInteraction: async () => {
      created = true;
      return { id: 'new-interaction' };
    },
  };

  const result = await importSalesActivityBatch({
    pool,
    storage,
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      source: 'codex_followup',
      activities: [{
        externalActivityId: 'activity-1',
        status: 'sent',
        activityType: 'email',
        prospectId: 'prospect-1',
        email: 'buyer@example.com',
        subject: '10735 214 St follow-up',
        activityAt: '2026-07-11T06:00:00.000Z',
      }],
    }),
    findCapturedEmailInteraction: async () => ({
      interactionId: 'captured-interaction-1',
      prospectId: 'prospect-1',
    }),
  });

  assert.equal(created, false);
  assert.equal(result.createdInteractions, 0);
  assert.equal(result.duplicates, 1);
  assert.equal(result.results[0].interactionId, 'captured-interaction-1');
});

test('a confirmed sales send is handed to the canonical event ledger after matching', async () => {
  const pool = transactionalPool(async (sql: string) => {
      if (sql.includes('FROM public.prospects') && sql.includes('LIMIT 1')) return { rows: [{ id: 'prospect-1' }] };
      if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: [] };
      if (sql.includes('INSERT INTO public.sales_activity_imports')) {
        return { rows: [{ id: 'import-1', interaction_id: null, match_status: 'matched', prospect_id: 'prospect-1' }] };
      }
      if (sql.includes('FROM public.contact_interactions')) return { rows: [{ id: 'interaction-1' }] };
      return { rows: [], rowCount: 0 };
  });
  const recorded: any[] = [];

  await importSalesActivityBatch({
    pool,
    storage: { createContactInteraction: async () => ({ id: 'unused' }) },
    userId: 'user-1',
    payload: SalesActivityBatchSchema.parse({
      activities: [{
        externalActivityId: 'provider-message-1',
        status: 'sent',
        email: 'buyer@example.com',
        prospectId: 'prospect-1',
        subject: 'Follow up',
      }],
    }),
    recordActivityEvent: async (input) => { recorded.push(input); },
  });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].importId, 'import-1');
  assert.equal(recorded[0].prospectId, 'prospect-1');
  assert.equal(recorded[0].interactionId, 'interaction-1');
  assert.equal(recorded[0].matchStatus, 'matched');
});
