import { expect, test, type Page, type Route } from 'playwright/test';

type CallSession = {
  clientEventId: string;
  prospectId: string;
  expectedPhone: string;
  startedAt: string;
  eventId: string;
  contactId: string | null;
  contactSnapshot: TestContact | null;
};

type CallRequest = Record<string, unknown> & { clientEventId: string; prospectId: string };
type TestContact = {
  id: string; prospectId: string; isPrimary: boolean; name: string; company: string | null;
  phone: string | null; email: string | null; title: string | null;
  additionalPhones: Array<{ label: string; number: string }>; archivedAt: string | null;
};

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

async function installCallingScenario(page: Page, options: { startFailures?: number; confirmFailures?: number; lostConfirmationResponses?: number; selectedHistoryDelayMs?: number; delayedStart?: boolean; rejectedStart?: boolean; unavailableDiscard?: boolean; discardFailures?: number; callsPerDay?: number } = {}) {
  const starts: CallRequest[] = [];
  const confirmations: CallRequest[] = [];
  const discards: CallRequest[] = [];
  const sessions = new Map<string, CallSession>();
  const confirmed = new Set<string>();
  const discarded = new Set<string>();
  const mutationSequence: string[] = [];
  let releaseStart = () => {};
  const startGate = options.delayedStart ? new Promise<void>((resolve) => { releaseStart = resolve; }) : Promise.resolve();
  const roster = new Map<string, TestContact[]>(candidates.map((candidate, index) => [candidate.prospect.id, [{
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, prospectId: candidate.prospect.id,
    isPrimary: true, ...candidate.contact, title: null, additionalPhones: index === 0 ? [{ label: 'Mobile', number: '(780) 555-0101' }] : [], archivedAt: null,
  }]]));
  const firstRoster = roster.get(candidates[0].prospect.id)!;
  for (const [index, name] of ['Rowan Singh', 'Casey Davis', 'Avery Kim'].entries()) firstRoster.push({
    id: `00000000-0000-4000-8000-${String(101 + index).padStart(12, '0')}`, prospectId: candidates[0].prospect.id,
    isPrimary: false, name, company: candidates[0].contact.company, phone: `(780) 555-010${index + 2}`,
    email: null, title: index === 0 ? 'Operations' : null, additionalPhones: [], archivedAt: null,
  });
  const history = new Map<string, Array<Record<string, unknown>>>(candidates.map((candidate) => [candidate.prospect.id,
    candidate.recentActivity.map((activity) => ({ ...activity, contactId: null, contactName: null, phoneSnapshot: null }))]));
  history.get(candidates[0].prospect.id)!.unshift(
    { id: 'morgan-attributed', type: 'call', outcome: 'attempted', occurredAt: '2026-10-06T17:00:00.000Z', notes: 'Morgan-only saved history.', contactId: firstRoster[0].id, contactName: firstRoster[0].name, phoneSnapshot: firstRoster[0].phone },
    { id: 'rowan-attributed', type: 'call', outcome: 'no_answer', occurredAt: '2026-10-06T16:00:00.000Z', notes: 'Rowan-only saved history.', contactId: firstRoster[1].id, contactName: firstRoster[1].name, phoneSnapshot: firstRoster[1].phone },
  );
  const workspace = (prospectId: string, contactId?: string | null) => {
    const candidate = candidates.find((candidate) => candidate.prospect.id === prospectId)!;
    const contacts = roster.get(prospectId)!.filter((contact) => !contact.archivedAt);
    const activity = history.get(prospectId) || [];
    return { prospect: { ...candidate.prospect, notes: 'Existing account notes.', websiteUrl: null, buildingSf: null, lotSizeAcres: null, aiMetadata: null },
      contacts, primaryContactId: contacts.find((contact) => contact.isPrimary)!.id,
      activity: contactId ? activity.filter((row) => row.contactId === contactId) : activity,
      unattributedActivityCount: activity.filter((row) => !row.contactId).length };
  };
  let startFailures = options.startFailures || 0;
  let confirmFailures = options.confirmFailures || 0;
  let lostConfirmationResponses = options.lostConfirmationResponses || 0;
  let discardFailures = options.discardFailures || 0;
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
  if (options.callsPerDay !== undefined) {
    // Exercise the actual profile query with synthetic local identity and goal;
    // the normal demo AuthContext intentionally disables profile loading.
    await page.route(/\/src\/contexts\/AuthContext\.tsx(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'const user={id:"demo-user",email:"calling-broker@example.test"}; export const useAuth=()=>({user,session:{user},loading:false,needsOnboarding:false,isDemoMode:false,signOut:async()=>{}}); export const AuthProvider=({children})=>children;',
    }));
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === '/api/auth/demo/user') {
      return json(route, { id: 'demo-user', email: 'calling-broker@example.test', firstName: 'Calling', lastName: 'Broker' });
    }
    if (path === '/api/calling/queue') {
      const confirmedProspects = new Set([...sessions.values()].filter((session) => confirmed.has(session.clientEventId)).map((session) => session.prospectId));
      const includeCalledToday = new URL(request.url()).searchParams.get('includeCalledToday') === 'true';
      const rows = candidates.filter((candidate) => includeCalledToday || !confirmedProspects.has(candidate.prospect.id));
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
            contactId: session.contactId, contactSnapshot: session.contactSnapshot,
            candidate: candidates.find((candidate) => candidate.prospect.id === session.prospectId),
          })),
      });
    }
    const workspaceMatch = /^\/api\/calling\/prospects\/([^/]+)\/workspace$/.exec(path);
    if (workspaceMatch && method === 'GET') {
      const contactId = new URL(request.url()).searchParams.get('contactId');
      if (contactId && options.selectedHistoryDelayMs) await new Promise((resolve) => setTimeout(resolve, options.selectedHistoryDelayMs));
      return json(route, workspace(workspaceMatch[1], contactId));
    }
    const contactsMatch = /^\/api\/calling\/prospects\/([^/]+)\/contacts(?:\/([^/]+))?$/.exec(path);
    if (contactsMatch && method === 'POST') {
      const payload = request.postDataJSON();
      const contacts = roster.get(contactsMatch[1])!;
      contacts.push({ id: `00000000-0000-4000-8000-${String(500 + contacts.length).padStart(12, '0')}`, prospectId: contactsMatch[1], isPrimary: false, company: null, phone: null, email: null, title: null, additionalPhones: [], archivedAt: null, ...payload });
      return json(route, workspace(contactsMatch[1]), 201);
    }
    if (contactsMatch && method === 'PATCH') {
      const payload = request.postDataJSON();
      const contact = roster.get(contactsMatch[1])!.find((contact) => contact.id === contactsMatch[2])!;
      Object.assign(contact, payload);
      if (payload.archived) contact.archivedAt = new Date().toISOString();
      return json(route, workspace(contactsMatch[1]));
    }
    if (path === '/api/calling/starts' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest & { expectedPhone: string; callStartedAt: string };
      starts.push(payload);
      mutationSequence.push('start-request');
      await startGate;
      if (discarded.has(payload.clientEventId)) {
        mutationSequence.push('discarded-start-returned');
        return json(route, { duplicate: true, eventId: `start-${payload.clientEventId}`, prospectId: payload.prospectId, contactId: payload.contactId || null, status: 'discarded' });
      }
      if (options.rejectedStart) return json(route, { message: 'This contact number changed on the server', code: 'contact_phone_changed' }, 409);
      if (startFailures-- > 0) return json(route, { message: 'Test start persistence failed' }, 503);
      const duplicate = sessions.has(payload.clientEventId);
      if (!duplicate) {
        sessions.set(payload.clientEventId, {
          clientEventId: payload.clientEventId, prospectId: payload.prospectId,
          expectedPhone: payload.expectedPhone, startedAt: payload.callStartedAt || new Date().toISOString(),
          eventId: `start-${payload.clientEventId}`,
          contactId: typeof payload.contactId === 'string' ? payload.contactId : null,
          contactSnapshot: structuredClone(roster.get(payload.prospectId)!.find((contact) => contact.id === payload.contactId) || roster.get(payload.prospectId)![0]),
        });
      }
      mutationSequence.push('start-saved');
      return json(route, {
        duplicate, eventId: `start-${payload.clientEventId}`, prospectId: payload.prospectId,
        status: confirmed.has(payload.clientEventId) ? 'confirmed' : discarded.has(payload.clientEventId) ? 'discarded' : 'started',
        callStartedAt: sessions.get(payload.clientEventId)?.startedAt,
        contactId: sessions.get(payload.clientEventId)?.contactId,
        contactSnapshot: sessions.get(payload.clientEventId)?.contactSnapshot,
      }, duplicate ? 200 : 201);
    }
    if (path === '/api/calling/outcomes' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest;
      confirmations.push(payload);
      mutationSequence.push('outcome-request');
      if (!sessions.has(payload.clientEventId)) return json(route, { message: 'The observed start must be saved before confirmation' }, 409);
      if (confirmFailures-- > 0) return json(route, { message: 'Test confirmation persistence failed' }, 503);
      const duplicate = confirmed.has(payload.clientEventId);
      confirmed.add(payload.clientEventId);
      if (!duplicate) {
        const session = sessions.get(payload.clientEventId)!;
        history.get(payload.prospectId)!.unshift({ id: `interaction-${payload.clientEventId}`, type: 'call', outcome: payload.outcome, occurredAt: payload.occurredAt, notes: payload.notes || '', contactId: session.contactId, contactName: session.contactSnapshot?.name || null, phoneSnapshot: session.expectedPhone });
      }
      if (lostConfirmationResponses-- > 0) return json(route, { message: 'Test response lost after server confirmed the call' }, 503);
      return json(route, { duplicate, eventId: `event-${payload.clientEventId}`, interactionId: `interaction-${payload.clientEventId}`, prospectId: payload.prospectId, newXpGained: duplicate ? 0 : 15 }, duplicate ? 200 : 201);
    }
    if (path === '/api/calling/discards' && method === 'POST') {
      const payload = request.postDataJSON() as CallRequest;
      discards.push(payload);
      if (discardFailures-- > 0) return json(route, { message: 'Local test discard request failed before being saved' }, 503);
      if (options.unavailableDiscard) return json(route, { prospectId: payload.prospectId, status: 'unavailable', canDismissLocally: true });
      discarded.add(payload.clientEventId);
      return json(route, { discarded: true, prospectId: payload.prospectId, status: 'discarded' });
    }
    if (path === '/api/profile') return json(route, { goals: { callsPerDay: options.callsPerDay ?? 10 } });
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
  return { starts, confirmations, discards, sessions, progress, roster, workspace, mutationSequence, releaseStart, confirmOnServer: (clientEventId: string) => confirmed.add(clientEventId) };
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
  await expect(page.getByText('Calls started', { exact: true })).toBeVisible();
  await expect(page.getByText('Calls logged', { exact: true })).toBeVisible();
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

