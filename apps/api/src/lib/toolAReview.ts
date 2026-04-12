import type { Prospect, ProspectStatusType } from '@level-cre/shared/schema';

export type ToolAReviewWorkspaceRef = {
  id: string;
  title?: string | null;
};

export type ToolAReviewInteraction = {
  id: string;
  prospectId: string;
  userId?: string | null;
  listingId?: string | null;
  date?: string | null;
  createdAt?: string | null;
  type?: string | null;
  outcome?: string | null;
  notes?: string | null;
  nextFollowUp?: string | null;
};

export type FollowUpFlag =
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'missing_schedule'
  | 'no_engagement';

export type ReviewSeverity = 'high' | 'medium' | 'low';

export type FollowUpReviewItem = {
  prospectId: string;
  name: string;
  status: ProspectStatusType;
  severity: ReviewSeverity;
  flags: FollowUpFlag[];
  reasons: string[];
  dueDate?: string;
  dueStatus: 'overdue' | 'today' | 'soon' | 'future' | 'unscheduled';
  followUpTimeframe?: string;
  lastEngagementAt?: string;
  lastInteractionAt?: string;
  interactionCount: number;
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  workspaces: ToolAReviewWorkspaceRef[];
};

export type FollowUpReviewSummary = {
  totalReviewed: number;
  actionable: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  missingSchedule: number;
  noEngagement: number;
};

export type FollowUpReviewResult = {
  summary: FollowUpReviewSummary;
  items: FollowUpReviewItem[];
};

export type DataQualityIssueCode =
  | 'placeholder_name'
  | 'missing_notes'
  | 'missing_submarket'
  | 'missing_contact_method'
  | 'invalid_email'
  | 'invalid_phone'
  | 'invalid_website'
  | 'missing_follow_up_strategy';

export type DataQualityIssue = {
  code: DataQualityIssueCode;
  severity: ReviewSeverity;
  field: string;
  message: string;
  suggestedFix: string;
};

export type DataQualityReviewItem = {
  prospectId: string;
  name: string;
  status: ProspectStatusType;
  severity: ReviewSeverity;
  issueCount: number;
  issues: DataQualityIssue[];
  suggestedActions: string[];
  lastEngagementAt?: string;
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  workspaces: ToolAReviewWorkspaceRef[];
};

export type DataQualityReviewSummary = {
  totalReviewed: number;
  flagged: number;
} & Record<DataQualityIssueCode, number>;

export type DataQualityReviewResult = {
  summary: DataQualityReviewSummary;
  items: DataQualityReviewItem[];
};

type FollowUpReviewInput = {
  prospects: Prospect[];
  interactions: ToolAReviewInteraction[];
  workspacesByProspectId?: Record<string, ToolAReviewWorkspaceRef[]>;
  now?: Date;
  dueSoonDays?: number;
  includeAll?: boolean;
};

type DataQualityReviewInput = {
  prospects: Prospect[];
  interactions: ToolAReviewInteraction[];
  workspacesByProspectId?: Record<string, ToolAReviewWorkspaceRef[]>;
  includeClean?: boolean;
};

const FOLLOW_UP_EXCLUDED_STATUSES = new Set<ProspectStatusType>(['no_go']);
const FOLLOW_UP_STRATEGY_STATUSES = new Set<ProspectStatusType>([
  'prospect',
  'contacted',
  'listing',
  'client',
  'development',
]);

const severityRank: Record<ReviewSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function parseDateLike(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIsoString(date?: Date | null): string | undefined {
  if (!date) return undefined;
  return date.toISOString();
}

function addMonthsSafe(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < day) next.setDate(0);
  return next;
}

function timeframeToMonths(value?: string): number | null {
  switch (value) {
    case '1_month':
      return 1;
    case '3_month':
      return 3;
    case '6_month':
      return 6;
    case '1_year':
      return 12;
    default:
      return null;
  }
}

