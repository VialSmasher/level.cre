// Local, isolated DOM regression. No authentication, API calls or real call data.
// Uses the installed Playwright package, or LEVELCRE_PLAYWRIGHT_MODULE when the
// test runner is supplied by the host. It never installs browser dependencies.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = require(process.env.LEVELCRE_PLAYWRIGHT_MODULE || '@playwright/test')
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild')
const sourceCss = await readFile(resolve(root, 'apps/web/src/index.css'), 'utf8')
const mobileCss = sourceCss.slice(sourceCss.indexOf('/* Keep a useful map above the sheet'))
assert.ok(mobileCss.includes('max-height: 44dvh'))

const { outputFiles } = await build({
  stdin: { resolveDir: root, loader: 'tsx', sourcefile: 'gis-mobile-layout-fixture.tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useParcelCallInset } from './apps/web/src/features/property-gis/useParcelCallInset';
    function Fixture() {
      const [shown, setShown] = useState(true);
      const [refreshes, setRefreshes] = useState(0);
      const { sectionRef, inset } = useParcelCallInset(shown);
      return <>
        <div className="map-frame"><aside className="profile" data-testid="asset-profile">
          <header data-property-gis-profile-header><strong>Public parcel layout fixture</strong><button aria-label="Close profile">×</button></header>
          <div className="tabs" data-property-gis-story-tabs>
            <div className="tab-row">Property · Contact · Activity</div>
            <div className="story-scroll" data-property-gis-story-scroll>
              <section ref={sectionRef} data-property-gis-boundary-visible={shown}>
                <h3>Site information</h3><p>Public parcel preview</p>
                <div className="summary">Gross mapped area · Zoning at pin</div>
                <button data-action="boundary" onClick={() => setShown(!shown)}>{shown ? 'Hide boundary' : 'Show boundary'}</button>
                <button data-action="refresh" onClick={() => setRefreshes(v => v + 1)}>Refresh</button>
                <p data-refreshes={refreshes}>Read-only municipal evidence</p>
                <button data-action="sources">Sources and details</button>
                <div data-property-gis-call-clearance aria-hidden style={{height: inset}} />
              </section>
              <div className="classification">Property classification</div>
              <div className="evidence">Source-backed property history</div>
            </div>
          </div>
        </aside></div>
        <section className="pending-call" aria-label="Pending map call">Existing pending call · unchanged</section>
        <footer>Today · Map · Pursuits · Activity · Score</footer>
      </>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
})

const browser = await chromium.launch({ headless: true, channel: process.env.LEVELCRE_BROWSER_CHANNEL || 'msedge' })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', route => route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Same flex/max-height/native-overflow structure as the production profile.
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;font:14px Arial}button{min-height:44px;padding:8px}header{height:80px;flex-shrink:0;display:flex;align-items:center;padding:16px;background:white}header button{margin-left:auto}.map-frame{position:fixed;inset:56px 0 0;background:#e4eff3}.profile{position:absolute;bottom:calc(4rem + env(safe-area-inset-bottom) + .5rem);left:8px;right:8px;max-height:74dvh;display:flex;flex-direction:column;overflow:hidden;background:white;border:1px solid #aaa}.tabs{display:flex;min-height:0;flex:1;flex-direction:column}.tab-row{height:58px;flex-shrink:0;padding:20px 16px}.story-scroll{min-height:0;flex:1;overflow-y:auto}.story-scroll section{padding:12px 16px}h3{margin:0 0 12px}.summary{height:76px}.classification{height:120px;padding:16px}.evidence{height:200px;padding:16px}.pending-call{position:fixed;bottom:80px;left:12px;right:12px;height:141px;background:#fff4dc;border:1px solid #aaa;z-index:100;padding:16px}footer{position:fixed;bottom:0;height:64px;width:100%;background:white;z-index:120;padding:20px 8px}
    @media(min-width:768px){.profile{left:auto;right:0;top:0;bottom:auto;width:320px;height:90vh;max-height:90vh}.pending-call{right:auto;width:320px}}
    ${mobileCss}
  </style><div id="root"></div>`)
  await page.addScriptTag({ content: outputFiles[0].text })
  await page.waitForSelector('[data-property-gis-call-clearance]')

  const frames = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const metrics = async () => page.evaluate(() => {
    const panel = document.querySelector('[data-testid="asset-profile"]')
    const spacer = document.querySelector('[data-property-gis-call-clearance]')
    const call = document.querySelector('[aria-label="Pending map call"]')
    const rect = panel.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, height: rect.height, clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight, inset: spacer.getBoundingClientRect().height, callTop: call.getBoundingClientRect().top, callText: call.textContent }
  })
  await frames()
  const first = await metrics()
  assert.ok(first.bottom <= 780, 'Profile must clear the fixed mobile navigation')
  assert.ok(first.scrollHeight > first.clientHeight, 'Inspection profile must actually scroll')
  assert.ok(first.inset > 0 && first.inset <= first.height + 12, 'Inset must be bounded by visible profile, not intrinsic content')
  for (let i = 0; i < 20; i++) {
    await frames()
    const next = await metrics()
    assert.equal(next.inset, first.inset, 'ResizeObserver must not grow its own spacer')
    assert.equal(next.scrollHeight, first.scrollHeight, 'Scroll height must stabilize across frames')
  }

  async function assertReachable(selector) {
    // Model scrolling the action toward the top of the sheet, not centering it
    // under a floating call card that is intentionally left visible.
    await page.locator(selector).evaluate(element => element.scrollIntoView({ block: 'start' }))
    await frames()
    const state = await page.locator(selector).evaluate(element => {
      const rect = element.getBoundingClientRect()
      const header = document.querySelector('[data-property-gis-profile-header]').getBoundingClientRect()
      const call = document.querySelector('[aria-label="Pending map call"]').getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return { top: rect.top, bottom: rect.bottom, headerBottom: header.bottom, callTop: call.top, hit: target === element || element.contains(target) }
    })
    assert.ok(state.top >= state.headerBottom - 1 && state.bottom <= state.callTop - 1 && state.hit, `${selector} must fit and receive taps above the unchanged call card: ${JSON.stringify(state)}`)
  }
  await assertReachable('[data-action="boundary"]')
  await page.locator('[data-action="boundary"]').click()
  await assertReachable('[data-action="boundary"]')
  await page.locator('[data-action="boundary"]').click()
  await assertReachable('[data-action="refresh"]')
  await page.locator('[data-action="refresh"]').click()
  assert.equal(await page.locator('[data-refreshes]').getAttribute('data-refreshes'), '1')
  await assertReachable('[data-action="sources"]')
  assert.equal((await metrics()).callText, first.callText)

  // Recreate the observed intrinsic-height pathology. The actual hook must not
  // measure it, even if another child introduces a huge layout box.
  await page.locator('[data-property-gis-boundary-visible]').evaluate(section => {
    const inflated = document.createElement('div')
    inflated.dataset.radixScrollAreaViewport = ''
    inflated.style.height = '124999px'
    section.appendChild(inflated)
  })
  for (let i = 0; i < 10; i++) { await frames(); assert.equal((await metrics()).inset, first.inset) }
  await page.locator('[data-radix-scroll-area-viewport]').evaluate(element => element.remove())
  await frames()
  assert.equal((await metrics()).scrollHeight, first.scrollHeight)

  await page.setViewportSize({ width: 1280, height: 900 })
  await frames()
  assert.equal((await metrics()).inset, 0, 'Desktop must not inherit mobile call clearance')
  assert.deepEqual(errors, [])
  console.log('PASS: real ResizeObserver stability, bounded spacer, nav clearance, native scroll, Hide/Show, reachable GIS actions, unchanged call and desktop reset')
  await context.close()
} finally {
  await browser.close()
}
