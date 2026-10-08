import type { CallingActivity } from './mobileCalling'

function activityDate(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00Z' : value).getTime()
}

/** Imported history may arrive out of order; internal notes are not contact touches. */
export function latestCallingTouch(rows: CallingActivity[]): CallingActivity | null {
  return rows.reduce<CallingActivity | null>((latest, item) => {
    if (!['email', 'call', 'meeting'].includes(item.type) || item.direction === 'internal'
      || (item.evidenceStatus && item.evidenceStatus !== 'confirmed')
      || ['started', 'discarded', 'drafted', 'draft', 'queued', 'submitted', 'uncertain'].includes(item.outcome)
      || !Number.isFinite(activityDate(item.occurredAt))) return latest
    return !latest || activityDate(item.occurredAt) > activityDate(latest.occurredAt) ? item : latest
  }, null)
}

export function callingTouchContext(contactRows: CallingActivity[], accountRows: CallingActivity[], contactId: string | null) {
  const contact = contactId ? latestCallingTouch(contactRows.filter((row) => row.contactId === contactId)) : null
  if (contact) return { scope: 'contact' as const, activity: contact }
  const account = latestCallingTouch(accountRows)
  return account ? { scope: 'account' as const, activity: account } : null
}

export function callingTouchLabel(activity: CallingActivity) {
  if (activity.type === 'email') return activity.evidenceStatus === 'confirmed'
    ? activity.direction === 'outbound' ? 'Email sent' : activity.direction === 'inbound' ? 'Email received' : 'Email recorded'
    : 'Email recorded'
  if (activity.type === 'meeting') return 'Meeting recorded'
  const labels: Record<string, string> = { attempted: 'Call attempted', contacted: 'Conversation', no_answer: 'No answer', left_message: 'Voicemail', wrong_number: 'Wrong number', disconnected: 'Disconnected', scheduled_meeting: 'Meeting scheduled', follow_up_later: 'Follow-up requested', not_interested: 'Not interested' }
  return labels[activity.outcome] || 'Call recorded'
}

export function callingTouchNote(activity: CallingActivity) {
  const text = (activity.type === 'email' && activity.subject?.trim() ? activity.subject : activity.notes || '').replace(/\s+/g, ' ').trim()
  return text.length > 200 ? text.slice(0, 197).trimEnd() + '…' : text
}
