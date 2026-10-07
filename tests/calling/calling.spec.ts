import { expect, test, type Page, type Route } from 'playwright/test';

type CallSession = {
  clientEventId: string;
  prospectId: string;
  expectedPhone: string;
  startedAt: string;
  eventId: string;
};

type CallRequest = Record<string, unknown> & { clientEventId: string; prospectId: string };

const phone = '(780) 555-0100';
const candidates = ['Morgan Lee', 'Vas Patel', 'Jim Carter', 'Alex Rivera', 'Jordan Miller', 'Sam Taylor'].map((name, index) => ({
  id: `call:calling-prospect-${index + 1}`,
  priorityScore: 95 - index,
  priority: 'high',
  reasons: ['Due today'],
  contact: { name, company: `Calling Company ${index + 1}`, phone, email: null },
  prospect: {
    id: `calling-prospect-${index + 1}`,
    name: `Calling prospect ${index + 1}`,
    status: 'prospect',
    address: null,
    businessName: null,
    followUpDueDate: null,
    lastContactDate: null,
  },
  listingTitles: [],
  recentActivity: [{ id: `calling-history-${index + 1}`, type: 'call', outcome: 'attempted', occurredAt: '2026-10-06T18:00:00.000Z', notes: `Saved context for Calling Company ${index + 1}.` }],
}));

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installCallingScenario(page: Page, options: { startFailures?: number; confirmFailures?: number; lostConfirmationResponses?: number } = {}) {
  const starts: CallRequest[] = [];
  const confirmations: CallRequest[] = [];
  const discards: CallRequest[] = [];
  const sessions = new Map<string, CallSession>();
  const confirmed = new Set<string>();
  const discarded = new Set<string>();
  let startFailures = options.startFailures || 0;
  let confirmFailures = options.confirmFailures || 0;
  let lostConfirmationResponses = options.lostConfirmationResponses || 0;
  const progress = () => ({
    startedToday: [...sessions.keys()].filter((id) => !discarded.has(id)).length,
    confirmedToday: confirmed.size,
    connectedToday: 0,
  });

  await page.addInitScript(() => {
    localStorage.setItem('demo-mode', 'true');
    (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs = [];
    // Preserve the React click handler while preventing a real phone/dialer handoff.
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="tel:"]') : null;
      if (!link) return;
      event.preventDefault();
      (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs?.push(link.getAttribute('href') || '');
    }, true);
  });
  await page.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname;
    return ['127.0.0.1', 'localhost'].includes(hostname) ? route.fallback() : route.abort('blockedbyclient');
  });

  // Demo responses normally bypass fetch. Substitute only this browser module so
  // the real calling component uses the isolated, stateful API fixture below.
  await page.route(/\/src\/lib\/demoApi\.ts(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'export const isDemoModeRequested = () => true; export const getDemoApiResult = () => null; export const demoJsonResponse = result => new Response(JSON.stringify(result.payload), {status: result.status || 200, headers: {"Content-Type": "application/json"}});',
    });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === '/api/auth/demo/user') {
      return json(route, { id: 'demo-user', email: 'calling-broker@example.test', firstName: 'Calling', lastName: 'Broker' });
    }
    if (path === '/api/calling/queue') {
      const confirmedProspects = new Set([...sessions.values()].filter((session) => confirmed.has(session.clientEventId)).map((session) => session.prospectId));
      const rows = candidates.filter((candidate) => !confirmedProspects.has(candidate.prospect.id));
      return json(route, {
        generatedAt: new Date().toISOString(), rows, total: rows.length,
        progress: progress(),
        totalEligible: rows.length,
        pendingSessions: [...sessions.values()]
          .filter((session) => !confirmed.has(session.clientEventId) && !discarded.has(session.clientEventId))
          .map((session) => ({
            clientEventId: session.clientEventId,
            prospectId: session.prospectId,
            phoneSnapshot: session.expectedPhone,
            callStartedAt: session.startedAt,
            eventId: session.eventId,
            candidate: candidates.find((candidate) => candidate.prospect.id === session.prospectId),
          })),
      });
    }
    if (path === '/api/calling/starts' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest & { expectedPhone: string; callStartedAt: string };
      starts.push(payload);
      if (startFailures-- > 0) return json(route, { message: 'Test start persistence failed' }, 503);
      const duplicate = sessions.has(payload.clientEventId);
      if (!duplicate) {
        sessions.set(payload.clientEventId, {
          clientEventId: payload.clientEventId, prospectId: payload.prospectId,
          expectedPhone: payload.expectedPhone, startedAt: payload.callStartedAt || new Date().toISOString(),
          eventId: `start-${payload.clientEventId}`,
        });
      }
      return json(route, {
        duplicate, eventId: `start-${payload.clientEventId}`, prospectId: payload.prospectId,
        status: confirmed.has(payload.clientEventId) ? 'confirmed' : discarded.has(payload.clientEventId) ? 'discarded' : 'started',
        callStartedAt: sessions.get(payload.clientEventId)?.startedAt,
      }, duplicate ? 200 : 201);
    }
    if (path === '/api/calling/outcomes' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest;
      confirmations.push(payload);
      if (confirmFailures-- > 0) return json(route, { message: 'Test confirmation persistence failed' }, 503);
      const duplicate = confirmed.has(payload.clientEventId);
      confirmed.add(payload.clientEventId);
      if (lostConfirmationResponses-- > 0) return json(route, { message: 'Test response lost after server confirmed the call' }, 503);
      return json(route, { duplicate, eventId: `event-${payload.clientEventId}`, interactionId: `interaction-${payload.clientEventId}`, prospectId: payload.prospectId, newXpGained: duplicate ? 0 : 15 }, duplicate ? 200 : 201);
    }
    if (path === '/api/calling/discards' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest;
      discards.push(payload);
      discarded.add(payload.clientEventId);
      return json(route, { discarded: true, prospectId: payload.prospectId, status: 'discarded' });
    }
    if (path === '/api/profile') return json(route, { goals: { callsPerDay: 10 } });
    if (path === '/api/stats/header') return json(route, { totalLevel: 1, assetsTracked: 3, followupsLogged: confirmed.size, streakDays: 0 });
    if (path === '/api/skills') return json(route, { prospecting: 0, followUp: 0, consistency: 0, marketKnowledge: 0 });
    if (path === '/api/automation/activity-pulse') return json(route, { days: 28, total: 0, activeDays: 0, streakDays: 0, automated: 0, manual: 0, inboundEmail: 0, currentPeriodTotal: 0, previousPeriodTotal: 0, trendPercent: 0, series: [] });
    if (path === '/api/automation/reconciliation') return json(route, { summary: { issues: 0, high: 0 }, rows: [] });
    if (path === '/api/automation/sales-brief') return json(route, { actions: [], summary: {}, integrations: { salesActivityAgentConfigured: false } });
    if (path === '/api/agent/sales-activity/imports') return json(route, { rows: [] });
    return json(route, []);
  });

  await page.goto('/app/calls');
  await expect(page.getByRole('heading', { name: 'Calls', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  return { starts, confirmations, discards, sessions, progress, confirmOnServer: (clientEventId: string) => confirmed.add(clientEventId) };
}

async function dial(page: Page, name = 'Morgan Lee') {
  await page.getByRole('link', { name: `Call ${name}`, exact: true }).click();
}

async function assertUnobscuredReward(page: Page) {
  const reward = page.getByText('Call saved · +15', { exact: true });
  await expect(reward).toBeVisible();
  await expect.poll(() => reward.evaluate((title) => {
    const bounds = title.getBoundingClientRect();
    return [0.1, 0.9].every((x) => [0.1, 0.9].every((y) =>
      title.contains(document.elementFromPoint(bounds.x + bounds.width * x, bounds.y + bounds.height * y))));
  }), { message: 'The complete reward title must be unobscured by the fixed header' }).toBe(true);
  return reward.locator('xpath=ancestor::li[1]');
}

test('two clicks confirm a call and present the next contact without notes or scheduling', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await expect(page.getByText('Started today', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirmed today', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await expect(page.getByTestId('calls-started-today')).toHaveText('1');
  await expect(page.getByText('Call saved · +15', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  const savedNotification = await assertUnobscuredReward(page);
  await expect(savedNotification.getByText('Calling Company 1', { exact: true })).toBeVisible();
  await expect(savedNotification).not.toContainText(/\bXP\b|Next company ready/);
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ clientEventId: scenario.starts[0].clientEventId, outcome: 'attempted', notes: '' });
  expect(scenario.confirmations[0]).not.toHaveProperty('nextFollowUp');
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:7805550100']);
});

test('refresh reconciles the same broker-scoped pending call without a second start credit', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect.poll(() => scenario.starts.length).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  await expect.poll(() => scenario.starts.length).toBe(2);
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(2);
  expect(scenario.starts[1]).toEqual(scenario.starts[0]);
  expect(scenario.progress().startedToday).toBe(1);
  expect(scenario.confirmations[0].clientEventId).toBe(scenario.starts[0].clientEventId);
});

test('a cached call belonging to another broker is not resumed or displayed', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await page.evaluate((candidate) => {
    localStorage.setItem('level-cre-active-call:v2:demo-user', JSON.stringify({
      brokerId: 'another-broker', clientEventId: 'foreign-call-session-123',
      prospectId: candidate.prospect.id, expectedPhone: candidate.contact.phone,
      startedAt: new Date().toISOString(), recorded: true,
      candidate: { ...candidate, contact: { ...candidate.contact, name: 'Other broker private contact' } },
    }));
  }, candidates[0]);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  await expect(page.getByText('Other broker private contact', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toHaveCount(0);
  expect(scenario.starts).toHaveLength(0);
});

test('an optional outcome records and advances in one click', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ outcome: 'no_answer', notes: '' });
  expect(scenario.confirmations[0]).not.toHaveProperty('nextFollowUp');
});

