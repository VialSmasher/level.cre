// The provider and canonical receipt together distinguish a logged call from imported history.
export const verified = `
  FROM public.contact_interactions i
  JOIN public.activity_events e ON e.interaction_id=i.id AND e.user_id=i.user_id AND e.prospect_id=i.prospect_id
    AND e.source='level_cre_mobile_calling' AND e.evidence_status='confirmed'
  JOIN public.prospects p ON p.id=i.prospect_id AND p.user_id=i.user_id
  WHERE i.user_id=$1 AND i.type='call' AND i.source_provider='level_cre_mobile'
    AND p.merged_into_prospect_id IS NULL`
export const revision = "i.source_metadata->>'callNoteRevision'"
export const review = "i.source_metadata->'callNoteReview'"
export const cleaned = "i.source_metadata->'callNoteCleanup'"
export const fields = `i.id, i.prospect_id AS "prospectId", COALESCE(NULLIF(p.business_name,''),p.name) AS company,
  e.occurred_at AS "occurredAt", i.outcome, i.notes, i.source_metadata->>'contactId' AS "contactId",
  i.source_metadata->'contactSnapshot'->>'name' AS "dialedContact", ${revision} AS revision,
  CASE WHEN ${cleaned}->>'revision'=${revision} THEN ${cleaned}->>'text' END AS "cleanedNote"`

export const openSuggestions = `SELECT ${fields}, ${review} AS recommendation ${verified}
  AND ${review}->>'revision'=${revision} AND ${review}->>'state'='suggested'`
