import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'wouter'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/lib/queryClient'
import { brokerCallDate } from '@/lib/mobileCalling'

type FollowUp = {
  id:string; prospectId:string; company:string; contactId:string|null; notes:string; occurredAt:string; revision:string
  recommendation:{channel:'call'|'email';dueOn:string;reason:string;ifMissed:string}
}
const path='/api/desk/call-follow-ups'

export function CallFollowUps() {
  const {user,isDemoMode}=useAuth()
  const client=useQueryClient()
  const [limit,setLimit]=useState(5)
  const key=[path,user?.id]
  const query=useQuery<{rows:FollowUp[]}>({
    queryKey:key, enabled:!!user && !isDemoMode, refetchOnMount:'always',
    queryFn:async()=>(await apiRequest('GET',path)).json(),
  })
  const finish=useMutation({
    mutationFn:async({row,state}:{row:FollowUp;state:'done'|'dismissed'})=>
      apiRequest('POST',path+'/'+encodeURIComponent(row.id)+'/finish',{revision:row.revision,state}),
    onSettled:()=>client.invalidateQueries({queryKey:key}),
  })
  const rows=query.data?.rows || []
  if (!user || isDemoMode || (!rows.length && !query.isError)) return null
  const today=brokerCallDate(new Date())
  return <section aria-label="Call follow-ups" className="mt-5 rounded-xl border border-blue-100 bg-white px-4 py-4 sm:px-6">
    <h2 className="text-base font-semibold text-slate-900">Call follow-ups</h2>
    {query.isError && <button className="text-sm text-blue-700" onClick={()=>query.refetch()}>Could not load recommendations. Retry</button>}
    <ol className="divide-y divide-slate-100">{rows.slice(0,limit).map(row=>{
      const rec=row.recommendation
      const date=new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(rec.dueOn+'T12:00:00Z'))
      const params=new URLSearchParams({prospectId:row.prospectId})
      if (row.contactId) params.set('contactId',row.contactId)
      return <li key={row.id} className="py-3"><div className="flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-semibold">{row.company}</h3>
        <time dateTime={rec.dueOn} className={rec.dueOn<=today?'text-xs font-semibold text-amber-800':'text-xs text-slate-600'}>{rec.dueOn<=today?'Due':'Upcoming'} · {date}</time></div>
        <p className="mt-1 text-sm"><strong>{rec.channel==='call'?'Suggested call':'Suggested email'}</strong> · {rec.reason}</p>
        {rec.ifMissed && <p className="mt-1 text-xs text-slate-600">If you miss them · {rec.ifMissed}</p>}
        <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Call note · {brokerCallDate(row.occurredAt)}</summary><p className="mt-2 whitespace-pre-wrap break-words">{row.notes}</p><a className="inline-block py-2 text-blue-700" href={'/app/calls?'+new URLSearchParams({prospectId:row.prospectId,noteId:row.id})}>Open call note</a></details>
        <div className="mt-2 flex flex-wrap items-center gap-3"><Link href={'/app/calls?'+params} className="text-sm font-medium text-blue-700">Open in Calls</Link>
        <Button variant="ghost" size="sm" disabled={finish.isPending} onClick={()=>finish.mutate({row,state:'done'})}>Done</Button>
        <Button variant="ghost" size="sm" disabled={finish.isPending} onClick={()=>finish.mutate({row,state:'dismissed'})}>Dismiss</Button></div>
      </li>
    })}</ol>
    {rows.length>limit && <Button variant="outline" onClick={()=>setLimit(limit+10)}>Show more</Button>}
    {finish.isError && <p role="alert" className="text-sm text-amber-800">Could not close this recommendation. Check its current status before retrying.</p>}
  </section>
}
