import assert from 'node:assert/strict'
import test from 'node:test'

import { MarketRecordProposalInputSchema } from './marketRecordProposalService'

const baseProposal = {
  externalId: 'listing-prospect:100-example-street',
  address: '100 Example Street NW, Edmonton, AB',
  latitude: 53.5,
  longitude: -113.5,
}

test('accepts agent-forward prospect types independently from lifecycle status', () => {
  const parsed = MarketRecordProposalInputSchema.parse({
    ...baseProposal,
    prospectTypes: ['listing_prospect'],
  })
  assert.deepEqual(parsed.prospectTypes, ['listing_prospect'])
})

test('keeps older agent proposals compatible and rejects unknown types', () => {
  assert.deepEqual(MarketRecordProposalInputSchema.parse(baseProposal).prospectTypes, [])
  assert.equal(MarketRecordProposalInputSchema.safeParse({
    ...baseProposal,
    prospectTypes: ['listing'],
  }).success, false)
})
