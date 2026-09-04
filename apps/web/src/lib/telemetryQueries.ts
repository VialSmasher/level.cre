import type { QueryKey } from '@tanstack/react-query'

// Older pages embed parameters in the URL; newer queries use a resource key.
// Match the parsed resource, never a string prefix that crosses route boundaries.
export function telemetryResource(key: QueryKey): string {
  const value = key.find(part => typeof part === 'string' && part.startsWith('/api/'))
  return typeof value === 'string' ? value.split('?')[0].replace(/\/$/, '') : ''
}
export function isTelemetryQuery(key: QueryKey): boolean {
  if (key[0] === 'property-memory') return true
  const path = telemetryResource(key)
  return ['/api/prospects', '/api/interactions', '/api/activity-events', '/api/opportunities', '/api/broker-skills', '/api/skill-activities',
    '/api/automation', '/api/agent/sales-activity/imports', '/api/agent/mapping-coverage', '/api/email', '/api/dashboard',
    '/api/stats', '/api/intel', '/api/property-memory', '/api/brokerage-memory', '/api/listings', '/api/workspaces'].some(resource => path === resource || path.startsWith(resource + '/'))
}
export const telemetryKeys = {
  runs: (userId: string) => [userId, '/api/automation/runs'] as const,
  insights: (userId: string) => [userId, '/api/automation/insights'] as const,
}
