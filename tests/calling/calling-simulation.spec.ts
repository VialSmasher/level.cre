import { test, expect, type APIRequestContext, type Page } from 'playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildTelHref } from '../../apps/web/src/lib/mobileCalling';

const harness = new URL(process.env.CALLING_SIMULATION_URL || 'http://127.0.0.1:4179');
if (harness.protocol !== 'http:' || harness.hostname !== '127.0.0.1' || harness.pathname !== '/') {
  throw new Error('Calling simulation requires an explicit loopback-only API harness.');
}
const harnessHeaders = { 'x-calling-simulation': 'local-only' };
const captureDirectory = 'work/calling-simulation/private/screenshots';
type SnapshotState = {
  brokerId: string;
  capturedAt: string | null;
  scope?: string;
  sourceSnapshotSha256?: string;
  production: Array<Record<string, any>>;
  progress: { startedToday: number; confirmedToday: number; connectedToday: number };
  header: { totalLevel: number; assetsTracked: number; followupsLogged: number };
  skills: Record<string, any>;
  counts: { events: number; interactions: number; skill_activities: number };
  weekly: { thisWeek: { call: number; total: number } };
  pulse: { series: Array<{ call: number }> };
  coverage: { mappedActions: number; totalActions: number };
  badges: { trackedCounts: { call: number; touch: number }; bestDayCounts: { call: number }; values: Record<string, { value: number; unlocked: boolean }> };
  prospects: Array<Record<string, any>>;
};

async function localRequest(request: APIRequestContext, path: string, method = 'GET', data?: unknown) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Only a local harness path is allowed.');
  const response = await request.fetch(new URL(path, harness).href, { method, data, headers: harnessHeaders, maxRedirects: 0 });
  expect(response.ok(), `${method} ${path} must use the real copied-data API`).toBeTruthy();
  return response.json();
}

// The map canvas is deliberately inert. Actual Home routing, prospect fields,
// the ProspectEditPanel Activity tab, and its SQL-backed queries still run.
const inertMapsModule = `
import React from '/node_modules/.vite/deps/react.js';
const point = {lat: () => 53.55, lng: () => -113.5};
const map = {panTo() {}, setCenter() {}, setZoom() {}, setMapTypeId() {}, getZoom: () => 15, getCenter: () => point,
  getBounds: () => null, getDiv: () => document.createElement('div'), setOptions() {},
  addListener: () => ({remove() {}})};
export const useJsApiLoader = () => ({isLoaded: true, loadError: null});
export const useGoogleMap = () => null;
export function GoogleMap({onLoad}) {
  React.useEffect(() => {onLoad?.(map)}, []);
  return React.createElement('div', {'data-testid': 'inert-map-canvas', style: {height: '100%'},
    'aria-label': 'Map canvas omitted from local calling simulation'});
}
export const Polygon = () => null;
export const InfoWindow = () => null;
export const InfoWindowF = () => null;
`;

