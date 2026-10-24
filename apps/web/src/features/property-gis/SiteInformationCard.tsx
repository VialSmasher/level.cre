import { useEffect } from 'react'
import { ExternalLink, LoaderCircle, MapPin, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSiteInformation, type SiteInformationLoader } from './useSiteInformation'
import type { SiteBoundarySelection } from './siteSelection'
import { useParcelCallInset } from './useParcelCallInset'

type Props = {
  propertyKey: string
  load: SiteInformationLoader
  onBoundaryChange: (selection: SiteBoundarySelection | null) => void
}

function displayDate(value: string | null | undefined, sourceCalendarDate = false) {
  if (!value) return 'Not published'
  // Municipal extraction dates can be timezone-less. Preserve their published day.
  const date = new Date(sourceCalendarDate ? `${value.slice(0, 10)}T12:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? 'Not published' : date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: sourceCalendarDate ? 'UTC' : 'America/Edmonton' })
}

export function SiteInformationCard({ propertyKey, load, onBoundaryChange }: Props) {
  const state = useSiteInformation(load)
  const { info, candidate, loading, error, showBoundary } = state
  const { sectionRef, inset } = useParcelCallInset(Boolean(showBoundary && candidate))

  useEffect(() => {
    onBoundaryChange(showBoundary && candidate ? { propertyKey, candidate } : null)
  }, [candidate, onBoundaryChange, propertyKey, showBoundary])
  useEffect(() => () => onBoundaryChange(null), [onBoundaryChange])

  return (
    <section ref={sectionRef} aria-label="Site information" data-property-gis-boundary-visible={Boolean(showBoundary && candidate)} className="border-t border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ScanLine className="h-4 w-4 text-blue-700" aria-hidden />Site information</h3>
        {info ? <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">Not linked</span> : null}
      </div>
      {!info && !loading && !error ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">Municipal boundary, mapped area and zoning.</p>
      ) : null}

      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />Checking municipal records…</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs leading-5 text-amber-800">{error}{info?.candidates.length ? ' Showing the previous preview.' : ''}</p> : null}

      {info?.status === 'ambiguous' || (info?.candidates.length && !candidate) ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs leading-5 text-amber-800">Choose a parcel to inspect. The property link still needs review.</p>
          {info.candidates.map((item) => (
            <button key={item.sourceQualifiedKey} type="button" onClick={() => state.selectCandidate(item.sourceQualifiedKey)}
              aria-pressed={state.candidateKey === item.sourceQualifiedKey}
              className={`block w-full rounded-md border p-2.5 text-left text-xs hover:border-blue-400 ${state.candidateKey === item.sourceQualifiedKey ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <span className="block font-semibold text-slate-800">{item.address || `Parcel ${item.sourceParcelId}`}</span>
              <span className="mt-1 block text-slate-500">{item.sourceParcelId}{item.legalDescription ? ` · ${item.legalDescription}` : ''}</span>
            </button>
          ))}
        </div>
      ) : null}

      {candidate ? (
        <div className="mt-3">
          <p className="text-xs text-slate-600">{candidate.match.pinRelation === 'inside' ? 'Parcel at pin' : 'Parcel needs review'} · {candidate.sourceParcelId}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-slate-500">Gross mapped area</dt><dd className="mt-1 font-semibold text-slate-900">{candidate.areaAcres == null ? 'Unknown' : `${candidate.areaAcres.toFixed(2)} acres`}</dd></div>
            <div><dt className="text-slate-500">Zoning at pin</dt><dd className="mt-1 font-semibold text-slate-900">{info?.currentZoning.length ? info.currentZoning.map((item) => <span key={`${item.code}:${item.source.url}`} className="block">{item.code}{item.description ? <span className="mt-0.5 block font-normal text-slate-600">{item.description}</span> : null}</span>) : 'Unknown'}</dd></div>
          </dl>
          {candidate.match.conflicts.length ? <p className="mt-2 text-xs leading-5 text-amber-800">{candidate.match.conflicts.join(' ')}</p> : null}
          <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11 flex-1 text-xs" aria-pressed={showBoundary} onClick={() => state.setShowBoundary(!showBoundary)}>
            <MapPin className="mr-1.5 h-3.5 w-3.5" aria-hidden />{showBoundary ? 'Hide boundary' : 'Show boundary'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 text-xs text-slate-600" disabled={loading} onClick={() => void state.refresh()}>{error ? 'Retry' : 'Refresh'}</Button>
          </div>
        </div>
      ) : null}

      {info && !info.candidates.length && (info.status !== 'unavailable' || info.currentZoning.length > 0) ? (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          {info.status === 'unavailable' ? 'Available evidence:' : info.status === 'unsupported' ? 'Parcel lookup currently covers Edmonton only.' : 'No parcel boundary returned at this pin. Its location is unchanged.'}
          {info.currentZoning.length ? ` Zoning at pin: ${info.currentZoning.map((zone) => zone.code).join(' / ')}.` : ''}
        </p>
      ) : null}

      {info ? (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-700">Sources &amp; details</summary>
          <div className="mt-2 space-y-3 text-xs leading-5">
            <p>Read-only preview. The parcel has not been linked and the saved pin is unchanged.</p>
            {candidate ? <><p>{candidate.legalDescription || 'Legal description unavailable.'}</p><p>{candidate.areaBasis}</p></> : null}
            {info.sources.map((source, index) => (
              <div key={`${source.url}:${index}`} className="border-t border-slate-100 pt-2">
                <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-blue-700 hover:underline">{source.title}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden /></a>
                <p className="text-slate-500">{source.publisher}</p>
                <p>Source date: {displayDate(source.sourceDate, true)}</p>
                {source.sourceDateBasis ? <p className="text-slate-500">{source.sourceDateBasis}</p> : null}
                <p>Retrieved: {displayDate(source.retrievedAt)}</p>
              </div>
            ))}
            {info.warnings.length ? <ul className="list-disc space-y-1 pl-4">{info.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
          </div>
        </details>
      ) : null}

      {!candidate ? <Button type="button" variant={info ? 'ghost' : 'outline'} size="sm" className={`mt-2 min-h-11 text-xs ${info ? 'text-slate-600' : 'w-full'}`} disabled={loading} onClick={() => void state.refresh()}>
        {error ? 'Retry' : info ? 'Refresh' : 'Check parcel'}
      </Button> : null}
      {inset > 0 ? <div aria-hidden="true" data-property-gis-call-clearance style={{ height: inset }} /> : null}
    </section>
  )
}
