import { createHash } from 'crypto'
import type { Pool, PoolClient } from 'pg'

import type {
  AccountExperienceInput,
  AccountIntelligenceBatch,
  AccountIntelligenceSearchQuery,
  IntelligenceOrganizationInput,
  IntelligencePersonInput,
} from '@level-cre/shared'

type Queryable = Pick<Pool | PoolClient, 'query'>

export class AccountIntelligenceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AccountIntelligenceError'
    this.status = status
  }
}

export function normalizeIntelligenceName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizedWebsiteDomain(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

export function experienceNeedsReview(experience: AccountExperienceInput) {
  if (experience.relationshipStatus === 'current') return true
  if (experience.classification === 'confirmed_current_account_lead') return true
  if (experience.classification === 'confirmed_current_account_team_member') return true
  if (experience.classification === 'unverified_or_inferred_relationship') return true
  return false
}

export function agentSafePursuitPosture(actorRole: string, posture: string) {
  return actorRole.includes('agent') && posture === 'blocked_confirmed' ? 'unknown' : posture
}

export function deterministicExperienceKey(params: {
  source: string
  subjectIdentity: string
  accountIdentity: string
  experience: AccountExperienceInput
}) {
  const value = [
    params.source,
    params.subjectIdentity,
    params.accountIdentity,
    params.experience.classification,
    [...params.experience.assetClasses].sort().join(','),
    normalizeIntelligenceName(params.experience.geography),
    normalizeIntelligenceName(params.experience.transactionLocation),
    normalizeIntelligenceName(params.experience.assignmentScope),
  ].join('|')
  return `derived:${createHash('sha256').update(value).digest('hex').slice(0, 40)}`
}

type ItemResult = {
  ref: string
  entityType: 'organization' | 'person' | 'experience' | 'evidence'
  result: 'created' | 'matched' | 'evidence_added' | 'review'
  entityId: string | null
  matchConfidence: number
  reviewReasons: string[]
}

type BatchSummary = {
  batchId: string
  duplicate: boolean
  counts: {
    created: number
    matched: number
    evidenceAdded: number
    review: number
  }
  results: ItemResult[]
}

function addResult(summary: BatchSummary, result: ItemResult) {
  summary.results.push(result)
  if (result.result === 'created') summary.counts.created += 1
  if (result.result === 'matched') summary.counts.matched += 1
  if (result.result === 'evidence_added') summary.counts.evidenceAdded += 1
  if (result.result === 'review') summary.counts.review += 1
}

async function stageReview(params: {
  db: Queryable
  userId: string
  batchId: string
  source: string
  externalKey: string
  entityType: string
  reason: string
  payload: unknown
  experienceId?: string | null
}) {
  const { rows } = await params.db.query(`
    INSERT INTO public.intel_account_intelligence_review_items (
      user_id, batch_id, experience_id, source, external_key,
      entity_type, reason, payload, status, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending', now())
    ON CONFLICT (user_id, source, external_key) WHERE status = 'pending'
    DO UPDATE SET
      batch_id = EXCLUDED.batch_id,
      experience_id = COALESCE(EXCLUDED.experience_id, public.intel_account_intelligence_review_items.experience_id),
      reason = EXCLUDED.reason,
      payload = EXCLUDED.payload,
      updated_at = now()
    RETURNING id
  `, [
    params.userId,
    params.batchId,
    params.experienceId || null,
    params.source,
    params.externalKey,
    params.entityType,
    params.reason,
    JSON.stringify(params.payload),
  ])
  return rows[0]?.id as string
}

async function matchOrganization(
  db: Queryable,
  userId: string,
  source: string,
  input: IntelligenceOrganizationInput,
) {
  if (input.externalKey) {
    const external = await db.query(`
      SELECT id FROM public.intel_organizations
      WHERE user_id = $1 AND source = $2 AND external_key = $3
      LIMIT 1
    `, [userId, source, input.externalKey])
    if (external.rows[0]) return { id: String(external.rows[0].id), confidence: 100, ambiguous: false }
  }

  const domain = normalizedWebsiteDomain(input.websiteUrl)
  if (domain) {
    const byDomain = await db.query(`
      SELECT id FROM public.intel_organizations
      WHERE user_id = $1 AND kind = $2 AND website_domain = $3
      ORDER BY id LIMIT 2
    `, [userId, input.kind, domain])
    if (byDomain.rows.length === 1) return { id: String(byDomain.rows[0].id), confidence: 98, ambiguous: false }
    if (byDomain.rows.length > 1) return { id: null, confidence: 0, ambiguous: true }
  }

  const normalizedName = normalizeIntelligenceName(input.name)
  const byName = await db.query(`
    SELECT DISTINCT organization.id
    FROM public.intel_organizations organization
    LEFT JOIN public.intel_organization_aliases alias
      ON alias.organization_id = organization.id AND alias.user_id = organization.user_id
    WHERE organization.user_id = $1
      AND organization.kind = $2
      AND (organization.normalized_name = $3 OR alias.normalized_alias = $3)
    ORDER BY organization.id
    LIMIT 2
  `, [userId, input.kind, normalizedName])
  if (byName.rows.length === 1) return { id: String(byName.rows[0].id), confidence: 90, ambiguous: false }
  if (byName.rows.length > 1) return { id: null, confidence: 0, ambiguous: true }
  return { id: null, confidence: 0, ambiguous: false }
}

async function saveOrganization(params: {
  db: Queryable
  userId: string
  batchId: string
  source: string
  actorRole: string
  input: IntelligenceOrganizationInput
  summary: BatchSummary
}) {
  const match = await matchOrganization(params.db, params.userId, params.source, params.input)
  if (match.ambiguous) {
    const reason = 'Several organizations share this identity; broker review is required before matching.'
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `organization:${params.input.externalKey || params.input.ref}`,
      entityType: 'organization',
      reason,
      payload: params.input,
    })
    addResult(params.summary, {
      ref: params.input.ref,
      entityType: 'organization',
      result: 'review',
      entityId: null,
      matchConfidence: 0,
      reviewReasons: [reason],
    })
    return null
  }

  let id = match.id
  let created = false
  const blockedPostureNeedsReview = params.actorRole.includes('agent')
    && params.input.canadianPursuitPosture === 'blocked_confirmed'
  const safePursuitPosture = agentSafePursuitPosture(params.actorRole, params.input.canadianPursuitPosture)
  if (!id) {
    const inserted = await params.db.query(`
      INSERT INTO public.intel_organizations (
        user_id, kind, name, normalized_name, source, external_key,
        website_url, website_domain, industry, canadian_presence,
        edmonton_northern_alberta_presence, canadian_pursuit_posture, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      params.userId,
      params.input.kind,
      params.input.name,
      normalizeIntelligenceName(params.input.name),
      params.source,
      params.input.externalKey || null,
      params.input.websiteUrl || null,
      normalizedWebsiteDomain(params.input.websiteUrl),
      params.input.industry || null,
      params.input.canadianPresence,
      params.input.edmontonNorthernAlbertaPresence,
      safePursuitPosture,
      params.input.notes || null,
    ])
    id = String(inserted.rows[0].id)
    created = true
  } else {
    await params.db.query(`
      UPDATE public.intel_organizations
      SET website_url = COALESCE(website_url, $3),
          website_domain = COALESCE(website_domain, $4),
          industry = COALESCE(industry, $5),
          notes = COALESCE(notes, $6),
          canadian_presence = CASE WHEN canadian_presence = 'unknown' AND $7 <> 'unknown' THEN $7 ELSE canadian_presence END,
          edmonton_northern_alberta_presence = CASE WHEN edmonton_northern_alberta_presence = 'unknown' AND $8 <> 'unknown' THEN $8 ELSE edmonton_northern_alberta_presence END,
          canadian_pursuit_posture = CASE WHEN canadian_pursuit_posture = 'unknown' AND $9 <> 'unknown' THEN $9 ELSE canadian_pursuit_posture END,
          updated_at = now()
      WHERE id = $1 AND user_id = $2
    `, [
      id,
      params.userId,
      params.input.websiteUrl || null,
      normalizedWebsiteDomain(params.input.websiteUrl),
      params.input.industry || null,
      params.input.notes || null,
      params.input.canadianPresence,
      params.input.edmontonNorthernAlbertaPresence,
      safePursuitPosture,
    ])
  }

  for (const alias of [params.input.name, ...params.input.aliases]) {
    await params.db.query(`
      INSERT INTO public.intel_organization_aliases (
        user_id, organization_id, alias, normalized_alias, source
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, normalized_alias) DO NOTHING
    `, [params.userId, id, alias, normalizeIntelligenceName(alias), params.source])
  }

  if (blockedPostureNeedsReview) {
    const reason = 'Agent findings cannot block Canadian pursuit without broker-confirmed evidence.'
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `organization-posture:${params.input.externalKey || params.input.ref}`,
      entityType: 'organization',
      reason,
      payload: params.input,
    })
    addResult(params.summary, {
      ref: params.input.ref,
      entityType: 'organization',
      result: 'review',
      entityId: id,
      matchConfidence: 100,
      reviewReasons: [reason],
    })
    return id
  }

  addResult(params.summary, {
    ref: params.input.ref,
    entityType: 'organization',
    result: created ? 'created' : 'matched',
    entityId: id,
    matchConfidence: created ? 100 : match.confidence,
    reviewReasons: [],
  })
  return id
}

async function matchPerson(
  db: Queryable,
  userId: string,
  source: string,
  input: IntelligencePersonInput,
  currentOrganizationId: string | null,
) {
  if (input.externalKey) {
    const external = await db.query(`
      SELECT id FROM public.intel_people
      WHERE user_id = $1 AND source = $2 AND external_key = $3
      LIMIT 1
    `, [userId, source, input.externalKey])
    if (external.rows[0]) return { id: String(external.rows[0].id), confidence: 100, ambiguous: false }
  }
  if (input.businessEmail) {
    const byEmail = await db.query(`
      SELECT id FROM public.intel_people
      WHERE user_id = $1 AND lower(verified_business_email) = lower($2)
      LIMIT 2
    `, [userId, input.businessEmail])
    if (byEmail.rows.length === 1) return { id: String(byEmail.rows[0].id), confidence: 100, ambiguous: false }
    if (byEmail.rows.length > 1) return { id: null, confidence: 0, ambiguous: true }
  }
  const byName = await db.query(`
    SELECT id FROM public.intel_people
    WHERE user_id = $1
      AND normalized_name = $2
      AND current_organization_id IS NOT DISTINCT FROM $3
    ORDER BY id LIMIT 2
  `, [userId, normalizeIntelligenceName(input.fullName), currentOrganizationId])
  if (byName.rows.length === 1) return { id: String(byName.rows[0].id), confidence: currentOrganizationId ? 90 : 75, ambiguous: false }
  if (byName.rows.length > 1) return { id: null, confidence: 0, ambiguous: true }
  return { id: null, confidence: 0, ambiguous: false }
}

async function savePerson(params: {
  db: Queryable
  userId: string
  batchId: string
  source: string
  input: IntelligencePersonInput
  currentOrganizationId: string | null
  summary: BatchSummary
}) {
  const match = await matchPerson(
    params.db,
    params.userId,
    params.source,
    params.input,
    params.currentOrganizationId,
  )
  if (match.ambiguous) {
    const reason = 'Several people share this identity; a verified business email or broker review is required.'
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `person:${params.input.externalKey || params.input.ref}`,
      entityType: 'person',
      reason,
      payload: params.input,
    })
    addResult(params.summary, {
      ref: params.input.ref,
      entityType: 'person',
      result: 'review',
      entityId: null,
      matchConfidence: 0,
      reviewReasons: [reason],
    })
    return null
  }

  let id = match.id
  let created = false
  if (!id) {
    const inserted = await params.db.query(`
      INSERT INTO public.intel_people (
        user_id, full_name, normalized_name, source, external_key,
        verified_business_email, phone, linkedin_url, biography_url,
        biography_captured_at, current_organization_id, title, office,
        market, specialties, geographic_focus, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      params.userId,
      params.input.fullName,
      normalizeIntelligenceName(params.input.fullName),
      params.source,
      params.input.externalKey || null,
      params.input.businessEmail || null,
      params.input.phone || null,
      params.input.linkedinUrl || null,
      params.input.biographyUrl || null,
      params.input.biographyCapturedAt || null,
      params.currentOrganizationId,
      params.input.title || null,
      params.input.office || null,
      params.input.market || null,
      params.input.specialties,
      params.input.geographicFocus,
      params.input.active,
    ])
    id = String(inserted.rows[0].id)
    created = true
  } else {
    await params.db.query(`
      UPDATE public.intel_people
      SET verified_business_email = COALESCE(verified_business_email, $3),
          phone = COALESCE(phone, $4),
          linkedin_url = COALESCE(linkedin_url, $5),
          biography_url = COALESCE($6, biography_url),
          biography_captured_at = GREATEST(biography_captured_at, $7::timestamptz),
          current_organization_id = COALESCE($8, current_organization_id),
          title = COALESCE($9, title),
          office = COALESCE($10, office),
          market = COALESCE($11, market),
          specialties = CASE WHEN cardinality($12::varchar[]) > 0 THEN $12::varchar[] ELSE specialties END,
          geographic_focus = CASE WHEN cardinality($13::varchar[]) > 0 THEN $13::varchar[] ELSE geographic_focus END,
          active = $14,
          updated_at = now()
      WHERE id = $1 AND user_id = $2
    `, [
      id,
      params.userId,
      params.input.businessEmail || null,
      params.input.phone || null,
      params.input.linkedinUrl || null,
      params.input.biographyUrl || null,
      params.input.biographyCapturedAt || null,
      params.currentOrganizationId,
      params.input.title || null,
      params.input.office || null,
      params.input.market || null,
      params.input.specialties,
      params.input.geographicFocus,
      params.input.active,
    ])
  }

  addResult(params.summary, {
    ref: params.input.ref,
    entityType: 'person',
    result: created ? 'created' : 'matched',
    entityId: id,
    matchConfidence: created ? 100 : match.confidence,
    reviewReasons: [],
  })
  return id
}

