import { z } from 'zod'

import {
  resolveMarketEntities,
  type MarketEntityResolutionCandidate,
  type ResolvableMarketEntity,
} from '@level-cre/shared/entityResolution'
import type { Prospect } from '@level-cre/shared/schema'

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

const enrichedFileSchema = z.object({
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
}

export type CurrentProjectsMarketMemoryPreview = {
  generatedAt: string
  sourceIdentities: number
  expectedAnchors: number
  anchors: MarketMemoryAnchor[]
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

function normalizedIssue(record: EnrichedRecord) {
  return record.derived.issues.filter((issue) => (
    record.derived.systemPriority.toLowerCase() === 'high'
    ||
    issue.severity.toLowerCase() === 'high'
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
  if (records.length > 1) {
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
    id: `edmonton-point:${key}`,
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
  }
}

export function parseCurrentProjectsMarketMemory(text: string): CurrentProjectsMarketMemoryPreview {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const parsed = enrichedFileSchema.safeParse(value)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const location = firstIssue?.path.length ? ` (${firstIssue.path.join('.')})` : ''
    throw new Error(`This is not the Current Projects Edmonton enrichment file${location}.`)
  }

  const groups = new Map<string, EnrichedRecord[]>()
  for (const record of parsed.data.records) {
    const key = coordinateKey(record)
    groups.set(key, [...(groups.get(key) || []), record])
  }
  const anchors = Array.from(groups.entries())
    .map(([key, records]) => buildAnchor(key, records))
    .sort((left, right) => left.address.localeCompare(right.address))

  return {
    generatedAt: parsed.data.generatedAt,
    sourceIdentities: parsed.data.records.length,
    expectedAnchors: parsed.data.counts.lookups,
    anchors,
  }
}

function prospectPoint(prospect: Prospect) {
  if (prospect.locationLat != null && prospect.locationLng != null) {
    return { latitude: prospect.locationLat, longitude: prospect.locationLng }
  }
  if (prospect.geometry?.type === 'Point' && Array.isArray(prospect.geometry.coordinates)) {
    const [longitude, latitude] = prospect.geometry.coordinates as [number, number]
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {}
  }
  return {}
}

export function resolveMarketMemoryAgainstProspects(
  anchors: MarketMemoryAnchor[],
  prospects: Prospect[],
): MarketMemoryAnchor[] {
  const entities: ResolvableMarketEntity[] = prospects.map((prospect) => ({
    entityType: 'prospect',
    id: prospect.id,
    label: prospect.name,
    address: prospect.address || prospect.name,
    ...prospectPoint(prospect),
    marketKey: prospect.marketKey,
    phone: prospect.contactPhone,
    email: prospect.contactEmail,
    websiteUrl: prospect.websiteUrl,
    businessName: prospect.businessName || prospect.contactCompany || prospect.name,
  }))

  return anchors.map((anchor) => {
    const identity = anchor.legalIdentities[0]
    const resolution = resolveMarketEntities({
      address: anchor.address,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      businessName: anchor.projects[0],
      municipality: anchor.municipality,
      titleNumber: identity?.titleNumber,
      linc: identity?.linc,
      plan: identity?.plan,
      block: identity?.block,
      lot: identity?.lot,
    }, entities)
    const previewLayer = anchor.baseLayer === 'review' || resolution.decision === 'review'
      ? 'review'
      : resolution.decision === 'link_existing'
        ? 'existing'
        : 'market_memory'
    return { ...anchor, resolution, previewLayer }
  })
}
