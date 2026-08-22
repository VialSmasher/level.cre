export type PursuitLifecycleRow = {
  id: string
  createdAt?: string | Date | null
  prospectCount?: number | null
  activityCount?: number | null
  lastActivityAt?: string | Date | null
}

function timestamp(value?: string | Date | null) {
  if (!value) return 0
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

export function organizePursuits<T extends PursuitLifecycleRow>(
  pursuits: T[],
  options: { now?: Date; recentDays?: number } = {},
) {
  const now = options.now ?? new Date()
  const recentDays = options.recentDays ?? 90
  const recentCutoff = now.getTime() - recentDays * 24 * 60 * 60 * 1000
  const active: T[] = []
  const dormant: T[] = []

  pursuits.forEach((pursuit) => {
    const hasActivity = Number(pursuit.activityCount || 0) > 0
    const hasProspects = Number(pursuit.prospectCount || 0) > 0
    const isRecent = timestamp(pursuit.createdAt) >= recentCutoff
    ;(hasActivity || hasProspects || isRecent ? active : dormant).push(pursuit)
  })

  active.sort((left, right) => {
    const activityDifference = timestamp(right.lastActivityAt) - timestamp(left.lastActivityAt)
    if (activityDifference) return activityDifference
    const prospectDifference = Number(right.prospectCount || 0) - Number(left.prospectCount || 0)
    if (prospectDifference) return prospectDifference
    return timestamp(right.createdAt) - timestamp(left.createdAt)
  })
  dormant.sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))

  return { active, dormant }
}
