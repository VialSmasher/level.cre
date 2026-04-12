import { useAuth } from '@/contexts/AuthContext'
import { getOAuthCallbackPath } from '@/lib/authUtils'
import { useLocation } from 'wouter'
import {
  clearPostAuthPending,
  clearStoredPostAuthRedirect,
  hasPostAuthPending,
  setStoredPostAuthRedirect,
} from '@/lib/postAuthRedirect'
import { useEffect, useState } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const [, setLocation] = useLocation()
  const [authGraceExpired, setAuthGraceExpired] = useState(false)

  // Check demo mode from localStorage (guarded for restricted contexts)
  let demo = false
  try {
    demo = localStorage.getItem('demo-mode') === 'true'
  } catch {
    demo = false
  }
  // If OAuth lands on a protected route like '/app?code=...' or '/app#access_token=...',
  // forward it to the dedicated callback page so the session exchange can complete.
  const oauthCallbackPath = getOAuthCallbackPath()
  const hasOAuthReturn = Boolean(oauthCallbackPath)
  const postAuthPending = hasPostAuthPending()

  useEffect(() => {
    if (!postAuthPending) {
      setAuthGraceExpired(false)
      return
    }

    if (user) {
      clearPostAuthPending()
      clearStoredPostAuthRedirect()
      setAuthGraceExpired(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      clearPostAuthPending()
      setAuthGraceExpired(true)
    }, 5000)

    return () => window.clearTimeout(timeoutId)
  }, [postAuthPending, user])

  useEffect(() => {
    if (!loading && !user && !demo && oauthCallbackPath) {
      if (import.meta?.env?.DEV) console.log('[gate] ProtectedRoute forwarding OAuth return ->', oauthCallbackPath)
      window.location.replace(oauthCallbackPath)
      return
    }

    if (!loading && !user && !demo && postAuthPending && !authGraceExpired) {
      if (import.meta?.env?.DEV) console.log('[gate] ProtectedRoute waiting for post-auth hydration')
      return
    }

    if (!loading && !user && !demo) {
      if (import.meta?.env?.DEV) console.log('[gate] ProtectedRoute redirect -> / (no user)')
      setStoredPostAuthRedirect(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      )
      setLocation('/')
    }
  }, [user, loading, demo, oauthCallbackPath, postAuthPending, authGraceExpired, setLocation])

  useEffect(() => {
    if (!user || !hasOAuthReturn) return
    try {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    } catch {}
  }, [user, hasOAuthReturn])

  if (loading || (!user && hasOAuthReturn) || (!user && postAuthPending && !authGraceExpired)) {
    if (import.meta?.env?.DEV && loading) console.log('[gate] ProtectedRoute loading...')
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user && !demo) {
    return null
  }

  return <>{children}</>
}
