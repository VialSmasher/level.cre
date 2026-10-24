import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PropertyGisBoundarySchema, type PropertyGisBoundary } from '@level-cre/shared'
import { EDMONTON_PARCEL_URL, EDMONTON_ZONING_URL, lookupEdmontonSiteInformation } from './edmontonAdapter'
import { boundaryAcres, boundaryPointRelation } from './geometry'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/edmonton-150367.public.json', import.meta.url), 'utf8'))
const zoningFixture = JSON.parse(readFileSync(new URL('./fixtures/edmonton-286695-zoning.public.json', import.meta.url), 'utf8'))
const point = { latitude: 53.578, longitude: -113.572, municipality: 'Edmonton' }
const fixedDate = () => new Date('2026-10-23T20:00:00.000Z')
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
function fakeSources(parcel: unknown = fixture, zoning: unknown = zoningFixture) {
  const calls: Array<{ url: URL; init?: RequestInit }> = []
  const fetchImpl = (async (request: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(request))
    calls.push({ url, init })
    return json(url.hostname === 'gis.edmonton.ca' ? parcel : zoning)
  }) as typeof fetch
  return { fetchImpl, calls, now: fixedDate }
}
function rect(left: number, bottom: number, right: number, top: number): [number, number][] {
  return [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]
}

test('real public fixture resolves stable parcel identity, full boundary and qualified point zoning', async () => {
  const sources = fakeSources()
  const result = await lookupEdmontonSiteInformation(point, sources)
  assert.equal(result.status, 'matched')
  assert.equal(result.candidates.length, 1)
  const parcel = result.candidates[0]
  assert.equal(parcel.sourceQualifiedKey, 'edmonton-title-parcels:150367')
  assert.equal(parcel.address, '14505 - 124 AVENUE NW')
  assert.deepEqual(parcel.boundary, fixture.features[0].geometry)
  assert.equal(parcel.match.pinRelation, 'inside')
  assert.ok(parcel.areaAcres !== null && parcel.areaAcres > 1.7 && parcel.areaAcres < 1.9)
  assert.equal(parcel.source.sourceDate, null)
  assert.equal(parcel.source.retrievedAt, fixedDate().toISOString())
  assert.equal(result.currentZoning[0].code, 'BE')
  assert.equal(result.currentZoning[0].spatialBasis, 'selected_point')
  assert.equal(result.currentZoning[0].parcelCoveragePct, null)
  assert.equal(result.currentZoning[0].source.sourceDate, '2026-10-19T02:10:55.000')
  assert.match(result.currentZoning[0].source.sourceDateBasis!, /not a bylaw effective date/)
  assert.deepEqual(result.sources.find(source => source.sourceId === 'edmonton-current-zoning:286695'), result.currentZoning[0].source)
  assert.equal(sources.calls.length, 2)
  assert.deepEqual(sources.calls.map(call => call.url.origin + call.url.pathname), [EDMONTON_PARCEL_URL + '/query', EDMONTON_ZONING_URL])
  assert.ok(sources.calls.every(call => call.init?.redirect === 'error' && call.init.credentials === 'omit' && call.init.signal))
})

test('preserves every overlapping parcel for review instead of choosing the first', async () => {
  const second = structuredClone(fixture.features[0])
  second.properties.ID = 999
  const sources = fakeSources({ ...fixture, features: [fixture.features[0], second] })
  const result = await lookupEdmontonSiteInformation(point, sources)
  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.candidates.map(candidate => candidate.sourceParcelId), ['150367', '999'])
})

test('duplicate source geometry cannot double acreage; conflicting parts withhold acreage', async () => {
  const identical = await lookupEdmontonSiteInformation(point, fakeSources({ ...fixture, features: [fixture.features[0], fixture.features[0]] }))
  assert.equal(identical.candidates.length, 1)
  assert.ok(identical.candidates[0].areaAcres !== null && identical.candidates[0].areaAcres < 1.9)
  const otherPart = structuredClone(fixture.features[0])
  otherPart.geometry.coordinates = [rect(-113.573, 53.577, -113.571, 53.579)]
  const conflicting = await lookupEdmontonSiteInformation(point, fakeSources({ ...fixture, features: [fixture.features[0], otherPart] }))
  assert.equal(conflicting.status, 'ambiguous')
  assert.equal(conflicting.candidates[0].areaAcres, null)
  assert.equal(conflicting.candidates[0].boundary.type, 'MultiPolygon')
  assert.match(conflicting.candidates[0].match.conflicts.join(' '), /overlap is unverified/)
})

