import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLeaderboardIdentities } from './leaderboardIdentity'

test('removes zero-activity placeholder accounts but keeps a new current user visible', () => {
  const board = buildLeaderboardIdentities([
    { userId: 'active', userEmail: 'jack@example.com', displayName: 'Jack Norris', prospectingXp: 200 },
    { userId: 'placeholder', userEmail: 'jack.norris@example.com', displayName: null },
    { userId: 'current', userEmail: 'new.broker@example.com', displayName: null },
  ], 'current')

  assert.deepEqual(board.map((entry) => entry.user_id), ['active', 'current'])
  assert.equal(board[1].display_name, 'New Broker')
})

test('consolidates exact duplicate email identities without merging auth users', () => {
  const board = buildLeaderboardIdentities([
    { userId: 'legacy', userEmail: 'patrick@example.com', displayName: 'Pat Livingston', prospectingXp: 50 },
    { userId: 'current', userEmail: 'PATRICK@example.com', displayName: 'Pat L', prospectingXp: 100, followUpXp: 25 },
  ], 'current')

  assert.equal(board.length, 1)
  assert.equal(board[0].user_id, 'current')
  assert.equal(board[0].display_name, 'Pat L')
  assert.equal(board[0].xp_total, 175)
  assert.equal(board[0].identity_count, 2)
})
