import type { PropertyGisBoundary } from '@level-cre/shared'

type Position = [number, number]
type Relation = 'inside' | 'boundary' | 'outside'
const RADIANS = Math.PI / 180
const EARTH_RADIUS_METRES = 6_371_008.8
const SQUARE_METRES_PER_ACRE = 4046.8564224

function ringArea(ring: Position[]): number {
  let sum = 0
  for (let index = 1; index < ring.length; index++) {
    let delta = (ring[index][0] - ring[index - 1][0]) * RADIANS
    if (delta > Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    sum += delta * (Math.sin(ring[index - 1][1] * RADIANS) + Math.sin(ring[index][1] * RADIANS))
  }
  return Math.abs(sum * EARTH_RADIUS_METRES ** 2 / 2)
}

/** Spherical geodesic screening area of full WGS84 rings; subtract every hole. */
export function boundaryAcres(boundary: PropertyGisBoundary): number | null {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  let area = 0
  for (const rings of polygons) {
    const net = ringArea(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)
    if (!Number.isFinite(net) || net <= 0) return null
    area += net
  }
  return area > 0 && Number.isFinite(area) ? area / SQUARE_METRES_PER_ACRE : null
}

function ringRelation(point: Position, ring: Position[]): Relation {
  const [x, y] = point
  let inside = false
  for (let index = 1; index < ring.length; index++) {
    const [ax, ay] = ring[index - 1], [bx, by] = ring[index]
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy)
    // A repeated closure vertex must not match every point as a zero-length edge.
    if (length === 0) continue
    const tolerance = 1e-10
    const cross = (x - ax) * dy - (y - ay) * dx
    if (Math.abs(cross) <= tolerance * length && x >= Math.min(ax, bx) - tolerance && x <= Math.max(ax, bx) + tolerance && y >= Math.min(ay, by) - tolerance && y <= Math.max(ay, by) + tolerance) return 'boundary'
    if ((ay > y) !== (by > y) && x < dx * (y - ay) / dy + ax) inside = !inside
  }
  return inside ? 'inside' : 'outside'
}

export function boundaryPointRelation(boundary: PropertyGisBoundary, longitude: number, latitude: number): Relation {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  let touchesBoundary = false
  for (const polygon of polygons) {
    const outer = ringRelation([longitude, latitude], polygon[0])
    if (outer === 'outside') continue
    const holes = polygon.slice(1).map(ring => ringRelation([longitude, latitude], ring))
    if (holes.includes('inside')) continue
    if (outer === 'boundary' || holes.includes('boundary')) touchesBoundary = true
    else return 'inside'
  }
  return touchesBoundary ? 'boundary' : 'outside'
}
