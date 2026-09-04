import { reportingWindowStart } from './reportingWindow'
import type { Pool } from 'pg'
import { listProductionActivities, type ProductionActivityRow } from './productionActivityService'
import { normalizeEmailActivitySubject } from './emailActivityReconciliation'

type ProspectLocation = { id: string; name: string; address: string | null; location_lat: string | number | null; location_lng: string | number | null; geometry: unknown }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
function hasLocation(prospect: ProspectLocation | undefined): boolean {
  if (!prospect) return false
  const lat = prospect.location_lat, lng = prospect.location_lng
  if (lat !== null && lat !== '' && lng !== null && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180) return true
  const geometry = prospect.geometry as { coordinates?: unknown } | null
  const valid = (coordinates: unknown): boolean => Array.isArray(coordinates) && (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number' && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90 || coordinates.some(valid))
  return valid(geometry?.coordinates)
}
function conversationKey(row: ProductionActivityRow): string | null {
  const metadata = row.sourceMetadata
  const thread = text(metadata.sourceThreadId || metadata.threadId || metadata.conversationId)
  if (thread) return 'thread:' + thread
  const email = text(metadata.email).toLowerCase()
  const subject = normalizeEmailActivitySubject(text(metadata.subject))
  return email && subject ? 'correspondence:' + email + '|' + subject : null
}
export function summarizeCommercialProgress(rows: ProductionActivityRow[], cutoff: number) {
  const eligible = rows.filter(row => Date.parse(row.timestamp) >= cutoff)
  const outreach = eligible.filter(row => row.direction === 'outbound' && row.type !== 'note')
  const contacted = new Set(outreach.map(row => row.prospectId || text(row.sourceMetadata.email).toLowerCase()).filter(Boolean))
  const firstTouch = new Map<string, number>()
  for (const row of outreach) {
    if (row.type !== 'email') continue
    const key = conversationKey(row)
    if (key) firstTouch.set(key, Math.min(firstTouch.get(key) ?? Infinity, Date.parse(row.timestamp)))
  }
  const replied = new Set<string>()
  for (const row of eligible) {
    if (row.type !== 'email' || row.direction !== 'inbound') continue
    const key = conversationKey(row)
    if (key && firstTouch.has(key) && Date.parse(row.timestamp) > firstTouch.get(key)!) replied.add(key)
  }
  const met = new Set(eligible.filter(row => row.type === 'meeting' && row.prospectId && contacted.has(row.prospectId)).map(row => row.prospectId))
  return {
    contacted: contacted.size, attributableConversations: firstTouch.size, repliedConversations: replied.size,
    prospectsWithMeetings: met.size,
    unattributedOutbound: outreach.filter(row => row.type === 'email' && !conversationKey(row)).length,
  }
}
export function buildMappingCoverage(rows: ProductionActivityRow[], prospects: ProspectLocation[], cutoff: number) {
  const prospectById = new Map(prospects.map(row => [row.id, row]))
  const groups = new Map<string, { company: string; prospectId: string | null; reason: string; actions: number; latestAt: string; events: Array<{ id: string; source: string; externalActivityId: string; subject: string; email: string; timestamp: string }> }>()
  const outbound = rows.filter(row => row.direction === 'outbound' && row.type !== 'note' && Date.parse(row.timestamp) >= cutoff)
  let unmappedActions = 0
  for (const row of outbound) {
    const prospect = row.prospectId ? prospectById.get(row.prospectId) : undefined
    if (hasLocation(prospect)) continue
    unmappedActions++
    const email = text(row.sourceMetadata.email)
    const company = text(row.sourceMetadata.company) || prospect?.name || email || 'Company not identified'
    const reason = prospect ? 'Verified location needed' : row.prospectId ? 'Prospect reference needs review' : 'Prospect match needed'
    const key = (row.prospectId || company.toLowerCase()) + '|' + reason
    const group = groups.get(key) || { company, prospectId: row.prospectId, reason, actions: 0, latestAt: row.timestamp, events: [] }
    group.actions++
    if (row.timestamp > group.latestAt) group.latestAt = row.timestamp
    group.events.push({ id: row.id, source: row.sourceProvider === 'outlook' ? 'outlook_sync' : row.sourceProvider, externalActivityId: text(row.sourceMetadata.externalActivityId), subject: text(row.sourceMetadata.subject), email, timestamp: row.timestamp })
    groups.set(key, group)
  }
  return { actions: outbound.length, mappedActions: outbound.length - unmappedActions, unmappedActions,
    groups: [...groups.values()].sort((a,b) => b.actions - a.actions || b.latestAt.localeCompare(a.latestAt)) }
}
export async function getTelemetryInsights(pool: Pick<Pool, 'query'>, userId: string) {
  const cutoff = reportingWindowStart(new Date(), 28).getTime()
  const [activities, prospects, progress] = await Promise.all([
    listProductionActivities({ pool, userId, limit: 5000 }),
    pool.query<ProspectLocation>('SELECT id, name, address, location_lat, location_lng, ST_AsGeoJSON(geometry)::jsonb AS geometry FROM public.prospects WHERE user_id = $1 AND merged_into_prospect_id IS NULL', [userId]),
    pool.query(`SELECT event_type, count(*)::int AS total FROM public.activity_events
      WHERE user_id = $1 AND evidence_status = 'confirmed' AND occurred_at >= $2
      AND event_type IN ('tour','stage_changed','opportunity_won','opportunity_lost') GROUP BY event_type`, [userId, new Date(cutoff)]),
  ])
  return { generatedAt: new Date().toISOString(), days: 28, limited: activities.length >= 5000,
    coverage: buildMappingCoverage(activities, prospects.rows, cutoff),
    progression: { ...summarizeCommercialProgress(activities, cutoff), confirmedMilestones: progress.rows } }
}
