export type ActivityFootprintKind = 'call' | 'email' | 'meeting'

export type ActivityFootprintKindFilter = ActivityFootprintKind | 'all'

export type ActivityFootprintActivity = {
  id?: unknown
  timestamp?: unknown
  date?: unknown
  createdAt?: unknown
  type?: unknown
  action?: unknown
  direction?: unknown
  sourceProvider?: unknown
  sourceMetadata?: unknown
  prospectId?: unknown
}

export type ActivityFootprintProspect = {
  id: string
  name?: string
  address?: string
  contactCompany?: string
  businessName?: string
  locationLat?: unknown
  locationLng?: unknown
  geometry?: {
    type?: unknown
    coordinates?: unknown
  } | null
}

export type ActivityTimelineDay = {
  dateKey: string
  shortLabel: string
  longLabel: string
  call: number
  email: number
  meeting: number
  total: number
}

export type NormalizedFootprintEvent = {
  id: string
  timestamp: string
  dateKey: string
  kind: ActivityFootprintKind
  prospectId: string | null
  sourceProvider: string
  subject: string | null
}

export type ActivityFootprintMarker = {
  prospectId: string
  name: string
  address: string | null
  position: { lat: number; lng: number }
  total: number
  counts: Record<ActivityFootprintKind, number>
  lastTouchAt: string
  events: NormalizedFootprintEvent[]
}

export type ActivityFootprintResult = {
  days: ActivityTimelineDay[]
  selectedDateKey: string
  selectedDateLabel: string
  actions: number
  uniqueProspects: number
  mappedActions: number
  unmappedActions: number
  mappedPercent: number | null
  markers: ActivityFootprintMarker[]
}

const DEFAULT_TIME_ZONE = 'America/Edmonton'

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const read = (type: 'year' | 'month' | 'day') => Number(parts.find((part) => part.type === type)?.value || 0)
  return `${read('year')}-${String(read('month')).padStart(2, '0')}-${String(read('day')).padStart(2, '0')}`
}

function dateKeyOffset(anchorKey: string, offsetDays: number) {
  const [year, month, day] = anchorKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + offsetDays, 12))
  return value.toISOString().slice(0, 10)
}

