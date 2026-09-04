import { MappingRecovery } from '@/components/TelemetryPanels';
import { clusterViewportPoints, pointInViewport, type ViewportBounds } from '../map/viewportClustering';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  MapPinned,
  Pause,
  Play,
  RefreshCcw,
} from 'lucide-react'
import { Link } from 'wouter'

import { AdvancedMapMarker } from '@/features/map/AdvancedMapMarker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getGoogleMapsApiKey, getGoogleMapsMapId } from '@/lib/googleMapsApiKey'
import { apiRequest } from '@/lib/queryClient'
import { cn } from '@/lib/utils'
import type { Prospect } from '@level-cre/shared/schema'
import {
  buildActivityFootprint,
  type ActivityFootprintActivity,
  type ActivityFootprintKind,
  type ActivityFootprintKindFilter,
  type ActivityFootprintMarker,
  type ActivityTimelineDay,
} from './activityFootprintModel'

const EDMONTON_TZ = 'America/Edmonton'
const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 }
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' } as const
const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey()
const GOOGLE_MAPS_MAP_ID = getGoogleMapsMapId()
const GOOGLE_LIBRARIES: any = ['geometry', 'places', 'marker']
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  scaleControl: true,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: true,
  gestureHandling: 'cooperative',
  clickableIcons: false,
  mapId: GOOGLE_MAPS_MAP_ID,
}

const KIND_META: Record<ActivityFootprintKindFilter, { label: string; color: string; dot: string }> = {
  all: { label: 'All activity', color: '#2563eb', dot: 'bg-blue-600' },
  call: { label: 'Calls', color: '#059669', dot: 'bg-emerald-600' },
  email: { label: 'Emails', color: '#2563eb', dot: 'bg-blue-600' },
  meeting: { label: 'Meetings', color: '#d97706', dot: 'bg-amber-600' },
}

const PERIOD_OPTIONS = [7, 28, 90] as const
const KIND_OPTIONS: ActivityFootprintKindFilter[] = ['all', 'call', 'email', 'meeting']

type ActivityFootprintProps = {
  prospects: Prospect[]
  isDemoMode: boolean
}

type MetricProps = {
  label: string
  value: string
  detail: string
  tone: string
}