test('exact source ID exposes an outside-pin conflict and does not spatially hide the requested parcel', async () => {
  const sources = fakeSources()
  const result = await lookupEdmontonSiteInformation({ ...point, latitude: 53.57, sourceParcelId: 'edmonton-title-parcels:150367' }, sources)
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.candidates[0].match.pinRelation, 'outside')
  assert.match(result.candidates[0].match.conflicts[0], /outside/)
  assert.equal(sources.calls[0].url.searchParams.get('where'), 'ID=150367')
  assert.equal(sources.calls[0].url.searchParams.has('geometry'), false)
  assert.match(sources.calls[1].url.searchParams.get('$where')!, /53\.57/)
})

test('exact source ID rejects inconsistent municipal identity instead of attaching it', async () => {
  const result = await lookupEdmontonSiteInformation({ ...point, sourceParcelId: '77' }, fakeSources())
  assert.equal(result.status, 'unavailable')
  assert.deepEqual(result.candidates, [])
})

test('holes reduce acreage and exclude an interior hole point; multipart acreage is additive', () => {
  const outer = rect(-113.58, 53.57, -113.56, 53.59), hole = rect(-113.575, 53.575, -113.565, 53.585)
  const full: PropertyGisBoundary = { type: 'Polygon', coordinates: [outer] }
  const holeOnly: PropertyGisBoundary = { type: 'Polygon', coordinates: [hole] }
  const holed: PropertyGisBoundary = { type: 'Polygon', coordinates: [outer, hole] }
  assert.ok(Math.abs(boundaryAcres(holed)! - (boundaryAcres(full)! - boundaryAcres(holeOnly)!)) < 1e-8)
  assert.equal(boundaryPointRelation(holed, -113.57, 53.58), 'outside')
  assert.equal(boundaryPointRelation(holed, -113.579, 53.58), 'inside')
  assert.equal(boundaryPointRelation(holed, -113.575, 53.58), 'boundary')
  const other = rect(-113.55, 53.57, -113.54, 53.58)
  const multi: PropertyGisBoundary = { type: 'MultiPolygon', coordinates: [[outer, hole], [other]] }
  assert.ok(Math.abs(boundaryAcres(multi)! - boundaryAcres(holed)! - boundaryAcres({ type: 'Polygon', coordinates: [other] })!) < 1e-8)
  assert.equal(boundaryPointRelation(multi, -113.545, 53.575), 'inside')
})

test('boundary-edge point remains a review case', async () => {
  const firstVertex = fixture.features[0].geometry.coordinates[0][0]
  const result = await lookupEdmontonSiteInformation({ latitude: firstVertex[1], longitude: firstVertex[0] }, fakeSources())
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.candidates[0].match.pinRelation, 'boundary')
})

test('malformed, open, zero-area and excessive boundaries do not produce fabricated geometry', async () => {
  for (const geometry of [
    { type: 'Point', coordinates: [-113.572, 53.578] },
    { type: 'Polygon', coordinates: [[[-113.572, 53.578], [-113.571, 53.578], [-113.571, 53.579], [-113.572, 53.579]]] },
    { type: 'Polygon', coordinates: [Array.from({ length: 15_001 }, () => [-113.572, 53.578])] },
    { type: 'Polygon', coordinates: [Array.from({ length: 4 }, () => [-113.572, 53.578])] },
  ]) {
    const changed = structuredClone(fixture)
    changed.features[0].geometry = geometry
    const result = await lookupEdmontonSiteInformation(point, fakeSources(changed))
    assert.equal(result.status, 'unavailable')
    assert.equal(result.candidates.length, 0)
  }
  assert.equal(PropertyGisBoundarySchema.safeParse({ type: 'Polygon', coordinates: [[[Infinity, 0], [0, 1], [1, 1], [Infinity, 0]]] }).success, false)
})

test('empty rings and other malformed records cannot discard valid candidates in a partial page', async () => {
  for (const geometry of [
    { type: 'Polygon', coordinates: [[]] },
    { type: 'Polygon', coordinates: [] },
    { type: 'MultiPolygon', coordinates: [[[]]] },
    { type: 'MultiPolygon', coordinates: [[]] },
    { type: 'Polygon', coordinates: [null] },
    { type: 'Polygon', coordinates: [[[]]] },
    { type: 'Polygon', coordinates: [[[-113.572, 53.578]]] },
    null,
  ]) {
    assert.equal(PropertyGisBoundarySchema.safeParse(geometry).success, false)
    const invalid = { ...fixture.features[0], geometry, properties: { ID: 999 } }
    const result = await lookupEdmontonSiteInformation(point, fakeSources({ ...fixture, features: [invalid, fixture.features[0]] }))
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].sourceParcelId, '150367')
    assert.equal(result.currentZoning.length, 1)
    assert.match(result.warnings.join(' '), /record had missing or inconsistent identity\/geometry/)
  }
})

