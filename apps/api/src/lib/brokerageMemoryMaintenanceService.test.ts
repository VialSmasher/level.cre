import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBrokerageMemoryMaintenancePlan } from './brokerageMemoryMaintenanceService'

test('background maintenance approves map-ready memory and holds only unplaceable exceptions', async () => {
  const pool = {
    query: async () => ({
      rows: [
        {
          id: 'ready-item',
          import_id: 'import-one',
          suggested_layer: 'review',
          address: '11710 Kingsway NW, Edmonton',
          lat: 53.568,
          lng: -113.523,
          matched_dossier_id: null,
          matched_prospect_id: 'prospect-one',
          matched_listing_id: null,
          match_confidence: 65,
          review_reasons: ['Address differs'],
          updated_at: new Date('2026-08-20T12:00:00Z'),
          source_file_name: 'market-memory.json',
        },
        {
          id: 'unplaceable-item',
          import_id: 'import-one',
          suggested_layer: 'review',
          address: '',
          lat: null,
          lng: null,
          matched_dossier_id: null,
          matched_prospect_id: null,
          matched_listing_id: null,
          match_confidence: 0,
          review_reasons: ['Missing location'],
          updated_at: new Date('2026-08-20T12:01:00Z'),
          source_file_name: 'market-memory.json',
        },
      ],
    }),
  }

  const plan = await buildBrokerageMemoryMaintenancePlan({
    pool: pool as never,
    userId: 'user-one',
  })

  assert.equal(plan.summary.pendingItems, 2)
  assert.equal(plan.summary.backgroundApprovals, 1)
  assert.equal(plan.summary.heldExceptions, 1)
  assert.equal(plan.summary.linkedProspects, 1)
  assert.equal(plan.items[0].disposition, 'approve_in_background')
  assert.equal(plan.items[1].disposition, 'hold_as_exception')
  assert.match(plan.planHash, /^[a-f0-9]{64}$/)
})

test('maintenance plan hash is stable when only the generation time changes', async () => {
  const row = {
    id: 'ready-item',
    import_id: 'import-one',
    suggested_layer: 'existing',
    address: '2959 Parsons Road NW, Edmonton',
    lat: 53.463,
    lng: -113.488,
    matched_dossier_id: 'dossier-one',
    matched_prospect_id: 'prospect-one',
    matched_listing_id: 'listing-one',
    match_confidence: 95,
    review_reasons: [],
    updated_at: new Date('2026-08-20T12:00:00Z'),
    source_file_name: 'market-memory.json',
  }
  const pool = { query: async () => ({ rows: [row] }) }

  const first = await buildBrokerageMemoryMaintenancePlan({ pool: pool as never, userId: 'user-one' })
  const second = await buildBrokerageMemoryMaintenancePlan({ pool: pool as never, userId: 'user-one' })

  assert.equal(first.planHash, second.planHash)
})
