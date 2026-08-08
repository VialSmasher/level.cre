import { z } from 'zod'

export const PROPERTY_TITLE_AUDIT_SOURCE = 'codex_property_title_audit' as const

const eventDraftSchema = z.object({
  source: z.literal(PROPERTY_TITLE_AUDIT_SOURCE),
  externalEventId: z.string().trim().min(1),
  eventType: z.enum(['title_pulled', 'owner_identified', 'note']),
  direction: z.literal('internal'),
  evidenceStatus: z.literal('observed'),
  occurredAt: z.string().trim().min(1),
  company: z.string().nullable().optional(),
  subject: z.string().trim().min(1),
  summary: z.string(),
  propertyAddress: z.string().nullable(),
  confidence: z.number().int().min(0).max(100),
  matchStatus: z.enum(['matched', 'needs_review']),
  matchReason: z.string(),
  prospectId: z.string().nullable().optional(),
  sourceMetadata: z.record(z.unknown()),
})

const importCaseSchema = z.object({
  caseId: z.string().trim().min(1),
  folderName: z.string().trim().min(1),
  group: z.string().trim().min(1),
  groupLabel: z.string().trim().min(1),
  verifiedAddress: z.string().nullable(),
  eventDrafts: z.array(eventDraftSchema),
  candidateIds: z.array(z.string()),
  matchSignals: z.array(z.string()),
  matchConflicts: z.array(z.string()),
  fieldsThatWouldBeWritten: z.array(z.string()),
  noMapMutationReason: z.string().nullable(),
  recommendedAction: z.string().nullable(),
})

const dryRunSchema = z.object({
  mode: z.literal('dry_run'),
  source: z.literal(PROPERTY_TITLE_AUDIT_SOURCE),
  generatedAt: z.string().trim().min(1),
  summary: z.object({
    cases: z.number().int().nonnegative(),
    eventDrafts: z.number().int().nonnegative(),
    proposalDrafts: z.number().int().nonnegative(),
    groups: z.record(z.number().int().nonnegative()),
  }),
  cases: z.array(importCaseSchema).min(1),
})

export type PropertyEvidenceEventDraft = z.infer<typeof eventDraftSchema>
export type PropertyEvidenceImportCase = z.infer<typeof importCaseSchema>
export type PropertyEvidenceDryRun = z.infer<typeof dryRunSchema>

export type PropertyEvidenceBatch = {
  source: typeof PROPERTY_TITLE_AUDIT_SOURCE
  events: PropertyEvidenceEventDraft[]
}

export function parsePropertyEvidenceDryRun(text: string): PropertyEvidenceDryRun {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  const result = dryRunSchema.safeParse(value)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    const location = firstIssue?.path.length ? ` (${firstIssue.path.join('.')})` : ''
    throw new Error(`This is not a Level CRE property-title dry run${location}.`)
  }
  return result.data
}

export function buildPropertyEvidenceBatch(
  dryRun: PropertyEvidenceDryRun,
  selectedCaseIds: Iterable<string>,
): PropertyEvidenceBatch {
  const selected = new Set(selectedCaseIds)
  const events = dryRun.cases.flatMap((item) => selected.has(item.caseId) ? item.eventDrafts : [])
  if (events.length === 0) throw new Error('Select at least one case that contains evidence.')
  if (events.length > 500) throw new Error('This selection contains more than 500 evidence events. Import a smaller batch.')
  return { source: PROPERTY_TITLE_AUDIT_SOURCE, events }
}
