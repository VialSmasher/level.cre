import { getMarketMemoryProspectTypes, type MarketMemoryAnchor } from '@level-cre/shared'
import {
  PROSPECT_TYPE_META,
  ProspectType,
  type Prospect,
  type ProspectTypeType,
} from '@level-cre/shared/schema'

import type { ComposedPropertyMapItem } from '../property-memory/composeMapItems'

export const UNCLASSIFIED_PROSPECT_TYPE = 'unclassified' as const
export type ProspectTypeFilterKey = ProspectTypeType | typeof UNCLASSIFIED_PROSPECT_TYPE

export const MAP_PROSPECT_TYPE_KEYS: ProspectTypeFilterKey[] = [
  ...ProspectType.options,
  UNCLASSIFIED_PROSPECT_TYPE,
]

export const PROSPECT_TYPE_FILTER_META: Record<ProspectTypeFilterKey, { label: string; color: string }> = {
  ...PROSPECT_TYPE_META,
  unclassified: { label: 'Unclassified', color: '#94A3B8' },
}

export type ProspectTypeCounts = Record<ProspectTypeFilterKey, number>

function parseProspectTypes(value: unknown): ProspectTypeType[] {
  if (!Array.isArray(value)) return []
  const result = new Set<ProspectTypeType>()
  for (const candidate of value) {
    const parsed = ProspectType.safeParse(candidate)
    if (parsed.success) result.add(parsed.data)
  }
  return ProspectType.options.filter((type) => result.has(type))
}

export function getProspectRecordTypes(prospect: Prospect | null | undefined): ProspectTypeType[] {
  if (!prospect?.aiMetadata || typeof prospect.aiMetadata !== 'object') return []
  return parseProspectTypes(prospect.aiMetadata.prospectTypes)
}

export function getPropertyProspectTypes(
  prospect: Prospect | null | undefined,
  memoryAnchors: MarketMemoryAnchor[] = [],
): ProspectTypeType[] {
  const result = new Set<ProspectTypeType>(getProspectRecordTypes(prospect))
  for (const anchor of memoryAnchors) {
    for (const type of getMarketMemoryProspectTypes(anchor)) result.add(type)
  }
  return ProspectType.options.filter((type) => result.has(type))
}

export function getComposedPropertyProspectTypes(item: ComposedPropertyMapItem): ProspectTypeType[] {
  return Array.from(new Set([...getPropertyProspectTypes(item.prospect, item.memoryAnchors), ...(item.occupants || []).flatMap(getProspectRecordTypes)]))
}

export function isProspectTypeFilterKey(value: unknown): value is ProspectTypeFilterKey {
  return typeof value === 'string' && MAP_PROSPECT_TYPE_KEYS.includes(value as ProspectTypeFilterKey)
}

export function createAllProspectTypeFilterSet(): Set<ProspectTypeFilterKey> {
  return new Set(MAP_PROSPECT_TYPE_KEYS)
}

export function createProspectTypeFilterSet(value: unknown): Set<ProspectTypeFilterKey> {
  if (!Array.isArray(value)) return createAllProspectTypeFilterSet()
  return new Set(value.filter(isProspectTypeFilterKey))
}

export function matchesProspectTypeFilters(
  selected: Set<ProspectTypeFilterKey>,
  types: ProspectTypeType[],
): boolean {
  if (!types.length) return selected.has(UNCLASSIFIED_PROSPECT_TYPE)
  return types.some((type) => selected.has(type))
}

export function getProspectTypeCounts(items: ComposedPropertyMapItem[]): ProspectTypeCounts {
  const counts = Object.fromEntries(MAP_PROSPECT_TYPE_KEYS.map((type) => [type, 0])) as ProspectTypeCounts
  for (const item of items) {
    const types = getComposedPropertyProspectTypes(item)
    if (!types.length) {
      counts.unclassified += 1
      continue
    }
    for (const type of types) counts[type] += 1
  }
  return counts
}