test('aggregate vertex bounds preserve prior valid candidates and report a truncated preview', async () => {
  const largeRing = [
    ...Array.from({ length: 3999 }, () => [-114, 53]),
    [-113, 53], [-113, 54],
    ...Array.from({ length: 3999 }, () => [-114, 54]),
    [-114, 53],
  ]
  const large = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [largeRing] }, properties: { ID: 998 } }
  const overBudget = { ...large, properties: { ID: 999 } }
  const result = await lookupEdmontonSiteInformation(point, fakeSources({ ...fixture, features: [fixture.features[0], large, overBudget] }))
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.truncated, true)
  assert.equal(result.candidates[0].sourceParcelId, '150367')
  assert.equal(result.candidates.length, 2)
  assert.match(result.warnings.join(' '), /vertex limit/)
})

test('source caps preserve available candidates but never claim an unambiguous match', async () => {
  const result = await lookupEdmontonSiteInformation(point, fakeSources({ ...fixture, exceededTransferLimit: true }))
  assert.equal(result.status, 'ambiguous')
  assert.equal(result.truncated, true)
  assert.equal(result.candidates.length, 1)
})

test('legitimate empty sources report unknown coverage without a synthetic parcel', async () => {
  const result = await lookupEdmontonSiteInformation(point, fakeSources({ type: 'FeatureCollection', features: [] }, []))
  assert.equal(result.status, 'not_found')
  assert.deepEqual(result.candidates, [])
  assert.deepEqual(result.currentZoning, [])
  assert.ok(result.warnings.some(warning => warning.includes('zoning remains unknown')))
})

test('a failed zoning response preserves successful parcel evidence and is retried', async () => {
  let failures = true, callCount = 0
  const fetchImpl = (async (url: string) => {
    callCount++
    if (url.startsWith(EDMONTON_ZONING_URL) && failures) return new Response('unavailable', { status: 503 })
    return json(url.startsWith(EDMONTON_ZONING_URL) ? zoningFixture : fixture)
  }) as typeof fetch
  const first = await lookupEdmontonSiteInformation(point, { fetchImpl, now: fixedDate })
  assert.equal(first.status, 'matched')
  assert.equal(first.currentZoning.length, 0)
  assert.match(first.warnings.join(' '), /Zoning source unavailable/)
  failures = false
  const second = await lookupEdmontonSiteInformation(point, { fetchImpl, now: fixedDate })
  assert.equal(callCount, 4)
  assert.equal(second.currentZoning.length, 1)
})

test('failed HTTP responses cancel unread bodies and preserve the source status', async () => {
  let cancelled = 0
  const fetchImpl = (async () => new Response(new ReadableStream({ cancel() { cancelled++ } }), { status: 503 })) as typeof fetch
  const result = await lookupEdmontonSiteInformation(point, { fetchImpl, now: fixedDate })
  assert.equal(cancelled, 2)
  assert.equal(result.status, 'unavailable')
  assert.match(result.warnings.join(' '), /HTTP 503/)
})

test('bounded response reader rejects oversized content both with and without a declared length', async () => {
  for (const headers of [new Headers({ 'content-length': '700000' }), new Headers()]) {
    const fetchImpl = (async () => new Response(' '.repeat(512_001), { headers })) as typeof fetch
    const result = await lookupEdmontonSiteInformation(point, { fetchImpl, now: fixedDate })
    assert.equal(result.status, 'unavailable')
    assert.equal(result.candidates.length, 0)
    assert.match(result.warnings.join(' '), /size limit/)
  }
})

test('deduplicates in-flight reads and caches healthy public evidence without exposing mutable references', async () => {
  const sources = fakeSources()
  let timestamp = fixedDate().getTime()
  const options = { ...sources, now: () => new Date(timestamp) }
  const [first, second] = await Promise.all([lookupEdmontonSiteInformation(point, options), lookupEdmontonSiteInformation(point, options)])
  assert.equal(sources.calls.length, 2)
  first.candidates[0].address = 'mutated local view'
  assert.equal(second.candidates[0].address, '14505 - 124 AVENUE NW')
  const cached = await lookupEdmontonSiteInformation(point, options)
  assert.equal(cached.candidates[0].address, '14505 - 124 AVENUE NW')
  assert.equal(sources.calls.length, 2)
  timestamp += 180_001
  await lookupEdmontonSiteInformation(point, options)
  assert.equal(sources.calls.length, 4)
})

test('unsupported jurisdictions and invalid input cannot trigger upstream calls', async () => {
  const sources = fakeSources()
  assert.equal((await lookupEdmontonSiteInformation({ ...point, municipality: 'St. Albert' }, sources)).status, 'unsupported')
  assert.equal((await lookupEdmontonSiteInformation({ latitude: 49, longitude: -123 }, sources)).status, 'unsupported')
  for (const invalid of [{ ...point, sourceParcelId: '1 OR 1=1' }, { ...point, latitude: NaN }, { ...point, url: 'https://example.com/private' }, { ...point, userId: 'another-user' }]) {
    await assert.rejects(lookupEdmontonSiteInformation(invalid, sources))
  }
  assert.equal(sources.calls.length, 0)
})
