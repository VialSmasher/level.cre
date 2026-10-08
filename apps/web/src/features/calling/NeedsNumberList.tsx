import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/lib/queryClient'
import { type NeedsNumberResponse, type NeedsNumberRow } from '@/lib/mobileCalling'

const RESEARCH_STATUS = {
  not_found: 'Number not found', conflicting: 'Conflicting sources',
  identity_unclear: 'Company needs review', access_blocked: 'Source unavailable',
}

function reasonLabel(row: NeedsNumberRow) {
  const reason = row.phoneReadiness.reason
  if (reason === 'reported_bad_number') return row.phoneReadiness.blockedChoices.some((choice) => choice.reason === 'disconnected') ? 'Disconnected number reported' : 'Wrong number reported'
  if (reason === 'invalid_phone') return 'Number needs checking'
  if (reason === 'metadata_conflict') return 'Number information needs review'
  return 'No usable number saved'
}

export function NeedsNumberList({ onSelect, locked = false }: { onSelect?: (row: NeedsNumberRow) => void; locked?: boolean }) {
  const { user, isDemoMode } = useAuth()
  const brokerId = isDemoMode ? 'demo-user' : user?.id
  const [showAll, setShowAll] = useState(false)
  const query = useQuery<NeedsNumberResponse>({
    queryKey: ['/api/calling/needs-number', brokerId],
    enabled: Boolean(brokerId),
    queryFn: async () => (await apiRequest('GET', '/api/calling/needs-number?limit=25')).json(),
    staleTime: 30_000,
  })
  const rows = query.data?.rows || []
  const visible = showAll ? rows : rows.slice(0, 3)
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Needs a number">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">Needs a number</h2>{query.data ? <span className="text-[11px] tabular-nums text-slate-500">{query.data.total}</span> : null}</div>
    {query.isLoading ? <p className="px-4 py-3 text-xs text-slate-500">Checking saved numbers...</p> : query.isError ? <div className="px-4 py-3"><p role="alert" className="text-xs text-amber-800">Numbers could not be checked.</p><Button variant="ghost" className="mt-1 h-11 px-0 text-xs" onClick={() => query.refetch()}>Retry numbers</Button></div> : !rows.length ? <p className="px-4 py-3 text-xs text-slate-500">No companies need a number right now.</p> : <>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {visible.map((row) => {
          const research = row.phoneReadiness.lastResearch
          return <li key={row.prospect.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-xs font-medium text-slate-800">{row.company}</p>{row.contactName ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.contactName}</p> : null}</div>{row.reasons[0] ? <span className="max-w-[42%] shrink-0 text-right text-[10px] leading-4 text-slate-500">{row.reasons[0]}</span> : null}</div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{research ? RESEARCH_STATUS[research.status] : reasonLabel(row)}{research?.retryAt && !row.phoneReadiness.researchEligible ? ' · Next check ' + new Date(research.retryAt).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }) : ''}</p>
            {row.pendingCall ? <p className="mt-1 text-[10px] text-amber-700">Finish the call in progress before changing its number.</p> : null}
            <div className="mt-1 flex flex-wrap gap-2">{onSelect ? <Button variant="ghost" className="h-11 px-0 text-xs text-slate-600" disabled={locked || row.pendingCall} onClick={() => onSelect(row)}>Review number<ArrowRight aria-hidden="true" className="ml-1 h-3 w-3" /></Button> : null}<Link href={'/app?prospectId=' + encodeURIComponent(row.prospect.id)} onClick={() => { try { localStorage.setItem('levelcre:focusProspectId', row.prospect.id) } catch {} }} className="inline-flex min-h-11 items-center rounded px-1 text-xs text-slate-500 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">View record</Link></div>
          </li>
        })}
      </ul>
      {rows.length > 3 ? <Button variant="ghost" className="m-2 h-11 text-xs text-slate-500" aria-expanded={showAll} aria-label={showAll ? 'Show fewer companies needing a number' : 'View all companies needing a number'} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'View all'}</Button> : null}
    </>}
  </section>
}
