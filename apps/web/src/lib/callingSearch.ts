import type { CallQueueCandidate, CallingContact, CallingWorkspace } from './mobileCalling'

export type CallingSearchRow = {
  companyName?: string | null
  prospect: Pick<CallQueueCandidate['prospect'], 'id' | 'name' | 'businessName' | 'address' | 'status'>
  contact: { id: string | null; isPrimary: boolean; name: string | null; company: string | null; email: string | null; phone: string | null; title: string | null; hasAdditionalPhones?: boolean }
}
export type CallingSearchResponse = { query: string; rows: CallingSearchRow[]; hasMore: boolean }
export const callingSearchQuery = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 120)
const identityText = (value: string | null) => (value || '').trim().toLowerCase()
const contactIdentity = (contact: { name: string | null; email: string | null; phone: string | null }) => {
  const name = (contact.name || '').trim().normalize('NFKC').toLowerCase().replace(new RegExp("[\\p{P}\\p{Z}\\s]+", 'gu'), ' ').trim()
  const email = identityText(contact.email)
  return JSON.stringify(name || email ? { name, email } : { phone: identityText(contact.phone).replace(/\s|[()+.\-]/g, '') })
}

/** Search is a preview. Resolve the exact saved person against a fresh workspace. */
export function resolveCallingSearchContact(row: CallingSearchRow, workspace: CallingWorkspace): CallingContact | null {
  if (row.prospect.id !== workspace.prospect.id || ['no_go', 'archived'].includes(workspace.prospect.status)) return null
  const contacts = workspace.contacts.filter((contact) => !contact.archivedAt && contact.prospectId === row.prospect.id)
  if (row.contact.id) return contacts.find((contact) => contact.id === row.contact.id && contact.isPrimary === row.contact.isPrimary) || null
  if (!row.contact.isPrimary) return null
  const primary = contacts.find((contact) => contact.id === workspace.primaryContactId && contact.isPrimary)
  if (!primary || contactIdentity(primary) !== contactIdentity(row.contact)) return null
  return primary
}

export function searchedCallingCandidate(workspace: CallingWorkspace, contact: CallingContact): CallQueueCandidate {
  return { id: 'call:' + workspace.prospect.id, prospect: workspace.prospect,
    contact: { name: contact.name, company: workspace.prospect.businessName || workspace.contacts.find((person) => person.id === workspace.primaryContactId && person.isPrimary && !person.archivedAt)?.company || workspace.prospect.name,
      email: contact.email, phone: contact.phone || '' },
    priorityScore: 0, priority: 'medium', reasons: ['Selected from search'], listingTitles: [],
    recentActivity: workspace.activity, phoneReadiness: workspace.phoneReadiness }
}
