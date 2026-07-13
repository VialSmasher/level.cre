import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredPostAuthRedirect, markPostAuthPending } from '@/lib/postAuthRedirect'

export default function AuthCallback() {
  useEffect(() => {
    let cancelled = false

    const redirectToPostAuthDestination = () => {
      const nextPath = getStoredPostAuthRedirect() || '/app/desk'
      markPostAuthPending()
      window.location.replace(nextPath)
    }

    const redirectToLanding = (params?: URLSearchParams) => {
      const search = params?.toString()
      const nextLocation = search ? `/?${search}` : '/'
      window.location.replace(nextLocation)
    }

    async function run() {
      const authClient = supabase
      if (!authClient) {
        console.error('[auth] Supabase client not configured; cannot exchange PKCE code')
        redirectToLanding(new URLSearchParams({ error: 'auth_not_configured' }))
        return
      }

      try {
        const url = new URL(window.location.href)
        const authError = url.searchParams.get('error')
        const authErrorDescription = url.searchParams.get('error_description')
        if (authError) {
          console.error('[auth] OAuth provider returned an error', { authError, authErrorDescription })
          const params = new URLSearchParams({ error: authError })
          if (authErrorDescription) {
            params.set('error_description', authErrorDescription)
          }
          redirectToLanding(params)
          return
        }

        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) {
            throw error
          }
          if (cancelled) return
          redirectToPostAuthDestination()
          return
        }

        const code = url.searchParams.get('code')
        if (!code) {
          const { data: { session } } = await authClient.auth.getSession()
          if (cancelled) return
          if (session) {
            redirectToPostAuthDestination()
          } else {
            redirectToLanding(new URLSearchParams({ error: 'missing_auth_code' }))
          }
          return
        }

        const { data, error } = await authClient.auth.exchangeCodeForSession(code)
        if (error) {
          throw error
        }
        if (!data.session) {
          throw new Error('No session returned after OAuth code exchange')
        }

        if (cancelled) return
        redirectToPostAuthDestination()
      } catch (err: any) {
        console.error('[auth] PKCE exchange failed', err)
        try {
          const { data: { session } } = await authClient.auth.getSession()
          if (!cancelled && session) {
            redirectToPostAuthDestination()
            return
          }
        } catch {}
        const params = new URLSearchParams({ error: 'oauth_callback_failed' })
        if (err?.message) {
          params.set('error_description', err.message)
        }
        redirectToLanding(params)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  return null
}
