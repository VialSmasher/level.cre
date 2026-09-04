import { z } from 'zod'

export const INVENTORY_CLASSES = ['multi_tenant', 'single_tenant', 'developed_land', 'office'] as const
export type InventoryClassification = typeof INVENTORY_CLASSES[number]
export const INVENTORY_CLASS_META: Record<InventoryClassification, { label: string; color: string; marker: string }> = {
  multi_tenant: { label: 'Multi-tenant', color: '#7C3AED', marker: 'M' },
  single_tenant: { label: 'Single-tenant', color: '#2563EB', marker: 'S' },
  developed_land: { label: 'Developed land / yards', color: '#B45309', marker: 'Y' },
  office: { label: 'Office', color: '#0F766E', marker: 'O' },
}
export const INVENTORY_CONFIDENCE = ['high', 'med', 'low', 'unrated'] as const
const optionalText = z.string().max(30000).nullable()
const optionalNumber = z.number().finite().nonnegative().nullable()
export const PropertyInventorySchema = z.object({
  version: z.literal(1),
  datasetId: z.string().min(1).max(120),
  name: z.string().min(1).max(1000),
  address: z.string().max(1000),
  municipality: z.string().min(1).max(120),
  businessPark: optionalText,
  classification: z.enum(INVENTORY_CLASSES),
  confidence: z.enum(INVENTORY_CONFIDENCE),
  subFilters: z.array(z.string().max(100)).max(50),
  occupant: optionalText,
  ownerOccGuess: optionalText,
  covenantStrength: optionalText,
  zoning: optionalText,
  assessment: optionalNumber,
  yearBuilt: z.number().int().min(1700).max(2200).nullable(),
  yearBuiltText: optionalText,
  titleRecords: z.array(z.object({
    titleNumber: z.string().min(1).max(120), legal: z.string().max(1000),
    lastSaleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sourceRow: z.number().int().min(2),
  })).min(1).max(100),
  notes: z.string().max(100000),
  costar: z.object({ propertyId: optionalText, owner: optionalText, contacts: optionalText, buildingSf: optionalNumber, buildingSfText: optionalText, notes: optionalText }),
  source: z.object({file: z.string().max(500), sheet: z.string().max(120), sha256: z.string().regex(/^[a-f0-9]{64}$/), reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
})
export type PropertyInventory = z.infer<typeof PropertyInventorySchema>
export const PropertyInventoryRecordSchema = z.object({
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  inventory: PropertyInventorySchema,
})
export type PropertyInventoryRecord = z.infer<typeof PropertyInventoryRecordSchema>

export function getPropertyInventory(prospect: {aiMetadata?: unknown} | null | undefined): PropertyInventory | null {
  const metadata = prospect?.aiMetadata as {propertyInventory?: unknown} | undefined
  if (!metadata?.propertyInventory) return null
  const result = PropertyInventorySchema.safeParse(metadata?.propertyInventory)
  return result.success ? result.data : null
}

/** Keeps civic/unit distinctions, strips only the supplied municipality and address formatting. */
export function inventoryAddressKey(address: string, municipality: string): string {
  let normalized = address.toUpperCase().replace(/\([^)]*\)/g, '').replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1')
  const municipalityTokens = municipality.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
  if (municipalityTokens) normalized = normalized.split(new RegExp('\\b' + municipalityTokens.replace(/ /g, '\\s+') + '\\b'))[0]
  normalized = normalized.replace(/\bAVENUE\b/g, 'AVE').replace(/\bSTREET\b/g, 'ST').replace(/\bROAD\b/g, 'RD')
    .replace(/\b(ALBERTA|CANADA)\b/g, '').replace(/\bAB\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
  return normalized ? municipalityTokens.replace(/ /g, '') + ':' + normalized : ''
}
