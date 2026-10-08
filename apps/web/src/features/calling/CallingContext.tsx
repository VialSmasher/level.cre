import type { CallingActivity } from '@/lib/mobileCalling'
import { callingTouchContext, callingTouchLabel, callingTouchNote } from '@/lib/callingContext'

export function CallingContext({ contactId, contactName, contactRows, accountRows, loading, error }: {
  contactId: string | null; contactName: string; contactRows: CallingActivity[]; accountRows: CallingActivity[]; loading: boolean; error: boolean
}) {
  if (loading) return <p role="status" className="mt-3 text-xs text-slate-500">Loading last touch…</p>
  if (error) return <p className="mt-3 text-xs text-slate-500">Last-touch context could not be loaded. Try refreshing activity below.</p>
  const context = callingTouchContext(contactRows, accountRows, contactId)
  if (!context) return <p className="mt-3 text-xs text-slate-500">{contactId ? 'No touch recorded for this contact yet.' : 'No activity recorded yet.'}</p>
  const item = context.activity
  const note = callingTouchNote(item)
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(item.occurredAt) ? item.occurredAt + 'T12:00:00Z' : item.occurredAt)
  return <section aria-label="Calling context" className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5">
    {context.scope === 'account' && contactId ? <p className="mb-1 text-xs text-slate-500">No touch recorded for this contact yet.</p> : null}
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-xs font-medium text-slate-700">{context.scope === 'contact' ? 'Last recorded touch' : 'Latest account activity'}<span className="font-normal text-slate-500"> · {context.scope === 'contact' ? contactName : item.contactName || item.email || 'Contact not recorded'}</span></p><time dateTime={item.occurredAt} className="text-[11px] tabular-nums text-slate-500">{date.toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', year: 'numeric' })}</time></div>
    <p className="mt-1 text-xs font-medium text-slate-700">{callingTouchLabel(item)}</p>
    {note ? <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-600" title={note}>{note}</p> : null}
  </section>
}
