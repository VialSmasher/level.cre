import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { 
  User, 
  Settings, 
  LogOut, 
  ChevronDown,
  Map,
  Briefcase,
  Brain,
  RotateCcw,
  BarChart3,
  Layers,
  Fingerprint,
  Menu,
  X,
  ChartSpline
} from 'lucide-react'
import { Table } from 'lucide-react'
import { Link, useLocation, useRoute } from 'wouter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isWorkspaceDetail, params] = useRoute('/app/workspaces/:id')
  const workspaceId = (params as any)?.id as string | undefined
  type Listing = { id: string; title?: string; address?: string }
  const { data: listing } = useQuery<Listing>({ queryKey: ['/api/listings', workspaceId], enabled: !!workspaceId })
  // Decide where the Workspace nav goes: last place visited in the Workspaces section
  const workspacesHref = (() => {
    try {
      const lastNew = typeof window !== 'undefined' ? localStorage.getItem('lastWorkspacesLocation') : null
      if (lastNew && lastNew.startsWith('/app/workspaces')) return lastNew
      const lastOld = typeof window !== 'undefined' ? localStorage.getItem('lastListingsLocation') : null
      if (lastOld && lastOld.startsWith('/app/listings')) return lastOld.replace('/app/listings', '/app/workspaces')
      return '/app/workspaces'
    } catch {
      return '/app/workspaces';
    }
  })()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const isActive = (path: string) => {
    if (path === '/app') {
      return location === '/app' || location === '/app/'
    }
    if (path === '/app/workspaces') {
      return location === '/app/workspaces' || location.startsWith('/app/workspaces/')
    }
    return location === path
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo + optional Breadcrumbs */}
            <div className="flex items-center min-w-0 gap-4">
              <Link
                href="/app"
                className="text-2xl font-black tracking-tight text-slate-900 dark:text-gray-100"
                aria-label="Go to dashboard"
              >
                <span className="inline-flex items-center gap-1">
                  level CRE
                  <ChartSpline size={20} className="-mt-px" />
                </span>
              </Link>
              {isWorkspaceDetail && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 truncate">
                  <Link href="/app/workspaces" className="hover:underline text-gray-800 dark:text-gray-100">
                    WS:
                  </Link>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[320px]" title={listing?.title || listing?.address || ''}>
                    {listing?.title || listing?.address || 'Workspace'}
                  </span>
                </div>
              )}
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Map"
                  >
                    <Map size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Map</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href={workspacesHref} 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/workspaces') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Workspaces"
                  >
                    <Briefcase size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Workspaces</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/knowledge" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/knowledge') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Knowledge"
                  >
                    <Brain size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Knowledge</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/followup" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/followup') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Follow Up"
                  >
                    <RotateCcw size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Follow Up</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/broker-stats" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/broker-stats') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Broker Stats"
                  >
                    <BarChart3 size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Broker Stats</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/requirements" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/requirements') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Requirements"
                  >
                    <Layers size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Requirements</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/market-comps" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/market-comps') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Market Comps"
                  >
                    <Table size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Market Comps</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/profile" 
                    className={`p-3 rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isActive('/app/profile') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 opacity-100' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 opacity-70 hover:opacity-100'
                    }`}
                    aria-label="Profile"
                  >
                    <Fingerprint size={22} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Profile</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Mobile menu button and Profile */}
            <div className="flex items-center space-x-2">
              <div className="md:hidden">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2"
                  aria-label="Toggle mobile menu"
                >
                  {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </Button>
              </div>
              
              {/* Profile Dropdown */}
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    {user?.user_metadata?.avatar_url ? (
                      <img 
                        src={user.user_metadata.avatar_url} 
                        alt="Profile" 
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <User className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  <span className="hidden md:block text-sm text-gray-700">
                    {user?.email || 'User'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.user_metadata?.full_name || 'User'}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/app/profile" className="w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 space-y-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Map"
                  >
                    <Map size={20} />
                    <span className="font-medium">Map</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Map</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href={workspacesHref} 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/workspaces') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Workspaces"
                  >
                    <Briefcase size={20} />
                    <span className="font-medium">Workspaces</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Workspaces</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/knowledge" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/knowledge') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Knowledge"
                  >
                    <Brain size={20} />
                    <span className="font-medium">Knowledge</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Knowledge</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/followup" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/followup') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Follow Up"
                  >
                    <RotateCcw size={20} />
                    <span className="font-medium">Follow Up</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Follow Up</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/broker-stats" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/broker-stats') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Broker Stats"
                  >
                    <BarChart3 size={20} />
                    <span className="font-medium">Broker Stats</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Broker Stats</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/requirements" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/requirements') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Requirements"
                  >
                    <Layers size={20} />
                    <span className="font-medium">Requirements</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Requirements</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/market-comps" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/market-comps') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Market Comps"
                  >
                    <Table size={20} />
                    <span className="font-medium">Market Comps</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Market Comps</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/profile" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/profile') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Profile"
                  >
                    <Fingerprint size={20} />
                    <span className="font-medium">Profile</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Profile</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col">
        {children}
      </main>
      {/* Build badge (non-invasive) */}
      {(() => {
        const sha = (import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined;
        if (!sha) return null;
        return (
          <div className="fixed bottom-1 right-2 text-[10px] text-gray-500 bg-white/70 dark:bg-gray-800/70 px-2 py-0.5 rounded select-none opacity-80" style={{ pointerEvents: 'none' }}>
            build: {String(sha).slice(0, 7)}
          </div>
        );
      })()}
    </div>
  )
}
