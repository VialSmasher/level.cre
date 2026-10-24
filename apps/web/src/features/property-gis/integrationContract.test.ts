import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('read-only GIS routes terminate before write-capable Intel audit middleware', () => {
  const source = readFileSync(new URL('../../../../api/src/routes.ts', import.meta.url), 'utf8')
  const gis = source.indexOf('registerPropertyGisRoutes(app, pool);')
  const intel = source.indexOf('registerIndustrialIntelRoutes(app);')
  assert.ok(gis >= 0 && intel >= 0 && gis < intel)
})

test('public map creates an isolated stacking context below the mobile story panel', () => {
  const source = readFileSync(new URL('./PreviewMap.tsx', import.meta.url), 'utf8')
  assert.match(source, /className="relative isolate h-full w-full/)
})

test('public profile resets per asset and keeps heading focus and dismissible keyboard behavior', () => {
  const source = readFileSync(new URL('./preview.tsx', import.meta.url), 'utf8')
  assert.match(source, /<PublicParcelPreviewPanel key=\{selected\.id\}/)
  assert.match(source, /heading\.current\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /<h2 ref=\{heading\} tabIndex=\{-1\}/)
  assert.match(source, /event\.key !== 'Escape'/)
  assert.match(source, /document\.addEventListener\('keydown', closeOnEscape\)/)
  assert.match(source, /document\.removeEventListener\('keydown', closeOnEscape\)/)
})
