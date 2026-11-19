import { z } from 'zod'

export const DirectoryContextSchema = z.object({
  roles: z.array(z.enum(['real_estate','operations','facilities','finance','director','unknown'])).min(1).max(6),
  scope: z.string().trim().max(500).default(''),
  legalEntity: z.string().trim().max(300).default(''),
  jurisdiction: z.string().trim().max(120).default(''),
  registryNumber: z.string().trim().max(120).default(''),
  sourceType: z.enum(['broker_knowledge','company_website','corporate_search','email','linkedin','other']),
  sourceRef: z.string().trim().max(2000).default(''),
  asOf: z.union([z.string().date(), z.literal('')]).default(''),
  evidenceStatus: z.enum(['recorded','observed','inferred']),
  notes: z.string().trim().max(4000).default(''),
}).strict().superRefine((context, validation) => {
  if (context.sourceType === 'corporate_search' &&
      (!context.legalEntity || !context.jurisdiction || !context.sourceRef || !context.asOf)) {
    validation.addIssue({code:'custom',message:'Corporate searches need the legal entity, jurisdiction, source reference and search date.'})
  }
})
export type DirectoryContext = z.infer<typeof DirectoryContextSchema>