test('failed start stays visibly unsaved and retries the same session identity', async ({ page }) => {
  const scenario = await installCallingScenario(page, { startFailures: 1 });
  await dial(page);
  await expect(page.getByText('Call start not recorded', { exact: true })).toBeVisible();
  expect(scenario.progress().startedToday).toBe(0);
  await expect(page.getByTestId('calls-started-today')).toHaveText('0');
  await page.getByRole('button', { name: /retry/i }).first().click();
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  expect(scenario.starts).toHaveLength(2);
  expect(scenario.starts[1].clientEventId).toBe(scenario.starts[0].clientEventId);
});

test('failed confirmation retains the active card and retry does not create a new call', async ({ page }) => {
  const scenario = await installCallingScenario(page, { confirmFailures: 1 });
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByText('Recording failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1].clientEventId).toBe(scenario.confirmations[0].clientEventId);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
});

test('retry preserves the selected outcome and original note, follow-up, and call timestamp', async ({ page }) => {
  const scenario = await installCallingScenario(page, { confirmFailures: 1 });
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox').fill('Original note from this call.');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(page.getByText('Recording failed', { exact: true })).toBeVisible();
  const first = scenario.confirmations[0];
  expect(first).toMatchObject({ outcome: 'no_answer', notes: 'Original note from this call.', occurredAt: scenario.starts[0].callStartedAt });
  expect(typeof first.nextFollowUp).toBe('string');
  await expect(page.getByRole('textbox')).toBeDisabled();
  await expect(page.getByRole('textbox')).toHaveValue('Original note from this call.');
  await expect(page.getByRole('button', { name: 'No answer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '1 month', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Retry will use your saved outcome and note\. Follow-up:/)).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1]).toEqual(first);
});

test('refresh retains a failed explicit confirmation instead of changing it to a generic attempt', async ({ page }) => {
  const scenario = await installCallingScenario(page, { confirmFailures: 1 });
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox').fill('Keep this exact note across refresh.');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(page.getByText('Recording failed', { exact: true })).toBeVisible();
  const first = scenario.confirmations[0];
  await page.reload();
  await expect.poll(() => scenario.starts.length).toBe(2);
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await expect(page.getByRole('textbox')).toBeDisabled();
  await expect(page.getByRole('textbox')).toHaveValue('Keep this exact note across refresh.');
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1]).toEqual(first);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
});

test('a lost response retries the same explicit confirmation without a second credit', async ({ page }) => {
  const scenario = await installCallingScenario(page, { lostConfirmationResponses: 1 });
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(page.getByText('Recording failed', { exact: true })).toBeVisible();
  expect(scenario.progress().confirmedToday).toBe(1);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1]).toEqual(scenario.confirmations[0]);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  await expect(page.getByText('Call already recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('Call saved · +15', { exact: true })).toHaveCount(0);
});

test('a restored call already confirmed elsewhere advances without dialing or confirming again', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  scenario.confirmOnServer(scenario.starts[0].clientEventId);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(2);
  expect(scenario.starts[1]).toEqual(scenario.starts[0]);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  await expect(page.getByTestId('calls-started-today')).toHaveText('1');
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('level-cre-active-call:v2:demo-user'))).toBeNull();
});

