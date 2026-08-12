import test from 'node:test';
import assert from 'node:assert/strict';

import { processSalesProspectMapBatch, SalesProspectMapBatchSchema } from './salesProspectMappingService';

const verifiedCandidate = {
  externalActivityId: 'outlook-message-1',
  activitySource: 'codex_followup',
  observedAt: '2026-08-12T12:00:00.000Z',
  company: 'Norquest Industries',
  contactName: 'Doug Hayward',
  contactEmail: 'doug@example.com',
  websiteUrl: 'https://example.com',
  address: '3911 74 Avenue NW, Edmonton, AB',
  latitude: 53.5101,
  longitude: -113.4012,
  addressSource: 'company_website',
  confidence: 95,
  verified: true,
};

test('verified sales prospect map batches require source-backed map-ready evidence', () => {
  const parsed = SalesProspectMapBatchSchema.parse({ candidates: [verifiedCandidate] });

  assert.equal(parsed.source, 'codex_sales_prospect');
  assert.equal(parsed.candidates[0].verified, true);
  assert.equal(parsed.candidates[0].activitySource, 'codex_followup');
});

test('unverified or low-confidence locations cannot enter automatic map processing', () => {
  assert.equal(SalesProspectMapBatchSchema.safeParse({
    candidates: [{ ...verifiedCandidate, verified: false }],
  }).success, false);
  assert.equal(SalesProspectMapBatchSchema.safeParse({
    candidates: [{ ...verifiedCandidate, confidence: 79 }],
  }).success, false);
  assert.equal(SalesProspectMapBatchSchema.safeParse({
    candidates: [{ ...verifiedCandidate, latitude: null }],
  }).success, false);
});

test('a clear verified location creates one mapped prospect without waiting for an activity match', async () => {
  const queries: string[] = [];
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM public.prospects') && sql.includes('SELECT id, address, contact_email, market_key')) {
        return { rows: [] };
      }
      if (sql.includes('FROM public.sales_activity_imports')) return { rows: [] };
      if (sql.includes('FROM public.prospects') && sql.includes('SELECT id, name, address')) return { rows: [] };
      if (sql.includes('FROM public.listings')) return { rows: [] };
      if (sql.includes('FROM public.intel_property_dossiers')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  } as any;
  const created: any[] = [];
  const result = await processSalesProspectMapBatch({
    pool,
    storage: {
      createProspect: async (input: any) => {
        created.push(input);
        return { id: 'prospect-new-1', ...input };
      },
      createContactInteraction: async () => ({ id: 'unused' }),
    } as any,
    userId: 'user-1',
    payload: SalesProspectMapBatchSchema.parse({ candidates: [verifiedCandidate] }),
  });

  assert.equal(result.created, 1);
  assert.equal(result.needsReview, 0);
  assert.equal(result.activityLinked, 0);
  assert.equal(created[0].address, verifiedCandidate.address);
  assert.deepEqual(created[0].geometry.coordinates, [verifiedCandidate.longitude, verifiedCandidate.latitude]);
  assert.equal(queries.some((sql) => sql.includes('UPDATE public.prospects')), true);
});

test('an exact normalized civic address reuses the existing prospect across the full prospect set', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.prospects') && sql.includes('SELECT id, address, contact_email, market_key')) {
        return { rows: [{
          id: 'prospect-existing-1',
          address: '3911 74 Ave NW, Edmonton, Alberta',
          contact_email: null,
          market_key: null,
        }] };
      }
      if (sql.includes('FROM public.sales_activity_imports')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  } as any;
  let created = false;
  const result = await processSalesProspectMapBatch({
    pool,
    storage: {
      createProspect: async () => {
        created = true;
        return { id: 'unexpected' };
      },
      createContactInteraction: async () => ({ id: 'unused' }),
    } as any,
    userId: 'user-1',
    payload: SalesProspectMapBatchSchema.parse({ candidates: [verifiedCandidate] }),
  });

  assert.equal(created, false);
  assert.equal(result.linkedExisting, 1);
  assert.equal(result.results[0].prospectId, 'prospect-existing-1');
});
