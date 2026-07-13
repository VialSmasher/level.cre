import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  ChartSpline,
  ChevronDown,
  ClipboardList,
  ListTodo,
  LogOut,
  Map,
  MapPinned,
  RotateCcw,
  Settings,
  Target,
  Trophy,
  User,
  type LucideIcon,
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
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: ReactNode
}

type NavItem = {
  label: string
  shortLabel?: string
  href: string
  icon: LucideIcon
  active: boolean
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const [location] = useLocation()

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
    { label: 'Pursuits', shortLabel: 'Pursuits', href: '/app/workspaces', icon: Target, active: isActive('/app/workspaces') },
    { label: 'Activity', href: '/app/inbox', icon: Activity, active: isActive('/app/inbox') },
    { label: 'Scorecard', shortLabel: 'Score', href: '/broker-stats', icon: BarChart3, active: isActive('/broker-stats') },
  ]

  const secondaryNav = [
    { label: 'Requirements', href: '/app/requirements', icon: ClipboardList },
    { label: 'Follow-ups', href: '/app/followup', icon: RotateCcw },
    { label: 'Knowledge', href: '/app/knowledge', icon: Brain },
  ]

  const profileLabel = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account'
  const isMapPage = location === '/app' || location === '/app/'

  const accountMenu = (compact = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-auto min-w-0 justify-start rounded-md p-2',
            compact
              ? 'w-10 justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              : 'w-full text-slate-300 hover:bg-white/10 hover:text-white',
          )}
          aria-label="Open account menu"
        >
          <span className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md',
            compact ? 'bg-slate-100' : 'bg-white/10',
          )}>
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className={cn('h-4 w-4', compact ? 'text-blue-600' : 'text-blue-300')} />
            )}
          </span>
          {!compact ? (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-white">{profileLabel}</span>
                <span className="block truncate text-xs text-slate-400">{user?.email}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'right'} className="w-60">
        <div className="border-b border-slate-100 px-3 py-2">
          <p className="truncate text-sm font-medium text-slate-950">{profileLabel}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
        <DropdownMenuItem asChild>
          <Link href="/track-record" className="w-full"><Trophy className="mr-2 h-4 w-4" />Track record</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/review" className="w-full"><Bot className="mr-2 h-4 w-4" />Review console</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/profile" className="w-full"><Settings className="mr-2 h-4 w-4" />Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className={cn('min-h-screen bg-[#f3f5f7] text-slate-950', isMapPage && 'flex h-dvh flex-col overflow-hidden')}>
      <aside className="fixed inset-y-0 left-0 z-[100] hidden w-56 flex-col border-r border-white/10 bg-[#0b1220] lg:flex">
        <div className="px-4 pb-3 pt-5">
          <Link href="/app/desk" className="inline-flex items-center gap-1.5 text-xl font-black text-white" aria-label="Level CRE Today">
            <span>level CRE</span>
            <ChartSpline className="h-4 w-4 text-blue-400" />
          </Link>
          <div className="mt-1 text-[11px] font-medium text-slate-400">Broker operating system</div>
        </div>

        <div className="mx-3 mt-2 flex items-center gap-2.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
            <MapPinned className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#0b1220] bg-emerald-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-200">Edmonton market</span>
            <span className="block truncate text-[11px] text-slate-400">Alberta, Canada</span>
          </span>
        </div>

        <nav className="mt-5 space-y-1 px-3" aria-label="Primary navigation">
          {primaryNav.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                  item.active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
                )}
              >
                {item.active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-blue-400" /> : null}
                <Icon className={cn('h-[18px] w-[18px]', item.active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300')} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mx-4 mt-6 border-t border-white/10 pt-4 text-[10px] font-semibold uppercase text-slate-400">
          Tools
        </div>
        <nav className="mt-2 space-y-0.5 px-3" aria-label="Supporting tools">
          {secondaryNav.map((item) => {
            const Icon = item.icon
            const active = location === item.href || location.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-md px-3 text-xs font-medium transition-colors',
                  active ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 p-3">
          {accountMenu(false)}
        </div>
      </aside>

      <div className={cn('flex min-h-screen min-w-0 flex-1 flex-col lg:pl-56', isMapPage && 'min-h-0')}>
        <header className="z-[100] flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 lg:hidden">
          <Link href="/app/desk" className="inline-flex items-center gap-1 text-lg font-black text-slate-950" aria-label="Level CRE Today">
            <span>level CRE</span>
            <ChartSpline className="h-4 w-4 text-blue-600" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 min-[390px]:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Edmonton
            </div>
            {accountMenu(true)}
          </div>
        </header>

        <main className={cn('flex min-h-0 min-w-0 flex-1 flex-col', !isMapPage && 'pb-16 lg:pb-0')}>
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[110] grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 px-1 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        {primaryNav.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold',
                item.active ? 'text-blue-700' : 'text-slate-500',
              )}
            >
              {item.active ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-blue-600" /> : null}
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.shortLabel || item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
