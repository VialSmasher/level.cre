export type MobileCallOutcome =
  | 'attempted'
  | 'contacted'
  | 'no_answer'
  | 'left_message'
  | 'scheduled_meeting'
  | 'not_interested'
  | 'follow_up_later'
  | 'wrong_number'
  | 'disconnected'

export type MobileCallSession = {
  brokerId: string
  origin?: 'calls' | 'map'
  clientEventId: string
  prospectId: string
  expectedPhone: string
  phoneKey?: string
  startedAt: string
  recorded: boolean
  candidate: CallQueueCandidate
  contactId?: string | null
  contactSnapshot?: CallingContact | null
  afterConfirmation?: 'next_company' | 'another_contact'
  nextContactId?: string | null
  nextPhoneKey?: string | null
  confirmation?: { outcome: MobileCallOutcome; notes: string; nextFollowUp?: string | null }
}

export type CallConfirmationContinuation = {
  afterConfirmation?: 'next_company' | 'another_contact'
  nextContactId?: string | null
  nextPhoneKey?: string | null
}

/** Freeze the exact owned workspace choice before native link activation. */
export function createMobileCallSession(
  brokerId: string, candidate: CallQueueCandidate, contact: CallingContact, choice: CallingPhoneChoice,
  identity = { clientEventId: `call-${crypto.randomUUID()}`, startedAt: new Date().toISOString() },
): MobileCallSession | null {
  if (!brokerId || contact.archivedAt || contact.prospectId !== candidate.prospect.id || choice.contactId !== contact.id) return null
  const usable = candidate.phoneReadiness?.usableChoices.find((option) => option.contactId === contact.id
    && option.phoneKey === choice.phoneKey && option.number === choice.number && option.dialHref === choice.dialHref)
  if (!usable?.dialHref) return null
  return {
    brokerId, ...identity, prospectId: candidate.prospect.id,
    expectedPhone: usable.number, phoneKey: usable.phoneKey, recorded: false,
    candidate: structuredClone(candidate), contactId: contact.id, contactSnapshot: structuredClone(contact),
  }
}

/** Retries preserve the first confirmation and its continuation, even across views. */
export function freezeCallConfirmation(
  session: MobileCallSession, confirmation: NonNullable<MobileCallSession['confirmation']>,
  continuation?: CallConfirmationContinuation,
): MobileCallSession {
  if (session.confirmation) return session
  return {
    ...session, origin: continuation ? 'calls' : 'map', confirmation: { ...confirmation },
    afterConfirmation: continuation?.afterConfirmation || 'next_company',
    nextContactId: continuation?.nextContactId || null,
    nextPhoneKey: continuation?.nextPhoneKey || null,
  }
}
export type PhoneIssueOutcome = 'wrong_number' | 'disconnected'

export type CallingPhoneChoice = {
  contactId: string | null; contactName: string | null; phoneKey: string
  number: string; label: string; dialHref: string; isPrimary: boolean
}
export type CallingPhoneReadiness = {
  status: 'ready' | 'needs_number'; reason: string
  usableChoices: CallingPhoneChoice[]
  blockedChoices: Array<CallingPhoneChoice & { reason: PhoneIssueOutcome }>
  preferredContactId: string | null; preferredPhoneKey: string | null
  lastResearch: {
    status: 'not_found' | 'conflicting' | 'identity_unclear' | 'access_blocked'
    attemptedAt: string; retryAt: string | null; notes?: string | null
  } | null
  researchEligible: boolean
}
export type NeedsNumberRow = {
  prospect: CallQueueCandidate['prospect']
  company: string; contactName: string | null
  priorityScore: number; priority: CallQueueCandidate['priority']; reasons: string[]
  phoneReadiness: CallingPhoneReadiness; pendingCall: boolean
  expectedSnapshotToken: string
}
export type NeedsNumberResponse = { rows: NeedsNumberRow[]; total: number; eligibleNow: number }

export function phoneIssueLabel(reason: PhoneIssueOutcome) {
  return reason === 'disconnected' ? 'Disconnected' : 'Wrong number'
}

export function isPhoneIssueOutcome(outcome: MobileCallOutcome): outcome is PhoneIssueOutcome {
  return outcome === 'wrong_number' || outcome === 'disconnected'
}

