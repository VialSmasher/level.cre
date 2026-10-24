import { memo, useEffect, useMemo } from 'react'
import { Polygon, useGoogleMap } from '@react-google-maps/api'
import { googleParcelPaths, type SiteParcelCandidate } from './siteSelection'
import { measureParcelViewport, parcelBounds, parcelViewportFit } from './parcelViewport'

const PREVIEW_STYLE: google.maps.PolygonOptions = {
  fillColor: '#d97706', fillOpacity: 0.09,
  strokeColor: '#b45309', strokeWeight: 2, strokeOpacity: 0.9,
  clickable: false, editable: false, draggable: false, zIndex: 0,
}

export const SiteParcelOverlay = memo(function SiteParcelOverlay({ candidate }: { candidate: SiteParcelCandidate }) {
  const map = useGoogleMap()
  const polygons = useMemo(() => googleParcelPaths(candidate.boundary), [candidate.boundary])
  const { north, south, east, west } = parcelBounds(candidate.boundary) || {}
  const candidateKey = candidate.sourceQualifiedKey
  useEffect(() => {
    if (!map || north === undefined || south === undefined || east === undefined || west === undefined) return
    const frame = requestAnimationFrame(() => {
      const viewport = measureParcelViewport(map.getDiv())
      const fit = parcelViewportFit({ north, south, east, west }, viewport.map, viewport.panels, map.getZoom() ?? 17)
      if (fit) map.moveCamera({ center: fit.center, zoom: fit.zoom })
    })
    return () => cancelAnimationFrame(frame)
  // No viewport subscription: manual pans/zooms remain in the broker's control.
  }, [map, candidateKey, north, south, east, west])
  return <>{polygons.map((paths, index) => <Polygon key={`${candidate.sourceQualifiedKey}:${index}`} paths={paths} options={PREVIEW_STYLE} />)}</>
})
