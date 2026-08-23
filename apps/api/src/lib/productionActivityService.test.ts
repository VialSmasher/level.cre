import test from 'node:test';
import assert from 'node:assert/strict';

import { listProductionActivities } from './productionActivityService';

test('canonical production activities count an unmatched confirmed send without duplicating linked interactions', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.activity_events')) {
        return { rows: [{
          id: 'event-1',
          event_type: 'email_sent',
          direction: 'outbound',
          occurred_at: new Date('2026-08-21T17:36:00.000Z'),
          source: 'codex_followup',
          source_metadata: { captureDirection: 'sent' },
          prospect_id: 'prospect-1',
          interaction_id: 'interaction-1',
          external_event_id: 'message-1',
        }] };
      }
      if (sql.includes('FROM public.sales_activity_imports')) {
        return { rows: [
          {
            id: 'import-1',
            source: 'codex_followup',
            external_activity_id: 'message-1',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:36:00.000Z'),
            created_at: new Date('2026-08-21T17:37:00.000Z'),
            prospect_id: 'prospect-1',
            interaction_id: 'interaction-1',
            raw_payload: {},
          },
          {
            id: 'import-2',
            source: 'codex_followup',
            external_activity_id: 'message-2',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T19:32:00.000Z'),
            created_at: new Date('2026-08-21T19:33:00.000Z'),
            prospect_id: null,
            interaction_id: null,
            raw_payload: {},
          },
        ] };
      }
      if (sql.includes('FROM public.contact_interactions')) {
        return { rows: [
          {
            id: 'interaction-1',
            date: '2026-08-21T17:36:00.000Z',
            created_at: new Date('2026-08-21T17:37:00.000Z'),
            type: 'email',
            source_provider: 'codex',
            source_message_id: 'message-1',
            source_metadata: { direction: 'outbound' },
            prospect_id: 'prospect-1',
          },
          {
            id: 'interaction-2',
            date: '2026-08-21T20:00:00.000Z',
            created_at: new Date('2026-08-21T20:01:00.000Z'),
            type: 'call',
            source_provider: 'manual',
            source_message_id: null,
            source_metadata: {},
            prospect_id: 'prospect-2',
          },
        ] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  } as any;

  const rows = await listProductionActivities({ pool, userId: 'user-1' });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.id), [
    'interaction:interaction-2',
    'import:import-2',
    'event:event-1',
  ]);
  assert.deepEqual(rows.map((row) => row.action), ['phone_call', 'email_sent', 'email_sent']);
});

test('canonical production activities keep received email as inbound context', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.activity_events')) {
        return { rows: [{
          id: 'event-inbound',
          event_type: 'email_received',
          direction: 'inbound',
          occurred_at: new Date('2026-08-21T18:00:00.000Z'),
          source: 'outlook_sync',
          source_metadata: { captureDirection: 'received' },
          prospect_id: null,
          interaction_id: null,
          external_event_id: 'message-inbound',
        }] };
      }
      return { rows: [] };
    },
  } as any;

  const rows = await listProductionActivities({ pool, userId: 'user-1' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'email');
  assert.equal(rows[0].direction, 'inbound');
});

test('canonical production activities collapse legacy Codex and Outlook aliases for one sent message', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.activity_events')) {
        return { rows: [{
          id: 'event-codex',
          event_type: 'email_sent',
          direction: 'outbound',
          occurred_at: new Date('2026-08-21T17:36:00.000Z'),
          source: 'codex_followup',
          source_metadata: { captureDirection: 'sent' },
          prospect_id: null,
          interaction_id: null,
          external_event_id: 'desktop-entry-id',
          subject: 'RE: 2959 Parsons Road',
          email: 'prospect@example.com',
        }] };
      }
      if (sql.includes('FROM public.sales_activity_imports')) {
        return { rows: [
          {
            id: 'import-codex',
            source: 'codex_followup',
            external_activity_id: 'desktop-entry-id',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:36:00.000Z'),
            created_at: new Date('2026-08-21T17:36:10.000Z'),
            prospect_id: null,
            interaction_id: null,
            subject: 'RE: 2959 Parsons Road',
            email: 'prospect@example.com',
            raw_payload: { externalActivityId: 'desktop-entry-id' },
          },
          {
            id: 'import-outlook',
            source: 'outlook_sync',
            external_activity_id: 'internet-message:<provider-id>',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:37:00.000Z'),
            created_at: new Date('2026-08-21T17:38:00.000Z'),
            prospect_id: 'prospect-1',
            interaction_id: 'interaction-outlook',
            subject: '2959 Parsons Road',
            email: 'prospect@example.com',
            raw_payload: { externalActivityId: 'internet-message:<provider-id>' },
          },
        ] };
      }
      if (sql.includes('FROM public.contact_interactions')) {
        return { rows: [{
          id: 'interaction-outlook',
          date: '2026-08-21T17:37:00.000Z',
          created_at: new Date('2026-08-21T17:38:00.000Z'),
          type: 'email',
          source_provider: 'outlook',
          source_message_id: 'internet-message:<provider-id>',
          source_email_message_id: 'email-message-1',
          source_metadata: { direction: 'outbound' },
          prospect_id: 'prospect-1',
          email_provider_message_id: 'internet-message:<provider-id>',
          email_subject: '2959 Parsons Road',
          email_sender_email: 'patrick@example.com',
          email_recipient_emails: ['prospect@example.com'],
          email_cc_emails: [],
          email_raw_metadata: {
            graphMessageId: 'graph-provider-id',
            internetMessageId: '<provider-id>',
          },
        }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  } as any;

  const rows = await listProductionActivities({ pool, userId: 'user-1' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].prospectId, 'prospect-1');
  assert.equal(rows[0].interactionId, 'interaction-outlook');
  assert.equal(rows[0].sourceMetadata.deduplicatedActivityCount, 4);
  assert.deepEqual(rows[0].sourceMetadata.deduplicatedSourceProviders, [
    'codex_followup',
    'outlook_sync',
    'outlook',
  ]);
});

