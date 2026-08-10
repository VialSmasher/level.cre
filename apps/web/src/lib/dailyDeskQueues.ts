export type DailyDeskAction = {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityScore: number;
  automationHints?: Record<string, unknown>;
};

export type DailyActivityDay = {
  email: number;
  call: number;
  meeting: number;
  other: number;
  total: number;
};

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
    ))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 3);
  const review = actions.filter((action) => action.type === 'email_cleanup');
  const usedIds = new Set([...today, ...waiting, ...review].map((action) => action.id));
  const develop = actions.filter((action) => !usedIds.has(action.id));
  return { today, waiting, review, develop };
}
