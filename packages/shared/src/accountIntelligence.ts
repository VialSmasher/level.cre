import { z } from 'zod'

export const IntelligenceOrganizationKindSchema = z.enum([
  'corporate_account',
  'brokerage_firm',
  'other',
])

export const AccountExperienceClassificationSchema = z.enum([
  'confirmed_current_account_lead',
  'confirmed_current_account_team_member',
  'historical_account_lead',
  'historical_account_team_member',
  'completed_transaction_experience',
  'official_biography_client_disclosure',
  'assignment_disclosure',
  'referral_source_only',
  'client_side_corporate_real_estate_contact',
  'firm_account_relationship',
  'unverified_or_inferred_relationship',
])

export const AccountExperienceAssetClassSchema = z.enum([
  'industrial',
  'office',
  'retail',
  'land',
  'investment',
  'multifamily',
  'hospitality',
  'mixed',
  'other',
  'unknown',
])

export const AccountRelationshipStatusSchema = z.enum([
  'current',
  'historical',
  'completed',
  'unknown',
])

export const AccountJurisdictionScopeSchema = z.enum([
  'global',
  'north_american',
  'us',
  'canadian',
  'regional',
  'local',
  'unknown',
])

export const RelationshipEvidenceTypeSchema = z.enum([
  'direct_broker_email',
  'direct_client_email',
  'official_company_biography',
  'official_transaction_announcement',
  'listing_or_assignment_brochure',
  'linkedin',
  'company_website',
  'directory_source',
  'patrick_direct_knowledge',
  'internal_referral',
  'other',
])

const OptionalUrlSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().url().max(2000).optional(),
)

const OptionalDateSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
)

const OptionalDateTimeSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().datetime({ offset: true }).optional(),
)

export const IntelligenceOrganizationInputSchema = z.object({
  ref: z.string().trim().min(1).max(120),
  externalKey: z.string().trim().min(1).max(240).optional(),
  kind: IntelligenceOrganizationKindSchema,
  name: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(300)).max(100).optional().default([]),
  websiteUrl: OptionalUrlSchema,
  industry: z.string().trim().max(180).optional(),
  parentOrganizationRef: z.string().trim().min(1).max(120).optional(),
  parentOrganizationId: z.string().uuid().optional(),
  canadianPresence: z.enum(['confirmed', 'possible', 'none_known', 'unknown']).optional().default('unknown'),
  edmontonNorthernAlbertaPresence: z.enum(['confirmed', 'possible', 'none_known', 'unknown']).optional().default('unknown'),
  canadianPursuitPosture: z.enum(['open', 'relationship_route', 'hold', 'blocked_confirmed', 'unknown']).optional().default('unknown'),
  notes: z.string().trim().max(2000).optional(),
})

export const IntelligencePersonInputSchema = z.object({
  ref: z.string().trim().min(1).max(120),
  externalKey: z.string().trim().min(1).max(240).optional(),
  fullName: z.string().trim().min(1).max(240),
  businessEmail: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().email().max(320).toLowerCase().optional(),
  ),
  phone: z.string().trim().max(80).optional(),
  linkedinUrl: OptionalUrlSchema,
  biographyUrl: OptionalUrlSchema,
  biographyCapturedAt: OptionalDateTimeSchema,
  currentOrganizationRef: z.string().trim().min(1).max(120).optional(),
  currentOrganizationId: z.string().uuid().optional(),
  title: z.string().trim().max(240).optional(),
  office: z.string().trim().max(240).optional(),
  market: z.string().trim().max(240).optional(),
  specialties: z.array(z.string().trim().min(1).max(120)).max(100).optional().default([]),
  geographicFocus: z.array(z.string().trim().min(1).max(120)).max(100).optional().default([]),
  active: z.boolean().optional().default(true),
})

export const RelationshipEvidenceInputSchema = z.object({
  externalEvidenceId: z.string().trim().min(1).max(240),
  evidenceType: RelationshipEvidenceTypeSchema,
  evidenceDate: OptionalDateSchema,
  capturedAt: OptionalDateTimeSchema,
  sourceUrl: OptionalUrlSchema,
  outlookMessageId: z.string().trim().max(500).optional(),
  summary: z.string().trim().min(1).max(2000),
  exactAccountOrAssignment: z.string().trim().max(1000).optional(),
  sourceReliability: z.enum(['high', 'medium', 'low', 'unknown']).optional().default('unknown'),
  confidence: z.number().int().min(0).max(100).optional().default(0),
  stance: z.enum(['supports', 'contradicts', 'limits']).optional().default('supports'),
  contradictionOrLimitationNotes: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (!value.sourceUrl && !value.outlookMessageId && !value.externalEvidenceId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['externalEvidenceId'],
      message: 'Evidence needs a durable source identity',
    })
  }
})

