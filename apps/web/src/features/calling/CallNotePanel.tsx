import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { brokerCallDate } from '@/lib/mobileCalling'
import { apiRequest } from '@/lib/queryClient'
import { useCallingSession } from './CallingSessionProvider'

type Outcome = 'attempted' | 'contacted' | 'no_answer' | 'left_message'
type Submission = {clientEventId:string; occurredAt:string; contactId:string; outcome:Outcome; notes:string}
type Draft = {text:string; outcome:Outcome; submission?:Submission}

export const manualDraftKey = (broker:string, prospect:string, contact:string) =>
  'levelcre:manual-call:' + JSON.stringify([broker,prospect,contact])

const memory = new Map<string,Draft>()
export function readCallDraft(key:string):Draft {
  const cached = memory.get(key)
  if (cached) return cached
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || 'null') as Draft|null
    if (draft && typeof draft.text === 'string') return draft
  } catch {}
  return {text:'', outcome:'attempted'}
}
export function storeCallDraft(key:string,draft:Draft|null) {
  if (draft) memory.set(key,draft)
  else memory.delete(key)
  try {
    if (draft) sessionStorage.setItem(key,JSON.stringify(draft))
    else sessionStorage.removeItem(key)
  } catch {}
}

export function CallNotePanel({brokerId,prospectId,contactId,onLogged}:{
  brokerId:string; prospectId:string; contactId:string|null; onLogged:()=>void
}) {
  const calling = useCallingSession()
  const session = calling.session
  const client = useQueryClient()
  const key = manualDraftKey(brokerId,prospectId,contactId || '')
  const [draft,setDraft] = useState(()=>readCallDraft(key))
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const submitting = useRef(false)
  const mounted = useRef(true)
  useEffect(()=>{
    mounted.current=true
    return ()=>{ mounted.current=false }
  },[])
  const value = session ? session.confirmation?.notes ?? session.draftNote ?? '' : draft.text
  const locked = session ? calling.busy || !!session.confirmation : !contactId || !!draft.submission
  const update = (next:Draft) => {
    storeCallDraft(key,next.text || next.submission ? next : null)
    setDraft(next)
  }
  const change = (next:string|((current:string)=>string)) => {
    if (locked || !mounted.current) return
    if (session) return calling.setDraftNote(session.clientEventId,next)
    const current = readCallDraft(key)
    if (current.submission) return
    update({...current,text:(typeof next === 'string' ? next : next(current.text)).slice(0,2000)})
  }
  const log = async () => {
    if (session || submitting.current || !contactId || !draft.text.trim() || !calling.recoveryReady) return
    const submission = draft.submission || {
      clientEventId:crypto.randomUUID(),occurredAt:new Date().toISOString(),contactId,
      notes:draft.text.trim(),outcome:draft.outcome,
    }
    submitting.current=true
    update({...draft,submission})
    setSaving(true)
    setError('')
    try {
      await apiRequest('POST','/api/calling/prospects/'+encodeURIComponent(prospectId)+'/manual-call',submission)
      storeCallDraft(key,null)
      if (mounted.current) {
        setDraft({text:'',outcome:'attempted'})
        onLogged()
      }
      for (const queryKey of [
        ['/api/calling/queue',brokerId], ['/api/calling/workspace',brokerId,prospectId],
        ['/api/calling/workspace-activity',brokerId,prospectId], ['/api/desk/call-follow-ups',brokerId],
        ['/api/prospects'], ['/api/interactions'], ['/api/skill-activities'], ['/api/skills'],
        ['/api/stats/header'], ['/api/profile'], ['/api/automation/activity-pulse'], ['/api/automation/sales-brief?limit=25'],
      ]) void client.invalidateQueries({queryKey})
    } catch (err) {
      if (mounted.current) {
        const rejected = err instanceof Error && /^(400|403|404|409):/.test(err.message)
        if (rejected) update({...draft,submission:undefined})
        setError(rejected ? 'Could not log this call. Check the selected contact. Your draft is here.' :
          'Save could not be confirmed. Retry to check and save this same call.')
      }
    } finally {
      submitting.current=false
      if (mounted.current) setSaving(false)
    }
  }
  return <section aria-label="Call note" className="mt-3">
    <div className="mb-1 flex items-center justify-between gap-2">
      <label htmlFor="call-note" className="text-sm font-semibold text-slate-800">New call note <span className="ml-1 text-xs font-normal text-slate-500">{new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(brokerCallDate(session?.startedAt || new Date())+'T12:00:00Z'))}</span></label>
      <VoiceDictationButton className="h-7 w-8 p-0" disabled={locked} onTranscript={text=>change(current=>(current.trimEnd()+' '+text).trimStart())}/>
    </div>
    <Textarea id="call-note" aria-label="New call note" rows={2} className="h-14 min-h-14 resize-y text-sm" value={value}
      placeholder="Type a quick note here, even if you dialed on your phone."
      maxLength={2000} disabled={locked} onChange={event=>change(event.target.value)} />
    <p className="mt-1 text-xs text-slate-500">Evening sync tidies your wording and suggests a follow-up.</p>
    {!session && !!value.trim() && <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label="Manual call outcome" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs" disabled={locked}
        value={draft.outcome} onChange={event=>update({...draft,outcome:event.target.value as Outcome})}>
        <option value="attempted">Call attempted</option><option value="contacted">Connected</option>
        <option value="no_answer">No answer</option><option value="left_message">Voicemail</option>
      </select>
      <Button size="sm" disabled={saving || !contactId || !calling.recoveryReady} onClick={log}>
        {saving ? 'Saving...' : draft.submission ? 'Retry save' : 'Log call & save note'}
      </Button>
    </div>}
    {error && <p className="mt-1 text-xs text-amber-800" role="alert">{error}</p>}
  </section>
}
