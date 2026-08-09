import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ProspectMergeServiceError,
  ProspectMergeUndoInputSchema,
  __prospectMergeUndoTesting,
  applyProspectMerge,
  listProspectDuplicateCandidates,
  previewProspectMerge,
  resolveCanonicalProspect,
  undoProspectMerge,
} from './prospectMergeService'

const relationshipKeys = [
  'contactInteractions',
  'listingProspects',
  'opportunities',
  'activityEvents',
  'salesActivityImports',
  'emailProspectMatches',
  'propertyDossiers',
  'brokerageMemoryItems',
  'touches',
  'activityEventLinks',
  'dossierEntityLinks',
  'skillActivities',
] as const

type TestRelationshipRow = Record<string, unknown> & { id: string }
type TestRelationships = Record<typeof relationshipKeys[number], TestRelationshipRow[]>

function emptyRelationships(): TestRelationships {
  return Object.fromEntries(relationshipKeys.map((key) => [key, []])) as unknown as TestRelationships
}

const relationshipTableToKey = {
  contact_interactions: 'contactInteractions',
  listing_prospects: 'listingProspects',
  opportunities: 'opportunities',
  activity_events: 'activityEvents',
  sales_activity_imports: 'salesActivityImports',
  email_prospect_matches: 'emailProspectMatches',
  intel_property_dossiers: 'propertyDossiers',
  brokerage_memory_items: 'brokerageMemoryItems',
  touches: 'touches',
  activity_event_links: 'activityEventLinks',
  intel_dossier_entity_links: 'dossierEntityLinks',
  skill_activities: 'skillActivities',
} as const

function relationshipRowsForSql(sql: string, relationships: ReturnType<typeof emptyRelationships>) {
  for (const [table, key] of Object.entries(relationshipTableToKey)) {
    if (new RegExp(`FROM public\\.${table}\\b`, 'i').test(sql)) return relationships[key]
  }
  return null
}

function placeholderIndexes(sql: string) {
  return Array.from(sql.matchAll(/\$(\d+)/g), (match) => Number(match[1]))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right)
}

