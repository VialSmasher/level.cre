import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropertySiteInformationPreview } from '@level-cre/shared'
import { initialCandidateKey } from './siteSelection'
import { loadSiteInformation, SiteInformationLoadError, SiteInformationTimeoutError, type SiteInformationLoader } from './loadSiteInformation'

export type { SiteInformationLoader } from './loadSiteInformation'

// Mount with a property-specific key so detail and boundary selection cannot cross assets.
export function useSiteInformation(load: SiteInformationLoader) {
  const [info, setInfo] = useState<PropertySiteInformationPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidateKey, setCandidateKey] = useState<string | null>(null)
  const [showBoundary, setShowBoundary] = useState(false)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => { request.current?.abort(); request.current = null }, [])

  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const next = await loadSiteInformation(load, controller)
      if (controller.signal.aborted) return
      if (next.status === 'unavailable') {
        setError('The municipal source is unavailable. Try again shortly.')
        // Retain only the previous preview; never describe it as saved or current.
        setInfo((previous) => previous || next)
      } else {
        setInfo(next)
        const nextCandidate = initialCandidateKey(next)
        setCandidateKey(nextCandidate)
        // One requested lookup reveals a unique match; ambiguity still requires a choice.
        setShowBoundary(Boolean(nextCandidate))
      }
    } catch (failure) {
      if (request.current === controller && (!controller.signal.aborted || failure instanceof SiteInformationTimeoutError)) {
        setError(failure instanceof SiteInformationTimeoutError || failure instanceof SiteInformationLoadError ? failure.message : 'Site information could not be loaded. Try again.')
      }
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }, [load])

  const selectCandidate = useCallback((key: string) => {
    setCandidateKey(key)
    setShowBoundary(true)
  }, [])

  return {
    info, loading, error, refresh, candidateKey, selectCandidate,
    candidate: info?.candidates.find((item) => item.sourceQualifiedKey === candidateKey) || null,
    showBoundary, setShowBoundary,
  }
}
