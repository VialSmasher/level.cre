import { useState, type ComponentType } from 'react'
import { Link, useLocation } from 'wouter'
import {
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  ChartSpline,
  ChevronDown,
  Layers,
  ListTodo,
  LogOut,
  Mail,
  Map,
  Menu,
  RotateCcw,
  Settings,
  Table,
  Trophy,
  User,
  X,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface AppLayoutProps {
  children: React.ReactNode
}

type NavItem = {
  label: string
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  active: boolean
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const [location] = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const isActive = (path: string) => {
    if (path === '/app') return location === '/app' || location === '/app/'
    if (path === '/app/workspaces') return location === path || location.startsWith(`${path}/`)
    if (path === '/broker-stats') return location === path || location === '/leaderboard' || location === '/badges'
    return location === path
  }

  const primaryNav: NavItem[] = [
    { label: 'Today', href: '/app/desk', icon: ListTodo, active: isActive('/app/desk') },
    { label: 'Map', href: '/app', icon: Map, active: isActive('/app') },
    { label: 'Deals', href: '/app/workspaces', icon: Briefcase, active: isActive('/app/workspaces') },
    { label: 'Inbox', href: '/app/inbox', icon: Mail, active: isActive('/app/inbox') },
    { label: 'Scorecard', href: '/broker-stats', icon: BarChart3, active: isActive('/broker-stats') },
  ]
  const profileLabel = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-gray-900">
      <nav className="sticky top-0 z-[100] border-b border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <Link
              href="/app/desk"
              className="text-xl font-black text-slate-950 dark:text-gray-100"
              aria-label="Go to Today"
            >
              <span className="inline-flex items-center gap-1">
                level CRE
                <ChartSpline size={18} className="-mt-px text-blue-600" />
              </span>
            </Link>

            <div className="hidden h-14 items-stretch md:flex">
              {primaryNav.map((item) => {
                const Icon = item.icon
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={`inline-flex min-w-[84px] items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                          item.active
                            ? 'border-blue-600 bg-blue-50/60 text-slate-950 dark:border-blue-400 dark:bg-blue-950/30 dark:text-white'
                            : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                        }`}
                        aria-label={item.label}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent><p>{item.label}</p></TooltipContent>
                  </Tooltip>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="md:hidden"
                aria-label="Toggle navigation"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex max-w-[260px] items-center gap-1 rounded-md px-1.5 sm:gap-2 sm:px-2">
                    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                      {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="Profile" className="h-8 w-8 object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-blue-600" />
                      )}
                    </span>
                    <span className="hidden max-w-[170px] truncate text-sm font-medium text-gray-700 md:block">{profileLabel}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{user?.user_metadata?.full_name || 'User'}</p>
                    <p className="truncate text-sm text-gray-500">{user?.email}</p>
                  </div>
                  <DropdownMenuItem asChild><Link href="/app/followup" className="w-full"><RotateCcw className="mr-2 h-4 w-4" />Follow-up list</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/app/requirements" className="w-full"><Layers className="mr-2 h-4 w-4" />Requirements</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/app/market-comps" className="w-full"><Table className="mr-2 h-4 w-4" />Market comps</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/app/knowledge" className="w-full"><Brain className="mr-2 h-4 w-4" />Knowledge</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link href="/launcher" className="w-full"><Briefcase className="mr-2 h-4 w-4" />Broker tools</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/track-record" className="w-full"><Trophy className="mr-2 h-4 w-4" />Track record</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/app/review" className="w-full"><Bot className="mr-2 h-4 w-4" />Review console</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/app/profile" className="w-full"><Settings className="mr-2 h-4 w-4" />Settings</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-gray-200 bg-white px-4 py-3 md:hidden dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-2 gap-1">
              {primaryNav.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${
                      item.active
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
              <Link
                href="/launcher"
                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Briefcase size={20} />
                <span>Broker tools</span>
              </Link>
            </div>
          </div>
        ) : null}
      </nav>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
