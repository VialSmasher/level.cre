import type { PropertyMemoryDecision, PropertyMemoryReviewItem } from './api'

export type PropertyMemoryDecisionTarget = {
  targetDossierId: string | null
  targetProspectId: string | null
  targetListingId: string | null
}

const EMPTY_TARGET: PropertyMemoryDecisionTarget = {
  targetDossierId: null,
  targetProspectId: null,
  targetListingId: null,
}

export function propertyMemoryTargetFromValue(value: string): PropertyMemoryDecisionTarget {
  if (value === 'new') return { ...EMPTY_TARGET }
  const separator = value.indexOf(':')
  if (separator < 1) return { ...EMPTY_TARGET }
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id) return { ...EMPTY_TARGET }
  if (kind === 'dossier') return { ...EMPTY_TARGET, targetDossierId: id }
  if (kind === 'prospect') return { ...EMPTY_TARGET, targetProspectId: id }
  if (kind === 'listing') return { ...EMPTY_TARGET, targetListingId: id }
  return { ...EMPTY_TARGET }
}

function candidateConflicts(item: PropertyMemoryReviewItem) {
  const conflicts = (item.resolution as { topCandidate?: { conflicts?: unknown } }).topCandidate?.conflicts
  return Array.isArray(conflicts)
    ? conflicts.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : []
}

function resolutionCandidates(item: PropertyMemoryReviewItem) {
  const candidates = (item.resolution as { candidates?: unknown }).candidates
  return Array.isArray(candidates) ? candidates : []
}

function resolutionDecision(item: PropertyMemoryReviewItem) {
  return (item.resolution as { decision?: unknown }).decision
}

function quickApprovalTargetIsConsistent(item: PropertyMemoryReviewItem) {
  const decision = resolutionDecision(item)
  const candidates = resolutionCandidates(item) as Array<Record<string, unknown>>
  const topCandidate = (item.resolution as { topCandidate?: Record<string, unknown> | null }).topCandidate

  if (decision === 'create_new') {
    return item.suggestedLayer === 'market_memory'
      && !topCandidate
      && candidates.length === 0
      && !item.matchedDossierId
      && !item.matchedProspectId
      && !item.matchedListingId
  }
  if (decision !== 'link_existing' || item.suggestedLayer !== 'existing' || !topCandidate || candidates.length !== 1) {
    return false
  }

  const matchedId = topCandidate.entityType === 'dossier'
    ? item.matchedDossierId
    : topCandidate.entityType === 'prospect'
      ? item.matchedProspectId
      : topCandidate.entityType === 'listing'
        ? item.matchedListingId
        : null
  return typeof topCandidate.id === 'string' && topCandidate.id === matchedId
}

export function canQuickApprovePropertyMemory(item: PropertyMemoryReviewItem) {
  return item.status === 'pending'
    && item.suggestedLayer !== 'review'
    && item.reviewReasons.length === 0
    && candidateConflicts(item).length === 0
    && resolutionCandidates(item).length <= 1
    && quickApprovalTargetIsConsistent(item)
}

export function buildQuickPropertyMemoryApproval(item: PropertyMemoryReviewItem): PropertyMemoryDecision {
  return {
    action: 'approve',
    targetDossierId: item.matchedDossierId,
    targetProspectId: item.matchedProspectId,
    targetListingId: item.matchedListingId,
    confirmConflicts: false,
    coordinateDecision: 'keep_existing',
    fieldDecisions: {
      location: true,
      municipal: true,
      legal: true,
      ownership: true,
      context: true,
    },
  }
}
