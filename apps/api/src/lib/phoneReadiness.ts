/** Pure, shared server truth for one explicit phone choice and its broker-reported availability. */
export const phoneText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const nameKey = (value: unknown) => (phoneText(value) || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
export function contactIdentityKey(contact: Record<string, any>): string {
  const name = nameKey(Object.prototype.hasOwnProperty.call(contact,'contact_name') ? contact.contact_name : contact.name);
  const email = (phoneText(Object.prototype.hasOwnProperty.call(contact,'contact_email') ? contact.contact_email : contact.email) || '').toLowerCase();
  return JSON.stringify(name || email ? { name, email } : { phone: (phoneText(Object.prototype.hasOwnProperty.call(contact,'contact_phone') ? contact.contact_phone : contact.phone) || '').replace(/\s|[()+.\-]/g, '').toLowerCase() });
}
export function parseBusinessPhone(value: unknown) {
  const text = phoneText(value);
  if (!text || text.length > 80 || /[\r\n]/.test(text)) return null;
  const match = /^([+\d\s().-]+?)(?:\s*(?:extension|ext\.?|x|#|;ext=|[,;])\s*(\d{1,8}))?$/i.exec(text);
  if (!match || !/^\+?\d+$/.test(match[1].replace(/[\s().-]/g, ''))) return null;
  const digits = match[1].replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  const extension = match[2] || '';
  const baseKey = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const dialDigits = digits.length === 10 ? `1${digits}` : digits;
  return { number: match[1].trim() + (extension ? ` ext ${extension}` : ''), phoneKey: `${baseKey}:${extension}`, dialHref: `tel:+${dialDigits}`, extension };
}
export function normalizeBusinessPhone(value: unknown): string | null { return parseBusinessPhone(value)?.number || null; }
export function businessPhoneKey(value: unknown): string | null { return parseBusinessPhone(value)?.phoneKey || null; }
export type PhoneChoice = { contactId: string | null; contactName: string | null; identityKey: string; isPrimary: boolean; phoneKey: string; number: string; label: string; dialHref: string };
export type PhoneBlock = { contactId: string | null; identityKey: string; phoneKey: string; number: string; reason: 'wrong_number' | 'disconnected'; eventId: string; recordedAt: string };
export type PhoneResearchStatus = { status: 'not_found' | 'conflicting' | 'identity_unclear' | 'access_blocked'; attemptedAt: string; retryAt: string; notes?: string; targetKey?: string; requestToken?: string; retryAfterDays?: number };
export type PhoneReadiness = { status: 'ready' | 'needs_number'; reason: 'usable_phone' | 'no_number' | 'invalid_phone' | 'reported_bad_number' | 'metadata_conflict'; usableChoices: PhoneChoice[]; blockedChoices: Array<PhoneChoice & { reason: PhoneBlock['reason'] }>; preferredContactId: string | null; preferredPhoneKey: string | null; lastResearch: PhoneResearchStatus | null; researchEligible: boolean };
export function readPhoneReadinessMetadata(prospect: Record<string, any>) {
  const metadata = prospect.ai_metadata;
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) return null;
  const state = metadata?.phoneReadiness;
  if (state == null) return { version: 1, blocks: [] as PhoneBlock[], research: null as PhoneResearchStatus | null };
  if (typeof state !== 'object' || Array.isArray(state) || !Array.isArray(state.blocks || [])) return null;
  const blocks = state.blocks || [];
  if (blocks.some((row: any) => !row || typeof row !== 'object' || !['wrong_number', 'disconnected'].includes(row.reason) || typeof row.phoneKey !== 'string' || typeof row.identityKey !== 'string')) return null;
  const research = state.research || null;
  if (research && (!['not_found', 'conflicting', 'identity_unclear', 'access_blocked'].includes(research.status) || !Number.isFinite(Date.parse(research.attemptedAt)) || !Number.isFinite(Date.parse(research.retryAt)))) return null;
  return { version: 1, blocks: blocks as PhoneBlock[], research: research as PhoneResearchStatus | null };
}
export function isPhoneBlocked(prospect: Record<string, any>, contact: Record<string, any>, number: unknown): boolean {
  const state = readPhoneReadinessMetadata(prospect);
  const key = businessPhoneKey(number);
  const identity = contactIdentityKey(contact);
  return !state || Boolean(key && state.blocks.some((row) => row.phoneKey === key && ((contact.id && row.contactId === contact.id) || row.identityKey === identity)));
}
export function phoneReadinessTargetKey(prospect: Record<string, any>, contacts: Array<Record<string, any>>) {
  return JSON.stringify({ name: prospect.name || null, businessName: prospect.business_name || null, status: prospect.status || null, contactName: prospect.contact_name || null, email: prospect.contact_email || null, phone: prospect.contact_phone || null, company: prospect.contact_company || null,
    contacts: contacts.filter(row => !(row.archived_at ?? row.archivedAt)).map(row => ({ id: row.id, isPrimary: Boolean(row.is_primary ?? row.isPrimary), name: row.name || null, email: row.email || null, company: row.company || null, phone: row.phone || null, additionalPhones: row.additional_phones ?? row.additionalPhones ?? [] })).sort((a,b) => a.id.localeCompare(b.id)),
    blocks: readPhoneReadinessMetadata(prospect)?.blocks || null });
}
export function publicPhoneResearchStatus(research: PhoneResearchStatus | null): PhoneResearchStatus | null {
  return research ? { status: research.status, attemptedAt: research.attemptedAt, retryAt: research.retryAt, ...(research.notes ? { notes: research.notes } : {}) } : null;
}
export function derivePhoneReadiness(prospect: Record<string, any>, contacts: Array<Record<string, any>>, options: { now?: Date; pendingCall?: boolean } = {}): PhoneReadiness {
  const state = readPhoneReadinessMetadata(prospect);
  const identity = contactIdentityKey(prospect);
  const active = contacts.filter((row) => !(row.archivedAt ?? row.archived_at));
  const primary = active.find((row) => (row.isPrimary ?? row.is_primary) && (row.identity_key || contactIdentityKey(row)) === identity);
  const projected = { ...primary, id: primary?.id || null, name: prospect.contact_name, email: prospect.contact_email, phone: prospect.contact_phone, isPrimary: true, identity_key: identity };
  const sources: Array<Record<string, any>> = [projected, ...active.filter((row) => !(row.isPrimary ?? row.is_primary))];
  const usableChoices: PhoneChoice[] = []; const blockedChoices: PhoneReadiness['blockedChoices'] = [];
  let provided = 0;
  for (const contact of sources) {
    const additional = contact.additionalPhones ?? contact.additional_phones;
    const raw = [{ label: 'Main', number: contact.phone }, ...(Array.isArray(additional) ? additional : [])];
    const seen = new Set<string>();
    for (const item of raw) {
      if (phoneText(item?.number)) provided++;
      const parsed = parseBusinessPhone(item?.number); if (!parsed || seen.has(parsed.phoneKey)) continue;
      seen.add(parsed.phoneKey);
      const choice: PhoneChoice = { contactId: contact.id || null, contactName: phoneText(contact.name), identityKey: contactIdentityKey(contact), isPrimary: Boolean(contact.isPrimary ?? contact.is_primary), phoneKey: parsed.phoneKey, number: parsed.number, label: phoneText(item.label) || 'Phone', dialHref: parsed.dialHref };
      const block = state?.blocks.find((row) => row.phoneKey === choice.phoneKey && ((choice.contactId && row.contactId === choice.contactId) || row.identityKey === choice.identityKey));
      if (block) blockedChoices.push({ ...choice, reason: block.reason }); else if (state) usableChoices.push(choice);
    }
  }
  const ready = usableChoices.length > 0;
  const research = state?.research?.targetKey === phoneReadinessTargetKey(prospect, contacts) ? state.research : null;
  return { status: ready ? 'ready' : 'needs_number', reason: !state ? 'metadata_conflict' : ready ? 'usable_phone' : blockedChoices.length ? 'reported_bad_number' : provided ? 'invalid_phone' : 'no_number', usableChoices, blockedChoices, preferredContactId: usableChoices[0]?.contactId || null, preferredPhoneKey: usableChoices[0]?.phoneKey || null, lastResearch: publicPhoneResearchStatus(research), researchEligible: (!ready || blockedChoices.length > 0) && Boolean(state) && !options.pendingCall && (!research || Date.parse(research.retryAt) <= (options.now || new Date()).getTime()) };
}
/** A company identity must be present; a civic address or generic property label is not an organization. */
export function researchCompanyName(prospect: Record<string, any>): string | null {
  for (const value of [prospect.business_name, prospect.contact_company, prospect.name]) {
    const name = phoneText(value);
    if (!name || !/[\p{L}]/u.test(name) || /^\s*\d/.test(name) || /^(?:property|building|warehouse|industrial|vacant(?: land)?|unknown|land|tenant|occupant)$/i.test(name)) continue;
    if (prospect.address && nameKey(name) === nameKey(prospect.address)) continue;
    return name;
  }
  return null;
}