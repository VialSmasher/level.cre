import { Router, Route, Switch } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import HomePage from './pages/HomePage';
import UsersPage from './pages/UsersPage';
import Navigation from './components/Navigation';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/users" component={UsersPage} />
            <Route>
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">404 - Page Not Found</h1>
                <p>The page you're looking for doesn't exist.</p>
              </div>
            </Route>
          </Switch>
        </main>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;