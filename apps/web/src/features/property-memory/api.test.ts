import assert from 'node:assert/strict'
import test from 'node:test'

import { propertyMemorySearchParams } from './searchParams'

test('property-memory filters serialize in a stable, trimmed order', () => {
  const params = propertyMemorySearchParams({
    activityRecency: '90d',
    zoning: '  IM  ',
    q: '  Henry Bergen ',
    owner: ' Rebel Heart ',
    limit: 500,
  })

  assert.equal(
    params.toString(),
    'q=Henry+Bergen&owner=Rebel+Heart&zoning=IM&activityRecency=90d&limit=50',
  )
})

test('property-memory filters omit empty values and clamp the page size', () => {
  const params = propertyMemorySearchParams({
    q: '   ',
    owner: '',
    linc: '0020-660-76',
    limit: 0,
  })

  assert.equal(params.toString(), 'linc=0020-660-76&limit=1')
})
