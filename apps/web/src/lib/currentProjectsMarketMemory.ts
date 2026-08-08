import {
  resolveMarketMemoryAgainstEntities,
  type ResolvableMarketEntity,
} from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'

export {
  currentProjectsMarketMemoryFileSchema,
  parseCurrentProjectsMarketMemory,
  parseCurrentProjectsMarketMemoryValue,
  resolveMarketMemoryAgainstEntities,
} from '@level-cre/shared'
export type {
  CurrentProjectsMarketMemoryPreview,
  MarketMemoryAnchor,
  MarketMemoryLegalIdentity,
  MarketMemoryPersistence,
  MarketMemoryResolution,
} from '@level-cre/shared'

function prospectPoint(prospect: Prospect) {
  if (prospect.locationLat != null && prospect.locationLng != null) {
    return { latitude: prospect.locationLat, longitude: prospect.locationLng }
  }
  if (prospect.geometry?.type === 'Point' && Array.isArray(prospect.geometry.coordinates)) {
    const [longitude, latitude] = prospect.geometry.coordinates as [number, number]
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {}
  }
  return {}
}

export function resolveMarketMemoryAgainstProspects(
  anchors: import('@level-cre/shared').MarketMemoryAnchor[],
  prospects: Prospect[],
) {
  const entities: ResolvableMarketEntity[] = prospects.map((prospect) => ({
    entityType: 'prospect',
    id: prospect.id,
    label: prospect.name,
    address: prospect.address || prospect.name,
    ...prospectPoint(prospect),
    marketKey: prospect.marketKey,
    phone: prospect.contactPhone,
    email: prospect.contactEmail,
    websiteUrl: prospect.websiteUrl,
    businessName: prospect.businessName || prospect.contactCompany || prospect.name,
  }))
  return resolveMarketMemoryAgainstEntities(anchors, entities)
}
