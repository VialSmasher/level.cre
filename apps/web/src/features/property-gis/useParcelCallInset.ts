import { useLayoutEffect, useRef, useState } from 'react'
import { bottomOverlayInset } from './parcelViewport'

/** Observe layout only. This never changes the map camera or the pending call. */
export function useParcelCallInset(boundaryVisible: boolean) {
  const sectionRef = useRef<HTMLElement>(null)
  const [inset, setInset] = useState(0)
  useLayoutEffect(() => {
    const section = sectionRef.current
    const profile = section?.closest<HTMLElement>('[data-testid="asset-profile"]')
    if (!section || !profile) return
    const viewport = section.closest<HTMLElement>('[data-radix-scroll-area-viewport]') || profile
    const pendingCalls = Array.from(section.ownerDocument.querySelectorAll<HTMLElement>('[aria-label="Pending map call"]'))
    const measure = () => {
      const next = window.matchMedia('(max-width: 767px)').matches
        ? bottomOverlayInset(viewport.getBoundingClientRect(), pendingCalls.filter(call => call.getClientRects().length > 0).map(call => call.getBoundingClientRect()))
        : 0
      setInset(current => current === next ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    pendingCalls.forEach(call => observer.observe(call))
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [boundaryVisible])
  return { sectionRef, inset }
}
