export type DailyDeskAction = {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityScore: number;
  automationHints?: Record<string, unknown>;
};

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
