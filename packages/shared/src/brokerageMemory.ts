import { z } from 'zod'

import {
  scoreMarketEntityCandidate,
  type MarketEntityResolutionCandidate,
  type ResolvableMarketEntity,
} from './entityResolution'

const issueSchema = z.object({
  severity: z.string().default(''),
  type: z.string().default(''),
  evidence: z.string().default(''),
  action: z.string().default(''),
}).passthrough()

const sourceTitleSchema = z.object({
  case_id: z.string().default(''),
  folder_name: z.string().default(''),
  source_relative_path: z.string().default(''),
  source_sha256: z.string().default(''),
  linc: z.string().default(''),
  title_number: z.string().default(''),
  legal_description: z.string().default(''),
  plan: z.string().default(''),
  block: z.string().default(''),
  lot: z.string().default(''),
  municipality: z.string().default(''),
  area_acres_title: z.number().nullable().default(null),
  registered_owner: z.string().default(''),
  transfer_registration_date: z.string().default(''),
  title_pulled_date: z.string().default(''),
  extraction_confidence: z.number().min(0).max(100).default(0),
  source_context: z.string().default(''),
}).passthrough()

const municipalSchema = z.object({
  address: z.string().default(''),
  legalDescriptionMunicipal: z.string().default(''),
  parcelAreaSqM: z.number().nullable().default(null),
  neighbourhood: z.string().default(''),
  currentZone: z.string().default(''),
  currentBylaw: z.string().default(''),
  sourceUrl: z.string().default(''),
  capturedAt: z.string().default(''),
  municipalAddressesObserved: z.array(z.string()).default([]),
}).passthrough()

const coordinateSchema = z.object({
  status: z.string().default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accountNumber: z.string().default(''),
  propertyInformationAddress: z.string().default(''),
  propertyInformationLegalDescription: z.string().default(''),
  propertyInformationZoning: z.string().default(''),
  propertyInformationLotSizeSqM: z.number().nullable().default(null),
  propertyInformationNeighbourhood: z.string().default(''),
  coordinateConfidence: z.string().default(''),
  coordinateMatchReasons: z.array(z.string()).default([]),
  sourceDataset: z.string().default(''),
  sourceDatasetId: z.string().default(''),
  sourceUrl: z.string().default(''),
  capturedAt: z.string().default(''),
}).passthrough()

const enrichedRecordSchema = z.object({
  titleIdentity: z.string().trim().min(1),
  sourceTitle: sourceTitleSchema,
  municipal: municipalSchema,
  coordinate: coordinateSchema,
  derived: z.object({
    issues: z.array(issueSchema).default([]),
    systemPriority: z.string().default(''),
    reviewStatus: z.string().default(''),
    suggestedUse: z.string().default(''),
    archiveOrHistoricalContext: z.boolean().default(false),
    titleAgeBucket: z.string().default(''),
    municipalAcresCalculated: z.number().nullable().default(null),
    matchConfidence: z.string().default(''),
  }).passthrough(),
}).passthrough()

export const currentProjectsMarketMemoryFileSchema = z.object({
  schemaVersion: z.union([z.string(), z.number()]),
  generatedAt: z.string().trim().min(1),
  levelCreWriteAuthorized: z.literal(false),
  counts: z.object({
    identities: z.number().int().nonnegative(),
    lookups: z.number().int().nonnegative(),
  }).passthrough(),
  records: z.array(enrichedRecordSchema).min(1),
}).passthrough()

type EnrichedRecord = z.infer<typeof enrichedRecordSchema>

export type MarketMemoryLegalIdentity = {
  titleIdentity: string
  linc: string | null
  titleNumber: string | null
  legalDescription: string | null
  plan: string | null
  block: string | null
  lot: string | null
  registeredOwner: string | null
  transferRegistrationDate: string | null
  titlePulledDate: string | null
  sourcePath: string
  sourceHash: string
  sourceContext: string | null
  extractionConfidence: number
}

