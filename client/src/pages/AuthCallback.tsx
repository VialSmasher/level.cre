import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const [, setLocation] = useLocation()

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await supabase?.auth.exchangeCodeForSession(window.location.href)
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

