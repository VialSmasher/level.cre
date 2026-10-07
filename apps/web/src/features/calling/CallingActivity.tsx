import { Link } from 'wouter'
import { Mail, MessageSquare, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CallingActivity as Activity } from '@/lib/mobileCalling'

export function CallingActivity({ rows, filter, onFilter, contactName, unattributedCount, loading, error, onRetry }: {
  rows: Activity[]; filter: 'account' | 'contact'; onFilter: (filter: 'account' | 'contact') => void
  contactName: string; unattributedCount: number; loading: boolean; error: boolean; onRetry: () => void
}) {
  return <section aria-label="Account activity" className="border-t border-slate-100 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">Latest activity</h3><Link href="/app/inbox" className="inline-flex min-h-9 items-center rounded text-xs text-slate-500 hover:text-slate-900 hover:underline">View Activity</Link></div>
    <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant={filter === 'contact' ? 'secondary' : 'ghost'} aria-label="Selected contact" aria-pressed={filter === 'contact'} onClick={() => onFilter('contact')}>{contactName}</Button><Button size="sm" variant={filter === 'account' ? 'secondary' : 'ghost'} aria-label="All account activity" aria-pressed={filter === 'account'} onClick={() => onFilter('account')}>All account</Button></div>
    {filter === 'contact' && unattributedCount > 0 ? <p className="mt-2 text-[11px] leading-5 text-slate-500">{unattributedCount} earlier {unattributedCount === 1 ? 'activity has' : 'activities have'} no contact attribution. See All account.</p> : null}
    {loading ? <p role="status" className="py-4 text-xs text-slate-500">Loading activity...</p> : error ? <div className="py-3"><p className="text-xs text-amber-800">Activity could not be loaded.</p><Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button></div> : rows.length ? <ol className="mt-3 divide-y divide-slate-100">{rows.slice(0, 8).map((item) => {
      const Icon = item.type === 'email' ? Mail : item.type === 'call' ? Phone : MessageSquare
      return <li key={item.id} className="flex gap-3 py-3"><span className="mt-1 text-slate-400"><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-1"><p className="text-xs font-medium capitalize text-slate-700">{item.outcome?.replaceAll('_', ' ') || item.type}{filter === 'account' ? <span className="ml-2 font-normal normal-case text-slate-400">{item.contactName || 'Contact not recorded'}</span> : null}</p><time dateTime={item.occurredAt} className="text-[10px] text-slate-400">{new Date(/^\d{4}-\d{2}-\d{2}$/.test(item.occurredAt) ? item.occurredAt + 'T12:00:00Z' : item.occurredAt).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' })}</time></div>{item.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{item.notes}</p> : null}{item.phoneSnapshot ? <p className="mt-1 text-[10px] text-slate-400">{item.phoneSnapshot}</p> : null}</div></li>
    })}</ol> : <p className="py-4 text-xs text-slate-500">{filter === 'contact' ? 'No activity recorded for this contact yet.' : 'No account activity recorded yet.'}</p>}
  </section>
}
