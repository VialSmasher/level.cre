import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from 'wouter'
import { useEffect, useState } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const [, setLocation] = useLocation()

  // Check demo mode from localStorage (guarded for restricted contexts)
  let demo = false
  try {
    demo = localStorage.getItem('demo-mode') === 'true'
  } catch {
    demo = false
  }
  // Detect if OAuth is in-flight (PKCE code present). If so, hold navigation.
  const hasAuthParams = (() => {
    try {
      const qs = new URLSearchParams(window.location.search)
      return qs.has('code')
    } catch { return false }
  })()

  useEffect(() => {
    if (!loading && !user && !demo && !hasAuthParams) {
      if (import.meta?.env?.DEV) console.log('[gate] ProtectedRoute redirect -> / (no user)')
      setLocation('/')
    }
  }, [user, loading, demo, hasAuthParams, setLocation])

  if (loading || hasAuthParams) {
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
