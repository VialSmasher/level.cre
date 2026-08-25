import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AccountExperienceInputSchema,
  AccountIntelligenceBatchSchema,
} from '@level-cre/shared'

import {
  agentSafePursuitPosture,
  deterministicExperienceKey,
  experienceNeedsReview,
  importAccountIntelligenceBatch,
  normalizeIntelligenceName,
} from './service'

function evidence(id: string) {
  return {
    externalEvidenceId: id,
    evidenceType: 'official_transaction_announcement' as const,
    summary: `Evidence ${id}`,
    sourceReliability: 'high' as const,
    confidence: 90,
  }
}

function experience(overrides: Record<string, unknown> = {}) {
  return AccountExperienceInputSchema.parse({
    ref: 'experience-1',
    subjectType: 'person',
    personRef: 'broker-1',
    accountOrganizationRef: 'account-1',
    classification: 'completed_transaction_experience',
    relationshipStatus: 'completed',
    assetClasses: ['industrial'],
    evidence: [evidence('evidence-1')],
    ...overrides,
  })
}

test('the contract represents overlapping office and industrial experience without a lossy both value', () => {
  const industrial = experience({ ref: 'industrial', assetClasses: ['industrial'] })
  const office = experience({
    ref: 'office',
    externalKey: 'office-assignment-1',
    assetClasses: ['office'],
    evidence: [evidence('evidence-2')],
  })
  const batch = AccountIntelligenceBatchSchema.parse({
    externalBatchId: 'overlap-1',
    source: 'codex_broker_research',
    organizations: [{ ref: 'account-1', kind: 'corporate_account', name: 'Example Account' }],
    people: [{ ref: 'broker-1', fullName: 'Alex Broker' }],
    experiences: [industrial, office],
  })

  assert.deepEqual(batch.experiences.map((item) => item.assetClasses), [['industrial'], ['office']])
  assert.equal(AccountExperienceInputSchema.safeParse({
    ...industrial,
    assetClasses: ['unknown', 'industrial'],
  }).success, false)
})

test('current and inferred claims route to review while dated transaction and biography evidence remain observed', () => {
  assert.equal(experienceNeedsReview(experience()), false)
  assert.equal(experienceNeedsReview(experience({
    relationshipStatus: 'current',
    classification: 'confirmed_current_account_lead',
  })), true)
  assert.equal(experienceNeedsReview(experience({
    classification: 'unverified_or_inferred_relationship',
    relationshipStatus: 'unknown',
  })), true)
  assert.equal(experienceNeedsReview(experience({
    classification: 'official_biography_client_disclosure',
    relationshipStatus: 'unknown',
  })), false)
  assert.equal(agentSafePursuitPosture('account_intelligence_agent', 'blocked_confirmed'), 'unknown')
  assert.equal(agentSafePursuitPosture('authenticated', 'blocked_confirmed'), 'blocked_confirmed')
})

test('derived experience identity is stable but preserves asset-class and geography distinctions', () => {
  const base = experience({ geography: 'Chicago, IL' })
  const first = deterministicExperienceKey({
    source: 'codex_broker_research',
    subjectIdentity: 'person-1',
    accountIdentity: 'account-1',
    experience: base,
  })
  const retry = deterministicExperienceKey({
    source: 'codex_broker_research',
    subjectIdentity: 'person-1',
    accountIdentity: 'account-1',
    experience: base,
  })
  const office = deterministicExperienceKey({
    source: 'codex_broker_research',
    subjectIdentity: 'person-1',
    accountIdentity: 'account-1',
    experience: experience({ geography: 'Chicago, IL', assetClasses: ['office'] }),
  })

  assert.equal(first, retry)
  assert.notEqual(first, office)
  assert.equal(normalizeIntelligenceName('Cushman & Wakefield — Montréal'), 'CUSHMAN AND WAKEFIELD MONTREAL')
})

