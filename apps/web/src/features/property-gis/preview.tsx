import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MapPin, X } from 'lucide-react'
import { SiteInformationCard } from './SiteInformationCard'
import { PreviewMap, type PublicMapLocation } from './PreviewMap'
import { boundaryForProperty, type SiteBoundarySelection } from './siteSelection'
import '@/index.css'

// These are public point queries checked against City of Edmonton records on 2026-10-23.
// They are not copied from a client dossier and never create prospects or property records.
const PUBLIC_LOCATIONS: PublicMapLocation[] = [
  { id: 'public:150367', label: '14505 - 124 Avenue NW', latitude: 53.578, longitude: -113.572 },
  { id: 'public:701197', label: '14515 - 124 Avenue NW', latitude: 53.578, longitude: -113.574 },
]

function PublicSiteCard({ location, onBoundaryChange }: { location: PublicMapLocation; onBoundaryChange: (value: SiteBoundarySelection | null) => void }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const response = await fetch('/api/property-gis/preview', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude, municipality: 'Edmonton' }),
    })
    if (!response.ok) throw new Error('Municipal lookup unavailable')
    return response.json()
  }, [location.latitude, location.longitude])
  return <SiteInformationCard propertyKey={location.id} load={load} onBoundaryChange={onBoundaryChange} />
}

// The production story has broker classification, contact and activity controls.
// This frame deliberately imports none of that session/CRM behavior.
function PublicParcelPreviewPanel({ location, onClose, boundaryVisible, children }: {
  location: PublicMapLocation
  onClose: () => void
  boundaryVisible: boolean
  children: React.ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [location.id])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <aside aria-label={`Parcel preview for ${location.label}`} data-property-gis-panel
    className={`absolute bottom-2 left-2 right-2 z-[80] flex ${boundaryVisible ? 'max-h-[52%]' : 'max-h-[78dvh]'} flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[380px] md:rounded-none md:border-y-0 md:border-r-0 md:border-l`}>
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">Public preview</span><h2 ref={heading} tabIndex={-1} className="mt-2 text-base font-semibold leading-5 text-slate-950 outline-none">{location.label}</h2></div>
      <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-slate-100" onClick={onClose} aria-label="Close public parcel preview"><X className="h-4 w-4" aria-hidden /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </aside>
}

function ParcelPreview() {
  const [selected, setSelected] = useState<PublicMapLocation | null>(PUBLIC_LOCATIONS[0])
  const [boundary, setBoundary] = useState<SiteBoundarySelection | null>(null)
  const closePreview = useCallback(() => setSelected(null), [])
  const candidate = boundaryForProperty(boundary, selected?.id || null)
  return (
    <main className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-3 text-base font-semibold"><span className="text-blue-700">LEVEL CRE</span><span className="font-normal text-slate-400">/</span>Parcel preview</h1>
          <span className="rounded bg-blue-50 px-2.5 py-1 text-xs text-blue-800">Public municipal data · Local preview</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Select a property and check its parcel. Your live CRM is not connected.</p>
      </header>
      <nav aria-label="Public sample properties" className="flex shrink-0 flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        {PUBLIC_LOCATIONS.map((location) => (
          <button type="button" key={location.id} aria-pressed={selected?.id === location.id} onClick={() => setSelected(location)}
            className={`flex min-h-10 items-center gap-2 rounded border px-3 py-2 text-xs font-medium ${selected?.id === location.id ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <MapPin className="h-3.5 w-3.5" aria-hidden />{location.label}
          </button>
        ))}
      </nav>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={selected ? 'h-full md:mr-[380px]' : 'h-full'}>
          <PreviewMap locations={PUBLIC_LOCATIONS} selected={selected} candidate={candidate} onSelect={setSelected} />
        </div>
        {selected ? (
          <PublicParcelPreviewPanel key={selected.id} location={selected} onClose={closePreview} boundaryVisible={Boolean(candidate)}>
            <PublicSiteCard key={selected.id} location={selected} onBoundaryChange={setBoundary} />
          </PublicParcelPreviewPanel>
        ) : null}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><ParcelPreview /></React.StrictMode>)
