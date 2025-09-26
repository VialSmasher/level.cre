import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from 'wouter'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Loader2, ArrowRight, CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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

  // Optional: auto-redirect authenticated users from '/' to '/app'.
  // Disabled by default so the landing/login page is visible even if signed in.
  const AUTO_REDIRECT_AUTHENTICATED = (
    import.meta.env.VITE_AUTO_REDIRECT_AUTHENTICATED === '1' ||
    import.meta.env.VITE_AUTO_REDIRECT_AUTHENTICATED === 'true'
  )
  useEffect(() => {
    if (AUTO_REDIRECT_AUTHENTICATED && !loading && user && user.id !== 'demo-user') {
      setLocation('/app')
    }
  }, [AUTO_REDIRECT_AUTHENTICATED, loading, user, setLocation])

  const handleGoogle = async () => {
    if (!ENABLE_GOOGLE) return
    if (isSigningIn) return
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
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
    window.location.href = '/app'
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
    <div className="min-h-screen bg-white bg-[radial-gradient(circle_at_1px_1px,_rgba(0,0,0,0.04)_1px,_transparent_1px)] [background-size:24px_24px]">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left column: Branding + Login */}
          <div className="flex flex-col gap-6 lg:pt-6">
            {/* Text logo */}
            <div className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">level CRE</div>

            {/* Headline + Subheadline */}
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                Map your next opportunity and level up your broker game
              </h1>
              <p className="text-base md:text-lg text-slate-600 leading-relaxed max-w-prose">
                Visualize, track, and manage commercial real estate with powerful mapping, analytics, and pipeline tools.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3 w-full">
              {/* If already authenticated, offer a clear path into the app */}
              {!loading && user && user.id !== 'demo-user' ? (
                <>
                  <Button
                    onMouseEnter={prefetchApp}
                    onClick={() => setLocation('/app')}
                    className="group h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-auto self-start"
                    aria-label="Continue to app"
                  >
                    Continue to App
                    <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <div className="text-xs text-slate-600">Signed in as {user.email}</div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 items-center justify-center">
                    {ENABLE_GOOGLE && (
                      <Button
                        onMouseEnter={prefetchApp}
                        onClick={handleGoogle}
                        disabled={isSigningIn || isDemoMode}
                        className="group px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-auto"
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
                      className="group px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-sm disabled:opacity-50 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 w-auto"
                      aria-label="Start Demo Mode"
                      title="Demo with full features"
                    >
                      {isDemoMode ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Loading Demo...
                        </>
                      ) : (
                        <>
                          Start Demo Mode
                          <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">
                    Complete prospect mapping platform • No signup required
                  </p>
                </>
              )}
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Secure sign-in via Google
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                You can revoke access anytime
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Demo has full features
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

          {/* Right column: Feature list */}
          <div className="lg:pt-6">
            <Suspense fallback={<div className="h-40" />}> 
              <FeatureCards />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
