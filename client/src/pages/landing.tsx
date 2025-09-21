import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation } from 'wouter'
import { useEffect, useState } from 'react'
import { MapPin, BarChart3, Users, Loader2, Sparkles, ArrowRight, CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Landing() {
  const { user, loading, signInWithGoogle, signInWithEmail } = useAuth()
  const [, setLocation] = useLocation()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [popupUrl, setPopupUrl] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [isSendingLink, setIsSendingLink] = useState(false)
  const { toast } = useToast()
  
  // Detect iframe environment
  const inIframe = typeof window !== 'undefined' && window.self !== window.top

  const handleSignIn = async () => {
    if (isSigningIn) return // Prevent double-clicks
    
    setIsSigningIn(true)
    setPopupUrl(null) // Clear any previous popup URL
    
    // Clear demo mode when starting Google flow
    localStorage.removeItem('demo-mode')
    
    try {
      await signInWithGoogle()
    } catch (error: any) {
      console.error('Error signing in:', error)
      
      // Check if this is a popup blocked error with OAuth URL
      if (error.message === 'Popup blocked' && error.oauthUrl) {
        setPopupUrl(error.oauthUrl)
        toast({
          title: "Popup blocked",
          description: "Please click the link below to continue with Google sign-in.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Sign-in failed. Please try again.",
          variant: "destructive",
        })
      }
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
    if (isSendingLink || !email) return
    setIsSendingLink(true)
    try {
      await signInWithEmail(email)
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
                <Button 
                  onClick={handleSignIn}
                  disabled={isSigningIn || isDemoMode}
                  className="group relative w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  aria-label="Sign in with Google"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in with Google
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                {/* Magic Link (Email) */}
                <div className="w-full space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 h-12"
                    />
                    <Button
                      onClick={handleSendMagicLink}
                      disabled={isSendingLink || !email || isSigningIn}
                      className="h-12"
                    >
                      {isSendingLink ? 'Sending…' : 'Send link'}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600 text-center">Or sign in with a one-time email link.</p>
                </div>
                
                {/* OAuth fallback for Replit iframe restrictions */}
                {popupUrl && (
                  <div className="w-full space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-800 font-medium">
                      Due to Replit's iframe environment, please click below to complete Google sign-in:
                    </p>
                    <a 
                      href={popupUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 w-full justify-center"
                    >
                      Complete Google Sign-in in New Tab
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                )}
                
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
                  Secure Authentication
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Real-time Sync
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Professional Tools
                </div>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div 
              className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1"
              tabIndex={0}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-blue-700 transition-colors">Interactive Mapping</h2>
                <p className="text-gray-600 leading-relaxed">
                  Draw properties as points or polygons on Google Maps with real-time editing.
                </p>
              </div>
            </div>
            
            <div 
              className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1"
              tabIndex={0}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-green-700 transition-colors">Analytics Dashboard</h2>
                <p className="text-gray-600 leading-relaxed">
                  Track coverage, activity, and freshness by submarket.
                </p>
              </div>
            </div>
            
            <div 
              className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1 md:col-span-2 lg:col-span-1"
              tabIndex={0}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-violet-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-purple-700 transition-colors">Pipeline Management</h2>
                <p className="text-gray-600 leading-relaxed">
                  Move prospects from first call to client with clear statuses and follow-ups.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
