export type DailyDeskAction = {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityScore: number;
  automationHints?: Record<string, unknown>;
};

export type DailyActivityDay = {
  date?: string;
  email: number;
  call: number;
  meeting: number;
  other: number;
  inboundEmail?: number;
  total: number;
};

export function describeSalesActivityDirection(activityStatus: unknown) {
  const normalized = String(activityStatus || '').trim().toLowerCase();
  if (normalized === 'received' || normalized === 'inbound') {
    return {
      kind: 'inbound' as const,
      label: 'Inbound email · outcome',
      countsTowardProduction: false,
      linkLabel: 'Link response',
    };
  }
  if (normalized === 'sent' || normalized === 'outbound') {
    return {
      kind: 'outbound' as const,
      label: 'Outbound email · production',
      countsTowardProduction: true,
      linkLabel: 'Link activity',
    };
  }
  return {
    kind: 'unknown' as const,
    label: 'Direction unconfirmed',
    countsTowardProduction: false,
    linkLabel: 'Link activity',
  };
}

function emptyActivityTotals() {
  return { email: 0, call: 0, meeting: 0, other: 0, total: 0 };
}

function sumActivityDays(days: DailyActivityDay[]) {
  return days.reduce((totals, day) => ({
    email: totals.email + day.email,
    call: totals.call + day.call,
    meeting: totals.meeting + day.meeting,
    other: totals.other + day.other,
    total: totals.total + day.total,
  }), emptyActivityTotals());
}

export function buildWeeklyActivityMomentum(series: DailyActivityDay[]) {
  const datedDays = series.filter((day): day is DailyActivityDay & { date: string } => Boolean(day.date));
  if (!datedDays.length) {
    return {
      thisWeek: emptyActivityTotals(),
      lastWeek: emptyActivityTotals(),
      target: 0,
      remaining: 0,
      progressPercent: 0,
      activeDaysThisWeek: 0,
      activeDaysLastWeek: 0,
    };
  }

  const latestDate = new Date(`${datedDays.at(-1)!.date}T12:00:00Z`);
  const dayFromMonday = (latestDate.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(latestDate);
  currentWeekStart.setUTCDate(latestDate.getUTCDate() - dayFromMonday);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);
  const toKey = (date: Date) => date.toISOString().slice(0, 10);
  const currentStartKey = toKey(currentWeekStart);
  const previousStartKey = toKey(previousWeekStart);

  const thisWeekDays = datedDays.filter((day) => day.date >= currentStartKey);
  const lastWeekDays = datedDays.filter((day) => day.date >= previousStartKey && day.date < currentStartKey);
  const thisWeek = sumActivityDays(thisWeekDays);
  const lastWeek = sumActivityDays(lastWeekDays);
  const earlierActiveDays = datedDays.filter((day) => day.date < previousStartKey && day.total > 0);
  const baseline = earlierActiveDays.length
    ? Math.round((earlierActiveDays.reduce((sum, day) => sum + day.total, 0) / earlierActiveDays.length) * 5)
    : 0;
  const target = lastWeek.total || baseline;
  const remaining = Math.max(0, target - thisWeek.total);
  const progressPercent = target > 0
    ? Math.min(100, Math.round((thisWeek.total / target) * 100))
    : (thisWeek.total > 0 ? 100 : 0);

  return {
    thisWeek,
    lastWeek,
    target,
    remaining,
    progressPercent,
    activeDaysThisWeek: thisWeekDays.filter((day) => day.total > 0).length,
    activeDaysLastWeek: lastWeekDays.filter((day) => day.total > 0).length,
  };
}

export function buildDailyActivityPace(series: DailyActivityDay[], dailyCallTarget?: number | null) {
  const today = series.at(-1) || { email: 0, call: 0, meeting: 0, other: 0, total: 0 };
  const priorActiveDays = series.slice(0, -1).filter((day) => day.total > 0);
  const recentActiveDayAverage = priorActiveDays.length > 0
    ? Math.max(1, Math.round(priorActiveDays.reduce((sum, day) => sum + day.total, 0) / priorActiveDays.length))
    : 0;
  const configuredCallTarget = Math.max(0, Math.trunc(Number(dailyCallTarget) || 0));
  const goalKind = configuredCallTarget > 0 ? 'calls' : 'touches';
  const completed = goalKind === 'calls' ? today.call : today.total;
  const paceTarget = configuredCallTarget || recentActiveDayAverage;
  const remainingToPace = paceTarget > 0
    ? Math.max(0, paceTarget - completed)
    : 0;
  const progressPercent = paceTarget > 0
    ? Math.min(100, Math.round((completed / paceTarget) * 100))
    : (completed > 0 ? 100 : 0);

  return {
    today,
    hasBaseline: priorActiveDays.length > 0,
    hasConfiguredCallTarget: configuredCallTarget > 0,
    goalKind,
    completed,
    paceTarget,
    recentActiveDayAverage,
    remainingToPace,
    progressPercent,
  };
}

export function buildDailyDeskQueues<T extends DailyDeskAction>(actions: T[]) {
  const waiting = actions.filter(
    (action) => action.type === 'outlook_signal' && action.automationHints?.stage === 'waiting_on_reply',
  );
  const waitingIds = new Set(waiting.map((action) => action.id));
  const today = actions
    .filter((action) => (
      (action.priority === 'critical' || action.priority === 'high')
      && !waitingIds.has(action.id)
      && action.type !== 'email_cleanup'
      && action.type !== 'research_target'
      && action.type !== 'stale_prospect'
      && action.type !== 'listing_progress'
    ))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 3);
  const review = actions.filter((action) => action.type === 'email_cleanup');
  const usedIds = new Set([...today, ...waiting, ...review].map((action) => action.id));
  const develop = actions.filter((action) => !usedIds.has(action.id) && action.type !== 'listing_progress');
  return { today, waiting, review, develop };
}