export type MarketMemoryResolution = {
  decision: 'link_existing' | 'review' | 'create_new'
  topCandidate: MarketEntityResolutionCandidate | null
  candidates: MarketEntityResolutionCandidate[]
}

export type MarketMemoryPersistence = {
  state: 'local_preview' | 'pending' | 'approved'
  importId?: string | null
  importItemId?: string | null
  dossierId?: string | null
  linkedProspectId?: string | null
  linkedListingId?: string | null
  sourceFileName?: string | null
  savedAt?: string | null
}

export type MarketMemoryAnchor = {
  id: string
  address: string
  alternateAddresses: string[]
  latitude: number
  longitude: number
  projects: string[]
  municipality: string | null
  neighbourhood: string | null
  zoning: string[]
  parcelAreaSqM: number | null
  parcelAreaAcres: number | null
  accountNumbers: string[]
  legalIdentities: MarketMemoryLegalIdentity[]
  sourceUrls: string[]
  capturedAt: string | null
  reviewReasons: string[]
  reviewStatuses: string[]
  suggestedUses: string[]
  confidence: 'high' | 'medium'
  baseLayer: 'market_memory' | 'review'
  resolution?: MarketMemoryResolution
  previewLayer?: 'existing' | 'market_memory' | 'review'
  persistence?: MarketMemoryPersistence
}

