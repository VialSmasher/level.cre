import { useState, type MouseEvent } from 'react'
import { Pencil, Phone, Plus, UserRound, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/queryClient'
import { contactPhoneOptions, phoneIssueLabel, type CallingContact, type CallingWorkspace, type CallingPhoneReadiness } from '@/lib/mobileCalling'
import { cn } from '@/lib/utils'

export function contactName(contact: CallingContact) {
  return contact.name || contact.company || 'Primary contact'
}

type Props = {
  prospectId: string; contacts: CallingContact[]; selectedId: string | null; selectedPhone: string; locked: boolean
  readiness: CallingPhoneReadiness | null
  onSelect: (contact: CallingContact) => void
  onDial: (event: MouseEvent<HTMLAnchorElement>, contact: CallingContact, phone: string) => void
  onSaved: (workspace: CallingWorkspace, contactId?: string) => void
}

export function CallingContacts({ prospectId, contacts, selectedId, selectedPhone, locked, readiness, onSelect, onDial, onSaved }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [editor, setEditor] = useState<{ contact: CallingContact | null } | null>(null)
  const visible = showAll ? contacts : contacts.slice(0, 3)
  return (
    <section aria-label="Contacts" className="border-t border-slate-100 px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Contacts <span className="ml-1 text-xs font-normal text-slate-400">{contacts.length}</span></h3>
        <Button variant="ghost" className="h-9 gap-1.5 px-2 text-xs text-slate-600" disabled={locked} onClick={() => setEditor({ contact: null })}><Plus className="h-3.5 w-3.5" />Add contact</Button>
      </div>
      <ul className="space-y-2">
        {visible.map((contact) => {
          const options = contactPhoneOptions(contact, readiness)
          const phone = (selectedId === contact.id ? options.find((option) => option.number === selectedPhone) : null) || options.find((option) => option.href) || options[0]
          return <li key={contact.id} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2', selectedId === contact.id ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white')}>
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 sm:flex"><UserRound className="h-3.5 w-3.5" /></span>
            <button type="button" className="min-h-11 min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-default" aria-label={'Select contact ' + contactName(contact)} aria-pressed={selectedId === contact.id} disabled={locked} onClick={() => onSelect(contact)}>
              <span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-slate-800">{contactName(contact)}</span>{contact.isPrimary ? <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">Primary</span> : null}</span>
              {contact.title || contact.email || contact.isPrimary ? <span className={cn('mt-0.5 block truncate text-[11px] leading-4 text-slate-500', contact.isPrimary && !contact.title && !contact.email && 'sm:hidden')}>{contact.title || contact.email || (contact.isPrimary ? 'Primary' : '')}</span> : null}
            </button>
            {phone?.href && !locked ? <a href={phone.href} onClick={(event) => onDial(event, contact, phone.number)} aria-label={'Call ' + contactName(contact) + ' at ' + phone.number} className="inline-flex min-h-11 max-w-[45%] shrink-0 items-center gap-1.5 rounded text-[11px] tabular-nums text-slate-600 underline-offset-2 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><Phone aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{phone.number}</span></a> : <span className="max-w-[40%] shrink-0 text-right text-[11px] tabular-nums text-slate-400"><span className="block truncate">{phone?.number || 'No phone'}</span>{phone?.blockedReason ? <span className="block text-[10px] text-amber-700">{phoneIssueLabel(phone.blockedReason)}</span> : null}</span>}
            <Button variant="ghost" size="icon" className="h-11 w-8 shrink-0 text-slate-400" aria-label={'Edit contact ' + contactName(contact)} disabled={locked} onClick={() => setEditor({ contact })}><Pencil className="h-3.5 w-3.5" /></Button>
          </li>
        })}
      </ul>
      {contacts.length > 3 ? <Button variant="ghost" className="mt-2 h-9 px-2 text-xs text-slate-500" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer contacts' : 'View all contacts'}</Button> : null}
      {locked ? <p className="mt-2 text-[11px] text-slate-500">Finish or undo this call before switching contacts.</p> : null}
      {editor ? <ContactEditor key={editor.contact?.id || 'new'} prospectId={prospectId} contact={editor.contact} existingIds={contacts.map((item) => item.id)} onClose={() => setEditor(null)} onSaved={(workspace, contactId) => { onSaved(workspace, contactId); setEditor(null) }} /> : null}
    </section>
  )
}

