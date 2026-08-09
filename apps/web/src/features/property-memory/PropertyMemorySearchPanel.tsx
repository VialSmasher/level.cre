import { useEffect, useMemo, useState } from 'react'
import { Activity, Building2, FileSearch, FilterX, LoaderCircle, MapPin, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
  type PropertyMemorySearchFilters,
  type PropertyMemorySearchRow,
  useInfinitePropertyMemorySearch,
} from './api'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (row: PropertyMemorySearchRow) => void
}

const EMPTY_FILTERS: PropertyMemorySearchFilters = {
  q: '',
  owner: '',
  legal: '',
  linc: '',
  zoning: '',
  submarket: '',
  prospectStatus: '',
  activityRecency: 'any',
  limit: 50,
}

const PROPERTY_MEMORY_SEARCH_DEBOUNCE_MS = 275

function layerLabel(layer: PropertyMemorySearchRow['layer']) {
  if (layer === 'review') return 'Needs review'
  if (layer === 'existing') return 'Existing map record'
  return 'Market memory'
}

function layerClass(layer: PropertyMemorySearchRow['layer']) {
  if (layer === 'review') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (layer === 'existing') return 'border-teal-200 bg-teal-50 text-teal-800'
  return 'border-blue-200 bg-blue-50 text-blue-800'
}

function activityLabel(value: string | null) {
  if (!value) return 'No linked activity yet'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return `Last activity ${new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)}`
}

const MATCHED_FIELD_LABELS: Record<string, string> = {
  owner: 'registered owner',
}

