import { useAuth } from '@/contexts/AuthContext'
import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart3,
  Briefcase,
  Brain,
  ChartSpline,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Layers,
  LogOut,
  Mail,
  Map,
  Menu,
  RotateCcw,
  Settings,
  Table as TableIcon,
  User,
  X,
} from 'lucide-react'
import { Link, useLocation } from 'wouter'

interface AppLayoutProps {
  children: ReactNode
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

  const isPerformanceActive = location === '/broker-stats' || location === '/leaderboard' || location === '/badges'
  const profileLabel = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

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
      { label: 'Market Comps', href: '/app/market-comps', icon: TableIcon, active: isActive('/app/market-comps') },
    ],
    [
      { label: 'Performance', href: '/broker-stats', icon: BarChart3, active: isPerformanceActive },
    ],
  ]

  const mobileNavItems: NavItem[] = [
    ...navGroups.flat(),
    { label: 'Track Record', href: '/track-record', icon: FileText, active: isActive('/track-record') },
    { label: 'Review Console', href: '/app/review', icon: ClipboardCheck, active: isActive('/app/review') },
    { label: 'Settings', href: '/app/profile', icon: Settings, active: isActive('/app/profile') },
  ]

  const navLinkClass = (active: boolean) =>
    `inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-gray-800 dark:hover:text-white'
    }`

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <nav className="border-b border-border bg-card dark:bg-gray-900">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 text-lg font-semibold tracking-normal text-slate-950 dark:text-gray-100"
                aria-label="Go to map"
              >
                <span>Level CRE</span>
                <ChartSpline size={17} className="text-slate-500" />
              </Link>
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
              {navGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="flex items-center gap-1">
                  {groupIndex > 0 && <div className="mx-1 h-5 w-px bg-border" />}
                  {group.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={navLinkClass(item.active)}
                        aria-current={item.active ? 'page' : undefined}
                      >
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle mobile menu"
                >
                  {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </Button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 max-w-[260px] gap-2 rounded-md px-1.5 sm:px-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                      {user?.user_metadata?.avatar_url ? (
                        <img
                          src={user.user_metadata.avatar_url}
                          alt="Profile"
                          className="h-7 w-7 rounded-md object-cover"
                        />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <span className="hidden max-w-[170px] truncate text-sm font-medium text-slate-700 md:block">
                      {profileLabel}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {user?.user_metadata?.full_name || 'User'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
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
                      <FileText className="mr-2 h-4 w-4" />
                      Track Record
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/app/review" className="w-full">
                      <ClipboardCheck className="mr-2 h-4 w-4" />
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

        {mobileMenuOpen && (
          <div className="border-t border-border bg-card md:hidden">
            <div className="grid gap-1 px-3 py-3">
              {mobileNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      item.active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-muted hover:text-slate-950'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={item.active ? 'page' : undefined}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      <main className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>

      {(() => {
        const sha = (import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined
        if (!sha) return null
        return (
          <div
            className="fixed bottom-1 right-2 rounded-sm bg-card/80 px-2 py-0.5 text-[10px] text-muted-foreground opacity-80"
            style={{ pointerEvents: 'none' }}
          >
            build: {String(sha).slice(0, 7)}
          </div>
        )
      })()}
    </div>
  )
}
