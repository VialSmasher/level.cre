import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const [, setLocation] = useLocation()

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        if (!supabase) {
          // Surface clearer signal when auth isn't configured in this environment
          console.error('[auth] Supabase client not configured; cannot exchange PKCE code')
          window.history.replaceState({}, '', '/')
          setLocation('/?error=auth_not_configured')
          return
        }
        await supabase.auth.exchangeCodeForSession(window.location.href)
        if (cancelled) return
        // Clean the URL and go to app
        window.history.replaceState({}, '', '/app')
        setLocation('/app')
      } catch (err) {
        console.error('[auth] PKCE exchange failed', err)
        window.history.replaceState({}, '', '/')
        setLocation('/')
      }
    }
    run()
    return () => { cancelled = true }
  }, [setLocation])

  return null
}
