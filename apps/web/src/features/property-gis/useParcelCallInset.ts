import { useLayoutEffect, useRef, useState } from 'react'
import { profileCallInset } from './parcelViewport'

/** Observe layout only. This never changes the map camera or the pending call. */
export function useParcelCallInset(boundaryVisible: boolean) {
  const sectionRef = useRef<HTMLElement>(null)
  const [inset, setInset] = useState(0)
  useLayoutEffect(() => {
    const section = sectionRef.current
    const profile = section?.closest<HTMLElement>('[data-testid="asset-profile"]')
    if (!section || !profile) return
    const pendingCalls = Array.from(section.ownerDocument.querySelectorAll<HTMLElement>('[aria-label="Pending map call"]'))
    const measure = () => {
      // Never measure the scroller's intrinsic content height: it includes our
      // spacer and would feed its own growth back into the next measurement.
      const rect = profile.getBoundingClientRect()
      const next = window.matchMedia('(max-width: 767px)').matches
        ? profileCallInset(rect, pendingCalls.filter(call => call.getClientRects().length > 0).map(call => call.getBoundingClientRect()), window.visualViewport?.height ?? window.innerHeight, window.visualViewport?.offsetTop ?? 0)
        : 0
      setInset(current => current === next ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(profile)
    pendingCalls.forEach(call => observer.observe(call))
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [boundaryVisible])
  return { sectionRef, inset }
}
