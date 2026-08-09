import { memo, useMemo } from 'react'
import { useGoogleMap } from '@react-google-maps/api'

import { AdvancedMapMarker } from './AdvancedMapMarker'
import {
  clusterViewportPoints,
  type MapMarkerCategory,
  type ViewportBounds,
  type ViewportMapPoint,
} from './viewportClustering'

export type ClusteredMapMarkerEntry = ViewportMapPoint & {
  title: string
  color: string
  borderColor?: string
  label?: string
  scale?: number
  zIndex?: number
  onClick: () => void
}

const CATEGORY_LABELS: Record<MapMarkerCategory, string> = {
  prospect: 'prospects',
  listing: 'listings',
  client: 'clients',
  memory: 'market memory',
  review: 'review items',
}

const CATEGORY_CLUSTER_COLORS: Record<MapMarkerCategory, string> = {
  prospect: '#2563EB',
  listing: '#DC2626',
  client: '#16A34A',
  memory: '#0F766E',
  review: '#D97706',
}

function clusterTitle(categories: Partial<Record<MapMarkerCategory, number>>, count: number) {
  const detail = (Object.entries(categories) as Array<[MapMarkerCategory, number]>)
    .filter(([, categoryCount]) => categoryCount > 0)
    .map(([category, categoryCount]) => `${categoryCount} ${CATEGORY_LABELS[category]}`)
    .join(', ')
  return `${count} properties${detail ? `: ${detail}` : ''}`
}

export const ClusteredMapMarkers = memo(function ClusteredMapMarkers({
  entries,
  bounds,
  zoom,
  selectedIds,
  interactive = true,
}: {
  entries: ClusteredMapMarkerEntry[]
  bounds: ViewportBounds | null
  zoom: number
  selectedIds: ReadonlySet<string>
  interactive?: boolean
}) {
  const map = useGoogleMap()
  const renderedItems = useMemo(
    () => clusterViewportPoints(entries, bounds, zoom, { selectedIds }),
    [bounds, entries, selectedIds, zoom],
  )

  return (
    <>
      {renderedItems.map((item) => {
        if (item.kind === 'point') {
          const entry = item.point
          const selected = selectedIds.has(entry.id)
          return (
            <AdvancedMapMarker
              key={entry.id}
              markerId={entry.id}
              markerKind="asset"
              markerCategory={entry.category}
              position={entry.position}
              title={entry.title}
              color={entry.color}
              borderColor={entry.borderColor}
              label={entry.label}
              scale={(entry.scale || 8) + (selected ? 2 : 0)}
              zIndex={selected ? 1_000 : entry.zIndex}
              selected={selected}
              onClick={interactive ? entry.onClick : undefined}
            />
          )
        }
        const categoryKeys = Object.keys(item.categories) as MapMarkerCategory[]
        const sharedCategory = categoryKeys.length === 1 ? categoryKeys[0] : null
        return (
          <AdvancedMapMarker
            key={item.id}
            markerId={item.id}
            markerKind="cluster"
            markerCategory={sharedCategory || 'mixed'}
            position={item.position}
            title={clusterTitle(item.categories, item.count)}
            color={sharedCategory ? CATEGORY_CLUSTER_COLORS[sharedCategory] : '#334155'}
            borderColor="#ffffff"
            label={item.count > 999 ? `${Math.round(item.count / 1_000)}k` : String(item.count)}
            scale={16}
            zIndex={50 + Math.min(item.count, 900)}
            onClick={interactive ? () => {
              if (!map) return
              map.panTo(item.position)
              map.setZoom(Math.min((map.getZoom() || zoom) + 2, 20))
            } : undefined}
          />
        )
      })}
    </>
  )
})
