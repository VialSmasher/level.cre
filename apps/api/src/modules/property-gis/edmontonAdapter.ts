import {
  PropertyGisBoundarySchema,
  PropertyGisLookupInputSchema,
  PropertySiteInformationPreviewSchema,
  type MunicipalParcelCandidate,
  type PropertyGisBoundary,
  type PropertyGisLookupInput,
  type PropertyGisSource,
  type PropertySiteInformationPreview,
  type PropertyZoningEvidence,
} from '@level-cre/shared'
import { boundaryAcres, boundaryPointRelation } from './geometry'

export const EDMONTON_PARCEL_URL = 'https://gis.edmonton.ca/site1/rest/services/VertiGIS/ZoningMap/FeatureServer/1'
export const EDMONTON_ZONING_URL = 'https://data.edmonton.ca/resource/fixa-tstc.json'
const PARCEL_SOURCE = 'edmonton-title-parcels' as const
const MAX_RECORDS = 20
const MAX_BYTES = 512_000
const MAX_VERTICES = 15_000
const MAX_CACHE_ENTRIES = 32
const MAX_IN_FLIGHT = 8
const CACHE_TTL_MS = 180_000
const TIMEOUT_MS = 9000
const AREA_BASIS = 'Calculated spherical geodesic acreage from full municipal WGS84 boundary, excluding holes; screening area, not surveyed or title acreage.'
type Row = Record<string, unknown>
type Options = { fetchImpl?: typeof fetch; now?: () => Date }
type CacheState = {
  results: Map<string, { expiresAt: number; value: PropertySiteInformationPreview }>
  pending: Map<string, Promise<PropertySiteInformationPreview>>
}
// Public coordinates and municipal IDs only. Separate injected fetch clients have
// isolated caches, which also makes fixture tests independent of the live source.
const cacheByFetch = new WeakMap<typeof fetch, CacheState>()

function source(sourceId: string, retrievedAt: string): PropertyGisSource {
  return {
    sourceId,
    title: sourceId === PARCEL_SOURCE ? 'Edmonton municipal title parcel geometry' : 'Edmonton current zoning',
    publisher: 'City of Edmonton',
    url: sourceId === PARCEL_SOURCE ? EDMONTON_PARCEL_URL : EDMONTON_ZONING_URL,
    sourceDate: null,
    sourceDateBasis: null,
    retrievedAt,
  }
}

function responseBase(retrievedAt: string): PropertySiteInformationPreview {
  return { schemaVersion: 1, status: 'unavailable', candidates: [], currentZoning: [], sources: [], warnings: [], retrievedAt, truncated: false }
}

function row(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
}
function text(value: unknown, maxLength = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null
}
function numericId(value: unknown): string | null {
  const candidate = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : ''
  return /^[0-9]{1,18}$/.test(candidate) ? BigInt(candidate).toString() : null
}
function countVertices(boundary: PropertyGisBoundary): number {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  return polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length, 0), 0)
}

