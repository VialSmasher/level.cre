export type MobileCallOutcome =
  | 'attempted'
  | 'contacted'
  | 'no_answer'
  | 'left_message'
  | 'scheduled_meeting'
  | 'not_interested'
  | 'follow_up_later'

export type MobileCallSession = {
  brokerId: string
  clientEventId: string
  prospectId: string
  expectedPhone: string
  startedAt: string
  recorded: boolean
  candidate: CallQueueCandidate
  contactId?: string | null
  contactSnapshot?: CallingContact | null
  afterConfirmation?: 'next_company' | 'another_contact'
  nextContactId?: string | null
  confirmation?: { outcome: MobileCallOutcome; notes: string; nextFollowUp?: string | null }
}

export type CallingContact = {
  id: string; prospectId: string; isPrimary: boolean
  name: string | null; company: string | null; email: string | null; phone: string | null
  additionalPhones: Array<{ label: string; number: string }>
  title: string | null; archivedAt: string | null
}

export type CallingActivity = {
  id: string; type: string; outcome: string; occurredAt: string; notes: string
  contactId: string | null; contactName: string | null; phoneSnapshot: string | null
}

export type CallingWorkspace = {
  prospect: CallQueueCandidate['prospect'] & {
    notes: string | null; buildingSf: number | null; lotSizeAcres: number | null
    aiMetadata: unknown; websiteUrl: string | null
  }
  contacts: CallingContact[]
  primaryContactId: string | null
  activity: CallingActivity[]
  unattributedActivityCount: number
}

export type CallQueueCandidate = {
  id: string
  priorityScore: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  reasons: string[]
  contact: { name: string | null; company: string | null; phone: string; email: string | null }
  prospect: {
    id: string; name: string; status: string; address: string | null
    businessName: string | null; followUpDueDate: string | null; lastContactDate: string | null
  }
  listingTitles: string[]
  recentActivity: Array<{ id: string; type: string; outcome: string; occurredAt: string; notes: string }>
}

export type CallingProgress = { startedToday: number; confirmedToday: number; connectedToday: number }

export type PendingCallSession = {
  clientEventId: string; prospectId: string; phoneSnapshot: string; callStartedAt: string
  eventId: string; candidate: CallQueueCandidate
  contactId?: string | null; contactSnapshot?: CallingContact | null
}

export type CallQueueResponse = {
  generatedAt: string; rows: CallQueueCandidate[]; total: number; totalEligible: number
  progress: CallingProgress; pendingSessions: PendingCallSession[]
}

export function callSessionStorageKey(brokerId: string) {
  return `level-cre-active-call:v2:${brokerId}`
}

export type NextCallStep = 'tomorrow' | '3d' | '1w' | '1m' | 'none'

function atNoonUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0)).toISOString()
}

export function nextCallFollowUpIso(step: NextCallStep, now = new Date()) {
  if (step === 'none') return null
  const brokerDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const next = new Date(`${brokerDate}T12:00:00.000Z`)
  if (step === 'tomorrow') next.setUTCDate(next.getUTCDate() + 1)
  if (step === '3d') next.setUTCDate(next.getUTCDate() + 3)
  if (step === '1w') next.setUTCDate(next.getUTCDate() + 7)
  if (step === '1m') {
    const day = next.getUTCDate()
    next.setUTCMonth(next.getUTCMonth() + 1)
    if (next.getUTCDate() < day) next.setUTCDate(0)
  }
  return atNoonUtc(next)
}

export function buildTelHref(phone: string) {
  // Display extensions on the card; do not accidentally append them to the number.
  const parts = phone.trim().split(/\s*(?:extension|ext\.?|x|;ext=|[,;#])\s*/i)
  if (parts.length > 2 || (parts[1] && /\D/.test(parts[1]))) return null
  const mainNumber = parts[0]
  if (!/^[+\d\s().-]+$/.test(mainNumber)) return null
  const dialable = mainNumber.replace(/[\s().-]/g, '')
  return /^\+?\d{7,15}$/.test(dialable) ? `tel:${dialable}` : null
}

export function contactPhoneOptions(contact: CallingContact) {
  const seen = new Set<string>()
  return [
    ...(contact.phone ? [{ label: 'Main', number: contact.phone }] : []),
    ...(contact.additionalPhones || []),
  ].filter((option) => {
    if (!option.number || seen.has(option.number)) return false
    seen.add(option.number)
    return true
  }).map((option) => ({ ...option, href: buildTelHref(option.number) }))
}

export function brokerCallDate(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date(value))
}

export function nextUncalledContact(contacts: CallingContact[], currentId: string | null | undefined, activity: CallingActivity[], completed = new Set<string>(), now = new Date()) {
  const called = new Set(completed)
  for (const item of activity) {
    if (item.type === 'call' && item.contactId && brokerCallDate(item.occurredAt) === brokerCallDate(now)) called.add(item.contactId)
  }
  return contacts.find((contact) => !contact.archivedAt && contact.id !== currentId && !called.has(contact.id) && contactPhoneOptions(contact).some((phone) => phone.href)) || null
}

export function parseStoredCallSession(value: string | null, brokerId: string): MobileCallSession | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<MobileCallSession>
    if (parsed.brokerId !== brokerId || !brokerId) return null
    if (typeof parsed.clientEventId !== 'string' || typeof parsed.prospectId !== 'string'
      || typeof parsed.expectedPhone !== 'string' || typeof parsed.startedAt !== 'string') return null
    if (!parsed.clientEventId || !parsed.prospectId || !buildTelHref(parsed.expectedPhone)) return null
    if (!Number.isFinite(new Date(parsed.startedAt).getTime())) return null
    if (typeof parsed.recorded !== 'boolean' || parsed.candidate?.prospect?.id !== parsed.prospectId) return null
    if (typeof parsed.candidate.prospect.name !== 'string') return null
    if (!parsed.candidate.contact || typeof parsed.candidate.contact.phone !== 'string'
      || !Array.isArray(parsed.candidate.reasons) || !Array.isArray(parsed.candidate.recentActivity)
      || !Array.isArray(parsed.candidate.listingTitles)) return null
    if (parsed.candidate.reasons.some((reason) => typeof reason !== 'string')
      || parsed.candidate.recentActivity.some((activity) => !activity || typeof activity.notes !== 'string' || typeof activity.outcome !== 'string')) return null
    if (parsed.confirmation && (!['attempted', 'contacted', 'no_answer', 'left_message', 'scheduled_meeting', 'not_interested', 'follow_up_later'].includes(parsed.confirmation.outcome)
      || typeof parsed.confirmation.notes !== 'string')) return null
    if (parsed.contactId !== undefined && parsed.contactId !== null && (typeof parsed.contactId !== 'string' || !parsed.contactId)) return null
    if (parsed.contactId && !parsed.contactSnapshot) return null
    if (parsed.contactSnapshot) {
      const contact = parsed.contactSnapshot
      if (contact.id !== parsed.contactId || contact.prospectId !== parsed.prospectId || !Array.isArray(contact.additionalPhones)
        || contact.additionalPhones.some((phone) => typeof phone.label !== 'string' || typeof phone.number !== 'string')
        || !contactPhoneOptions(contact).some((phone) => phone.number === parsed.expectedPhone)) return null
    }
    if (parsed.afterConfirmation !== undefined && !['next_company', 'another_contact'].includes(parsed.afterConfirmation)) return null
    if (parsed.nextContactId !== undefined && parsed.nextContactId !== null && typeof parsed.nextContactId !== 'string') return null
    return parsed as MobileCallSession
  } catch {
    return null
  }
}
