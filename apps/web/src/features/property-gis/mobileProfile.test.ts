import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('compact mobile profile is scoped to a visibly selected GIS boundary', () => {
  const css = read('../../index.css')
  assert.match(css, /@media \(max-width: 767px\)\s*\{\s*\[data-testid="asset-profile"\]:has\(\[data-property-gis-boundary-visible="true"\]\)\s*\{\s*max-height: 44dvh;/)
  const card = read('./SiteInformationCard.tsx')
  assert.match(card, /data-property-gis-boundary-visible=\{Boolean\(showBoundary && candidate\)\}/)
  assert.match(card, /data-property-gis-call-clearance style=\{\{ height: inset \}\}/)
})

test('standalone Escape closes through onClose only after child overlays have had the event', () => {
  const panel = read('../../components/MarketMemoryStoryPanel.tsx')
  const handler = panel.slice(panel.indexOf('const closeOnEscape'), panel.indexOf('}, [onClose])'))
  assert.match(handler, /event\.key !== 'Escape' \|\| event\.defaultPrevented/)
  assert.match(handler, /\[data-map-call-overlay\]/)
  assert.match(handler, /\[role="menu"\]\[data-state="open"\]/)
  assert.match(handler, /window\.addEventListener\('keydown', closeOnEscape\)/)
  assert.match(handler, /window\.removeEventListener\('keydown', closeOnEscape\)/)
  assert.match(handler, /onClose\(\)/)
  assert.doesNotMatch(handler, /calling\.|confirm\(|discard\(/)
})

test('memory classification remains inside scrollable property content, after site information', () => {
  const panel = read('../../components/MarketMemoryStoryPanel.tsx')
  const scroll = panel.indexOf('<div ref={bodyRef} data-property-gis-story-scroll')
  const site = panel.indexOf('{siteInformation}', scroll)
  const classification = panel.indexOf('<MemoryClassificationPicker', scroll)
  assert.ok(scroll >= 0 && site > scroll && classification > site)
})

test('switching memory assets resets both native scrollers and the tab without resetting on ordinary renders', () => {
  const panel = read('../../components/MarketMemoryStoryPanel.tsx')
  assert.match(panel, /useEffect\(\(\) => \{\s*setActiveTab\('property'\)\s*if \(profileRef\.current\) profileRef\.current\.scrollTop = 0\s*if \(bodyRef\.current\) bodyRef\.current\.scrollTop = 0\s*titleRef\.current\?\.focus\(\{ preventScroll: true \}\)\s*\}, \[anchor\.id, anchor\.persistence\?\.state\]\)/)
  assert.match(panel, /<aside\s+ref=\{profileRef\}/)
  assert.match(panel, /<div ref=\{bodyRef\} data-property-gis-story-scroll/)
})

test('call clearance observes layout without camera or call mutations', () => {
  const hook = read('./useParcelCallInset.ts')
  assert.match(hook, /new ResizeObserver\(measure\)/)
  assert.match(hook, /profile\.getBoundingClientRect\(\)/)
  assert.match(hook, /observer\.observe\(profile\)/)
  assert.doesNotMatch(hook, /data-radix-scroll-area-viewport|observer\.observe\(viewport\)/)
  assert.match(hook, /observer\.disconnect\(\)/)
  assert.doesNotMatch(hook, /moveCamera|setView|panTo|setZoom|calling\.|\.confirm\(|\.discard\(/)
  const overlay = read('./SiteParcelOverlay.tsx')
  assert.match(overlay, /requestAnimationFrame\(\(\) => \{\s*const viewport = measureParcelViewport/)
  assert.doesNotMatch(overlay, /ResizeObserver|addEventListener\('resize'/)
})
