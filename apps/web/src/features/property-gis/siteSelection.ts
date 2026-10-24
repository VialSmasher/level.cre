import type { MarketMemoryAnchor, PropertySiteInformationPreview } from '@level-cre/shared'

export type SiteParcelCandidate = PropertySiteInformationPreview['candidates'][number]
export type SiteBoundarySelection = { propertyKey: string; candidate: SiteParcelCandidate }

/** Pending imports can carry a suggested dossier ID at a different map point. */
export function approvedStandaloneSiteAnchor(anchor: MarketMemoryAnchor | null) {
  return anchor?.persistence?.state === 'approved' && anchor.persistence.dossierId ? anchor : null
}

/** Prefer evidence linked to the displayed property and never choose between distinct dossiers silently. */
export function dossierAnchorForProspect(anchors: MarketMemoryAnchor[], propertyProspectId: string | null) {
  const approved = anchors.filter(anchor => anchor.persistence?.state === 'approved' && anchor.persistence.dossierId)
  const directlyLinked = approved.filter(anchor => anchor.persistence?.linkedProspectId === propertyProspectId)
  const candidates = directlyLinked.length ? directlyLinked : approved
  return new Set(candidates.map(anchor => anchor.persistence?.dossierId)).size === 1 ? candidates[0] : null
}

/** Choosing a boundary for inspection never approves a property/parcel relationship. */
export function initialCandidateKey(info: PropertySiteInformationPreview): string | null {
  return info.candidates.length === 1 && info.status === 'matched'
    ? info.candidates[0].sourceQualifiedKey
    : null
}

/** A boundary from a previous property must disappear in the same render as selection. */
export function boundaryForProperty(selection: SiteBoundarySelection | null, propertyKey: string | null) {
  return selection && selection.propertyKey === propertyKey ? selection.candidate : null
}

/** Google polygons require opposite winding for holes; never flatten MultiPolygon rings. */
export function googleParcelPaths(boundary: SiteParcelCandidate['boundary']) {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  return polygons.map((polygon) => polygon.map((ring, index) => {
    const signedArea = ring.reduce((sum, point, i) => {
      const next = ring[(i + 1) % ring.length]
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0)
    const oriented = (index === 0 ? signedArea < 0 : signedArea > 0) ? [...ring].reverse() : ring
    return oriented.map(([lng, lat]) => ({ lat, lng }))
  }))
}