async function ownedOrganization(db: Queryable, userId: string, id: string, expectedKind?: string) {
  const { rows } = await db.query(`
    SELECT id, kind FROM public.intel_organizations WHERE id = $1 AND user_id = $2 LIMIT 1
  `, [id, userId])
  if (!rows[0]) return null
  if (expectedKind && rows[0].kind !== expectedKind) return null
  return String(rows[0].id)
}

async function ownedPerson(db: Queryable, userId: string, id: string) {
  const { rows } = await db.query(`
    SELECT id FROM public.intel_people WHERE id = $1 AND user_id = $2 LIMIT 1
  `, [id, userId])
  return rows[0] ? String(rows[0].id) : null
}

async function saveEvidence(params: {
  db: Queryable
  userId: string
  batchId: string
  source: string
  experienceId: string
  experienceRef: string
  evidence: AccountExperienceInput['evidence'][number]
  summary: BatchSummary
}) {
  const inserted = await params.db.query(`
    INSERT INTO public.intel_relationship_evidence (
      user_id, experience_id, source, external_evidence_id, evidence_type,
      evidence_date, captured_at, source_url, outlook_message_id, summary,
      exact_account_or_assignment, source_reliability, confidence, stance,
      contradiction_or_limitation_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (user_id, source, external_evidence_id) DO NOTHING
    RETURNING id, experience_id
  `, [
    params.userId,
    params.experienceId,
    params.source,
    params.evidence.externalEvidenceId,
    params.evidence.evidenceType,
    params.evidence.evidenceDate || null,
    params.evidence.capturedAt || null,
    params.evidence.sourceUrl || null,
    params.evidence.outlookMessageId || null,
    params.evidence.summary,
    params.evidence.exactAccountOrAssignment || null,
    params.evidence.sourceReliability,
    params.evidence.confidence,
    params.evidence.stance,
    params.evidence.contradictionOrLimitationNotes || null,
  ])
  if (inserted.rows[0]) {
    addResult(params.summary, {
      ref: `${params.experienceRef}:${params.evidence.externalEvidenceId}`,
      entityType: 'evidence',
      result: 'evidence_added',
      entityId: String(inserted.rows[0].id),
      matchConfidence: 100,
      reviewReasons: [],
    })
    return
  }

  const existing = await params.db.query(`
    SELECT id, experience_id FROM public.intel_relationship_evidence
    WHERE user_id = $1 AND source = $2 AND external_evidence_id = $3
    LIMIT 1
  `, [params.userId, params.source, params.evidence.externalEvidenceId])
  const row = existing.rows[0]
  if (row && String(row.experience_id) !== params.experienceId) {
    const reason = 'This evidence identity is already attached to a different experience.'
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `evidence-conflict:${params.evidence.externalEvidenceId}`,
      entityType: 'evidence',
      reason,
      payload: params.evidence,
      experienceId: params.experienceId,
    })
    addResult(params.summary, {
      ref: `${params.experienceRef}:${params.evidence.externalEvidenceId}`,
      entityType: 'evidence',
      result: 'review',
      entityId: row ? String(row.id) : null,
      matchConfidence: 0,
      reviewReasons: [reason],
    })
    return
  }
  addResult(params.summary, {
    ref: `${params.experienceRef}:${params.evidence.externalEvidenceId}`,
    entityType: 'evidence',
    result: 'matched',
    entityId: row ? String(row.id) : null,
    matchConfidence: 100,
    reviewReasons: [],
  })
}

