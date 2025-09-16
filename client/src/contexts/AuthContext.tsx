import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isDemoMode: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resetClientState: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  
  // Reset client state function that pages can call on user change
  const resetClientState = useCallback(() => {
    // Invalidate all user-scoped queries to force refetch with new user data
    queryClient.invalidateQueries({ queryKey: ['/api/prospects'] })
    queryClient.invalidateQueries({ queryKey: ['/api/submarkets'] })
    queryClient.invalidateQueries({ queryKey: ['/api/requirements'] })
    queryClient.invalidateQueries({ queryKey: ['/api/interactions'] })
    queryClient.invalidateQueries({ queryKey: ['/api/skills'] })
    queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] })
    queryClient.invalidateQueries({ queryKey: ['/api/profile'] })
    
    // Dispatch global event for components to reset their state
    window.dispatchEvent(new CustomEvent('userChanged'))
  }, [])

  useEffect(() => {
    // Check if demo mode was requested (allow in production per user request)
    const demoModeRequested = localStorage.getItem('demo-mode') === 'true'
    setIsDemoMode(demoModeRequested)
    
    if (demoModeRequested) {
      // Load demo user immediately with demo headers
      fetch('/api/auth/user', {
        headers: {
          'X-Demo-Mode': 'true'
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.id === 'demo-user') {
            const prevUserId = user?.id
            const demoUser = {
              id: data.id,
              email: data.email,
              user_metadata: {
                full_name: `${data.firstName} ${data.lastName}`,
                avatar_url: data.profileImageUrl
              },
              app_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString()
            } as unknown as User
            setUser(demoUser)
            setLoading(false)
            
            // Reset client state if switching to demo user
            if (prevUserId !== demoUser.id) {
              resetClientState()
            }
          }
        })
        .catch(() => {
          setLoading(false)
        })
      return
    }
    
    if (!supabase) {
      // No Supabase configured - user needs to authenticate manually or use demo
      setLoading(false)
      return
    }

    // Handle OAuth callback and session management
    const handleAuthCallback = async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      
      // Check for OAuth errors in URL
      const urlParams = new URLSearchParams(window.location.search)
      const authError = urlParams.get('error')
      
      if (authError) {
        console.error('OAuth error:', authError)
        setLoading(false)
        return
      }
      
      // Check if this is an OAuth callback with hash parameters
      const hashParams = window.location.hash
      if (hashParams && (hashParams.includes('access_token') || hashParams.includes('error'))) {
        console.log('Processing OAuth callback...')
        // Let Supabase handle the callback
        await supabase.auth.getSession()
        // Clear URL parameters after processing
        window.history.replaceState({}, '', window.location.pathname)
      }
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }
    
    handleAuthCallback()

    if (!supabase) return

    // Listen for auth changes  
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const prevUserId = user?.id
      setSession(session)
      setUser(session?.user ?? null)
      
      // Reset client state when user changes (including to/from null)
      if (prevUserId !== session?.user?.id) {
        resetClientState()
      }
      
      // Auto-create profile for new real users
      if (session?.user && session.user.id !== 'demo-user') {
        try {
          // Check if profile exists
          const response = await fetch('/api/profile', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          
          if (!response.ok && response.status === 404) {
            // Profile doesn't exist - create it automatically
            const profileData = {
              name: session.user.user_metadata?.full_name || '',
              company: '',
              email: session.user.email || '',
              marketCity: 'Edmonton',
              submarkets: ['NW', 'NE', 'SW', 'SE'],
              assetClasses: []
            }
            
            await fetch('/api/profile', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(profileData)
            })
          }
        } catch (error) {
          console.error('Error handling profile:', error)
        }
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    console.log('Starting server-side Google OAuth flow...')
    
    try {
      // Use server-side OAuth endpoint - bypasses CSP issues completely
      window.location.href = '/api/auth/google'
    } catch (error: any) {
      console.error('OAuth redirect error:', error)
      throw new Error('Failed to initiate Google sign-in')
    }
  }

  const signOut = async () => {
    // Check if this is demo mode
    if (user?.id === 'demo-user') {
      // Demo mode sign out - clear demo flag and redirect to landing
      localStorage.removeItem('demo-mode')
      setUser(null)
      setSession(null)
      window.location.href = '/'
      return
    }
    
    try {
      // Use server-side logout endpoint
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        setUser(null)
        setSession(null)
        window.location.href = '/'
      } else {
        throw new Error('Logout failed')
      }
    } catch (error) {
      console.error('Logout error:', error)
      // Force logout on client side even if server fails
      setUser(null)
      setSession(null)
      window.location.href = '/'
    }
  }

  const value = {
    user,
    session,
    loading,
    isDemoMode,
    signInWithGoogle,
    signOut,
    resetClientState,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}