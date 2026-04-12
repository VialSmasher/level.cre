import test from 'node:test'
import assert from 'node:assert/strict'

import { isToolAPostAuthRedirect, sanitizePostAuthRedirect } from './postAuthRedirect'

test('sanitizePostAuthRedirect allows supported Tool A routes with params and hashes', () => {
  assert.equal(
    sanitizePostAuthRedirect('/app/workspaces/abc-123?tab=notes#activity'),
    '/app/workspaces/abc-123?tab=notes#activity',
  )
  assert.equal(
    sanitizePostAuthRedirect('/broker-stats/?range=30'),
    '/broker-stats?range=30',
  )
})

test('sanitizePostAuthRedirect allows supported Tool B routes', () => {
  assert.equal(
    sanitizePostAuthRedirect('/tools/industrial-intel/requirements?draft=1'),
    '/tools/industrial-intel/requirements?draft=1',
  )
})

test('sanitizePostAuthRedirect rejects external or unsupported paths', () => {
  assert.equal(sanitizePostAuthRedirect('https://example.com/app'), null)
  assert.equal(sanitizePostAuthRedirect('//example.com/app'), null)
  assert.equal(sanitizePostAuthRedirect('/privacy'), null)
  assert.equal(sanitizePostAuthRedirect('/app/../privacy'), null)
})

test('isToolAPostAuthRedirect only accepts Tool A destinations', () => {
  assert.equal(isToolAPostAuthRedirect('/app/requirements'), true)
  assert.equal(isToolAPostAuthRedirect('/leaderboard'), true)
  assert.equal(isToolAPostAuthRedirect('/tools/industrial-intel'), false)
  assert.equal(isToolAPostAuthRedirect('/privacy'), false)
})
