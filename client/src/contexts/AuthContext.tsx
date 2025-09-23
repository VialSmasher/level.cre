import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { apiUrl } from '@/lib/api'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  needsOnboarding: boolean
  isDemoMode: boolean
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  setNeedsOnboarding: (needs: boolean) => void
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
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
      // Load demo user immediately from demo endpoint
      fetch(apiUrl('/auth/demo/user'), {
        credentials: 'include',
        headers: { 'X-Demo-Mode': 'true' },
      })
        .then(res => {
          console.log('Demo mode fetch response:', res);
          return res.json();
        })
        .then(data => {
          console.log('Demo mode user data:', data);
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
            setNeedsOnboarding(false) // Demo users don't need onboarding
            setLoading(false)
            
            // Reset client state if switching to demo user
            if (prevUserId !== demoUser.id) {
              resetClientState()
            }
          } else {
            console.warn('Demo mode: unexpected user data', data);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Demo mode fetch error:', err);
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
      
      // Check if user needs onboarding (only for real users, not demo)
      if (session?.user && session.user.id !== 'demo-user') {
        try {
          const response = await fetch(apiUrl('/profile'), {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          const profile = response.ok ? await response.json() : null
          setNeedsOnboarding(!profile)
        } catch (error) {
          console.error('Error checking profile:', error)
          setNeedsOnboarding(true) // Default to requiring onboarding on error
        }
      } else {
        setNeedsOnboarding(false) // Demo users don't need onboarding
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const GOOGLE_ENABLED = (import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true')

  const signInWithGoogle = async () => {
    if (!GOOGLE_ENABLED) {
      throw new Error('Google OAuth disabled')
    }
    try {
      // Clear demo mode when starting Google flow
      localStorage.removeItem('demo-mode')
      // Use server-side OAuth endpoint
      window.location.href = apiUrl('/auth/google')
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
      const response = await fetch(apiUrl('/auth/logout'), { 
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
    needsOnboarding,
    isDemoMode,
    signInWithGoogle,
    // Magic Link sign-in via Supabase email OTP
    signInWithEmail: async (email: string) => {
      // Clear demo mode if present
      localStorage.removeItem('demo-mode')
      if (!supabase) {
        throw new Error('Auth is not configured')
      }
      const redirectTo = `${window.location.origin}/app`
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true }
      })
      if (error) throw error
    },
    signOut,
    setNeedsOnboarding,
    resetClientState,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