test('a synthetic saved daily goal advances only after confirmation', async ({ page }) => {
  const scenario = await installCallingScenario(page, { callsPerDay: 20 });
  const goal = page.getByRole('progressbar', { name: 'Daily call target' });
  await expect(page.getByText('0 / 20 daily target', { exact: true })).toBeVisible();
  await expect(goal).toHaveAttribute('aria-valuemax', '20');
  await expect(goal).toHaveAttribute('aria-valuenow', '0');
  await dial(page);
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  await expect(page.getByText('0 / 20 daily target', { exact: true })).toBeVisible();
  await expect(goal).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByText('1 / 20 daily target', { exact: true })).toBeVisible();
  await expect(goal).toHaveAttribute('aria-valuenow', '1');
  expect(scenario.confirmations).toHaveLength(1);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const call = page.getByRole('link', { name: 'Call Morgan Lee', exact: true });
  await expect(call).toBeInViewport();
  const callBounds = await call.boundingBox();
  expect(callBounds?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('region', { name: 'Current call', exact: true })).toBeInViewport();
  await page.screenshot({ path: `work/calling-playwright/${testInfo.project.name}-ready.png` });
  await dial(page);
  const confirm = page.getByRole('button', { name: 'I called · next', exact: true });
  await expect(confirm).toBeInViewport();
  expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const upcoming = page.getByRole('region', { name: 'Next companies', exact: true });
  await expect(upcoming).toBeVisible();
  // The new roster stacks above the queue on mobile; primary actions stay near
  // the company while the full workspace remains available by scrolling.
  await page.screenshot({ path: `work/calling-playwright/${testInfo.project.name}.png` });
});