async function saveExperience(params: {
  db: Queryable
  userId: string
  batchId: string
  source: string
  actorRole: string
  input: AccountExperienceInput
  organizationRefs: Map<string, string>
  personRefs: Map<string, string>
  summary: BatchSummary
}) {
  const accountId = params.input.accountOrganizationId
    ? await ownedOrganization(params.db, params.userId, params.input.accountOrganizationId, 'corporate_account')
    : params.input.accountOrganizationRef
      ? params.organizationRefs.get(params.input.accountOrganizationRef) || null
      : null
  const personId = params.input.subjectType === 'person'
    ? params.input.personId
      ? await ownedPerson(params.db, params.userId, params.input.personId)
      : params.input.personRef
        ? params.personRefs.get(params.input.personRef) || null
        : null
    : null
  const firmId = params.input.subjectType === 'firm'
    ? params.input.firmOrganizationId
      ? await ownedOrganization(params.db, params.userId, params.input.firmOrganizationId, 'brokerage_firm')
      : params.input.firmOrganizationRef
        ? params.organizationRefs.get(params.input.firmOrganizationRef) || null
        : null
    : null

  if (!accountId || (params.input.subjectType === 'person' ? !personId : !firmId)) {
    const reason = 'The experience references an unresolved person, firm, or corporate account.'
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `experience:${params.input.externalKey || params.input.ref}`,
      entityType: 'experience',
      reason,
      payload: params.input,
    })
    addResult(params.summary, {
      ref: params.input.ref,
      entityType: 'experience',
      result: 'review',
      entityId: null,
      matchConfidence: 0,
      reviewReasons: [reason],
    })
    return null
  }

  let personRelationshipId: string | null = null
  let firmRelationshipId: string | null = null
  if (personId) {
    const relationship = await params.db.query(`
      INSERT INTO public.intel_person_account_relationships (
        user_id, person_id, account_organization_id, updated_at
      ) VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id, person_id, account_organization_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `, [params.userId, personId, accountId])
    personRelationshipId = String(relationship.rows[0].id)
  } else if (firmId) {
    const relationship = await params.db.query(`
      INSERT INTO public.intel_firm_account_relationships (
        user_id, firm_organization_id, account_organization_id, updated_at
      ) VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id, firm_organization_id, account_organization_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `, [params.userId, firmId, accountId])
    firmRelationshipId = String(relationship.rows[0].id)
  }

  const externalKey = params.input.externalKey || deterministicExperienceKey({
    source: params.source,
    subjectIdentity: personId || firmId || '',
    accountIdentity: accountId,
    experience: params.input,
  })
  const needsReview = params.actorRole.includes('agent') && experienceNeedsReview(params.input)
  const reviewStatus = params.actorRole.includes('agent')
    ? needsReview ? 'needs_review' : 'observed'
    : 'approved'

  const inserted = await params.db.query(`
    INSERT INTO public.intel_account_experiences (
      user_id, person_relationship_id, firm_relationship_id, source, external_key,
      classification, account_role, assignment_scope, asset_classes, service_line,
      property_type, transaction_type, transaction_size_sf, transaction_location,
      geography, jurisdiction_scope, relationship_status, relationship_start_date,
      relationship_end_date, last_verified_at, confidence, recommended_use,
      limitations, outreach_status, review_status, created_by_actor_role
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::varchar[], $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26
    )
    ON CONFLICT (user_id, source, external_key) DO NOTHING
    RETURNING id, person_relationship_id, firm_relationship_id
  `, [
    params.userId,
    personRelationshipId,
    firmRelationshipId,
    params.source,
    externalKey,
    params.input.classification,
    params.input.accountRole || null,
    params.input.assignmentScope || null,
    params.input.assetClasses,
    params.input.serviceLine || null,
    params.input.propertyType || null,
    params.input.transactionType || null,
    params.input.transactionSizeSf ?? null,
    params.input.transactionLocation || null,
    params.input.geography || null,
    params.input.jurisdictionScope,
    params.input.relationshipStatus,
    params.input.relationshipStartDate || null,
    params.input.relationshipEndDate || null,
    params.input.lastVerifiedAt || null,
    params.input.confidence,
    params.input.recommendedUse || null,
    params.input.limitations || null,
    params.input.outreachStatus,
    reviewStatus,
    params.actorRole || null,
  ])

  let experienceId: string
  let created = false
  if (inserted.rows[0]) {
    experienceId = String(inserted.rows[0].id)
    created = true
  } else {
    const existing = await params.db.query(`
      SELECT id, person_relationship_id, firm_relationship_id
      FROM public.intel_account_experiences
      WHERE user_id = $1 AND source = $2 AND external_key = $3
      LIMIT 1
    `, [params.userId, params.source, externalKey])
    const row = existing.rows[0]
    if (!row || String(row.person_relationship_id || '') !== String(personRelationshipId || '')
      || String(row.firm_relationship_id || '') !== String(firmRelationshipId || '')) {
      const reason = 'This experience identity is already attached to a different broker/account relationship.'
      await stageReview({
        db: params.db,
        userId: params.userId,
        batchId: params.batchId,
        source: params.source,
        externalKey: `experience-conflict:${externalKey}`,
        entityType: 'experience',
        reason,
        payload: params.input,
      })
      addResult(params.summary, {
        ref: params.input.ref,
        entityType: 'experience',
        result: 'review',
        entityId: row ? String(row.id) : null,
        matchConfidence: 0,
        reviewReasons: [reason],
      })
      return null
    }
    experienceId = String(row.id)
  }

  const reviewReasons = needsReview
    ? ['Current or inferred account-control claims require broker review.']
    : []
  if (needsReview) {
    await stageReview({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      externalKey: `experience-review:${externalKey}`,
      entityType: 'experience',
      reason: reviewReasons[0],
      payload: params.input,
      experienceId,
    })
  }

  addResult(params.summary, {
    ref: params.input.ref,
    entityType: 'experience',
    result: needsReview ? 'review' : created ? 'created' : 'matched',
    entityId: experienceId,
    matchConfidence: needsReview ? params.input.confidence : 100,
    reviewReasons,
  })

  for (const evidence of params.input.evidence) {
    await saveEvidence({
      db: params.db,
      userId: params.userId,
      batchId: params.batchId,
      source: params.source,
      experienceId,
      experienceRef: params.input.ref,
      evidence,
      summary: params.summary,
    })
  }
  return experienceId
}