function ContactEditor({ prospectId, contact, existingIds, onClose, onSaved }: { prospectId: string; contact: CallingContact | null; existingIds: string[]; onClose: () => void; onSaved: (workspace: CallingWorkspace, contactId?: string) => void }) {
  const [name, setName] = useState(contact?.name || '')
  const [title, setTitle] = useState(contact?.title || '')
  const [company, setCompany] = useState(contact?.company || '')
  const [email, setEmail] = useState(contact?.email || '')
  const [phone, setPhone] = useState(contact?.phone || '')
  const [additionalPhones, setAdditionalPhones] = useState(contact?.additionalPhones || [])
  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(contact ? 'PATCH' : 'POST', `/api/calling/prospects/${encodeURIComponent(prospectId)}/contacts${contact ? '/' + encodeURIComponent(contact.id) : ''}`, {
        name: name.trim(), title: title.trim() || null, company: company.trim() || null,
        email: email.trim() || null, phone: phone.trim() || null,
        additionalPhones: additionalPhones.filter((item) => item.number.trim()).map((item) => ({ label: item.label.trim() || 'Other', number: item.number.trim() })),
      })
      return response.json() as Promise<CallingWorkspace>
    },
    onSuccess: (workspace) => {
      const active = workspace.contacts.filter((item) => !item.archivedAt)
      const unchanged = active.find((item) => item.id === contact?.id)
      const created = active.filter((item) => !existingIds.includes(item.id))
      const selected = unchanged?.id || (created.length === 1 ? created[0].id : undefined)
      onSaved(workspace, selected)
    },
  })
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose() }}><DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg">
    <DialogHeader><DialogTitle>{contact ? 'Edit contact' : 'Add contact'}</DialogTitle><DialogDescription>Save a private contact on this company record.</DialogDescription></DialogHeader>
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if ((contact?.isPrimary || name.trim()) && !save.isPending) save.mutate() }}>
      <div><Label htmlFor="contact-name">Name</Label><Input id="contact-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} required={!contact?.isPrimary} maxLength={240} disabled={save.isPending} /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="contact-title">Title</Label><Input id="contact-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} disabled={save.isPending} /></div><div><Label htmlFor="contact-company">Company</Label><Input id="contact-company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={240} disabled={save.isPending} /></div></div>
      <div><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} disabled={save.isPending} /></div>
      <div><Label htmlFor="contact-phone">Phone</Label><Input id="contact-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={80} disabled={save.isPending} /></div>
      {additionalPhones.map((item, index) => <div key={index} className="flex items-end gap-2"><div className="w-24"><Label htmlFor={'phone-label-' + index}>Label</Label><Input id={'phone-label-' + index} value={item.label} maxLength={40} disabled={save.isPending} onChange={(event) => setAdditionalPhones((items) => items.map((value, row) => row === index ? { ...value, label: event.target.value } : value))} /></div><div className="min-w-0 flex-1"><Label htmlFor={'phone-number-' + index}>Number</Label><Input id={'phone-number-' + index} type="tel" value={item.number} minLength={item.number ? 3 : undefined} maxLength={80} disabled={save.isPending} onChange={(event) => setAdditionalPhones((items) => items.map((value, row) => row === index ? { ...value, number: event.target.value } : value))} /></div><Button type="button" variant="ghost" size="icon" aria-label={'Remove additional phone ' + (index + 1)} disabled={save.isPending} onClick={() => setAdditionalPhones((items) => items.filter((_, row) => row !== index))}><X className="h-4 w-4" /></Button></div>)}
      {additionalPhones.length < 5 ? <Button type="button" variant="ghost" className="h-9 px-0 text-xs" disabled={save.isPending} onClick={() => setAdditionalPhones((items) => [...items, { label: 'Mobile', number: '' }])}>Add another phone number</Button> : null}
      {save.isError ? <p role="alert" className="text-sm text-amber-800">Contact was not saved. {save.error instanceof Error ? save.error.message : 'Try again.'}</p> : null}
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" disabled={(!contact?.isPrimary && !name.trim()) || save.isPending}>{save.isPending ? 'Saving...' : 'Save contact'}</Button></div>
    </form>
  </DialogContent></Dialog>
}
