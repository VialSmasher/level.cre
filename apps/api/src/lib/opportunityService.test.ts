import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LISTING_PURSUIT_STEPS,
  OpportunityCreateSchema,
  OpportunityServiceError,
  OpportunityStageChangeSchema,
  changeOpportunityStage,
  createOpportunity,
} from './opportunityService';

function transactionalPool(handler: (sql: string, params?: unknown[]) => Promise<any>) {
  const client = {
    query: handler,
    release: () => undefined,
  };
  return { connect: async () => client } as any;
}

test('listing pursuit creation seeds a durable playbook without advancing the stage', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = transactionalPool(async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO public.opportunities')) {
      return { rows: [{ id: 'opportunity-1', type: 'listing_pursuit', stage: 'target' }] };
    }
    return { rows: [] };
  });

  const result = await createOpportunity({
    pool,
    userId: 'user-1',
    input: OpportunityCreateSchema.parse({
      type: 'listing_pursuit',
      title: '703 23 Ave Nisku listing pursuit',
      propertyAddress: '703 23 Ave, Nisku, AB',
      source: 'patrick_bootstrap',
    }),
  }) as any;

  assert.equal(result.stage, 'target');
  const playbookQuery = queries.find((query) => query.sql.includes('unnest($3::varchar[])'));
  assert.deepEqual(playbookQuery?.params[2], [...LISTING_PURSUIT_STEPS]);
  assert.equal(queries.some((query) => query.sql.includes('opportunity_stage_events')), true);
});

test('inferred evidence cannot close an opportunity as won or lost', async () => {
  const input = OpportunityStageChangeSchema.parse({
    toStage: 'lost',
    evidenceStatus: 'inferred',
    confidence: 80,
    source: 'codex',
  });
  await assert.rejects(
    changeOpportunityStage({
      pool: transactionalPool(async () => ({ rows: [] })),
      userId: 'user-1',
      opportunityId: 'opportunity-1',
      input,
    }),
    (error: unknown) => error instanceof OpportunityServiceError && error.status === 400,
  );
});
