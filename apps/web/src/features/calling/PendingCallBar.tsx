import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { ChevronDown, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCallingSession } from './CallingSessionProvider'
import { nextCallFollowUpIso, type MobileCallOutcome, type NextCallStep } from '@/lib/mobileCalling'

export function PendingCallBar() {
  const calling = useCallingSession()
  const [location] = useLocation()
  const [options, setOptions] = useState(false)
  const [notes, setNotes] = useState('')
  const [nextStep, setNextStep] = useState<'keep' | NextCallStep>('keep')
  const session = calling.session
  useEffect(() => { setOptions(false); setNotes(session?.confirmation?.notes || ''); setNextStep('keep') }, [session?.clientEventId])
  if (location.split('?')[0] === '/app/calls' || !calling.brokerId) return null
  if (!session) return calling.recoveryError ? <div role="alert" className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:bottom-4 left-4 z-[100] max-w-sm rounded-lg border border-amber-200 bg-white p-3 text-xs shadow-lg lg:left-72">Calling details need to reload before a new call.<Button variant="ghost" className="ml-2 h-8 px-2 text-xs" onClick={() => calling.retryRecovery()}>Retry calling</Button></div> : null
  const target = session.contactSnapshot?.name || session.candidate.contact.name || session.candidate.contact.company || session.candidate.prospect.name
  const company = session.candidate.prospect.businessName || session.candidate.contact.company || session.candidate.prospect.name
  const locked = calling.busy || Boolean(session.confirmation)
  function confirm(outcome: MobileCallOutcome = 'attempted') {
    calling.confirm(outcome, notes, nextStep === 'keep' ? undefined : nextCallFollowUpIso(nextStep))
  }
  return <section aria-label="Pending map call" className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:bottom-4 left-3 right-3 z-[100] max-h-[70dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl sm:right-auto sm:w-80 lg:left-72">
    <div className="flex items-start gap-2"><Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{target}</p>{company !== target ? <p className="truncate text-[11px] text-slate-500">{company}</p> : null}<p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{session.expectedPhone}</p></div></div>
    <div className="mt-2 flex items-center gap-2"><Button className="h-9 gap-1.5 bg-emerald-700 px-3 text-xs hover:bg-emerald-800" disabled={calling.busy} onClick={() => confirm()}>{calling.pendingConfirmation ? 'Saving call…' : session.confirmation ? 'Retry confirmation' : 'I called'}</Button><Button variant="ghost" className="h-9 px-2 text-xs text-slate-500" disabled={calling.busy} onClick={() => calling.discard()}>{calling.pendingDiscard ? 'Undoing…' : "Didn't call"}</Button><Button variant="ghost" className="ml-auto h-9 w-8 p-0 text-slate-500" aria-label="More call options" aria-expanded={options} onClick={() => setOptions((value) => !value)}><ChevronDown className="h-3.5 w-3.5" /></Button></div>
    <p role="status" className="mt-1 text-[11px] text-slate-500">{session.confirmation ? 'Retry uses the saved outcome and note.' : session.recorded ? 'Confirm after trying the call.' : calling.startError ? 'Call start needs a retry; no need to dial again.' : 'Saving call start…'}</p>
    {calling.error ? <div role="alert" className="mt-2 text-xs leading-5 text-amber-800">{calling.error instanceof Error ? calling.error.message : 'This call still needs to save.'}{calling.startError && !session.confirmation ? <Button variant="outline" className="mt-1 h-8 text-xs" disabled={calling.pendingStart || calling.busy} onClick={() => calling.retryStart()}>Retry recording</Button> : null}</div> : null}
    {options ? <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap gap-1.5">{([['no_answer', 'No answer'], ['left_message', 'Voicemail'], ['contacted', 'Connected'], ['wrong_number', 'Wrong number'], ['disconnected', 'Disconnected']] as const).map(([outcome, label]) => <Button key={outcome} variant="outline" className="h-8 px-2 text-[11px]" disabled={locked} onClick={() => confirm(outcome)}>{label}</Button>)}</div>
      <div><label htmlFor="map-call-note" className="text-xs text-slate-600">Note · optional</label><Textarea id="map-call-note" value={notes} rows={2} maxLength={2000} disabled={locked} className="mt-1 text-xs" onChange={(event) => setNotes(event.target.value)} /></div>
      <div><label htmlFor="map-call-follow-up" className="text-xs text-slate-600">Next follow-up</label><select id="map-call-follow-up" value={nextStep} disabled={locked} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs" onChange={(event) => setNextStep(event.target.value as typeof nextStep)}>{([['keep', 'Keep existing'], ['tomorrow', 'Tomorrow'], ['3d', '3 days'], ['1w', '1 week'], ['1m', '1 month'], ['none', 'None']] as const).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
    </div> : null}
  </section>
}
