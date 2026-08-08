import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPropertyEvidenceBatch,
  parsePropertyEvidenceDryRun,
  PROPERTY_TITLE_AUDIT_SOURCE,
} from './propertyEvidenceImport'

function sampleDryRun() {
  return {
    mode: 'dry_run',
    source: PROPERTY_TITLE_AUDIT_SOURCE,
    generatedAt: '2026-08-08T12:00:00.000Z',
    summary: { cases: 2, eventDrafts: 2, proposalDrafts: 0, groups: { probable_match: 2 } },
    cases: [
      {
        caseId: 'PLP-ONE',
        folderName: 'First property',
        group: 'probable_match',
        groupLabel: 'Probable match',
        verifiedAddress: '100 First Street, Edmonton, AB',
        candidateIds: ['prospect:one'],
        matchSignals: ['address exact'],
        matchConflicts: [],
        fieldsThatWouldBeWritten: ['activity_events:summary'],
        noMapMutationReason: 'Broker review is required.',
        recommendedAction: 'Confirm the existing record.',
        eventDrafts: [{
          source: PROPERTY_TITLE_AUDIT_SOURCE,
          externalEventId: 'plp:one:title:hash',
          eventType: 'title_pulled',
          direction: 'internal',
          evidenceStatus: 'observed',
          occurredAt: '2026-08-08T12:00:00.000Z',
          subject: 'Land title pulled: First property',
          summary: 'Title reviewed.',
          propertyAddress: '100 First Street, Edmonton, AB',
          confidence: 90,
          matchStatus: 'needs_review',
          matchReason: 'Broker review is required.',
          prospectId: null,
          sourceMetadata: { caseId: 'PLP-ONE' },
        }],
      },
      {
        caseId: 'PLP-TWO',
        folderName: 'Second property',
        group: 'probable_match',
        groupLabel: 'Probable match',
        verifiedAddress: null,
        candidateIds: [],
        matchSignals: [],
        matchConflicts: [],
        fieldsThatWouldBeWritten: [],
        noMapMutationReason: 'No verified property address.',
        recommendedAction: null,
        eventDrafts: [{
          source: PROPERTY_TITLE_AUDIT_SOURCE,
          externalEventId: 'plp:two:owner:hash',
          eventType: 'owner_identified',
          direction: 'internal',
          evidenceStatus: 'observed',
          occurredAt: '2026-08-08T12:00:00.000Z',
          company: 'Owner Ltd.',
          subject: 'Registered owner shown on title: Second property',
          summary: 'Owner reviewed.',
          propertyAddress: null,
          confidence: 80,
          matchStatus: 'needs_review',
          matchReason: 'No verified property address.',
          sourceMetadata: { caseId: 'PLP-TWO' },
        }],
      },
    ],
  }
}

test('parses a Level CRE property-title dry run', () => {
  const parsed = parsePropertyEvidenceDryRun(JSON.stringify(sampleDryRun()))
  assert.equal(parsed.cases.length, 2)
  assert.equal(parsed.cases[0]?.eventDrafts[0]?.externalEventId, 'plp:one:title:hash')
})

test('rejects generic JSON and non-dry-run payloads', () => {
  assert.throws(() => parsePropertyEvidenceDryRun('{"hello":"world"}'), /not a Level CRE property-title dry run/)
  assert.throws(() => parsePropertyEvidenceDryRun('{broken'), /not valid JSON/)
})

test('builds a batch from only the explicitly selected cases', () => {
  const parsed = parsePropertyEvidenceDryRun(JSON.stringify(sampleDryRun()))
  const batch = buildPropertyEvidenceBatch(parsed, ['PLP-TWO'])
  assert.equal(batch.source, PROPERTY_TITLE_AUDIT_SOURCE)
  assert.deepEqual(batch.events.map((event) => event.externalEventId), ['plp:two:owner:hash'])
})

test('refuses an empty selection', () => {
  const parsed = parsePropertyEvidenceDryRun(JSON.stringify(sampleDryRun()))
  assert.throws(() => buildPropertyEvidenceBatch(parsed, []), /Select at least one case/)
})
