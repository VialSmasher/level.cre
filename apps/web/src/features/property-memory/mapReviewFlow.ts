import type { MarketMemoryAnchor } from '@level-cre/shared'

import type { ProspectMergeCandidateGroup } from '@/features/prospect-merge/api'

export function reconcileSelectedMarketMemoryAnchor(
  current: MarketMemoryAnchor | null,
  refreshed: MarketMemoryAnchor[],
) {
  if (!current) return null

  const currentPersistence = current.persistence
  if (currentPersistence?.state === 'local_preview') return current
  if (currentPersistence?.state === 'pending') {
    // Only the same import item can confirm approval. Its suggested dossier,
    // normalized anchor ID and prospect match do not establish that transition.
    return currentPersistence.importItemId
      ? refreshed.find(candidate => (
        candidate.persistence?.importItemId === currentPersistence.importItemId
        && (candidate.persistence?.state === 'pending' || candidate.persistence?.state === 'approved')
      )) || null
      : null
  }
  if (currentPersistence?.state === 'approved' && currentPersistence.dossierId) {
    return refreshed.find(candidate => (
      candidate.persistence?.state === 'approved'
      && candidate.persistence.dossierId === currentPersistence.dossierId
    )) || null
  }
  if (currentPersistence?.state === 'approved' && currentPersistence.importItemId) {
    return refreshed.find(candidate => (
      candidate.persistence?.state === 'approved'
      && candidate.persistence.importItemId === currentPersistence.importItemId
    )) || null
  }
  return refreshed.find(candidate => (
    candidate.id === current.id
    && candidate.persistence?.state === currentPersistence?.state
    && candidate.persistence?.importItemId === currentPersistence?.importItemId
    && candidate.persistence?.dossierId === currentPersistence?.dossierId
  )) || null
}

export function findDuplicateProspectGroupForAnchor(
  anchor: MarketMemoryAnchor | null,
  groups: ProspectMergeCandidateGroup[],
) {
  if (!anchor) return null

  const candidateIds = new Set(
    (anchor.resolution?.candidates || [])
      .filter((candidate) => candidate.entityType === 'prospect')
      .map((candidate) => candidate.id),
  )
  if (anchor.persistence?.linkedProspectId) {
    candidateIds.add(anchor.persistence.linkedProspectId)
  }

  const linkedProspectId = anchor.persistence?.linkedProspectId || null
  let best: { group: ProspectMergeCandidateGroup; score: number } | null = null
  for (const group of groups) {
    const overlap = group.prospects.filter((prospect) => candidateIds.has(prospect.id)).length
    const containsLinkedProspect = linkedProspectId != null
      && group.prospects.some((prospect) => prospect.id === linkedProspectId)
    if (overlap < 2 && !containsLinkedProspect) continue
    const score = (overlap * 10) + (containsLinkedProspect ? 1 : 0)
    if (!best || score > best.score) best = { group, score }
  }
  return best?.group || null
}
