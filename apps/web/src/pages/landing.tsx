import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, ChartSpline, Loader2, MapPinned, Target } from 'lucide-react'
import { useLocation } from 'wouter'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { getOAuthCallbackPath } from '@/lib/authUtils'
import edmontonIndustrialAerial from '@/assets/edmonton-industrial-aerial.png'
import {
  clearStoredPostAuthRedirect,
  getStoredPostAuthRedirect,
  isToolAPostAuthRedirect,
  setStoredPostAuthRedirect,
} from '@/lib/postAuthRedirect'
import { supabase } from '@/lib/supabase'

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth()
  const [, setLocation] = useLocation()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const { toast } = useToast()
  const hasPrefetched = useRef(false)
  const enableGoogle = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'

  const redirectAuthenticatedUser = () => {
    const nextPath = getStoredPostAuthRedirect() || '/app/desk'
    clearStoredPostAuthRedirect()
    setLocation(nextPath)
  }

  const prefetchApp = () => {
    if (hasPrefetched.current) return
    hasPrefetched.current = true
    import('./home')
    import('../components/AppLayout')
  }

  useEffect(() => {
    const timer = window.setTimeout(prefetchApp, 300)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || loading || user) return
    const oauthCallbackPath = getOAuthCallbackPath({ includeHashTokens: false })
    if (oauthCallbackPath) window.location.replace(oauthCallbackPath)
  }, [loading, user])

  useEffect(() => {
    const authClient = supabase
    if (typeof window === 'undefined' || loading || user || !authClient) return
    const auth = authClient.auth

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (!accessToken || !refreshToken) return
    const sessionTokens = { access_token: accessToken, refresh_token: refreshToken }

    let cancelled = false
    async function restoreImplicitSession() {
      setIsSigningIn(true)
      try {
        const { error } = await auth.setSession(sessionTokens)
        if (error) throw error
        if (!cancelled) window.location.replace('/')
      } catch (error: any) {
        if (cancelled) return
        const params = new URLSearchParams({ error: 'oauth_callback_failed' })
        if (error?.message) params.set('error_description', error.message)
        window.location.replace(`/?${params.toString()}`)
      } finally {
        if (!cancelled) setIsSigningIn(false)
      }
    }

    void restoreImplicitSession()
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
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
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
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [toast, user, setLocation])

  useEffect(() => {
    if (!loading && user && user.id !== 'demo-user') redirectAuthenticatedUser()
  }, [loading, user, setLocation])

  useEffect(() => {
    if (typeof window === 'undefined' || loading || !user || user.id === 'demo-user') return
    const hash = window.location.hash || ''
    if (!hash.includes('access_token=') && !hash.includes('refresh_token=')) return

    const nextPath = getStoredPostAuthRedirect() || '/app/desk'
    clearStoredPostAuthRedirect()
    window.history.replaceState({}, '', nextPath)
    setLocation(nextPath)
  }, [loading, user, setLocation])

  const handleGoogle = async () => {
    if (!enableGoogle || isSigningIn) return
    setIsSigningIn(true)
    try {
      await signInWithGoogle(getStoredPostAuthRedirect() || '/app/desk')
    } catch (error: any) {
      toast({
        title: 'Sign-in unavailable',
        description: error?.message || 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleDemoMode = () => {
    if (isDemoMode) return
    setIsDemoMode(true)
    localStorage.setItem('demo-mode', 'true')
    const nextPath = getStoredPostAuthRedirect()
    const demoRedirect = isToolAPostAuthRedirect(nextPath) ? nextPath! : '/app'
    setStoredPostAuthRedirect(demoRedirect)
    window.location.href = demoRedirect
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] text-white">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xl font-black">
            level CRE
            <ChartSpline className="h-4 w-4 text-blue-400" />
          </span>
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <section className="relative min-h-[82svh] overflow-hidden bg-[#0b1220] text-white">
        <img
          src={edmontonIndustrialAerial}
          alt="Aerial view of Edmonton's west and northwest industrial market"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55"
        />
        <div className="absolute inset-0 bg-[#07101f]/75" />

        <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <a href="/" className="inline-flex items-center gap-1.5 text-xl font-black text-white" aria-label="Level CRE home">
            <span>level CRE</span>
            <ChartSpline className="h-4 w-4 text-blue-400" />
          </a>
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <span className="hidden items-center gap-2 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Edmonton, Alberta
            </span>
            <a href="/privacy" className="hover:text-white">Privacy</a>
          </div>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(82svh-76px)] w-full max-w-7xl flex-col justify-end px-5 pb-12 sm:px-8 sm:pb-16 lg:px-10">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase text-blue-300">Map-first business development</p>
            <h1 className="text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-7xl">level CRE</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
              Your visual market memory and daily business-development control center.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              See the companies, properties, conversations, pursuits, and next moves that make up your market without rebuilding the context every morning.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              {user && user.id !== 'demo-user' ? (
                <Button
                  onMouseEnter={prefetchApp}
                  onClick={() => setLocation('/app/desk')}
                  className="h-11 w-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 sm:w-auto"
                >
                  Open today
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  {enableGoogle ? (
                    <Button
                      onMouseEnter={prefetchApp}
                      onClick={handleGoogle}
                      disabled={isSigningIn || isDemoMode}
                      className="h-11 w-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 sm:w-auto"
                    >
                      {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isSigningIn ? 'Signing in...' : 'Continue with Google'}
                      {!isSigningIn ? <ArrowRight className="h-4 w-4" /> : null}
                    </Button>
                  ) : null}
                  <Button
                    onMouseEnter={prefetchApp}
                    onClick={handleDemoMode}
                    disabled={isSigningIn || isDemoMode}
                    variant="outline"
                    className="h-11 w-full border-white/25 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 hover:text-white sm:w-auto"
                  >
                    {isDemoMode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isDemoMode ? 'Opening demo...' : 'Explore the demo'}
                  </Button>
                </>
              )}
            </div>
            {user && user.id !== 'demo-user' ? <p className="mt-3 text-xs text-slate-400">Signed in as {user.email}</p> : null}
          </div>

          <div className="mt-10 grid max-w-3xl grid-cols-1 gap-3 border-t border-white/15 pt-5 text-sm text-slate-300 sm:grid-cols-3 sm:gap-6">
            <span className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-blue-300" />Visual market memory</span>
            <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-300" />Automatic activity capture</span>
            <span className="flex items-center gap-2"><Target className="h-4 w-4 text-amber-300" />Ranked revenue actions</span>
          </div>
        </div>

        <div className="absolute bottom-2 right-3 z-10 text-[9px] text-white/45">Imagery: Esri World Imagery</div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">One broker workspace</p>
            <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight text-slate-950">Work the day. Remember the market.</h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
              Level CRE keeps the map, activity evidence, pursuits, and scorecard together while Codex helps research, draft, and decide what to do next.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="border-l-2 border-blue-500 pl-4">
              <MapPinned className="h-5 w-5 text-blue-700" />
              <h3 className="mt-3 text-sm font-semibold text-slate-950">Map</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Properties, companies, requirements, and relationship history in place.</p>
            </div>
            <div className="border-l-2 border-emerald-500 pl-4">
              <Activity className="h-5 w-5 text-emerald-700" />
              <h3 className="mt-3 text-sm font-semibold text-slate-950">Today</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">A short queue built from current activity, follow-ups, and live pursuits.</p>
            </div>
            <div className="border-l-2 border-amber-500 pl-4">
              <Target className="h-5 w-5 text-amber-700" />
              <h3 className="mt-3 text-sm font-semibold text-slate-950">Scorecard</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Effort, momentum, pipeline health, and production without duplicate entry.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#0b1220] px-5 py-5 text-xs text-slate-500 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <span>level CRE</span>
          <span className="flex gap-4">
            <a href="/privacy" className="hover:text-slate-300">Privacy</a>
            <a href="/terms" className="hover:text-slate-300">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
