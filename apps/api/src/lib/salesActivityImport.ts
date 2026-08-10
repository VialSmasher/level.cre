import { createHash } from 'crypto';

export const SALES_ACTIVITY_STATUSES = [
  'sent',
  'received',
  'hold',
  'draft',
  'research',
  'low_priority',
  'skipped',
  'error',
] as const;

export type SalesActivityStatus = typeof SALES_ACTIVITY_STATUSES[number];
export type SalesActivityType = 'email' | 'call' | 'meeting' | 'note';
export type SalesActivityDirection = 'inbound' | 'outbound' | 'internal';
export type SalesActivityMatchStatus = 'matched' | 'needs_review' | 'ignored';

export type NormalizedSalesActivity = {
  source: string;
  runId: string | null;
  externalActivityId: string;
  activityStatus: SalesActivityStatus;
  activityType: SalesActivityType;
  direction: SalesActivityDirection;
  contactName: string | null;
  company: string | null;
  email: string | null;
  emailDomain: string | null;
  subject: string | null;
  notes: string | null;
  activityAt: Date | null;
  prospectId: string | null;
  listingId: string | null;
  rawPayload: Record<string, unknown>;
};

export type SalesActivityDefaults = {
  source?: string | null;
  runId?: string | null;
};

const MAX_SALES_ACTIVITY_NOTE_LENGTH = 1000;

const STATUS_ALIASES: Record<string, SalesActivityStatus> = {
  sent: 'sent',
  send: 'sent',
  emailed: 'sent',
  delivered: 'sent',
  logged: 'sent',
  completed: 'sent',
  complete: 'sent',
  received: 'received',
  inbound: 'received',
  replied: 'received',
  reply: 'received',
  hold: 'hold',
  held: 'hold',
  defer: 'hold',
  deferred: 'hold',
  'no action': 'hold',
  'not a prospect': 'hold',
  draft: 'draft',
  drafted: 'draft',
  research: 'research',
  review: 'research',
  'needs review': 'research',
  'needs research': 'research',
  low: 'low_priority',
  'low priority': 'low_priority',
  'low-priority': 'low_priority',
  low_priority: 'low_priority',
  skip: 'skipped',
  skipped: 'skipped',
  ignore: 'skipped',
  ignored: 'skipped',
  error: 'error',
  failed: 'error',
  failure: 'error',
};