test('compact call page provides company and contact context with several companies next', async ({ page }, testInfo) => {
  await installCallingScenario(page);
  const currentCall = page.getByRole('region', { name: 'Current call', exact: true });
  await expect(currentCall.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(currentCall).toContainText('Morgan Lee');
  await expect(page.getByRole('link', { name: 'View record', exact: true })).toHaveAttribute('href', '/app?prospectId=calling-prospect-1');
  const activity = currentCall.getByRole('region', { name: 'Account activity', exact: true });
  await activity.getByRole('button', { name: 'All account activity', exact: true }).click();
  await expect(activity.getByText('Saved context for Calling Company 1.', { exact: true })).toBeVisible();
  const nextCompanies = page.getByRole('region', { name: 'Next companies', exact: true });
  await expect(nextCompanies).toBeVisible();
  for (const number of [2, 3, 4, 5]) {
    await expect(nextCompanies.getByText(`Calling Company ${number}`, { exact: true })).toBeVisible();
  }
  await expect(nextCompanies.getByText(/^Vas Patel ·/)).toBeVisible();
  await expect(nextCompanies.getByText(/^Jim Carter ·/)).toBeVisible();
  const capturePrefix = testInfo.project.name === 'calling-mobile' ? 'mobile' : 'desktop';
  await expect(page.getByTestId('calls-started-today')).toHaveText('0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-01-ready.png` });
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-01-ready-full.png`, fullPage: true });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-started-today')).toHaveText('1');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `work/calling-playwright/${capturePrefix}-02-started.png` });
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(currentCall.getByRole('heading', { name: 'Calling Company 2', exact: true })).toBeFocused();
  await activity.getByRole('button', { name: 'All account activity', exact: true }).click();
  await expect(activity.getByText('Saved context for Calling Company 2.', { exact: true })).toBeVisible();
  await expect(activity.getByText('Saved context for Calling Company 1.', { exact: true })).toHaveCount(0);
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

test('contact selection and history switches keep people separate while preserving legacy account context', async ({ page }) => {
  const scenario = await installCallingScenario(page, { selectedHistoryDelayMs: 350 });
  const contacts = page.getByRole('region', { name: 'Contacts', exact: true });
  const activity = page.getByRole('region', { name: 'Account activity', exact: true });
  await expect(contacts.getByRole('button', { name: 'Select contact Morgan Lee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(contacts.getByRole('button', { name: 'Select contact Avery Kim', exact: true })).toHaveCount(0);
  await contacts.getByRole('button', { name: 'View all contacts', exact: true }).click();
  await expect(contacts.getByRole('button', { name: 'Select contact Avery Kim', exact: true })).toBeVisible();
  await activity.getByRole('button', { name: 'Selected contact', exact: true }).click();
  await expect(activity.getByText('Morgan-only saved history.', { exact: true })).toBeVisible();
  await contacts.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  await expect(activity.getByText('Morgan-only saved history.', { exact: true })).toHaveCount(0);
  await expect(activity.getByText('Rowan-only saved history.', { exact: true })).toBeVisible();
  await expect(activity.getByText('Saved context for Calling Company 1.', { exact: true })).toHaveCount(0);
  await expect(activity.getByText(/earlier activity has no contact attribution/)).toBeVisible();
  await activity.getByRole('button', { name: 'All account activity', exact: true }).click();
  await expect(activity.getByText('Saved context for Calling Company 1.', { exact: true })).toBeVisible();
  await expect(activity.getByText('Morgan-only saved history.', { exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(0);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.roster.get('calling-prospect-1')!.find((contact) => contact.isPrimary)?.name).toBe('Morgan Lee');
});

test('a selected alternate number freezes its contact and company until confirmation or undo', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  const number = page.getByRole('combobox', { name: 'Phone number for Morgan Lee', exact: true });
  await number.selectOption('(780) 555-0101');
  await dial(page);
  await expect.poll(() => scenario.starts.length).toBe(1);
  const primaryId = scenario.roster.get('calling-prospect-1')![0].id;
  expect(scenario.starts[0]).toMatchObject({ prospectId: 'calling-prospect-1', contactId: primaryId, expectedPhone: '(780) 555-0101' });
  await expect(number).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select company Calling Company 2', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit contact Morgan Lee', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  await expect.poll(() => scenario.starts.length).toBe(2);
  expect(scenario.starts[1]).toEqual(scenario.starts[0]);
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect.poll(() => scenario.progress().startedToday).toBe(0);
  expect(scenario.confirmations).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeEnabled();
});

test('explicit log-and-alternate stays with the company while the default advances after a different person', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log & try another contact', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Rowan Singh', exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  await dial(page, 'Rowan Singh');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations.map((payload) => payload.prospectId)).toEqual(['calling-prospect-1', 'calling-prospect-1']);
  expect(new Set(scenario.confirmations.map((payload) => payload.contactId)).size).toBe(2);
  expect(new Set(scenario.confirmations.map((payload) => payload.clientEventId)).size).toBe(2);
  expect(scenario.progress()).toMatchObject({ startedToday: 2, confirmedToday: 2 });
});

test('selecting a queue company prepares its own contact context without recording a call', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await page.getByRole('button', { name: 'Select company Calling Company 3', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 3', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Morgan Lee', exact: true })).toHaveCount(0);
  await expect(page.getByText('Morgan-only saved history.', { exact: true })).toHaveCount(0);
  expect(scenario.starts).toHaveLength(0);
  expect(scenario.confirmations).toHaveLength(0);
});

test('adding a private contact with a second number prepares the person without call credit', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Name', { exact: true }).fill('New local contact');
  await editor.getByLabel('Email', { exact: true }).fill('new-contact@example.test');
  await editor.getByLabel('Phone', { exact: true }).fill('(780) 555-0110');
  await editor.getByRole('button', { name: 'Add another phone number', exact: true }).click();
  await editor.getByLabel('Number', { exact: true }).fill('(780) 555-0111');
  await editor.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Call New local contact', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Phone number for New local contact', exact: true })).toHaveValue('(780) 555-0110');
  const saved = scenario.roster.get('calling-prospect-1')!.find((contact) => contact.name === 'New local contact')!;
  expect(saved.additionalPhones).toEqual([{ label: 'Mobile', number: '(780) 555-0111' }]);
  expect(saved.isPrimary).toBe(false);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
});

test('quick confirmation waits for the observed start and reuses its identity without redialing', async ({ page }) => {
  const scenario = await installCallingScenario(page, { delayedStart: true });
  await dial(page);
  await expect.poll(() => scenario.starts.length).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirming...', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(0);
  scenario.releaseStart();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(1);
  expect(new Set(scenario.starts.map((payload) => payload.clientEventId)).size).toBe(1);
  expect(scenario.confirmations[0].clientEventId).toBe(scenario.starts[0].clientEventId);
  expect(scenario.mutationSequence.indexOf('start-saved')).toBeLessThan(scenario.mutationSequence.indexOf('outcome-request'));
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  await expect(page.getByTestId('calls-started-today')).toHaveText('1');
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:7805550100']);
});

test('undo of a server-rejected stale contact start clears the frozen target without retrying or credit', async ({ page }) => {
  const scenario = await installCallingScenario(page, { rejectedStart: true });
  await dial(page);
  await expect(page.getByText('Call start not recorded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Select company Calling Company 2', exact: true })).toBeEnabled();
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.discards).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
});

test('an unavailable owned context can be cleared locally while a failed undo remains retryable', async ({ page }) => {
  const scenario = await installCallingScenario(page, { rejectedStart: true, unavailableDiscard: true, discardFailures: 1 });
  await dial(page);
  await expect(page.getByText('Call start not recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByText('Recording failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Vas Patel', exact: true })).toBeEnabled();
  await expect(page.getByText('Recording failed', { exact: true })).toHaveCount(0);
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.discards).toHaveLength(2);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
});

test('a second saved pending person at the same company is recovered after the first call is resolved', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  const alternate = scenario.roster.get('calling-prospect-1')![1];
  const secondKey = 'saved-second-person-same-company-001';
  scenario.sessions.set(secondKey, {
    clientEventId: secondKey, prospectId: 'calling-prospect-1', expectedPhone: alternate.phone!,
    startedAt: new Date().toISOString(), eventId: `start-${secondKey}`, contactId: alternate.id,
    contactSnapshot: structuredClone(alternate),
  });
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('level-cre-active-call:v2:demo-user') || '{}').clientEventId)).toBe(secondKey);
  await expect(page.getByRole('region', { name: 'Current call', exact: true }).getByText('Rowan Singh', { exact: true }).first()).toBeVisible();
  expect(scenario.starts).toHaveLength(1);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1].clientEventId).toBe(secondKey);
  expect(scenario.progress()).toMatchObject({ startedToday: 2, confirmedToday: 2 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:7805550100']);
});

test('undo arriving before a delayed original start prevents the late response from restoring the call', async ({ page }) => {
  const scenario = await installCallingScenario(page, { delayedStart: true });
  await dial(page);
  await expect.poll(() => scenario.starts.length).toBe(1);
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  scenario.releaseStart();
  await expect.poll(() => scenario.mutationSequence.includes('discarded-start-returned')).toBe(true);
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toHaveCount(0);
  await expect(page.getByText('Recording failed', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeEnabled();
  expect(scenario.discards).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
});
