import { Router, Route, Switch } from 'wouter';
import { Toaster } from './components/ui/toaster';
import { useAuth } from './hooks/useAuth';
import HomePage from './pages/HomePage';
import UsersPage from './pages/UsersPage';
import LandingPage from './pages/LandingPage';
import Navigation from './components/Navigation';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <Switch>
          {!isAuthenticated ? (
            <Route path="/" component={LandingPage} />
          ) : (
            <>
              <Navigation />
              <main className="container mx-auto px-4 py-8">
                <Route path="/" component={HomePage} />
                <Route path="/users" component={UsersPage} />
                <Route>
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">404 - Page Not Found</h1>
                    <p>The page you're looking for doesn't exist.</p>
                  </div>
                </Route>
              </main>
            </>
          )}
        </Switch>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;