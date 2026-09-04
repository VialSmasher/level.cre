import { registrationHistory, type MarketMemoryAnchor } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'
import type { PropertyFilterSource } from '../map/inventoryFilters'
import type { ComposedPropertyMapItem } from './composeMapItems'

function memoryResearchFacts(anchors: MarketMemoryAnchor[], now?: Date) {
  const identities = anchors.flatMap(anchor => anchor.legalIdentities)
  const dates = identities.map(identity => identity.transferRegistrationDate || '')
  return {
    // This is the source research confidence; a broker correction does not upgrade it.
    researchConfidence: anchors.some(anchor => anchor.confidence === 'medium') ? 'med' as const : anchors.length ? 'high' as const : 'unrated' as const,
    researchSignals: registrationHistory(dates, now)?.longHeld ? ['long_hold'] : [],
  }
}

export function memoryPropertyFilterSource(anchor: MarketMemoryAnchor, now?: Date): PropertyFilterSource {
  return {
    aiMetadata: { propertyClassification: anchor.propertyClassification },
    ...memoryResearchFacts([anchor], now),
  }
}

export function composedPropertyFilterSource(item: ComposedPropertyMapItem, now?: Date): PropertyFilterSource {
  return {
    ...(item.prospect || (item.primaryMemoryAnchor ? memoryPropertyFilterSource(item.primaryMemoryAnchor, now) : {})),
    ...memoryResearchFacts(item.memoryAnchors, now),
  }
}

export function findMemoryProspect(anchor: MarketMemoryAnchor, prospects: Prospect[]): Prospect | null {
  if (anchor.persistence?.state !== 'approved') return null
  const prospectId = anchor.persistence?.linkedProspectId
  return prospectId ? prospects.find(prospect => prospect.id === prospectId) || null : null
}

/** Use the composed canonical identity for both marker selection and refreshes. */
export function findMemoryMapItem(anchor: MarketMemoryAnchor | null, items: ComposedPropertyMapItem[]) {
  if (!anchor) return null
  const persistence = anchor.persistence
  return items.find(item => item.memoryAnchors.some(candidate => (
    persistence?.importItemId ? candidate.persistence?.importItemId === persistence.importItemId
      : persistence?.state === 'approved' && persistence.dossierId ? candidate.persistence?.state === 'approved' && candidate.persistence.dossierId === persistence.dossierId
        : candidate.id === anchor.id
  ))) || null
}

export function propertyMapFitPoints(items: ComposedPropertyMapItem[]) {
  return items.flatMap(item => {
    const geometry = item.prospect?.geometry
    const geometryType = geometry?.type as string | undefined
    if (geometry && (geometryType === 'Polygon' || geometryType === 'Rectangle')) {
      const coordinates = geometry.coordinates as [number, number][][] | [number, number][]
      const ring = (Array.isArray(coordinates[0]?.[0]) ? coordinates[0] : coordinates) as [number, number][]
      return ring.map(([lng, lat]) => ({ lat, lng }))
    }
    return item.position ? [item.position] : []
  })
}
