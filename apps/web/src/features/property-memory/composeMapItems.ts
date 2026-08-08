import type { MarketMemoryAnchor } from '@level-cre/shared'
import type { Prospect, ProspectStatusType } from '@level-cre/shared/schema'

export type PropertyMemoryPosition = { lat: number; lng: number }

export type ComposedPropertyMapItem = {
  id: string
  kind: 'prospect' | 'memory'
  prospect: Prospect | null
  memoryAnchors: MarketMemoryAnchor[]
  primaryMemoryAnchor: MarketMemoryAnchor | null
  position: PropertyMemoryPosition | null
  positionSource: 'prospect' | 'memory' | null
  prospectStatus: ProspectStatusType | null
  memoryLayer: 'existing' | 'market_memory' | 'review' | null
  hasPendingReview: boolean
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function getProspectMapPosition(prospect: Prospect): PropertyMemoryPosition | null {
  if (validCoordinate(prospect.locationLat) && validCoordinate(prospect.locationLng)) {
    return { lat: prospect.locationLat, lng: prospect.locationLng }
  }
  if (prospect.geometry?.type === 'Point' && Array.isArray(prospect.geometry.coordinates)) {
    const [lng, lat] = prospect.geometry.coordinates as [number, number]
    if (validCoordinate(lat) && validCoordinate(lng)) return { lat, lng }
  }
  return null
}

function anchorLayer(anchor: MarketMemoryAnchor) {
  return anchor.previewLayer || anchor.baseLayer
}

function isPending(anchor: MarketMemoryAnchor) {
  return anchor.persistence?.state === 'pending' || anchor.persistence?.state === 'local_preview'
}

function anchorPriority(anchor: MarketMemoryAnchor) {
  let score = 0
  if (isPending(anchor)) score += 100
  if (anchorLayer(anchor) === 'review') score += 20
  if (anchor.persistence?.savedAt) score += new Date(anchor.persistence.savedAt).getTime() / 1e13
  return score
}

function preferredAnchor(anchors: MarketMemoryAnchor[]) {
  let preferred = anchors[0] || null
  for (let index = 1; index < anchors.length; index += 1) {
    const candidate = anchors[index]
    if (preferred && anchorPriority(candidate) > anchorPriority(preferred)) preferred = candidate
  }
  return preferred
}

function standaloneKey(anchor: MarketMemoryAnchor) {
  // This path is reached only when a linked prospect is not in the currently
  // loaded prospect collection. Retain that relationship as the strongest
  // available canonical key, followed by a linked listing, so one property is
  // not rendered once per dossier/import while related records are unloaded.
  return anchor.persistence?.linkedProspectId
    ? `prospect:${anchor.persistence.linkedProspectId}`
    : anchor.persistence?.linkedListingId
      ? `listing:${anchor.persistence.linkedListingId}`
      : anchor.persistence?.dossierId
    ? `dossier:${anchor.persistence.dossierId}`
    : `anchor:${anchor.id}`
}

/**
 * Produces one render item per canonical map property. A memory record linked
 * to a loaded prospect enriches that prospect item instead of adding a second
 * marker. Pending unmatched records remain standalone review items.
 */
export function composePropertyMapItems(
  prospects: Prospect[],
  anchors: MarketMemoryAnchor[],
): ComposedPropertyMapItem[] {
  const prospectById = new Map(prospects.map((prospect) => [prospect.id, prospect]))
  const anchorsByProspectId = new Map<string, MarketMemoryAnchor[]>()
  const standaloneByKey = new Map<string, MarketMemoryAnchor[]>()

  for (const anchor of anchors) {
    const linkedProspectId = anchor.persistence?.linkedProspectId || null
    if (linkedProspectId && prospectById.has(linkedProspectId)) {
      const linked = anchorsByProspectId.get(linkedProspectId) || []
      linked.push(anchor)
      anchorsByProspectId.set(linkedProspectId, linked)
      continue
    }
    const key = standaloneKey(anchor)
    const standalone = standaloneByKey.get(key) || []
    standalone.push(anchor)
    standaloneByKey.set(key, standalone)
  }

  const prospectItems = prospects.map((prospect): ComposedPropertyMapItem => {
    const memoryAnchors = anchorsByProspectId.get(prospect.id) || []
    const primaryMemoryAnchor = preferredAnchor(memoryAnchors)
    const prospectPosition = getProspectMapPosition(prospect)
    const memoryPosition = primaryMemoryAnchor
      ? { lat: primaryMemoryAnchor.latitude, lng: primaryMemoryAnchor.longitude }
      : null
    return {
      id: `prospect:${prospect.id}`,
      kind: 'prospect',
      prospect,
      memoryAnchors,
      primaryMemoryAnchor,
      position: prospectPosition || memoryPosition,
      positionSource: prospectPosition ? 'prospect' : memoryPosition ? 'memory' : null,
      prospectStatus: prospect.status,
      memoryLayer: primaryMemoryAnchor ? anchorLayer(primaryMemoryAnchor) : null,
      hasPendingReview: memoryAnchors.some(isPending),
    }
  })

  const memoryItems = Array.from(standaloneByKey.entries()).map(([key, memoryAnchors]): ComposedPropertyMapItem => {
    const primaryMemoryAnchor = preferredAnchor(memoryAnchors)
    return {
      id: key,
      kind: 'memory',
      prospect: null,
      memoryAnchors,
      primaryMemoryAnchor,
      position: primaryMemoryAnchor
        ? { lat: primaryMemoryAnchor.latitude, lng: primaryMemoryAnchor.longitude }
        : null,
      positionSource: primaryMemoryAnchor ? 'memory' : null,
      prospectStatus: null,
      memoryLayer: primaryMemoryAnchor ? anchorLayer(primaryMemoryAnchor) : null,
      hasPendingReview: memoryAnchors.some(isPending),
    }
  })

  return [...prospectItems, ...memoryItems]
}
