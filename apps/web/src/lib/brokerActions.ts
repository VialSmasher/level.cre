import type { Prospect } from '@level-cre/shared/schema';

export type BrokerActivityType = 'call' | 'email' | 'meeting' | 'note';
export type BrokerActivityOutcome =
  | 'contacted'
  | 'no_answer'
  | 'left_message'
  | 'scheduled_meeting'
  | 'not_interested'
  | 'follow_up_later';

export type BrokerActivityInput = {
  prospect: Pick<Prospect, 'id'>;
  type: BrokerActivityType;
  outcome?: BrokerActivityOutcome;
  notes?: string;
  nextFollowUp?: string | null;
  listingId?: string | null;
  date?: string;
};

type ContactCoverageProspect = Pick<Prospect, 'contactName' | 'contactEmail' | 'contactPhone' | 'contactCompany'>;
type FollowUpProspect = {
  followUpDueDate?: Prospect['followUpDueDate'] | Date | null;
  followUpTimeframe?: Prospect['followUpTimeframe'] | null;
  lastContactDate?: Prospect['lastContactDate'] | null;
  createdDate?: Prospect['createdDate'] | null;
};

type ActionableFollowUpProspect = FollowUpProspect & Pick<Prospect, 'status'>;
type ActivityPatchProspect = FollowUpProspect & Pick<Prospect, 'status'>;

type ProspectActivityPatch = {
  lastContactDate: string;
  status?: Prospect['status'];
  followUpDueDate?: null;
};

const BROKER_TIME_ZONE = 'America/Edmonton';

const followUpTimeframeMonths: Record<NonNullable<Prospect['followUpTimeframe']>, number> = {
  '1_month': 1,
  '3_month': 3,
  '6_month': 6,
  '1_year': 12,
};

function parseFollowUpDate(value?: string | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addMonthsSafe(value: Date, months: number) {
  const date = new Date(value);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date;
}

function calendarDayKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function hasContactCoverage(prospect: ContactCoverageProspect) {
  return Boolean(prospect.contactName || prospect.contactEmail || prospect.contactPhone || prospect.contactCompany);
}

export function getFollowUpDueDate(prospect: FollowUpProspect) {
  const storedDueDate = parseFollowUpDate(prospect.followUpDueDate);
  if (storedDueDate) return storedDueDate;
  if (!prospect.followUpTimeframe) return null;

  const anchor = parseFollowUpDate(prospect.lastContactDate) || parseFollowUpDate(prospect.createdDate);
  if (!anchor) return null;
  return addMonthsSafe(anchor, followUpTimeframeMonths[prospect.followUpTimeframe]);
}

export function isFollowUpDue(prospect: FollowUpProspect, now = new Date()) {
  const dueAt = getFollowUpDueDate(prospect);
  return Boolean(dueAt && calendarDayKey(dueAt, BROKER_TIME_ZONE) <= calendarDayKey(now, BROKER_TIME_ZONE));
}

export function isActionableFollowUpDue(prospect: ActionableFollowUpProspect, now = new Date()) {
  return prospect.status !== 'no_go' && isFollowUpDue(prospect, now);
}

export function buildProspectActivityPatch(
  prospect: ActivityPatchProspect,
  type: BrokerActivityType,
  activityAt = new Date(),
): ProspectActivityPatch {
  const patch: ProspectActivityPatch = {
    lastContactDate: activityAt.toISOString(),
  };

  if (prospect.status === 'prospect' && type !== 'note') {
    patch.status = 'contacted';
  }

  const storedDueDate = parseFollowUpDate(prospect.followUpDueDate);
  if (type !== 'note' && storedDueDate && isFollowUpDue({ followUpDueDate: storedDueDate }, activityAt)) {
    patch.followUpDueDate = null;
  }

  return patch;
}

export function buildBrokerActivityPayload(input: BrokerActivityInput) {
  return {
    prospectId: input.prospect.id,
    listingId: input.listingId || undefined,
    date: input.date,
    type: input.type,
    outcome: input.outcome || (input.type === 'meeting' ? 'scheduled_meeting' : 'contacted'),
    notes: input.notes || '',
    nextFollowUp: input.nextFollowUp,
  };
}

export async function logBrokerActivity(input: BrokerActivityInput) {
  const { apiRequest } = await import('@/lib/queryClient');
  const response = await apiRequest('POST', '/api/broker-actions/log-activity', buildBrokerActivityPayload(input));
  return response.json() as Promise<{
    interaction: unknown;
    prospect?: Prospect;
    newXpGained?: number;
  }>;
}
