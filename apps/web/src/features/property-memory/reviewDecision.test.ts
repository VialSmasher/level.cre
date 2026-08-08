import assert from 'node:assert/strict'
import test from 'node:test'

import { propertyMemoryTargetFromValue } from './reviewDecision'

test('create separate explicitly rejects every suggested target', () => {
  assert.deepEqual(propertyMemoryTargetFromValue('new'), {
    targetDossierId: null,
    targetProspectId: null,
    targetListingId: null,
  })
})

test('choosing one target explicitly clears the other target kinds', () => {
  assert.deepEqual(propertyMemoryTargetFromValue('dossier:dossier-one'), {
    targetDossierId: 'dossier-one',
    targetProspectId: null,
    targetListingId: null,
  })
  assert.deepEqual(propertyMemoryTargetFromValue('prospect:prospect-one'), {
    targetDossierId: null,
    targetProspectId: 'prospect-one',
    targetListingId: null,
  })
})
