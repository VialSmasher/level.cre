import { z } from 'zod'
import { INVENTORY_CLASSES, getPropertyInventory } from './propertyInventory'

export const PropertyClassificationValue = z.enum([...INVENTORY_CLASSES, 'unknown'])
export type PropertyClassificationType = z.infer<typeof PropertyClassificationValue>
export const BrokerClassificationSchema = z.object({
  classification: PropertyClassificationValue,
  source: z.literal('broker'),
  reviewedAt: z.string().datetime(),
  reviewedBy: z.string().min(1),
})
export type BrokerClassification = z.infer<typeof BrokerClassificationSchema>
export function getBrokerClassification(prospect: {aiMetadata?: unknown}) {
  const metadata = prospect.aiMetadata as Record<string, unknown> | undefined
  if (!metadata?.propertyClassification) return null
  const result = BrokerClassificationSchema.safeParse(metadata?.propertyClassification)
  return result.success ? result.data : null
}
export function getPropertyClassification(prospect: {aiMetadata?: unknown}): PropertyClassificationType {
  return getBrokerClassification(prospect)?.classification ?? getPropertyInventory(prospect)?.classification ?? 'unknown'
}

/** Uses the newest recorded title, so one old title cannot overstate the whole site's tenure. */
export function registrationHistory(dates: string[], now = new Date()) {
  if (!dates.length) return null
  const valid = dates.filter(value => {
    const date = new Date(value + 'T00:00:00Z')
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  })
  if (valid.length !== dates.length) return null
  const latest = [...valid].sort().at(-1)!
  const date = new Date(latest + 'T00:00:00Z')
  if (date > now) return null
  let years = now.getUTCFullYear() - date.getUTCFullYear()
  if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) years--
  return {latest, years, longHeld: years >= 15, titleCount: dates.length}
}
