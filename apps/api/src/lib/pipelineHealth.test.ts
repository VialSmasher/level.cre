import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPipelineHealth } from './pipelineHealth';

test('pipeline health measures next-action coverage only across active stages', () => {
  const health = buildPipelineHealth([
    { status: 'contacted', follow_up_due_date: '2026-07-09T15:00:00.000Z', last_contact_date: '2026-07-09T15:00:00.000Z' },
    { status: 'listing', follow_up_due_date: '2026-07-20T15:00:00.000Z', last_interaction_at: '2026-07-08T15:00:00.000Z' },
    { status: 'client', follow_up_due_date: null, updated_at: '2026-06-01T15:00:00.000Z' },
    { status: 'prospect', follow_up_due_date: null, updated_at: '2026-01-01T15:00:00.000Z' },
    { status: 'no_go', follow_up_due_date: '2026-07-01T15:00:00.000Z', updated_at: '2026-01-01T15:00:00.000Z' },
  ], new Date('2026-07-10T15:00:00.000Z'));

  assert.deepEqual(health, {
    activeProspects: 3,
    withNextAction: 2,
    missingNextAction: 1,
    overdueNextActions: 1,
    stalledProspects: 1,
    nextActionCoveragePercent: 67,
  });
});

test('an empty active pipeline reports complete coverage without dividing by zero', () => {
  const health = buildPipelineHealth([{ status: 'prospect' }, { status: 'no_go' }]);
  assert.equal(health.activeProspects, 0);
  assert.equal(health.nextActionCoveragePercent, 100);
});
