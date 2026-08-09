import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import {
  clusterViewportPoints,
  type MapMarkerCategory,
  type ViewportMapPoint,
} from './viewportClustering'

const EDMONTON_BOUNDS = {
  north: 53.75,
  east: -113.18,
  south: 53.35,
  west: -113.78,
}

function syntheticProperties(count: number): ViewportMapPoint[] {
  const columns = Math.ceil(Math.sqrt(count))
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const category: MapMarkerCategory = index % 29 === 0
      ? 'review'
      : index % 17 === 0
        ? 'memory'
        : index % 11 === 0
          ? 'client'
          : index % 7 === 0
            ? 'listing'
            : 'prospect'
    return {
      id: `synthetic-${index}`,
      category,
      position: {
        lat: 53.38 + (row / columns) * 0.34,
        lng: -113.74 + (column / columns) * 0.52,
      },
    }
  })
}

for (const size of [1_000, 5_000]) {
  test(`clusters a synthetic ${size.toLocaleString()}-property viewport without rendering every asset`, (context) => {
    const points = syntheticProperties(size)
    clusterViewportPoints(points.slice(0, 20), EDMONTON_BOUNDS, 11)
    const startedAt = performance.now()
    const result = clusterViewportPoints(points, EDMONTON_BOUNDS, 11)
    const durationMs = performance.now() - startedAt
    const represented = result.reduce((total, item) => total + item.count, 0)

    assert.equal(represented, size)
    assert.ok(result.length < Math.min(size / 2, 350), `${result.length} viewport markers were produced`)
    context.diagnostic(`${size.toLocaleString()} properties clustered in ${durationMs.toFixed(1)} ms`)
    // Keep this as a catastrophic-regression guard rather than a microbenchmark:
    // the full test runner executes files concurrently on shared CI machines.
    assert.ok(durationMs < 2_000, `clustering took ${durationMs.toFixed(1)} ms`)
  })
}

test('keeps a selected property as an individual marker outside the viewport', () => {
  const points = [
    ...syntheticProperties(200),
    { id: 'selected', category: 'client' as const, position: { lat: 54.1, lng: -114.2 } },
  ]
  const result = clusterViewportPoints(points, EDMONTON_BOUNDS, 11, {
    selectedIds: new Set(['selected']),
  })
  const selected = result.find((item) => item.id === 'selected')

  assert.equal(selected?.kind, 'point')
  assert.equal(selected?.position.lat, 54.1)
})
