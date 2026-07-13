import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyDeskQueues, type DailyDeskAction } from './dailyDeskQueues';

function action(id: string, type: string, priorityScore: number, stage?: string): DailyDeskAction {
  return {
    id,
    type,
    priority: priorityScore >= 90 ? 'critical' : priorityScore >= 70 ? 'high' : 'medium',
    priorityScore,
    automationHints: stage ? { stage } : undefined,
  };
}

test('caps Today at three ranked actions and routes overflow to Develop', () => {
  const queues = buildDailyDeskQueues([
    action('a', 'follow_up_due', 99),
    action('b', 'listing_progress', 94),
    action('c', 'outlook_signal', 88),
    action('d', 'follow_up_due', 82),
  ]);

  assert.deepEqual(queues.today.map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(queues.develop.map((item) => item.id), ['d']);
});

test('keeps waiting, cleanup, and stale work out of Today without duplicating rows', () => {
  const queues = buildDailyDeskQueues([
    action('waiting', 'outlook_signal', 95, 'waiting_on_reply'),
    action('cleanup', 'email_cleanup', 90),
    action('stale', 'stale_prospect', 88),
  ]);

  assert.deepEqual(queues.today, []);
  assert.deepEqual(queues.waiting.map((item) => item.id), ['waiting']);
  assert.deepEqual(queues.review.map((item) => item.id), ['cleanup']);
  assert.deepEqual(queues.develop.map((item) => item.id), ['stale']);
});
