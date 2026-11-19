import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'
import { outcomeSummary, type MobileCallOutcome } from './mobileCallingService'

export const noteEdit = z.object({
  expectedRevision: z.string().uuid().nullable(),
  notes: z.string().trim().max(2000),
}).strict()

const proposed = z.object({
  state: z.literal('suggested'),
  channel: z.enum(['call', 'email']),
  dueOn: z.string().date(),
  reason: z.string().trim().min(1).max(500),
  ifMissed: z.string().trim().max(260),
}).strict()
export const interpretation = z.object({
  revision: z.string().uuid(),
  decision: z.discriminatedUnion('state', [proposed, z.object({ state: z.literal('no_action') }).strict()]),
}).strict()

export const cleanup = z.object({
  revision: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
}).strict()

// The provider and canonical receipt together distinguish a logged call from imported history.
const verified = `
  FROM public.contact_interactions i
  JOIN public.activity_events e ON e.interaction_id=i.id AND e.user_id=i.user_id AND e.prospect_id=i.prospect_id
    AND e.source='level_cre_mobile_calling' AND e.evidence_status='confirmed'
  JOIN public.prospects p ON p.id=i.prospect_id AND p.user_id=i.user_id
  WHERE i.user_id=$1 AND i.type='call' AND i.source_provider='level_cre_mobile'
    AND p.merged_into_prospect_id IS NULL`
const revision = "i.source_metadata->>'callNoteRevision'"
const review = "i.source_metadata->'callNoteReview'"
const cleaned = "i.source_metadata->'callNoteCleanup'"
const needsCleanup = `(${cleaned}->>'revision') IS DISTINCT FROM (${revision})`
const needsReview = `(${review}->>'revision') IS DISTINCT FROM (${revision})`
const fields = `i.id, i.prospect_id AS "prospectId", COALESCE(NULLIF(p.business_name,''),p.name) AS company,
  e.occurred_at AS "occurredAt", i.outcome, i.notes, i.source_metadata->>'contactId' AS "contactId",
  i.source_metadata->'contactSnapshot'->>'name' AS "dialedContact", ${revision} AS revision,
  CASE WHEN ${cleaned}->>'revision'=${revision} THEN ${cleaned}->>'text' END AS "cleanedNote"`

export async function readCallNote(db:Pool, owner:string, prospectId:string, id:string) {
  const {rows:[row]} = await db.query(`SELECT ${fields} ${verified} AND i.id=$2 AND i.prospect_id=$3`,[owner,id,prospectId])
  if (!row) throw Object.assign(new Error('Logged call not found.'),{status:404})
  return row
}

export function pendingCallNotes(db: Pool, owner: string) {
  return db.query(`SELECT ${fields}, i.next_follow_up AS "manualFollowUp",
    i.source_metadata->'followUpSelected' AS "followUpSelected", p.follow_up_due_date AS "accountFollowUp",
    i.source_metadata->'callNoteLastTouch' AS "laterCall", i.source_metadata->'callNotePreviousPlan' AS "priorPlan", ${review} AS "previousDecision",
    ${needsCleanup} AS "needsCleanup", ${needsReview} AS "needsReview"
    ${verified} AND ${revision} IS NOT NULL AND btrim(i.notes)<>''
      AND (${needsReview} OR ${needsCleanup})
    ORDER BY e.occurred_at, i.id LIMIT 21`, [owner])
}

export function suggestedCalls(db: Pool, owner: string) {
  return db.query(`SELECT ${fields}, ${review} AS recommendation ${verified}
    AND ${review}->>'revision'=${revision} AND ${review}->>'state'='suggested'
    ORDER BY ${review}->>'dueOn', e.occurred_at, i.id`, [owner])
}

const conflict = () => Object.assign(new Error('This call changed. Reload its current note before saving.'), {status:409})

export async function editCallNote(pool: Pool, owner: string, prospectId: string, id: string, input: z.infer<typeof noteEdit>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows:[row]} = await client.query(`SELECT ${fields}, e.id AS event_id ${verified}
      AND i.id=$2 AND i.prospect_id=$3 FOR UPDATE OF i,e`, [owner,id,prospectId])
    if (!row) throw Object.assign(new Error('Logged call not found.'), {status:404})
    if ((row.notes || '') !== input.notes) {
      if (row.revision !== input.expectedRevision) throw conflict()
      row.revision = randomUUID()
      await client.query(`UPDATE public.contact_interactions SET notes=$3,
        source_metadata=(COALESCE(source_metadata,'{}'::jsonb) - 'callNoteReview' - 'callNoteCleanup') ||
          jsonb_build_object('callNoteRevision',$4::text) WHERE user_id=$1 AND id=$2`, [owner,id,input.notes,row.revision])
      await client.query(`UPDATE public.activity_events SET summary=$3, updated_at=now() WHERE user_id=$1 AND id=$2`,
        [owner,row.event_id,outcomeSummary(row.outcome as MobileCallOutcome,input.notes)])
    }
    await client.query('COMMIT')
    return {id, notes:input.notes, revision:row.revision}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function interpretCallNote(db: Pool, owner: string, id: string, input: z.infer<typeof interpretation>) {
  const decision = {...input.decision, revision:input.revision}
  const result = await db.query(`UPDATE public.contact_interactions i SET source_metadata =
    jsonb_set(i.source_metadata, '{callNoteReview}', $4::jsonb)
    WHERE i.user_id=$1 AND i.id=$2 AND i.source_provider='level_cre_mobile' AND i.type='call'
      AND i.notes<>'' AND ${revision}=$3 AND i.id IN (SELECT i.id ${verified} AND i.id=$2)
      AND ((${review}->>'revision') IS DISTINCT FROM $3 OR ${review}=$4::jsonb)
    RETURNING i.id, ${review} AS decision`, [owner,id,input.revision,JSON.stringify(decision)])
  if (!result.rows[0]) throw conflict()
  return result.rows[0]
}

export async function cleanCallNote(db: Pool, owner: string, id: string, input: z.infer<typeof cleanup>) {
  const {rows} = await db.query(`UPDATE public.contact_interactions i SET source_metadata =
    jsonb_set(i.source_metadata, '{callNoteCleanup}', $4::jsonb)
    WHERE i.user_id=$1 AND i.id=$2 AND ${revision}=$3 AND btrim(i.notes)<>''
      AND i.id IN (SELECT i.id ${verified} AND i.id=$2)
      AND (${needsCleanup} OR ${cleaned}=$4::jsonb)
    RETURNING i.id, ${cleaned}->>'text' AS "cleanedNote"`, [owner,id,input.revision,JSON.stringify(input)])
  if (!rows.length) throw conflict()
  return rows[0]
}

export async function finishCallSuggestion(db: Pool, owner: string, id: string, version: string, state:'done'|'dismissed') {
  const result = await db.query(`UPDATE public.contact_interactions i SET source_metadata =
    jsonb_set(i.source_metadata, '{callNoteReview,state}',to_jsonb($4::text))
    WHERE i.user_id=$1 AND i.id=$2 AND ${revision}=$3 AND ${review}->>'revision'=$3
      AND ${review}->>'state' IN ('suggested',$4) AND i.id IN (SELECT i.id ${verified} AND i.id=$2)
    RETURNING i.id`, [owner,id,version,state])
  if (!result.rows[0]) throw conflict()
}
