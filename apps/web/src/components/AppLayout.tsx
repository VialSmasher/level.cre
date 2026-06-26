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
  ChartSpline,
  Bot,
  Activity,
  Target,
  type LucideIcon
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

  const isScorecardActive = location === '/broker-stats' || location === '/leaderboard' || location === '/badges'
  const profileLabel = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  type NavItem = {
    label: string
    href: string
    icon: LucideIcon
    active?: boolean
  }

  const primaryNavItems: NavItem[] = [
    { label: 'Map', href: '/app', icon: Map, active: isActive('/app') },
    { label: 'Follow-ups', href: '/app/followup', icon: RotateCcw, active: isActive('/app/followup') },
    { label: 'Knowledge', href: '/app/knowledge', icon: Brain, active: isActive('/app/knowledge') },
    { label: 'Challenges', href: '/app/challenges', icon: Target, active: isActive('/app/challenges') },
    { label: 'Scorecard', href: '/broker-stats', icon: BarChart3, active: isScorecardActive },
  ]

  const secondaryNavItems: NavItem[] = [
    { label: 'Activity Capture', href: '/app/inbox', icon: Activity, active: isActive('/app/inbox') },
    { label: 'Workspaces', href: workspacesHref, icon: Briefcase, active: isActive('/app/workspaces') },
    { label: 'Requirements', href: '/app/requirements', icon: Layers, active: isActive('/app/requirements') },
    { label: 'Market Comps', href: '/app/market-comps', icon: Table, active: isActive('/app/market-comps') },
    { label: 'Review Console', href: '/app/review', icon: Bot, active: isActive('/app/review') },
    { label: 'Profile', href: '/app/profile', icon: Fingerprint, active: isActive('/app/profile') },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between sm:h-16">
            {/* Logo */}
            <div className="flex items-center min-w-0 gap-4">
              <Link
                href="/app"
                className="text-xl font-black tracking-tight text-slate-900 dark:text-gray-100 sm:text-2xl"
                aria-label="Go to dashboard"
              >
                <span className="inline-flex items-center gap-1">
                  level CRE
                  <ChartSpline size={18} className="-mt-px sm:h-5 sm:w-5" />
                </span>
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
              {primaryNavItems.map((item) => {
                const Icon = item.icon
                const active = !!item.active
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          active
                            ? 'bg-slate-950 text-white shadow-sm dark:bg-blue-950/70 dark:text-blue-100'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                        }`}
                        aria-label={item.label}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{item.label}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
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
                <Button variant="ghost" className="flex max-w-[260px] items-center space-x-1 rounded-full px-1.5 sm:space-x-2 sm:px-2">
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
                  <Link href="/app/inbox" className="w-full">
                    <Activity className="mr-2 h-4 w-4" />
                    Activity Capture
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={workspacesHref} className="w-full">
                    <Briefcase className="mr-2 h-4 w-4" />
                    Workspaces
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/requirements" className="w-full">
                    <Layers className="mr-2 h-4 w-4" />
                    Requirements
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/market-comps" className="w-full">
                    <Table className="mr-2 h-4 w-4" />
                    Market Comps
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
              {[...primaryNavItems, ...secondaryNavItems].map((item) => {
                const Icon = item.icon
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={`flex items-center space-x-3 rounded-md p-3 transition-colors ${
                          item.active
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label={item.label}
                      >
                        <Icon size={20} />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{item.label}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
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
