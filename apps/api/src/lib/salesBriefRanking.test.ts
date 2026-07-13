import test from 'node:test';
import assert from 'node:assert/strict';

import { rankEmailCleanup, rankFollowUpReminder } from './salesBriefRanking';

test('keeps a recent overdue follow-up urgent', () => {
  const rank = rankFollowUpReminder({ dueInDays: -4, prospectStatus: 'contacted' });
  assert.equal(rank.titlePrefix, 'Overdue follow-up');
  assert.ok(rank.score >= 70);
});

test('de-escalates an ancient reminder instead of making it critical', () => {
  const rank = rankFollowUpReminder({ dueInDays: -180, prospectStatus: 'contacted' });
  assert.equal(rank.titlePrefix, 'Review old reminder');
  assert.ok(rank.score < 45);
  assert.match(rank.reason, /still active/i);
});

test('does not make old email cleanup more urgent than fresh evidence', () => {
  assert.ok(rankEmailCleanup(2, false) > rankEmailCleanup(120, false));
});
