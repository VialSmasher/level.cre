const ACTIVE_PIPELINE_STATUSES = new Set(['contacted', 'listing', 'client', 'development']);

type PipelineProspect = {
  status?: string | null;
  follow_up_due_date?: Date | string | null;
  last_contact_date?: Date | string | null;
  last_interaction_at?: Date | string | null;
  updated_at?: Date | string | null;
  created_at?: Date | string | null;
};

function timestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  const result = parsed.getTime();
  return Number.isNaN(result) ? null : result;
}

export function buildPipelineHealth(rows: PipelineProspect[], now = new Date()) {
  const active = rows.filter((row) => ACTIVE_PIPELINE_STATUSES.has(String(row.status || '').toLowerCase()));
  const nowMs = now.getTime();
  const stalledBefore = nowMs - 21 * 24 * 60 * 60 * 1000;
  const withNextAction = active.filter((row) => timestamp(row.follow_up_due_date) !== null);
  const overdueNextActions = withNextAction.filter((row) => (timestamp(row.follow_up_due_date) || 0) < nowMs);
  const stalled = active.filter((row) => {
    const lastTouch = timestamp(row.last_contact_date)
      ?? timestamp(row.last_interaction_at)
      ?? timestamp(row.updated_at)
      ?? timestamp(row.created_at);
    return lastTouch !== null && lastTouch < stalledBefore;
  });

  return {
    activeProspects: active.length,
    withNextAction: withNextAction.length,
    missingNextAction: active.length - withNextAction.length,
    overdueNextActions: overdueNextActions.length,
    stalledProspects: stalled.length,
    nextActionCoveragePercent: active.length === 0 ? 100 : Math.round((withNextAction.length / active.length) * 100),
  };
}
