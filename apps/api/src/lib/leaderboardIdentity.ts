export type LeaderboardSkillRow = {
  userId: string
  userEmail?: string | null
  displayName?: string | null
  prospectingXp?: number | null
  followUpXp?: number | null
  consistencyXp?: number | null
  marketKnowledgeXp?: number | null
}

function cleanEmail(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

function readableEmailName(value?: string | null) {
  const local = String(value || '').split('@')[0] || ''
  const words = local.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Unknown'
}

function xp(value?: number | null) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getLevel(total: number) {
  return Math.min(99, Math.floor(Math.sqrt(total / 100)))
}

export function buildLeaderboardIdentities(rows: LeaderboardSkillRow[], currentUserId: string) {
  const groups = new Map<string, LeaderboardSkillRow[]>()
  rows.forEach((row) => {
    const email = cleanEmail(row.userEmail)
    const key = email ? `email:${email}` : `user:${row.userId}`
    groups.set(key, [...(groups.get(key) || []), row])
  })

  return Array.from(groups.values())
    .map((group) => {
      const primary = group.find((row) => row.userId === currentUserId)
        || [...group].sort((left, right) => {
          const leftTotal = xp(left.prospectingXp) + xp(left.followUpXp) + xp(left.consistencyXp) + xp(left.marketKnowledgeXp)
          const rightTotal = xp(right.prospectingXp) + xp(right.followUpXp) + xp(right.consistencyXp) + xp(right.marketKnowledgeXp)
          return rightTotal - leftTotal
        })[0]
      const totals = group.reduce((sum, row) => ({
        prospecting: sum.prospecting + xp(row.prospectingXp),
        followUp: sum.followUp + xp(row.followUpXp),
        consistency: sum.consistency + xp(row.consistencyXp),
        marketKnowledge: sum.marketKnowledge + xp(row.marketKnowledgeXp),
      }), { prospecting: 0, followUp: 0, consistency: 0, marketKnowledge: 0 })
      const activityXp = totals.prospecting + totals.followUp + totals.consistency + totals.marketKnowledge
      return {
        user_id: primary.userId,
        user_email: cleanEmail(primary.userEmail) || '',
        display_name: String(primary.displayName || '').trim() || readableEmailName(primary.userEmail),
        level_total: getLevel(totals.prospecting)
          + getLevel(totals.followUp)
          + getLevel(totals.consistency)
          + getLevel(totals.marketKnowledge),
        xp_total: totals.prospecting + totals.followUp,
        activity_xp_total: activityXp,
        identity_count: group.length,
        is_current_user: group.some((row) => row.userId === currentUserId),
      }
    })
    .filter((entry) => entry.activity_xp_total > 0 || entry.is_current_user)
    .sort((left, right) => {
      if (left.level_total !== right.level_total) return right.level_total - left.level_total
      return right.xp_total - left.xp_total
    })
}
