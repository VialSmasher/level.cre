import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/queryClient'
import { Link } from 'wouter'

const path = '/api/desk/codex-sync'
const reasons = {
  none: '', coverage: 'Mailbox coverage was incomplete.', access: 'One or more connected sources were unavailable.',
  backlog: 'Some updates are still queued.', interrupted: 'The desktop run was interrupted.',
  other: 'Check the run in Codex for details.',
}
type Run = {
  requestId: string
  state: 'queued' | 'running' | 'interrupted' | 'complete' | 'partial' | 'failed'
  lastSuccessAt: string | null
  result: { recorded: number; needsReview: number; queued: number; reason: keyof typeof reasons;
    relationships?:{state:'checked'|'partial'|'blocked'|'not_needed'|'not_reported';companiesReviewed:number;contacts:number;brokers:number;links:number;needsReview:number} } | null
}
type Status = { enabled: boolean; run: Run | null }
const active = (run?: Run | null) => run?.state === 'queued' || run?.state === 'running'

function describe(run?: Run | null) {
  if (!run) return ''
  if (run.state === 'queued') return 'Queued · Waiting for your computer'
  if (run.state === 'running') return 'Syncing activity and relationships…'
  if (run.state === 'interrupted') return 'Computer stopped reporting. Check Codex before retrying.'
  const r = run.result
  if (run.state === 'failed') return `Sync failed. ${r ? reasons[r.reason] : ''}`
  if (!r) return ''
  return [run.state === 'complete' ? 'Complete' : 'Partially synced', `${r.recorded} recorded`,
    `${r.needsReview} for review`, r.queued ? `${r.queued} queued` : '', reasons[r.reason]].filter(Boolean).join(' · ')
}

export function DeskCodexSync({ onSettled }: { onSettled: () => void }) {
  const { user, isDemoMode } = useAuth()
  if (!user || isDemoMode) return null
  return <BrokerSync key={user.id} owner={user.id} onSettled={onSettled} />
}

function BrokerSync({ owner, onSettled }: { owner: string; onSettled: () => void }) {
  const client = useQueryClient()
  const key = [path, owner]
  const pendingId = useRef<string | null>(null)
  const observed = useRef<string | null>(null)
  const status = useQuery<Status>({
    queryKey: key, queryFn: async () => (await apiRequest('GET', path)).json(),
    refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    refetchInterval: q => active(q.state.data?.run) ? 4000 : (q.state.data?.enabled === false ? false : 60000),
  })
  const request = useMutation({
    mutationFn: async () => {
      pendingId.current ??= crypto.randomUUID()
      return (await apiRequest('POST', path, { requestId: pendingId.current })).json() as Promise<Status>
    },
    onSuccess: data => {
      pendingId.current = null
      observed.current = data.run?.requestId ?? null
      client.setQueryData(key, data)
    },
    onError: () => { void status.refetch() },
  })
  const run = status.data?.run
  useEffect(() => {
    if (!run) return
    if (active(run)) {
      observed.current = run.requestId
      pendingId.current = null
    } else if (observed.current === run.requestId) {
      observed.current = null
      void client.invalidateQueries({queryKey:['/api/desk/directory']})
      onSettled()
    }
  }, [run, onSettled])
  if (!status.data?.enabled) return null
  const message = status.isError ? 'Sync status unavailable. Reconnecting…'
    : request.isError && !active(run) ? 'Request unconfirmed. Try again.' : describe(run)
  return (
    <div className="flex max-w-xs flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={() => request.mutate()}
        disabled={active(run) || request.isPending} data-testid="desk-codex-sync">
        <RefreshCw className={run?.state === 'running' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        Sync with Codex
      </Button>
      <div className="text-xs text-slate-600" role="status" aria-live="polite">
        {message && <div>{message}</div>}
        {run?.result?.relationships && <Link href="/app/desk/relationships?updates=1" className="mt-1 block text-blue-700 hover:underline">
          {relationshipSummary(run.result.relationships)}
        </Link>}
        {run?.lastSuccessAt && <div>Last successful sync {new Date(run.lastSuccessAt).toLocaleString([], {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })}</div>}
      </div>
    </div>
  )
}

export function relationshipSummary(r:NonNullable<NonNullable<Run['result']>['relationships']>) {
  const saved=r.contacts+r.brokers+r.links
  const change=saved ? `${r.contacts} contacts, ${r.brokers} brokers, ${r.links} links saved` : 'No changes saved'
  const status={checked:`${r.companiesReviewed} companies checked`,not_needed:'No companies needed an update',partial:'Partially checked',blocked:'Check incomplete',not_reported:'Check not reported'}[r.state]
  return `Relationships · ${status} · ${change}${r.needsReview ? ` · ${r.needsReview} findings to review` : ''}`
}
