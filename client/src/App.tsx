import React from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Home from "@/pages/home";
import Knowledge from "@/pages/knowledge";
import FollowUp from "@/pages/followup";
import Stats from "@/pages/stats";
import Requirements from "@/pages/requirements";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Onboarding from "@/pages/onboarding";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useLocation } from "wouter";

// Component to handle onboarding check and routing
function OnboardingCheck({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    // Only check for onboarding if user is authenticated and not in demo mode
    if (!loading && user && user.id !== 'demo-user' && needsOnboarding) {
      setLocation('/onboarding')
    }
  }, [loading, user, needsOnboarding, setLocation])

  // Show loading while checking auth/profile
  if (loading) {
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
      <Route path="/" component={Landing} />
      
      {/* Onboarding route - only for authenticated users */}
      <Route path="/onboarding">
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      </Route>
      
      {/* Protected app routes - flat structure */}
      <Route path="/app">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Home />
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/knowledge">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Knowledge />
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/followup">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <FollowUp />
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/stats">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Stats />
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/requirements">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Requirements />
            </AppLayout>
          </OnboardingCheck>
        </ProtectedRoute>
      </Route>
      
      <Route path="/app/profile">
        <ProtectedRoute>
          <OnboardingCheck>
            <AppLayout>
              <Profile />
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
      {user && <Route path="/profile" component={() => { 
        const [, setLocation] = useLocation()
        setLocation('/app/profile')
        return null
      }} />}
      
      <Route component={NotFound} />
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