function computeDueDateFromTimeframe(anchor: Date, timeframe?: string): Date | null {
  const months = timeframeToMonths(timeframe);
  if (!months) return null;
  return addMonthsSafe(anchor, months);
}

function maxDate(values: Array<Date | null | undefined>): Date | null {
  let winner: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!winner || value.getTime() > winner.getTime()) {
      winner = value;
    }
  }
  return winner;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isPlaceholderProspectName(value?: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return /^(new\s+(polygon|rectangle|point|marker)|new\s+\w+)/i.test(normalized);
}

function isLikelyEmail(value?: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isLikelyPhone(value?: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10;
}

function isLikelyWebsite(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

function compareBySeverityThenDate(
  a: { severity: ReviewSeverity; dueDate?: string; name: string },
  b: { severity: ReviewSeverity; dueDate?: string; name: string },
): number {
  const severityDelta = severityRank[a.severity] - severityRank[b.severity];
  if (severityDelta !== 0) return severityDelta;

  const aDue = parseDateLike(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDue = parseDateLike(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  return a.name.localeCompare(b.name);
}

function groupInteractionsByProspect(
  interactions: ToolAReviewInteraction[],
): Map<string, ToolAReviewInteraction[]> {
  const grouped = new Map<string, ToolAReviewInteraction[]>();

  for (const interaction of interactions) {
    const list = grouped.get(interaction.prospectId) ?? [];
    list.push(interaction);
    grouped.set(interaction.prospectId, list);
  }

  for (const list of Array.from(grouped.values())) {
    list.sort((left: ToolAReviewInteraction, right: ToolAReviewInteraction) => {
      const leftTime =
        parseDateLike(left.date)?.getTime() ??
        parseDateLike(left.createdAt)?.getTime() ??
        0;
      const rightTime =
        parseDateLike(right.date)?.getTime() ??
        parseDateLike(right.createdAt)?.getTime() ??
        0;
      return rightTime - leftTime;
    });
  }

  return grouped;
}

function getHighestSeverity(values: ReviewSeverity[]): ReviewSeverity {
  if (values.includes('high')) return 'high';
  if (values.includes('medium')) return 'medium';
  return 'low';
}

export function buildFollowUpReview({
  prospects,
  interactions,
  workspacesByProspectId = {},
  now = new Date(),
  dueSoonDays = 7,
  includeAll = false,
}: FollowUpReviewInput): FollowUpReviewResult {
  const groupedInteractions = groupInteractionsByProspect(interactions);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const soonCutoff = new Date(dayEnd);
  soonCutoff.setDate(soonCutoff.getDate() + dueSoonDays);

  const reviewableProspects = prospects.filter(
    (prospect) => !FOLLOW_UP_EXCLUDED_STATUSES.has(prospect.status),
  );

  const items = reviewableProspects
    .map<FollowUpReviewItem | null>((prospect) => {
      const prospectInteractions = groupedInteractions.get(prospect.id) ?? [];
      const latestInteraction = prospectInteractions[0];
      const latestInteractionAt = maxDate([
        parseDateLike(latestInteraction?.date),
        parseDateLike(latestInteraction?.createdAt),
      ]);
      const explicitLastContact = parseDateLike(prospect.lastContactDate);
      const lastEngagementAt = maxDate([explicitLastContact, latestInteractionAt]);
      const explicitDueDate = parseDateLike(prospect.followUpDueDate);
      const interactionNextFollowUp = parseDateLike(latestInteraction?.nextFollowUp);
      const computedDueDate =
        explicitDueDate ??
        interactionNextFollowUp ??
        computeDueDateFromTimeframe(
          lastEngagementAt ?? parseDateLike(prospect.createdDate) ?? now,
          prospect.followUpTimeframe,
        );

      const flags: FollowUpFlag[] = [];
      const reasons: string[] = [];

      if (!lastEngagementAt) {
        flags.push('no_engagement');
        reasons.push('No contact activity has been logged for this record.');
      }

      if (!computedDueDate) {
        if (FOLLOW_UP_STRATEGY_STATUSES.has(prospect.status)) {
          flags.push('missing_schedule');
          reasons.push('No follow-up schedule is set on this record.');
        }
      } else if (computedDueDate.getTime() < dayStart.getTime()) {
        flags.push('overdue');
        reasons.push('Follow-up date is overdue.');
      } else if (computedDueDate.getTime() <= dayEnd.getTime()) {
        flags.push('due_today');
        reasons.push('Follow-up is due today.');
      } else if (computedDueDate.getTime() <= soonCutoff.getTime()) {
        flags.push('due_soon');
        reasons.push(`Follow-up is due within ${dueSoonDays} days.`);
      }

      if (!includeAll && flags.length === 0) {
        return null;
      }

      const severity = getHighestSeverity(
        flags.map((flag) => {
          switch (flag) {
            case 'overdue':
            case 'due_today':
              return 'high';
            case 'missing_schedule':
            case 'no_engagement':
              return 'medium';
            case 'due_soon':
            default:
              return 'low';
          }
        }),
      );

      const dueStatus: FollowUpReviewItem['dueStatus'] = !computedDueDate
        ? 'unscheduled'
        : flags.includes('overdue')
          ? 'overdue'
          : flags.includes('due_today')
            ? 'today'
            : flags.includes('due_soon')
              ? 'soon'
              : 'future';

      return {
        prospectId: prospect.id,
        name: prospect.name,
        status: prospect.status,
        severity,
        flags,
        reasons: uniq(reasons),
        dueDate: toIsoString(computedDueDate),
        dueStatus,
        followUpTimeframe: prospect.followUpTimeframe,
        lastEngagementAt: toIsoString(lastEngagementAt),
        lastInteractionAt: toIsoString(latestInteractionAt),
        interactionCount: prospectInteractions.length,
        contact: {
          name: prospect.contactName,
          email: prospect.contactEmail,
          phone: prospect.contactPhone,
          company: prospect.contactCompany,
        },
        workspaces: workspacesByProspectId[prospect.id] ?? [],
      };
    })
    .filter((item): item is FollowUpReviewItem => Boolean(item))
    .sort(compareBySeverityThenDate);

  const summary: FollowUpReviewSummary = {
    totalReviewed: reviewableProspects.length,
    actionable: items.length,
    overdue: items.filter((item) => item.flags.includes('overdue')).length,
    dueToday: items.filter((item) => item.flags.includes('due_today')).length,
    dueSoon: items.filter((item) => item.flags.includes('due_soon')).length,
    missingSchedule: items.filter((item) => item.flags.includes('missing_schedule')).length,
    noEngagement: items.filter((item) => item.flags.includes('no_engagement')).length,
  };

  return { summary, items };
}

export function buildDataQualityReview({
  prospects,
  interactions,
  workspacesByProspectId = {},
  includeClean = false,
}: DataQualityReviewInput): DataQualityReviewResult {
  const groupedInteractions = groupInteractionsByProspect(interactions);

  const items = prospects
    .map<DataQualityReviewItem | null>((prospect) => {
      const prospectInteractions = groupedInteractions.get(prospect.id) ?? [];
      const latestInteraction = prospectInteractions[0];
      const lastEngagementAt = maxDate([
        parseDateLike(prospect.lastContactDate),
        parseDateLike(latestInteraction?.date),
        parseDateLike(latestInteraction?.createdAt),
      ]);

      const issues: DataQualityIssue[] = [];
      const trimmedNotes = (prospect.notes ?? '').trim();
      const hasContactMethod = Boolean(
        (prospect.contactEmail ?? '').trim() || (prospect.contactPhone ?? '').trim(),
      );
      const hasSchedule = Boolean(
        parseDateLike(prospect.followUpDueDate) || prospect.followUpTimeframe,
      );

      if (isPlaceholderProspectName(prospect.name)) {
        issues.push({
          code: 'placeholder_name',
          severity: 'high',
          field: 'name',
          message: 'This record still looks like a temporary or placeholder entry.',
          suggestedFix: 'Replace the placeholder name with a real property address or account name.',
        });
      }

      if (!trimmedNotes) {
        issues.push({
          code: 'missing_notes',
          severity: 'low',
          field: 'notes',
          message: 'Notes are empty, so context is thin for future follow-up.',
          suggestedFix: 'Add a short note with source, owner context, or the latest takeaway.',
        });
      }

      if (!prospect.submarketId) {
        issues.push({
          code: 'missing_submarket',
          severity: 'medium',
          field: 'submarketId',
          message: 'Submarket is missing.',
          suggestedFix: 'Assign the correct submarket so this record is easier to filter and review.',
        });
      }

      if (!hasContactMethod) {
        issues.push({
          code: 'missing_contact_method',
          severity: 'high',
          field: 'contact',
          message: 'No phone number or email is stored for follow-up.',
          suggestedFix: 'Add at least one direct contact method.',
        });
      }

      if (prospect.contactEmail && !isLikelyEmail(prospect.contactEmail)) {
        issues.push({
          code: 'invalid_email',
          severity: 'medium',
          field: 'contactEmail',
          message: 'Email format looks invalid.',
          suggestedFix: 'Clean or replace the email address.',
        });
      }

      if (prospect.contactPhone && !isLikelyPhone(prospect.contactPhone)) {
        issues.push({
          code: 'invalid_phone',
          severity: 'medium',
          field: 'contactPhone',
          message: 'Phone number looks incomplete or malformed.',
          suggestedFix: 'Normalize the phone number into a callable format.',
        });
      }

      if (prospect.websiteUrl && !isLikelyWebsite(prospect.websiteUrl)) {
        issues.push({
          code: 'invalid_website',
          severity: 'low',
          field: 'websiteUrl',
          message: 'Website URL looks malformed.',
          suggestedFix: 'Normalize the website into a valid URL.',
        });
      }

      if (
        FOLLOW_UP_STRATEGY_STATUSES.has(prospect.status) &&
        !hasSchedule
      ) {
        issues.push({
          code: 'missing_follow_up_strategy',
          severity: 'medium',
          field: 'followUpTimeframe',
          message: 'This record has no follow-up cadence or due date.',
          suggestedFix: 'Set a follow-up timeframe or explicit due date.',
        });
      }

      if (!includeClean && issues.length === 0) {
        return null;
      }

      const severity = getHighestSeverity(issues.map((issue) => issue.severity));

      return {
        prospectId: prospect.id,
        name: prospect.name,
        status: prospect.status,
        severity,
        issueCount: issues.length,
        issues,
        suggestedActions: uniq(issues.map((issue) => issue.suggestedFix)),
        lastEngagementAt: toIsoString(lastEngagementAt),
        contact: {
          name: prospect.contactName,
          email: prospect.contactEmail,
          phone: prospect.contactPhone,
          company: prospect.contactCompany,
        },
        workspaces: workspacesByProspectId[prospect.id] ?? [],
      };
    })
    .filter((item): item is DataQualityReviewItem => Boolean(item))
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) return severityDelta;
      if (left.issueCount !== right.issueCount) return right.issueCount - left.issueCount;
      return left.name.localeCompare(right.name);
    });

  const summary: DataQualityReviewSummary = {
    totalReviewed: prospects.length,
    flagged: items.length,
    placeholder_name: 0,
    missing_notes: 0,
    missing_submarket: 0,
    missing_contact_method: 0,
    invalid_email: 0,
    invalid_phone: 0,
    invalid_website: 0,
    missing_follow_up_strategy: 0,
  };

  for (const item of items) {
    for (const issue of item.issues) {
      summary[issue.code] += 1;
    }
  }

  return { summary, items };
}
