import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ProspectReferenceError,
  requireActiveOwnedProspect,
} from './prospectReferenceService'

test('active prospect reference checks are owner-scoped and can lock the row', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const db = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values })
      return { rows: [{ id: 'prospect-1', merged_into_prospect_id: null }] }
    },
  }
  const result = await requireActiveOwnedProspect({
    db: db as never,
    userId: 'user-1',
    prospectId: 'prospect-1',
    lock: true,
  })
  assert.deepEqual(result, { id: 'prospect-1' })
  assert.deepEqual(calls[0].values, ['prospect-1', 'user-1'])
  assert.match(calls[0].sql, /WHERE id = \$1 AND user_id = \$2/)
  assert.match(calls[0].sql, /FOR UPDATE/)
})
test('a tombstoned prospect returns its canonical redirect', async () => {
  const db = {
    query: async () => ({
      rows: [{ id: 'duplicate', merged_into_prospect_id: 'canonical' }],
    }),
  }
  await assert.rejects(
    requireActiveOwnedProspect({
      db: db as never,
      userId: 'user-1',
      prospectId: 'duplicate',
    }),
    (error: unknown) => error instanceof ProspectReferenceError
      && error.status === 409
      && error.code === 'prospect_merged'
      && error.canonicalProspectId === 'canonical',
  )
})

test('another broker cannot use a prospect reference', async () => {
  const db = { query: async () => ({ rows: [] }) }
  await assert.rejects(
    requireActiveOwnedProspect({
      db: db as never,
      userId: 'user-2',
      prospectId: 'prospect-1',
    }),
    (error: unknown) => error instanceof ProspectReferenceError
      && error.status === 404
      && error.code === 'prospect_not_found',
  )
})
