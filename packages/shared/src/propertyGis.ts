import { z } from 'zod'

// These are public municipal observations. Dossier/user IDs and broker approval
// deliberately live outside this preview contract.
const PositionSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)])
const RingSchema = z.array(PositionSchema).min(4).max(15_000).refine(
  ring => ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1],
  'Municipal rings must be closed',
)
const PolygonCoordinatesSchema = z.array(RingSchema).min(1).max(100)

export const PropertyGisBoundarySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: PolygonCoordinatesSchema }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(PolygonCoordinatesSchema).min(1).max(100) }),
]).superRefine((boundary, context) => {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  const vertices = polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length, 0), 0)
  if (vertices > 15_000) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Municipal boundary exceeds the vertex limit' })
})
export type PropertyGisBoundary = z.infer<typeof PropertyGisBoundarySchema>

export const PropertyGisLookupInputSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  municipality: z.string().trim().min(1).max(100).optional(),
  sourceParcelId: z.string().trim().regex(/^(?:edmonton-title-parcels:)?[0-9]{1,18}$/).optional(),
}).strict()
export type PropertyGisLookupInput = z.infer<typeof PropertyGisLookupInputSchema>

export const PropertyGisSourceSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url(),
  sourceDate: z.string().nullable(),
  sourceDateBasis: z.string().nullable(),
  retrievedAt: z.string().datetime(),
})
export type PropertyGisSource = z.infer<typeof PropertyGisSourceSchema>

export const MunicipalParcelCandidateSchema = z.object({
  sourceId: z.literal('edmonton-title-parcels'),
  sourceParcelId: z.string(),
  sourceQualifiedKey: z.string(),
  municipality: z.literal('Edmonton'),
  address: z.string().nullable(),
  legalDescription: z.string().nullable(),
  boundary: PropertyGisBoundarySchema,
  areaAcres: z.number().finite().positive().nullable(),
  areaBasis: z.string(),
  match: z.object({
    basis: z.enum(['point_in_polygon', 'source_parcel_id']),
    pinRelation: z.enum(['inside', 'boundary', 'outside']),
    conflicts: z.array(z.string()),
  }),
  source: PropertyGisSourceSchema,
})
export type MunicipalParcelCandidate = z.infer<typeof MunicipalParcelCandidateSchema>

export const PropertyZoningEvidenceSchema = z.object({
  code: z.string(),
  description: z.string().nullable(),
  spatialBasis: z.literal('selected_point'),
  parcelCoveragePct: z.null(),
  source: PropertyGisSourceSchema,
})
export type PropertyZoningEvidence = z.infer<typeof PropertyZoningEvidenceSchema>

export const PropertySiteInformationPreviewSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['matched', 'ambiguous', 'not_found', 'unavailable', 'unsupported']),
  candidates: z.array(MunicipalParcelCandidateSchema).max(20),
  currentZoning: z.array(PropertyZoningEvidenceSchema).max(20),
  sources: z.array(PropertyGisSourceSchema),
  warnings: z.array(z.string()),
  retrievedAt: z.string().datetime(),
  truncated: z.boolean(),
})
export type PropertySiteInformationPreview = z.infer<typeof PropertySiteInformationPreviewSchema>