function labelForDateKey(dateKey: string, style: 'short' | 'long') {
  const value = new Date(`${dateKey}T12:00:00Z`)
  return new Intl.DateTimeFormat('en-CA', style === 'short'
    ? { weekday: 'short', day: 'numeric', timeZone: 'UTC' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value)
}

function parseActivityDate(activity: ActivityFootprintActivity) {
  const raw = activity.timestamp || activity.date || activity.createdAt
  if (!raw) return null
  const parsed = raw instanceof Date ? raw : new Date(String(raw))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function normalizeKind(activity: ActivityFootprintActivity): ActivityFootprintKind | null {
  const value = String(activity.action || activity.type || '').trim().toLowerCase()
  if (value === 'email' || value === 'email_sent') return 'email'
  if (value === 'call' || value === 'phone_call' || value === 'call_attempted') return 'call'
  if (value === 'meeting' || value === 'meeting_held' || value === 'tour' || value === 'showing') return 'meeting'
  return null
}

function activityDirection(activity: ActivityFootprintActivity) {
  const metadata = activity.sourceMetadata && typeof activity.sourceMetadata === 'object' && !Array.isArray(activity.sourceMetadata)
    ? activity.sourceMetadata as Record<string, unknown>
    : {}
  const value = String(
    activity.direction
    || metadata.direction
    || metadata.captureDirection
    || metadata.emailDirection
    || '',
  ).trim().toLowerCase()
  if (value === 'received' || value === 'inbound') return 'inbound'
  if (value === 'internal') return 'internal'
  return 'outbound'
}

function coordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function collectCoordinatePairs(value: unknown, pairs: Array<[number, number]>) {
  if (!Array.isArray(value)) return
  if (value.length >= 2) {
    const lng = coordinate(value[0], -180, 180)
    const lat = coordinate(value[1], -90, 90)
    if (lng !== null && lat !== null) {
      pairs.push([lng, lat])
      return
    }
  }
  value.forEach((entry) => collectCoordinatePairs(entry, pairs))
}

export function getActivityProspectPosition(prospect: ActivityFootprintProspect) {
  const locationLat = coordinate(prospect.locationLat, -90, 90)
  const locationLng = coordinate(prospect.locationLng, -180, 180)
  if (locationLat !== null && locationLng !== null) {
    return { lat: locationLat, lng: locationLng }
  }

  const pairs: Array<[number, number]> = []
  collectCoordinatePairs(prospect.geometry?.coordinates, pairs)
  if (!pairs.length) return null
  if (String(prospect.geometry?.type || '').toLowerCase() === 'point') {
    return { lat: pairs[0][1], lng: pairs[0][0] }
  }

  const totals = pairs.reduce((sum, [lng, lat]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }), { lat: 0, lng: 0 })
  return { lat: totals.lat / pairs.length, lng: totals.lng / pairs.length }
}

function prospectName(prospect: ActivityFootprintProspect) {
  return prospect.contactCompany || prospect.businessName || prospect.name || 'Untitled prospect'
}

function normalizeActivities(
  activities: ActivityFootprintActivity[],
  timeZone: string,
): NormalizedFootprintEvent[] {
  return (activities || []).flatMap((activity, index) => {
    const date = parseActivityDate(activity)
    const kind = normalizeKind(activity)
    if (!date || !kind || activityDirection(activity) !== 'outbound') return []
    const prospectId = String(activity.prospectId || '').trim() || null
    return [{
      id: String(activity.id || `${date.toISOString()}:${kind}:${prospectId || index}`),
      timestamp: date.toISOString(),
      dateKey: dateKeyInTimeZone(date, timeZone),
      kind,
      prospectId,
      sourceProvider: String(activity.sourceProvider || 'captured'),
      subject: typeof (activity.sourceMetadata as any)?.subject === 'string' ? (activity.sourceMetadata as any).subject : null,
    }]
  })
}

export function buildActivityFootprint(
  activities: ActivityFootprintActivity[],
  prospects: ActivityFootprintProspect[],
  options: {
    days?: number
    throughIndex?: number
    kind?: ActivityFootprintKindFilter
    now?: Date
    timeZone?: string
  } = {},
): ActivityFootprintResult {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE
  const periodDays = Math.max(1, Math.trunc(options.days || 28))
  const todayKey = dateKeyInTimeZone(options.now || new Date(), timeZone)
  const dateKeys = Array.from({ length: periodDays }, (_, index) => dateKeyOffset(todayKey, index - periodDays + 1))
  const throughIndex = Math.min(Math.max(Math.trunc(options.throughIndex ?? periodDays - 1), 0), periodDays - 1)
  const selectedDateKey = dateKeys[throughIndex]
  const startDateKey = dateKeys[0]
  const kindFilter = options.kind || 'all'
  const normalized = normalizeActivities(activities, timeZone)
  const periodEvents = normalized.filter((event) => event.dateKey >= startDateKey && event.dateKey <= dateKeys.at(-1)!)
  const visibleEvents = periodEvents.filter((event) => (
    event.dateKey <= selectedDateKey
    && (kindFilter === 'all' || event.kind === kindFilter)
  ))

  const dayCounts = new Map<string, Record<ActivityFootprintKind, number>>()
  dateKeys.forEach((dateKey) => dayCounts.set(dateKey, { call: 0, email: 0, meeting: 0 }))
  periodEvents.forEach((event) => {
    const counts = dayCounts.get(event.dateKey)
    if (counts) counts[event.kind] += 1
  })
  const days = dateKeys.map((dateKey) => {
    const counts = dayCounts.get(dateKey) || { call: 0, email: 0, meeting: 0 }
    return {
      dateKey,
      shortLabel: labelForDateKey(dateKey, 'short'),
      longLabel: labelForDateKey(dateKey, 'long'),
      ...counts,
      total: counts.call + counts.email + counts.meeting,
    }
  })

  const prospectsById = new Map((prospects || []).map((prospect) => [prospect.id, prospect]))
  const markerMap = new Map<string, ActivityFootprintMarker>()
  let mappedActions = 0

  visibleEvents.forEach((event) => {
    if (!event.prospectId) return
    const prospect = prospectsById.get(event.prospectId)
    if (!prospect) return
    const position = getActivityProspectPosition(prospect)
    if (!position) return
    mappedActions += 1
    const existing = markerMap.get(event.prospectId)
    if (existing) {
      existing.total += 1
      existing.counts[event.kind] += 1
      existing.events.push(event)
      if (event.timestamp > existing.lastTouchAt) existing.lastTouchAt = event.timestamp
      return
    }
    markerMap.set(event.prospectId, {
      prospectId: event.prospectId,
      name: prospectName(prospect),
      address: prospect.address || null,
      position,
      total: 1,
      counts: { call: 0, email: 0, meeting: 0, [event.kind]: 1 },
      lastTouchAt: event.timestamp,
      events: [event],
    })
  })

  const markers = Array.from(markerMap.values())
    .map((marker) => ({ ...marker, events: marker.events.sort((left, right) => right.timestamp.localeCompare(left.timestamp)) }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
  const actions = visibleEvents.length

  return {
    days,
    selectedDateKey,
    selectedDateLabel: labelForDateKey(selectedDateKey, 'long'),
    actions,
    uniqueProspects: markers.length,
    mappedActions,
    unmappedActions: Math.max(0, actions - mappedActions),
    mappedPercent: actions > 0 ? Math.round((mappedActions / actions) * 100) : null,
    markers,
  }
}
