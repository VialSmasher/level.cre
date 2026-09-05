import { sql, type SQLWrapper } from 'drizzle-orm'
import type { PropertyClassificationType } from '@level-cre/shared'

/** Merge at write time rather than sending a stale metadata snapshot from the browser. */
export function classificationMetadataPatch(column: SQLWrapper, classification: PropertyClassificationType | null, userId: string) {
  return classification === null
    ? sql`COALESCE(${column}, '{}'::jsonb) - 'propertyClassification'`
    : sql`COALESCE(${column}, '{}'::jsonb) || ${JSON.stringify({propertyClassification: {classification, source: 'broker', reviewedAt: new Date().toISOString(), reviewedBy: userId}})}::jsonb`
}

/** Generic imports/edits cannot erase or create validated building associations. */
export function metadataPatchPreservingPropertyLinks(column: SQLWrapper, value: Record<string, unknown> | null) {
  const cleaned = value ? {...value} : null
  if (cleaned) { delete cleaned.propertyLink; delete cleaned.propertyLinkHistory }
  const incoming = cleaned === null ? null : JSON.stringify(cleaned)
  return sql`CASE WHEN NOT (COALESCE(${column}, '{}'::jsonb) ?| ARRAY['propertyLink','propertyLinkHistory'])
    THEN ${incoming}::jsonb ELSE COALESCE(${incoming}::jsonb, '{}'::jsonb)
    || CASE WHEN ${column} ? 'propertyLink' THEN jsonb_build_object('propertyLink', ${column}->'propertyLink') ELSE '{}'::jsonb END
    || CASE WHEN ${column} ? 'propertyLinkHistory' THEN jsonb_build_object('propertyLinkHistory', ${column}->'propertyLinkHistory') ELSE '{}'::jsonb END END`
}
