import assert from 'node:assert/strict'
import test from 'node:test'

import { ProspectSaveQueue } from './prospectSaveQueue'

test('keeps queued patches tied to their prospect IDs', async () => {
  const saves: Array<{ id: string; patch: Record<string, unknown> }> = []
  const queue = new ProspectSaveQueue<Record<string, unknown>>({
    save: async (id, patch) => { saves.push({ id, patch }) },
    debounceMs: 60_000,
  })

  queue.enqueue('prospect-a', { notes: 'Call owner' })
  queue.enqueue('prospect-b', { status: 'contacted' })

  assert.equal(await queue.flush('prospect-a'), true)
  assert.equal(await queue.flush('prospect-b'), true)
  assert.deepEqual(saves, [
    { id: 'prospect-a', patch: { notes: 'Call owner' } },
    { id: 'prospect-b', patch: { status: 'contacted' } },
  ])
  queue.dispose()
})

test('shares an in-flight flush and drains edits added during the request', async () => {
  let releaseFirst!: () => void
  const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve })
  const saves: Array<Record<string, unknown>> = []
  const queue = new ProspectSaveQueue<Record<string, unknown>>({
    save: async (_id, patch) => {
      saves.push(patch)
      if (saves.length === 1) await firstRequest
    },
    debounceMs: 60_000,
  })

  queue.enqueue('prospect-a', { notes: 'First note' })
  const firstFlush = queue.flush('prospect-a')
  const sharedFlush = queue.flush('prospect-a')
  assert.equal(firstFlush, sharedFlush)

  queue.enqueue('prospect-a', { contactName: 'Pat' })
  releaseFirst()

  assert.equal(await firstFlush, true)
  assert.deepEqual(saves, [
    { notes: 'First note' },
    { contactName: 'Pat' },
  ])
  queue.dispose()
})

test('retains a failed patch for an explicit retry', async () => {
  let attempts = 0
  const queue = new ProspectSaveQueue<Record<string, unknown>>({
    save: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('offline')
    },
    debounceMs: 60_000,
  })

  queue.enqueue('prospect-a', { notes: 'Do not lose this' })
  assert.equal(await queue.flush('prospect-a'), false)
  assert.deepEqual(queue.pendingPatch('prospect-a'), { notes: 'Do not lose this' })
  assert.equal(await queue.flush('prospect-a'), true)
  assert.equal(attempts, 2)
  queue.dispose()
})