function Metric({ label, value, detail, tone }: MetricProps) {
  return (
    <div className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

function formatTouchDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EDMONTON_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeDemoInteractions(rows: any[]): ActivityFootprintActivity[] {
  return (rows || []).map((row) => ({
    ...row,
    timestamp: row.timestamp || row.date || row.createdAt,
    direction: row.direction || (row.type === 'note' ? 'internal' : 'outbound'),
    sourceProvider: row.sourceProvider || 'demo',
  }))
}

function ActivityMap({ markers, markerColor, selectedProspectId, onSelect }: {
  markers: ActivityFootprintMarker[]; markerColor: string; selectedProspectId: string | null; onSelect: (id: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries: GOOGLE_LIBRARIES, mapIds: [GOOGLE_MAPS_MAP_ID] })
  const mapRef = useRef<google.maps.Map | null>(null)
  const initiallyFramed = useRef(false)
  const [viewport, setViewport] = useState<{ bounds: ViewportBounds | null; zoom: number }>({ bounds: null, zoom: 10 })
  const frame = useCallback((all: boolean) => {
    const map = mapRef.current
    if (!map || !markers.length) return
    const local = all ? markers : markers.filter(marker => Math.abs(marker.position.lat - DEFAULT_CENTER.lat) < 0.6 && Math.abs(marker.position.lng - DEFAULT_CENTER.lng) < 1)
    if (!local.length) return
    const bounds = new window.google.maps.LatLngBounds()
    local.forEach(marker => bounds.extend(marker.position))
    if (local.length === 1) { map.setCenter(local[0].position); map.setZoom(13) }
    else map.fitBounds(bounds, 56)
  }, [markers])
  useEffect(() => {
    if (!initiallyFramed.current && mapRef.current && markers.length) {
      initiallyFramed.current = true
      frame(false)
    }
  }, [markers, frame])
  const points = useMemo(() => markers.map(marker => ({ ...marker, id: marker.prospectId, category: 'prospect' as const })), [markers])
  const clusters = useMemo(() => clusterViewportPoints(points, viewport.bounds, viewport.zoom, {
    selectedIds: new Set(selectedProspectId ? [selectedProspectId] : []),
  }), [points, viewport, selectedProspectId])
  const outside = viewport.bounds ? markers.filter(marker => !pointInViewport(marker.position, viewport.bounds!)).length : 0
  if (!isLoaded) return <div className="h-full animate-pulse bg-slate-100" aria-label="Loading activity map" />
  return (
    <div className="relative h-full">
      <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={DEFAULT_CENTER} zoom={10} options={MAP_OPTIONS}
        onLoad={map => {
          mapRef.current = map
          if (markers.length && !initiallyFramed.current) { initiallyFramed.current = true; frame(false) }
        }}
        onIdle={() => {
          const map = mapRef.current, bounds = map?.getBounds()?.toJSON()
          if (map && bounds) setViewport(previous => {
            const next = { bounds, zoom: map.getZoom() || 10 }
            return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
          })
        }}
        onUnmount={() => { mapRef.current = null; initiallyFramed.current = false }}>
        {clusters.map(item => item.kind === 'cluster' ? (
          <AdvancedMapMarker key={item.id} markerId={'activity:' + item.id} markerKind="cluster" markerCategory="activity-footprint"
            position={item.position} color={markerColor} label={String(item.count)} scale={18}
            title={item.count + ' prospects. Zoom in to explore.'}
            onClick={() => {
              const map = mapRef.current
              if (!map) return
              map.panTo(item.position); map.setZoom(Math.min((map.getZoom() || 10) + 2, 20))
            }} />
        ) : (
          <AdvancedMapMarker key={item.id} markerId={'activity:' + item.id} markerCategory="activity-footprint"
            position={item.position} title={item.point.name + ': ' + item.point.total + ' outbound actions'}
            color={markerColor} label={String(item.point.total)} scale={Math.min(18, 12 + Math.log2(item.point.total + 1) * 2)}
            zIndex={item.id === selectedProspectId ? 100 : 10 + item.point.total}
            selected={item.id === selectedProspectId} onClick={() => onSelect(item.id)} />
        ))}
      </GoogleMap>
      <div className="absolute bottom-8 left-3 flex max-w-[calc(100%-70px)] flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="bg-white shadow-sm" onClick={() => frame(true)}>Fit all activity</Button>
        {outside > 0 ? <span className="rounded-md bg-white/95 px-2 py-1.5 text-xs text-slate-700 shadow-sm">{outside} prospect{outside === 1 ? '' : 's'} outside this view</span> : null}
      </div>
    </div>
  )
}


function ActivityMapFrame({
  markers,
  markerColor,
  selectedProspectId,
  onSelect,
}: {
  markers: ActivityFootprintMarker[]
  markerColor: string
  selectedProspectId: string | null
  onSelect: (prospectId: string) => void
}) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex h-full min-h-[390px] flex-col items-center justify-center bg-slate-50 px-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <MapPinned className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-900">The timeline is ready, but this preview has no map key.</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">Captured activity and coverage totals still update as the playhead moves.</p>
      </div>
    )
  }

  return (
    <ActivityMap
      markers={markers}
      markerColor={markerColor}
      selectedProspectId={selectedProspectId}
      onSelect={onSelect}
    />
  )
}

function TimelineBar({
  day,
  height,
  selected,
  dimmed,
  onSelect,
}: {
  day: ActivityTimelineDay
  height: number
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const label = `${day.longLabel}: ${day.total} outbound action${day.total === 1 ? '' : 's'}, ${day.call} call${day.call === 1 ? '' : 's'}, ${day.email} email${day.email === 1 ? '' : 's'}, ${day.meeting} meeting${day.meeting === 1 ? '' : 's'}`
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'group flex h-24 min-w-2 flex-1 items-end rounded-sm px-px outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        dimmed && 'opacity-30',
      )}
    >
      <span
        className={cn(
          'flex w-full min-w-[6px] flex-col-reverse overflow-hidden rounded-sm bg-slate-200 transition group-hover:brightness-95',
          selected && 'ring-2 ring-slate-950 ring-offset-2',
        )}
        style={{ height: `${height}px` }}
      >
        {day.total > 0 ? (
          <>
            <span className="bg-emerald-500" style={{ height: `${(day.call / day.total) * 100}%` }} />
            <span className="bg-blue-600" style={{ height: `${(day.email / day.total) * 100}%` }} />
            <span className="bg-amber-500" style={{ height: `${(day.meeting / day.total) * 100}%` }} />
          </>
        ) : null}
      </span>
    </button>
  )
}

