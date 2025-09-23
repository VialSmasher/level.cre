import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient, apiRequest } from '@/lib/queryClient'
import { apiUrl } from '@/lib/api'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  needsOnboarding: boolean
  isDemoMode: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  setNeedsOnboarding: (needs: boolean) => void
  resetClientState: () => void
}

// Dev-safe fallback to avoid hard crashes during HMR/module duplication.
// If a consumer renders before <AuthProvider> mounts (e.g., after a hot reload),
// return a conservative no-op context so public pages (like landing) can still render.
const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  needsOnboarding: false,
  isDemoMode: false,
  signInWithGoogle: async () => {
    try { window.location.assign('/api/auth/google') } catch {}
  },
  signInWithEmail: async () => { throw new Error('Magic link disabled') },
  signOut: async () => { try { localStorage.removeItem('demo-mode') } catch {}; window.location.replace('/') },
  setNeedsOnboarding: () => {},
  resetClientState: () => {},
}

// Ensure a single shared context instance across HMR/module duplication
// by caching it on the global object.
const globalAny = globalThis as any;
const AuthContext: React.Context<AuthContextType | undefined> =
  globalAny.__APP_AUTH_CONTEXT || createContext<AuthContextType | undefined>(undefined);
globalAny.__APP_AUTH_CONTEXT = AuthContext;

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    // During HMR or early render, gracefully fall back to a safe default.
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('useAuth used before AuthProvider mounted; returning default fallback context')
    }
    return defaultAuthContext
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const DISABLE_ONBOARDING = (
    import.meta.env.VITE_DISABLE_ONBOARDING === '1' ||
    import.meta.env.VITE_DISABLE_ONBOARDING === 'true'
  )
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const bootstrappedForUserRef = useRef<string | null>(null)
  
  // Absolute fail-safe: never let the app hang on a spinner forever
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => (prev ? false : prev))
    }, 4000)
    return () => clearTimeout(timeout)
  }, [])
  
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
    const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Check if demo mode was requested (allow in production per user request)
    const demoModeRequested = localStorage.getItem('demo-mode') === 'true'
    setIsDemoMode(demoModeRequested)
    
    if (demoModeRequested) {
      // Load demo user immediately from demo endpoint
      apiRequest('GET', '/api/auth/demo/user')
        .then(async res => {
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
      // No Supabase configured and no basic token - user needs to authenticate manually or use demo
      setLoading(false)
      return
    }

    // Initialize from current session; the PKCE code exchange happens on /auth/callback page
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session ?? null)
        setUser(data.session?.user ?? null)
      })
      .catch((e) => {
        console.error('getSession failed:', e)
      })
      .finally(() => setLoading(false))

    if (!supabase) return

    // Listen for auth changes (deduped across HMR)
    const g: any = globalThis as any
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (import.meta?.env?.DEV) {
        console.log('[auth] onAuthStateChange:', event, !!session?.user)
      }
      const prevUserId = user?.id
      setSession(session)
      setUser(session?.user ?? null)
      
      // Reset client state when user changes (including to/from null)
      if (prevUserId !== session?.user?.id) {
        resetClientState()
      }
      
      // Bootstrap profile/config once per login (real users only)
      if (session?.user && session.user.id !== 'demo-user') {
        try {
          if (DISABLE_ONBOARDING) {
            setNeedsOnboarding(false)
          } else {
            if (bootstrappedForUserRef.current !== session.user.id) {
              bootstrappedForUserRef.current = session.user.id
              const tB0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              const res = await apiRequest('GET', '/api/bootstrap')
              const payload = res.ok ? await res.json() : null
              if (import.meta?.env?.DEV) console.log('[bootstrap]', payload)
              const profile = payload?.profile ?? null
              // Seed cache to avoid an immediate '/api/profile' fetch
              try { queryClient.setQueryData(['/api/profile'], profile) } catch {}
              setNeedsOnboarding(!profile)
              const tB1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              if (import.meta?.env?.DEV) console.log(`[timing] bootstrap in ${Math.round(tB1 - tB0)}ms`)
            }
          }
        } catch (error) {
          console.error('Bootstrap error:', error)
          setNeedsOnboarding(false)
        }
      } else {
        setNeedsOnboarding(false) // Demo users don't need onboarding
      }
      
      setLoading(false)
    })
    // cache subscription globally; if another mount occurs due to HMR, previous sub is fine
    g.__AUTH_CTX_SUB__ = data.subscription

    const tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (import.meta?.env?.DEV) console.log(`[timing] AuthProvider init in ${Math.round(tEnd - tStart)}ms`)

    return () => {
      try { data.subscription?.unsubscribe?.() } catch {}
    }
  }, [])

  const GOOGLE_ENABLED = (import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true')

  const signInWithGoogle = async () => {
    if (!GOOGLE_ENABLED) {
      throw new Error('Google OAuth disabled')
    }
    try {
      // Clear demo mode when starting Google flow
      localStorage.removeItem('demo-mode')
      if (!supabase) throw new Error('Auth is not configured')
      const appOriginEnv = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()
      const origin = (appOriginEnv && appOriginEnv.length > 0 ? appOriginEnv : window.location.origin)
        .trim()
        .replace(/\/$/, '')
      const redirectTo = (
        (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim()
      ) || `${origin}/auth/callback`
      const { error } = await supabase.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { 
          redirectTo,
          queryParams: { prompt: 'select_account', access_type: 'offline' },
          flowType: 'pkce',
        } 
      })
      if (error) throw error
    } catch (error: any) {
      console.error('OAuth redirect error:', error)
      throw new Error('Failed to initiate Google sign-in')
    }
  }

  const signingOutRef = useRef(false)
  const signOut = async () => {
    if (signingOutRef.current) return
    signingOutRef.current = true
    // Check if this is demo mode
    if (user?.id === 'demo-user') {
      // Demo mode sign out - clear demo flag and redirect to landing
      try { localStorage.removeItem('demo-mode') } catch {}
      setUser(null)
      setSession(null)
      window.location.replace('/')
      return
    }
    
    try {
      // Sign out of Supabase if present
      if (supabase) {
        try { await supabase.auth.signOut() } catch {}
      }
      // Always clear any lingering demo flag (defense-in-depth)
      try { localStorage.removeItem('demo-mode') } catch {}
      setUser(null)
      setSession(null)
      // Use replace to avoid back-nav returning to protected pages
      window.location.replace('/')
    } catch (error) {
      console.error('Logout error:', error)
      // Force logout on client side even if server fails
      setUser(null)
      setSession(null)
      window.location.replace('/')
    }
  }

  const value = {
    user,
    session,
    loading,
    needsOnboarding,
    isDemoMode,
    signInWithGoogle,
    // Magic Link removed; we will rely on Google OAuth
    signInWithEmail: async (_email: string) => { throw new Error('Magic link disabled') },
    signOut,
    setNeedsOnboarding,
    resetClientState,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
