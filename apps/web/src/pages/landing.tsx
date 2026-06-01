import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { getOAuthCallbackPath } from '@/lib/authUtils'
import { supabase } from '@/lib/supabase'
import { useLocation } from 'wouter'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Loader2, ArrowRight, CheckCircle, ChartSpline, CreditCard } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  clearStoredPostAuthRedirect,
  getStoredPostAuthRedirect,
  isToolAPostAuthRedirect,
  setStoredPostAuthRedirect,
} from '@/lib/postAuthRedirect'

// Lazy-load the feature cards so the login route stays fast
const FeatureCards = lazy(() => import('../components/FeatureCards'))

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth()
  const [, setLocation] = useLocation()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const { toast } = useToast()
  const hasPrefetched = useRef(false)
  const ENABLE_GOOGLE = (import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true')

  const redirectAuthenticatedUser = () => {
    const nextPath = getStoredPostAuthRedirect() || '/launcher'
    clearStoredPostAuthRedirect()
    setLocation(nextPath)
  }

  // Prefetch app modules when CTA is visible or hovered
  const prefetchApp = () => {
    if (hasPrefetched.current) return
    hasPrefetched.current = true
    import('./home')
    import('../components/AppLayout')
  }

  useEffect(() => {
    // Prefetch app modules shortly after landing load
    const t = setTimeout(prefetchApp, 300)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || loading || user) return

    const oauthCallbackPath = getOAuthCallbackPath({ includeHashTokens: false })
    if (!oauthCallbackPath) return

    if (import.meta?.env?.DEV) console.log('[auth] Landing forwarding OAuth code ->', oauthCallbackPath)
    window.location.replace(oauthCallbackPath)
  }, [loading, user])

  useEffect(() => {
    if (typeof window === 'undefined' || loading || user || !supabase) return

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (!accessToken || !refreshToken) return

    let cancelled = false

    async function restoreImplicitSession() {
      setIsSigningIn(true)
      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) throw error
        if (cancelled) return
        window.location.replace('/')
      } catch (err: any) {
        console.error('Implicit OAuth session restore failed:', err)
        if (cancelled) return

        const params = new URLSearchParams({ error: 'oauth_callback_failed' })
        if (err?.message) {
          params.set('error_description', err.message)
        }
        const nextLocation = `/?${params.toString()}`
        window.location.replace(nextLocation)
      } finally {
        if (!cancelled) {
          setIsSigningIn(false)
        }
      }
    }

    restoreImplicitSession()
    return () => { cancelled = true }
  }, [loading, user])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const authError = url.searchParams.get('error')
    if (!authError) return

    if (user && user.id !== 'demo-user') {
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      const cleanedUrl = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState(window.history.state, '', cleanedUrl)
      redirectAuthenticatedUser()
      return
    }

    const authErrorDescription = url.searchParams.get('error_description')
    const fallbackDescription =
      authError === 'auth_not_configured'
        ? 'Supabase auth is not configured for this environment.'
        : authError === 'missing_auth_code'
          ? 'Google returned to the app without an authorization code.'
          : 'Please try Google sign-in again.'

    toast({
      title: 'Google sign-in failed',
      description: authErrorDescription || fallbackDescription,
      variant: 'destructive',
    })

    url.searchParams.delete('error')
    url.searchParams.delete('error_description')
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState(window.history.state, '', cleanedUrl)
  }, [toast, user, setLocation])

  useEffect(() => {
    if (!loading && user && user.id !== 'demo-user') {
      redirectAuthenticatedUser()
    }
  }, [loading, user, setLocation])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (loading || !user || user.id === 'demo-user') return
    const hash = window.location.hash || ''
    const returnedFromImplicitOAuth =
      hash.includes('access_token=') || hash.includes('refresh_token=')
    if (!returnedFromImplicitOAuth) return

    const nextPath = getStoredPostAuthRedirect() || '/launcher'
    clearStoredPostAuthRedirect()
    window.history.replaceState({}, '', nextPath)
    setLocation(nextPath)
  }, [loading, user, setLocation])

  const handleGoogle = async () => {
    if (!ENABLE_GOOGLE) return
    if (isSigningIn) return
    setIsSigningIn(true)
    try {
      await signInWithGoogle(getStoredPostAuthRedirect() || '/launcher')
    } catch (err: any) {
      console.error('Google sign-in error:', err)
      toast({ title: 'Sign-in unavailable', description: err?.message || 'Please try again later', variant: 'destructive' })
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleDemoMode = () => {
    if (isDemoMode) return // Prevent double-clicks
    setIsDemoMode(true)
    // Set demo flag and reload page to ensure proper initialization
    localStorage.setItem('demo-mode', 'true')
    const nextPath = getStoredPostAuthRedirect()
    const demoRedirect = isToolAPostAuthRedirect(nextPath) ? nextPath! : '/app'
    setStoredPostAuthRedirect(demoRedirect)
    window.location.href = demoRedirect
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f9fc] bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] [background-size:32px_32px]">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-14">
        <div className="grid min-h-[calc(100vh-7rem)] grid-cols-1 lg:grid-cols-[0.78fr_1.22fr] gap-10 lg:gap-16 items-center">
          {/* Left column: Branding + Login */}
          <div className="flex flex-col gap-6">
            {/* Text logo */}
            <div className="text-3xl md:text-4xl font-black tracking-tight text-slate-950">
              <span className="inline-flex items-center gap-1">
                level CRE
                <ChartSpline className="-mt-px" size={22} />
              </span>
            </div>

            {/* Headline + Subheadline */}
            <div className="space-y-3">
              <div className="inline-flex rounded-md border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 shadow-sm">
                Built for CRE brokers
              </div>
              <h1 className="max-w-xl text-5xl font-semibold leading-[0.95] tracking-tight text-slate-950 md:text-6xl">
                Map faster.
                <br />
                Track cleaner.
                <br />
                Win more.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600 md:text-lg">
                Turn property coverage into client-ready surveys, live pipeline, and broker follow-up in one mapped workspace.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3 w-full">
              {/* If already authenticated, offer a clear path into the app */}
              {!loading && user && user.id !== 'demo-user' ? (
                <>
                  <Button
                    onMouseEnter={prefetchApp}
                    onClick={() => setLocation('/launcher')}
                    className="group h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-auto self-start"
                    aria-label="Continue to broker tools"
                  >
                    Continue to broker tools
                    <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <div className="text-xs text-slate-600">Signed in as {user.email}</div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 items-center">
                    {ENABLE_GOOGLE && (
                      <Button
                        onMouseEnter={prefetchApp}
                        onClick={handleGoogle}
                        disabled={isSigningIn || isDemoMode}
                        className="group h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-full sm:w-auto"
                        aria-label="Continue with Google"
                      >
                        {isSigningIn ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3 mr-2" viewBox="0 0 533.5 544.3" aria-hidden="true">
                              <path fill="#4285F4" d="M533.5 278.4c0-18.6-1.6-37-5-54.8H272v103.8h147.5c-6.4 34.7-26 64.1-55.4 83.8v69.6h89.4c52.4-48.2 80-119.3 80-202.4z"/>
                              <path fill="#34A853" d="M272 544.3c72.6 0 133.6-24 178.2-65.2l-89.4-69.6c-24.8 16.7-56.6 26.5-88.8 26.5-68.3 0-126.2-46.1-147-108.1h-92.2v67.9C77.6 486.8 168.3 544.3 272 544.3z"/>
                              <path fill="#FBBC05" d="M125 327.9c-10.2-30.6-10.2-64.9 0-95.6v-67.9H32.8c-43.7 86.8-43.7 188.7 0 275.5L125 327.9z"/>
                              <path fill="#EA4335" d="M272 106.1c37.8-.6 74.2 13.6 101.9 39.9l76.1-76.1C408.6 23.6 341.7-.5 272 0 168.3 0 77.6 57.5 32.8 160.5l92.2 71.8C145.8 152.3 203.7 106.1 272 106.1z"/>
                            </svg>
                            Continue with Google
                            <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </Button>
                    )}
                    <Button 
                      onMouseEnter={prefetchApp}
                      onClick={handleDemoMode}
                      disabled={isSigningIn || isDemoMode}
                      variant="outline"
                      className="group h-11 px-5 border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-950 text-sm font-medium rounded-md disabled:opacity-50 focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 w-full sm:w-auto"
                      aria-label="Try Level CRE Demo"
                      title="Open the Level CRE demo"
                    >
                      {isDemoMode ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Loading Demo...
                        </>
                      ) : (
                        <>
                          Explore demo
                          <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 max-w-xl">
                    Explore the sandbox now. Upgrade when you are ready to save live data, share surveys, or add team seats.
                    <button
                      type="button"
                      onClick={() => setLocation('/pricing')}
                      className="ml-2 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                      View paid plans
                    </button>
                  </p>
                </>
              )}
            </div>

            {/* Trust indicators */}
            <div className="grid gap-3 border-y border-slate-200 py-4 text-sm text-slate-600 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Client survey workflow
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Requirements and follow-ups
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Live map coverage
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-500" />
                Paid workspace upgrade
              </div>
            </div>

            {/* Footer links */}
            <div className="pt-2 text-xs text-slate-500 flex items-center gap-3">
              <a href="/privacy" className="hover:text-slate-700 underline underline-offset-2">Privacy</a>
              <span>•</span>
              <a href="/terms" className="hover:text-slate-700 underline underline-offset-2">Terms</a>
              <span>•</span>
              <a href="mailto:support@example.com" className="hover:text-slate-700 underline underline-offset-2">Contact</a>
            </div>
          </div>

          {/* Right column: Product preview */}
          <div>
            <Suspense fallback={<div className="h-40" />}> 
              <FeatureCards />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