function mergePool(options: {
  relationships?: ReturnType<typeof emptyRelationships>
  visibleProspects?: Array<ReturnType<typeof prospectRow>>
  priorEvent?: Record<string, unknown> | null
  failContactMove?: boolean
  failOpportunityMove?: boolean
} = {}) {
  const relationships = options.relationships || emptyRelationships()
  const prospects = options.visibleProspects || [prospectRow('canonical'), prospectRow('duplicate')]
  const sqlSeen: string[] = []
  const query = async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    sqlSeen.push(normalized)
    if (/LEFT JOIN public\.prospect_merge_events events ON false/i.test(normalized)) return { rows: [], rowCount: 0 }
    if (/FROM public\.prospects p/i.test(normalized)) return { rows: prospects, rowCount: prospects.length }
    const relationshipRows = relationshipRowsForSql(normalized, relationships)
    if (relationshipRows) return { rows: relationshipRows, rowCount: relationshipRows.length }
    throw new Error(`Unexpected preview SQL: ${normalized}`)
  }
  const client = {
    query: async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      sqlSeen.push(normalized)
      if (/^BEGIN ISOLATION LEVEL SERIALIZABLE$|^COMMIT$|^ROLLBACK$/i.test(normalized)) return { rows: [], rowCount: null }
      if (/SELECT id, canonical_prospect_id, duplicate_prospect_ids, preview_hash, field_choices, status, moved_counts FROM public\.prospect_merge_events/i.test(normalized)) {
        return { rows: options.priorEvent ? [options.priorEvent] : [], rowCount: options.priorEvent ? 1 : 0 }
      }
      if (/FROM public\.prospects p/i.test(normalized)) return { rows: prospects, rowCount: prospects.length }
      const relationshipRows = relationshipRowsForSql(normalized, relationships)
      if (relationshipRows) return { rows: relationshipRows, rowCount: relationshipRows.length }
      if (/^INSERT INTO public\.prospect_merge_events/i.test(normalized)) return { rows: [], rowCount: 1 }
      if (/^UPDATE public\.prospects/i.test(normalized)) return { rows: [], rowCount: 1 }
      if (/^UPDATE public\.contact_interactions/i.test(normalized) && options.failContactMove) {
        throw new Error('injected relationship failure')
      }
      if (/^UPDATE public\.opportunities/i.test(normalized) && options.failOpportunityMove) {
        throw new Error('injected post-listing relationship failure')
      }
      if (/^UPDATE public\./i.test(normalized)) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected apply SQL: ${normalized}`)
    },
    release: () => undefined,
  }
  return {
    pool: { query, connect: async () => client },
    relationships,
    sqlSeen,
  }
}

function prospectRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: 'user-one',
    name: id === 'canonical' ? '100 First Street NW' : '100 First St NW',
    status: 'prospect',
    notes: null,
    geometry_json: { type: 'Point', coordinates: [-113.5, 53.5] },
    submarket_id: null,
    last_contact_date: null,
    follow_up_timeframe: null,
    follow_up_due_date: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_company: null,
    building_sf: null,
    lot_size_acres: null,
    ai_metadata: null,
    business_name: null,
    website_url: null,
    address: '100 First Street NW',
    location_lat: 53.5,
    location_lng: -113.5,
    resolved_lat: 53.5,
    resolved_lng: -113.5,
    geohash: null,
    market_key: null,
    market_confidence: null,
    market_context_source: null,
    market_context_status: 'unknown',
    merged_into_prospect_id: null,
    merged_at: null,
    merged_by_user_id: null,
    merge_event_id: null,
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
    ...overrides,
  }
}

function stateSnapshot(row: ReturnType<typeof prospectRow>) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    notes: row.notes,
    geometry: row.geometry_json,
    submarketId: row.submarket_id,
    lastContactDate: row.last_contact_date,
    followUpTimeframe: row.follow_up_timeframe,
    followUpDueDate: row.follow_up_due_date,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactCompany: row.contact_company,
    buildingSf: row.building_sf,
    lotSizeAcres: row.lot_size_acres,
    aiMetadata: row.ai_metadata,
    businessName: row.business_name,
    websiteUrl: row.website_url,
    address: row.address,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    geohash: row.geohash,
    marketKey: row.market_key,
    marketConfidence: row.market_confidence,
    marketContextSource: row.market_context_source,
    marketContextStatus: row.market_context_status,
    mergedIntoProspectId: row.merged_into_prospect_id,
    mergedAt: row.merged_at,
    mergedByUserId: row.merged_by_user_id,
    mergeEventId: row.merge_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function undoPool(options: { changedProspect?: boolean; eventVisible?: boolean } = {}) {
  const eventId = '11111111-1111-4111-8111-111111111111'
  const beforeCanonical = prospectRow('canonical')
  const beforeDuplicate = prospectRow('duplicate')
  const afterCanonical = prospectRow('canonical', {
    notes: 'combined',
    updated_at: '2026-08-08T12:01:00.000Z',
  })
  const afterDuplicate = prospectRow('duplicate', {
    merged_into_prospect_id: 'canonical',
    merged_at: '2026-08-08T12:01:01.000Z',
    merged_by_user_id: 'user-one',
    merge_event_id: eventId,
    updated_at: '2026-08-08T12:01:01.000Z',
  })
  const event = {
    id: eventId,
    user_id: 'user-one',
    canonical_prospect_id: 'canonical',
    duplicate_prospect_ids: ['duplicate'],
    before_snapshot: {
      snapshotVersion: 2,
      canonical: stateSnapshot(beforeCanonical),
      duplicate: stateSnapshot(beforeDuplicate),
    },
    relationship_snapshot: emptyRelationships(),
    after_snapshot: {
      snapshotVersion: 2,
      canonical: stateSnapshot(afterCanonical),
      duplicate: stateSnapshot(afterDuplicate),
    },
    status: 'completed',
  }
  const sqlSeen: string[] = []
  let prospectRestoreCount = 0
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      sqlSeen.push(normalized)
      if (/^BEGIN ISOLATION LEVEL SERIALIZABLE$/i.test(normalized)) return { rows: [], rowCount: null }
      if (/^ROLLBACK$|^COMMIT$/i.test(normalized)) return { rows: [], rowCount: null }
      if (/FROM public\.prospect_merge_events/i.test(normalized)) {
        const visible = options.eventVisible !== false && values?.[1] === 'user-one'
        return { rows: visible ? [event] : [], rowCount: visible ? 1 : 0 }
      }
      if (/FROM public\.prospects p/i.test(normalized)) {
        if (prospectRestoreCount >= 2) return { rows: [beforeCanonical, beforeDuplicate], rowCount: 2 }
        const canonical = options.changedProspect
          ? { ...afterCanonical, name: 'Changed after merge' }
          : afterCanonical
        return { rows: [canonical, afterDuplicate], rowCount: 2 }
      }
      if (/^UPDATE public\.prospects/i.test(normalized)) {
        prospectRestoreCount += 1
        return { rows: [], rowCount: 1 }
      }
      if (/^UPDATE public\.prospect_merge_events/i.test(normalized)) return { rows: [], rowCount: 1 }
      if (/FROM public\.(contact_interactions|listing_prospects|opportunities|activity_events|sales_activity_imports|email_prospect_matches|intel_property_dossiers|brokerage_memory_items|touches|activity_event_links|intel_dossier_entity_links|skill_activities)/i.test(normalized)) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`Unexpected test SQL: ${normalized}`)
    },
    release: () => undefined,
  }
  return {
    pool: {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => client,
    },
    eventId,
    sqlSeen,
  }
}

test('undo requires an explicit confirmation', () => {
  assert.equal(ProspectMergeUndoInputSchema.safeParse({}).success, false)
  assert.equal(ProspectMergeUndoInputSchema.safeParse({ confirmUndo: true }).success, true)
})

test('merge preview rejects a pair that is not fully owned by the signed-in broker', async () => {
  const fake = mergePool({ visibleProspects: [prospectRow('canonical')] })
  await assert.rejects(
    previewProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      canonicalProspectId: 'canonical',
      duplicateProspectId: 'duplicate',
    }),
    (error: unknown) => error instanceof ProspectMergeServiceError
      && error.code === 'prospect_pair_not_found'
      && error.status === 404,
  )
})

test('merge preview blocks a unique listing-link collision', async () => {
  const relationships = emptyRelationships()
  relationships.listingProspects = [
    { id: 'canonical-listing-link', listing_id: 'listing-one', prospect_id: 'canonical', role: 'target' },
    { id: 'duplicate-listing-link', listing_id: 'listing-one', prospect_id: 'duplicate', role: 'target' },
  ]
  const fake = mergePool({ relationships })
  const preview = await previewProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    canonicalProspectId: 'canonical',
    duplicateProspectId: 'duplicate',
  })

  assert.equal(preview.canApply, false)
  assert.deepEqual(preview.blockers.map((blocker) => blocker.code), ['listing_link_collision'])
})

test('listing-link preview binds every parameter and scopes links through broker-owned listings', async () => {
  const fake = mergePool()
  await previewProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    canonicalProspectId: 'canonical',
    duplicateProspectId: 'duplicate',
  })

  const query = fake.sqlSeen.find((sql) => /FROM public\.listing_prospects\b/i.test(sql))
  assert.ok(query)
  assert.deepEqual(placeholderIndexes(query), [1, 2, 3])
  assert.match(query, /INNER JOIN public\.listings listings/i)
  assert.match(query, /listings\.user_id = \$1/i)
})

test('listing-link moves bind every parameter and cannot cross the broker listing boundary', async () => {
  const relationships = emptyRelationships()
  relationships.listingProspects = [
    { id: 'duplicate-listing-link', listing_id: 'listing-two', prospect_id: 'duplicate', role: 'target' },
  ]
  relationships.opportunities = [
    { id: 'duplicate-opportunity', prospect_id: 'duplicate' },
  ]
  const fake = mergePool({ relationships, failOpportunityMove: true })
  const preview = await previewProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    canonicalProspectId: 'canonical',
    duplicateProspectId: 'duplicate',
  })

  await assert.rejects(
    applyProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      canonicalProspectId: 'canonical',
      duplicateProspectId: 'duplicate',
      previewHash: preview.previewHash,
      idempotencyKey: 'listing-ownership-scope-test',
      confirmConflicts: true,
      fieldChoices: preview.defaultFieldChoices,
    }),
    /injected post-listing relationship failure/,
  )

  const query = fake.sqlSeen.find((sql) => /^UPDATE public\.listing_prospects\b/i.test(sql))
  assert.ok(query)
  assert.deepEqual(placeholderIndexes(query), [1, 2, 3, 4])
  assert.match(query, /SELECT id FROM public\.listings WHERE user_id = \$1/i)
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
})

test('a stale preview rolls back before any merge mutation', async () => {
  const fake = mergePool()
  await assert.rejects(
    applyProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      canonicalProspectId: 'canonical',
      duplicateProspectId: 'duplicate',
      previewHash: '0'.repeat(64),
      idempotencyKey: 'stale-preview-test',
      confirmConflicts: true,
      fieldChoices: {},
    }),
    (error: unknown) => error instanceof ProspectMergeServiceError && error.code === 'stale_preview',
  )
  assert.equal(fake.sqlSeen.some((sql) => /^INSERT INTO public\.prospect_merge_events/i.test(sql)), false)
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
})

test('an injected relationship failure rolls back the entire merge transaction', async () => {
  const relationships = emptyRelationships()
  relationships.contactInteractions = [
    { id: 'interaction-one', prospect_id: 'duplicate' },
  ]
  const fake = mergePool({ relationships, failContactMove: true })
  const preview = await previewProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    canonicalProspectId: 'canonical',
    duplicateProspectId: 'duplicate',
  })

  await assert.rejects(
    applyProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      canonicalProspectId: 'canonical',
      duplicateProspectId: 'duplicate',
      previewHash: preview.previewHash,
      idempotencyKey: 'rollback-injection-test',
      confirmConflicts: true,
      fieldChoices: preview.defaultFieldChoices,
    }),
    /injected relationship failure/,
  )
  assert.ok(fake.sqlSeen.some((sql) => /^INSERT INTO public\.prospect_merge_events/i.test(sql)))
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
  assert.equal(fake.sqlSeen.some((sql) => /(?:INSERT|UPDATE).*\b(?:xp|experience)\b/i.test(sql)), false)
})

test('an idempotent retry returns the existing event without touching prospects', async () => {
  const previewHash = 'a'.repeat(64)
  const fake = mergePool({
    priorEvent: {
      id: 'merge-event-one',
      canonical_prospect_id: 'canonical',
      duplicate_prospect_ids: ['duplicate'],
      preview_hash: previewHash,
      field_choices: {},
      status: 'completed',
      moved_counts: { contactInteractions: 1 },
    },
  })
  const result = await applyProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    canonicalProspectId: 'canonical',
    duplicateProspectId: 'duplicate',
    previewHash,
    idempotencyKey: 'same-request-retry',
    confirmConflicts: true,
    fieldChoices: {},
  })

  assert.equal(result.alreadyApplied, true)
  assert.equal(result.mergeEventId, 'merge-event-one')
  assert.equal(fake.sqlSeen.some((sql) => /^UPDATE public\.prospects/i.test(sql)), false)
  assert.equal(fake.sqlSeen.at(-1), 'COMMIT')
})

test('an idempotency key cannot be reused with different explicit field choices', async () => {
  const previewHash = 'b'.repeat(64)
  const fake = mergePool({
    priorEvent: {
      id: 'merge-event-two',
      canonical_prospect_id: 'canonical',
      duplicate_prospect_ids: ['duplicate'],
      preview_hash: previewHash,
      field_choices: { name: 'canonical' },
      status: 'completed',
      moved_counts: {},
    },
  })

  await assert.rejects(
    applyProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      canonicalProspectId: 'canonical',
      duplicateProspectId: 'duplicate',
      previewHash,
      idempotencyKey: 'reused-with-different-choice',
      confirmConflicts: true,
      fieldChoices: { name: 'duplicate' },
    }),
    (error) => error instanceof ProspectMergeServiceError
      && error.status === 409
      && error.code === 'idempotency_conflict',
  )
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
})

test('expected post-merge relationships preserve row IDs and move only duplicate memberships', () => {
  const before = emptyRelationships() as ReturnType<typeof emptyRelationships> & {
    listingProspects: Array<Record<string, unknown> & { id: string }>
  }
  before.listingProspects = [
    { id: 'canonical-link', listing_id: 'listing-a', prospect_id: 'canonical' },
    { id: 'duplicate-link', listing_id: 'listing-b', prospect_id: 'duplicate' },
  ]
  const expected = __prospectMergeUndoTesting.expectedRelationshipsAfterMerge(
    before as never,
    'canonical',
    'duplicate',
  )
  assert.deepEqual(expected.listingProspects, [
    { id: 'canonical-link', listing_id: 'listing-a', prospect_id: 'canonical' },
    { id: 'duplicate-link', listing_id: 'listing-b', prospect_id: 'canonical' },
  ])
  assert.equal(before.listingProspects[1].prospect_id, 'duplicate')
  assert.equal(__prospectMergeUndoTesting.relationshipSnapshotsEqual(expected, expected), true)
  assert.equal(__prospectMergeUndoTesting.relationshipSnapshotsEqual(expected, {
    ...expected,
    listingProspects: expected.listingProspects.slice(0, 1),
  }), false)
})

test('undo is serializable, locks state, restores exact snapshots, and does not award XP', async () => {
  const fake = undoPool()
  const result = await undoProspectMerge({
    pool: fake.pool as never,
    userId: 'user-one',
    mergeEventId: fake.eventId,
    confirmUndo: true,
  })
  assert.equal(result.status, 'reversed')
  assert.equal(fake.sqlSeen[0], 'BEGIN ISOLATION LEVEL SERIALIZABLE')
  assert.ok(fake.sqlSeen.some((sql) => /prospect_merge_events.*FOR UPDATE/i.test(sql)))
  assert.ok(fake.sqlSeen.some((sql) => /FROM public\.prospects p.*FOR UPDATE/i.test(sql)))
  assert.ok(fake.sqlSeen.some((sql) => /FROM public\.listing_prospects.*FOR UPDATE/i.test(sql)))
  assert.equal(fake.sqlSeen.some((sql) => /(?:INSERT|UPDATE).*\b(?:xp|experience)\b/i.test(sql)), false)
  assert.equal(fake.sqlSeen.at(-1), 'COMMIT')
})

test('undo refuses a prospect changed after merge and rolls back before restoration', async () => {
  const fake = undoPool({ changedProspect: true })
  await assert.rejects(
    undoProspectMerge({
      pool: fake.pool as never,
      userId: 'user-one',
      mergeEventId: fake.eventId,
      confirmUndo: true,
    }),
    (error: unknown) => error instanceof ProspectMergeServiceError && error.code === 'undo_prospect_changed',
  )
  assert.equal(fake.sqlSeen.some((sql) => /^UPDATE public\.prospects/i.test(sql)), false)
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
})

test('undo cannot access another broker\'s merge event', async () => {
  const fake = undoPool({ eventVisible: false })
  await assert.rejects(
    undoProspectMerge({
      pool: fake.pool as never,
      userId: 'user-two',
      mergeEventId: fake.eventId,
      confirmUndo: true,
    }),
    (error: unknown) => error instanceof ProspectMergeServiceError && error.code === 'merge_event_not_found',
  )
  assert.equal(fake.sqlSeen.at(-1), 'ROLLBACK')
})

test('old prospect resolution retains the originating merge event', async () => {
  const mergeEventId = '11111111-1111-4111-8111-111111111111'
  const sqlSeen: string[] = []
  const fakePool = {
    query: async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      sqlSeen.push(normalized)
      if (/LEFT JOIN public\.prospect_merge_events/i.test(normalized)) return { rows: [] }
      return {
        rows: [{
          id: 'canonical',
          merged_into_prospect_id: null,
          merge_event_id: null,
          origin_merge_event_id: mergeEventId,
          depth: 1,
        }],
      }
    },
  }
  const result = await resolveCanonicalProspect({
    pool: fakePool as never,
    userId: 'user-one',
    prospectId: 'duplicate',
  })
  assert.equal(result.canonicalProspectId, 'canonical')
  assert.equal(result.mergeEventId, mergeEventId)
  assert.match(sqlSeen[1], /chain\.origin_merge_event_id/)
})

test('candidate discovery does not let a reused market key cluster unrelated prospects', async () => {
  const sharedMarketKey = 'google-place:reused-corrupt-key'
  const rows = [
    prospectRow('duplicate-a', {
      name: '14840 115 Avenue NW',
      address: null,
      market_key: sharedMarketKey,
      resolved_lat: 53.566,
      resolved_lng: -113.577,
    }),
    prospectRow('duplicate-b', {
      name: '14840 115 Ave NW',
      address: null,
      market_key: sharedMarketKey,
      resolved_lat: 53.56601,
      resolved_lng: -113.57701,
    }),
    prospectRow('layfield', {
      name: 'Layfield',
      address: null,
      market_key: sharedMarketKey,
      resolved_lat: 53.52,
      resolved_lng: -113.62,
    }),
    prospectRow('home-depot', {
      name: 'Home Depot',
      address: null,
      market_key: sharedMarketKey,
      resolved_lat: 53.48,
      resolved_lng: -113.49,
    }),
  ].map((row) => ({
    ...row,
    listing_count: 0,
    interaction_count: 0,
    activity_count: 0,
    opportunity_count: 0,
    dossier_count: 0,
  }))
  const pool = {
    query: async (sql: string) => {
      if (/LEFT JOIN public\.prospect_merge_events events ON false/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/FROM public\.prospects p/i.test(sql)) return { rows, rowCount: rows.length }
      throw new Error(`Unexpected candidate SQL: ${sql.replace(/\s+/g, ' ').trim()}`)
    },
  }

  const result = await listProspectDuplicateCandidates({
    pool: pool as never,
    userId: 'user-one',
  })

  assert.equal(result.groups.length, 1)
  assert.deepEqual(
    result.groups[0].prospects.map((prospect) => prospect.id).sort(),
    ['duplicate-a', 'duplicate-b'],
  )
  assert.ok(result.groups[0].reasons.includes('same normalized civic address'))
  assert.equal(result.groups[0].reasons.includes('same durable market key'), false)
})

test('candidate discovery still trusts a small, spatially coherent durable-key group', async () => {
  const rows = [
    prospectRow('canonical-key', {
      name: 'Layfield',
      address: null,
      market_key: 'google-place:stable-key',
      resolved_lat: 53.52,
      resolved_lng: -113.62,
    }),
    prospectRow('duplicate-key', {
      name: 'Layfield Canada',
      address: null,
      market_key: 'google-place:stable-key',
      resolved_lat: 53.52001,
      resolved_lng: -113.62001,
    }),
  ].map((row) => ({
    ...row,
    listing_count: 0,
    interaction_count: 0,
    activity_count: 0,
    opportunity_count: 0,
    dossier_count: 0,
  }))
  const pool = {
    query: async (sql: string) => {
      if (/LEFT JOIN public\.prospect_merge_events events ON false/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/FROM public\.prospects p/i.test(sql)) return { rows, rowCount: rows.length }
      throw new Error(`Unexpected candidate SQL: ${sql.replace(/\s+/g, ' ').trim()}`)
    },
  }

  const result = await listProspectDuplicateCandidates({
    pool: pool as never,
    userId: 'user-one',
  })

  assert.equal(result.groups.length, 1)
  assert.deepEqual(result.groups[0].reasons, ['same durable market key'])
})

test('candidate discovery does not trust a durable key without civic or coordinate corroboration', async () => {
  const rows = [
    prospectRow('missing-location-a', {
      name: 'Layfield',
      address: null,
      market_key: 'google-place:unverifiable-key',
      resolved_lat: null,
      resolved_lng: null,
    }),
    prospectRow('missing-location-b', {
      name: 'Home Depot',
      address: null,
      market_key: 'google-place:unverifiable-key',
      resolved_lat: null,
      resolved_lng: null,
    }),
  ].map((row) => ({
    ...row,
    listing_count: 0,
    interaction_count: 0,
    activity_count: 0,
    opportunity_count: 0,
    dossier_count: 0,
  }))
  const pool = {
    query: async (sql: string) => {
      if (/LEFT JOIN public\.prospect_merge_events events ON false/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/FROM public\.prospects p/i.test(sql)) return { rows, rowCount: rows.length }
      throw new Error(`Unexpected candidate SQL: ${sql.replace(/\s+/g, ' ').trim()}`)
    },
  }

  const result = await listProspectDuplicateCandidates({
    pool: pool as never,
    userId: 'user-one',
  })

  assert.deepEqual(result.groups, [])
})

test('candidate discovery caps even spatially coherent durable-key groups', async () => {
  const rows = ['Layfield', 'Home Depot', 'Durum', 'Rebel Heart', 'Habitat', 'Company Six'].map((name, index) => ({
    ...prospectRow(`shared-key-${index}`, {
      name,
      address: null,
      market_key: 'google-place:overused-key',
      resolved_lat: 53.52,
      resolved_lng: -113.62,
    }),
    listing_count: 0,
    interaction_count: 0,
    activity_count: 0,
    opportunity_count: 0,
    dossier_count: 0,
  }))
  const pool = {
    query: async (sql: string) => {
      if (/LEFT JOIN public\.prospect_merge_events events ON false/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/FROM public\.prospects p/i.test(sql)) return { rows, rowCount: rows.length }
      throw new Error(`Unexpected candidate SQL: ${sql.replace(/\s+/g, ' ').trim()}`)
    },
  }

  const result = await listProspectDuplicateCandidates({
    pool: pool as never,
    userId: 'user-one',
  })

  assert.deepEqual(result.groups, [])
})
