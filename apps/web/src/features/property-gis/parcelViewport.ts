import type { SiteParcelCandidate } from './siteSelection'

export type ViewportRect = { left: number; top: number; width: number; height: number }
export type ParcelBounds = { north: number; south: number; east: number; west: number }

/** Space needed to scroll the last action clear of a floating call card. */
export function bottomOverlayInset(viewport: ViewportRect, overlays: ViewportRect[], gutter = 12): number {
  if (viewport.width <= 0 || viewport.height <= 0 || !Object.values(viewport).every(Number.isFinite)) return 0
  const bottom = viewport.top + viewport.height
  return overlays.reduce((inset, overlay) => {
    const overlaps = overlay.left < viewport.left + viewport.width && overlay.left + overlay.width > viewport.left
      && overlay.top < bottom && overlay.top + overlay.height > viewport.top
    return overlaps ? Math.max(inset, Math.min(viewport.height, bottom - overlay.top) + gutter) : inset
  }, 0)
}

/** Bound clearance to the visible outer profile, never its intrinsic contents. */
export function profileCallInset(profile: ViewportRect, overlays: ViewportRect[], viewportHeight: number, viewportTop = 0): number {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(viewportTop) || viewportHeight <= 0) return 0
  const top = Math.max(profile.top, viewportTop)
  const bottom = Math.min(profile.top + profile.height, viewportTop + viewportHeight)
  return bottomOverlayInset({ left: profile.left, top, width: profile.width, height: Math.max(0, bottom - top) }, overlays)
}

/** Read all rings and parts without changing the municipality's geometry. */
export function parcelBounds(boundary: SiteParcelCandidate['boundary']): ParcelBounds | null {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return null
    north = Math.max(north, lat)
    south = Math.min(south, lat)
    east = Math.max(east, lng)
    west = Math.min(west, lng)
  }
  return Number.isFinite(north) ? { north, south, east, west } : null
}

/** Largest unobscured rectangular area; handles right panels and inset bottom sheets. */
export function visibleMapRect(map: ViewportRect, panels: ViewportRect[], gutter = 20): ViewportRect | null {
  if (map.width <= 0 || map.height <= 0) return null
  // DOMRect exposes these values through prototype getters, not enumerable fields.
  let visible = { left: map.left, top: map.top, width: map.width, height: map.height }
  for (const panel of panels) {
    const left = Math.max(visible.left, panel.left)
    const top = Math.max(visible.top, panel.top)
    const right = Math.min(visible.left + visible.width, panel.left + panel.width)
    const bottom = Math.min(visible.top + visible.height, panel.top + panel.height)
    if (right <= left || bottom <= top) continue
    const spaces = [
      { ...visible, width: left - visible.left },
      { ...visible, left: right, width: visible.left + visible.width - right },
      { ...visible, height: top - visible.top },
      { ...visible, top: bottom, height: visible.top + visible.height - bottom },
    ]
    visible = spaces.reduce((largest, space) => space.width * space.height > largest.width * largest.height ? space : largest)
  }
  if (visible.width <= 0 || visible.height <= 0) return null
  const inset = Math.min(gutter, visible.width / 8, visible.height / 8)
  return { left: visible.left + inset, top: visible.top + inset, width: visible.width - inset * 2, height: visible.height - inset * 2 }
}

const mercatorY = (latitude: number) => (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2
const latitudeAt = (y: number) => (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * 180 / Math.PI

/** Shared Web Mercator camera fit for Google Maps and the isolated Leaflet preview. */
export function parcelViewportFit(bounds: ParcelBounds, map: ViewportRect, panels: ViewportRect[], currentZoom: number) {
  const visible = visibleMapRect(map, panels)
  if (!visible) return null
  const west = (bounds.west + 180) / 360, east = (bounds.east + 180) / 360
  const north = mercatorY(bounds.north), south = mercatorY(bounds.south)
  // A nearly covered canvas should not zoom out wildly. Centre the parcel in the
  // remaining strip at the current zoom; the user can close the panel for a full fit.
  const preserveZoom = visible.width < 160 || visible.height < 96
  const fittedZoom = Math.floor(Math.min(
    Math.log2(visible.width / (256 * Math.max(east - west, Number.EPSILON))),
    Math.log2(visible.height / (256 * Math.max(south - north, Number.EPSILON))),
  ))
  const zoom = preserveZoom && Number.isFinite(currentZoom) ? currentZoom : Math.max(0, Math.min(19, fittedZoom))
  const scale = 256 * 2 ** zoom
  const x = (east + west) / 2 + (map.width / 2 - (visible.left - map.left + visible.width / 2)) / scale
  const y = (north + south) / 2 + (map.height / 2 - (visible.top - map.top + visible.height / 2)) / scale
  return { center: { lat: latitudeAt(y), lng: x * 360 - 180 }, zoom, preserveZoom }
}

/** Only measured, displayed panels count; desktop preview already reduces canvas width. */
export function measureParcelViewport(element: HTMLElement) {
  const map = element.getBoundingClientRect()
  const panels = Array.from(element.ownerDocument.querySelectorAll<HTMLElement>('[data-testid="asset-profile"], [data-property-gis-panel], [data-property-gis-occluder], [aria-label="Pending map call"]'))
    .filter(panel => panel.getClientRects().length > 0)
    .map(panel => panel.getBoundingClientRect())
  return { map, panels }
}
