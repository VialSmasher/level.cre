import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'wouter'
import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  Flame,
  Inbox,
  ListTodo,
  Mail,
  MapPin,
  MapPinned,
  Minus,
  RefreshCw,
  Send,
  Target,
  TrendingDown,
  TrendingUp,
  UserRoundSearch,
  Wifi,
  WifiOff,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiRequest } from '@/lib/queryClient'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'

type DeskTab = 'today' | 'waiting' | 'review' | 'develop'
type ActionPriority = 'critical' | 'high' | 'medium' | 'low'
type ActionType =
  | 'follow_up_due'
  | 'stale_prospect'
  | 'listing_progress'
  | 'email_cleanup'
  | 'research_target'
  | 'outlook_signal'

type SalesBriefAction = {
  id: string
  type: ActionType
  priority: ActionPriority
  priorityScore: number
  title: string
  reason: string
  suggestedAction: string
  source: 'level_cre' | 'email_review' | 'listing' | 'outlook'
  dueAt?: string | null
  prospect?: {
    id?: string
    name?: string
    address?: string | null
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    listingTitles?: string[]
  } | null
  listing?: {
    id?: string
    title?: string
    address?: string | null
    prospectCount?: number
  } | null
  email?: {
    id?: string
    subject?: string
    sender?: string
    sentAt?: string | null
    snippet?: string
  } | null
  automationHints?: {
    stage?: 'needs_response' | 'waiting_on_reply' | 'active_work' | 'stale_work'
    participantEmails?: string[]
    propertyMentions?: string[]
    dealTerms?: string[]
    sourceUrls?: string[]
  }
}

type SalesBriefResponse = {
  generatedAt: string
  summary: {
    openActions: number
    dueFollowUps: number
    staleProspects: number
    listingProgressItems: number
    emailCleanupItems: number
    outlookSignals?: number
    researchTargets?: number
  }
  pipelineHealth?: {
    activeProspects: number
    withNextAction: number
    missingNextAction: number
    overdueNextActions: number
    stalledProspects: number
    nextActionCoveragePercent: number
  }
  actions: SalesBriefAction[]
  nextBestAction: SalesBriefAction | null
  outlook?: {
    emailsAnalyzed: number
    signals: unknown[]
    watchTerms: string[]
  }
  integrations?: {
    salesActivityAgentConfigured: boolean
  }
}

type HeaderStats = {
  totalLevel: number
  assetsTracked: number
  followupsLogged: number
  streakDays: number
}

type ActivityPulseResponse = {
  generatedAt: string
  days: number
  total: number
  activeDays: number
  streakDays: number
  automated: number
  manual: number
  currentPeriodTotal: number
  previousPeriodTotal: number
  trendPercent: number
  series: Array<{
    date: string
    label: string
    email: number
    call: number
    meeting: number
    other: number
    total: number
  }>
}

type SalesActivityImportRow = {
  id: string
  source: string
  run_id: string | null
  external_activity_id: string
  activity_status: string
  activity_type: string
  contact_name: string | null
  company: string | null
  email: string | null
  subject: string | null
  activity_at: string | null
  prospect_id: string | null
  match_status: string
  match_reason: string | null
  confidence: number
  interaction_id: string | null
  created_at: string
}

type Prospect = {
  id: string
  name: string
  status: string
  address?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactCompany?: string | null
  businessName?: string | null
}

type OutlookConfig = {
  configured: boolean
  connected: boolean
  reason?: string
  connection?: {
    emailAddress: string | null
    status: string
    lastSyncedAt: string | null
    errorMessage: string | null
  } | null
}

type InboundConfig = {
  configured: boolean
  domainConfigured: boolean
  intakeAddress: string | null
}

const priorityClasses: Record<ActionPriority, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-amber-500',
  medium: 'border-l-blue-500',
  low: 'border-l-slate-300',
}

const priorityLabels: Record<ActionPriority, string> = {
  critical: 'Critical',
  high: 'High priority',
  medium: 'This week',
  low: 'Develop',
}

