import type { Express, Request, RequestHandler, Response } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'
import { getPropertyLink, type PropertySiteInformationPreview } from '@level-cre/shared'
import { requireBrokerAuth } from '../../auth'
import { lookupEdmontonSiteInformation } from './edmontonAdapter'

type Reader = Pick<Pool, 'query'>
type CoordinateBasis = 'prospect_location' | 'prospect_point' | 'property_location' | 'property_point' | 'dossier' | 'memory'
type Point = { latitude: number; longitude: number }

type DossierRow = {
  id: string
  created_by_user_id: string
  lat: unknown
  lng: unknown
  memory_payload: Record<string, unknown> | null
  linked_prospect_id: string | null
  prospect_id: string | null
  prospect_user_id: string | null
  prospect_metadata: unknown
  prospect_lat: unknown
  prospect_lng: unknown
  prospect_point_lat: unknown
  prospect_point_lng: unknown
  property_prospect_id: string | null
  property_user_id: string | null
  property_metadata: unknown
  property_lat: unknown
  property_lng: unknown
  property_point_lat: unknown
  property_point_lng: unknown
}

export type PropertyGisRouteDependencies = {
  enabled?: () => boolean
  authenticateBroker?: RequestHandler
  lookup?: typeof lookupEdmontonSiteInformation
  now?: () => Date
  recordTimeoutMs?: number
}

const dossierIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const emptyInputSchema = z.object({}).strict()
const MAX_PENDING_RECORD_READS = 8

async function withDeadline<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Property record read timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function point(latitude: unknown, longitude: unknown): Point | null {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null
  const lat = typeof latitude === 'number' ? latitude : typeof latitude === 'string' ? Number(latitude) : NaN
  const lng = typeof longitude === 'number' ? longitude : typeof longitude === 'string' ? Number(longitude) : NaN
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng }
    : null
}

function lookupPoint(row: DossierRow): { point: Point; basis: CoordinateBasis } | null {
  // home.tsx renders Point prospects from geometry even when location_lat/lng
  // differ. Preview the visible pin first; never assign municipal results back
  // to the prospect or treat a broker-drawn polygon as an official parcel.
  const options: Array<[CoordinateBasis, Point | null]> = [
    ['prospect_point', point(row.prospect_point_lat, row.prospect_point_lng)],
    ['prospect_location', point(row.prospect_lat, row.prospect_lng)],
    ['dossier', point(row.lat, row.lng)],
    ['memory', point(row.memory_payload?.latitude, row.memory_payload?.longitude)],
  ]
  for (const [basis, value] of options) if (value) return { point: value, basis }
  return null
}

function hasPropertyLink(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object'
    && (metadata as Record<string, unknown>).propertyLink != null
}

/** Resolve only the same explicit, one-level grouping used by the map. */
function resolvePropertyPoint(row: DossierRow, userId: string): {
  needsReview: boolean
  location: { point: Point; basis: CoordinateBasis } | null
  canonicalProspectId: string | null
  useDossierMunicipality: boolean
} {
  const review = { needsReview: true, location: null, canonicalProspectId: null, useDossierMunicipality: false }
  if (row.linked_prospect_id && (!row.prospect_id || row.prospect_user_id !== userId)) return review
  if (!hasPropertyLink(row.prospect_metadata)) {
    return { needsReview: false, location: lookupPoint(row), canonicalProspectId: row.prospect_id, useDossierMunicipality: true }
  }
  const link = getPropertyLink({ aiMetadata: row.prospect_metadata })
  if (!link || link.propertyProspectId === row.prospect_id
    || !row.property_prospect_id || row.property_prospect_id !== link.propertyProspectId
    || row.property_user_id !== userId || hasPropertyLink(row.property_metadata)) return review

  const geometryPoint = point(row.property_point_lat, row.property_point_lng)
  const savedPoint = point(row.property_lat, row.property_lng)
  const location = geometryPoint ? { point: geometryPoint, basis: 'property_point' as const }
    : savedPoint ? { point: savedPoint, basis: 'property_location' as const } : null
  if (!location) return review
  // An occupant's dossier cannot supply fallback coordinates or municipality
  // for the displayed building. Its explicit owned parent controls this lookup.
  return { needsReview: false, location, canonicalProspectId: row.property_prospect_id, useDossierMunicipality: false }
}