test('repeated confirmation gestures submit the call only once', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: 'I called · next', exact: true }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(1);
});

test('repeated dial gestures retain a single call identity', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await page.getByRole('link', { name: 'Call Morgan Lee', exact: true }).evaluate((anchor) => {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  expect(new Set(scenario.starts.map((entry) => entry.clientEventId)).size).toBe(1);
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
});

test('undo excludes the start from progress without confirming a call', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await page.getByRole('button', { name: /didn.t call/i }).click();
  await expect.poll(() => scenario.progress().startedToday).toBe(0);
  await expect(page.getByTestId('calls-started-today')).toHaveText('0');
  expect(scenario.discards).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toHaveCount(0);
});

test('phone-sized calling controls stay in view with no horizontal overflow', async ({ page }, testInfo) => {
  await installCallingScenario(page);
  const assertCompactGeometry = async () => {
    const card = page.getByRole('region', { name: 'Current call', exact: true });
    const upcoming = page.getByRole('region', { name: 'Next companies', exact: true });
    const secondUpcoming = upcoming.getByRole('listitem').nth(1);
    await expect(card).toBeInViewport();
    await expect(secondUpcoming).toBeInViewport();
    const viewportBottom = (page.viewportSize()?.height || 0) - (testInfo.project.name === 'calling-mobile' ? 64 : 0);
    const cardBounds = await card.boundingBox();
    expect(cardBounds).not.toBeNull();
    expect((cardBounds?.y || 0) + (cardBounds?.height || 0)).toBeLessThanOrEqual(viewportBottom);
    const nextBounds = await secondUpcoming.boundingBox();
    expect((nextBounds?.y || 0) + (nextBounds?.height || 0)).toBeLessThanOrEqual(viewportBottom);
  };
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const call = page.getByRole('link', { name: 'Call Morgan Lee', exact: true });
  await expect(call).toBeInViewport();
  const callBounds = await call.boundingBox();
  expect(callBounds?.height).toBeGreaterThanOrEqual(44);
  await assertCompactGeometry();
  await page.screenshot({ path: `work/calling-playwright/${testInfo.project.name}-ready.png` });
  await dial(page);
  const confirm = page.getByRole('button', { name: 'I called · next', exact: true });
  await expect(confirm).toBeInViewport();
  expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertCompactGeometry();
  await page.screenshot({ path: `work/calling-playwright/${testInfo.project.name}.png` });
});

