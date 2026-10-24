import assert from 'node:assert/strict'
import test from 'node:test'
import { parcelBounds, parcelViewportFit, visibleMapRect, type ViewportRect } from './parcelViewport'

const boundary = { type: 'Polygon' as const, coordinates: [[[-113.574, 53.577], [-113.572, 53.577], [-113.572, 53.579], [-113.574, 53.579], [-113.574, 53.577]]] as [number, number][][] }
const bounds = parcelBounds(boundary)!
const desktop = { left: 100, top: 80, width: 1200, height: 800 }

function assertParcelVisible(map: ViewportRect, panels: ViewportRect[]) {
  const fit = parcelViewportFit(bounds, map, panels, 17)!
  const visible = visibleMapRect(map, panels)!
  const y = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2
  for (const lng of [bounds.west, bounds.east]) for (const lat of [bounds.north, bounds.south]) {
    const scale = 256 * 2 ** fit.zoom
    const px = map.left + map.width / 2 + (lng - fit.center.lng) / 360 * scale
    const py = map.top + map.height / 2 + (y(lat) - y(fit.center.lat)) * scale
    assert.ok(px >= visible.left - 0.01 && px <= visible.left + visible.width + 0.01)
    assert.ok(py >= visible.top - 0.01 && py <= visible.top + visible.height + 0.01)
  }
}

test('desktop right profile is excluded from the parcel fit', () => {
  const panels = [{ left: 980, top: 80, width: 320, height: 800 }]
  assert.deepEqual(visibleMapRect(desktop, panels), { left: 120, top: 100, width: 840, height: 760 })
  assertParcelVisible(desktop, panels)
})

test('mobile bottom sheet leaves the parcel above the panel', () => {
  const map = { left: 0, top: 170, width: 390, height: 640 }
  const panels = [{ left: 8, top: 480, width: 374, height: 322 }]
  assert.deepEqual(visibleMapRect(map, panels), { left: 20, top: 190, width: 350, height: 270 })
  assertParcelVisible(map, panels)
})

test('browser DOMRect-style prototype getters produce a finite panel-aware camera fit', () => {
  const browserRect = (values: ViewportRect): ViewportRect => {
    const prototype = {}
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      Object.defineProperty(prototype, key, { get: () => values[key] })
    }
    return Object.create(prototype) as ViewportRect
  }
  const map = browserRect({ left: 0, top: 170, width: 390, height: 640 })
  const panels = [browserRect({ left: 8, top: 480, width: 374, height: 322 })]
  assert.deepEqual({ ...map }, {})
  assert.deepEqual(visibleMapRect(map, panels), { left: 20, top: 190, width: 350, height: 270 })
  const fit = parcelViewportFit(bounds, map, panels, 17)!
  assert.ok(Number.isFinite(fit.center.lat) && Number.isFinite(fit.center.lng) && Number.isFinite(fit.zoom))
  assertParcelVisible(map, panels)
})

test('desktop preview with an already narrowed canvas does not double-count the panel', () => {
  const map = { left: 0, top: 100, width: 900, height: 700 }
  const panels = [{ left: 900, top: 100, width: 380, height: 700 }]
  assert.deepEqual(visibleMapRect(map, panels), visibleMapRect(map, []))
  assertParcelVisible(map, panels)
})

test('a tiny visible strip preserves current zoom instead of zooming far out', () => {
  const map = { left: 0, top: 0, width: 390, height: 600 }
  const fit = parcelViewportFit(bounds, map, [{ left: 0, top: 65, width: 390, height: 535 }], 17)!
  assert.equal(fit.preserveZoom, true)
  assert.equal(fit.zoom, 17)
  assert.ok(Number.isFinite(fit.center.lat) && Number.isFinite(fit.center.lng))
  assert.equal(parcelViewportFit(bounds, map, [map], 17), null)
})

test('zero-size canvases are ignored and tiny parcels have a sensible maximum zoom', () => {
  assert.equal(visibleMapRect({ ...desktop, width: 0 }, []), null)
  assert.equal(parcelViewportFit({ north: 53.578, south: 53.578, east: -113.573, west: -113.573 }, desktop, [], 17)?.zoom, 19)
})

test('bounds include all MultiPolygon parts and holes without mutating the source', () => {
  const shape = { type: 'MultiPolygon' as const, coordinates: [boundary.coordinates, [[[-113.580, 53.581], [-113.579, 53.581], [-113.579, 53.582], [-113.580, 53.581]]]] as [number, number][][][] }
  const original = JSON.stringify(shape)
  assert.deepEqual(parcelBounds(shape), { north: 53.582, south: 53.577, east: -113.572, west: -113.580 })
  assert.equal(JSON.stringify(shape), original)
  assert.equal(parcelBounds({ type: 'Polygon', coordinates: [[[NaN, 53]]] }), null)
})