function unavailable(now: () => Date): PropertySiteInformationPreview {
  return {
    schemaVersion: 1,
    status: 'unavailable',
    candidates: [],
    currentZoning: [],
    sources: [],
    warnings: ['Municipal site information is unavailable. Try again later.'],
    retrievedAt: now().toISOString(),
    truncated: false,
  }
}

/** Only SELECTs existing broker-owned records; no seeding, migrations or writes. */
export function registerPropertyGisRoutes(
  app: Express,
  reader: Reader,
  dependencies: PropertyGisRouteDependencies = {},
) {
  const enabled = dependencies.enabled ?? (() => process.env.PROPERTY_GIS_PREVIEW_ENABLED === '1')
  const authenticate = dependencies.authenticateBroker ?? requireBrokerAuth
  const lookup = dependencies.lookup ?? lookupEdmontonSiteInformation
  const now = dependencies.now ?? (() => new Date())
  const recordTimeoutMs = dependencies.recordTimeoutMs ?? 5000
  let pendingRecordReads = 0

  const gate: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store')
    if (!enabled()) {
      res.status(404).json({ code: 'property_gis_preview_disabled', message: 'Site information preview is not enabled.' })
      return
    }
    // The shared broker middleware permits local/demo fallbacks. This route
    // requires a real broker bearer session even when running in development.
    if (req.headers['x-demo-mode'] === 'true' || !req.headers.authorization?.startsWith('Bearer ')) {
      res.status(401).json({ code: 'broker_session_required', message: 'Sign in to preview site information.' })
      return
    }
    if (req.headers['x-levelcre-broker-key']) {
      res.status(403).json({ code: 'broker_session_required', message: 'Site previews require a signed-in broker.' })
      return
    }
    next()
  }

  const handler = async (req: Request, res: Response) => {
    const user = (req as Request & { user?: { id?: string; role?: string } }).user
    if (!user?.id || user.id === 'demo-user' || user.id === 'dev-user') {
      res.status(401).json({ code: 'broker_session_required', message: 'Sign in to preview site information.' })
      return
    }
    if (user.role?.includes('agent')) {
      res.status(403).json({ code: 'broker_session_required', message: 'Site previews require a signed-in broker.' })
      return
    }
    const id = dossierIdSchema.safeParse(req.params.id)
    if (!id.success || !emptyInputSchema.safeParse(req.query).success
      || (req.method === 'POST' && !emptyInputSchema.safeParse(req.body === undefined ? {} : req.body).success)) {
      res.status(400).json({ code: 'invalid_site_preview_request', message: 'Choose an existing property. Site preview uses its saved location.' })
      return
    }

    if (pendingRecordReads >= MAX_PENDING_RECORD_READS) {
      res.status(503).json({ code: 'property_record_busy', message: 'Site information is busy. Try again shortly.' })
      return
    }
    let row: DossierRow | undefined
    try {
      pendingRecordReads++
      // query_timeout bounds an acquired pg client; the outer deadline also
      // bounds time waiting for the pool. Keep queued reads counted until they
      // actually settle so repeated retries cannot create an unbounded queue.
      const query = {
        text: `
        SELECT d.id, d.created_by_user_id, d.lat, d.lng, d.memory_payload,
               d.prospect_id AS linked_prospect_id,
               p.id AS prospect_id, p.user_id AS prospect_user_id, p.ai_metadata AS prospect_metadata,
               p.location_lat AS prospect_lat, p.location_lng AS prospect_lng,
               CASE WHEN ST_GeometryType(p.geometry) = 'ST_Point' AND NOT ST_IsEmpty(p.geometry)
                    THEN ST_Y(p.geometry) ELSE NULL END AS prospect_point_lat,
               CASE WHEN ST_GeometryType(p.geometry) = 'ST_Point' AND NOT ST_IsEmpty(p.geometry)
                    THEN ST_X(p.geometry) ELSE NULL END AS prospect_point_lng,
               property_p.id AS property_prospect_id, property_p.user_id AS property_user_id,
               property_p.ai_metadata AS property_metadata,
               property_p.location_lat AS property_lat, property_p.location_lng AS property_lng,
               CASE WHEN ST_GeometryType(property_p.geometry) = 'ST_Point' AND NOT ST_IsEmpty(property_p.geometry)
                    THEN ST_Y(property_p.geometry) ELSE NULL END AS property_point_lat,
               CASE WHEN ST_GeometryType(property_p.geometry) = 'ST_Point' AND NOT ST_IsEmpty(property_p.geometry)
                    THEN ST_X(property_p.geometry) ELSE NULL END AS property_point_lng
        FROM public.intel_property_dossiers d
        LEFT JOIN public.prospects p ON p.id = d.prospect_id
          AND p.user_id = $2 AND p.merged_into_prospect_id IS NULL
        LEFT JOIN public.prospects property_p
          ON property_p.id = (p.ai_metadata -> 'propertyLink' ->> 'propertyProspectId')
          AND property_p.user_id = $2 AND property_p.merged_into_prospect_id IS NULL
        WHERE d.id = $1 AND d.created_by_user_id = $2 AND d.status <> 'archived'
        LIMIT 1
        `,
        values: [id.data, user.id],
        query_timeout: recordTimeoutMs,
      }
      const pending = Promise.resolve()
        .then(() => reader.query<DossierRow>(query))
        .finally(() => { pendingRecordReads-- })
      const result = await withDeadline(pending, recordTimeoutMs)
      row = result.rows[0]
    } catch {
      res.status(503).json({ code: 'property_record_unavailable', message: 'The property record could not be loaded. Try again later.' })
      return
    }
    if (!row || row.created_by_user_id !== user.id) {
      res.status(404).json({ code: 'property_not_found', message: 'Property not found.' })
      return
    }
    const resolved = resolvePropertyPoint(row, user.id)
    if (resolved.needsReview) {
      res.status(409).json({ code: 'property_location_needs_review', message: 'The property location needs review before parcel information can be checked.' })
      return
    }
    const { location } = resolved
    if (!location) {
      res.status(422).json({ code: 'property_location_missing', message: 'This property needs a saved map location before a parcel preview is available.' })
      return
    }
    const municipality = resolved.useDossierMunicipality && typeof row.memory_payload?.municipality === 'string'
      ? row.memory_payload.municipality.trim().slice(0, 100) || undefined
      : undefined
    let preview: PropertySiteInformationPreview
    try {
      // Only public spatial inputs leave Level CRE. Never send dossier IDs,
      // broker identity, notes, title evidence, or arbitrary source URLs.
      preview = await lookup({ ...location.point, ...(municipality ? { municipality } : {}) })
    } catch {
      preview = unavailable(now)
    }
    res.json({
      ...preview,
      dossierId: row.id,
      canonicalProspectId: resolved.canonicalProspectId,
      lookupOrigin: 'saved_property',
      coordinateBasis: location.basis,
      existingPin: location.point,
      persistence: 'preview_only',
    })
  }

  app.get('/api/intel/dossiers/:id/site-information', gate, authenticate, handler)
  app.post('/api/intel/dossiers/:id/parcel-match/preview', gate, authenticate, handler)

  // Consume unsupported verbs as well: falling through would enter Intel's
  // separate write-capable agent audit middleware on these read-only paths.
  for (const [path, allow] of [
    ['/api/intel/dossiers/:id/site-information', 'GET, HEAD'],
    ['/api/intel/dossiers/:id/parcel-match/preview', 'POST'],
  ]) {
    app.all(path, (_req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      if (!enabled()) {
        res.status(404).json({ code: 'property_gis_preview_disabled', message: 'Site information preview is not enabled.' })
        return
      }
      res.setHeader('Allow', allow)
      res.status(405).json({ code: 'method_not_allowed', message: 'This method is not supported for site information.' })
    })
  }
}
