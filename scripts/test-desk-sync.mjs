import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } })
await server.listen()
let browser
try {
  browser = await chromium.launch({ channel: 'chrome' })
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } })
    let run = null
    let writes = 0
    let refreshes = 0
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.hostname !== '127.0.0.1') return route.abort()
      if (url.pathname === '/src/contexts/AuthContext.tsx') return route.fulfill({
        contentType: 'application/javascript',
        body: 'export const AuthProvider=({children})=>children; export const useAuth=()=>({user:{id:"local-test",email:"test@example.invalid"},session:{},loading:false,isDemoMode:false,needsOnboarding:false});',
      })
      if (url.pathname === '/api/desk/codex-sync') {
        if (route.request().method() === 'POST') {
          writes++
          run = { ...route.request().postDataJSON(), state: 'queued', lastSuccessAt: null, result: null }
        }
        return route.fulfill({ json: { enabled: true, run } })
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/automation/activity-pulse') refreshes++
        return route.fulfill({ status: 503, json: { message: 'Offline fixture' } })
      }
      return route.continue()
    })
    await page.goto(server.resolvedUrls.local[0] + 'app/desk')
    const button = page.getByRole('button', { name: 'Sync with Codex' })
    await button.click({ timeout: 30000 })
    await page.getByText('Queued · Waiting for your computer').waitFor()
    assert.equal(await button.isDisabled(), true)
    await page.reload()
    await page.getByText('Queued · Waiting for your computer').waitFor()
    run.state = 'running'
    await page.getByText('Syncing Outlook activity…').waitFor()
    const before = refreshes
    Object.assign(run, { state: 'complete', lastSuccessAt: new Date().toISOString(),
      result: { recorded: 4, needsReview: 1, queued: 0, reason: 'none' } })
    await page.getByText('Complete · 4 recorded · 1 for review').waitFor()
    await page.getByText(/Last successful sync/).waitFor()
    assert.equal(await button.isEnabled(), true)
    assert.equal(writes, 1)
    await page.waitForFunction(() => document.querySelector('[data-testid="desk-codex-sync"]') !== null)
    for (let i = 0; refreshes <= before && i < 20; i++) await new Promise(r => setTimeout(r, 50))
    assert.ok(refreshes > before, 'completed sync should refetch the desk')
    await page.close()
    console.log('Daily Desk button, reload and completion passed at width', width)
  }
} finally {
  await browser?.close()
  await server.close()
}