async function installLocalSnapshot(page: Page, brokerId: string) {
  const starts: Array<Record<string, any>> = [];
  const outcomes: Array<Record<string, any>> = [];
  const unexpected: string[] = [];
  const blockedExternal: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.removeItem('demo-mode');
    (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs = [];
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href^="tel:"]');
      if (!link) return;
      event.preventDefault();
      (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs?.push(link.getAttribute('href') || '');
    }, true);
  });
  const user = { id: brokerId, email: 'local-simulation@example.invalid', user_metadata: { full_name: 'Local snapshot rehearsal' } };
  await page.route(/\/src\/contexts\/AuthContext\.tsx(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = ${JSON.stringify(user)};
      const auth = {user, session: {user, access_token: 'local-simulation-only'}, loading: false,
        needsOnboarding: false, isDemoMode: false, signInWithGoogle: async () => {},
        signInWithEmail: async () => {}, signOut: async () => {}, setNeedsOnboarding() {}, resetClientState() {}};
      export const useAuth = () => auth;
      export const AuthProvider = ({children}) => children;`,
  }));
  await page.route(/\/src\/lib\/supabase\.ts(?:\?|$)/, (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const supabase = null;' }));
  await page.route(/\/src\/lib\/demoApi\.ts(?:\?|$)/, (route) => route.fulfill({
    contentType: 'application/javascript', body: 'export const isDemoModeRequested = () => false; export const getDemoApiResult = () => null; export const demoJsonResponse = () => { throw new Error("Demo data is forbidden in this rehearsal") };',
  }));
  await page.route(/\/node_modules\/\.vite\/deps\/@react-google-maps_api\.js(?:\?|$)/, (route) => route.fulfill({ contentType: 'application/javascript', body: inertMapsModule }));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      const description = `${request.method()} ${url.origin}${url.pathname}`;
      blockedExternal.push(description);
      if (!['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) unexpected.push(description);
      return route.abort('blockedbyclient');
    }
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    if (request.method() !== 'GET' && !(request.method() === 'POST' && /^\/api\/calling\/(starts|outcomes|discards)$/.test(url.pathname))) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/calling/starts' && request.method() === 'POST') starts.push(request.postDataJSON());
    if (url.pathname === '/api/calling/outcomes' && request.method() === 'POST') outcomes.push(request.postDataJSON());
    const response = await route.fetch({
      url: new URL(`${url.pathname}${url.search}`, harness).href,
      headers: { ...request.headers(), ...harnessHeaders },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  return { starts, outcomes, unexpected, blockedExternal, pageErrors };
}

async function navigateWithoutReload(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function selectSafelyDialableCard(page: Page) {
  // Ambiguous copied phone text stays unchanged and receives no start credit.
  // Use the real page's Skip action until its own phone parser renders a link.
  await expect(page.getByRole('region', { name: 'Current call', exact: true })).toBeVisible();
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await page.getByRole('link', { name: /^Call / }).count()) return;
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  throw new Error('No safely dialable copied prospect remains in the current queue.');
}

async function assertScorecard(page: Page, state: SnapshotState) {
  await expect(page.getByRole('heading', { name: 'Performance Overview', exact: true })).toBeVisible();
  const production = page.getByRole('region', { name: "This week's outbound production", exact: true });
  await expect(production.getByText('Calls', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(state.weekly.thisWeek.call));
  await expect(production.getByText('Outbound this week', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(state.weekly.thisWeek.total));
  await expect(page.getByText('CRM map base', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(state.header.assetsTracked));
  await expect(page.getByText('Broker level', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(state.header.totalLevel));
  if (state.coverage.totalActions) {
    await expect(page.getByText(`${state.coverage.mappedActions} of ${state.coverage.totalActions} outbound actions are linked to the map.`, { exact: true })).toBeVisible();
  }
}

async function assertBadges(page: Page, state: SnapshotState) {
  await expect(page.getByRole('heading', { name: /^(Badge Collection|Achievement Diary)$/ })).toBeVisible();
  await expect(page.getByText('Best call day', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(state.badges.bestDayCounts.call));
  await expect(page.getByText(`${state.badges.trackedCounts.touch} tracked touches`, { exact: true }).first()).toBeVisible();
  for (const [title, id, threshold] of [['Warm Line', 'daily_5_calls', 5], ['Phone Habit', 'tracked_50_calls', 50]] as const) {
    const badge = page.getByText(title, { exact: true }).locator('..');
    const expected = state.badges.values[id];
    await expect(badge).toContainText(`${expected.value} / ${threshold}`);
    await expect(badge.getByText(expected.unlocked ? 'Unlocked' : 'Locked', { exact: true })).toBeVisible();
  }
}

async function assertActivityFootprint(page: Page, state: SnapshotState) {
  const footprint = page.getByRole('region', { name: 'Activity footprint', exact: true });
  await expect(footprint).toBeVisible();
  await footprint.getByRole('button', { name: 'Calls', exact: true }).click();
  const actualCallCount = state.pulse.series.reduce((total, day) => total + day.call, 0);
  await expect(footprint.getByText('Outbound actions', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(actualCallCount.toLocaleString());
  return footprint;
}

test('real copied prospects feed calls, asset history, scorecard, badges and XP without dialing or live writes', async ({ page, request }, testInfo) => {
  const health = await localRequest(request, '/health');
  expect(health.realSql).toBe(true);
  expect(health.sourceRoot, 'The harness must use the same source tree as this browser run').toBeTruthy();
  expect(String(health.sourceRoot).replace(/\\/g, '/').toLowerCase()).toBe(process.cwd().replace(/\\/g, '/').toLowerCase());
  expect(health.tables.prospects).toBeGreaterThan(1);
  const baseline: SnapshotState = await localRequest(request, '/simulation/reset', 'POST');
  const queue = await localRequest(request, '/api/calling/queue');
  const validRows = queue.rows.filter((candidate: any) => buildTelHref(candidate.contact.phone));
  expect(validRows.length).toBeGreaterThanOrEqual(6);
  const fixture = await installLocalSnapshot(page, baseline.brokerId);
  const firstId = validRows[0].prospect.id;
  const historyBefore = await localRequest(request, `/api/interactions?prospectId=${encodeURIComponent(firstId)}`);
  const prefix = testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';
  await mkdir(captureDirectory, { recursive: true });

  await page.goto('/app/calls');
  await expect(page.getByRole('heading', { name: 'Calls', exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText(String(baseline.progress.confirmedToday));
  await selectSafelyDialableCard(page);
  await expect(page.getByRole('link', { name: 'View linked record', exact: true })).toHaveAttribute('href', `/app?prospectId=${firstId}`);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-01-real-ready.png`, fullPage: true });

  // Warm the real prospect history and scorecard/badge query caches in this SPA.
  await page.getByRole('link', { name: 'View linked record', exact: true }).click();
  await expect(page.getByTestId('inert-map-canvas')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Recent activity', { exact: true })).toBeVisible();
  await navigateWithoutReload(page, '/broker-stats');
  await assertScorecard(page, baseline);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-02-scorecard-before.png`, fullPage: true });
  await page.getByRole('navigation', { name: 'Scorecard views' }).locator('a[href="/badges"]').click();
  await assertBadges(page, baseline);
  await navigateWithoutReload(page, '/app/inbox');
  await assertActivityFootprint(page, baseline);
  await navigateWithoutReload(page, '/app/calls');
  await selectSafelyDialableCard(page);

  const completed: string[] = [];
  for (let index = 0; index < 5; index++) {
    await selectSafelyDialableCard(page);
    const firstUpcomingCompany = (await page.getByRole('region', { name: 'Next companies', exact: true }).getByRole('listitem').first().locator('p').first().textContent())!.trim();
    const linkedRecord = await page.getByRole('link', { name: 'View linked record', exact: true }).getAttribute('href');
    const prospectId = new URL(linkedRecord!, 'http://127.0.0.1').searchParams.get('prospectId')!;
    completed.push(prospectId);
    await page.getByRole('link', { name: /^Call / }).click();
    await expect(page.getByText('Call started', { exact: true })).toBeVisible();
    if (index === 0) {
      const started: SnapshotState = await localRequest(request, '/simulation/state');
      expect(started.progress.startedToday).toBe(baseline.progress.startedToday + 1);
      expect(started.production).toHaveLength(baseline.production.length);
      expect(started.counts.interactions).toBe(baseline.counts.interactions);
      expect(started.skills.followUp).toBe(baseline.skills.followUp);
      await expect(page.getByText('Call saved · +15 XP', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: `${captureDirectory}/${prefix}-03-real-started.png`, fullPage: true });
    }
    if (index === 1 || index === 2 || index === 3) {
      await page.getByRole('button', { name: 'More options', exact: true }).click();
      if (index === 2) {
        await page.getByRole('button', { name: 'Add a note', exact: true }).click();
        await page.getByLabel('Note · optional', { exact: true }).fill('LOCAL SIMULATION ONLY. No call placed. Controlled voicemail rehearsal.');
      }
      await page.getByRole('button', { name: index === 1 ? 'No answer' : index === 2 ? 'Voicemail' : 'Connected', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'I called · next', exact: true }).click();
    }
    await expect(page.getByTestId('calls-confirmed-today')).toHaveText(String(baseline.progress.confirmedToday + index + 1));
    await expect(page.getByText('Call saved · +15 XP', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current call', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current call', exact: true }).getByText(firstUpcomingCompany, { exact: true })).toBeVisible();
    if (index === 0) await page.screenshot({ path: `${captureDirectory}/${prefix}-04-confirmed-next-xp.png`, fullPage: true });
  }
  expect(new Set(completed).size).toBe(5);
  const confirmed: SnapshotState = await localRequest(request, '/simulation/state');
  expect(confirmed.progress.startedToday).toBe(baseline.progress.startedToday + 5);
  expect(confirmed.progress.confirmedToday).toBe(baseline.progress.confirmedToday + 5);
  expect(confirmed.progress.connectedToday).toBe(baseline.progress.connectedToday + 1);
  expect(confirmed.production).toHaveLength(baseline.production.length + 5);
  expect(confirmed.counts.interactions).toBe(baseline.counts.interactions + 5);
  expect(confirmed.counts.skill_activities).toBe(baseline.counts.skill_activities + 5);
  expect(confirmed.skills.followUp).toBe((baseline.skills.followUp || 0) + 75);
  expect(confirmed.header.followupsLogged).toBe(baseline.header.followupsLogged + 5);
  expect(confirmed.header.assetsTracked).toBe(baseline.header.assetsTracked);
  expect(confirmed.weekly.thisWeek.call).toBe(baseline.weekly.thisWeek.call + 5);
  expect(confirmed.coverage.mappedActions).toBe(baseline.coverage.mappedActions + 5);
  expect(confirmed.badges.trackedCounts.call).toBe(baseline.badges.trackedCounts.call + 5);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-04-five-confirmed.png`, fullPage: true });

  // Retry actual committed request identities, not fabricated test counters.
  const repeatedStart = await localRequest(request, '/api/calling/starts', 'POST', fixture.starts[0]);
  const repeatedOutcome = await localRequest(request, '/api/calling/outcomes', 'POST', fixture.outcomes[0]);
  expect(repeatedStart.duplicate).toBe(true);
  expect(repeatedOutcome.duplicate).toBe(true);
  expect(repeatedOutcome.newXpGained || 0).toBe(0);
  const reconciled: SnapshotState = await localRequest(request, '/simulation/state');
  expect(reconciled.counts).toEqual(confirmed.counts);
  expect(reconciled.skills).toEqual(confirmed.skills);
  expect(reconciled.production).toEqual(confirmed.production);

  // Undo a sixth click and prove it awards no production or XP.
  await expect(page.getByText('Call saved · +15 XP', { exact: true })).toBeHidden();
  await selectSafelyDialableCard(page);
  await page.getByRole('link', { name: /^Call / }).click();
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(page.getByText('Call saved · +15 XP', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByTestId('calls-started-today')).toHaveText(String(confirmed.progress.startedToday));
  await expect(page.getByText('Call saved · +15 XP', { exact: true })).toBeHidden();
  const final: SnapshotState = await localRequest(request, '/simulation/state');
  expect(final.production).toEqual(confirmed.production);
  expect(final.skills).toEqual(confirmed.skills);
  expect(final.counts.interactions).toBe(confirmed.counts.interactions);

  // Returning without a document reload proves the warmed caches were invalidated.
  await navigateWithoutReload(page, '/broker-stats');
  await assertScorecard(page, final);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-05-scorecard-after.png`, fullPage: true });
  await page.getByRole('navigation', { name: 'Scorecard views' }).locator('a[href="/badges"]').click();
  await assertBadges(page, final);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-06-badges-after.png`, fullPage: true });
  await navigateWithoutReload(page, '/app/inbox');
  const footprint = await assertActivityFootprint(page, final);
  await footprint.screenshot({ path: `${captureDirectory}/${prefix}-07-activity-footprint-after.png` });
  await page.evaluate((id) => localStorage.setItem('levelcre:focusProspectId', id), firstId);
  await navigateWithoutReload(page, '/app');
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Recent activity', { exact: true })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Attempted' })).toBeVisible();
  const historyAfter = await localRequest(request, `/api/interactions?prospectId=${encodeURIComponent(firstId)}`);
  expect(historyAfter).toHaveLength(historyBefore.length + 1);
  expect(historyAfter.filter((row: any) => row.id === repeatedOutcome.interactionId)).toHaveLength(1);
  await page.screenshot({ path: `${captureDirectory}/${prefix}-08-linked-record-history.png`, fullPage: true });
  expect(fixture.unexpected, 'No external networking or unrelated write routes are permitted').toEqual([]);
  expect(fixture.pageErrors, 'The actual calling/scorecard/badge/history pages must render without runtime errors').toEqual([]);
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toHaveLength(6);
  expect(fixture.starts).toHaveLength(6);
  expect(fixture.outcomes).toHaveLength(5);

  const unchangedFacts = (state: SnapshotState) => state.prospects.map(({ lastContactDate, followUpDueDate, status, updatedAt, ...facts }) => facts);
  expect(unchangedFacts(final)).toEqual(unchangedFacts(baseline));
  for (const id of completed.filter((_, index) => index !== 3)) {
    const before = baseline.prospects.find((prospect) => prospect.id === id)!;
    const after = final.prospects.find((prospect) => prospect.id === id)!;
    expect(after.lastContactDate).toEqual(before.lastContactDate);
    expect(after.followUpDueDate).toEqual(before.followUpDueDate);
    expect(after.status).toEqual(before.status);
  }
  const report = {
    verifiedAt: new Date().toISOString(), capturedAt: baseline.capturedAt, realSql: health.realSql,
    scope: baseline.scope, sourceSnapshotSha256: baseline.sourceSnapshotSha256,
    sourceRoot: health.sourceRoot, sourceFingerprints: health.sourceFingerprints,
    brokerId: baseline.brokerId, completedProspectIds: completed,
    baseline, final,
    observedRequests: { starts: fixture.starts, outcomes: fixture.outcomes, blockedExternal: fixture.blockedExternal },
    limitations: [
      'All changes were confined to a resettable copied-data PostgreSQL harness.',
      'Carrier dialing was prevented; captures show simulated UI outcomes.',
      'Static local authenticated context excludes deployed auth and RLS verification.',
      'Third-party map canvas was inert; actual linked record and Activity panel were exercised.',
      'Activity footprint production counts were exercised; email capture/audit endpoints were outside the snapshot harness.',
      'Brokerage memory read APIs were outside the copied harness; their normal unavailable message remained visible behind the real asset Activity panel.',
      'Header/profile/skills/history endpoints are thin SQL-backed harness adapters.',
    ],
  };
  await writeFile(`work/calling-simulation/private/${prefix}-browser-report.json`, JSON.stringify(report, null, 2));
});