export function PropertyMemorySearchPanel({ open, onClose, onSelect }: Props) {
  const [filters, setFilters] = useState<PropertyMemorySearchFilters>(EMPTY_FILTERS)
  const [serverFilters, setServerFilters] = useState<PropertyMemorySearchFilters>(EMPTY_FILTERS)
  const stableFilters = useMemo(() => ({ ...serverFilters, limit: 50 }), [serverFilters])
  const query = useInfinitePropertyMemorySearch(stableFilters, { enabled: open })
  const rows = useMemo(() => {
    const byCanonicalKey = new Map<string, PropertyMemorySearchRow>()
    for (const page of query.data?.pages || []) {
      for (const row of page.rows) {
        if (!byCanonicalKey.has(row.canonicalKey)) byCanonicalKey.set(row.canonicalKey, row)
      }
    }
    return Array.from(byCanonicalKey.values())
  }, [query.data])
  const firstPage = query.data?.pages[0]
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'limit' && value && value !== 'any')

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => setServerFilters(filters), PROPERTY_MEMORY_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [filters, open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const update = (key: keyof PropertyMemorySearchFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <aside
      className="absolute inset-y-2 right-2 z-[85] flex w-[calc(100vw-1rem)] max-w-[430px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl md:inset-y-0 md:right-0 md:w-[410px] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-memory-search-title"
      aria-busy={query.isFetching}
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="property-memory-search-title" className="flex items-center gap-2 text-base font-semibold text-slate-950"><FileSearch className="h-4 w-4 text-blue-700" />Search property memory</h2>
            <p className="mt-1 text-xs text-slate-500">Search the title, ownership, zoning, submarket and activity history already captured in Level CRE.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="Close property-memory search"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input value={filters.q || ''} onChange={(event) => update('q', event.target.value)} className="bg-white pl-9" placeholder="Address, owner, title, company…" aria-label="Search all property-memory fields" autoFocus />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={filters.owner || ''} onChange={(event) => update('owner', event.target.value)} className="bg-white" placeholder="Registered owner" aria-label="Filter by registered owner" />
          <Input value={filters.linc || ''} onChange={(event) => update('linc', event.target.value)} className="bg-white" placeholder="LINC" aria-label="Filter by LINC" />
          <Input value={filters.legal || ''} onChange={(event) => update('legal', event.target.value)} className="bg-white" placeholder="Legal description/title" aria-label="Filter by legal description or title" />
          <Input value={filters.zoning || ''} onChange={(event) => update('zoning', event.target.value)} className="bg-white" placeholder="Zoning" aria-label="Filter by zoning" />
          <Input value={filters.submarket || ''} onChange={(event) => update('submarket', event.target.value)} className="bg-white" placeholder="Brokerage submarket" aria-label="Filter by brokerage submarket" />
          <Select value={filters.prospectStatus || 'any'} onValueChange={(value) => update('prospectStatus', value === 'any' ? '' : value)}>
            <SelectTrigger className="bg-white" aria-label="Filter by prospect status"><SelectValue placeholder="Any prospect status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any prospect status</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="listing">Listing</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="no_go">No go</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filters.activityRecency || 'any'} onValueChange={(value) => update('activityRecency', value)}>
            <SelectTrigger className="min-w-0 flex-1 bg-white" aria-label="Filter by activity recency"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any activity age</SelectItem>
              <SelectItem value="30d">Active in 30 days</SelectItem>
              <SelectItem value="90d">Active in 90 days</SelectItem>
              <SelectItem value="180d">Active in 6 months</SelectItem>
              <SelectItem value="365d">Active in 12 months</SelectItem>
              <SelectItem value="never">Never touched</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!hasFilters}
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setServerFilters(EMPTY_FILTERS)
            }}
          >
            <FilterX className="h-4 w-4" />Reset
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        <span role="status" aria-live="polite">
          {query.isFetching && !query.isFetchingNextPage
            ? 'Searching Level CRE…'
            : `${firstPage?.total || 0} canonical propert${firstPage?.total === 1 ? 'y' : 'ies'}`}
        </span>
        <span>{firstPage?.source.anchorCount || 0} map records indexed</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {query.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading brokerage memory</div>
        ) : null}
        {query.error ? (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error.message}</div>
        ) : null}
        {!query.isLoading && !query.error && rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Building2 className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-800">No property memory matched</p>
            <p className="mt-1 text-xs text-slate-500">Try a shorter owner/legal term or reset one of the structured filters.</p>
          </div>
        ) : null}
        <div className="divide-y divide-slate-200">
          {rows.map((row) => (
            <button key={row.canonicalKey} type="button" className="w-full px-4 py-4 text-left hover:bg-slate-50 focus:bg-blue-50 focus:outline-none" onClick={() => onSelect(row)}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`rounded text-[10px] ${layerClass(row.layer)}`}>{layerLabel(row.layer)}</Badge>
                {row.prospectStatus ? <Badge variant="outline" className="rounded bg-white text-[10px] text-slate-600">{row.prospectStatus.replace('_', ' ')}</Badge> : null}
              </div>
              <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-950"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{row.address}</p>
              {row.owners.length ? <p className="mt-1 line-clamp-2 text-xs text-slate-700"><span className="font-semibold">Registered owner:</span> {row.owners.join(', ')}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                {[row.lincs[0] ? `LINC ${row.lincs[0]}` : null, row.zoning.join(' / ') || null, row.submarket].filter(Boolean).join(' · ') || 'Legal/market details not yet assigned'}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Activity className="h-3.5 w-3.5" />{activityLabel(row.lastActivityAt)}{row.activityCount ? ` · ${row.activityCount} linked item${row.activityCount === 1 ? '' : 's'}` : ''}</p>
              {row.matchedFields.length ? <p className="mt-1 text-[10px] uppercase tracking-wide text-blue-700">Matched {row.matchedFields.map((field) => MATCHED_FIELD_LABELS[field] || field).join(', ')}</p> : null}
            </button>
          ))}
          {query.hasNextPage ? (
            <div className="p-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {query.isFetchingNextPage ? 'Loading more…' : `Load more (${rows.length} of ${firstPage?.total || rows.length})`}
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  )
}
