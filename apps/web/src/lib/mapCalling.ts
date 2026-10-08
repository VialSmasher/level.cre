import type { CallingContact, CallingPhoneChoice, CallingWorkspace, CallQueueCandidate } from '@/lib/mobileCalling'
import { buildTelHref, preferredCallingChoice } from '@/lib/mobileCalling'

export type MapPhoneEntry = {
  prospectId: string; contactId?: string; contactName?: string | null; email?: string | null; company: string | null
  contactPhone: string
  expectedContact: { name: string | null; email: string | null; phone: string | null }
  phoneEvidence: { kind: 'contact_direct' | 'company_main'; source: 'broker_confirmed'; observedAt: string; verified: true }
}

export function mapPhoneKey(number: string): string | null {
  const match = /^([+\d\s().-]+?)(?:\s*(?:extension|ext\.?|x|#|;ext=|[,;])\s*(\d{1,8}))?$/i.exec(number.trim())
  if (!match || /[\r\n]/.test(number) || !/^\+?\d+$/.test(match[1].replace(/[\s().-]/g, ''))) return null
  const digits = match[1].replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return `${digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits}:${match[2] || ''}`
}

export function mapCompanyName(workspace: CallingWorkspace) {
  return workspace.prospect.businessName || workspace.contacts.find((contact) => contact.isPrimary)?.company || workspace.prospect.name || 'Map prospect'
}

export function mapChoiceKey(choice: CallingPhoneChoice) {
  return `${choice.contactId || ''}:${choice.phoneKey}`
}

/** Missing email recipients require an explicit alternate selection. */
export function mapCallingChoice(workspace: CallingWorkspace | undefined, selectedKey = ''): CallingPhoneChoice | null {
  const readiness = workspace?.phoneReadiness
  const selected = readiness?.usableChoices.find((choice) => mapChoiceKey(choice) === selectedKey)
  return selected || (readiness?.status === 'ready' ? preferredCallingChoice(readiness) : null)
}

export function mapCallCandidate(workspace: CallingWorkspace, choice: CallingPhoneChoice): CallQueueCandidate {
  const target = workspace.contacts.find((contact) => contact.id === choice.contactId) || workspace.contacts.find((contact) => contact.isPrimary)
  return {
    id: workspace.prospect.id, priorityScore: 0, priority: 'medium', reasons: ['Selected from map'],
    prospect: { ...workspace.prospect, name: workspace.prospect.name || workspace.prospect.businessName || 'Map prospect' },
    contact: { name: target?.name || choice.contactName || null, company: mapCompanyName(workspace), phone: choice.number, phoneType: choice.phoneType, email: target?.email || null },
    listingTitles: [], recentActivity: workspace.activity.map(({ id, type, outcome, occurredAt, notes }) => ({ id, type, outcome, occurredAt, notes })),
    phoneReadiness: workspace.phoneReadiness,
  }
}

export function directMapContacts(workspace: CallingWorkspace): CallingContact[] {
  const nameKey = (value: string | null | undefined) => (value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim()
  return workspace.contacts.filter((contact) => {
    const name = nameKey(contact.name)
    return !contact.archivedAt && Boolean(name)
      && !/^(?:company (?:main line|switchboard)|main line|switchboard|reception|general (?:enquiries|inquiries)|office|contact|unknown)$/.test(name)
      && ![contact.company, workspace.prospect.businessName, workspace.prospect.name].some((company) => nameKey(company) === name)
      && !/\b(?:incorporated|inc|limited|ltd|llc|corporation|corp)\b/.test(name)
  })
}

/** Saved company lines are account context; only person choices establish dialing readiness. */
export function mapPhoneEntryMatchesWorkspace(workspace: CallingWorkspace, entry: MapPhoneEntry, contactId?: string): boolean {
  if (!contactId || workspace.prospect.id !== entry.prospectId) return false
  const phoneKey = mapPhoneKey(entry.contactPhone)
  if (!phoneKey) return false
  if (entry.phoneEvidence.kind === 'company_main') {
    const saved = workspace.contacts.find((contact) => contact.id === contactId && !contact.archivedAt
      && !contact.isPrimary && contact.name === 'Company main line')
    return Boolean(saved?.phone && mapPhoneKey(saved.phone) === phoneKey)
  }
  return entry.contactId === contactId && Boolean(workspace.phoneReadiness?.usableChoices.some((choice) => choice.contactId === contactId && choice.phoneKey === phoneKey))
}

export function buildMapPhoneEntry(workspace: CallingWorkspace, kind: MapPhoneEntry['phoneEvidence']['kind'], contactId: string, number: string, observedAt = new Date().toISOString()): MapPhoneEntry {
  const raw = number.trim()
  const href = buildTelHref(raw)
  if (!href || !mapPhoneKey(raw) || raw.length > 80) throw new Error('Enter one complete phone number, including its country code or extension if needed.')
  const primary = workspace.contacts.find((contact) => contact.isPrimary && !contact.archivedAt)
  const target = kind === 'company_main' ? primary : directMapContacts(workspace).find((contact) => contact.id === contactId)
  if (!target) throw new Error('Save a contact name first, or choose Company line.')
  return {
    prospectId: workspace.prospect.id,
    ...(kind === 'contact_direct' ? { contactId: target.id, contactName: target.name, email: target.email } : {}),
    company: kind === 'company_main' ? mapCompanyName(workspace) : target.company || null,
    contactPhone: raw, expectedContact: { name: target.name, email: target.email, phone: target.phone },
    phoneEvidence: { kind, source: 'broker_confirmed', observedAt, verified: true },
  }
}

export function mapPhoneSaveError(reason: string) {
  if (reason === 'pending_call') return 'Finish or undo the pending call before saving a number.'
  if (reason === 'reported_bad_phone') return 'This number was reported as wrong or disconnected. Enter a replacement number.'
  if (reason === 'stale_contact_snapshot') return 'This contact changed while you were editing. Reload the contact before saving.'
  if (reason.includes('conflict')) return 'This number needs review alongside the saved contact details. Open this company in Calls to review it.'
  if (reason === 'invalid_phone') return 'Enter one complete phone number.'
  return 'The number could not be saved. Reload this contact and try again.'
}
