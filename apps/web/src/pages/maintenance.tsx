import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, DatabaseZap, History, RefreshCcw, ShieldCheck, Trophy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

type DuplicatePair = {
  canonicalProspectId: string
  duplicateProspectId: string
  canonicalLabel: string
  duplicateLabel: string
  eligible: boolean
  signals: string[]
  blockers: string[]
}

type DuplicatePlan = {
  planHash: string
  generatedAt: string
  summary: {
    candidateGroups: number
    safeGroups: number
    heldGroups: number
    safePairs: number
  }
  groups: Array<{
    groupId: string
    disposition: 'safe_to_merge' | 'leave_separate'
    pairs: DuplicatePair[]
  }>
}

type MemoryPlan = {
  planHash: string
  generatedAt: string
  summary: {
    pendingItems: number
    backgroundApprovals: number
    heldExceptions: number
    linkedProspects: number
    standaloneMapMemory: number
  }
  items: Array<{
    itemId: string
    address: string
    disposition: 'approve_in_background' | 'hold_as_exception'
    blockers: string[]
  }>
}

type PursuitHistoryPlan = {
  planHash: string
  generatedAt: string
  summary: {
    exactLinks: number
    pursuitsAffected: number
    evidenceRecords: number
  }
  items: Array<{
    listingId: string
    listingTitle: string
    prospectId: string
    prospectLabel: string
    sourceKinds: string[]
    evidenceCount: number
    lastActivityAt: string | null
  }>
}

type LeaderboardAudit = {
  data: Array<{
    user_id: string
    user_email: string
    display_name: string
    xp_total: number
    identity_count?: number
  }>
}

