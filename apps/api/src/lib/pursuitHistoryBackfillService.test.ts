import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPursuitHistoryBackfillPlan } from './pursuitHistoryBackfillService'

test('builds a safe plan only from exact listing and prospect references', async () => {
  const pool = {
    async query() {
      return {
        rows: [
          {
            listing_id: 'listing-2959',
            listing_title: '2959 Parsons Prospects',
            prospect_id: 'prospect-one',
            prospect_label: 'Example Industrial',
            source_kinds: ['sales_activity_import', 'contact_interaction', 'sales_activity_import'],
            evidence_count: '3',
            last_activity_at: '2026-08-20T18:00:00.000Z',
          },
          {
            listing_id: 'listing-2959',
            listing_title: '2959 Parsons Prospects',
            prospect_id: 'prospect-two',
            prospect_label: 'Second Prospect',
            source_kinds: ['activity_event'],
            evidence_count: 1,
            last_activity_at: null,
          },
        ],
      }
    },
  }

  const plan = await buildPursuitHistoryBackfillPlan({
    pool: pool as never,
    userId: 'patrick',
    limit: 50,
  })

  assert.deepEqual(plan.summary, {
    exactLinks: 2,
    pursuitsAffected: 1,
    evidenceRecords: 4,
  })
  assert.deepEqual(plan.items[0], {
    listingId: 'listing-2959',
    listingTitle: '2959 Parsons Prospects',
    prospectId: 'prospect-one',
    prospectLabel: 'Example Industrial',
    sourceKinds: ['contact_interaction', 'sales_activity_import'],
    evidenceCount: 3,
    lastActivityAt: '2026-08-20T18:00:00.000Z',
    disposition: 'safe_to_link',
  })
})

test('plan hash is stable when only generation time changes', async () => {
  const pool = {
    async query() {
      return {
        rows: [{
          listing_id: 'listing-one',
          listing_title: 'Listing one',
          prospect_id: 'prospect-one',
          prospect_label: 'Prospect one',
          source_kinds: ['contact_interaction'],
          evidence_count: 1,
          last_activity_at: '2026-08-20T18:00:00.000Z',
        }],
      }
    },
  }

  const first = await buildPursuitHistoryBackfillPlan({ pool: pool as never, userId: 'patrick' })
  const second = await buildPursuitHistoryBackfillPlan({ pool: pool as never, userId: 'patrick' })

  assert.equal(first.planHash, second.planHash)
  assert.notEqual(first.generatedAt, '')
})
