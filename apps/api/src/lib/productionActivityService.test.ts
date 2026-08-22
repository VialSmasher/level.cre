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
