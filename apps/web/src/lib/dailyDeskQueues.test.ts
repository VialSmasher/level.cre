import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyActivityPace, buildDailyDeskQueues, type DailyDeskAction } from './dailyDeskQueues';

function action(id: string, type: string, priorityScore: number, stage?: string): DailyDeskAction {
  return {
    id,
    type,
    priority: priorityScore >= 90 ? 'critical' : priorityScore >= 70 ? 'high' : 'medium',
    priorityScore,
    automationHints: stage ? { stage } : undefined,
  };
}

test('caps Today at three ranked business-development actions and routes overflow to Develop', () => {
  const queues = buildDailyDeskQueues([
    action('a', 'follow_up_due', 99),
    action('c', 'outlook_signal', 88),
    action('d', 'follow_up_due', 82),
    action('e', 'market_watch', 75),
  ]);

  assert.deepEqual(queues.today.map((item) => item.id), ['a', 'c', 'd']);
  assert.deepEqual(queues.develop.map((item) => item.id), ['e']);
});

test('keeps listing progress out of every Daily Desk queue', () => {
  const queues = buildDailyDeskQueues([
    action('listing', 'listing_progress', 99),
    action('follow-up', 'follow_up_due', 82),
  ]);

  assert.deepEqual(queues.today.map((item) => item.id), ['follow-up']);
  assert.deepEqual(queues.waiting, []);
  assert.deepEqual(queues.review, []);
  assert.deepEqual(queues.develop, []);
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

test('builds today pace from prior active days without counting zero days', () => {
  const pace = buildDailyActivityPace([
    { email: 2, call: 2, meeting: 0, other: 0, total: 4 },
    { email: 0, call: 0, meeting: 0, other: 0, total: 0 },
    { email: 3, call: 3, meeting: 0, other: 0, total: 6 },
    { email: 1, call: 1, meeting: 0, other: 0, total: 2 },
  ]);

  assert.equal(pace.recentActiveDayAverage, 5);
  assert.equal(pace.today.total, 2);
  assert.equal(pace.remainingToPace, 3);
  assert.equal(pace.progressPercent, 40);
});

test('does not invent an activity target before a personal baseline exists', () => {
  const pace = buildDailyActivityPace([
    { email: 0, call: 1, meeting: 0, other: 0, total: 1 },
  ]);

  assert.equal(pace.hasBaseline, false);
  assert.equal(pace.recentActiveDayAverage, 0);
  assert.equal(pace.remainingToPace, 0);
  assert.equal(pace.progressPercent, 100);
});

test('prefers the broker configured daily call target when one exists', () => {
  const pace = buildDailyActivityPace([
    { email: 4, call: 3, meeting: 1, other: 0, total: 8 },
  ], 12);

  assert.equal(pace.hasConfiguredCallTarget, true);
  assert.equal(pace.goalKind, 'calls');
  assert.equal(pace.completed, 3);
  assert.equal(pace.paceTarget, 12);
  assert.equal(pace.remainingToPace, 9);
  assert.equal(pace.progressPercent, 25);
});
