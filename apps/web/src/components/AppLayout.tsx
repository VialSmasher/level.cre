import { useAuth } from '@/contexts/AuthContext'
import type { ComponentType } from 'react'
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
  ChartSpline,
  Bot,
  Trophy,
  Mail
} from 'lucide-react'
import { Table } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useState } from 'react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const workspacesHref = '/app/workspaces'

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

  const isScorecardActive = location === '/broker-stats' || location === '/leaderboard'
  const profileLabel = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  type NavItem = {
    label: string
    href: string
    icon: ComponentType<{ size?: number; className?: string }>
    active?: boolean
  }

  const navGroups: NavItem[][] = [
    [
      { label: 'Map', href: '/app', icon: Map, active: isActive('/app') },
      { label: 'Workspaces', href: workspacesHref, icon: Briefcase, active: isActive('/app/workspaces') },
      { label: 'Follow-ups', href: '/app/followup', icon: RotateCcw, active: isActive('/app/followup') },
      { label: 'Inbox', href: '/app/inbox', icon: Mail, active: isActive('/app/inbox') },
    ],
    [
      { label: 'Knowledge', href: '/app/knowledge', icon: Brain, active: isActive('/app/knowledge') },
      { label: 'Requirements', href: '/app/requirements', icon: Layers, active: isActive('/app/requirements') },
      { label: 'Market Comps', href: '/app/market-comps', icon: Table, active: isActive('/app/market-comps') },
    ],
    [
      { label: 'Scorecard', href: '/broker-stats', icon: BarChart3, active: isScorecardActive },
    ],
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
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
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 p-1 shadow-inner dark:border-gray-700 dark:bg-gray-900/40">
              {navGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="flex items-center gap-1">
                  {groupIndex > 0 && <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-gray-700" />}
                  {group.map((item) => {
                    const Icon = item.icon
                    const active = !!item.active
                    return (
                      <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              active
                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900'
                                : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                            }`}
                            aria-label={item.label}
                          >
                            <Icon size={20} />
                            {active && <span>{item.label}</span>}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{item.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              ))}
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
                <Button variant="ghost" className="flex max-w-[260px] items-center space-x-2 rounded-full px-2">
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
                  <span className="hidden max-w-[170px] truncate text-sm font-medium text-gray-700 md:block">
                    {profileLabel}
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
                  <Link href="/launcher" className="w-full">
                    <Layers className="mr-2 h-4 w-4" />
                    Broker tools
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/track-record" className="w-full">
                    <Trophy className="mr-2 h-4 w-4" />
                    Track Record
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/review" className="w-full">
                    <Bot className="mr-2 h-4 w-4" />
                    Review Console
                  </Link>
                </DropdownMenuItem>
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
                    href="/app/inbox"
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/inbox')
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Inbox"
                  >
                    <Mail size={20} />
                    <span className="font-medium">Inbox</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Inbox</p>
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
                    href="/app/review" 
                    className={`flex items-center space-x-3 p-3 rounded-md transition-all duration-200 ${
                      isActive('/app/review') 
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Review Console"
                  >
                    <Bot size={20} />
                    <span className="font-medium">Review Console</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Review Console</p>
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