function Metric({ label, value, tone = 'text-slate-950' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function StatusMessage({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error instanceof Error ? error.message : 'Maintenance request failed.'}</span>
    </div>
  )
}

export default function MaintenancePage() {
  const duplicatePlan = useQuery<DuplicatePlan>({
    queryKey: ['/api/prospects/duplicate-merges/maintenance-plan?limit=50'],
    staleTime: 0,
  })
  const memoryPlan = useQuery<MemoryPlan>({
    queryKey: ['/api/intel/brokerage-memory/maintenance/plan?limit=250'],
    staleTime: 0,
  })
  const pursuitHistoryPlan = useQuery<PursuitHistoryPlan>({
    queryKey: ['/api/pursuits/history-backfill/plan?limit=250'],
    staleTime: 0,
  })
  const leaderboardAudit = useQuery<LeaderboardAudit>({
    queryKey: ['/api/leaderboard'],
    staleTime: 0,
  })

  const refreshPlans = async () => {
    await Promise.all([duplicatePlan.refetch(), memoryPlan.refetch(), pursuitHistoryPlan.refetch(), leaderboardAudit.refetch()])
  }

  const isRefreshing = duplicatePlan.isFetching || memoryPlan.isFetching || pursuitHistoryPlan.isFetching || leaderboardAudit.isFetching
  const duplicateSafePairs = duplicatePlan.data?.summary.safePairs || 0
  const memoryReady = memoryPlan.data?.summary.backgroundApprovals || 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        label="Operations"
        title="Background maintenance"
        description="A hidden, plan-first console for consolidating safe legacy duplicates and absorbing map-ready property memory without creating broker chores."
        icon={DatabaseZap}
        actions={(
          <Button variant="outline" onClick={() => refreshPlans()} disabled={isRefreshing}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh plans
          </Button>
        )}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" />Legacy duplicate plan</CardTitle>
                <CardDescription className="mt-1">Requires corroborated place and identity. Distinct companies and contacts stay separate.</CardDescription>
              </div>
              {duplicatePlan.data ? <span className="text-xs text-slate-500">{new Date(duplicatePlan.data.generatedAt).toLocaleTimeString()}</span> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusMessage error={duplicatePlan.error} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Groups" value={duplicatePlan.data?.summary.candidateGroups || 0} />
              <Metric label="Safe groups" value={duplicatePlan.data?.summary.safeGroups || 0} tone="text-emerald-700" />
              <Metric label="Safe pairs" value={duplicateSafePairs} tone="text-blue-700" />
              <Metric label="Held apart" value={duplicatePlan.data?.summary.heldGroups || 0} tone="text-amber-700" />
            </div>

            <div className="space-y-2">
              {(duplicatePlan.data?.groups || []).slice(0, 10).map((group) => (
                <div key={group.groupId} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{group.pairs[0]?.duplicateLabel || 'Duplicate group'}</span>
                    <span className={group.disposition === 'safe_to_merge' ? 'text-emerald-700' : 'text-amber-700'}>
                      {group.disposition === 'safe_to_merge' ? 'Safe' : 'Held separate'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {group.pairs.flatMap((pair) => pair.eligible ? pair.signals : pair.blockers).slice(0, 2).join(' / ') || 'No automatic action'}
                  </p>
                </div>
              ))}
              {duplicatePlan.data && duplicatePlan.data.groups.length === 0 ? <p className="text-sm text-slate-500">No duplicate groups detected.</p> : null}
            </div>

            <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Read-only plan. No prospect records can be changed from this screen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Property-memory plan</CardTitle>
                <CardDescription className="mt-1">Approves map-ready location and context in the background. Legal and ownership conflicts are not promoted automatically.</CardDescription>
              </div>
              {memoryPlan.data ? <span className="text-xs text-slate-500">{new Date(memoryPlan.data.generatedAt).toLocaleTimeString()}</span> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusMessage error={memoryPlan.error} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Pending" value={memoryPlan.data?.summary.pendingItems || 0} />
              <Metric label="Map ready" value={memoryReady} tone="text-emerald-700" />
              <Metric label="Linked" value={memoryPlan.data?.summary.linkedProspects || 0} tone="text-blue-700" />
              <Metric label="Exceptions" value={memoryPlan.data?.summary.heldExceptions || 0} tone="text-amber-700" />
            </div>

            <div className="space-y-2">
              {(memoryPlan.data?.items || []).slice(0, 10).map((item) => (
                <div key={item.itemId} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{item.address || 'Unplaced property memory'}</span>
                    <span className={item.disposition === 'approve_in_background' ? 'text-emerald-700' : 'text-amber-700'}>
                      {item.disposition === 'approve_in_background' ? 'Map ready' : 'Exception'}
                    </span>
                  </div>
                  {item.blockers.length ? <p className="mt-1 text-xs text-slate-500">{item.blockers.join(' / ')}</p> : null}
                </div>
              ))}
              {memoryPlan.data && memoryPlan.data.items.length === 0 ? <p className="text-sm text-slate-500">No pending property-memory maintenance.</p> : null}
            </div>

            <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Read-only plan. No property-memory records can be changed from this screen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-violet-600" />Pursuit history plan</CardTitle>
                <CardDescription className="mt-1">Finds exact listing-and-prospect references that predate automatic pursuit linking. No fuzzy matching.</CardDescription>
              </div>
              {pursuitHistoryPlan.data ? <span className="text-xs text-slate-500">{new Date(pursuitHistoryPlan.data.generatedAt).toLocaleTimeString()}</span> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusMessage error={pursuitHistoryPlan.error} />
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Exact links" value={pursuitHistoryPlan.data?.summary.exactLinks || 0} tone="text-violet-700" />
              <Metric label="Pursuits" value={pursuitHistoryPlan.data?.summary.pursuitsAffected || 0} />
              <Metric label="Evidence" value={pursuitHistoryPlan.data?.summary.evidenceRecords || 0} tone="text-blue-700" />
            </div>

            <div className="space-y-2">
              {(pursuitHistoryPlan.data?.items || []).slice(0, 10).map((item) => (
                <div key={`${item.listingId}:${item.prospectId}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{item.prospectLabel}</span>
                    <span className="text-violet-700">{item.evidenceCount} {item.evidenceCount === 1 ? 'record' : 'records'}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.listingTitle}</p>
                </div>
              ))}
              {pursuitHistoryPlan.data && pursuitHistoryPlan.data.items.length === 0 ? <p className="text-sm text-slate-500">Historical pursuit links are already current.</p> : null}
            </div>

            <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Read-only plan. Only exact historical references are eligible for background linking.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-600" />Standings identity audit</CardTitle>
            <CardDescription>Read-only account identities currently contributing production XP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusMessage error={leaderboardAudit.error} />
            <div className="space-y-2">
              {(leaderboardAudit.data?.data || []).map((entry) => (
                <div key={entry.user_id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{entry.display_name}</span>
                    <span className="tabular-nums text-slate-600">{Number(entry.xp_total || 0).toLocaleString()} XP</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{entry.user_email || 'No account email'}</p>
                  {Number(entry.identity_count || 1) > 1 ? <p className="mt-1 text-xs font-medium text-emerald-700">{entry.identity_count} identities consolidated</p> : null}
                </div>
              ))}
            </div>
            <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Read only. This view never merges authentication accounts.
            </p>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
