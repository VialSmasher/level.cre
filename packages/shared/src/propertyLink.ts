import { z } from 'zod'

export const PropertyLinkSchema = z.object({
  propertyProspectId: z.string().min(1),
  relationship: z.literal('occupant'),
  source: z.literal('broker'),
  reviewedAt: z.string().datetime(),
  reviewedBy: z.string().min(1),
})

export function getPropertyLink(record: { aiMetadata?: unknown }) {
  const parsed = PropertyLinkSchema.safeParse((record.aiMetadata as any)?.propertyLink)
  return parsed.success ? parsed.data : null
}

/** Only explicit, visible, one-level links group records. Never infer from proximity. */
export function groupPropertyRecords<T extends { id: string; aiMetadata?: unknown }>(records: T[]) {
  const byId = new Map(records.map(record => [record.id, record]))
  const rootById = new Map<string, T>()
  const occupantsById = new Map<string, T[]>()
  for (const record of records) {
    const link = getPropertyLink(record)
    const parent = link ? byId.get(link.propertyProspectId) : undefined
    const root = parent && parent.id !== record.id && !getPropertyLink(parent) ? parent : record
    rootById.set(record.id, root)
    if (root !== record) {
      const occupants = occupantsById.get(root.id) || []
      occupants.push(record)
      occupantsById.set(root.id, occupants)
    }
  }
  return { roots: records.filter(record => rootById.get(record.id) === record), rootById, occupantsById }
}
