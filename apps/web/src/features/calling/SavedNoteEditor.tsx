import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { apiRequest } from '@/lib/queryClient'
import type { CallingWorkspace } from '@/lib/mobileCalling'

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
        ['/api/desk/call-follow-ups',brokerId], ['/api/calling/queue',brokerId], ['/api/interactions'], ['/api/prospects'],
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
      const workspace: CallingWorkspace = await (await apiRequest('GET',base+'/workspace')).json()
      const row = target.call && workspace.activity.find(item=>item.id===target.call!.id)
      if (target.call && !row) throw new Error('Missing call')
      setOriginal({...target,notes:row ? row.notes : workspace.prospect.notes || '',call:row && target.call ? {...target.call,revision:row.noteRevision || null} : undefined})
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
