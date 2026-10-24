import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSiteInformation, SiteInformationTimeoutError } from './loadSiteInformation'

const empty = { schemaVersion: 1, status: 'not_found', candidates: [], currentZoning: [], sources: [], warnings: [], retrievedAt: '2026-10-23T20:00:00Z', truncated: false }

test('client validates successful evidence without aborting a completed request', async () => {
  const controller = new AbortController()
  assert.deepEqual(await loadSiteInformation(async () => empty, controller), empty)
  assert.equal(controller.signal.aborted, false)
})

test('client rejects a malformed successful response rather than rendering invented data', async () => {
  await assert.rejects(loadSiteInformation(async () => ({ status: 'matched' }), new AbortController()))
})

test('stalled client/session/body reads reach a retryable deadline and abort underlying work', async () => {
  const controller = new AbortController()
  await assert.rejects(loadSiteInformation(() => new Promise(() => {}), controller, 10), SiteInformationTimeoutError)
  assert.equal(controller.signal.aborted, true)
})

test('switch cancellation settles even when the loader ignores its abort signal', async () => {
  const controller = new AbortController()
  const result = loadSiteInformation(() => new Promise(() => {}), controller)
  controller.abort()
  await assert.rejects(result, { name: 'AbortError' })
})

test('already cancelled requests never call the loader', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  await assert.rejects(loadSiteInformation(async () => { calls++; return empty }, controller), { name: 'AbortError' })
  assert.equal(calls, 0)
})