async function publicJson(url: URL, fetchImpl: typeof fetch): Promise<unknown> {
  const allowed = [EDMONTON_PARCEL_URL + '/query', EDMONTON_ZONING_URL]
  if (!allowed.includes(url.origin + url.pathname)) throw new Error('Unsupported municipal source')
  const response = await fetchImpl(url.toString(), {
    method: 'GET', credentials: 'omit', redirect: 'error',
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`Municipal source returned HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (contentLength > MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Municipal response exceeds the size limit')
  }
  if (!response.body) throw new Error('Municipal source returned an empty response')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0, body = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Municipal response exceeds the size limit')
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { throw new Error('Municipal source returned invalid JSON') }
  if (row(parsed)?.error) throw new Error('Municipal source reported a query error')
  return parsed
}

function parcelUrl(input: PropertyGisLookupInput): URL {
  const url = new URL(EDMONTON_PARCEL_URL + '/query')
  const id = input.sourceParcelId?.replace(/^edmonton-title-parcels:/, '')
  const params: Record<string, string> = {
    where: id ? `ID=${BigInt(id).toString()}` : '1=1',
    outFields: 'ID,BESTADDRESS,SHORT_LEGAL_LABEL', outSR: '4326', returnGeometry: 'true',
    resultRecordCount: String(MAX_RECORDS), orderByFields: 'OBJECTID ASC', f: 'geojson',
  }
  // Exact-ID lookup intentionally omits the spatial filter, so a conflicting pin
  // can be reported instead of hiding the parcel as a misleading no-match.
  if (!id) Object.assign(params, {
    geometry: `${input.longitude},${input.latitude}`, geometryType: 'esriGeometryPoint',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
  })
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

function zoningUrl(input: PropertyGisLookupInput): URL {
  const url = new URL(EDMONTON_ZONING_URL)
  url.searchParams.set('$select', 'id,zoning,description,date_ext,url')
  url.searchParams.set('$where', `intersects(geometry_multipolygon,'POINT(${input.longitude} ${input.latitude})')`)
  url.searchParams.set('$limit', String(MAX_RECORDS))
  url.searchParams.set('$order', 'id')
  return url
}

function normalizeParcels(raw: unknown, input: PropertyGisLookupInput, retrievedAt: string) {
  const page = row(raw)
  if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) throw new Error('Municipal source returned an invalid parcel collection')
  const features = page.features as unknown[]
  const warnings: string[] = []
  let truncated = features.length >= MAX_RECORDS || page.exceededTransferLimit === true || row(page.properties)?.exceededTransferLimit === true
  if (truncated) warnings.push('Parcel query reached its record limit; additional matches may exist.')
  const grouped = new Map<string, { boundaries: PropertyGisBoundary[]; addresses: Set<string>; legals: Set<string> }>()
  let vertices = 0, incomplete = truncated
  const expectedId = input.sourceParcelId ? BigInt(input.sourceParcelId.replace(/^edmonton-title-parcels:/, '')).toString() : null
  for (const value of features.slice(0, MAX_RECORDS)) {
    const feature = row(value), properties = row(feature?.properties)
    const id = numericId(properties?.ID)
    const parsed = PropertyGisBoundarySchema.safeParse(feature?.geometry)
    if (feature?.type !== 'Feature' || !id || !parsed.success || (expectedId && expectedId !== id)) {
      incomplete = true
      if (!parsed.success && parsed.error.issues.some(issue => issue.code === 'too_big' || issue.message.includes('vertex limit'))) {
        truncated = true
        warnings.push('A municipal boundary exceeded the geometry limit and was excluded.')
      }
      warnings.push('A municipal parcel record had missing or inconsistent identity/geometry and was excluded.')
      continue
    }
    vertices += countVertices(parsed.data)
    if (vertices > MAX_VERTICES) {
      incomplete = true
      truncated = true
      warnings.push('Parcel geometry reached the vertex limit; remaining records were excluded.')
      break
    }
    const group = grouped.get(id) ?? { boundaries: [], addresses: new Set<string>(), legals: new Set<string>() }
    // Repeated source rows must not multiply the mapped area. Distinct pieces
    // are preserved below, with their combined area withheld until reviewed.
    const shapeKey = JSON.stringify(parsed.data)
    if (!group.boundaries.some(existing => JSON.stringify(existing) === shapeKey)) group.boundaries.push(parsed.data)
    const address = text(properties?.BESTADDRESS), legal = text(properties?.SHORT_LEGAL_LABEL)
    if (address) group.addresses.add(address)
    if (legal) group.legals.add(legal)
    grouped.set(id, group)
  }
  const candidates: MunicipalParcelCandidate[] = []
  for (const [id, group] of grouped) {
    const boundary: PropertyGisBoundary = group.boundaries.length === 1 ? group.boundaries[0] : {
      type: 'MultiPolygon', coordinates: group.boundaries.flatMap(part => part.type === 'Polygon' ? [part.coordinates] : part.coordinates),
    }
    const validated = PropertyGisBoundarySchema.safeParse(boundary)
    const measuredAcres = validated.success ? boundaryAcres(validated.data) : null
    if (!measuredAcres) {
      incomplete = true
      warnings.push('A municipal boundary could not be measured reliably and was excluded.')
      continue
    }
    const relation = boundaryPointRelation(boundary, input.longitude, input.latitude)
    const conflicts: string[] = []
    if (relation === 'outside') conflicts.push('The existing pin is outside this municipal boundary.')
    if (relation === 'boundary') conflicts.push('The existing pin lies on a municipal boundary; confirm the correct parcel.')
    if (group.addresses.size > 1 || group.legals.size > 1) conflicts.push('Municipal records with this parcel ID report different address or legal labels.')
    if (group.boundaries.length > 1) conflicts.push('Multiple municipal boundary features share this parcel ID; the returned parts require review. Acreage is withheld because their overlap is unverified.')
    candidates.push({
      sourceId: PARCEL_SOURCE, sourceParcelId: id, sourceQualifiedKey: `${PARCEL_SOURCE}:${id}`, municipality: 'Edmonton',
      address: [...group.addresses].join(' / ') || null, legalDescription: [...group.legals].join(' / ') || null,
      boundary, areaAcres: group.boundaries.length > 1 ? null : measuredAcres,
      areaBasis: group.boundaries.length > 1 ? 'Unknown: multiple source boundaries share this parcel ID and their overlap has not been established.' : AREA_BASIS,
      match: { basis: expectedId ? 'source_parcel_id' : 'point_in_polygon', pinRelation: relation, conflicts },
      source: source(PARCEL_SOURCE, retrievedAt),
    })
  }
  return { candidates: candidates.sort((a, b) => a.sourceParcelId.localeCompare(b.sourceParcelId)), warnings, truncated, incomplete }
}

function normalizeZoning(raw: unknown, retrievedAt: string) {
  if (!Array.isArray(raw)) throw new Error('Municipal source returned an invalid zoning collection')
  const currentZoning: PropertyZoningEvidence[] = [], warnings: string[] = []
  let incomplete = raw.length >= MAX_RECORDS
  if (incomplete) warnings.push('Zoning query reached its record limit; additional point designations may exist.')
  for (const value of raw.slice(0, MAX_RECORDS)) {
    const item = row(value), id = numericId(item?.id), code = text(item?.zoning, 100)
    if (!id || !code) { incomplete = true; warnings.push('An incomplete zoning record was excluded.'); continue }
    const rawDate = text(item?.date_ext, 100)
    const sourceDate = rawDate && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(rawDate) ? rawDate : null
    const recordSource = source('edmonton-current-zoning', retrievedAt)
    recordSource.sourceId = `edmonton-current-zoning:${id}`
    recordSource.sourceDate = sourceDate
    recordSource.sourceDateBasis = sourceDate ? 'Municipal dataset extraction date (date_ext), not a bylaw effective date.' : null
    currentZoning.push({ code, description: text(item?.description), spatialBasis: 'selected_point', parcelCoveragePct: null, source: recordSource })
  }
  if (!currentZoning.length) warnings.push('No current zoning was returned for this point; zoning remains unknown.')
  return { currentZoning, warnings, incomplete, truncated: raw.length >= MAX_RECORDS }
}

async function lookup(input: PropertyGisLookupInput, fetchImpl: typeof fetch, retrievedAt: string) {
  const result = responseBase(retrievedAt)
  result.sources = [source(PARCEL_SOURCE, retrievedAt), source('edmonton-current-zoning', retrievedAt)]
  const [parcelResult, zoningResult] = await Promise.allSettled([
    publicJson(parcelUrl(input), fetchImpl).then(value => normalizeParcels(value, input, retrievedAt)),
    publicJson(zoningUrl(input), fetchImpl).then(value => normalizeZoning(value, retrievedAt)),
  ])
  let healthy = true
  if (parcelResult.status === 'fulfilled') {
    const parcels = parcelResult.value
    result.candidates = parcels.candidates
    result.warnings.push(...parcels.warnings)
    result.truncated ||= parcels.truncated
    healthy &&= !parcels.incomplete
    result.status = !parcels.candidates.length ? (parcels.incomplete ? 'unavailable' : 'not_found')
      : parcels.candidates.length > 1 || parcels.incomplete || parcels.candidates.some(candidate => candidate.match.conflicts.length) ? 'ambiguous' : 'matched'
    if (parcels.candidates.length > 1) result.warnings.push('Multiple municipal parcels match. Review all candidates; none has been linked or approved.')
    if (!parcels.candidates.length && !parcels.incomplete) result.warnings.push('No municipal boundary was returned. This does not establish that the land has no parcel.')
  } else {
    healthy = false
    result.warnings.push(`Parcel source unavailable: ${safeFailure(parcelResult.reason)}.`)
  }
  if (zoningResult.status === 'fulfilled') {
    result.currentZoning = zoningResult.value.currentZoning
    result.warnings.push(...zoningResult.value.warnings)
    result.truncated ||= zoningResult.value.truncated
    healthy &&= !zoningResult.value.incomplete
    if (result.currentZoning.length) result.sources = [source(PARCEL_SOURCE, retrievedAt), ...result.currentZoning.map(item => item.source)]
  } else {
    healthy = false
    result.warnings.push(`Zoning source unavailable: ${safeFailure(zoningResult.reason)}. Zoning remains unknown.`)
  }
  result.warnings.push('Zoning is sampled at the existing pin only; whole-parcel coverage has not been established.', 'Municipal geometry capture date and title currency are unconfirmed. The preview does not establish ownership, availability, or permitted uses.')
  result.warnings = [...new Set(result.warnings)]
  return { result: PropertySiteInformationPreviewSchema.parse(result), healthy }
}

function safeFailure(error: unknown): string {
  if (error instanceof Error && /^(Municipal |Unsupported municipal)/.test(error.message)) return error.message
  if (error instanceof Error && /timeout|abort/i.test(error.name + error.message)) return 'request timed out'
  return 'the public source could not be reached'
}

/** Read-only municipal lookup. A matched preview is not a persisted/approved link. */
export async function lookupEdmontonSiteInformation(rawInput: PropertyGisLookupInput, options: Options = {}): Promise<PropertySiteInformationPreview> {
  const input = PropertyGisLookupInputSchema.parse(rawInput)
  const now = options.now ?? (() => new Date())
  const fetchedAt = now(), retrievedAt = fetchedAt.toISOString()
  const municipality = input.municipality?.trim().toLowerCase()
  if ((municipality && !['edmonton', 'city of edmonton'].includes(municipality)) || input.latitude < 53.2 || input.latitude > 53.9 || input.longitude < -114 || input.longitude > -113) {
    return { ...responseBase(retrievedAt), status: 'unsupported', warnings: ['This preview currently supports Edmonton municipal sources only.'] }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const cache = cacheByFetch.get(fetchImpl) ?? { results: new Map(), pending: new Map() }
  cacheByFetch.set(fetchImpl, cache)
  for (const [key, value] of cache.results) if (value.expiresAt <= fetchedAt.getTime()) cache.results.delete(key)
  const key = `${input.latitude}|${input.longitude}|${input.sourceParcelId ? BigInt(input.sourceParcelId.replace(/^edmonton-title-parcels:/, '')).toString() : ''}`
  const cached = cache.results.get(key)
  if (cached) return structuredClone(cached.value)
  const pending = cache.pending.get(key)
  if (pending) return structuredClone(await pending)
  if (cache.pending.size >= MAX_IN_FLIGHT) return { ...responseBase(retrievedAt), warnings: ['Municipal lookup is busy. Try again shortly.'] }
  const request = lookup(input, fetchImpl, retrievedAt).then(({ result, healthy }) => {
    if (healthy) {
      while (cache.results.size >= MAX_CACHE_ENTRIES) cache.results.delete(cache.results.keys().next().value!)
      cache.results.set(key, { expiresAt: now().getTime() + CACHE_TTL_MS, value: structuredClone(result) })
    }
    return result
  }).finally(() => cache.pending.delete(key))
  cache.pending.set(key, request)
  return structuredClone(await request)
}
