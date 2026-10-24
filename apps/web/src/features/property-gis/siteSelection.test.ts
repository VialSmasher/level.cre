import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedStandaloneSiteAnchor, boundaryForProperty, dossierAnchorForProspect, googleParcelPaths, initialCandidateKey } from './siteSelection'
import type { MarketMemoryAnchor, PropertySiteInformationPreview } from '@level-cre/shared'

test('standalone review pins cannot borrow parcel context from a merely suggested dossier', () => {
  const approved = { latitude: 53.578, longitude: -113.572, persistence: { state: 'approved', dossierId: 'saved-property' } } as MarketMemoryAnchor
  const pending = { latitude: 53.6, longitude: -113.6, persistence: { state: 'pending', dossierId: 'saved-property' } } as MarketMemoryAnchor
  const localPreview = { ...pending, persistence: { ...pending.persistence, state: 'local_preview' } } as MarketMemoryAnchor
  assert.equal(approvedStandaloneSiteAnchor(pending), null)
  assert.equal(approvedStandaloneSiteAnchor(localPreview), null)
  assert.equal(approvedStandaloneSiteAnchor({ ...approved, persistence: { state: 'approved' } }), null)
  assert.equal(approvedStandaloneSiteAnchor(null), null)
  assert.equal(approvedStandaloneSiteAnchor(approved), approved)
})

test('linked CRM selection prefers the displayed property dossier over occupant evidence', () => {
  const property = { persistence: { state: 'approved', dossierId: 'property-dossier', linkedProspectId: 'property' } } as MarketMemoryAnchor
  const occupant = { persistence: { state: 'approved', dossierId: 'occupant-dossier', linkedProspectId: 'occupant' } } as MarketMemoryAnchor
  assert.equal(dossierAnchorForProspect([occupant, property], 'property'), property)
  assert.equal(dossierAnchorForProspect([property], 'property'), property)
})

test('pending evidence and ambiguous dossier links do not silently choose a GIS target', () => {
  const first = { persistence: { state: 'approved', dossierId: 'one' } } as MarketMemoryAnchor
  const second = { persistence: { state: 'approved', dossierId: 'two' } } as MarketMemoryAnchor
  const pending = { persistence: { state: 'pending', dossierId: 'pending' } } as MarketMemoryAnchor
  assert.equal(dossierAnchorForProspect([first, second], 'property'), null)
  assert.equal(dossierAnchorForProspect([pending], 'property'), null)
  assert.equal(dossierAnchorForProspect([first, { ...first }], 'property'), first)
})

test('switching properties hides the prior boundary immediately', () => {
  const candidate = { sourceQualifiedKey: 'edmonton:1' } as PropertySiteInformationPreview['candidates'][number]
  const selection = { propertyKey: 'property-a', candidate }
  assert.equal(boundaryForProperty(selection, 'property-a'), candidate)
  assert.equal(boundaryForProperty(selection, 'property-b'), null)
  assert.equal(boundaryForProperty(selection, null), null)
})

test('ambiguous or conflicted parcel candidates require explicit inspection choice', () => {
  const candidate = { sourceQualifiedKey: 'edmonton:1' } as PropertySiteInformationPreview['candidates'][number]
  assert.equal(initialCandidateKey({ status: 'matched', candidates: [candidate] } as PropertySiteInformationPreview), candidate.sourceQualifiedKey)
  assert.equal(initialCandidateKey({ status: 'ambiguous', candidates: [candidate] } as PropertySiteInformationPreview), null)
  assert.equal(initialCandidateKey({ status: 'matched', candidates: [candidate, candidate] } as PropertySiteInformationPreview), null)
})

test('Google overlay retains all MultiPolygon parts and subtractive holes without mutating evidence', () => {
  const boundary = { type: 'MultiPolygon' as const, coordinates: [
    [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]],
    [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
  ] as [number, number][][][] }
  const before = JSON.stringify(boundary)
  const result = googleParcelPaths(boundary)
  const winding = (ring: { lat: number; lng: number }[]) => ring.reduce((sum, p, i) => {
    const n = ring[(i + 1) % ring.length]
    return sum + p.lng * n.lat - n.lng * p.lat
  }, 0)
  assert.equal(result.length, 2)
  assert.equal(result[0].length, 2)
  assert.ok(winding(result[0][0]) > 0)
  assert.ok(winding(result[0][1]) < 0)
  assert.deepEqual(result[1][0][0], { lat: 5, lng: 5 })
  assert.equal(JSON.stringify(boundary), before)
})
