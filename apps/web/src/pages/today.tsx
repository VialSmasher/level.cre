import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock3,
  Mail,
  Map,
  Phone,
  Play,
  RotateCcw,
  Square,
  Target,
  UserRound,
  Wrench,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { nsKey, readJSON, writeJSON } from '@/lib/storage'
import { logBrokerActivity, type BrokerActivityType } from '@/lib/brokerActions'
import { getProspectDisplayName } from '@/lib/prospectDisplay'
import type { Prospect, SkillActivityRow } from '@level-cre/shared/schema'

type ListingRow = {
  id: string
  title?: string | null
  prospectCount?: number | null
}

type HeaderStats = {
  totalLevel: number
  assetsTracked: number
  followupsLogged: number
  streakDays: number
}

type SessionMode = 'call_block' | 'follow_up' | 'data_cleanup'

type ProspectingSession = {
  id: string
  mode: SessionMode
  durationMinutes: number
  startedAt: string
}

const EDMONTON_TZ = 'America/Edmonton'

const CALL_ACTIONS = new Set(['phone_call', 'call'])
const EMAIL_ACTIONS = new Set(['email_sent', 'email'])
const MEETING_ACTIONS = new Set(['meeting_held', 'meeting'])
const FOLLOW_UP_ACTIONS = new Set([
  'phone_call',
  'call',
  'email_sent',
  'email',
  'meeting_held',
  'meeting',
  'followup_logged',
  'interaction',
])
const DATA_ACTIONS = new Set([
  'add_prospect',
  'status_change',
  'add_requirement',
  'add_market_comp',
  'market_comp',
  'requirement',
])

const SESSION_MODES: Record<SessionMode, { label: string; description: string; href: string }> = {
  call_block: {
    label: 'Call block',
    description: 'Work the highest-value call queue and log outcomes as you go.',
    href: '/app/followup',
  },
  follow_up: {
    label: 'Follow-up block',
    description: 'Clear overdue touches and book the next step.',
    href: '/app/followup',
  },
  data_cleanup: {
    label: 'Data cleanup',
    description: 'Find missing websites, phones, and useful contacts before the next call.',
    href: '/app/review',
  },
}