export function preferredCallingChoice(readiness: CallingPhoneReadiness | null | undefined, contactId?: string | null) {
  const choices = readiness?.usableChoices || []
  return choices.find((choice) => (contactId === undefined || choice.contactId === contactId)
    && choice.phoneKey === readiness?.preferredPhoneKey)
    || choices.find((choice) => contactId === undefined || choice.contactId === contactId) || null
}

/** The server decides usability; this only chooses among its supplied options. */
export function nextCallingChoice(readiness: CallingPhoneReadiness | null | undefined, current: { contactId?: string | null; phoneKey?: string; expectedPhone: string }, excludedContacts = new Set<string>()) {
  const choices = (readiness?.usableChoices || []).filter((choice) => !(choice.contactId === (current.contactId || null)
    && (current.phoneKey ? choice.phoneKey === current.phoneKey : choice.number === current.expectedPhone)))
  return choices.find((choice) => choice.contactId === current.contactId)
    || choices.find((choice) => !choice.contactId || !excludedContacts.has(choice.contactId)) || null
}

/** Optimistic removal is allowed only after the API has confirmed this feedback. */
export function blockConfirmedPhone(readiness: CallingPhoneReadiness, current: { contactId?: string | null; phoneKey?: string; expectedPhone: string }, reason: PhoneIssueOutcome): CallingPhoneReadiness {
  const matches = (choice: CallingPhoneChoice) => choice.contactId === (current.contactId || null)
    && (current.phoneKey ? choice.phoneKey === current.phoneKey : choice.number === current.expectedPhone)
  const blocked = readiness.usableChoices.find(matches) || readiness.blockedChoices.find(matches)
  const usableChoices = readiness.usableChoices.filter((choice) => !matches(choice))
  const next = usableChoices.find((choice) => choice.contactId === readiness.preferredContactId && choice.phoneKey === readiness.preferredPhoneKey) || usableChoices[0]
  return { ...readiness, usableChoices, blockedChoices: [...readiness.blockedChoices.filter((choice) => !matches(choice)), ...(blocked ? [{ ...blocked, reason }] : [])],
    status: usableChoices.length ? 'ready' : 'needs_number', reason: usableChoices.length ? readiness.reason : 'reported_bad_number',
    preferredContactId: next?.contactId || null, preferredPhoneKey: next?.phoneKey || null }
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
  phoneReadiness?: CallingPhoneReadiness
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
  phoneReadiness?: CallingPhoneReadiness
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

/** Identity comparison only. Server readiness remains the authority for dialing. */
export function callingPhoneKey(number: string): string | null {
  const match = /^([+\d\s().-]+?)(?:\s*(?:extension|ext\.?|x|#|;ext=|[,;])\s*(\d{1,8}))?$/i.exec(number.trim())
  if (!match || number.length > 80 || /[\r\n]/.test(number) || !/^\+?\d+$/.test(match[1].replace(/[\s().-]/g, ''))) return null
  const digits = match[1].replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return `${digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits}:${match[2] || ''}`
}

/** Recover the frozen server target without depending on a current contact edit. */
export function restorePendingCallSession(brokerId: string, pending: PendingCallSession): MobileCallSession {
  const candidate = structuredClone(pending.candidate)
  candidate.contact.phone = typeof candidate.contact.phone === 'string' ? candidate.contact.phone : ''
  candidate.prospect.name = candidate.prospect.name || candidate.prospect.businessName || candidate.contact.company || 'Selected company'
  const contact = pending.contactSnapshot ? structuredClone(pending.contactSnapshot) : null
  const choice = candidate.phoneReadiness?.usableChoices.find((option) => (option.contactId === (pending.contactId || null)
    || (!option.contactId && contact?.isPrimary)) && option.number === pending.phoneSnapshot)
  const key = callingPhoneKey(pending.phoneSnapshot)
  const matchesFrozenPhone = key && contact && [contact.phone, ...contact.additionalPhones.map((option) => option.number)]
    .some((number) => number && callingPhoneKey(number) === key)
  return {
    brokerId, origin: 'map', clientEventId: pending.clientEventId, prospectId: pending.prospectId,
    expectedPhone: pending.phoneSnapshot, startedAt: pending.callStartedAt, recorded: true,
    candidate, contactId: pending.contactId, contactSnapshot: contact,
    ...(choice || matchesFrozenPhone ? { phoneKey: choice?.phoneKey || key! } : {}),
  }
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

export function contactPhoneOptions(contact: CallingContact, readiness?: CallingPhoneReadiness | null) {
  const seen = new Set<string>()
  const saved = [
    ...(contact.phone ? [{ label: 'Main', number: contact.phone }] : []),
    ...(contact.additionalPhones || []),
  ].filter((option) => {
    if (!option.number || seen.has(option.number)) return false
    seen.add(option.number)
    return true
  })
  if (readiness === undefined) return saved.map((option) => ({ ...option, phoneKey: option.number, href: buildTelHref(option.number), blockedReason: undefined as PhoneIssueOutcome | undefined }))
  const belongs = (choice: CallingPhoneChoice) => choice.contactId === contact.id || (!choice.contactId && contact.isPrimary)
  const supplied = [
    ...(readiness?.usableChoices || []).filter(belongs).map((choice) => ({ label: choice.label, number: choice.number, phoneKey: choice.phoneKey, href: choice.dialHref, blockedReason: undefined as PhoneIssueOutcome | undefined })),
    ...(readiness?.blockedChoices || []).filter(belongs).map((choice) => ({ label: choice.label, number: choice.number, phoneKey: choice.phoneKey, href: null, blockedReason: choice.reason })),
  ]
  return [...supplied, ...saved.filter((option) => !supplied.some((choice) => choice.number === option.number)).map((option) => ({ ...option, phoneKey: option.number, href: null, blockedReason: undefined as PhoneIssueOutcome | undefined }))]
}

export function brokerCallDate(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date(value))
}

export function nextUncalledContact(contacts: CallingContact[], currentId: string | null | undefined, activity: CallingActivity[], completed = new Set<string>(), now = new Date(), readiness?: CallingPhoneReadiness | null) {
  const called = new Set(completed)
  for (const item of activity) {
    if (item.type === 'call' && item.contactId && brokerCallDate(item.occurredAt) === brokerCallDate(now)) called.add(item.contactId)
  }
  return contacts.find((contact) => !contact.archivedAt && contact.id !== currentId && !called.has(contact.id) && contactPhoneOptions(contact, readiness).some((phone) => phone.href)) || null
}

export function parseStoredCallSession(value: string | null, brokerId: string): MobileCallSession | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<MobileCallSession>
    if (parsed.brokerId !== brokerId || !brokerId) return null
    if (parsed.origin !== undefined && !['calls', 'map'].includes(parsed.origin)) return null
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
    if (parsed.confirmation && (!['attempted', 'contacted', 'no_answer', 'left_message', 'scheduled_meeting', 'not_interested', 'follow_up_later', 'wrong_number', 'disconnected'].includes(parsed.confirmation.outcome)
      || typeof parsed.confirmation.notes !== 'string')) return null
    if (parsed.contactId !== undefined && parsed.contactId !== null && (typeof parsed.contactId !== 'string' || !parsed.contactId)) return null
    if (parsed.contactId && !parsed.contactSnapshot) return null
    if (parsed.contactSnapshot) {
      const contact = parsed.contactSnapshot
      const frozenChoice = parsed.candidate.phoneReadiness?.usableChoices.find((choice) => (choice.contactId === contact.id || (!choice.contactId && contact.isPrimary)) && choice.phoneKey === parsed.phoneKey && choice.number === parsed.expectedPhone)
      if (contact.id !== parsed.contactId || contact.prospectId !== parsed.prospectId || !Array.isArray(contact.additionalPhones)
        || contact.additionalPhones.some((phone) => typeof phone.label !== 'string' || typeof phone.number !== 'string')
        || (!frozenChoice && !contactPhoneOptions(contact).some((phone) => phone.number === parsed.expectedPhone
          || Boolean(callingPhoneKey(parsed.expectedPhone!) && callingPhoneKey(phone.number) === callingPhoneKey(parsed.expectedPhone!))))) return null
    }
    if (parsed.afterConfirmation !== undefined && !['next_company', 'another_contact'].includes(parsed.afterConfirmation)) return null
    if (parsed.nextContactId !== undefined && parsed.nextContactId !== null && typeof parsed.nextContactId !== 'string') return null
    if (parsed.phoneKey !== undefined && typeof parsed.phoneKey !== 'string') return null
    if (parsed.nextPhoneKey !== undefined && parsed.nextPhoneKey !== null && typeof parsed.nextPhoneKey !== 'string') return null
    return parsed as MobileCallSession
  } catch {
    return null
  }
}
