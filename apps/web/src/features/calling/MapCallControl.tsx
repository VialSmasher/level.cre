import { useEffect, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Phone, Plus } from 'lucide-react'
import { Link } from 'wouter'
import type { Prospect } from '@level-cre/shared/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCallingSession } from '@/features/calling/CallingSessionProvider'
import { apiRequest } from '@/lib/queryClient'
import { preferredCallingChoice, type CallingWorkspace } from '@/lib/mobileCalling'
import { buildMapPhoneEntry, directMapContacts, mapCallCandidate, mapCompanyName, mapPhoneKey, mapPhoneSaveError, type MapPhoneEntry } from '@/lib/mapCalling'

type Props = { prospect: Prospect; compact?: boolean; disabled?: boolean; beforePhoneSave?: () => Promise<boolean>; onPhoneSaved?: (workspace: CallingWorkspace) => void }

export function MapCallControl({ prospect, compact = false, disabled = false, beforePhoneSave, onPhoneSaved }: Props) {
  const calling = useCallingSession()
  const queryClient = useQueryClient()
  const [selectedKey, setSelectedKey] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const key = ['/api/calling/workspace', calling.brokerId, prospect.id] as const
  const query = useQuery<CallingWorkspace>({
    queryKey: key,
    queryFn: async () => (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(prospect.id)}/workspace`)).json(),
    enabled: Boolean(calling.brokerId) && !disabled,
    staleTime: 30_000, retry: false,
  })
  // Existing map contact edits are acknowledged before a fresh canonical read.
  useEffect(() => {
    if (!disabled) void queryClient.invalidateQueries({ queryKey: key })
  }, [disabled, prospect.id, prospect.contactName, prospect.contactEmail, prospect.contactCompany, prospect.contactPhone, queryClient])
  useEffect(() => { setSelectedKey(''); setEditorOpen(false); setOptionsOpen(false) }, [prospect.id])
  const workspace = query.data
  const choices = workspace?.phoneReadiness?.usableChoices || []
  const choiceKey = (choice: typeof choices[number]) => `${choice.contactId || ''}:${choice.phoneKey}`
  const choice = choices.find((item) => choiceKey(item) === selectedKey) || preferredCallingChoice(workspace?.phoneReadiness)
  const contact = workspace?.contacts.find((item) => item.id === choice?.contactId) || workspace?.contacts.find((item) => item.isPrimary) || null
  const targetName = contact?.name || choice?.contactName || (workspace ? mapCompanyName(workspace) : prospect.businessName || prospect.contactCompany || 'saved contact')
  const locked = disabled || query.isError || query.isFetching || !calling.recoveryReady || Boolean(calling.session) || calling.busy

  function dial(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || locked || !workspace || !choice || !contact) { event.preventDefault(); return }
    if (!calling.start(mapCallCandidate(workspace, choice), contact, choice)) event.preventDefault()
  }

  const action = choice && !locked ? <Button asChild variant="outline" className={compact ? 'h-8 w-8 p-0' : 'h-8 gap-1.5 px-3 text-xs'}>
    <a href={choice.dialHref} onClick={dial} aria-label={`Call ${targetName} at ${choice.number}`} title={`Call ${targetName} · ${choice.number}`}><Phone className="h-3.5 w-3.5" />{!compact && 'Call'}</a>
  </Button> : choice || calling.session || query.isLoading || !calling.recoveryReady ? <Button variant="outline" className={compact ? 'h-8 w-8 p-0' : 'h-8 gap-1.5 px-3 text-xs'} disabled title={calling.session ? 'Finish or undo the pending call' : 'Loading saved calling details'} aria-label={calling.session ? 'Call pending' : 'Loading call target'}>{query.isFetching || !calling.recoveryReady ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}{!compact && (calling.session ? 'Call pending' : 'Call')}</Button>
    : <Button variant="outline" className={compact ? 'h-8 w-8 p-0' : 'h-8 gap-1.5 px-2 text-xs'} aria-label="Add number" title="Add a phone number" disabled={locked || !workspace || query.isError} onClick={() => setEditorOpen(true)}><Plus className="h-3.5 w-3.5" />{!compact && 'Add number'}</Button>

  const options = workspace && !query.isError ? <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" className="h-8 w-5 p-0 text-slate-500" aria-label="Calling options" disabled={locked}><ChevronDown className="h-3 w-3" /></Button></PopoverTrigger>
    <PopoverContent data-map-call-overlay side="top" align="start" className="z-[150] w-64 space-y-3 p-3">
      {choices.length > 1 ? <div><Label htmlFor={`map-target-${compact ? 'footer' : 'contact'}-${prospect.id}`} className="text-xs">Call target</Label><select id={`map-target-${compact ? 'footer' : 'contact'}-${prospect.id}`} value={choice ? choiceKey(choice) : ''} onChange={(event) => setSelectedKey(event.target.value)} className="mt-1 min-h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs">{choices.map((item) => <option key={choiceKey(item)} value={choiceKey(item)}>{item.contactName || 'Company contact'} · {item.label} · {item.number}</option>)}</select></div> : null}
      {choice ? <p className="break-words text-xs text-slate-600">{targetName}<br /><span className="tabular-nums">{choice.number}</span></p> : null}
      <Button type="button" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { setOptionsOpen(false); setEditorOpen(true) }}><Plus className="h-3 w-3" />Add number</Button>
      <Link href={`/app/calls?prospectId=${encodeURIComponent(prospect.id)}`} className="block text-xs text-blue-700 hover:underline">Review contacts in Calls</Link>
    </PopoverContent>
  </Popover> : null

  return <div role="group" aria-label={compact ? 'Map calling' : 'Map contact calling'} className={compact ? 'inline-flex shrink-0 items-center' : 'space-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 p-2.5'}>
    {!compact && workspace ? <p className="truncate text-xs font-medium text-slate-800">{targetName}</p> : null}
    <div className="flex items-center gap-1">{action}{options}{!compact && choice ? <span className="min-w-0 truncate text-[11px] tabular-nums text-slate-500">{choice.number}</span> : null}</div>
    {!compact ? <p className="text-[11px] text-slate-500">{query.isError ? 'Calling details could not be loaded.' : calling.session ? 'Confirm the pending call below, or finish it in Calls.' : disabled ? 'Waiting for your changes to save.' : choice ? 'Opens your dialer. Confirm after trying the call.' : 'Save a direct number or company line.'}</p> : null}
    {query.isError && !compact ? <Button type="button" variant="ghost" className="h-7 px-0 text-xs" onClick={() => void query.refetch()}>Retry calling details</Button> : null}
    {editorOpen && workspace ? <MapNumberEditor key={prospect.id} workspace={workspace} selectedContactId={choice ? contact?.id : undefined} beforeSave={beforePhoneSave} onClose={() => setEditorOpen(false)} onSaved={(saved, contactId) => {
      queryClient.setQueryData(key, saved)
      const supplied = saved.phoneReadiness?.usableChoices.find((item) => item.contactId === contactId)
      if (supplied) setSelectedKey(choiceKey(supplied))
      onPhoneSaved?.(saved)
      for (const prefix of ['/api/prospects', '/api/calling/queue', '/api/calling/needs-number', '/api/automation/sales-brief?limit=25', '/api/calling/workspace']) void queryClient.invalidateQueries({ queryKey: [prefix] })
      setEditorOpen(false)
    }} /> : null}
  </div>
}

function MapNumberEditor({ workspace, selectedContactId, beforeSave, onSaved, onClose }: { workspace: CallingWorkspace; selectedContactId?: string; beforeSave?: () => Promise<boolean>; onSaved: (saved: CallingWorkspace, contactId?: string) => void; onClose: () => void }) {
  const contacts = directMapContacts(workspace)
  const [kind, setKind] = useState<MapPhoneEntry['phoneEvidence']['kind']>(contacts.some((contact) => contact.id === selectedContactId) ? 'contact_direct' : 'company_main')
  const [contactId, setContactId] = useState(contacts.find((contact) => contact.id === selectedContactId)?.id || contacts[0]?.id || '')
  const [number, setNumber] = useState('')
  const [frozen, setFrozen] = useState<MapPhoneEntry | null>(null)
  const [validation, setValidation] = useState('')
  const save = useMutation({
    mutationFn: async (entry: MapPhoneEntry) => {
      if (beforeSave && !await beforeSave()) throw new Error('Save your map changes before adding this number.')
      const response = await apiRequest('POST', '/api/agent/phone-enrichment/batch', { entries: [entry] })
      const result = (await response.json()).results?.find((item: { prospectId: string }) => item.prospectId === entry.prospectId)
      if (!result || !['applied', 'unchanged'].includes(result.status)) throw new Error(mapPhoneSaveError(result?.reason || 'unknown'))
      const saved = await (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(entry.prospectId)}/workspace`)).json() as CallingWorkspace
      if (!saved.phoneReadiness?.usableChoices.some((choice) => choice.contactId === result.contactId && choice.phoneKey === mapPhoneKey(entry.contactPhone))) throw new Error('The number was saved, but its calling details still need to refresh. Retry without changing the number.')
      return { saved, contactId: result.contactId as string | undefined }
    },
    onSuccess: ({ saved, contactId }) => onSaved(saved, contactId),
  })
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose() }}><DialogContent data-map-call-overlay className="z-[210] max-w-sm rounded-lg">
    <DialogHeader><DialogTitle>Add a phone number</DialogTitle><DialogDescription>{mapCompanyName(workspace)}. Save a number you have confirmed for this company or person.</DialogDescription></DialogHeader>
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault()
      if (save.isPending) return
      try { const entry = frozen || buildMapPhoneEntry(workspace, kind, contactId, number); setFrozen(entry); setValidation(''); save.mutate(entry) }
      catch (error) { setValidation(error instanceof Error ? error.message : 'Check this phone number.') }
    }}>
      <div><Label htmlFor="map-number-type">Number type</Label><select id="map-number-type" className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" value={kind} disabled={save.isPending || Boolean(frozen)} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="company_main">Company line</option><option value="contact_direct" disabled={!contacts.length}>Direct number</option></select></div>
      {kind === 'contact_direct' ? <div><Label htmlFor="map-number-contact">Contact for this number</Label><select id="map-number-contact" className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" value={contactId} disabled={save.isPending || Boolean(frozen)} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name || contact.email}</option>)}</select></div> : <p className="text-xs text-slate-500">Saved separately as Company main line.</p>}
      {!contacts.length ? <p className="text-xs text-slate-500">For a direct number, first add the person’s name in the Contact tab.</p> : null}
      <div><Label htmlFor="map-phone-number">Phone number</Label><Input id="map-phone-number" type="tel" autoFocus value={number} maxLength={80} placeholder="+1 780 555 0123 ext. 204" disabled={save.isPending || Boolean(frozen)} onChange={(event) => setNumber(event.target.value)} required /></div>
      {validation || save.isError ? <p role="alert" className="text-xs leading-5 text-amber-800">{validation || (save.error instanceof Error ? save.error.message : 'The number could not be saved.')}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="h-9 text-xs" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" className="h-9 text-xs" disabled={save.isPending || !number.trim()}>{save.isPending ? 'Saving…' : frozen && save.isError ? 'Retry saving number' : 'Save number'}</Button></div>
    </form>
  </DialogContent></Dialog>
}
