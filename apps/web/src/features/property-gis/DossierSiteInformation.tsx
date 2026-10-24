import { useCallback } from 'react'
import { apiRequest } from '@/lib/queryClient'
import { SiteInformationCard } from './SiteInformationCard'
import { SiteInformationLoadError } from './loadSiteInformation'
import type { SiteBoundarySelection } from './siteSelection'

export function DossierSiteInformation({ dossierId, propertyKey, onBoundaryChange }: {
  dossierId: string
  propertyKey: string
  onBoundaryChange: (selection: SiteBoundarySelection | null) => void
}) {
  const load = useCallback(async (signal: AbortSignal) => {
    // The endpoint derives location and ownership from the dossier, never from browser payload.
    let response: Response
    try {
      response = await apiRequest('POST', `/api/intel/dossiers/${encodeURIComponent(dossierId)}/parcel-match/preview`, {}, { signal })
    } catch (failure) {
      // Translate known public codes, never raw server diagnostics.
      let code: unknown
      if (failure instanceof Error) {
        const body = failure.message.match(/^\d{3}:\s*([\s\S]+)$/)?.[1]
        try { code = body ? JSON.parse(body).code : undefined } catch { /* Non-JSON API error. */ }
      }
      if (code === 'property_location_needs_review') throw new SiteInformationLoadError('The saved property link needs review before its parcel can be checked.')
      if (code === 'property_location_missing') throw new SiteInformationLoadError('This property needs a saved map location before its parcel can be checked.')
      throw failure
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    return response.json()
  }, [dossierId])
  return <SiteInformationCard propertyKey={propertyKey} load={load} onBoundaryChange={onBoundaryChange} />
}
