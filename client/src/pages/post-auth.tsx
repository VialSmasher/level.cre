import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'
import { apiRequest } from '@/lib/queryClient'

export default function PostAuth() {
  const [, setLocation] = useLocation()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    // Prefetch main app modules (non-blocking)
    try { import('@/pages/home') } catch {}
    try { import('@/components/AppLayout') } catch {}

    // Give the app a tiny idle window to settle after PKCE exchange
    const go = async () => {
      try {
        // Ensure a session exists before routing
        if (supabase) {
          await supabase.auth.getSession()
        }
        // Optionally warm server-side bootstrap (ignore failures)
        try { await apiRequest('GET', '/api/bootstrap') } catch {}
      } catch {}
      // Route into the app
      setLocation('/app')
    }

    // Use requestIdleCallback if available, else a short timeout
    const id = (window as any).requestIdleCallback
      ? (window as any).requestIdleCallback(go, { timeout: 200 })
      : setTimeout(go, 120)

    return () => {
      if ((window as any).cancelIdleCallback && typeof id === 'number') {
        try { (window as any).cancelIdleCallback(id) } catch {}
      } else {
        clearTimeout(id as any)
      }
    }
  }, [setLocation])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Preparing your workspace…</p>
      </div>
    </div>
  )
}