export function ActivityFootprint({ prospects, isDemoMode }: ActivityFootprintProps) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIOD_OPTIONS)[number]>(28)
  const [throughIndex, setThroughIndex] = useState(27)
  const [kind, setKind] = useState<ActivityFootprintKindFilter>('all')
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(previous => {
      const next = new Date()
      const day = (value: Date) => value.toLocaleDateString('en-CA', { timeZone: EDMONTON_TZ })
      return day(previous) === day(next) ? previous : next
    }), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const activityQuery = useQuery<ActivityFootprintActivity[]>({
    queryKey: ['/api/automation/production-activities', 'activity-footprint', isDemoMode ? 'demo' : 'live'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/automation/production-activities?limit=5000')
        if (!response.ok) throw new Error('Production activity could not be loaded')
        const payload = await response.json()
        return Array.isArray(payload?.rows) ? payload.rows : []
      } catch (error) {
        if (!isDemoMode) throw error
        const fallback = await apiRequest('GET', '/api/interactions')
        if (!fallback.ok) throw error
        return normalizeDemoInteractions(await fallback.json())
      }
    },
    staleTime: 60_000,
    retry: false,
  })

  const footprint = useMemo(() => buildActivityFootprint(
    activityQuery.data || [],
    prospects,
    { days: periodDays, throughIndex, kind, now, timeZone: EDMONTON_TZ },
  ), [activityQuery.data, kind, now, periodDays, prospects, throughIndex])

  const maxIndex = footprint.days.length - 1
  const selectedMarker = footprint.markers.find((marker) => marker.prospectId === selectedProspectId) || null
  const maxDailyTotal = Math.max(1, ...footprint.days.map((day) => day.total))

  useEffect(() => {
    if (!isPlaying) return undefined
    if (throughIndex >= maxIndex) {
      setIsPlaying(false)
      return undefined
    }
    const timeout = window.setTimeout(() => setThroughIndex((current) => Math.min(current + 1, maxIndex)), 650)
    return () => window.clearTimeout(timeout)
  }, [isPlaying, maxIndex, throughIndex])

  const changePeriod = (days: (typeof PERIOD_OPTIONS)[number]) => {
    setPeriodDays(days)
    setThroughIndex(days - 1)
    setSelectedProspectId(null)
    setIsPlaying(false)
  }

  const togglePlayback = () => {
    if (!isPlaying && throughIndex >= maxIndex) setThroughIndex(0)
    setIsPlaying((current) => !current)
  }

  const mappedValue = footprint.mappedPercent === null ? 'No activity yet' : `${footprint.mappedPercent}%`
  const selectedKindMeta = KIND_META[kind]

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="activity-footprint-title">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="activity-footprint-title" className="text-lg font-bold text-slate-950">Activity footprint</h2>
            <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">Outbound only</Badge>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">Move through time to watch calls, emails, and meetings accumulate across the market.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Activity period">
            {PERIOD_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={periodDays === days}
                onClick={() => changePeriod(days)}
                className={cn(
                  'h-8 rounded-md px-3 text-xs font-semibold transition',
                  periodDays === days ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {days}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => activityQuery.refetch()} aria-label="Refresh activity footprint" title="Refresh activity footprint">
            <RefreshCcw className={cn('h-4 w-4', activityQuery.isFetching && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <Metric label="Outbound actions" value={footprint.actions.toLocaleString()} detail={`Through ${footprint.selectedDateLabel}`} tone="text-slate-950" />
        <Metric label="Prospects reached" value={footprint.uniqueProspects.toLocaleString()} detail="Unique mapped prospects" tone="text-blue-700" />
        <Metric label="Map coverage" value={mappedValue} detail={footprint.actions > 0 ? `${footprint.mappedActions} of ${footprint.actions} actions placed` : 'Moves with confirmed production'} tone="text-emerald-700" />
        <Metric label="Without location" value={footprint.unmappedActions.toLocaleString()} detail="Still counted in the timeline" tone={footprint.unmappedActions > 0 ? 'text-amber-700' : 'text-slate-950'} />
      </div>

      {activityQuery.isError ? (
        <div role="status" className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          The production ledger could not be loaded. The capture audit is still available in the next view.
        </div>
      ) : null}

      <div className="border-t border-slate-200 bg-slate-50/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" aria-label="Activity type filter">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => {
                  setKind(option)
                  setSelectedProspectId(null)
                }}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition',
                  kind === option
                    ? 'border-slate-900 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', KIND_META[option].dot)} aria-hidden="true" />
                {KIND_META[option].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Marker size and number show touch volume.</p>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative min-h-[390px] lg:min-h-[440px]">
            {activityQuery.isLoading ? (
              <div className="h-full min-h-[390px] animate-pulse bg-slate-100" aria-label="Loading activity footprint" />
            ) : (
              <ActivityMapFrame
                markers={footprint.markers}
                markerColor={selectedKindMeta.color}
                selectedProspectId={selectedProspectId}
                onSelect={setSelectedProspectId}
              />
            )}
            {!activityQuery.isLoading && footprint.markers.length === 0 ? (
              <div className="pointer-events-none absolute inset-x-4 top-4 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
                <p className="text-sm font-semibold text-slate-900">No mapped outbound activity through this date.</p>
                <p className="mt-0.5 text-xs text-slate-500">Move the playhead forward, widen the period, or switch activity types.</p>
              </div>
            ) : null}
          </div>

          <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0" aria-label="Selected prospect activity">
            {selectedMarker ? (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected prospect</p>
                    <h3 className="mt-1 truncate text-base font-bold text-slate-950">{selectedMarker.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{selectedMarker.address || 'No address on file'}</p>
                  </div>
                  <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-blue-600 px-2 text-sm font-bold text-white">{selectedMarker.total}</span>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-slate-100 py-4 text-center">
                  <div><dt className="text-[11px] text-slate-500">Calls</dt><dd className="mt-1 font-bold text-emerald-700">{selectedMarker.counts.call}</dd></div>
                  <div><dt className="text-[11px] text-slate-500">Emails</dt><dd className="mt-1 font-bold text-blue-700">{selectedMarker.counts.email}</dd></div>
                  <div><dt className="text-[11px] text-slate-500">Meetings</dt><dd className="mt-1 font-bold text-amber-700">{selectedMarker.counts.meeting}</dd></div>
                </dl>
                <div className="mt-4 space-y-3">
                  {selectedMarker.events.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-start gap-2.5">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_META[event.kind].dot)} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold capitalize text-slate-800">{event.kind === 'email' ? 'Email sent' : event.kind === 'meeting' ? 'Meeting recorded' : 'Call recorded'}</p>
                        {event.subject ? <p className="mt-0.5 text-xs leading-5 text-slate-700">{event.subject}</p> : null}
                        <p className="mt-0.5 text-[11px] text-slate-500">{formatTouchDate(event.timestamp)}
                          <span title={event.sourceProvider}> · {event.sourceProvider.includes('codex') ? 'Codex' : event.sourceProvider.includes('outlook') ? 'Outlook' : 'Captured activity'}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button asChild variant="outline" size="sm" className="mt-5 w-full">
                  <Link href={"/app?prospectId=" + encodeURIComponent(selectedMarker.prospectId)}>Open on main map</Link>
                </Button>
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] flex-col justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <MapPinned className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">See where the effort went</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose a numbered marker to inspect its calls, emails, meetings, and most recent touch.</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      <div className="border-t border-slate-200 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Market effort over time</p>
            <p className="mt-1 text-sm font-semibold text-slate-950" aria-live="polite">Showing activity through {footprint.selectedDateLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setThroughIndex((current) => Math.max(0, current - 1))} disabled={throughIndex === 0} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="outline" size="sm" className="min-w-24" onClick={togglePlayback} aria-label={isPlaying ? 'Pause activity playback' : 'Play activity history'}>
              {isPlaying ? <Pause className="mr-2 h-4 w-4" aria-hidden="true" /> : <Play className="mr-2 h-4 w-4" aria-hidden="true" />}
              {isPlaying ? 'Pause' : throughIndex >= maxIndex ? 'Replay' : 'Play'}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setThroughIndex((current) => Math.min(maxIndex, current + 1))} disabled={throughIndex === maxIndex} aria-label="Next day">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-[560px] items-end gap-1" style={{ width: periodDays === 90 ? '1440px' : '100%' }}>
            {footprint.days.map((day, index) => (
              <TimelineBar
                key={day.dateKey}
                day={day}
                height={day.total > 0 ? Math.max(8, Math.round((day.total / maxDailyTotal) * 76)) : 3}
                selected={index === throughIndex}
                dimmed={index > throughIndex}
                onSelect={() => {
                  setThroughIndex(index)
                  setIsPlaying(false)
                }}
              />
            ))}
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={throughIndex}
          onChange={(event) => {
            setThroughIndex(Number(event.target.value))
            setIsPlaying(false)
          }}
          aria-label="Activity history date"
          aria-valuetext={footprint.selectedDateLabel}
          className="mt-1 h-2 w-full cursor-pointer accent-blue-600"
        />
        <div className="mt-2 flex justify-between text-[11px] text-slate-500">
          <span>{footprint.days[0]?.longLabel}</span>
          <span>{footprint.days.at(-1)?.longLabel}</span>
        </div>
      </div>
      <MappingRecovery />
    </section>
  )
}
