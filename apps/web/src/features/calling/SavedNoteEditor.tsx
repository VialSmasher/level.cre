import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { apiRequest } from '@/lib/queryClient'
import { brokerCallDate } from '@/lib/mobileCalling'
import type { CallingWorkspace } from '@/lib/mobileCalling'

type SavedCall = {id:string; notes:string; revision:string|null; company:string; occurredAt:string; dialedContact:string|null}

export function RecordedCallNote({brokerId,prospectId,id}:{brokerId:string;prospectId:string;id:string}) {
  const [editing,setEditing] = useState(false)
  const query = useQuery<SavedCall>({
    queryKey:['/api/calling/note',brokerId,prospectId,id], retry:false,
    queryFn:async()=>(await apiRequest('GET','/api/calling/prospects/'+encodeURIComponent(prospectId)+'/calls/'+encodeURIComponent(id)+'/note')).json(),
  })
  const row=query.data
  return <main className="mx-auto max-w-2xl px-4 py-8">
    <a href="/app/desk" className="text-sm text-blue-700">Back to Daily Desk</a>
    <section className="mt-4 rounded-xl border border-blue-100 bg-white p-5">
      <h1 className="text-xl font-semibold">{row?.company || 'Call note'}</h1>
      {query.isLoading && <p role="status">Loading call note…</p>}
      {query.isError && <p role="alert">This call note could not be loaded. <button onClick={()=>query.refetch()}>Retry</button></p>}
      {row && <><p className="mt-1 text-sm text-slate-600">Call on {brokerCallDate(row.occurredAt)}{row.dialedContact && ' · Dialed contact: '+row.dialedContact}</p>
        <p className="my-4 whitespace-pre-wrap break-words">{row.notes || 'This call has no note yet.'}</p>
        <Button onClick={()=>setEditing(true)}>{row.notes ? 'Edit call note' : 'Add call note'}</Button>
        {editing && <SavedNoteEditor target={{prospectId,company:row.company,notes:row.notes,call:{id,revision:row.revision,date:brokerCallDate(row.occurredAt)}}} brokerId={brokerId} onClose={()=>setEditing(false)}/>}
      </>}
    </section>
  </main>
}

export type NoteTarget = {prospectId:string; company:string; notes:string; call?:{id:string; revision:string|null; date:string}}

export function SavedNoteEditor({target, brokerId, onClose}:{target:NoteTarget; brokerId:string; onClose:()=>void}) {
  const client = useQueryClient()
  const [value,setValue] = useState(target.notes)
  const [original,setOriginal] = useState(target)
  const [conflict,setConflict] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const base = '/api/calling/prospects/' + encodeURIComponent(target.prospectId)
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await apiRequest('PATCH',base + (original.call ? '/calls/'+encodeURIComponent(original.call.id)+'/note' : '/company-note'),
        original.call ? {notes:value,expectedRevision:original.call.revision} : {notes:value,expectedNotes:original.notes})
      await Promise.all([
        ['/api/calling/workspace',brokerId,target.prospectId], ['/api/calling/workspace-activity',brokerId,target.prospectId],
        ['/api/calling/note',brokerId,target.prospectId], ['/api/desk/call-follow-ups',brokerId], ['/api/calling/queue',brokerId], ['/api/interactions'], ['/api/prospects'],
      ].map(queryKey=>client.invalidateQueries({queryKey})))
      onClose()
    } catch (e) {
      setConflict(e instanceof Error && e.message.startsWith('409:'))
      setError(e instanceof Error && e.message.startsWith('409:') ? 'Someone edited these notes. Load the saved version to compare.' : 'Could not save. Your text is still here.')
    } finally { setBusy(false) }
  }
  const reload = async () => {
    setBusy(true)
    try {
      if (target.call) {
        const row: SavedCall = await (await apiRequest('GET',base+'/calls/'+encodeURIComponent(target.call.id)+'/note')).json()
        setOriginal({...target,notes:row.notes,call:{...target.call,revision:row.revision}})
      } else {
        const workspace: CallingWorkspace = await (await apiRequest('GET',base+'/workspace')).json()
        setOriginal({...target,notes:workspace.prospect.notes || ''})
      }
      setConflict(false)
      setError('Compare your draft with the saved version below before saving.')
    } catch { setError('Could not load the saved version. Your draft is still here.') }
    finally { setBusy(false) }
  }
  const label = target.call ? 'Call note' : 'Company notes'
  return <Dialog open onOpenChange={open=>{if (!open && !busy) onClose()}}>
    <DialogContent className="max-w-lg"><DialogTitle>{label}</DialogTitle>
      <DialogDescription>{target.company}{target.call ? ' · '+target.call.date : ''}</DialogDescription>
      <div className="flex items-center justify-between"><label htmlFor="saved-call-note" className="text-sm font-medium">Your notes</label>
        <VoiceDictationButton disabled={busy} onTranscript={text=>setValue(current=>(current.trimEnd()+' '+text).trimStart().slice(0,target.call ? 2000 : 20000))}/></div>
      <Textarea id="saved-call-note" autoFocus value={value} rows={5} maxLength={target.call ? 2000 : 20000} disabled={busy} onChange={e=>setValue(e.target.value)}/>
      {target.call && <p className="text-xs text-slate-500">Evening sync reads this note for a follow-up.</p>}
      {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      {original !== target && <p className="whitespace-pre-wrap text-sm">Currently saved · {original.notes || '(empty)'}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        {conflict ? <Button disabled={busy} onClick={reload}>Load saved version</Button> : <Button disabled={busy || value.trim()===original.notes} onClick={save}>{busy?'Saving…':'Save note'}</Button>}</div>
    </DialogContent></Dialog>
}
