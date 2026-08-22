import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, DatabaseZap, RefreshCcw, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'

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

type MaintenanceResult = {
  attempted: number
  merged?: number
  approved?: number
  failed?: number
  skipped?: number
  heldExceptions?: number
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
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [armedAction, setArmedAction] = useState<'duplicates' | 'memory' | null>(null)
  const [lastResult, setLastResult] = useState<MaintenanceResult | null>(null)
  const duplicatePlan = useQuery<DuplicatePlan>({
    queryKey: ['/api/prospects/duplicate-merges/maintenance-plan?limit=50'],
    staleTime: 0,
  })
  const memoryPlan = useQuery<MemoryPlan>({
    queryKey: ['/api/intel/brokerage-memory/maintenance/plan?limit=250'],
    staleTime: 0,
  })

  const refreshPlans = async () => {
    setArmedAction(null)
    await Promise.all([duplicatePlan.refetch(), memoryPlan.refetch()])
  }

  const duplicateMutation = useMutation<MaintenanceResult>({
    mutationFn: async () => {
      if (!duplicatePlan.data) throw new Error('Generate the duplicate plan first.')
      const response = await apiRequest('POST', '/api/prospects/duplicate-merges/maintenance', {
        planHash: duplicatePlan.data.planHash,
        runKey: `approved-legacy-cleanup-${new Date().toISOString()}`,
        limit: 50,
        maxMerges: 4,
        confirmation: 'apply_safe_merges',
      })
      return response.json()
    },
    onSuccess: async (result) => {
      setLastResult(result)
      setArmedAction(null)
      toast({
        title: 'Safe duplicate batch complete',
        description: `${result.merged || 0} record pair${result.merged === 1 ? '' : 's'} consolidated.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/prospects'] })
      await refreshPlans()
    },
  })

  const memoryMutation = useMutation<MaintenanceResult>({
    mutationFn: async () => {
      if (!memoryPlan.data) throw new Error('Generate the property-memory plan first.')
      const response = await apiRequest('POST', '/api/intel/brokerage-memory/maintenance', {
        planHash: memoryPlan.data.planHash,
        runKey: `approved-property-memory-${new Date().toISOString()}`,
        limit: 250,
        maxItems: 25,
        confirmation: 'approve_map_ready_memory',
      })
      return response.json()
    },
    onSuccess: async (result) => {
      setLastResult(result)
      setArmedAction(null)
      toast({
        title: 'Background enrichment complete',
        description: `${result.approved || 0} map-ready record${result.approved === 1 ? '' : 's'} approved.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/intel/brokerage-memory/map'] })
      await refreshPlans()
    },
  })

  const isRefreshing = duplicatePlan.isFetching || memoryPlan.isFetching
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

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
            <StatusMessage error={duplicatePlan.error || duplicateMutation.error} />
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

            {armedAction === 'duplicates' ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-950">Apply the approved batch of up to 4 high-confidence merges?</p>
                <p className="mt-1 text-xs text-amber-800">Each merge creates an individual undo event. Held groups are untouched.</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>Apply approved merges</Button>
                  <Button variant="outline" onClick={() => setArmedAction(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setArmedAction('duplicates')} disabled={!duplicateSafePairs || duplicatePlan.isLoading}>
                Prepare approved merge batch
              </Button>
            )}
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
            <StatusMessage error={memoryPlan.error || memoryMutation.error} />
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

            {armedAction === 'memory' ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-950">Approve up to 25 map-ready records from this exact plan?</p>
                <p className="mt-1 text-xs text-amber-800">This is additive map enrichment. Unplaceable records remain untouched.</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => memoryMutation.mutate()} disabled={memoryMutation.isPending}>Apply approved batch</Button>
                  <Button variant="outline" onClick={() => setArmedAction(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setArmedAction('memory')} disabled={!memoryReady || memoryPlan.isLoading}>
                Prepare approved background batch
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {lastResult ? (
        <section className="mt-5 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" aria-live="polite">
          Last batch: {lastResult.attempted} attempted, {lastResult.merged || lastResult.approved || 0} applied, {lastResult.failed || 0} failed, {lastResult.skipped || lastResult.heldExceptions || 0} held.
        </section>
      ) : null}

    </div>
  )
}