test('compact call page provides company and contact context with several companies next', async ({ page }, testInfo) => {
  await installCallingScenario(page);
  const currentCall = page.getByRole('region', { name: 'Current call', exact: true });
  await expect(currentCall.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(currentCall).toContainText('Morgan Lee');
  await expect(page.getByRole('link', { name: 'View record', exact: true })).toHaveAttribute('href', '/app?prospectId=calling-prospect-1');
  const recentActivity = currentCall.locator('details');
  await expect(recentActivity).not.toHaveAttribute('open');
  await expect(recentActivity.getByText('Saved context for Calling Company 1.', { exact: true })).toBeHidden();
  await recentActivity.locator('summary').click();
  await expect(recentActivity).toHaveAttribute('open', '');
  await expect(recentActivity.getByText('Saved context for Calling Company 1.', { exact: true })).toBeVisible();
  await recentActivity.locator('summary').click();
  const nextCompanies = page.getByRole('region', { name: 'Next companies', exact: true });
  await expect(nextCompanies).toBeVisible();
  for (const number of [2, 3, 4, 5]) {
    await expect(nextCompanies.getByText(`Calling Company ${number}`, { exact: true })).toBeVisible();
  }
  await expect(nextCompanies.getByText(/^Vas Patel ·/)).toBeVisible();
  await expect(nextCompanies.getByText(/^Jim Carter ·/)).toBeVisible();
  const capturePrefix = testInfo.project.name === 'calling-mobile' ? 'mobile' : 'desktop';
  await expect(page.getByTestId('calls-started-today')).toHaveText('0');
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-01-ready.png` });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-started-today')).toHaveText('1');
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-02-started.png` });
  await recentActivity.locator('summary').click();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(currentCall.getByRole('heading', { name: 'Calling Company 2', exact: true })).toBeFocused();
  await expect(recentActivity).not.toHaveAttribute('open');
  await expect(recentActivity.getByText('Saved context for Calling Company 2.', { exact: true })).toBeHidden();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  await assertUnobscuredReward(page);
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-03-next.png`, animations: 'disabled' });
});

test('calling stays reachable from the desktop tools and under Today on the five-tab mobile navigation', async ({ page }, testInfo) => {
  await installCallingScenario(page);
  if (testInfo.project.name === 'calling-mobile') {
    const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link')).toHaveCount(5);
    await expect(navigation.getByRole('link', { name: 'Today', exact: true })).toHaveAttribute('aria-current', /^(page|true)$/);
    await expect(navigation.getByRole('link', { name: 'Calls', exact: true })).toHaveCount(0);
  } else {
    const calls = page.getByRole('navigation', { name: 'Supporting tools', exact: true }).getByRole('link', { name: 'Calls', exact: true });
    await expect(calls).toBeVisible();
    await expect(calls).toHaveAttribute('href', '/app/calls');
    await calls.click();
    await expect(page.getByRole('heading', { name: 'Calls', exact: true })).toBeVisible();
  }
  const navigationName = testInfo.project.name === 'calling-mobile' ? 'Mobile navigation' : 'Primary navigation';
  await page.getByRole('navigation', { name: navigationName, exact: true }).getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const startCalling = page.locator('main a[href="/app/calls"]').first();
  await expect(startCalling).toBeVisible();
  await startCalling.click();
  await expect(page.getByRole('heading', { name: 'Calls', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
});
