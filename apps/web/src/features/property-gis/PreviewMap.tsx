import { useEffect, useRef, useState } from 'react'
import type { SiteParcelCandidate } from './siteSelection'
import { measureParcelViewport, parcelBounds, parcelViewportFit } from './parcelViewport'

export type PublicMapLocation = { id: string; label: string; latitude: number; longitude: number }

type MapLayer = { addTo(map: LeafletMap): MapLayer; remove(): void; bindTooltip(label: string): MapLayer; on(event: string, handler: () => void): MapLayer }
type LeafletMap = { setView(point: number[], zoom: number, options?: { animate: boolean }): LeafletMap; getZoom(): number; panTo(point: number[]): void; invalidateSize(): void; remove(): void; on(event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void): void }
type Leaflet = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap
  tileLayer(url: string, options: Record<string, unknown>): MapLayer
  circleMarker(point: number[], options: Record<string, unknown>): MapLayer
  geoJSON(geometry: unknown, options: Record<string, unknown>): MapLayer
}
declare global { interface Window { L?: Leaflet } }

export function PreviewMap({ locations, selected, candidate, onSelect }: {
  locations: PublicMapLocation[]
  selected: PublicMapLocation | null
  candidate: SiteParcelCandidate | null
  onSelect: (location: PublicMapLocation) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  onSelectRef.current = onSelect
  const bounds = candidate ? parcelBounds(candidate.boundary) : null
  const { north, south, east, west } = bounds || {}
  const candidateKey = candidate?.sourceQualifiedKey

  useEffect(() => {
    const leaflet = window.L
    if (!element.current || !leaflet) { setFailed(true); return }
    const map = leaflet.map(element.current, { zoomControl: true }).setView([53.578, -113.573], 17)
    mapRef.current = map
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', maxZoom: 19,
    }).addTo(map)
    for (const location of locations) {
      leaflet.circleMarker([location.latitude, location.longitude], {
        radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, bubblingMouseEvents: false,
      }).addTo(map).bindTooltip(location.label).on('click', () => onSelectRef.current(location))
    }
    map.on('click', (event) => onSelectRef.current({
      id: `point:${event.latlng.lat.toFixed(6)}:${event.latlng.lng.toFixed(6)}`,
      label: 'Map location', latitude: event.latlng.lat, longitude: event.latlng.lng,
    }))
    setReady(true)
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(element.current)
    return () => { resize.disconnect(); map.remove(); mapRef.current = null }
  }, [locations])

  useEffect(() => {
    if (!ready || !selected) return
    mapRef.current?.panTo([selected.latitude, selected.longitude])
  }, [ready, selected?.id])

  useEffect(() => {
    if (!ready || !selected || !mapRef.current || !window.L) return
    const marker = window.L.circleMarker([selected.latitude, selected.longitude], {
      radius: 5, color: '#fff', weight: 2, fillColor: '#0f172a', fillOpacity: 1, interactive: false,
    }).addTo(mapRef.current)
    return () => marker.remove()
  }, [ready, selected])

  useEffect(() => {
    if (!ready || !candidate || !mapRef.current || !window.L) return
    const layer = window.L.geoJSON(candidate.boundary, {
      style: { color: '#b45309', weight: 2, fillColor: '#d97706', fillOpacity: 0.12, dashArray: '6 4' },
      interactive: false,
    }).addTo(mapRef.current)
    return () => layer.remove()
  }, [candidate, ready])

  useEffect(() => {
    if (!ready || north === undefined || south === undefined || east === undefined || west === undefined) return
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current
      if (!map || !element.current) return
      const viewport = measureParcelViewport(element.current)
      const fit = parcelViewportFit({ north, south, east, west }, viewport.map, viewport.panels, map.getZoom())
      if (fit) map.setView([fit.center.lat, fit.center.lng], fit.zoom, { animate: false })
    })
    return () => cancelAnimationFrame(frame)
  // Refit only when a boundary is shown/changed, never on a normal render or map pan.
  }, [ready, candidateKey, north, south, east, west])

  return (
    <div className="relative isolate h-full w-full bg-slate-100" aria-label="Edmonton parcel map">
      <div ref={element} className="h-full w-full" />
      {failed ? <p role="alert" className="absolute left-4 top-4 max-w-sm rounded bg-white p-3 text-sm text-slate-700">The basemap could not load. You can still inspect parcel information using the property buttons.</p> : null}
      <div className="pointer-events-none absolute bottom-7 left-3 z-[500] rounded border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
        Blue: public sample locations{candidate ? ' · Amber: parcel preview' : ''}
      </div>
    </div>
  )
}
