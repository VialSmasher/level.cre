// import React from "react"; (remove if not needed)
import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
const Home = lazy(() => import("@/pages/home"));
const Knowledge = lazy(() => import("@/pages/knowledge"));
const FollowUp = lazy(() => import("@/pages/followup"));
const Stats = lazy(() => import("@/pages/stats"));
const Requirements = lazy(() => import("@/pages/requirements"));
const MarketComps = lazy(() => import("@/pages/market-comps"));
const MapToolsTestPage = lazy(() => import("@/pages/map-tools-test"));
const Profile = lazy(() => import("@/pages/profile"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const WorkspacesIndex = lazy(() => import("@/pages/workspaces"));
const Workspace = lazy(() => import("@/pages/workspace"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";

// Component to handle onboarding check and routing
function OnboardingCheck({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    // Only check for onboarding if user is authenticated and not in demo mode
    if (!loading && user && user.id !== 'demo-user' && needsOnboarding) {
      if (import.meta?.env?.DEV) console.log('[gate] OnboardingCheck -> /onboarding')
      setLocation('/onboarding')
    }
  }, [loading, user, needsOnboarding, setLocation])

  // Show loading while checking auth/profile
  if (loading) {
    if (import.meta?.env?.DEV) console.log('[gate] OnboardingCheck loading...')
    return null // Avoid flicker
  }

  return <>{children}</>
}

function Router() {
  const { user, loading } = useAuth()

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

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={() => (
        <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
          <Landing />
        </Suspense>
      )} />
      
      {/* Onboarding route - only for authenticated users */}
      <Route path="/onboarding">
        <ProtectedRoute>
          <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
            <Onboarding />
          </Suspense>
        </ProtectedRoute>
      </Route>
      
      {/* OAuth callback (PKCE) */}
      <Route path="/auth/callback" component={() => (
        <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
          <AuthCallback />
        </Suspense>
      )} />
      
      {/* Protected app routes - flat structure */}
      <Route path="/app">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Home />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/knowledge">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Knowledge />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/followup">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <FollowUp />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/stats">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Stats />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/requirements">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Requirements />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>

      <Route path="/app/workspaces">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <WorkspacesIndex />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>

      <Route path="/app/workspaces/:id">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Workspace />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>

      {/* Legacy routes -> redirect to new workspace URLs */}
      <Route path="/app/listings" component={() => { 
        const [, setLocation] = useLocation(); 
        setLocation('/app/workspaces'); 
        return null; 
      }} />
      <Route path="/app/listings/:id" component={() => { 
        const [, setLocation] = useLocation(); 
        const [, params] = useRoute('/app/listings/:id'); 
        setLocation(`/app/workspaces/${(params as any)?.id}`); 
        return null; 
      }} />

      <Route path="/app/market-comps">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <MarketComps />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>

      <Route path="/app/map-tools-test">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <MapToolsTestPage />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/profile">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
                <Profile />
              </Suspense>
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      {/* Redirect authenticated users to app for non-app routes */}
      {user && <Route path="/knowledge" component={() => { 
        const [, setLocation] = useLocation()
        setLocation('/app/knowledge')
        return null
      }} />}
      {user && <Route path="/requirements" component={() => { 
        const [, setLocation] = useLocation()
        setLocation('/app/requirements')
        return null
      }} />}
      {user && <Route path="/market-comps" component={() => { 
        const [, setLocation] = useLocation()
        setLocation('/app/market-comps')
        return null
      }} />}
      {user && <Route path="/profile" component={() => { 
        const [, setLocation] = useLocation()
        setLocation('/app/profile')
        return null
      }} />}
      
      <Route component={() => (
        <Suspense fallback={<div className="max-w-5xl mx-auto h-40" />}> 
          <NotFound />
        </Suspense>
      )} />
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
