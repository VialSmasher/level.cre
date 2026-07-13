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
  reviewSalesActivityImport,
  SalesActivityBatchSchema,
  SalesActivityReviewActionSchema,
} from './salesActivityImportService';

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
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) {
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
      if (queries.length === 2) return { rows: [{ id: 'prospect-1', status: 'prospect' }] };
      if (queries.length === 3) return { rows: [] };
      if (queries.length === 4) return { rows: [] };
      return { rows: [{
        id: 'import-1',
        match_status: 'matched',
        match_reason: 'manual_prospect_link',
        prospect_id: 'prospect-1',
        interaction_id: 'interaction-1',
      }] };
    },
  } as any;
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
  assert.equal(queries.length, 5);
});

test('a Postmark-first direct match creates one interaction without duplicate XP', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.prospects') && sql.includes('LIMIT 1')) return { rows: [{ id: 'prospect-1' }] };
      if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: [] };
      if (sql.includes('INSERT INTO public.sales_activity_imports')) {
        return { rows: [{ id: 'import-1', interaction_id: null, match_status: 'matched', prospect_id: 'prospect-1' }] };
      }
      if (sql.includes('FROM public.contact_interactions')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  } as any;
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

test('a captured interaction is reused when Codex records the same sent email later', async () => {
  const pool = {
    query: async (sql: string) => {
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
    },
  } as any;
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
