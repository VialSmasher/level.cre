export type PropertyMemorySearchFilters = {
  q?: string
  owner?: string
  legal?: string
  linc?: string
  zoning?: string
  submarket?: string
  prospectStatus?: string
  layer?: 'existing' | 'market_memory' | 'review'
  activityState?: 'any' | 'has_activity' | 'never'
  activityRecency?: 'any' | '30d' | '90d' | '180d' | '365d' | 'never'
  activitySince?: string
  activityBefore?: string
  limit?: number
  cursor?: string
}

export function propertyMemorySearchParams(filters: PropertyMemorySearchFilters) {
  const params = new URLSearchParams()
  const keys: Array<keyof PropertyMemorySearchFilters> = [
    'q', 'owner', 'legal', 'linc', 'zoning', 'submarket', 'prospectStatus',
    'layer', 'activityState', 'activityRecency', 'activitySince', 'activityBefore', 'cursor',
  ]
  for (const key of keys) {
    const value = filters[key]
    if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
  }
  if (filters.limit != null) params.set('limit', String(Math.min(Math.max(Math.trunc(filters.limit), 1), 50)))
  return params
}
