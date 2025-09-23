import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from 'wouter'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, ArrowRight, CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Lazy-load the feature cards so the login route stays fast
const FeatureCards = lazy(() => import('@/components/FeatureCards'))

export default function Landing() {
  const { user, loading, signInWithEmail, signInWithGoogle } = useAuth()
  const [, setLocation] = useLocation()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [email, setEmail] = useState('')
  const [showEmail, setShowEmail] = useState(true)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)
  const [isSendingLink, setIsSendingLink] = useState(false)
  const { toast } = useToast()
  const hasPrefetched = useRef(false)
  const ENABLE_GOOGLE = (import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' || import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true')
  
  // Detect iframe environment (kept for potential future use)
  const emailValid = /.+@.+\..+/.test(email)

  // Prefetch app modules when CTA is visible or hovered
  const prefetchApp = () => {
    if (hasPrefetched.current) return
    hasPrefetched.current = true
    import('@/pages/home')
    import('@/components/AppLayout')
  }

  useEffect(() => {
    // Prefetch app modules shortly after landing load
    const t = setTimeout(prefetchApp, 300)
    return () => clearTimeout(t)
  }, [])

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

  const handleSendMagicLink = async () => {
    if (isSendingLink || !emailValid) return
    setIsSendingLink(true)
    try {
      await signInWithEmail(email)
      setEmailSentTo(email)
      toast({ title: 'Magic link sent', description: 'Check your email to complete sign-in.' })
    } catch (err: any) {
      console.error('Magic link error:', err)
      toast({ title: 'Failed to send magic link', description: err.message ?? 'Please try again.', variant: 'destructive' })
    } finally {
      setIsSendingLink(false)
    }
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
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Subtle animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/20 rounded-full mix-blend-multiply animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200/20 rounded-full mix-blend-multiply animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16">
          {/* Hero Section */}
          <div className="min-h-[70vh] flex flex-col justify-center text-center mb-16">
            <div className="max-w-4xl mx-auto space-y-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-blue-100/80 backdrop-blur-sm text-blue-700 px-4 py-2 rounded-full text-sm font-medium border border-blue-200/50">
                <Sparkles className="w-4 h-4" />
                Professional Real Estate Platform
              </div>

              <div className="space-y-6">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent leading-tight max-w-[24ch] mx-auto">
                  Commercial Real Estate Prospect Mapping
                </h1>
                <p className="text-lg md:text-xl text-gray-700 max-w-[55ch] mx-auto leading-relaxed font-light">
                  Visualize, track, and manage your commercial real estate opportunities with powerful mapping tools, analytics, and pipeline management.
                </p>
              </div>
              
              {/* CTAs */}
              <div className="flex flex-col gap-4 justify-center items-center max-w-sm mx-auto pt-4">
                {ENABLE_GOOGLE && (
                  <Button
                    onMouseEnter={prefetchApp}
                    onClick={handleGoogle}
                    disabled={isSigningIn || isDemoMode}
                    className="group relative w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                    aria-label="Continue with Google"
                  >
                    {isSigningIn ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 533.5 544.3" aria-hidden="true">
                          <path fill="#4285F4" d="M533.5 278.4c0-18.6-1.6-37-5-54.8H272v103.8h147.5c-6.4 34.7-26 64.1-55.4 83.8v69.6h89.4c52.4-48.2 80-119.3 80-202.4z"/>
                          <path fill="#34A853" d="M272 544.3c72.6 0 133.6-24 178.2-65.2l-89.4-69.6c-24.8 16.7-56.6 26.5-88.8 26.5-68.3 0-126.2-46.1-147-108.1h-92.2v67.9C77.6 486.8 168.3 544.3 272 544.3z"/>
                          <path fill="#FBBC05" d="M125 327.9c-10.2-30.6-10.2-64.9 0-95.6v-67.9H32.8c-43.7 86.8-43.7 188.7 0 275.5L125 327.9z"/>
                          <path fill="#EA4335" d="M272 106.1c37.8-.6 74.2 13.6 101.9 39.9l76.1-76.1C408.6 23.6 341.7-.5 272 0 168.3 0 77.6 57.5 32.8 160.5l92.2 71.8C145.8 152.3 203.7 106.1 272 106.1z"/>
                        </svg>
                        Continue with Google
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                )}
                {/* Email sign-in */}
                <div className="w-full text-center">
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex gap-2 w-full">
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && emailValid) handleSendMagicLink()
                        }}
                        className="flex-1 h-11"
                        aria-label="Email address"
                      />
                      <Button
                        onClick={handleSendMagicLink}
                        disabled={isSendingLink || !emailValid || isSigningIn}
                        className="h-11"
                      >
                        {isSendingLink ? 'Sending…' : 'Send link'}
                      </Button>
                    </div>
                    <div className="text-xs text-gray-600" aria-live="polite">
                      {emailSentTo ? (
                        <span>Magic link sent to <span className="font-medium">{emailSentTo}</span>.</span>
                      ) : (
                        <span>No password required. One-time link only.</span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Demo Mode Option */}
                <div className="text-gray-500 text-sm font-medium">or</div>
                
                <div className="w-full flex flex-col">
                  <Button 
                    onClick={handleDemoMode}
                    disabled={isSigningIn || isDemoMode}
                    className="group w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium rounded-xl focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                    aria-label="Start using the app in Demo Mode - full features available"
                  >
                    {isDemoMode ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading Demo...
                      </>
                    ) : (
                      <>
                        Start Demo Mode - Full Features
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-600 mt-2 text-center font-medium">
                    Complete prospect mapping platform • No signup required
                  </p>
                </div>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap justify-center items-center gap-6 pt-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Secure magic link • No password stored
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
              <div className="pt-3 text-xs text-gray-500 flex items-center justify-center gap-3">
                <a href="#" className="hover:text-gray-700 underline underline-offset-2">Privacy</a>
                <span>•</span>
                <a href="#" className="hover:text-gray-700 underline underline-offset-2">Terms</a>
                <span>•</span>
                <a href="mailto:support@example.com" className="hover:text-gray-700 underline underline-offset-2">Contact</a>
              </div>
            </div>
          </div>

          {/* Features Grid (lazy) */}
          <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
            <FeatureCards />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
