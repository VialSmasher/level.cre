import { sql, type SQLWrapper } from 'drizzle-orm'
import type { PropertyClassificationType } from '@level-cre/shared'

/** Merge at write time rather than sending a stale metadata snapshot from the browser. */
export function classificationMetadataPatch(column: SQLWrapper, classification: PropertyClassificationType | null, userId: string) {
  return classification === null
    ? sql`COALESCE(${column}, '{}'::jsonb) - 'propertyClassification'`
    : sql`COALESCE(${column}, '{}'::jsonb) || ${JSON.stringify({propertyClassification: {classification, source: 'broker', reviewedAt: new Date().toISOString(), reviewedBy: userId}})}::jsonb`
}