const ACTIVITY_TYPE_ALIASES: Record<string, SalesActivityType> = {
  email: 'email',
  emailed: 'email',
  mail: 'email',
  call: 'call',
  called: 'call',
  phone: 'call',
  meeting: 'meeting',
  met: 'meeting',
  note: 'note',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeShortNote(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.slice(0, MAX_SALES_ACTIVITY_NOTE_LENGTH) : null;
}

function getAlias(record: Record<string, unknown>, aliases: string[]): unknown {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

export function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeString(value)?.toLowerCase() ?? null;
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function extractEmailDomain(email: string | null): string | null {
  if (!email) return null;
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}

function normalizeSource(value: unknown): string {
  return normalizeString(value)?.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'codex_followup';
}

function normalizeStatus(value: unknown): SalesActivityStatus {
  const key = normalizeString(value)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
  return STATUS_ALIASES[key] ?? 'research';
}

function normalizeActivityType(value: unknown): SalesActivityType {
  const key = normalizeString(value)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
  return ACTIVITY_TYPE_ALIASES[key] ?? 'email';
}

function normalizeDirection(
  value: unknown,
  activityStatus: SalesActivityStatus,
  activityType: SalesActivityType,
): SalesActivityDirection {
  // Delivery status is the authoritative direction for confirmed email
  // evidence. A contradictory free-form direction must never turn received
  // mail into outbound production.
  if (activityStatus === 'received') return 'inbound';
  if (activityStatus === 'sent') return activityType === 'note' ? 'internal' : 'outbound';

  const normalized = normalizeString(value)?.toLowerCase().replace(/[^a-z]+/g, '_') || '';
  if (['inbound', 'incoming', 'received'].includes(normalized)) return 'inbound';
  if (['internal', 'note'].includes(normalized)) return 'internal';
  return 'outbound';
}

function parseActivityAt(value: unknown): Date | null {
  const text = normalizeString(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T12:00:00.000Z`);
  }
  const withMountainOffset = text
    .replace(/\bMDT\b/i, '-06:00')
    .replace(/\bMST\b/i, '-07:00');
  const parsed = new Date(withMountainOffset);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stableActivityId(activity: Omit<NormalizedSalesActivity, 'externalActivityId'>): string {
  const key = [
    activity.source,
    activity.activityType,
    activity.activityStatus,
    activity.email ?? '',
    activity.activityAt?.toISOString() ?? '',
    activity.subject ?? '',
    activity.contactName ?? '',
    activity.company ?? '',
  ];
  const hash = createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 24);
  return `sa_${hash}`;
}

export function normalizeSalesActivityInput(
  input: unknown,
  defaults: SalesActivityDefaults = {},
): NormalizedSalesActivity {
  if (!isRecord(input)) {
    throw new Error('Sales activity must be an object');
  }

  const source = normalizeSource(getAlias(input, ['source', 'Source']) ?? defaults.source);
  const runId = normalizeString(getAlias(input, ['runId', 'run_id', 'RunId', 'Run ID']) ?? defaults.runId);
  const activityStatus = normalizeStatus(getAlias(input, ['activityStatus', 'activity_status', 'status', 'Status']));
  const activityType = normalizeActivityType(getAlias(input, ['activityType', 'activity_type', 'type', 'Type']));
  const direction = normalizeDirection(
    getAlias(input, ['direction', 'Direction']),
    activityStatus,
    activityType,
  );
  const email = normalizeEmail(getAlias(input, ['email', 'Email', 'contactEmail', 'contact_email']));
  const partial: Omit<NormalizedSalesActivity, 'externalActivityId'> = {
    source,
    runId,
    activityStatus,
    activityType,
    direction,
    contactName: normalizeString(getAlias(input, ['contactName', 'contact_name', 'contact', 'Contact', 'DisplayName'])),
    company: normalizeString(getAlias(input, ['company', 'Company', 'contactCompany', 'contact_company'])),
    email,
    emailDomain: extractEmailDomain(email),
    subject: normalizeString(getAlias(input, ['subject', 'Subject'])),
    notes: normalizeShortNote(getAlias(input, ['notes', 'Notes', 'note', 'Note'])),
    activityAt: parseActivityAt(getAlias(input, ['activityAt', 'activity_at', 'timestamp_mdt', 'timestampMdt', 'date', 'Date'])),
    prospectId: normalizeString(getAlias(input, ['prospectId', 'prospect_id'])),
    listingId: normalizeString(getAlias(input, ['listingId', 'listing_id'])),
    rawPayload: {},
  };

  const explicitId = normalizeString(getAlias(input, [
    'externalActivityId',
    'external_activity_id',
    'activityId',
    'activity_id',
    'id',
    'Id',
  ]));

  const externalActivityId = explicitId || stableActivityId(partial);

  return {
    ...partial,
    externalActivityId,
    // The activity bridge intentionally stores metadata only. Outlook message
    // bodies, HTML, snippets, and attachments do not belong in Level CRE.
    rawPayload: {
      source,
      runId,
      externalActivityId,
      activityStatus,
      activityType,
      direction: partial.direction,
      contactName: partial.contactName,
      company: partial.company,
      email: partial.email,
      subject: partial.subject,
      notes: partial.notes,
      activityAt: partial.activityAt?.toISOString() ?? null,
      prospectId: partial.prospectId,
      listingId: partial.listingId,
    },
  };
}

export function shouldCreateInteractionFromSalesActivity(activity: NormalizedSalesActivity): boolean {
  return activity.activityStatus === 'sent'
    || (activity.activityStatus === 'received' && activity.activityType === 'email');
}

export function decideSalesActivityMatch(
  activity: NormalizedSalesActivity,
  prospectId: string | null,
  matchReason: string | null,
): { matchStatus: SalesActivityMatchStatus; matchReason: string; confidence: number } {
  if (activity.activityStatus === 'received') {
    if (activity.activityType !== 'email') {
      return {
        matchStatus: 'needs_review',
        matchReason: 'unsupported_received_activity',
        confidence: 0,
      };
    }
    if (!prospectId) {
      return {
        matchStatus: 'needs_review',
        matchReason: matchReason || 'no_confident_prospect_match',
        confidence: 0,
      };
    }
    return {
      matchStatus: 'matched',
      matchReason: matchReason || 'matched_existing_prospect',
      confidence: matchReason === 'provided_prospect_id' || matchReason === 'exact_contact_email' ? 100 : 95,
    };
  }

  if (!shouldCreateInteractionFromSalesActivity(activity)) {
    const ignored = activity.activityStatus === 'hold'
      || activity.activityStatus === 'low_priority'
      || activity.activityStatus === 'skipped';
    return {
      matchStatus: ignored ? 'ignored' : 'needs_review',
      matchReason: `status_${activity.activityStatus}`,
      confidence: 0,
    };
  }

  if (!prospectId) {
    return {
      matchStatus: 'needs_review',
      matchReason: matchReason || 'no_confident_prospect_match',
      confidence: 0,
    };
  }

  return {
    matchStatus: 'matched',
    matchReason: matchReason || 'matched_existing_prospect',
    confidence: matchReason === 'provided_prospect_id' ? 100 : 95,
  };
}

export function buildSalesActivityInteractionNotes(activity: NormalizedSalesActivity): string {
  const lines = [
    activity.subject ? `Subject: ${activity.subject}` : null,
    activity.notes,
  ].filter((line): line is string => Boolean(line));

  const contactParts = [
    activity.contactName,
    activity.company,
    activity.email,
  ].filter((part): part is string => Boolean(part));

  if (contactParts.length > 0) {
    lines.push(`Codex activity: ${contactParts.join(' | ')}`);
  }

  return lines.join('\n').slice(0, 5000);
}
