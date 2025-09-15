import { Link, useLocation } from 'wouter';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => location === path;

  return (
    <nav className="bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/">
              <a className="text-xl font-bold text-blue-600 dark:text-blue-400">
                Level.cre
              </a>
            </Link>
            <div className="flex space-x-4">
              <Link href="/">
                <a 
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/') 
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                  data-testid="nav-home"
                >
                  Home
                </a>
              </Link>
              <Link href="/users">
                <a 
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/users') 
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                  data-testid="nav-users"
                >
                  Users
                </a>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {user && (
              <div className="flex items-center space-x-3">
                {user.profileImageUrl && (
                  <img 
                    src={user.profileImageUrl} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                    data-testid="img-profile"
                  />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300" data-testid="text-username">
                  {user.firstName || user.email}
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/api/logout'}
                  data-testid="button-logout"
                >
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}