const actionIcons: Record<ActionType, typeof ListTodo> = {
  follow_up_due: Clock3,
  stale_prospect: RefreshCw,
  listing_progress: BriefcaseBusiness,
  email_cleanup: Inbox,
  research_target: UserRoundSearch,
  outlook_signal: Mail,
}

const activityChartConfig = {
  email: { label: 'Email', color: '#2563eb' },
  call: { label: 'Call', color: '#059669' },
  meeting: { label: 'Meeting', color: '#ea580c' },
  other: { label: 'Other', color: '#a855f7' },
} as const

function formatWhen(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function prospectLabel(prospect: Prospect) {
  return prospect.contactCompany || prospect.businessName || prospect.name || 'Untitled prospect'
}

function actionHref(action: SalesBriefAction) {
  if (action.prospect?.id) return `/app?prospectId=${encodeURIComponent(action.prospect.id)}`
  if (action.listing?.id) return `/app/workspaces/${encodeURIComponent(action.listing.id)}`
  if (action.type === 'email_cleanup' || action.type === 'outlook_signal') return '/app/inbox'
  return null
}

function sourceLabel(action: SalesBriefAction) {
  if (action.source === 'outlook') return 'Outlook'
  if (action.source === 'email_review') return 'Inbox capture'
  if (action.source === 'listing') return 'Listing'
  return 'Level CRE'
}

function ActionRow({ action, featured = false }: { action: SalesBriefAction; featured?: boolean }) {
  const Icon = actionIcons[action.type]
  const href = actionHref(action)
  const context = action.prospect?.address || action.listing?.address || action.email?.sender || null

  return (
    <article
      className={cn(
        'border-b border-slate-200 border-l-4 bg-white px-4 py-4 last:border-b-0 sm:px-5',
        priorityClasses[action.priority],
        featured && 'bg-blue-50/50',
      )}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 sm:flex">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded text-[11px] font-semibold text-slate-600">
              {priorityLabels[action.priority]}
            </Badge>
            <span className="text-xs text-slate-500">{sourceLabel(action)}</span>
            {action.dueAt ? <span className="text-xs text-slate-500">{formatWhen(action.dueAt)}</span> : null}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-950 sm:text-[15px]">{action.title}</h3>
          {context ? <p className="mt-1 truncate text-xs text-slate-500">{context}</p> : null}
          <p className="mt-2 text-sm leading-5 text-slate-600">{action.reason}</p>
          <p className="mt-2 text-sm font-medium leading-5 text-slate-900">{action.suggestedAction}</p>
          {action.automationHints?.propertyMentions?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {action.automationHints.propertyMentions.slice(0, 3).map((mention) => (
                <Badge key={mention} variant="secondary" className="rounded text-[11px] font-medium">
                  {mention}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {href ? (
          <Button asChild variant={featured ? 'default' : 'outline'} size="sm" className="col-start-2 w-fit shrink-0">
            <Link href={href}>
              Open
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  )
}

function EmptyQueue({ tab }: { tab: DeskTab }) {
  const copy: Record<DeskTab, { title: string; body: string }> = {
    today: {
      title: 'No urgent work is queued',
      body: 'When Level CRE sees an overdue follow-up, live listing action, or strong Outlook signal, it will appear here.',
    },
    waiting: {
      title: 'Nothing is waiting on a reply',
      body: 'Sent Outlook threads that have gone quiet will collect here so they do not disappear into the inbox.',
    },
    review: {
      title: 'The review queue is clear',
      body: 'Ambiguous Codex and inbox activity will pause here until it can be safely linked or archived.',
    },
    develop: {
      title: 'No development work is queued',
      body: 'Stale prospects and records missing reachable contacts will appear here when the active work is under control.',
    },
  }
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      <h3 className="mt-3 text-base font-semibold text-slate-950">{copy[tab].title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{copy[tab].body}</p>
    </div>
  )
}

function ActivityMomentum({ data, maxDailyActivity }: { data: ActivityPulseResponse; maxDailyActivity: number }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="28-day sales momentum">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">28-day momentum</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {data.total} logged touch{data.total === 1 ? '' : 'es'} across {data.activeDays} active day{data.activeDays === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-500">{data.automated} captured automatically</span>
          <span className={cn(
            'inline-flex items-center gap-1 font-semibold',
            data.trendPercent > 0 && 'text-emerald-700',
            data.trendPercent < 0 && 'text-red-700',
            data.trendPercent === 0 && 'text-slate-500',
          )}>
            {data.trendPercent > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : null}
            {data.trendPercent < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
            {data.trendPercent === 0 ? <Minus className="h-3.5 w-3.5" /> : null}
            {data.trendPercent > 0 ? '+' : ''}{data.trendPercent}% vs prior 14 days
          </span>
        </div>
      </div>
      <div className="px-2 pb-3 pt-4 sm:px-4">
        <div className="relative h-[104px] border-b border-slate-200" role="img" aria-label="Stacked daily activity for the last 28 days">
          <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
            {data.series.map((day) => (
              <div key={day.date} className="flex h-full min-w-0 flex-1 items-end" title={`${day.label}: ${day.total} touch${day.total === 1 ? '' : 'es'}`}>
                <div
                  className={cn('flex w-full flex-col-reverse overflow-hidden rounded-t-sm', day.total === 0 && 'bg-slate-100')}
                  style={{ height: day.total === 0 ? 2 : `${Math.max(8, (day.total / maxDailyActivity) * 100)}%` }}
                >
                  {(Object.keys(activityChartConfig) as Array<keyof typeof activityChartConfig>).map((key) => {
                    const count = day[key]
                    if (!count) return null
                    return <span key={key} style={{ backgroundColor: activityChartConfig[key].color, flexGrow: count }} />
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex justify-between px-0.5 text-[10px] text-slate-400">
          <span>{data.series[0]?.label}</span>
          <span>{data.series[13]?.label}</span>
          <span>{data.series.at(-1)?.label}</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {Object.entries(activityChartConfig).map(([key, item]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function DailyDeskPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { isDemoMode } = useAuth()
  const [activeTab, setActiveTab] = useState<DeskTab>('today')
  const [prospectDrafts, setProspectDrafts] = useState<Record<string, string>>({})

  const salesBriefQuery = useQuery<SalesBriefResponse>({
    queryKey: ['/api/automation/sales-brief?limit=25'],
    enabled: !isDemoMode || import.meta.env.DEV,
  })
  const importsQuery = useQuery<{ rows: SalesActivityImportRow[] }>({
    queryKey: ['/api/agent/sales-activity/imports?matchStatus=needs_review&limit=50'],
    enabled: !isDemoMode || import.meta.env.DEV,
  })
  const prospectsQuery = useQuery<Prospect[]>({ queryKey: ['/api/prospects'], enabled: !isDemoMode || import.meta.env.DEV })
  const outlookQuery = useQuery<OutlookConfig>({ queryKey: ['/api/email/outlook/config'], enabled: !isDemoMode || import.meta.env.DEV })
  const inboundQuery = useQuery<InboundConfig>({ queryKey: ['/api/email/inbound/config'], enabled: !isDemoMode || import.meta.env.DEV })
  const statsQuery = useQuery<HeaderStats>({ queryKey: ['/api/stats/header'], enabled: !isDemoMode || import.meta.env.DEV })
  const activityPulseQuery = useQuery<ActivityPulseResponse>({
    queryKey: ['/api/automation/activity-pulse', 28],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/automation/activity-pulse?days=28')
      return response.json()
    },
    enabled: !isDemoMode || import.meta.env.DEV,
    staleTime: 60_000,
    refetchOnMount: 'always',
  })

  const actions = salesBriefQuery.data?.actions || []
  const imports = importsQuery.data?.rows || []
  const prospects = useMemo(
    () => [...(prospectsQuery.data || [])].sort((left, right) => prospectLabel(left).localeCompare(prospectLabel(right))),
    [prospectsQuery.data],
  )

  const queues = useMemo(() => {
    const waiting = actions.filter(
      (action) => action.type === 'outlook_signal' && action.automationHints?.stage === 'waiting_on_reply',
    )
    const waitingIds = new Set(waiting.map((action) => action.id))
    const today = actions.filter(
      (action) =>
        (action.priority === 'critical' || action.priority === 'high')
        && !waitingIds.has(action.id)
        && action.type !== 'email_cleanup'
        && action.type !== 'research_target',
    )
    const review = actions.filter((action) => action.type === 'email_cleanup')
    const usedIds = new Set([...today, ...waiting, ...review].map((action) => action.id))
    const develop = actions.filter(
      (action) => !usedIds.has(action.id) || action.type === 'research_target' || action.type === 'stale_prospect',
    )
    return { today, waiting, review, develop }
  }, [actions])

  const reviewMutation = useMutation({
    mutationFn: async ({ importId, action, prospectId }: { importId: string; action: 'link' | 'ignore'; prospectId?: string }) => {
      const response = await apiRequest('PATCH', `/api/agent/sales-activity/imports/${importId}`, {
        action,
        ...(action === 'link' ? { prospectId } : {}),
      })
      return response.json()
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/agent/sales-activity/imports?matchStatus=needs_review&limit=50'] })
      queryClient.invalidateQueries({ queryKey: ['/api/automation/sales-brief?limit=25'] })
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] })
      toast({
        title: variables.action === 'link' ? 'Activity linked' : 'Activity archived',
        description: variables.action === 'link'
          ? 'The sent email is now part of the prospect activity history.'
          : 'The activity will no longer compete for attention.',
      })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update activity', description: error.message, variant: 'destructive' })
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/automation/sales-brief?limit=25'] })
    queryClient.invalidateQueries({ queryKey: ['/api/agent/sales-activity/imports?matchStatus=needs_review&limit=50'] })
    queryClient.invalidateQueries({ queryKey: ['/api/email/outlook/config'] })
    queryClient.invalidateQueries({ queryKey: ['/api/email/inbound/config'] })
    queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] })
    queryClient.invalidateQueries({ queryKey: ['/api/automation/activity-pulse'] })
  }

  const tabCounts: Record<DeskTab, number> = {
    today: queues.today.length,
    waiting: queues.waiting.length,
    review: queues.review.length + imports.length,
    develop: queues.develop.length,
  }
  const isLoading = salesBriefQuery.isLoading || importsQuery.isLoading
  const hasError = salesBriefQuery.isError || importsQuery.isError
  const generatedAt = formatWhen(salesBriefQuery.data?.generatedAt)
  const pulseMetrics = [
    { label: 'Follow-ups this week', value: statsQuery.data?.followupsLogged ?? 0, icon: Send, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Active-day streak', value: `${activityPulseQuery.data?.streakDays ?? statsQuery.data?.streakDays ?? 0}d`, icon: Flame, tone: 'text-orange-700 bg-orange-50' },
    { label: 'Mapped prospects', value: statsQuery.data?.assetsTracked ?? 0, icon: MapPinned, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Needs review', value: tabCounts.review, icon: Inbox, tone: 'text-fuchsia-700 bg-fuchsia-50' },
  ]
  const maxDailyActivity = Math.max(1, ...(activityPulseQuery.data?.series.map((day) => day.total) || [1]))

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          label="Daily desk"
          title="Today"
          description="Your ranked action queue from Level CRE and recent email activity."
          icon={ListTodo}
          actions={(
            <>
            {generatedAt ? <span className="hidden text-xs text-slate-500 sm:inline">Updated {generatedAt}</span> : null}
            <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link href="/app">
                <MapPin className="h-4 w-4" />
                Map
              </Link>
            </Button>
            </>
          )}
        />

        <section className="mt-5 grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white lg:grid-cols-4" aria-label="Business development pulse">
          {pulseMetrics.map((metric, index) => {
            const MetricIcon = metric.icon
            return (
              <div
                key={metric.label}
                className={cn(
                  'flex min-h-20 items-center gap-3 border-slate-200 px-4',
                  index < 2 && 'border-b lg:border-b-0',
                  index % 2 === 0 && 'border-r',
                  index < 3 && 'lg:border-r',
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', metric.tone)}>
                  <MetricIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xl font-bold text-slate-950">{metric.value}</p>
                  <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                </div>
              </div>
            )
          })}
        </section>

        <nav className="mt-5 grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-4" aria-label="Daily desk queues">
          {([
            ['today', 'Do now'],
            ['waiting', 'Waiting'],
            ['review', 'Review'],
            ['develop', 'Develop'],
          ] as Array<[DeskTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={cn(
                'flex min-h-14 items-center justify-between border-b border-r border-slate-200 px-4 text-left text-sm font-semibold transition-colors even:border-r-0 [&:nth-child(n+3)]:border-b-0 sm:border-b-0 sm:border-r sm:even:border-r sm:last:border-r-0',
                activeTab === id ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {label}
              <span className={cn('text-lg', activeTab === id ? 'text-white' : 'text-slate-950')}>{tabCounts[id]}</span>
            </button>
          ))}
        </nav>

        {hasError ? (
          <div role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The Daily Desk could not load all of its sources. Refresh once; if it persists, check Outlook and API health in Settings.
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-live="polite">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  {activeTab === 'today' && 'Revenue-moving actions'}
                  {activeTab === 'waiting' && 'Sent work waiting on others'}
                  {activeTab === 'review' && 'Activity needing context'}
                  {activeTab === 'develop' && 'Pipeline development'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeTab === 'review' ? 'Nothing is written to a prospect until you link it.' : 'Ranked from current Level CRE and Outlook evidence.'}
                </p>
              </div>
              <Badge variant="outline" className="rounded bg-slate-50 text-slate-700">
                {tabCounts[activeTab]} item{tabCounts[activeTab] === 1 ? '' : 's'}
              </Badge>
            </div>

            {isLoading ? (
              <div className="space-y-0">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="border-b border-slate-200 px-5 py-5 last:border-b-0">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : null}

            {!isLoading && activeTab !== 'review' && queues[activeTab].length === 0 ? <EmptyQueue tab={activeTab} /> : null}

            {!isLoading && activeTab !== 'review'
              ? queues[activeTab].map((action, index) => (
                  <ActionRow key={action.id} action={action} featured={activeTab === 'today' && index === 0} />
                ))
              : null}

            {!isLoading && activeTab === 'review' ? (
              <div>
                {imports.map((item) => {
                  const selectedProspect = prospectDrafts[item.id] || ''
                  return (
                    <article key={item.id} className="border-b border-slate-200 px-4 py-4 sm:px-5">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded border-blue-200 bg-blue-50 text-blue-800">Codex sent</Badge>
                            <span className="text-xs text-slate-500">{formatWhen(item.activity_at || item.created_at)}</span>
                          </div>
                          <h3 className="mt-2 truncate text-sm font-semibold text-slate-950">{item.subject || '(No subject)'}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {[item.contact_name, item.company, item.email].filter(Boolean).join(' / ') || 'No contact context supplied'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">{item.match_reason || 'No confident prospect match.'}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                          <Select
                            value={selectedProspect}
                            onValueChange={(value) => setProspectDrafts((current) => ({ ...current, [item.id]: value }))}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Link to prospect or company" />
                            </SelectTrigger>
                            <SelectContent>
                              {prospects.slice(0, 300).map((prospect) => (
                                <SelectItem key={prospect.id} value={prospect.id}>
                                  {prospectLabel(prospect)}{prospect.address ? ` / ${prospect.address}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!selectedProspect || reviewMutation.isPending}
                              onClick={() => reviewMutation.mutate({ importId: item.id, action: 'link', prospectId: selectedProspect })}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Link activity
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              title="Archive this activity"
                              aria-label="Archive this activity"
                              disabled={reviewMutation.isPending}
                              onClick={() => reviewMutation.mutate({ importId: item.id, action: 'ignore' })}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
                {queues.review.map((action) => <ActionRow key={action.id} action={action} />)}
                {imports.length === 0 && queues.review.length === 0 ? <EmptyQueue tab="review" /> : null}
              </div>
            ) : null}
          </section>

          <aside className="space-y-5">
            <section className="rounded-md border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-blue-700">
                <Target className="h-4 w-4" />
                Best next move
              </div>
              {salesBriefQuery.data?.nextBestAction ? (
                <div className="mt-3">
                  <h2 className="text-base font-semibold leading-6 text-slate-950">{salesBriefQuery.data.nextBestAction.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{salesBriefQuery.data.nextBestAction.suggestedAction}</p>
                  {actionHref(salesBriefQuery.data.nextBestAction) ? (
                    <Button asChild className="mt-4 w-full" size="sm">
                      <Link href={actionHref(salesBriefQuery.data.nextBestAction)!}>
                        Work this now
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm leading-6 text-slate-600">No ranked action yet. Add prospects or connect activity sources to build the queue.</p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/app"><MapPin className="h-4 w-4" />Open map</Link>
                  </Button>
                </div>
              )}
            </section>

            <section className="rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-950">Activity sources</h2>
                <p className="mt-1 text-xs text-slate-500">The evidence feeding this desk.</p>
              </div>
              <div className="divide-y divide-slate-200">
                <div className="flex items-start gap-3 px-5 py-4">
                  {outlookQuery.data?.connected ? <Wifi className="mt-0.5 h-4 w-4 text-emerald-600" /> : <WifiOff className="mt-0.5 h-4 w-4 text-amber-600" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950">Outlook</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {outlookQuery.data?.connected
                        ? `Connected${outlookQuery.data.connection?.lastSyncedAt ? ` / synced ${formatWhen(outlookQuery.data.connection.lastSyncedAt)}` : ''}`
                        : 'Needs connection or re-authentication'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-5 py-4">
                  {inboundQuery.data?.configured && inboundQuery.data?.domainConfigured
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    : <WifiOff className="mt-0.5 h-4 w-4 text-amber-600" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950">Postmark BCC</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {inboundQuery.data?.configured && inboundQuery.data?.domainConfigured ? 'Inbound capture configured' : 'Inbound capture needs setup'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-5 py-4">
                  {importsQuery.isError || !salesBriefQuery.data?.integrations?.salesActivityAgentConfigured
                    ? <WifiOff className="mt-0.5 h-4 w-4 text-amber-600" />
                    : <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950">Codex activity bridge</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {importsQuery.isError
                        ? 'Bridge could not be reached'
                        : salesBriefQuery.data?.integrations?.salesActivityAgentConfigured
                          ? `API ready / ${imports.length} item${imports.length === 1 ? '' : 's'} waiting for review`
                          : 'Recorder key not configured / BCC and local outbox remain active'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/app/inbox">
                    <Inbox className="h-4 w-4" />
                    Open activity inbox
                  </Link>
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-950">Pipeline health</h2>
              </div>
              <div className="mt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{salesBriefQuery.data?.pipelineHealth?.nextActionCoveragePercent ?? 0}%</p>
                    <p className="mt-0.5 text-xs text-slate-500">Active pipeline with a next action</p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {salesBriefQuery.data?.pipelineHealth?.withNextAction ?? 0}/{salesBriefQuery.data?.pipelineHealth?.activeProspects ?? 0}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-sm bg-slate-100" aria-hidden="true">
                  <div
                    className="h-full bg-emerald-500 transition-[width]"
                    style={{ width: `${salesBriefQuery.data?.pipelineHealth?.nextActionCoveragePercent ?? 0}%` }}
                  />
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center">
                <div><dt className="text-[11px] leading-4 text-slate-500">Missing action</dt><dd className="mt-1 text-base font-semibold text-slate-950">{salesBriefQuery.data?.pipelineHealth?.missingNextAction ?? 0}</dd></div>
                <div><dt className="text-[11px] leading-4 text-slate-500">Overdue</dt><dd className="mt-1 text-base font-semibold text-red-700">{salesBriefQuery.data?.pipelineHealth?.overdueNextActions ?? 0}</dd></div>
                <div><dt className="text-[11px] leading-4 text-slate-500">Stalled 21d</dt><dd className="mt-1 text-base font-semibold text-amber-700">{salesBriefQuery.data?.pipelineHealth?.stalledProspects ?? 0}</dd></div>
              </dl>
            </section>
          </aside>
        </div>

        {activityPulseQuery.data ? (
          <ActivityMomentum data={activityPulseQuery.data} maxDailyActivity={maxDailyActivity} />
        ) : null}
      </div>
    </div>
  )
}
