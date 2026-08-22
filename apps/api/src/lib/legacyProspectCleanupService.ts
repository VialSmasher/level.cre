import { createHash } from 'crypto'
import type { Pool } from 'pg'
import { z } from 'zod'

import { normalizeMarketAddress } from '@level-cre/shared'

import {
  applyProspectMerge,
  listProspectDuplicateCandidates,
  previewProspectMerge,
} from './prospectMergeService'

export const LegacyProspectCleanupPlanQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
})

export const LegacyProspectCleanupApplySchema = z.object({
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  runKey: z.string().trim().min(8).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  maxMerges: z.coerce.number().int().min(1).max(25).default(10),
  confirmation: z.literal('apply_safe_merges'),
})

type CandidateResult = Awaited<ReturnType<typeof listProspectDuplicateCandidates>>
type CandidateGroup = CandidateResult['groups'][number]
type CandidateProspect = CandidateGroup['prospects'][number]

export type LegacyDuplicatePairAssessment = {
  canonicalProspectId: string
  duplicateProspectId: string
  canonicalLabel: string
  duplicateLabel: string
  eligible: boolean
  confidence: 'high' | 'review'
  signals: string[]
  blockers: string[]
}

export function resolveRecommendedMergeDirection(
  pair: Pick<LegacyDuplicatePairAssessment, 'canonicalProspectId' | 'duplicateProspectId'>,
  recommendedProspectId: string,
) {
  if (recommendedProspectId === pair.canonicalProspectId) {
    return {
      canonicalProspectId: pair.canonicalProspectId,
      duplicateProspectId: pair.duplicateProspectId,
      swapped: false,
    }
  }
  if (recommendedProspectId === pair.duplicateProspectId) {
    return {
      canonicalProspectId: pair.duplicateProspectId,
      duplicateProspectId: pair.canonicalProspectId,
      swapped: true,
    }
  }
  return null
}

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizedJson(nested)]),
    )
  }
  return value
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(normalizedJson(value))).digest('hex')
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedEmail(value: unknown) {
  const email = clean(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function websiteDomain(value: unknown) {
  const raw = clean(value)
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function looksLikeAddress(value: unknown) {
  const text = clean(value).toLowerCase()
  return /\d/.test(text) && /\b(?:ave|avenue|st|street|road|rd|trail|tr|drive|dr|boulevard|blvd|way|place|pl|highway|hwy)\b/.test(text)
}

function normalizedCompany(value: unknown) {
  const text = clean(value).toLowerCase()
  if (!text || looksLikeAddress(text)) return null
  const normalized = text
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:incorporated|inc|limited|ltd|corporation|corp|company|co|ulc|llp|lp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length >= 3 ? normalized : null
}

function companyIdentity(prospect: CandidateProspect) {
  return normalizedCompany(prospect.businessName)
    || normalizedCompany(prospect.contactCompany)
    || normalizedCompany(prospect.name)
}

function normalizedAddress(prospect: CandidateProspect) {
  const value = normalizeMarketAddress(clean(prospect.address) || clean(prospect.name))
  return /\d/.test(value) && value.length >= 8 ? value : null
}

function point(prospect: CandidateProspect) {
  const lat = Number(prospect.resolvedLat ?? prospect.locationLat)
  const lng = Number(prospect.resolvedLng ?? prospect.locationLng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function distanceMeters(left: CandidateProspect, right: CandidateProspect) {
  const leftPoint = point(left)
  const rightPoint = point(right)
  if (!leftPoint || !rightPoint) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const earthRadius = 6_371_000
  const latDelta = radians(rightPoint.lat - leftPoint.lat)
  const lngDelta = radians(rightPoint.lng - leftPoint.lng)
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(leftPoint.lat)) * Math.cos(radians(rightPoint.lat)) * Math.sin(lngDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isAddressPlaceholder(prospect: CandidateProspect) {
  return looksLikeAddress(prospect.name)
    && !clean(prospect.businessName)
    && !clean(prospect.contactCompany)
    && !clean(prospect.contactEmail)
}

function distinctMeaningful(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function groupIdentityBlockers(group: CandidateGroup) {
  const companies = distinctMeaningful(group.prospects.map(companyIdentity))
  const emails = distinctMeaningful(group.prospects.map((prospect) => normalizedEmail(prospect.contactEmail)))
  const blockers: string[] = []
  if (companies.length > 1) blockers.push('multiple distinct company identities share this place')
  if (emails.length > 1) blockers.push('multiple distinct contact emails would be collapsed')
  return blockers
}

export function assessLegacyDuplicatePair(
  canonical: CandidateProspect,
  duplicate: CandidateProspect,
  inheritedBlockers: string[] = [],
): LegacyDuplicatePairAssessment {
  const signals: string[] = []
  const blockers = [...inheritedBlockers]
  const leftAddress = normalizedAddress(canonical)
  const rightAddress = normalizedAddress(duplicate)
  const sameAddress = Boolean(leftAddress && leftAddress === rightAddress)
  const distance = distanceMeters(canonical, duplicate)
  const sameCoordinates = distance != null && distance <= 60
  const sameMarketKey = Boolean(clean(canonical.marketKey) && canonical.marketKey === duplicate.marketKey)
  if (sameAddress) signals.push('same normalized civic address')
  if (sameCoordinates) signals.push(`map locations are ${Math.round(distance || 0)} m apart`)
  if (sameMarketKey) signals.push('same durable map identity')

  const leftEmail = normalizedEmail(canonical.contactEmail)
  const rightEmail = normalizedEmail(duplicate.contactEmail)
  const sameEmail = Boolean(leftEmail && leftEmail === rightEmail)
  if (sameEmail) signals.push('same contact email')
  if (leftEmail && rightEmail && !sameEmail) blockers.push('distinct contact emails would be collapsed')

  const leftWebsite = websiteDomain(canonical.websiteUrl)
  const rightWebsite = websiteDomain(duplicate.websiteUrl)
  const sameWebsite = Boolean(leftWebsite && leftWebsite === rightWebsite)
  if (sameWebsite) signals.push('same website domain')

  const leftCompany = companyIdentity(canonical)
  const rightCompany = companyIdentity(duplicate)
  const sameCompany = Boolean(leftCompany && leftCompany === rightCompany)
  if (sameCompany) signals.push('same normalized company identity')
  if (leftCompany && rightCompany && !sameCompany) blockers.push('distinct company identities would be collapsed')

  const placeholderEvidence = sameAddress && (isAddressPlaceholder(canonical) || isAddressPlaceholder(duplicate))
  const bothPlaceholders = sameAddress && isAddressPlaceholder(canonical) && isAddressPlaceholder(duplicate)
  if (placeholderEvidence) signals.push('an address-only legacy pin can be absorbed into the richer record')

  const placeConfirmed = sameAddress || sameCoordinates || sameMarketKey
  if (!placeConfirmed) blockers.push('the records do not have a corroborated shared place')
  const identityConfirmed = sameEmail || sameWebsite || sameCompany || placeholderEvidence || bothPlaceholders
  if (!identityConfirmed) blockers.push('the records do not have a corroborated shared identity')

  const uniqueBlockers = Array.from(new Set(blockers))
  return {
    canonicalProspectId: canonical.id,
    duplicateProspectId: duplicate.id,
    canonicalLabel: canonical.businessName || canonical.name,
    duplicateLabel: duplicate.businessName || duplicate.name,
    eligible: uniqueBlockers.length === 0 && placeConfirmed && identityConfirmed,
    confidence: uniqueBlockers.length === 0 && placeConfirmed && identityConfirmed ? 'high' : 'review',
    signals: Array.from(new Set(signals)),
    blockers: uniqueBlockers,
  }
}

function plannedGroups(candidateGroups: CandidateGroup[]) {
  return candidateGroups.map((group) => {
    const canonical = group.prospects.find((prospect) => prospect.id === group.recommendedCanonicalId)
      || group.prospects[0]
    const groupBlockers = groupIdentityBlockers(group)
    const assessedPairs = group.prospects
      .filter((prospect) => prospect.id !== canonical.id)
      .map((duplicate) => assessLegacyDuplicatePair(canonical, duplicate, groupBlockers))
    const safe = assessedPairs.length > 0 && assessedPairs.every((pair) => pair.eligible)
    return {
      groupId: group.id,
      recommendedCanonicalId: canonical.id,
      reasons: group.reasons,
      disposition: safe ? 'safe_to_merge' as const : 'leave_separate' as const,
      pairs: safe ? assessedPairs : assessedPairs.map((pair) => ({ ...pair, eligible: false as const, confidence: 'review' as const })),
    }
  })
}

type ExecutableMerge = {
  canApply: true
  direction: NonNullable<ReturnType<typeof resolveRecommendedMergeDirection>>
  preview: Awaited<ReturnType<typeof previewProspectMerge>>
} | {
  canApply: false
  reason: string
}

async function prepareExecutableMerge(params: {
  pool: Pool
  userId: string
  pair: LegacyDuplicatePairAssessment
}): Promise<ExecutableMerge> {
  let preview = await previewProspectMerge({
    pool: params.pool,
    userId: params.userId,
    canonicalProspectId: params.pair.canonicalProspectId,
    duplicateProspectId: params.pair.duplicateProspectId,
  })
  if (!preview.canApply) {
    return { canApply: false, reason: 'relationship conflicts block automatic consolidation' }
  }
  const direction = resolveRecommendedMergeDirection(params.pair, preview.recommendation.prospectId)
  if (!direction) {
    return { canApply: false, reason: 'the merge preview recommended a record outside this pair' }
  }
  if (direction.swapped) {
    preview = await previewProspectMerge({
      pool: params.pool,
      userId: params.userId,
      canonicalProspectId: direction.canonicalProspectId,
      duplicateProspectId: direction.duplicateProspectId,
    })
  }
  if (!preview.canApply) {
    return { canApply: false, reason: 'relationship conflicts block automatic consolidation' }
  }
  if (preview.recommendation.prospectId !== direction.canonicalProspectId) {
    return { canApply: false, reason: 'the preferred canonical record is not stable across previews' }
  }
  return { canApply: true, direction, preview }
}

async function validateGroupsAgainstMergePreview(params: {
  pool: Pool
  userId: string
  groups: ReturnType<typeof plannedGroups>
}) {
  return Promise.all(params.groups.map(async (group) => {
    if (group.disposition !== 'safe_to_merge') return group
    const checkedPairs = await Promise.all(group.pairs.map(async (pair) => {
      try {
        const executable = await prepareExecutableMerge({
          pool: params.pool,
          userId: params.userId,
          pair,
        })
        if (executable.canApply) return pair
        return {
          ...pair,
          eligible: false as const,
          confidence: 'review' as const,
          blockers: Array.from(new Set([...pair.blockers, executable.reason])),
        }
      } catch {
        return {
          ...pair,
          eligible: false as const,
          confidence: 'review' as const,
          blockers: Array.from(new Set([...pair.blockers, 'the merge preview could not be confirmed'])),
        }
      }
    }))
    const safe = checkedPairs.length > 0 && checkedPairs.every((pair) => pair.eligible)
    return {
      ...group,
      disposition: safe ? 'safe_to_merge' as const : 'leave_separate' as const,
      pairs: safe
        ? checkedPairs
        : checkedPairs.map((pair) => pair.eligible
          ? {
              ...pair,
              eligible: false as const,
              confidence: 'review' as const,
              blockers: ['another record in this duplicate group is not safe to consolidate automatically'],
            }
          : pair),
    }
  }))
}

export async function buildLegacyProspectCleanupPlan(params: {
  pool: Pool
  userId: string
  limit?: number
}) {
  const candidates = await listProspectDuplicateCandidates({
    pool: params.pool,
    userId: params.userId,
    limit: params.limit || 25,
  })
  const groups = await validateGroupsAgainstMergePreview({
    pool: params.pool,
    userId: params.userId,
    groups: plannedGroups(candidates.groups),
  })
  const hashInput = groups.map((group) => ({
    groupId: group.groupId,
    recommendedCanonicalId: group.recommendedCanonicalId,
    disposition: group.disposition,
    pairs: group.pairs.map((pair) => ({
      canonicalProspectId: pair.canonicalProspectId,
      duplicateProspectId: pair.duplicateProspectId,
      eligible: pair.eligible,
      signals: pair.signals,
      blockers: pair.blockers,
    })),
  }))
  return {
    generatedAt: new Date().toISOString(),
    planHash: stableHash(hashInput),
    summary: {
      candidateGroups: groups.length,
      safeGroups: groups.filter((group) => group.disposition === 'safe_to_merge').length,
      heldGroups: groups.filter((group) => group.disposition !== 'safe_to_merge').length,
      safePairs: groups.flatMap((group) => group.pairs).filter((pair) => pair.eligible).length,
    },
    groups,
  }
}

export class LegacyProspectCleanupError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'legacy_cleanup_error') {
    super(message)
    this.name = 'LegacyProspectCleanupError'
    this.status = status
    this.code = code
  }
}

export async function applyLegacyProspectCleanupPlan(params: {
  pool: Pool
  userId: string
  planHash: string
  runKey: string
  limit?: number
  maxMerges?: number
}) {
  const plan = await buildLegacyProspectCleanupPlan({
    pool: params.pool,
    userId: params.userId,
    limit: params.limit || 25,
  })
  if (plan.planHash !== params.planHash) {
    throw new LegacyProspectCleanupError(
      'The duplicate cleanup plan changed. Generate a new dry run before applying it.',
      409,
      'stale_cleanup_plan',
    )
  }
  const pairs = plan.groups
    .filter((group) => group.disposition === 'safe_to_merge')
    .flatMap((group) => group.pairs)
    .filter((pair) => pair.eligible)
    .slice(0, Math.min(Math.max(params.maxMerges || 10, 1), 25))
  const results: Array<Record<string, unknown>> = []
  for (const pair of pairs) {
    try {
      const executable = await prepareExecutableMerge({
        pool: params.pool,
        userId: params.userId,
        pair,
      })
      if (!executable.canApply) {
        results.push({
          ...pair,
          status: 'skipped',
          reason: executable.reason,
        })
        continue
      }
      const result = await applyProspectMerge({
        pool: params.pool,
        userId: params.userId,
        canonicalProspectId: executable.direction.canonicalProspectId,
        duplicateProspectId: executable.direction.duplicateProspectId,
        previewHash: executable.preview.previewHash,
        idempotencyKey: `${params.runKey}:${executable.direction.duplicateProspectId}`.slice(0, 160),
        confirmConflicts: true,
        fieldChoices: executable.preview.defaultFieldChoices,
      })
      results.push({
        ...pair,
        effectiveCanonicalProspectId: executable.direction.canonicalProspectId,
        effectiveDuplicateProspectId: executable.direction.duplicateProspectId,
        directionSwapped: executable.direction.swapped,
        ...result,
        status: result.alreadyApplied ? 'already_applied' : 'merged',
      })
    } catch (error) {
      results.push({
        ...pair,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    planHash: plan.planHash,
    attempted: pairs.length,
    merged: results.filter((result) => result.status === 'merged').length,
    alreadyApplied: results.filter((result) => result.status === 'already_applied').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  }
}
