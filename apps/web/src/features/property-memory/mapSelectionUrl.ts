import type { MarketMemoryAnchor } from '@level-cre/shared'

export type MapSelectionIdentity = { prospectId?: string | null; propertyId?: string | null }

export function memoryPropertyId(anchor: MarketMemoryAnchor) {
  return anchor.persistence?.state === 'approved'
    ? anchor.persistence.dossierId || anchor.persistence.importItemId || anchor.id
    : anchor.persistence?.importItemId || anchor.id
}

export function findMemoryByPropertyId(anchors: MarketMemoryAnchor[], propertyId: string) {
  return anchors.find(anchor => anchor.persistence?.importItemId === propertyId)
    || anchors.find(anchor => anchor.persistence?.state === 'approved' && anchor.persistence.dossierId === propertyId)
    || anchors.find(anchor => anchor.id === propertyId)
    // Older links may name a dossier currently represented only by a review item.
    || anchors.find(anchor => anchor.persistence?.dossierId === propertyId)
    || null
}

/** Loading an asset is not a close action. Keep an unresolved deep link until selection is applied. */
export function mapSelectionUrl(href: string, selection: MapSelectionIdentity, selectionApplied: boolean) {
  const url = new URL(href)
  if (selection.prospectId) {
    url.searchParams.set('prospectId', selection.prospectId)
    url.searchParams.delete('propertyId')
  } else if (selection.propertyId) {
    url.searchParams.set('propertyId', selection.propertyId)
    url.searchParams.delete('prospectId')
  } else if (selectionApplied) {
    url.searchParams.delete('prospectId')
    url.searchParams.delete('propertyId')
  }
  return `${url.pathname}${url.search}${url.hash}`
}