test('the Cardinal acceptance fixture preserves biography, historical, referral, assignment, and firm evidence separately', () => {
  const cardinal = AccountIntelligenceBatchSchema.parse({
    externalBatchId: 'cardinal-health-2026-08-25',
    source: 'codex_broker_research',
    observedAt: '2026-08-25T12:00:00-06:00',
    organizations: [
      { ref: 'cardinal', kind: 'corporate_account', name: 'Cardinal Health' },
      { ref: 'cushman', kind: 'brokerage_firm', name: 'Cushman & Wakefield', aliases: ['C&W'] },
      { ref: 'cbre', kind: 'brokerage_firm', name: 'CBRE' },
    ],
    people: [
      { ref: 'keith', fullName: 'Keith Puritz', currentOrganizationRef: 'cushman', title: 'Vice Chair', office: 'Rosemont' },
      { ref: 'brett', fullName: 'Brett Kroner', currentOrganizationRef: 'cushman' },
    ],
    experiences: [
      {
        ref: 'keith-biography',
        externalKey: 'keith-cardinal-biography',
        subjectType: 'person',
        personRef: 'keith',
        accountOrganizationRef: 'cardinal',
        classification: 'official_biography_client_disclosure',
        relationshipStatus: 'unknown',
        assetClasses: ['unknown'],
        evidence: [{
          externalEvidenceId: 'keith-bio-cardinal',
          evidenceType: 'official_company_biography',
          capturedAt: '2026-08-25T12:00:00-06:00',
          summary: 'Keith Puritz official biography lists Cardinal Health as a client.',
          sourceReliability: 'high',
          confidence: 85,
        }],
      },
      {
        ref: 'keith-history',
        externalKey: 'keith-cardinal-history-email',
        subjectType: 'person',
        personRef: 'keith',
        accountOrganizationRef: 'cardinal',
        classification: 'historical_account_lead',
        relationshipStatus: 'historical',
        assetClasses: ['unknown'],
        recommendedUse: 'Historical context only; not a current Cardinal route.',
        evidence: [{
          externalEvidenceId: 'keith-email-cardinal-2026-08-25',
          evidenceType: 'direct_broker_email',
          evidenceDate: '2026-08-25',
          summary: 'Keith said he had a ten-year run with Cardinal and CBRE has handled the work for eight to nine years.',
          sourceReliability: 'high',
          confidence: 95,
        }],
      },
      {
        ref: 'brett-referral',
        externalKey: 'brett-cardinal-referral',
        subjectType: 'person',
        personRef: 'brett',
        accountOrganizationRef: 'cardinal',
        classification: 'referral_source_only',
        relationshipStatus: 'unknown',
        assetClasses: ['unknown'],
        evidence: [{
          externalEvidenceId: 'brett-referral-keith-cardinal',
          evidenceType: 'internal_referral',
          evidenceDate: '2026-08-25',
          summary: 'Brett referred Patrick to Keith as the former Cardinal relationship lead.',
          sourceReliability: 'high',
          confidence: 90,
        }],
      },
      {
        ref: 'brett-assignment',
        externalKey: 'brett-cardinal-assignment-1.6m',
        subjectType: 'person',
        personRef: 'brett',
        accountOrganizationRef: 'cardinal',
        classification: 'assignment_disclosure',
        relationshipStatus: 'unknown',
        assetClasses: ['unknown'],
        transactionSizeSf: 1600000,
        evidence: [{
          externalEvidenceId: 'brett-bio-cardinal-assignment',
          evidenceType: 'official_company_biography',
          capturedAt: '2026-08-25T12:00:00-06:00',
          summary: 'Brett Kroner official biography discloses a 1.6-million-square-foot Cardinal Health assignment.',
          sourceReliability: 'high',
          confidence: 85,
        }],
      },
      {
        ref: 'cbre-current',
        externalKey: 'cbre-cardinal-current-claim',
        subjectType: 'firm',
        firmOrganizationRef: 'cbre',
        accountOrganizationRef: 'cardinal',
        classification: 'firm_account_relationship',
        relationshipStatus: 'current',
        jurisdictionScope: 'unknown',
        assetClasses: ['unknown'],
        limitations: 'Canadian coverage and exclusivity are unconfirmed.',
        evidence: [{
          externalEvidenceId: 'keith-email-cbre-cardinal-2026-08-25',
          evidenceType: 'direct_broker_email',
          evidenceDate: '2026-08-25',
          summary: 'Keith said CBRE has handled Cardinal work for the past eight to nine years.',
          sourceReliability: 'high',
          confidence: 90,
        }],
      },
    ],
  })

  assert.equal(cardinal.experiences.length, 5)
  assert.equal(cardinal.experiences.filter((item) => item.personRef === 'keith').length, 2)
  assert.equal(cardinal.experiences.filter(experienceNeedsReview).length, 1)
  assert.equal(cardinal.experiences.find((item) => item.ref === 'brett-assignment')?.transactionSizeSf, 1600000)
  assert.deepEqual(cardinal.experiences.find((item) => item.ref === 'cbre-current')?.assetClasses, ['unknown'])
})

