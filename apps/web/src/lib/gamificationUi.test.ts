import test from 'node:test';
import assert from 'node:assert/strict';
import { quickLogSpecFor } from './gamificationUi';

test('quickLogSpecFor returns expected call mapping', () => {
  const spec = quickLogSpecFor('call');
  assert.equal(spec.note, 'Phone call follow-up');
  assert.equal(spec.xp, 15);
  assert.equal(spec.followUpDays, 30);
  assert.equal(spec.toastLabel, 'Call logged');
});

test('quickLogSpecFor returns expected meeting mapping', () => {
  const spec = quickLogSpecFor('meeting');
  assert.equal(spec.note, 'Meeting follow-up');
  assert.equal(spec.xp, 25);
  assert.equal(spec.followUpDays, 7);
  assert.equal(spec.toastLabel, 'Meeting logged');
});