test('canonical production activities keep genuinely separate emails with the same subject', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.activity_events')) return { rows: [] };
      if (sql.includes('FROM public.sales_activity_imports')) {
        return { rows: [
          {
            id: 'import-1',
            source: 'codex_followup',
            external_activity_id: 'message-1',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:00:00.000Z'),
            created_at: new Date('2026-08-21T17:00:10.000Z'),
            prospect_id: 'prospect-1',
            interaction_id: null,
            subject: 'Availability update',
            email: 'first@example.com',
            raw_payload: {},
          },
          {
            id: 'import-2',
            source: 'codex_followup',
            external_activity_id: 'message-2',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:05:00.000Z'),
            created_at: new Date('2026-08-21T17:05:10.000Z'),
            prospect_id: 'prospect-2',
            interaction_id: null,
            subject: 'Availability update',
            email: 'second@example.com',
            raw_payload: {},
          },
          {
            id: 'import-3',
            source: 'outlook_sync',
            external_activity_id: 'message-3',
            activity_status: 'sent',
            activity_type: 'email',
            activity_at: new Date('2026-08-21T17:30:01.000Z'),
            created_at: new Date('2026-08-21T17:30:10.000Z'),
            prospect_id: 'prospect-1',
            interaction_id: null,
            subject: 'RE: Availability update',
            email: 'first@example.com',
            raw_payload: {},
          },
        ] };
      }
      if (sql.includes('FROM public.contact_interactions')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  } as any;

  const rows = await listProductionActivities({ pool, userId: 'user-1' });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.id), [
    'import:import-3',
    'import:import-2',
    'import:import-1',
  ]);
});

test('canonical production activities reduce a 96-row dual-capture week to 64 unique sends', async () => {
  const activityAt = (index: number) => new Date(Date.UTC(2026, 7, 20, 16, index, 0));
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.activity_events')) {
        return { rows: Array.from({ length: 32 }, (_, index) => ({
          id: `event-${index}`,
          event_type: 'email_sent',
          direction: 'outbound',
          occurred_at: activityAt(index),
          source: 'codex_followup',
          source_metadata: { captureDirection: 'sent' },
          prospect_id: null,
          interaction_id: null,
          external_event_id: `desktop-${index}`,
          subject: `Prospecting email ${index}`,
          email: `prospect-${index}@example.com`,
        })) };
      }
      if (sql.includes('FROM public.sales_activity_imports')) return { rows: [] };
      if (sql.includes('FROM public.contact_interactions')) {
        return { rows: Array.from({ length: 64 }, (_, index) => ({
          id: `interaction-${index}`,
          date: activityAt(index).toISOString(),
          created_at: activityAt(index),
          type: 'email',
          source_provider: 'outlook',
          source_message_id: `internet-message:<provider-${index}>`,
          source_email_message_id: `email-message-${index}`,
          source_metadata: { direction: 'outbound' },
          prospect_id: `prospect-${index}`,
          email_provider_message_id: `internet-message:<provider-${index}>`,
          email_subject: `Prospecting email ${index}`,
          email_sender_email: 'patrick@example.com',
          email_recipient_emails: [`prospect-${index}@example.com`],
          email_cc_emails: [],
          email_raw_metadata: { internetMessageId: `<provider-${index}>` },
        })) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  } as any;

  const rows = await listProductionActivities({ pool, userId: 'user-1' });

  assert.equal(rows.length, 64);
  assert.equal(rows.filter((row) => row.prospectId).length, 64);
  assert.equal(
    rows.reduce((count, row) => count + Number(row.sourceMetadata.deduplicatedActivityCount === 2), 0),
    32,
  );
});
