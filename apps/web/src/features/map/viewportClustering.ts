export type MapMarkerCategory = 'prospect' | 'listing' | 'client' | 'memory' | 'review'

export type ViewportBounds = {
  north: number
  east: number
  south: number
  west: number
}

export type ViewportMapPoint = {
  id: string
  position: { lat: number; lng: number }
  category: MapMarkerCategory
}

export type ViewportPointResult<T extends ViewportMapPoint> = {
  kind: 'point'
  id: string
  point: T
  position: T['position']
  count: 1
  categories: Partial<Record<MapMarkerCategory, number>>
}

export type ViewportClusterResult = {
  kind: 'cluster'
  id: string
  position: { lat: number; lng: number }
  count: number
  pointIds: string[]
  categories: Partial<Record<MapMarkerCategory, number>>
}

export type ViewportClusterResultItem<T extends ViewportMapPoint> =
  | ViewportPointResult<T>
  | ViewportClusterResult

const DEFAULT_GRID_SIZE_PX = 72
const DEFAULT_VIEWPORT_PADDING = 0.15
const MAX_MERCATOR_LATITUDE = 85.05112878

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function longitudeSpan(bounds: ViewportBounds) {
  return bounds.east >= bounds.west
    ? bounds.east - bounds.west
    : (180 - bounds.west) + (bounds.east + 180)
}

export function padViewportBounds(
  bounds: ViewportBounds,
  padding = DEFAULT_VIEWPORT_PADDING,
): ViewportBounds {
  const latPadding = Math.max((bounds.north - bounds.south) * padding, 0.002)
  const lngPadding = Math.max(longitudeSpan(bounds) * padding, 0.002)
  let west = bounds.west - lngPadding
  let east = bounds.east + lngPadding
  if (west < -180) west += 360
  if (east > 180) east -= 360
  return {
    north: clamp(bounds.north + latPadding, -90, 90),
    east,
    south: clamp(bounds.south - latPadding, -90, 90),
    west,
  }
}

export function pointInViewport(position: { lat: number; lng: number }, bounds: ViewportBounds) {
  if (position.lat < bounds.south || position.lat > bounds.north) return false
  return bounds.west <= bounds.east
    ? position.lng >= bounds.west && position.lng <= bounds.east
    : position.lng >= bounds.west || position.lng <= bounds.east
}

function worldPixel(position: { lat: number; lng: number }, zoom: number) {
  const scale = 256 * (2 ** Math.max(0, Math.round(zoom)))
  const latitude = clamp(position.lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const sine = Math.sin(latitude * Math.PI / 180)
  return {
    x: ((position.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale,
  }
}

function incrementCategory(
  categories: Partial<Record<MapMarkerCategory, number>>,
  category: MapMarkerCategory,
) {
  categories[category] = (categories[category] || 0) + 1
}

/**
 * Bins only the padded viewport into screen-sized cells. Selected records are
 * emitted as individual points even if they are offscreen or share a cell.
 * This keeps map work proportional to what the broker can see, not the size of
 * the entire market-memory collection.
 */
export function clusterViewportPoints<T extends ViewportMapPoint>(
  points: T[],
  bounds: ViewportBounds | null,
  zoom: number,
  options: {
    selectedIds?: ReadonlySet<string>
    gridSizePx?: number
    viewportPadding?: number
  } = {},
): ViewportClusterResultItem<T>[] {
  const selectedIds = options.selectedIds || new Set<string>()
  const gridSizePx = Math.max(options.gridSizePx || DEFAULT_GRID_SIZE_PX, 24)
  const paddedBounds = bounds ? padViewportBounds(bounds, options.viewportPadding) : null
  const selectedResults: ViewportPointResult<T>[] = []
  const cells = new Map<string, {
    points: T[]
    latTotal: number
    lngTotal: number
    categories: Partial<Record<MapMarkerCategory, number>>
  }>()

  for (const point of points) {
    if (!Number.isFinite(point.position.lat) || !Number.isFinite(point.position.lng)) continue
    if (selectedIds.has(point.id)) {
      selectedResults.push({
        kind: 'point',
        id: point.id,
        point,
        position: point.position,
        count: 1,
        categories: { [point.category]: 1 },
      })
      continue
    }
    if (!paddedBounds || !pointInViewport(point.position, paddedBounds)) continue
    const pixel = worldPixel(point.position, zoom)
    const cellKey = `${Math.floor(pixel.x / gridSizePx)}:${Math.floor(pixel.y / gridSizePx)}`
    const cell = cells.get(cellKey) || {
      points: [],
      latTotal: 0,
      lngTotal: 0,
      categories: {},
    }
    cell.points.push(point)
    cell.latTotal += point.position.lat
    cell.lngTotal += point.position.lng
    incrementCategory(cell.categories, point.category)
    cells.set(cellKey, cell)
  }

  const viewportResults = Array.from(cells.entries()).map<ViewportClusterResultItem<T>>(([cellKey, cell]) => {
    if (cell.points.length === 1) {
      const point = cell.points[0]
      return {
        kind: 'point',
        id: point.id,
        point,
        position: point.position,
        count: 1,
        categories: cell.categories,
      }
    }
    return {
      kind: 'cluster',
      id: `cluster:${Math.round(zoom)}:${cellKey}`,
      position: {
        lat: cell.latTotal / cell.points.length,
        lng: cell.lngTotal / cell.points.length,
      },
      count: cell.points.length,
      pointIds: cell.points.map((point) => point.id),
      categories: cell.categories,
    }
  })

  return [...viewportResults, ...selectedResults].sort((left, right) => left.id.localeCompare(right.id))
}
