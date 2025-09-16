import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from 'wouter'
import { useEffect, useState } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const [, setLocation] = useLocation()

  // Check demo mode from localStorage
  const demo = localStorage.getItem('demo-mode') === 'true'

  useEffect(() => {
    if (!loading && !user && !demo) {
      setLocation('/')
    }
  }, [user, loading, demo, setLocation])

  if (loading) {
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