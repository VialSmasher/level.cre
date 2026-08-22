export type ScorecardProductionActivity = {
  timestamp?: unknown;
  date?: unknown;
  createdAt?: unknown;
  type?: unknown;
  action?: unknown;
  direction?: unknown;
  sourceMetadata?: unknown;
  prospectId?: unknown;
};

export type ScorecardMapCoverage = {
  totalActions: number;
  mappedActions: number;
  unmappedActions: number;
  mappedPercent: number;
  uniqueProspects: number;
};

type ProductionKind = 'email' | 'call' | 'meeting';

function datePartsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: part('year'), month: part('month'), day: part('day') };
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(value, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekStartKey(value: Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(value, timeZone);
  const localDateAsUtc = new Date(Date.UTC(year, month - 1, day));
  const dayFromMonday = (localDateAsUtc.getUTCDay() + 6) % 7;
  localDateAsUtc.setUTCDate(localDateAsUtc.getUTCDate() - dayFromMonday);
  return localDateAsUtc.toISOString().slice(0, 10);
}

function parseActivityDate(row: ScorecardProductionActivity) {
  const value = row.timestamp || row.date || row.createdAt;
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function activityDirection(row: ScorecardProductionActivity) {
  const metadata = row.sourceMetadata && typeof row.sourceMetadata === 'object' && !Array.isArray(row.sourceMetadata)
    ? row.sourceMetadata as Record<string, unknown>
    : {};
  const value = String(
    row.direction
    || metadata.direction
    || metadata.captureDirection
    || metadata.emailDirection
    || '',
  ).trim().toLowerCase();
  if (value === 'received' || value === 'inbound') return 'inbound';
  if (value === 'internal') return 'internal';
  return 'outbound';
}

function productionKind(row: ScorecardProductionActivity): ProductionKind | null {
  const value = String(row.action || row.type || '').trim().toLowerCase();
  if (value === 'email' || value === 'email_sent') return 'email';
  if (value === 'call' || value === 'phone_call' || value === 'call_attempted') return 'call';
  if (value === 'meeting' || value === 'meeting_held' || value === 'tour' || value === 'showing') return 'meeting';
  return null;
}

export function isOutboundScorecardActivity(row: ScorecardProductionActivity) {
  return activityDirection(row) === 'outbound' && productionKind(row) !== null;
}

export function buildScorecardMapCoverage(
  activities: ScorecardProductionActivity[],
  options: { now?: Date; timeZone?: string } = {},
): ScorecardMapCoverage {
  const now = options.now || new Date();
  const timeZone = options.timeZone || 'America/Edmonton';
  const currentWeekStart = weekStartKey(now, timeZone);
  const currentWeekActivities = (activities || []).filter((activity) => {
    const date = parseActivityDate(activity);
    return Boolean(
      date
      && dateKeyInTimeZone(date, timeZone) >= currentWeekStart
      && isOutboundScorecardActivity(activity),
    );
  });
  const mappedActivities = currentWeekActivities.filter((activity) => Boolean(String(activity.prospectId || '').trim()));
  const uniqueProspects = new Set(mappedActivities.map((activity) => String(activity.prospectId))).size;
  const totalActions = currentWeekActivities.length;
  const mappedActions = mappedActivities.length;

  return {
    totalActions,
    mappedActions,
    unmappedActions: Math.max(0, totalActions - mappedActions),
    mappedPercent: totalActions > 0 ? Math.round((mappedActions / totalActions) * 100) : 0,
    uniqueProspects,
  };
}