export async function importAccountIntelligenceBatch(params: {
  pool: Pool
  userId: string
  actorRole: string
  agentName?: string | null
  payload: AccountIntelligenceBatch
}): Promise<BatchSummary> {
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    const batchInsert = await client.query(`
      INSERT INTO public.intel_account_intelligence_batches (
        user_id, source, external_batch_id, observed_at, actor_role, agent_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')
      ON CONFLICT (user_id, source, external_batch_id) DO NOTHING
      RETURNING id
    `, [
      params.userId,
      params.payload.source,
      params.payload.externalBatchId,
      params.payload.observedAt || null,
      params.actorRole || null,
      params.agentName || null,
    ])

    if (!batchInsert.rows[0]) {
      const existing = await client.query(`
        SELECT id, result_json FROM public.intel_account_intelligence_batches
        WHERE user_id = $1 AND source = $2 AND external_batch_id = $3
        LIMIT 1
      `, [params.userId, params.payload.source, params.payload.externalBatchId])
      const prior = existing.rows[0]?.result_json as BatchSummary | undefined
      if (!prior || Object.keys(prior).length === 0) {
        throw new AccountIntelligenceError('The matching intelligence batch is still processing.', 409)
      }
      await client.query('COMMIT')
      return { ...prior, duplicate: true }
    }

    const batchId = String(batchInsert.rows[0].id)
    const summary: BatchSummary = {
      batchId,
      duplicate: false,
      counts: { created: 0, matched: 0, evidenceAdded: 0, review: 0 },
      results: [],
    }
    const organizationRefs = new Map<string, string>()
    const personRefs = new Map<string, string>()

    for (const input of params.payload.organizations) {
      const id = await saveOrganization({
        db: client,
        userId: params.userId,
        batchId,
        source: params.payload.source,
        actorRole: params.actorRole,
        input,
        summary,
      })
      if (id) organizationRefs.set(input.ref, id)
    }

    for (const input of params.payload.organizations) {
      const id = organizationRefs.get(input.ref)
      const parentId = input.parentOrganizationId
        ? await ownedOrganization(client, params.userId, input.parentOrganizationId)
        : input.parentOrganizationRef
          ? organizationRefs.get(input.parentOrganizationRef) || null
          : null
      if (id && parentId && id !== parentId) {
        await client.query(`
          UPDATE public.intel_organizations
          SET parent_organization_id = $3, updated_at = now()
          WHERE id = $1 AND user_id = $2
        `, [id, params.userId, parentId])
      }
    }

    for (const input of params.payload.people) {
      const currentOrganizationId = input.currentOrganizationId
        ? await ownedOrganization(client, params.userId, input.currentOrganizationId)
        : input.currentOrganizationRef
          ? organizationRefs.get(input.currentOrganizationRef) || null
          : null
      const id = await savePerson({
        db: client,
        userId: params.userId,
        batchId,
        source: params.payload.source,
        input,
        currentOrganizationId,
        summary,
      })
      if (id) personRefs.set(input.ref, id)
    }

    for (const input of params.payload.experiences) {
      await saveExperience({
        db: client,
        userId: params.userId,
        batchId,
        source: params.payload.source,
        actorRole: params.actorRole,
        input,
        organizationRefs,
        personRefs,
        summary,
      })
    }

    const status = summary.counts.review > 0 ? 'completed_with_review' : 'completed'
    await client.query(`
      UPDATE public.intel_account_intelligence_batches
      SET status = $3, result_json = $4::jsonb, completed_at = now()
      WHERE id = $1 AND user_id = $2
    `, [batchId, params.userId, status, JSON.stringify(summary)])
    await client.query('COMMIT')
    return summary
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function searchAccountIntelligence(params: {
  pool: Pool
  userId: string
  query: AccountIntelligenceSearchQuery
}) {
  const normalizedQuery = normalizeIntelligenceName(params.query.q)
  const rawQuery = params.query.q.trim()
  const filters = [
    params.userId,
    normalizedQuery,
    rawQuery ? `%${rawQuery}%` : '',
    params.query.assetClass || null,
    params.query.relationshipStatus || null,
    params.query.reviewStatus || null,
    params.query.limit,
  ]

  const accounts = await params.pool.query(`
    SELECT organization.id, organization.name, organization.kind, organization.industry,
           organization.canadian_presence, organization.edmonton_northern_alberta_presence,
           organization.canadian_pursuit_posture,
           COUNT(DISTINCT person_relationship.person_id)::int AS people_count,
           COUNT(DISTINCT firm_relationship.firm_organization_id)::int AS firm_count,
           COUNT(DISTINCT experience.id)::int AS experience_count,
           MAX(COALESCE(experience.last_verified_at, experience.created_at)) AS last_verified_at,
           COALESCE(array_agg(DISTINCT asset_class) FILTER (WHERE asset_class IS NOT NULL), ARRAY[]::varchar[]) AS asset_classes
    FROM public.intel_organizations organization
    LEFT JOIN public.intel_person_account_relationships person_relationship
      ON person_relationship.account_organization_id = organization.id AND person_relationship.user_id = organization.user_id
    LEFT JOIN public.intel_firm_account_relationships firm_relationship
      ON firm_relationship.account_organization_id = organization.id AND firm_relationship.user_id = organization.user_id
    LEFT JOIN public.intel_account_experiences experience
      ON experience.user_id = organization.user_id
      AND (experience.person_relationship_id = person_relationship.id OR experience.firm_relationship_id = firm_relationship.id)
    LEFT JOIN LATERAL unnest(experience.asset_classes) asset_class ON true
    WHERE organization.user_id = $1
      AND organization.kind = 'corporate_account'
      AND ($2 = '' OR organization.normalized_name LIKE '%' || $2 || '%'
        OR EXISTS (
          SELECT 1 FROM public.intel_organization_aliases alias
          WHERE alias.organization_id = organization.id AND alias.normalized_alias LIKE '%' || $2 || '%'
        )
        OR EXISTS (
          SELECT 1 FROM public.intel_relationship_evidence evidence
          WHERE evidence.experience_id = experience.id
            AND (evidence.summary ILIKE $3 OR evidence.exact_account_or_assignment ILIKE $3)
        ))
      AND ($4::varchar IS NULL OR $4 = ANY(experience.asset_classes))
      AND ($5::varchar IS NULL OR experience.relationship_status = $5)
      AND ($6::varchar IS NULL OR experience.review_status = $6)
    GROUP BY organization.id
    ORDER BY last_verified_at DESC NULLS LAST, organization.name
    LIMIT $7
  `, filters)

  const people = await params.pool.query(`
    SELECT person.id, person.full_name, person.verified_business_email, person.title,
           person.office, person.market, firm.name AS current_firm,
           COUNT(DISTINCT relationship.account_organization_id)::int AS account_count,
           COUNT(DISTINCT experience.id)::int AS experience_count,
           MAX(COALESCE(experience.last_verified_at, experience.created_at)) AS last_verified_at,
           COALESCE(array_agg(DISTINCT asset_class) FILTER (WHERE asset_class IS NOT NULL), ARRAY[]::varchar[]) AS asset_classes
    FROM public.intel_people person
    LEFT JOIN public.intel_organizations firm ON firm.id = person.current_organization_id
    LEFT JOIN public.intel_person_account_relationships relationship
      ON relationship.person_id = person.id AND relationship.user_id = person.user_id
    LEFT JOIN public.intel_account_experiences experience
      ON experience.person_relationship_id = relationship.id AND experience.user_id = person.user_id
    LEFT JOIN LATERAL unnest(experience.asset_classes) asset_class ON true
    WHERE person.user_id = $1
      AND ($2 = '' OR person.normalized_name LIKE '%' || $2 || '%'
        OR firm.normalized_name LIKE '%' || $2 || '%'
        OR EXISTS (
          SELECT 1 FROM public.intel_relationship_evidence evidence
          WHERE evidence.experience_id = experience.id
            AND (evidence.summary ILIKE $3 OR evidence.exact_account_or_assignment ILIKE $3)
        ))
      AND ($4::varchar IS NULL OR $4 = ANY(experience.asset_classes))
      AND ($5::varchar IS NULL OR experience.relationship_status = $5)
      AND ($6::varchar IS NULL OR experience.review_status = $6)
    GROUP BY person.id, firm.name
    ORDER BY last_verified_at DESC NULLS LAST, person.full_name
    LIMIT $7
  `, filters)

  const firms = await params.pool.query(`
    SELECT organization.id, organization.name,
           COUNT(DISTINCT relationship.account_organization_id)::int AS account_count,
           COUNT(DISTINCT experience.id)::int AS experience_count,
           MAX(COALESCE(experience.last_verified_at, experience.created_at)) AS last_verified_at,
           COALESCE(array_agg(DISTINCT asset_class) FILTER (WHERE asset_class IS NOT NULL), ARRAY[]::varchar[]) AS asset_classes
    FROM public.intel_organizations organization
    LEFT JOIN public.intel_firm_account_relationships relationship
      ON relationship.firm_organization_id = organization.id AND relationship.user_id = organization.user_id
    LEFT JOIN public.intel_account_experiences experience
      ON experience.firm_relationship_id = relationship.id AND experience.user_id = organization.user_id
    LEFT JOIN LATERAL unnest(experience.asset_classes) asset_class ON true
    WHERE organization.user_id = $1
      AND organization.kind = 'brokerage_firm'
      AND ($2 = '' OR organization.normalized_name LIKE '%' || $2 || '%')
      AND ($4::varchar IS NULL OR $4 = ANY(experience.asset_classes))
      AND ($5::varchar IS NULL OR experience.relationship_status = $5)
      AND ($6::varchar IS NULL OR experience.review_status = $6)
    GROUP BY organization.id
    ORDER BY last_verified_at DESC NULLS LAST, organization.name
    LIMIT $7
  `, filters)

  return { accounts: accounts.rows, people: people.rows, firms: firms.rows }
}

async function evidenceForExperiences(pool: Pool, userId: string, experienceIds: string[]) {
  if (experienceIds.length === 0) return []
  const { rows } = await pool.query(`
    SELECT id, experience_id, evidence_type, evidence_date, captured_at,
           source_url, outlook_message_id, summary, exact_account_or_assignment,
           source_reliability, confidence, stance, contradiction_or_limitation_notes
    FROM public.intel_relationship_evidence
    WHERE user_id = $1 AND experience_id = ANY($2::varchar[])
    ORDER BY COALESCE(evidence_date, captured_at::date) DESC, created_at DESC
  `, [userId, experienceIds])
  return rows
}

export async function getAccountBrief(params: { pool: Pool; userId: string; accountId: string }) {
  const accountResult = await params.pool.query(`
    SELECT organization.*, parent.name AS parent_name
    FROM public.intel_organizations organization
    LEFT JOIN public.intel_organizations parent ON parent.id = organization.parent_organization_id
    WHERE organization.id = $1 AND organization.user_id = $2 AND organization.kind = 'corporate_account'
    LIMIT 1
  `, [params.accountId, params.userId])
  if (!accountResult.rows[0]) throw new AccountIntelligenceError('Corporate account was not found.', 404)
  const aliases = await params.pool.query(`
    SELECT alias, alias_kind FROM public.intel_organization_aliases
    WHERE organization_id = $1 AND user_id = $2 ORDER BY alias
  `, [params.accountId, params.userId])
  const experiences = await params.pool.query(`
    SELECT experience.*,
           person.id AS person_id, person.full_name AS person_name,
           person_firm.name AS person_current_firm,
           firm.id AS firm_id, firm.name AS firm_name
    FROM public.intel_account_experiences experience
    LEFT JOIN public.intel_person_account_relationships person_relationship
      ON person_relationship.id = experience.person_relationship_id
    LEFT JOIN public.intel_people person ON person.id = person_relationship.person_id
    LEFT JOIN public.intel_organizations person_firm ON person_firm.id = person.current_organization_id
    LEFT JOIN public.intel_firm_account_relationships firm_relationship
      ON firm_relationship.id = experience.firm_relationship_id
    LEFT JOIN public.intel_organizations firm ON firm.id = firm_relationship.firm_organization_id
    WHERE experience.user_id = $2
      AND (person_relationship.account_organization_id = $1 OR firm_relationship.account_organization_id = $1)
      AND experience.review_status <> 'rejected'
    ORDER BY COALESCE(experience.last_verified_at, experience.created_at) DESC
  `, [params.accountId, params.userId])
  const evidence = await evidenceForExperiences(
    params.pool,
    params.userId,
    experiences.rows.map((row) => String(row.id)),
  )
  const byExperience = new Map<string, unknown[]>()
  for (const item of evidence) {
    const key = String(item.experience_id)
    byExperience.set(key, [...(byExperience.get(key) || []), item])
  }
  return {
    account: accountResult.rows[0],
    aliases: aliases.rows,
    experiences: experiences.rows.map((row) => ({ ...row, evidence: byExperience.get(String(row.id)) || [] })),
  }
}

export async function getPersonBrief(params: { pool: Pool; userId: string; personId: string }) {
  const personResult = await params.pool.query(`
    SELECT person.*, firm.name AS current_firm
    FROM public.intel_people person
    LEFT JOIN public.intel_organizations firm ON firm.id = person.current_organization_id
    WHERE person.id = $1 AND person.user_id = $2
    LIMIT 1
  `, [params.personId, params.userId])
  if (!personResult.rows[0]) throw new AccountIntelligenceError('Broker or corporate contact was not found.', 404)
  const experiences = await params.pool.query(`
    SELECT experience.*, account.id AS account_id, account.name AS account_name
    FROM public.intel_account_experiences experience
    JOIN public.intel_person_account_relationships relationship
      ON relationship.id = experience.person_relationship_id
    JOIN public.intel_organizations account ON account.id = relationship.account_organization_id
    WHERE experience.user_id = $2 AND relationship.person_id = $1
      AND experience.review_status <> 'rejected'
    ORDER BY COALESCE(experience.last_verified_at, experience.created_at) DESC
  `, [params.personId, params.userId])
  const evidence = await evidenceForExperiences(
    params.pool,
    params.userId,
    experiences.rows.map((row) => String(row.id)),
  )
  const byExperience = new Map<string, unknown[]>()
  for (const item of evidence) {
    const key = String(item.experience_id)
    byExperience.set(key, [...(byExperience.get(key) || []), item])
  }
  return {
    person: personResult.rows[0],
    experiences: experiences.rows.map((row) => ({ ...row, evidence: byExperience.get(String(row.id)) || [] })),
  }
}

export async function listAccountIntelligenceReview(params: { pool: Pool; userId: string; limit: number }) {
  const { rows } = await params.pool.query(`
    SELECT review.id, review.entity_type, review.reason, review.payload, review.source,
           review.external_key, review.created_at, review.experience_id,
           experience.classification, experience.relationship_status, experience.asset_classes,
           person.full_name AS person_name, account.name AS account_name, firm.name AS firm_name
    FROM public.intel_account_intelligence_review_items review
    LEFT JOIN public.intel_account_experiences experience ON experience.id = review.experience_id
    LEFT JOIN public.intel_person_account_relationships person_relationship
      ON person_relationship.id = experience.person_relationship_id
    LEFT JOIN public.intel_people person ON person.id = person_relationship.person_id
    LEFT JOIN public.intel_firm_account_relationships firm_relationship
      ON firm_relationship.id = experience.firm_relationship_id
    LEFT JOIN public.intel_organizations firm ON firm.id = firm_relationship.firm_organization_id
    LEFT JOIN public.intel_organizations account
      ON account.id = COALESCE(person_relationship.account_organization_id, firm_relationship.account_organization_id)
    WHERE review.user_id = $1 AND review.status = 'pending'
    ORDER BY review.created_at DESC
    LIMIT $2
  `, [params.userId, params.limit])
  return { rows }
}

export async function reviewAccountExperience(params: {
  pool: Pool
  userId: string
  experienceId: string
  action: 'approve' | 'reject'
  note?: string
}) {
  const client = await params.pool.connect()
  try {
    await client.query('BEGIN')
    const status = params.action === 'approve' ? 'approved' : 'rejected'
    const updated = await client.query(`
      UPDATE public.intel_account_experiences
      SET review_status = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND review_status IN ('observed', 'needs_review')
      RETURNING *
    `, [params.experienceId, params.userId, status])
    if (!updated.rows[0]) throw new AccountIntelligenceError('Reviewable account experience was not found.', 404)
    await client.query(`
      UPDATE public.intel_account_intelligence_review_items
      SET status = $3, resolution_note = $4, reviewed_by_user_id = $2,
          reviewed_at = now(), updated_at = now()
      WHERE experience_id = $1 AND user_id = $2 AND status = 'pending'
    `, [params.experienceId, params.userId, status, params.note || null])
    await client.query('COMMIT')
    return updated.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