test('batch ingestion stores separate experience rows for one broker across overlapping accounts', async () => {
  const experienceParams: unknown[][] = []
  let organizationCounter = 0
  let relationshipCounter = 0
  let evidenceCounter = 0
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
    if (sql.includes('INSERT INTO public.intel_account_intelligence_batches')) return { rows: [{ id: 'batch-1' }] }
    if (sql.includes('SELECT id FROM public.intel_organizations')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT organization.id')) return { rows: [] }
    if (sql.includes('INSERT INTO public.intel_organizations')) {
      organizationCounter += 1
      return { rows: [{ id: `organization-${organizationCounter}` }] }
    }
    if (sql.includes('INSERT INTO public.intel_organization_aliases')) return { rows: [] }
    if (sql.includes('UPDATE public.intel_organizations')) return { rows: [] }
    if (sql.includes('SELECT id FROM public.intel_people')) return { rows: [] }
    if (sql.includes('INSERT INTO public.intel_people')) return { rows: [{ id: 'person-1' }] }
    if (sql.includes('INSERT INTO public.intel_person_account_relationships')) {
      relationshipCounter += 1
      return { rows: [{ id: `person-relationship-${relationshipCounter}` }] }
    }
    if (sql.includes('INSERT INTO public.intel_account_experiences')) {
      experienceParams.push(params)
      return { rows: [{ id: `experience-${experienceParams.length}`, person_relationship_id: params[1], firm_relationship_id: null }] }
    }
    if (sql.includes('INSERT INTO public.intel_relationship_evidence')) {
      evidenceCounter += 1
      return { rows: [{ id: `evidence-${evidenceCounter}`, experience_id: params[1] }] }
    }
    if (sql.includes('UPDATE public.intel_account_intelligence_batches')) return { rows: [] }
    throw new Error(`Unexpected SQL in test: ${sql.slice(0, 120)}`)
  }
  const client = { query, release: () => undefined }
  const pool = { connect: async () => client, query } as any
  const payload = AccountIntelligenceBatchSchema.parse({
    externalBatchId: 'broker-overlap-batch',
    source: 'codex_broker_research',
    organizations: [
      { ref: 'account-1', externalKey: 'account-1', kind: 'corporate_account', name: 'Account One' },
      { ref: 'account-2', externalKey: 'account-2', kind: 'corporate_account', name: 'Account Two' },
    ],
    people: [{ ref: 'broker-1', externalKey: 'broker-1', fullName: 'Alex Broker' }],
    experiences: [
      {
        ref: 'industrial-account-1',
        externalKey: 'industrial-account-1',
        subjectType: 'person',
        personRef: 'broker-1',
        accountOrganizationRef: 'account-1',
        classification: 'completed_transaction_experience',
        relationshipStatus: 'completed',
        assetClasses: ['industrial'],
        evidence: [evidence('announcement-industrial')],
      },
      {
        ref: 'office-account-2',
        externalKey: 'office-account-2',
        subjectType: 'person',
        personRef: 'broker-1',
        accountOrganizationRef: 'account-2',
        classification: 'historical_account_team_member',
        relationshipStatus: 'historical',
        assetClasses: ['office'],
        evidence: [evidence('announcement-office')],
      },
    ],
  })

  const result = await importAccountIntelligenceBatch({
    pool,
    userId: 'user-1',
    actorRole: 'account_intelligence_agent',
    payload,
  })

  assert.equal(experienceParams.length, 2)
  assert.deepEqual(experienceParams.map((params) => params[8]), [['industrial'], ['office']])
  assert.equal(result.counts.review, 0)
  assert.equal(result.counts.evidenceAdded, 2)
  assert.equal(result.results.filter((item) => item.entityType === 'experience').length, 2)
})