export const AccountExperienceInputSchema = z.object({
  ref: z.string().trim().min(1).max(120),
  externalKey: z.string().trim().min(1).max(240).optional(),
  subjectType: z.enum(['person', 'firm']),
  personRef: z.string().trim().min(1).max(120).optional(),
  personId: z.string().uuid().optional(),
  firmOrganizationRef: z.string().trim().min(1).max(120).optional(),
  firmOrganizationId: z.string().uuid().optional(),
  accountOrganizationRef: z.string().trim().min(1).max(120).optional(),
  accountOrganizationId: z.string().uuid().optional(),
  classification: AccountExperienceClassificationSchema,
  accountRole: z.string().trim().max(240).optional(),
  assignmentScope: z.string().trim().max(500).optional(),
  assetClasses: z.array(AccountExperienceAssetClassSchema).min(1).max(10).optional().default(['unknown']),
  serviceLine: z.string().trim().max(240).optional(),
  propertyType: z.string().trim().max(240).optional(),
  transactionType: z.string().trim().max(240).optional(),
  transactionSizeSf: z.number().nonnegative().optional(),
  transactionLocation: z.string().trim().max(500).optional(),
  geography: z.string().trim().max(500).optional(),
  jurisdictionScope: AccountJurisdictionScopeSchema.optional().default('unknown'),
  relationshipStatus: AccountRelationshipStatusSchema.optional().default('unknown'),
  relationshipStartDate: OptionalDateSchema,
  relationshipEndDate: OptionalDateSchema,
  lastVerifiedAt: OptionalDateTimeSchema,
  confidence: z.number().int().min(0).max(100).optional().default(0),
  recommendedUse: z.string().trim().max(1000).optional(),
  limitations: z.string().trim().max(2000).optional(),
  outreachStatus: z.enum(['not_started', 'researching', 'outreach_required', 'contacted', 'responded', 'do_not_contact']).optional().default('not_started'),
  evidence: z.array(RelationshipEvidenceInputSchema).min(1).max(100),
}).superRefine((value, context) => {
  const uniqueAssetClasses = new Set(value.assetClasses)
  if (uniqueAssetClasses.size !== value.assetClasses.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetClasses'], message: 'Asset classes must be unique' })
  }
  if (value.assetClasses.includes('unknown') && value.assetClasses.length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetClasses'], message: 'Unknown cannot be combined with a known asset class' })
  }
  if (value.subjectType === 'person' && !value.personRef && !value.personId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['personRef'], message: 'A person reference or ID is required' })
  }
  if (value.subjectType === 'firm' && !value.firmOrganizationRef && !value.firmOrganizationId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['firmOrganizationRef'], message: 'A firm organization reference or ID is required' })
  }
  if (!value.accountOrganizationRef && !value.accountOrganizationId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['accountOrganizationRef'], message: 'An account organization reference or ID is required' })
  }
})

export const AccountIntelligenceBatchSchema = z.object({
  externalBatchId: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(80).default('codex_broker_research'),
  observedAt: OptionalDateTimeSchema,
  organizations: z.array(IntelligenceOrganizationInputSchema).max(500).optional().default([]),
  people: z.array(IntelligencePersonInputSchema).max(500).optional().default([]),
  experiences: z.array(AccountExperienceInputSchema).max(1000).optional().default([]),
}).superRefine((value, context) => {
  if (value.organizations.length + value.people.length + value.experiences.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The batch contains no intelligence records' })
  }
  for (const [label, refs] of [
    ['organization', value.organizations.map((item) => item.ref)],
    ['person', value.people.map((item) => item.ref)],
    ['experience', value.experiences.map((item) => item.ref)],
  ] as const) {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${label} refs are not allowed` })
    }
  }
})

export const AccountIntelligenceSearchQuerySchema = z.object({
  q: z.string().trim().max(240).optional().default(''),
  assetClass: AccountExperienceAssetClassSchema.optional(),
  relationshipStatus: AccountRelationshipStatusSchema.optional(),
  reviewStatus: z.enum(['observed', 'needs_review', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export const AccountExperienceReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional(),
})

export type AccountIntelligenceBatch = z.infer<typeof AccountIntelligenceBatchSchema>
export type AccountIntelligenceSearchQuery = z.infer<typeof AccountIntelligenceSearchQuerySchema>
export type AccountExperienceInput = z.infer<typeof AccountExperienceInputSchema>
export type IntelligenceOrganizationInput = z.infer<typeof IntelligenceOrganizationInputSchema>
export type IntelligencePersonInput = z.infer<typeof IntelligencePersonInputSchema>
