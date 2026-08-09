import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./PropertyMemorySearchPanel.tsx', import.meta.url), 'utf8')

test('property-memory server filters use a 275ms debounce', () => {
  assert.match(source, /const PROPERTY_MEMORY_SEARCH_DEBOUNCE_MS = 275/)
  assert.match(source, /setTimeout\(\(\) => setServerFilters\(filters\), PROPERTY_MEMORY_SEARCH_DEBOUNCE_MS\)/)
})

test('property-memory debounce cancels stale timers and keeps blank browse immediate', () => {
  assert.match(source, /return \(\) => window\.clearTimeout\(timer\)/)
  assert.match(source, /useState<PropertyMemorySearchFilters>\(EMPTY_FILTERS\)/)
  assert.match(source, /useInfinitePropertyMemorySearch\(stableFilters, \{ enabled: open \}\)/)
})