function localDateKey(value: Date, timeZone = EDMONTON_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function isToday(value?: string | Date | null) {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  return localDateKey(date) === localDateKey(new Date())
}

function isDue(value?: string | Date | null) {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return date <= endOfToday
}

function daysSince(value?: string | Date | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function hasUsefulContact(prospect: Prospect) {
  return Boolean(
    prospect.contactName ||
      prospect.contactCompany ||
      prospect.contactEmail ||
      prospect.contactPhone,
  )
}

function hasBusinessPhone(prospect: Prospect) {
  return Boolean(prospect.contactPhone?.trim())
}

function hasWebsite(prospect: Prospect) {
  return Boolean(prospect.websiteUrl?.trim())
}

function missingFields(prospect: Prospect) {
  const fields: string[] = []
  if (!hasWebsite(prospect)) fields.push('website')
  if (!hasBusinessPhone(prospect)) fields.push('phone')
  if (!hasUsefulContact(prospect)) fields.push('contact')
  return fields
}

function scoreProspect(prospect: Prospect) {
  let score = 0
  if (isDue(prospect.followUpDueDate)) score += 45
  if (!hasUsefulContact(prospect)) score += 35
  if (!hasBusinessPhone(prospect)) score += 25
  if (!hasWebsite(prospect)) score += 20
  if (daysSince(prospect.lastContactDate) > 45) score += 15
  if (prospect.status === 'prospect') score += 10
  if (prospect.status === 'no_go') score -= 100
  return score
}

function actionFromActivity(activity: SkillActivityRow) {
  return String((activity as any).action || '').toLowerCase()
}

function activityDate(activity: SkillActivityRow) {
  return new Date((activity as any).timestamp || (activity as any).date || (activity as any).createdAt || Date.now())
}

function TargetMeter({
  label,
  value,
  goal,
  detail,
  tone,
}: {
  label: string
  value: number
  goal: number
  detail: string
  tone: string
}) {
  const progress = Math.min(100, Math.round((value / goal) * 100))
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums text-slate-950">{value}</p>
          <p className="text-xs font-medium text-slate-500">of {goal}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function FieldState({ label, present }: { label: string; present: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        present
          ? 'rounded-md border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'rounded-md border-amber-200 bg-amber-50 text-amber-700'
      }
    >
      {present ? 'Has' : 'Needs'} {label}
    </Badge>
  )
}

export default function TodayPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const storageKey = nsKey(user?.id, 'levelcre:todaySession')
  const [selectedMode, setSelectedMode] = useState<SessionMode>('call_block')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [session, setSession] = useState<ProspectingSession | null>(() =>
    typeof window === 'undefined' ? null : readJSON<ProspectingSession | null>(storageKey, null),
  )
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSession(readJSON<ProspectingSession | null>(storageKey, null))
  }, [storageKey])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
  })

  const { data: listings = [] } = useQuery<ListingRow[]>({
    queryKey: ['/api/listings'],
  })

  const { data: activities = [] } = useQuery<SkillActivityRow[]>({
    queryKey: ['/api/skill-activities', 'today-page'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/skill-activities?limit=1000')
      return response.json()
    },
  })

  const { data: header } = useQuery<HeaderStats>({
    queryKey: ['/api/stats/header', 'me'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/stats/header?userId=me')
      if (!response.ok) throw new Error('Failed to load scorecard header')
      return response.json()
    },
    staleTime: 30_000,
  })

  const safeProspects = Array.isArray(prospects) ? prospects : []
  const safeListings = Array.isArray(listings) ? listings : []
  const safeActivities = Array.isArray(activities) ? activities : []

  const todayActivities = useMemo(
    () => safeActivities.filter((activity) => isToday(activityDate(activity))),
    [safeActivities],
  )

  const todayStats = useMemo(() => {
    let calls = 0
    let emails = 0
    let meetings = 0
    let touches = 0
    let dataUpdates = 0
    let xp = 0

    for (const activity of todayActivities) {
      const action = actionFromActivity(activity)
      xp += Number((activity as any).xpGained || 0) || 0
      if (CALL_ACTIONS.has(action)) calls += 1
      if (EMAIL_ACTIONS.has(action)) emails += 1
      if (MEETING_ACTIONS.has(action)) meetings += 1
      if (FOLLOW_UP_ACTIONS.has(action)) touches += 1
      if (DATA_ACTIONS.has(action)) dataUpdates += 1
    }

    return { calls, emails, meetings, touches, dataUpdates, xp }
  }, [todayActivities])

  const dueProspects = safeProspects.filter((prospect) => isDue(prospect.followUpDueDate))
  const enrichmentProspects = safeProspects.filter((prospect) => missingFields(prospect).length > 0 && prospect.status !== 'no_go')
  const staleProspects = safeProspects.filter((prospect) => daysSince(prospect.lastContactDate) > 45 && prospect.status !== 'no_go')

  const workQueue = useMemo(() => {
    return [...safeProspects]
      .filter((prospect) => prospect.status !== 'no_go')
      .sort((left, right) => scoreProspect(right) - scoreProspect(left))
      .slice(0, 6)
  }, [safeProspects])

  const activeSession = session
  const elapsedMinutes = activeSession
    ? Math.max(0, Math.floor((now - new Date(activeSession.startedAt).getTime()) / 60_000))
    : 0
  const sessionProgress = activeSession
    ? Math.min(100, Math.round((elapsedMinutes / activeSession.durationMinutes) * 100))
    : 0
  const sessionMode = activeSession ? SESSION_MODES[activeSession.mode] : SESSION_MODES[selectedMode]

  const logMutation = useMutation({
    mutationFn: ({ prospect, type }: { prospect: Prospect; type: BrokerActivityType }) =>
      logBrokerActivity({
        prospect,
        type,
        notes: `Today quick log: ${type}`,
      }),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/skill-activities', 'today-page'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/stats/header', 'me'] }),
      ])
      toast({
        title: 'Activity logged',
        description: `${variables.type === 'note' ? 'Note' : variables.type} saved for ${getProspectDisplayName(variables.prospect)}.`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Could not log activity',
        description: error instanceof Error ? error.message : 'Try again from the prospect record.',
        variant: 'destructive',
      })
    },
  })

  const startSession = () => {
    const nextSession: ProspectingSession = {
      id: crypto.randomUUID(),
      mode: selectedMode,
      durationMinutes: Number(durationMinutes) || 30,
      startedAt: new Date().toISOString(),
    }
    setSession(nextSession)
    writeJSON(storageKey, nextSession)
  }

  const endSession = () => {
    const previous = session
    setSession(null)
    writeJSON(storageKey, null)
    toast({
      title: 'Session ended',
      description: previous
        ? `${SESSION_MODES[previous.mode].label} closed after ${formatElapsed(elapsedMinutes)}.`
        : 'Session closed.',
    })
  }

  const targetSentence = (() => {
    if (todayStats.calls < 10) return `${10 - todayStats.calls} call${10 - todayStats.calls === 1 ? '' : 's'} to today's call target`
    if (todayStats.touches < 8) return `${8 - todayStats.touches} touch${8 - todayStats.touches === 1 ? '' : 'es'} to today's activity target`
    if (todayStats.dataUpdates < 3) return `${3 - todayStats.dataUpdates} useful data update${3 - todayStats.dataUpdates === 1 ? '' : 's'} to round out the day`
    return 'Daily targets are covered. Push the streak or bank the win.'
  })()

  return (
    <div className="min-h-0 flex-1 bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Today
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  Business development, not CRM maintenance.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Start a focused block, work the best queue, and let the scorecard reflect the useful activity.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/app/map">
                    <Map className="mr-2 h-4 w-4" />
                    Open map
                  </Link>
                </Button>
                <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
                  <Link href="/app/challenges">
                    <Target className="mr-2 h-4 w-4" />
                    Challenges
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <TargetMeter
                label="Call attempts"
                value={todayStats.calls}
                goal={10}
                detail="Keep the outbound motion visible."
                tone="bg-blue-600"
              />
              <TargetMeter
                label="Activity touches"
                value={todayStats.touches}
                goal={8}
                detail="Calls, emails, meetings, and follow-ups."
                tone="bg-emerald-600"
              />
              <TargetMeter
                label="Useful data"
                value={todayStats.dataUpdates}
                goal={3}
                detail="Prospects, requirements, status, or market context."
                tone="bg-amber-500"
              />
            </div>
          </div>

          <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4 text-blue-600" />
                BD block
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeSession ? (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{sessionMode.label}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{sessionMode.description}</p>
                      </div>
                      <Badge variant="outline" className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700">
                        Active
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-semibold tabular-nums text-slate-950">{formatElapsed(elapsedMinutes)}</p>
                        <p className="text-xs font-medium text-slate-500">of {activeSession.durationMinutes} min planned</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-600">{sessionProgress}%</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-slate-950" style={{ width: `${sessionProgress}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button asChild variant="outline">
                      <Link href={sessionMode.href}>
                        Work queue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={endSession}>
                      <Square className="mr-2 h-4 w-4" />
                      End block
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Focus</p>
                      <Select value={selectedMode} onValueChange={(value) => setSelectedMode(value as SessionMode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call_block">Call block</SelectItem>
                          <SelectItem value="follow_up">Follow-up block</SelectItem>
                          <SelectItem value="data_cleanup">Data cleanup</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Length</p>
                      <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="45">45 minutes</SelectItem>
                          <SelectItem value="60">60 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                    {SESSION_MODES[selectedMode].description}
                  </div>
                  <Button className="w-full bg-slate-950 text-white hover:bg-slate-800" onClick={startSession}>
                    <Play className="mr-2 h-4 w-4" />
                    Start block
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Next useful work</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{targetSentence}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/followup">
                  Full queue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {workQueue.length ? (
                workQueue.map((prospect) => {
                  const fields = missingFields(prospect)
                  const lastTouch = Number.isFinite(daysSince(prospect.lastContactDate))
                    ? `${daysSince(prospect.lastContactDate)}d since touch`
                    : 'No touch logged'
                  return (
                    <div key={prospect.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950">{getProspectDisplayName(prospect)}</p>
                            {isDue(prospect.followUpDueDate) ? (
                              <Badge variant="outline" className="rounded-md border-rose-200 bg-rose-50 text-rose-700">
                                Due
                              </Badge>
                            ) : null}
                            {fields.length ? (
                              <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-amber-700">
                                Needs {fields.join(', ')}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <FieldState label="website" present={hasWebsite(prospect)} />
                            <FieldState label="phone" present={hasBusinessPhone(prospect)} />
                            <FieldState label="contact" present={hasUsefulContact(prospect)} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{lastTouch}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={logMutation.isPending}
                            onClick={() => logMutation.mutate({ prospect, type: 'call' })}
                          >
                            <Phone className="mr-2 h-3.5 w-3.5" />
                            Call
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={logMutation.isPending}
                            onClick={() => logMutation.mutate({ prospect, type: 'email' })}
                          >
                            <Mail className="mr-2 h-3.5 w-3.5" />
                            Email
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={logMutation.isPending}
                            onClick={() => logMutation.mutate({ prospect, type: 'note' })}
                          >
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                            Note
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
                  <p className="font-semibold text-slate-950">No prospect queue yet</p>
                  <p className="mt-1 text-sm text-slate-500">Add prospects on the map to start building a daily work queue.</p>
                  <Button asChild className="mt-4 bg-slate-950 text-white hover:bg-slate-800">
                    <Link href="/app/map">Open map</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  Scorecard pulse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">Level</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{header?.totalLevel ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">Streak</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{header?.streakDays ?? 0}d</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">Today XP</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{todayStats.xp}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">Assets</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{header?.assetsTracked ?? safeProspects.length}</p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/broker-stats">
                    Open Scorecard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pressure points</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <RotateCcw className="mt-0.5 h-4 w-4 text-rose-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{dueProspects.length} due follow-ups</p>
                    <p className="text-xs leading-5 text-slate-500">Clear these first when you want the lowest-friction win.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <Wrench className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{enrichmentProspects.length} enrichment candidates</p>
                    <p className="text-xs leading-5 text-slate-500">Missing website, phone, or likely contact.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <UserRound className="mt-0.5 h-4 w-4 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{staleProspects.length} stale records</p>
                    <p className="text-xs leading-5 text-slate-500">Good candidates for a rescue challenge.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <Briefcase className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{safeListings.length} workspaces</p>
                    <p className="text-xs leading-5 text-slate-500">Use one as the container for a focused block.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