export type CurrentProjectsMarketMemoryPreview = {
  generatedAt: string
  sourceIdentities: number
  expectedAnchors: number
  anchors: MarketMemoryAnchor[]
  importId?: string | null
  sourceFileName?: string | null
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function firstNumber(values: Array<number | null | undefined>) {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null
}

function coordinateKey(record: EnrichedRecord) {
  return `${record.coordinate.latitude.toFixed(6)}:${record.coordinate.longitude.toFixed(6)}`
}

function stableIdentityPart(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

function canonicalAnchorId(records: EnrichedRecord[], coordinateFallback: string) {
  const accounts = unique(records.map((record) => record.coordinate.accountNumber))
    .map(stableIdentityPart)
    .filter(Boolean)
    .sort()
  if (accounts.length) return `edmonton-account-set:${accounts.join('+')}`

  const lincs = unique(records.map((record) => record.sourceTitle.linc))
    .map(stableIdentityPart)
    .filter(Boolean)
    .sort()
  if (lincs.length) return `edmonton-linc-set:${lincs.join('+')}`

  const legalKeys = unique(records.map((record) => [
    record.sourceTitle.plan,
    record.sourceTitle.block,
    record.sourceTitle.lot,
  ].map(stableIdentityPart).filter(Boolean).join('-')))
    .filter(Boolean)
    .sort()
  if (legalKeys.length) return `edmonton-legal-set:${legalKeys.join('+')}`

  const sourceHashes = unique(records.map((record) => record.sourceTitle.source_sha256))
    .map(stableIdentityPart)
    .filter(Boolean)
    .sort()
  if (sourceHashes.length) return `edmonton-source-set:${sourceHashes.join('+')}`
  return `edmonton-point:${coordinateFallback}`
}

function normalizedIssue(record: EnrichedRecord) {
  return record.derived.issues.filter((issue) => (
    record.derived.systemPriority.toLowerCase() === 'high'
    || issue.severity.toLowerCase() === 'high'
    || /conflict|shared|variance|multiple current zones|public owner|reserve/i.test(issue.type)
  ))
}

function buildAnchor(key: string, records: EnrichedRecord[]): MarketMemoryAnchor {
  const addresses = unique(records.flatMap((record) => [
    record.municipal.address,
    record.coordinate.propertyInformationAddress,
    ...record.municipal.municipalAddressesObserved,
  ]))
  const reviewReasons = unique(records.flatMap((record) => normalizedIssue(record).map((issue) => (
    issue.action ? `${issue.type}: ${issue.action}` : issue.type
  ))))
  const coordinateKeys = unique(records.map(coordinateKey))
  if (coordinateKeys.length > 1) {
    reviewReasons.unshift(
      `${records.length} title identities for this canonical parcel resolve to ${coordinateKeys.length} coordinates; confirm the correct map location before approval.`,
    )
  } else if (records.length > 1) {
    reviewReasons.unshift(`${records.length} title identities share this coordinate; confirm the parcel/unit anchor before merging.`)
  }
  for (const record of records) {
    if (record.coordinate.status.toLowerCase() !== 'matched' || record.coordinate.coordinateConfidence.toLowerCase() !== 'high') {
      reviewReasons.push('Coordinate evidence needs review before a durable map location is approved.')
    }
  }
  const dedupedReviewReasons = unique(reviewReasons)
  const parcelAreaSqM = firstNumber(records.flatMap((record) => [
    record.municipal.parcelAreaSqM,
    record.coordinate.propertyInformationLotSizeSqM,
  ]))
  const latitude = records[0]?.coordinate.latitude ?? 0
  const longitude = records[0]?.coordinate.longitude ?? 0

  return {
    id: canonicalAnchorId(records, key),
    address: addresses[0] || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    alternateAddresses: addresses.slice(1),
    latitude,
    longitude,
    projects: unique(records.map((record) => record.sourceTitle.folder_name)),
    municipality: unique(records.map((record) => record.sourceTitle.municipality))[0] || null,
    neighbourhood: unique(records.flatMap((record) => [record.municipal.neighbourhood, record.coordinate.propertyInformationNeighbourhood]))[0] || null,
    zoning: unique(records.flatMap((record) => [record.municipal.currentZone, record.coordinate.propertyInformationZoning])),
    parcelAreaSqM,
    parcelAreaAcres: parcelAreaSqM === null ? null : parcelAreaSqM / 4046.8564224,
    accountNumbers: unique(records.map((record) => record.coordinate.accountNumber)),
    legalIdentities: records.map((record) => ({
      titleIdentity: record.titleIdentity,
      linc: record.sourceTitle.linc || null,
      titleNumber: record.sourceTitle.title_number || null,
      legalDescription: record.sourceTitle.legal_description || record.municipal.legalDescriptionMunicipal || null,
      plan: record.sourceTitle.plan || null,
      block: record.sourceTitle.block || null,
      lot: record.sourceTitle.lot || null,
      registeredOwner: record.sourceTitle.registered_owner || null,
      transferRegistrationDate: record.sourceTitle.transfer_registration_date || null,
      titlePulledDate: record.sourceTitle.title_pulled_date || null,
      sourcePath: record.sourceTitle.source_relative_path,
      sourceHash: record.sourceTitle.source_sha256,
      sourceContext: record.sourceTitle.source_context || null,
      extractionConfidence: record.sourceTitle.extraction_confidence,
    })),
    sourceUrls: unique(records.flatMap((record) => [record.municipal.sourceUrl, record.coordinate.sourceUrl])),
    capturedAt: unique(records.flatMap((record) => [record.municipal.capturedAt, record.coordinate.capturedAt]))[0] || null,
    reviewReasons: dedupedReviewReasons,
    reviewStatuses: unique(records.map((record) => record.derived.reviewStatus)),
    suggestedUses: unique(records.map((record) => record.derived.suggestedUse)),
    confidence: dedupedReviewReasons.length === 0 ? 'high' : 'medium',
    baseLayer: dedupedReviewReasons.length === 0 ? 'market_memory' : 'review',
    persistence: { state: 'local_preview' },
  }
}

export function parseCurrentProjectsMarketMemoryValue(value: unknown): CurrentProjectsMarketMemoryPreview {
  const parsed = currentProjectsMarketMemoryFileSchema.safeParse(value)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const location = firstIssue?.path.length ? ` (${firstIssue.path.join('.')})` : ''
    throw new Error(`This is not the Current Projects Edmonton enrichment file${location}.`)
  }

  const coordinateGroups = new Map<string, EnrichedRecord[]>()
  for (const record of parsed.data.records) {
    const key = coordinateKey(record)
    coordinateGroups.set(key, [...(coordinateGroups.get(key) || []), record])
  }

  // Coordinate evidence can change between municipal captures. Consolidate
  // coordinate groups that resolve to the same stable parcel identity before
  // building anchors so the staging ledger can never silently collapse two
  // rows through its unique (import, external_anchor_id) constraint.
  const canonicalGroups = new Map<string, { coordinateFallback: string; records: EnrichedRecord[] }>()
  coordinateGroups.forEach((records, coordinateFallback) => {
    const canonicalId = canonicalAnchorId(records, coordinateFallback)
    const existing = canonicalGroups.get(canonicalId)
    if (existing) {
      existing.records.push(...records)
    } else {
      canonicalGroups.set(canonicalId, { coordinateFallback, records: [...records] })
    }
  })

  const anchors = Array.from(canonicalGroups.values())
    .map(({ coordinateFallback, records }) => buildAnchor(coordinateFallback, records))
    .sort((left, right) => left.address.localeCompare(right.address))

  return {
    generatedAt: parsed.data.generatedAt,
    sourceIdentities: parsed.data.records.length,
    expectedAnchors: parsed.data.counts.lookups,
    anchors,
  }
}

export function parseCurrentProjectsMarketMemory(text: string): CurrentProjectsMarketMemoryPreview {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  return parseCurrentProjectsMarketMemoryValue(value)
}

function isMeaningfulPropertyCandidate(candidate: MarketEntityResolutionCandidate) {
  if (candidate.confidence < 60) return false
  return candidate.signals.some((signal) => (
    /exact brokerage memory key|exact municipal account|exact normalized address|coordinates within|exact title number|exact linc|exact plan|exact block|exact lot/i.test(signal)
  ))
}

function hasDecisivePropertyIdentity(candidate: MarketEntityResolutionCandidate) {
  const signals = candidate.signals.join(' | ')
  if (/exact brokerage memory key|exact municipal account|exact title number|exact linc/i.test(signals)) return true
  if (/exact plan/i.test(signals) && /exact lot/i.test(signals)) return true
  return /exact normalized address/i.test(signals) && /coordinates within (?:[0-9]|1[0-9]|2[0-5]) m/i.test(signals)
}

export function resolveMarketMemoryAgainstEntities(
  anchors: MarketMemoryAnchor[],
  entities: ResolvableMarketEntity[],
): MarketMemoryAnchor[] {
  return anchors.map((anchor) => {
    const identities = anchor.legalIdentities.length ? anchor.legalIdentities : [null]
    const candidates = entities
      .map((entity) => identities.reduce<MarketEntityResolutionCandidate | null>((best, identity) => {
        const candidate = scoreMarketEntityCandidate({
          address: anchor.address,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          municipality: anchor.municipality,
          titleNumber: identity?.titleNumber,
          linc: identity?.linc,
          plan: identity?.plan,
          block: identity?.block,
          lot: identity?.lot,
          externalMemoryKey: anchor.id,
          municipalAccountNumbers: anchor.accountNumbers,
        }, entity)
        if (!best || candidate.score > best.score) return candidate
        return best
      }, null))
      .filter((candidate): candidate is MarketEntityResolutionCandidate => Boolean(candidate && isMeaningfulPropertyCandidate(candidate)))
      .sort((left, right) => right.score - left.score || right.confidence - left.confidence)
      .slice(0, 10)
    const topCandidate = candidates[0] || null
    const runnerUp = candidates[1] || null
    const decisive = Boolean(
      topCandidate
      && topCandidate.confidence >= 80
      && topCandidate.conflicts.length === 0
      && hasDecisivePropertyIdentity(topCandidate)
      && (!runnerUp || topCandidate.confidence - runnerUp.confidence >= 10)
    )
    const decision: MarketMemoryResolution['decision'] = decisive
      ? 'link_existing'
      : topCandidate
        ? 'review'
        : 'create_new'
    const resolution: MarketMemoryResolution = { decision, topCandidate, candidates }
    const previewLayer = anchor.baseLayer === 'review' || decision === 'review'
      ? 'review'
      : decision === 'link_existing'
        ? 'existing'
        : 'market_memory'
    return { ...anchor, resolution, previewLayer }
  })
}
