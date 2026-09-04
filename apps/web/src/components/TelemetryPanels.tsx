import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import { Radio, MapPin, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTelemetry } from '@/contexts/TelemetryContext'
import { apiRequest } from '@/lib/queryClient'
import { telemetryKeys } from '@/lib/telemetryQueries'
import { cn } from '@/lib/utils'

type Run = { producer_id: string; run_id: string; status: string; applied: number; needs_review: number; failed: number; queued: number | null; scanned_through: string | null; acknowledged_at: string }
type CoverageGroup = { company: string; prospectId: string | null; reason: string; actions: number; latestAt: string; events: Array<{ id: string; subject: string; email: string; timestamp: string }> }
type Insights = {
  days: number; limited: boolean;
  coverage: { actions: number; mappedActions: number; unmappedActions: number; groups: CoverageGroup[] };
  progression: { contacted: number; attributableConversations: number; repliedConversations: number; prospectsWithMeetings: number; unattributedOutbound: number; confirmedMilestones: Array<{ event_type: string; total: number }> }
}
const when = (value: string | number | null) => value ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Edmonton' }).format(new Date(value)) : 'Not yet reported'
function useInsights() {
  const { user } = useAuth()
  return useQuery<Insights>({
    queryKey: telemetryKeys.insights(user?.id || 'anonymous'), enabled: Boolean(user),
    queryFn: async () => (await apiRequest('GET', '/api/automation/insights')).json(),
  })
}
export function AutomationStatus() {
  const { user, isDemoMode } = useAuth()
  const telemetry = useTelemetry()
  const runs = useQuery<{ rows: Run[] }>({
    queryKey: telemetryKeys.runs(user?.id || 'anonymous'), enabled: Boolean(user) && !isDemoMode,
    queryFn: async () => (await apiRequest('GET', '/api/automation/runs')).json(),
  })
  const latest = runs.data?.rows[0]
  const needsAttention = Boolean(latest && (latest.failed || latest.queued || latest.status === 'blocked'))
  const modeLabel = { connecting: 'Connecting', live: 'Live updates', polling: 'Checking every 30 seconds', offline: 'Offline · showing saved view', demo: 'Demo' }[telemetry.mode]
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-slate-600">
        <span className={cn('flex items-center gap-2 font-semibold', telemetry.mode === 'live' ? 'text-emerald-700' : 'text-slate-700')}><Radio className="h-3.5 w-3.5" />{modeLabel}</span>
        <span>Dashboard checked {when(telemetry.lastSyncedAt)}</span>
        <span className={cn('sm:ml-auto', needsAttention ? 'font-semibold text-amber-800' : 'text-slate-600')}>{needsAttention ? 'Delivery needs attention' : latest ? 'Latest delivery acknowledged' : isDemoMode ? 'Sample workspace' : 'Producer receipt not yet reported'}</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        {runs.isError ? <p role="alert">Run receipts could not be loaded. Dashboard freshness and producer delivery are separate checks.</p> : !latest ? <p>The recorder will report its first run after it is updated. A quiet day is not treated as a failed sync.</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="font-medium text-slate-900">{latest.producer_id}</p><p>Receipt {when(latest.acknowledged_at)}</p></div>
              <div><p className="font-medium text-slate-900">Last reported scan</p><p>{when(latest.scanned_through)}</p></div>
              <div><p className="font-medium text-slate-900">{latest.applied} acknowledged · {latest.queued ?? 'Unknown'} queued</p><p>{latest.needs_review} for review · {latest.failed} rejected</p></div>
            </div>
            <ol className="mt-3 divide-y divide-slate-100">
              {runs.data?.rows.slice(0, 5).map(run => <li key={run.producer_id + ':' + run.run_id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{run.producer_id} · {when(run.acknowledged_at)}</span><span>{run.status.replaceAll('_', ' ')} · {run.applied} acknowledged</span>
              </li>)}
            </ol>
          </>
        )}
      </div>
    </details>
  )
}
export function CommercialProgress() {
  const insights = useInsights()
  const data = insights.data?.progression
  const cells = [
    { label: 'Prospects / contacts reached', value: data?.contacted },
    { label: 'Conversations with a reply', value: data?.repliedConversations },
    { label: 'Reached prospects with meetings', value: data?.prospectsWithMeetings },
  ]
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white" aria-label="Commercial progression">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950"><ArrowUpRight className="h-4 w-4 text-blue-600" />Conversations progressing</h2>
        <span className="text-xs text-slate-500">Last 28 days</span>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-slate-100">
        {cells.map(cell => <div key={cell.label} className="px-3 py-3 sm:px-4"><dd className="text-xl font-semibold tabular-nums text-slate-950">{insights.isError ? '—' : cell.value ?? '…'}</dd><dt className="mt-1 text-xs leading-5 text-slate-600">{cell.label}</dt></div>)}
      </dl>
      <details className="border-t border-slate-100 px-4 py-2 text-xs leading-5 text-slate-500">
        <summary className="cursor-pointer">How progression is counted</summary>
        <p className="mt-2">Replies follow outreach in the same captured thread, or the same contact and normalized subject. Meetings are recorded against reached prospects; this does not claim the outreach caused them.</p>
        <p>{data?.attributableConversations ?? 0} conversations can be linked; {data?.unattributedOutbound ?? 0} outbound emails lack enough thread/contact evidence.</p>
        {data?.confirmedMilestones.length ? <p className="mt-1">Other confirmed milestones: {data.confirmedMilestones.map(row => row.event_type.replaceAll('_', ' ') + ' (' + row.total + ')').join(', ')}.</p> : null}
        {insights.data?.limited ? <p>Showing the most recent 5,000 recorded activities.</p> : null}
        {insights.isError ? <p role="alert">Progression data could not be loaded.</p> : null}
      </details>
    </section>
  )
}
export function MappingRecovery() {
  const insights = useInsights()
  const coverage = insights.data?.coverage
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-white" id="mapping-recovery">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-950">
        <MapPin className="h-4 w-4 text-blue-600" />Mapping coverage
        <span className="ml-auto text-xs font-normal text-slate-600">{coverage ? coverage.mappedActions + ' of ' + coverage.actions + ' outbound actions mapped · 28 days' : insights.isError ? 'Unavailable' : 'Loading…'}</span>
      </summary>
      <div className="border-t border-slate-100 p-4">
        <p className="text-xs leading-5 text-slate-600">{coverage?.unmappedActions ?? 0} actions need a prospect match or verified location. Codex can use this recovery list with the existing verified mapping workflow; ambiguous evidence stays reviewable.</p>
        {insights.isError ? <p role="alert" className="mt-2 text-xs text-amber-800">Mapping coverage could not be loaded.</p> : null}
        <ul className="mt-3 divide-y divide-slate-100">
          {coverage?.groups.slice(0, 12).map(group => <li key={(group.prospectId || group.company) + ':' + group.reason} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{group.company}</p><p className="mt-1 text-xs text-slate-500">{group.actions} action{group.actions === 1 ? '' : 's'} · {group.reason}</p>
                {group.events[0]?.subject ? <p className="mt-1 truncate text-xs text-slate-600">{group.events[0].subject}</p> : null}
              </div>
              {group.prospectId ? <Link className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50" href={'/app?prospectId=' + encodeURIComponent(group.prospectId)}>Open prospect</Link> : null}
            </div>
            {group.events.length ? <details className="mt-2 text-xs text-slate-600">
              <summary className="w-fit cursor-pointer py-1 font-medium text-blue-700">View captured activity</summary>
              <ol className="mt-2 divide-y divide-slate-100 rounded-md bg-slate-50 px-3">
                {group.events.slice(0, 5).map(event => <li key={event.id} className="py-2">
                  <p className="break-words font-medium text-slate-800">{event.subject || 'Captured outbound activity'}</p>
                  {event.email ? <p className="mt-1 break-all">{event.email}</p> : null}
                  <p className="mt-1 text-slate-500">{when(event.timestamp)}</p>
                </li>)}
              </ol>
              {group.actions > 5 ? <p className="mt-2 text-slate-500">Showing the five most recent captured actions.</p> : null}
            </details> : null}
          </li>)}
        </ul>
        {coverage && coverage.unmappedActions === 0 ? <p className="flex items-center gap-2 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />All recorded outbound activity in this window has map coverage.</p> : null}
        {coverage && coverage.groups.length > 12 ? <p className="mt-2 text-xs text-slate-500">Showing 12 of {coverage.groups.length} recovery groups. The full list is available to the agent.</p> : null}
      </div>
    </details>
  )
}
