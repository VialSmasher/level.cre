import { expect, test, type Page, type Route } from 'playwright/test';
import { derivePhoneReadiness, parseBusinessPhone, type PhoneBlock } from '../../apps/api/src/lib/phoneReadiness';

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
const contactEmails = {
  morgan: 'morgan.lee+cre@calling.example.test',
  rowan: 'rowan.singh@calling.example.test',
  vas: 'vas.patel@calling.example.test',
};
// Third-party rendering is inert; the real Home panel, saves and call control mount.
const inertMapModule = `
import React from '/node_modules/.vite/deps/react.js';
const point = {lat: () => 53.55, lng: () => -113.5};
const map = {panTo() {}, setCenter() {}, setZoom() {}, setMapTypeId() {}, getZoom: () => 15, getCenter: () => point,
 getBounds: () => null, getDiv: () => document.createElement('div'), setOptions() {}, addListener: () => ({remove() {}})};
export const useJsApiLoader = () => ({isLoaded: true, loadError: null});
export const useGoogleMap = () => null;
export function GoogleMap({onLoad}) {React.useEffect(() => {onLoad?.(map)}, []); return React.createElement('div', {'data-testid':'inert-map-canvas', style:{height:'100%'}, 'aria-label':'Map canvas omitted from isolated calling test'});}
export const Polygon = () => null; export const InfoWindow = () => null; export const InfoWindowF = () => null;
`;
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

async function installCallingScenario(page: Page, options: { startFailures?: number; confirmFailures?: number; lostConfirmationResponses?: number; selectedHistoryDelayMs?: number; workspaceDelayMs?: number; delayedStart?: boolean; rejectedStart?: boolean; unavailableDiscard?: boolean; discardFailures?: number; callsPerDay?: number; mainLineOnly?: boolean; missingEmailPrimary?: boolean; mobileFirst?: boolean; contactEmails?: 'all' | 'primary_only'; touchHistory?: boolean; noAlternates?: boolean; map?: boolean; missingPhone?: boolean; delayedContactSave?: boolean; lostContactSaveResponses?: number } = {}) {
  if (options.map) test.setTimeout(45_000); // Home's first lazy module compiles on a cold isolated Vite run.
  const starts: CallRequest[] = [];
  const confirmations: CallRequest[] = [];
  const discards: CallRequest[] = [];
  const sessions = new Map<string, CallSession>();
  const confirmed = new Set<string>();
  const discarded = new Set<string>();
  const mutationSequence: string[] = [];
  const queueReads: string[] = [];
  const needsNumberReads: string[] = [];
  const workspaceReads: string[] = [];
  const contactWrites: Array<{ method: string; prospectId: string; contactId?: string; payload: Record<string, unknown> }> = [];
  const enrichmentWrites: Array<Record<string, any>> = [];
  const legacyCallWrites: CallRequest[] = [];
  const apiWrites: Array<{ method: string; path: string; body: string | null }> = [];
  const pageErrors: string[] = [];
  if (options.map) page.on('pageerror', (error) => pageErrors.push(error.message));
  const blocks = new Map<string, PhoneBlock[]>();
  let releaseStart = () => {};
  const startGate = options.delayedStart ? new Promise<void>((resolve) => { releaseStart = resolve; }) : Promise.resolve();
  let releaseContactSave = () => {};
  const contactSaveGate = options.delayedContactSave ? new Promise<void>((resolve) => { releaseContactSave = resolve; }) : Promise.resolve();
  const roster = new Map<string, TestContact[]>(candidates.map((candidate, index) => [candidate.prospect.id, [{
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, prospectId: candidate.prospect.id,
    isPrimary: true, ...candidate.contact, title: null, additionalPhones: index === 0 ? [{ label: options.mobileFirst ? 'Mobile' : 'Alternate phone', number: '(780) 555-0101' }] : [], archivedAt: null,
  }]]));
  const firstRoster = roster.get(candidates[0].prospect.id)!;
  for (const [index, name] of ['Rowan Singh', 'Casey Davis', 'Avery Kim'].entries()) firstRoster.push({
    id: `00000000-0000-4000-8000-${String(101 + index).padStart(12, '0')}`, prospectId: candidates[0].prospect.id,
    isPrimary: false, name, company: candidates[0].contact.company, phone: `(780) 555-010${index + 2}`,
    email: null, title: index === 0 ? 'Operations' : null, additionalPhones: [], archivedAt: null,
  });
  if (options.missingEmailPrimary) { firstRoster[0].phone = null; firstRoster[0].additionalPhones = []; firstRoster[0].email = 'morgan@example.test'; firstRoster.splice(2); }
  if (options.mobileFirst) firstRoster[0].email = 'morgan@example.test';
  if (options.mainLineOnly) {
    firstRoster[0].phone = null; firstRoster[0].additionalPhones = [];
    firstRoster[0].email = 'morgan@example.test';
    firstRoster[1].name = 'Company main line'; firstRoster[1].title = 'Company switchboard'; firstRoster.splice(2);
  }
  if (options.contactEmails) {
    firstRoster[0].email = contactEmails.morgan;
    if (options.contactEmails === 'all') firstRoster[1].email = contactEmails.rowan;
    roster.get(candidates[1].prospect.id)![0].email = contactEmails.vas;
  }
  const readiness = (prospectId: string) => {
    const candidate = candidates.find((candidate) => candidate.prospect.id === prospectId)!;
    const contacts = roster.get(prospectId)!.filter((contact) => !contact.archivedAt);
    const primary = contacts.find((contact) => contact.isPrimary)!;
    return derivePhoneReadiness({ ...candidate.prospect, contact_name: primary.name, contact_email: primary.email, contact_phone: primary.phone,
      ai_metadata: { phoneReadiness: { blocks: blocks.get(prospectId) || [] }, phoneEnrichment: { observations: options.mobileFirst ? [{contactId:primary.id,number:primary.phone,kind:'contact_direct',directNumberType:'office',status:'applied'}] : [] } } }, contacts);
  };
  const history = new Map<string, Array<Record<string, unknown>>>(candidates.map((candidate) => [candidate.prospect.id,
    candidate.recentActivity.map((activity) => ({ ...activity, contactId: null, contactName: null, phoneSnapshot: null }))]));
  history.get(candidates[0].prospect.id)!.unshift(
    { id: 'morgan-attributed', type: 'call', outcome: 'attempted', occurredAt: '2026-10-06T17:00:00.000Z', notes: 'Morgan-only saved history.', contactId: firstRoster[0].id, contactName: firstRoster[0].name, phoneSnapshot: firstRoster[0].phone },
    { id: 'rowan-attributed', type: 'call', outcome: 'no_answer', occurredAt: '2026-10-06T16:00:00.000Z', notes: 'Rowan-only saved history.', contactId: firstRoster[1].id, contactName: firstRoster[1].name, phoneSnapshot: firstRoster[1].phone },
  );
  if (options.touchHistory) {
    const morgan = firstRoster[0];
    const rowan = firstRoster[1];
    const email = (id: string, contact: TestContact, occurredAt: string, subject: string, direction: string, evidenceStatus = 'confirmed', outcome = 'contacted') => ({
      id, type: 'email', outcome, occurredAt, subject, direction, evidenceStatus,
      notes: 'Provider capture provenance, not the email subject.', contactId: contact.id, contactName: contact.name, phoneSnapshot: null,
    });
    // Deliberately unsorted. Newer drafts/internal/uncertain evidence and invalid
    // dates must never replace a person's real recorded contact touch.
    history.get(candidates[0].prospect.id)!.push(
      email('morgan-old-email', morgan, '2026-10-03T18:00:00.000Z', 'Older warehouse check-in', 'outbound'),
      email('morgan-draft', morgan, '2026-10-08T21:00:00.000Z', 'Unsent draft subject', 'outbound', 'confirmed', 'drafted'),
      email('rowan-received', rowan, '2026-10-07T17:00:00.000Z', 'Re: Timing for the warehouse search', 'inbound'),
      email('morgan-internal', morgan, '2026-10-08T22:00:00.000Z', 'Internal team note', 'internal'),
      email('morgan-latest-sent', morgan, '2026-10-06T18:00:00.000Z', 'Warehouse space update', 'outbound'),
      email('morgan-unconfirmed', morgan, '2026-10-08T23:00:00.000Z', 'Unconfirmed send subject', 'outbound', 'uncertain'),
      email('morgan-invalid-date', morgan, 'not-a-date', 'Invalid timestamp subject', 'outbound'),
      { id: 'morgan-private-note', type: 'note', outcome: 'noted', occurredAt: '2026-10-08T23:59:00.000Z', notes: 'Internal research note is not a touch.', contactId: morgan.id, contactName: morgan.name, phoneSnapshot: null },
    );
  }
  if (options.noAlternates) { firstRoster.splice(1); firstRoster[0].additionalPhones = []; }
  if (options.missingPhone) { firstRoster.splice(1); firstRoster[0].phone = null; firstRoster[0].additionalPhones = []; }
  const mapProspects = () => candidates.map((candidate, index) => {
    const primary = roster.get(candidate.prospect.id)!.find((contact) => contact.isPrimary)!;
    return { ...candidate.prospect, businessName: candidate.contact.company, notes: 'Existing account notes.',
      geometry: { type: 'Point', coordinates: [-113.5 + index * 0.01, 53.55] }, createdDate: '2026-10-01T18:00:00.000Z',
      contactName: primary.name, contactPhone: primary.phone, contactCompany: primary.company, contactEmail: primary.email,
      aiMetadata: null, buildingSf: null, lotSizeAcres: null, submarketId: null };
  });
  const workspace = (prospectId: string, contactId?: string | null) => {
    const candidate = candidates.find((candidate) => candidate.prospect.id === prospectId)!;
    const contacts = roster.get(prospectId)!.filter((contact) => !contact.archivedAt);
    const activity = history.get(prospectId) || [];
    return { prospect: { ...candidate.prospect, notes: 'Existing account notes.', websiteUrl: null, buildingSf: null, lotSizeAcres: null, aiMetadata: null },
      contacts, primaryContactId: contacts.find((contact) => contact.isPrimary)!.id,
      activity: contactId ? activity.filter((row) => row.contactId === contactId) : activity,
      unattributedActivityCount: activity.filter((row) => !row.contactId).length, phoneReadiness: readiness(prospectId) };
  };
  let startFailures = options.startFailures || 0;
  let confirmFailures = options.confirmFailures || 0;
  let lostConfirmationResponses = options.lostConfirmationResponses || 0;
  let discardFailures = options.discardFailures || 0;
  let lostContactSaveResponses = options.lostContactSaveResponses || 0;
  const progress = () => ({
    startedToday: [...sessions.keys()].filter((id) => !discarded.has(id)).length,
    confirmedToday: confirmed.size,
    connectedToday: [...confirmed].filter((id) => confirmations.find((payload) => payload.clientEventId === id)?.outcome === 'contacted').length,
  });

  await page.addInitScript(() => {
    localStorage.setItem('demo-mode', 'true');
    (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs = [];
    (window as Window & { __callingMailHrefs?: string[] }).__callingMailHrefs = [];
    // Preserve React handlers while preventing native phone or email-app launch.
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="tel:"], a[href^="mailto:"]') : null;
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      if (href.startsWith('mailto:')) (window as Window & { __callingMailHrefs?: string[] }).__callingMailHrefs?.push(href);
      else (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs?.push(href);
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
  if (options.callsPerDay !== undefined || options.map) {
    // Exercise the actual profile query with synthetic local identity and goal;
    // the normal demo AuthContext intentionally disables profile loading.
    await page.route(/\/src\/contexts\/AuthContext\.tsx(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'const user={id:"demo-user",email:"calling-broker@example.test"}; export const useAuth=()=>({user,session:{user},loading:false,needsOnboarding:false,isDemoMode:false,signOut:async()=>{}}); export const AuthProvider=({children})=>children;',
    }));
  }
  if (options.map) {
    await page.route(/\/src\/lib\/supabase\.ts(?:\?|$)/, (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const supabase = null;' }));
    await page.route(/\/node_modules\/\.vite\/deps\/@react-google-maps_api\.js(?:\?|$)/, (route) => route.fulfill({ contentType: 'application/javascript', body: inertMapModule }));
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) apiWrites.push({ method, path, body: request.postData() });
    if (path === '/api/auth/demo/user') {
      return json(route, { id: 'demo-user', email: 'calling-broker@example.test', firstName: 'Calling', lastName: 'Broker' });
    }
    if (options.map && path === '/api/prospects' && method === 'GET') return json(route, mapProspects());
    const mapRecordMatch = /^\/api\/prospects\/([^/]+)$/.exec(path);
    if (options.map && mapRecordMatch && method === 'PATCH') {
      const contacts = roster.get(mapRecordMatch[1]);
      if (!contacts) return json(route, { message: 'Record is not owned by this synthetic broker' }, 403);
      const payload = request.postDataJSON();
      const primary = contacts.find((contact) => contact.isPrimary)!;
      for (const [field, key] of [['contactName', 'name'], ['contactCompany', 'company'], ['contactEmail', 'email'], ['contactPhone', 'phone']] as const) {
        if (Object.hasOwn(payload, field)) (primary as any)[key] = payload[field];
      }
      return json(route, { ...mapProspects().find((record) => record.id === mapRecordMatch[1]), ...payload, newXpGained: 0 });
    }
    if (options.map && path === '/api/intel/brokerage-memory/map' && method === 'GET') return json(route, { anchors: [], linkedProspectIds: [] });
    if (options.map && path === '/api/interactions' && method === 'GET') {
      const id = new URL(request.url()).searchParams.get('prospectId');
      return json(route, (history.get(id || '') || []).map((row) => ({ ...row, date: row.occurredAt, sourceProvider: 'calling_test_fixture' })));
    }
    if (options.map && path === '/api/broker-actions/log-activity' && method === 'POST') {
      legacyCallWrites.push(request.postDataJSON());
      return json(route, { message: 'Legacy call logger must not run from the map calling control' }, 409);
    }
    if (path === '/api/calling/queue') {
      queueReads.push(request.url());
      const confirmedProspects = new Set([...sessions.values()].filter((session) => confirmed.has(session.clientEventId)).map((session) => session.prospectId));
      const includeCalledToday = new URL(request.url()).searchParams.get('includeCalledToday') === 'true';
      const rows = candidates.filter((candidate) => readiness(candidate.prospect.id).status === 'ready' && (includeCalledToday || !confirmedProspects.has(candidate.prospect.id)))
        .map((candidate) => { const phoneReadiness=readiness(candidate.prospect.id); const choice=phoneReadiness.usableChoices[0]; const contact=roster.get(candidate.prospect.id)!.find(contact=>contact.id===choice.contactId)!; return { ...candidate, contact: {...contact,phone:choice.number,phoneType:choice.phoneType}, phoneReadiness }; });
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
    if (path === '/api/calling/needs-number' && method === 'GET') {
      needsNumberReads.push(request.url());
      const rows = candidates.filter((candidate) => readiness(candidate.prospect.id).status === 'needs_number').map((candidate) => ({
        prospect: candidate.prospect, company: candidate.contact.company, contactName: candidate.contact.name,
        priorityScore: candidate.priorityScore, priority: candidate.priority, reasons: candidate.reasons,
        phoneReadiness: readiness(candidate.prospect.id), pendingCall: false, expectedSnapshotToken: 'local-only',
      }));
      rows.push({ prospect: { ...candidates[0].prospect, id: 'needs-number-prospect', name: 'Needs Number Company' }, company: 'Needs Number Company', contactName: 'Unreached local contact', priorityScore: 70, priority: 'high', reasons: ['Follow-up overdue'],
        phoneReadiness: { ...readiness(candidates[0].prospect.id), status: 'needs_number', reason: 'no_number', usableChoices: [], blockedChoices: [], preferredContactId: null, preferredPhoneKey: null, researchEligible: false,
          lastResearch: { status: 'not_found', attemptedAt: '2026-10-08T18:00:00.000Z', retryAt: '2099-10-15T18:00:00.000Z' } }, pendingCall: false, expectedSnapshotToken: 'local-only' });
      return json(route, { rows, total: rows.length, eligibleNow: rows.filter((row) => row.phoneReadiness.researchEligible).length });
    }
    const workspaceMatch = /^\/api\/calling\/prospects\/([^/]+)\/workspace$/.exec(path);
    if (workspaceMatch && method === 'GET') {
      workspaceReads.push(request.url());
      const contactId = new URL(request.url()).searchParams.get('contactId');
      if (!contactId && options.workspaceDelayMs) await new Promise((resolve) => setTimeout(resolve, options.workspaceDelayMs));
      if (contactId && options.selectedHistoryDelayMs) await new Promise((resolve) => setTimeout(resolve, options.selectedHistoryDelayMs));
      return json(route, workspace(workspaceMatch[1], contactId));
    }
    const contactsMatch = /^\/api\/calling\/prospects\/([^/]+)\/contacts(?:\/([^/]+))?$/.exec(path);
    if (options.map && path === '/api/agent/phone-enrichment/batch' && method === 'POST') {
      const payload = request.postDataJSON();
      enrichmentWrites.push(payload);
      mutationSequence.push('number-save-request');
      await contactSaveGate;
      const entry = payload.entries[0];
      const contacts = roster.get(entry.prospectId);
      if (!contacts) return json(route, { message: 'Record is not owned by this synthetic broker' }, 403);
      const primary = contacts.find((contact) => contact.isPrimary)!;
      const expected = { name: primary.name || null, email: primary.email || null, phone: primary.phone || null };
      let saved: TestContact | undefined;
      let status = 'unchanged';
      if (entry.phoneEvidence.kind === 'company_main') {
        saved = contacts.find((contact) => !contact.isPrimary && contact.name === 'Company main line' && parseBusinessPhone(contact.phone)?.phoneKey === parseBusinessPhone(entry.contactPhone)?.phoneKey);
      } else saved = contacts.find((contact) => contact.id === entry.contactId && parseBusinessPhone(contact.phone)?.phoneKey === parseBusinessPhone(entry.contactPhone)?.phoneKey);
      if (!saved && !(['name', 'email', 'phone'] as const).every((key) => entry.expectedContact?.[key] === expected[key])) return json(route, { applied: 0, unchanged: 0, needsReview: 1, errors: 0, results: [{ prospectId: entry.prospectId, status: 'needs_review', reason: 'contact_snapshot_changed' }] });
      if (!saved) {
        status = 'applied';
        if (entry.phoneEvidence.kind === 'company_main') {
          saved = { ...primary, id: `00000000-0000-4000-8000-${String(500 + contacts.length).padStart(12, '0')}`, isPrimary: false, name: 'Company main line', email: null, phone: parseBusinessPhone(entry.contactPhone)?.number || null, additionalPhones: [] };
          contacts.push(saved);
        } else {
          saved = contacts.find((contact) => contact.id === entry.contactId) || primary;
          saved.phone = parseBusinessPhone(entry.contactPhone)?.number || null;
        }
      }
      mutationSequence.push('number-save-ack');
      if (lostContactSaveResponses-- > 0) return json(route, { message: 'Local number-save acknowledgement lost after application' }, 503);
      return json(route, { applied: status === 'applied' ? 1 : 0, unchanged: status === 'unchanged' ? 1 : 0, needsReview: 0, errors: 0,
        results: [{ prospectId: entry.prospectId, status, reason: 'verified_phone', contactId: saved.id, evidence: entry.phoneEvidence }] });
    }
    if (contactsMatch && method === 'POST') {
      const payload = request.postDataJSON();
      contactWrites.push({ method, prospectId: contactsMatch[1], payload });
      mutationSequence.push('contact-save-request');
      await contactSaveGate;
      const contacts = roster.get(contactsMatch[1])!;
      contacts.push({ id: `00000000-0000-4000-8000-${String(500 + contacts.length).padStart(12, '0')}`, prospectId: contactsMatch[1], isPrimary: false, company: null, phone: null, email: null, title: null, additionalPhones: [], archivedAt: null, ...payload });
      mutationSequence.push('contact-save-ack');
      if (lostContactSaveResponses-- > 0) return json(route, { message: 'Local contact-save acknowledgement lost after creation' }, 503);
      return json(route, workspace(contactsMatch[1]), 201);
    }
    if (contactsMatch && method === 'PATCH') {
      const payload = request.postDataJSON();
      contactWrites.push({ method, prospectId: contactsMatch[1], contactId: contactsMatch[2], payload });
      mutationSequence.push('contact-save-request');
      await contactSaveGate;
      const contact = roster.get(contactsMatch[1])!.find((contact) => contact.id === contactsMatch[2])!;
      Object.assign(contact, payload);
      if (payload.archived) contact.archivedAt = new Date().toISOString();
      mutationSequence.push('contact-save-ack');
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
        if (payload.outcome === 'wrong_number' || payload.outcome === 'disconnected') {
          const choice = readiness(payload.prospectId).usableChoices.find((choice) => choice.contactId === session.contactId && choice.number === session.expectedPhone)!;
          blocks.set(payload.prospectId, [...(blocks.get(payload.prospectId) || []), { ...choice, reason: payload.outcome, eventId: `event-${payload.clientEventId}`, recordedAt: session.startedAt }]);
        }
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

  await page.goto(options.map ? '/app?prospectId=calling-prospect-1' : '/app/calls');
  if (options.map) {
    await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1', { timeout: 20_000 });
  } else {
    await expect(page.getByRole('heading', { name: 'Calls', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: options.mainLineOnly || options.missingEmailPrimary ? 'Call Vas Patel' : 'Call Morgan Lee', exact: true })).toBeVisible();
  }
  return { starts, confirmations, discards, sessions, progress, roster, workspace, readiness, mutationSequence, queueReads, needsNumberReads, workspaceReads, releaseStart, releaseContactSave, contactWrites, enrichmentWrites, legacyCallWrites, apiWrites, pageErrors, confirmOnServer: (clientEventId: string) => confirmed.add(clientEventId) };
}

async function dial(page: Page, name = 'Morgan Lee') {
  await page.getByRole('link', { name: `Call ${name}`, exact: true }).click();
}

function mapCalling(page: Page) {
  return page.locator('[aria-label="Map calling"]');
}

function pendingMapCall(page: Page) {
  return page.getByRole('region', { name: 'Pending map call', exact: true });
}

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate((value) => {
    window.history.pushState({}, '', value);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function dialHrefs(page: Page) {
  return page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs || []);
}

async function mailHrefs(page: Page) {
  return page.evaluate(() => (window as Window & { __callingMailHrefs?: string[] }).__callingMailHrefs || []);
}

function emailAction(page: Page, name: string, email: string) {
  return page.getByRole('link', { name: `Email ${name} at ${email}`, exact: true });
}

test('calling context selects each persons latest verified email subject and direction from unsorted history', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', touchHistory: true, selectedHistoryDelayMs: 600 });
  const context = page.getByRole('region', { name: 'Calling context', exact: true });
  await expect(context).toContainText('Last recorded touch · Morgan Lee');
  await expect(context).toContainText('Email sent');
  await expect(context).toContainText('Warehouse space update');
  await expect(context.locator('time')).toHaveAttribute('datetime', '2026-10-06T18:00:00.000Z');
  for (const excluded of ['Older warehouse check-in', 'Unsent draft subject', 'Internal team note', 'Unconfirmed send subject', 'Invalid timestamp subject', 'Provider capture provenance']) await expect(context).not.toContainText(excluded);
  await page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  await expect(page.getByText('Loading last touch…', { exact: true })).toBeVisible();
  await expect(context).toHaveCount(0);
  await expect(context).toContainText('Last recorded touch · Rowan Singh');
  await expect(context).toContainText('Email received');
  await expect(context).toContainText('Re: Timing for the warehouse search');
  await expect(context).not.toContainText('Warehouse space update');
  await expect(context.locator('time')).toHaveAttribute('datetime', '2026-10-07T17:00:00.000Z');
  await context.screenshot({ path: `work/calling-playwright/context-${testInfo.project.name}-selected-touch.png` });
  expect(scenario.apiWrites).toEqual([]);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
});

test('calling context labels account fallback with the actual person and replaces it only after a saved selected-person call', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', touchHistory: true });
  await page.getByRole('button', { name: 'Select contact Casey Davis', exact: true }).click();
  const context = page.getByRole('region', { name: 'Calling context', exact: true });
  await expect(context).toContainText('No touch recorded for this contact yet.');
  await expect(context).toContainText('Latest account activity · Rowan Singh');
  await expect(context).toContainText('Email received');
  await expect(context).toContainText('Re: Timing for the warehouse search');
  await expect(context).not.toContainText('Last recorded touch');
  await expect(context).not.toContainText('Casey Davis');
  await page.getByRole('region', { name: 'Current call', exact: true }).screenshot({ path: `work/calling-playwright/context-${testInfo.project.name}-company-fallback.png` });
  expect(scenario.apiWrites).toEqual([]);
  await dial(page, 'Casey Davis');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(context).toContainText('Latest account activity · Rowan Singh');
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  const note = 'Asked to call back after their lease review.';
  await page.getByRole('textbox').fill(note);
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(context).toContainText('Last recorded touch · Casey Davis');
  await expect(context).toContainText('Call attempted');
  await expect(context).toContainText(note);
  await expect(context).not.toContainText('Latest account activity');
  await expect(context).not.toContainText('Rowan Singh');
  await context.screenshot({ path: `work/calling-playwright/context-${testInfo.project.name}-saved-call.png` });
  expect(scenario.starts).toHaveLength(1); expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ contactId: scenario.roster.get('calling-prospect-1')![2].id, notes: note });
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
});

test('calling context recovers a frozen pending person without displaying the primary history while loading', async ({ page }) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', touchHistory: true, selectedHistoryDelayMs: 900 });
  await page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  const context = page.getByRole('region', { name: 'Calling context', exact: true });
  await expect(context).toContainText('Last recorded touch · Rowan Singh');
  await dial(page, 'Rowan Singh');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  const firstKey = scenario.starts[0].clientEventId;
  const beforeReloadReads = scenario.workspaceReads.length;
  await page.reload();
  await expect(page.getByText('Loading last touch…', { exact: true })).toBeVisible();
  await expect(context).toHaveCount(0);
  await expect(context).toContainText('Last recorded touch · Rowan Singh');
  await expect(context).toContainText('Email received');
  await expect(context).toContainText('Re: Timing for the warehouse search');
  await expect(context).not.toContainText('Warehouse space update');
  const selectedReads = scenario.workspaceReads.slice(beforeReloadReads).map((url) => new URL(url).searchParams.get('contactId')).filter(Boolean);
  expect(selectedReads.length).toBeGreaterThan(0);
  expect(new Set(selectedReads)).toEqual(new Set([scenario.roster.get('calling-prospect-1')![1].id]));
  await expect(page.getByRole('button', { name: 'Select contact Morgan Lee', exact: true })).toBeDisabled();
  expect(scenario.starts).toHaveLength(2);
  expect(scenario.starts[1].clientEventId).toBe(firstKey);
  expect(scenario.confirmations).toHaveLength(0); expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 0 });
});

test('calling email switches with the selected person and has no activity, credit or queue effects', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', callsPerDay: 10 });
  const morgan = emailAction(page, 'Morgan Lee', contactEmails.morgan);
  await expect(morgan).toHaveAttribute('href', 'mailto:morgan.lee%2Bcre@calling.example.test');
  await expect(morgan).toHaveAttribute('title', 'Opens your default email app');
  await expect(morgan).toHaveText(contactEmails.morgan);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `work/calling-playwright/email-${testInfo.project.name}-ready.png` });
  await morgan.click();
  await page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  await expect(morgan).toHaveCount(0);
  const rowan = emailAction(page, 'Rowan Singh', contactEmails.rowan);
  await expect(rowan).toHaveAttribute('href', 'mailto:rowan.singh@calling.example.test');
  await rowan.click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select contact Casey Davis', exact: true }).click();
  await expect(page.getByText('No email saved for this contact', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current call', exact: true }).locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.getByTestId('calls-started-today')).toHaveText('0');
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('0');
  await expect(page.getByRole('progressbar', { name: 'Daily call target', exact: true })).toHaveAttribute('aria-valuenow', '0');
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0, connectedToday: 0 });
  expect(scenario.apiWrites).toEqual([]);
  expect(await dialHrefs(page)).toEqual([]);
  expect(await mailHrefs(page)).toEqual(['mailto:morgan.lee%2Bcre@calling.example.test', 'mailto:rowan.singh@calling.example.test']);
});

test('calling email retains the frozen pending person address across a roster change and reload', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', callsPerDay: 10 });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  const initialKey = scenario.starts[0].clientEventId;
  const currentPrimary = scenario.roster.get('calling-prospect-1')![0];
  // The owned roster has a replacement identity, while the saved call still
  // belongs to the original contact snapshot and selected address.
  currentPrimary.id = '00000000-0000-4000-8000-000000000701';
  currentPrimary.email = 'morgan.current@calling.example.test';
  await page.reload();
  await expect.poll(() => scenario.mutationSequence.filter((step) => step === 'start-saved').length).toBe(2);
  const morgan = emailAction(page, 'Morgan Lee', contactEmails.morgan);
  await expect(morgan).toBeVisible();
  await expect(emailAction(page, 'Morgan Lee', currentPrimary.email)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeDisabled();
  const beforeEmail = scenario.apiWrites.length;
  await morgan.click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  expect(scenario.apiWrites).toHaveLength(beforeEmail);
  expect(scenario.starts).toHaveLength(2);
  expect(scenario.starts[1].clientEventId).toBe(initialKey);
  expect(scenario.confirmations).toHaveLength(0); expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 0, connectedToday: 0 });
  expect(await mailHrefs(page)).toEqual(['mailto:morgan.lee%2Bcre@calling.example.test']);
  await page.screenshot({ path: `work/calling-playwright/email-${testInfo.project.name}-pending.png` });
});

test('calling email never borrows the primary address for a pending contact with no email', async ({ page }) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'primary_only' });
  await page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  await expect(page.getByText('No email saved for this contact', { exact: true })).toBeVisible();
  await dial(page, 'Rowan Singh');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(page.getByText('No email saved for this contact', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current call', exact: true }).locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(scenario.starts[0].contactId).toBe(scenario.roster.get('calling-prospect-1')![1].id);
  expect([...scenario.sessions.values()][0].contactSnapshot?.email).toBeNull();
  expect(scenario.confirmations).toHaveLength(0); expect(scenario.discards).toHaveLength(0);
  expect(await mailHrefs(page)).toEqual([]);
  expect(scenario.apiWrites.map((request) => request.path)).toEqual(['/api/calling/starts']);
});

test('calling email after confirmed next and Previous uses the original contact without another call or credit', async ({ page }) => {
  const scenario = await installCallingScenario(page, { contactEmails: 'all', callsPerDay: 10 });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(emailAction(page, 'Vas Patel', contactEmails.vas)).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  const beforeEmail = scenario.apiWrites.length;
  await emailAction(page, 'Morgan Lee', contactEmails.morgan).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select contact Morgan Lee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  await expect(page.getByRole('progressbar', { name: 'Daily call target', exact: true })).toHaveAttribute('aria-valuenow', '1');
  expect(scenario.apiWrites).toHaveLength(beforeEmail);
  expect(scenario.starts).toHaveLength(1); expect(scenario.confirmations).toHaveLength(1); expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(await dialHrefs(page)).toEqual(['tel:+17805550100']);
  expect(await mailHrefs(page)).toEqual(['mailto:morgan.lee%2Bcre@calling.example.test']);
});

test('map call opens the canonical person number and gives credit only after confirmation without changing the map selection', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { map: true });
  const control = mapCalling(page);
  const call = control.getByRole('link', { name: 'Call Morgan Lee at (780) 555-0100', exact: true });
  await expect(call).toHaveAttribute('href', 'tel:+17805550100');
  // The inert map intentionally cannot initialize drawing tools. Let its known
  // loading receipt dismiss before capturing the real panel and call controls.
  await expect(page.getByText('Drawing tools are still loading', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `work/calling-playwright/map-${testInfo.project.name}-ready.png` });
  await call.click();
  const pending = pendingMapCall(page);
  await expect(pending).toContainText('Morgan Lee');
  await expect.poll(() => scenario.progress().startedToday).toBe(1);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress().confirmedToday).toBe(0);
  expect(scenario.starts[0]).toMatchObject({ prospectId: 'calling-prospect-1', contactId: scenario.roster.get('calling-prospect-1')![0].id, expectedPhone: phone });
  await expect(control.getByRole('button', { name: 'Call pending', exact: true })).toBeDisabled();
  await page.screenshot({ path: `work/calling-playwright/map-${testInfo.project.name}-started.png` });
  await pending.getByRole('button', { name: 'I called', exact: true }).click();
  await expect(pending).toHaveCount(0);
  await assertUnobscuredReward(page);
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1');
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ clientEventId: scenario.starts[0].clientEventId, prospectId: 'calling-prospect-1', outcome: 'attempted', contactId: scenario.starts[0].contactId, notes: '' });
  expect(scenario.confirmations[0]).not.toHaveProperty('nextFollowUp');
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(scenario.legacyCallWrites).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual(['tel:+17805550100']);
  expect(scenario.pageErrors).toEqual([]);
  await page.screenshot({ path: `work/calling-playwright/map-${testInfo.project.name}-confirmed.png` });
});

test('map target picker selects a different canonical person without dialing and freezes that target after the call click', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true });
  const control = mapCalling(page);
  await control.getByRole('button', { name: 'Calling options', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Call target', exact: true });
  const rowan = scenario.roster.get('calling-prospect-1')![1];
  const rowanChoice = scenario.readiness('calling-prospect-1').usableChoices.find((choice) => choice.contactId === rowan.id)!;
  await picker.selectOption(`${rowan.id}:${rowanChoice.phoneKey}`);
  expect(scenario.starts).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Call target', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1');
  await control.getByRole('link', { name: 'Call Rowan Singh at (780) 555-0102', exact: true }).click();
  await expect.poll(() => scenario.starts.length).toBe(1);
  expect(scenario.starts[0]).toMatchObject({ contactId: rowan.id, expectedPhone: '(780) 555-0102' });
  await expect(control.getByRole('button', { name: 'Calling options', exact: true })).toBeDisabled();
  await expect(pendingMapCall(page)).toContainText('Rowan Singh');
  await pendingMapCall(page).getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(pendingMapCall(page)).toHaveCount(0);
  await expect(control.getByRole('link', { name: 'Call Rowan Singh at (780) 555-0102', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(scenario.legacyCallWrites).toHaveLength(0);
});

test('map keeps company mainline as context while the email recipient needs a number', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true, mainLineOnly: true });
  const control = mapCalling(page);
  await expect(control.getByRole('button', { name: 'Add number', exact: true })).toBeVisible();
  await expect(control.getByRole('link', { name: /Call / })).toHaveCount(0);
  expect(scenario.readiness('calling-prospect-1').status).toBe('needs_number');
  expect(scenario.roster.get('calling-prospect-1')![1]).toMatchObject({ name: 'Company main line', phone: '(780) 555-0102' });
  expect(scenario.starts).toHaveLength(0); expect(scenario.confirmations).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual([]);
});

test('map requires explicit alternate selection when its emailed contact has no number and Calls deep link retains that contact', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true, missingEmailPrimary: true });
  const rows = scenario.roster.get('calling-prospect-1')!;
  rows.splice(2); // Only one other saved person is available.
  await navigateWithinApp(page, '/app/calls?prospectId=calling-prospect-1');
  await expect(page.getByRole('button', { name: 'Select contact Morgan Lee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Call Rowan Singh', exact: true })).toHaveCount(0);
  await navigateWithinApp(page, '/app?prospectId=calling-prospect-1');
  const control = mapCalling(page);
  await expect(control.getByRole('button', { name: 'Add number', exact: true })).toBeVisible();
  await expect(control.getByRole('link', { name: /Call / })).toHaveCount(0);
  await control.getByRole('button', { name: 'Calling options', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Call target', exact: true });
  await expect(picker).toHaveValue('');
  const alternate = scenario.readiness('calling-prospect-1').usableChoices[0];
  await picker.selectOption(rows[1].id + ':' + alternate.phoneKey);
  await page.keyboard.press('Escape');
  await control.getByRole('link', { name: 'Call Rowan Singh at (780) 555-0102', exact: true }).click();
  await expect.poll(() => scenario.starts.length).toBe(1);
  expect(scenario.starts[0]).toMatchObject({ contactId: rows[1].id, expectedPhone: '(780) 555-0102' });
  await expect(pendingMapCall(page)).toContainText('Rowan Singh');
  expect(scenario.confirmations).toHaveLength(0);
});

test('map company-line save acknowledges saved context without enabling a call or giving credit', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page, { map: true, missingPhone: true, delayedContactSave: true });
  const control = mapCalling(page);
  await expect(page.getByText('Drawing tools are still loading', { exact: true })).toBeHidden();
  await control.getByRole('button', { name: 'Add number', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a phone number', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Number type', exact: true })).toHaveValue('contact_direct');
  await dialog.getByRole('combobox', { name: 'Number type', exact: true }).selectOption('company_main');
  const enteredNumber = '+1 (780) 555-0123 ext. 47';
  await dialog.getByRole('textbox', { name: 'Phone number', exact: true }).fill(enteredNumber);
  await dialog.getByRole('button', { name: 'Save number', exact: true }).click();
  await expect.poll(() => scenario.enrichmentWrites.length).toBe(1);
  expect(scenario.enrichmentWrites[0].entries).toHaveLength(1);
  expect(scenario.enrichmentWrites[0].entries[0]).toMatchObject({ prospectId: 'calling-prospect-1', contactPhone: enteredNumber, expectedContact: { name: 'Morgan Lee', email: null, phone: null }, phoneEvidence: { kind: 'company_main', source: 'broker_confirmed', verified: true } });
  expect(scenario.enrichmentWrites[0].entries[0]).not.toHaveProperty('contactId');
  await expect(dialog.getByRole('textbox', { name: 'Phone number', exact: true })).toHaveValue(enteredNumber);
  await expect(dialog.getByRole('textbox', { name: 'Phone number', exact: true })).toBeDisabled();
  expect(scenario.starts).toHaveLength(0); expect(scenario.confirmations).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual([]);
  await page.screenshot({ path: `work/calling-playwright/map-${testInfo.project.name}-manual-number.png` });
  scenario.releaseContactSave();
  await expect(dialog).toHaveCount(0);
  const canonical = parseBusinessPhone(enteredNumber)!;
  await expect(control.getByRole('link', { name: /Call / })).toHaveCount(0);
  await expect(control.getByRole('button', { name: 'Add number', exact: true })).toBeVisible();
  expect(scenario.roster.get('calling-prospect-1')!).toHaveLength(2);
  expect(scenario.roster.get('calling-prospect-1')![0]).toMatchObject({ name: 'Morgan Lee', phone: null, isPrimary: true });
  expect(scenario.roster.get('calling-prospect-1')![1]).toMatchObject({ name: 'Company main line', phone: canonical.number });
  expect(scenario.starts).toHaveLength(0); expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress().confirmedToday).toBe(0);
  expect(await dialHrefs(page)).toEqual([]);
  expect(scenario.legacyCallWrites).toHaveLength(0);
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1');
});

test('map direct-number save binds the existing person and preserves an international number without giving call credit', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true, missingPhone: true });
  await mapCalling(page).getByRole('button', { name: 'Add number', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a phone number', exact: true });
  await dialog.getByRole('combobox', { name: 'Number type', exact: true }).selectOption('contact_direct');
  const contactId = scenario.roster.get('calling-prospect-1')![0].id;
  await dialog.getByRole('combobox', { name: 'Contact for this number', exact: true }).selectOption(contactId);
  const enteredNumber = '+44 20 7946 0123 ext 12';
  await dialog.getByRole('textbox', { name: 'Phone number', exact: true }).fill(enteredNumber);
  await dialog.getByRole('button', { name: 'Save number', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(scenario.enrichmentWrites[0].entries[0]).toMatchObject({ prospectId: 'calling-prospect-1', contactId, contactName: 'Morgan Lee', contactPhone: enteredNumber, expectedContact: { name: 'Morgan Lee', email: null, phone: null }, phoneEvidence: { kind: 'contact_direct', source: 'broker_confirmed', verified: true } });
  const canonical = parseBusinessPhone(enteredNumber)!;
  await expect(mapCalling(page).getByRole('link', { name: `Call Morgan Lee at ${canonical.number}`, exact: true })).toHaveAttribute('href', canonical.dialHref);
  expect(scenario.roster.get('calling-prospect-1')!).toHaveLength(1);
  expect(scenario.starts).toHaveLength(0); expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(await dialHrefs(page)).toEqual([]);
});

test('map uncertain number-save retry reuses frozen evidence and does not duplicate the company line', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true, missingPhone: true, lostContactSaveResponses: 1 });
  await mapCalling(page).getByRole('button', { name: 'Add number', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a phone number', exact: true });
  await dialog.getByRole('combobox', { name: 'Number type', exact: true }).selectOption('company_main');
  await dialog.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+1 780 555 0123 ext. 47');
  await dialog.getByRole('button', { name: 'Save number', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Phone number', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: 'Number type', exact: true })).toBeDisabled();
  expect(scenario.roster.get('calling-prospect-1')!).toHaveLength(2);
  expect(scenario.starts).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Retry saving number', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(scenario.enrichmentWrites).toHaveLength(2);
  expect(scenario.enrichmentWrites[1]).toEqual(scenario.enrichmentWrites[0]);
  expect(scenario.roster.get('calling-prospect-1')!).toHaveLength(2);
  expect(scenario.confirmations).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual([]);
});

test('map confirmation retry preserves the frozen outcome and note and credits once after a lost response', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true, lostConfirmationResponses: 1 });
  await mapCalling(page).getByRole('link', { name: 'Call Morgan Lee at (780) 555-0100', exact: true }).click();
  const pending = pendingMapCall(page);
  await expect(pending).toBeVisible();
  await pending.getByRole('button', { name: 'More call options', exact: true }).click();
  await pending.getByRole('textbox', { name: 'Note · optional', exact: true }).fill('Reached the company voicemail.');
  await pending.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(pending.getByRole('alert')).toBeVisible();
  await expect(pending.getByRole('textbox', { name: 'Note · optional', exact: true })).toBeDisabled();
  await expect(pending.getByRole('button', { name: 'Connected', exact: true })).toBeDisabled();
  await pending.getByRole('button', { name: 'Retry confirmation', exact: true }).click();
  await expect(pending).toHaveCount(0);
  expect(scenario.confirmations).toHaveLength(2);
  expect(scenario.confirmations[1]).toEqual(scenario.confirmations[0]);
  expect(scenario.confirmations[0]).toMatchObject({ outcome: 'no_answer', notes: 'Reached the company voicemail.', occurredAt: scenario.starts[0].callStartedAt });
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(await dialHrefs(page)).toEqual(['tel:+17805550100']);
  expect(scenario.legacyCallWrites).toHaveLength(0);
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1');
});

test('map pending call survives panel close, another selected prospect and Calls navigation without changing its frozen target', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true });
  await mapCalling(page).getByRole('link', { name: 'Call Morgan Lee at (780) 555-0100', exact: true }).click();
  await expect(pendingMapCall(page)).toBeVisible();
  await page.getByTestId('asset-profile').getByRole('button', { name: 'Save and close', exact: true }).first().click();
  await expect(page.getByTestId('asset-profile')).toHaveCount(0);
  await expect(pendingMapCall(page)).toContainText('Morgan Lee');
  await navigateWithinApp(page, '/app/desk');
  await navigateWithinApp(page, '/app?prospectId=calling-prospect-2');
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-2');
  await expect(mapCalling(page).getByRole('button', { name: 'Call pending', exact: true })).toBeDisabled();
  await expect(pendingMapCall(page)).toContainText('Calling Company 1');
  await navigateWithinApp(page, '/app/calls');
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(0); expect(scenario.discards).toHaveLength(0);
  await navigateWithinApp(page, '/app?prospectId=calling-prospect-2');
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-2');
  await expect(pendingMapCall(page)).toContainText('Morgan Lee');
  await pendingMapCall(page).getByRole('button', { name: 'I called', exact: true }).click();
  await expect(pendingMapCall(page)).toHaveCount(0);
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-2');
  await expect(mapCalling(page).getByRole('link', { name: 'Call Vas Patel at (780) 555-0100', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(1); expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0].prospectId).toBe('calling-prospect-1');
  expect(scenario.legacyCallWrites).toHaveLength(0);
  expect(await dialHrefs(page)).toEqual(['tel:+17805550100']);
});

test('map wrong-number confirmation blocks only the frozen number and prepares another usable choice without dialing', async ({ page }) => {
  const scenario = await installCallingScenario(page, { map: true });
  await mapCalling(page).getByRole('link', { name: 'Call Morgan Lee at (780) 555-0100', exact: true }).click();
  await pendingMapCall(page).getByRole('button', { name: 'More call options', exact: true }).click();
  await pendingMapCall(page).getByRole('button', { name: 'Wrong number', exact: true }).click();
  await expect(pendingMapCall(page)).toHaveCount(0);
  await expect(mapCalling(page).getByRole('link', { name: 'Call Morgan Lee at (780) 555-0101', exact: true })).toHaveAttribute('href', 'tel:+17805550101');
  await expect(page.getByTestId('asset-profile')).toHaveAttribute('data-asset-id', 'calling-prospect-1');
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ outcome: 'wrong_number', contactId: scenario.starts[0].contactId, expectedPhone: phone });
  expect(scenario.readiness('calling-prospect-1').blockedChoices).toHaveLength(1);
  expect(scenario.readiness('calling-prospect-1').usableChoices).toHaveLength(4);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(await dialHrefs(page)).toEqual(['tel:+17805550100']);
  expect(scenario.legacyCallWrites).toHaveLength(0);
});

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

test('company main line remains saved context and never makes the email recipient callable', async ({ page }) => {
  const scenario = await installCallingScenario(page, { mainLineOnly: true });
  expect(scenario.readiness('calling-prospect-1').status).toBe('needs_number');
  const target=page.getByRole('region',{name:'Needs a number',exact:true}).getByRole('listitem').filter({hasText:'Calling Company 1'});
  await expect(target).toContainText('Morgan Lee');await expect(target).toContainText('Contact mobile or direct office number needed');
  await target.getByRole('button',{name:'Review number',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Calling Company 1',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Select contact Company main line',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Call Company main line',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Call Morgan Lee',exact:true})).toHaveCount(0);
  expect(scenario.starts).toHaveLength(0);expect(scenario.confirmations).toHaveLength(0);
});

test('missing email recipient stays selected until broker explicitly chooses a named alternate', async ({ page }) => {
  const scenario=await installCallingScenario(page,{missingEmailPrimary:true});
  const target=page.getByRole('region',{name:'Needs a number',exact:true}).getByRole('listitem').filter({hasText:'Calling Company 1'});
  await expect(target).toContainText('Email contact needs a number');await target.getByRole('button',{name:'Review number',exact:true}).click();
  await expect(page.getByRole('button',{name:'Select contact Morgan Lee',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('link',{name:'Call Rowan Singh',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Call Morgan Lee',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Select contact Rowan Singh',exact:true}).click();await expect(page.getByRole('link',{name:'Call Rowan Singh',exact:true})).toBeVisible();
  expect(scenario.starts).toHaveLength(0);await dial(page,'Rowan Singh');await expect.poll(()=>scenario.starts.length).toBe(1);
  expect(scenario.starts[0]).toMatchObject({contactId:scenario.roster.get('calling-prospect-1')![1].id,expectedPhone:'(780) 555-0102'});
});

test('named email contact mobile is prepared ahead of its office number with exact person attribution', async ({ page }) => {
  const scenario=await installCallingScenario(page,{mobileFirst:true});
  expect(scenario.readiness('calling-prospect-1').usableChoices.slice(0,2).map(choice=>choice.phoneType)).toEqual(['mobile','office']);
  await expect(page.getByRole('link',{name:'Call Morgan Lee',exact:true})).toHaveAttribute('href','tel:+17805550101');
  const options=page.getByRole('combobox',{name:'Phone number for Morgan Lee',exact:true});await expect(options).toHaveValue('7805550101:');
  await dial(page);await expect.poll(()=>scenario.starts.length).toBe(1);
  expect(scenario.starts[0]).toMatchObject({contactId:scenario.roster.get('calling-prospect-1')![0].id,expectedPhone:'(780) 555-0101'});
  expect(scenario.confirmations).toHaveLength(0);
});

test('needs-number list keeps due priority and actual research status visible on Calls and Desk', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page);
  const list = page.getByRole('region', { name: 'Needs a number', exact: true });
  await expect(list).toContainText('Needs Number Company');
  await expect(list).toContainText('Unreached local contact');
  await expect(list).toContainText('Follow-up overdue');
  await expect(list).toContainText('Number not found');
  await expect(list).toContainText('Next check');
  await expect(list.getByRole('link', { name: 'View record', exact: true })).toHaveAttribute('href', '/app?prospectId=needs-number-prospect');
  await page.screenshot({ path: `work/calling-playwright/phone-readiness-${testInfo.project.name}-calls.png`, fullPage: true });
  await page.goto('/app/desk');
  await expect(list).toContainText('Needs Number Company');
  await expect(list).toContainText('Number not found');
  await expect(list.getByRole('link', { name: 'View record', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await list.screenshot({ path: `work/calling-playwright/phone-readiness-${testInfo.project.name}-desk-list.png` });
  expect(scenario.starts).toHaveLength(0); expect(scenario.confirmations).toHaveLength(0);
});

test('wrong-number confirmation blocks the exact choice and prepares the same persons alternate without dialing', async ({ page }, testInfo) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Wrong number', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toHaveAttribute('href', 'tel:+17805550101');
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Phone number for Morgan Lee', exact: true });
  await expect(picker).toHaveValue('7805550101:');
  await expect(picker.locator('option').filter({ hasText: 'Wrong number' })).toBeDisabled();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(scenario.confirmations[0]).toMatchObject({ outcome: 'wrong_number', expectedPhone: phone, contactId: scenario.roster.get('calling-prospect-1')![0].id });
  expect(scenario.progress()).toEqual({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(scenario.starts).toHaveLength(1);
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
  await page.screenshot({ path: `work/calling-playwright/phone-readiness-${testInfo.project.name}-alternate-ready.png`, fullPage: true });
});

test('disconnected final number advances company and enters needs-number without removing its history', async ({ page }) => {
  const scenario = await installCallingScenario(page, { noAlternates: true });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnected', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  const list = page.getByRole('region', { name: 'Needs a number', exact: true });
  await expect(list).toContainText('Calling Company 1');
  await expect(list).toContainText('Disconnected number reported');
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check phone number', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Account activity', exact: true })).toContainText('disconnected');
  expect(scenario.starts).toHaveLength(1); expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.progress().connectedToday).toBe(0);
});

test('failed bad-number confirmation preserves frozen target and recovery phone across refresh and retry', async ({ page }) => {
  const scenario = await installCallingScenario(page, { confirmFailures: 1 });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Wrong number', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recording failed');
  expect(scenario.readiness('calling-prospect-1').blockedChoices).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'I called · next', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toHaveAttribute('href', 'tel:+17805550101');
  expect(scenario.confirmations).toHaveLength(2); expect(scenario.confirmations[1]).toEqual(scenario.confirmations[0]);
  expect(new Set(scenario.starts.map((item) => item.clientEventId)).size).toBe(1);
  expect(scenario.progress()).toEqual({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
});

test('confirmed bad-number replay keeps alternate intent while its workspace is still loading', async ({ page }) => {
  const scenario = await installCallingScenario(page, { lostConfirmationResponses: 1, workspaceDelayMs: 800 });
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Wrong number', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recording failed');
  expect(scenario.progress().confirmedToday).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toHaveAttribute('href', 'tel:+17805550101');
  await expect(page.getByRole('combobox', { name: 'Phone number for Morgan Lee', exact: true }).locator('option').filter({ hasText: 'Wrong number' })).toBeDisabled();
  expect(scenario.confirmations).toHaveLength(1);
  expect(new Set(scenario.starts.map((item) => item.clientEventId)).size).toBe(1);
  expect(scenario.progress()).toEqual({ startedToday: 1, confirmedToday: 1, connectedToday: 0 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual([]);
});

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
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
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
  await expect(currentCall.getByRole('link', { name: 'View record', exact: true })).toHaveAttribute('href', '/app?prospectId=calling-prospect-1');
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
  await number.selectOption(parseBusinessPhone('(780) 555-0101')!.phoneKey);
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
  await expect(page.getByRole('combobox', { name: 'Phone number for New local contact', exact: true })).toHaveValue(parseBusinessPhone('(780) 555-0110')!.phoneKey);
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
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
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
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
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

test('skip advances A to B to C and deferred companies stay out after a queue refresh', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  const nextCompanies = page.getByRole('region', { name: 'Next companies', exact: true });
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 2', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(nextCompanies.getByRole('button', { name: 'Select company Calling Company 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 3', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  for (const company of [1, 2]) await expect(nextCompanies.getByRole('button', { name: `Select company Calling Company ${company}`, exact: true })).toHaveCount(0);
  const readsBeforeRefresh = scenario.queueReads.length;
  await page.getByRole('button', { name: 'Refresh call queue', exact: true }).click();
  await expect.poll(() => scenario.queueReads.length).toBeGreaterThan(readsBeforeRefresh);
  await expect(page.getByRole('heading', { name: 'Calling Company 3', exact: true })).toBeVisible();
  for (const company of [1, 2]) await expect(nextCompanies.getByRole('button', { name: `Select company Calling Company ${company}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Alex Rivera', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(0);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual([]);
});

test('Previous returns skipped companies with their selected contact and number without dialing', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  const number = page.getByRole('combobox', { name: 'Phone number for Morgan Lee', exact: true });
  await number.selectOption(parseBusinessPhone('(780) 555-0101')!.phoneKey);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  await expect(number).toHaveValue(parseBusinessPhone('(780) 555-0101')!.phoneKey);
  await page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Alex Rivera', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Rowan Singh', exact: true })).toHaveAttribute('href', 'tel:+17805550102');
  await expect(page.getByRole('button', { name: 'Select contact Rowan Singh', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeDisabled();
  expect(scenario.starts).toHaveLength(0);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual([]);
});

test('Previous returns a confirmed company with its saved history without another call or credit', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox').fill('Confirmed this company exactly once.');
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Account activity', exact: true }).getByText('Confirmed this company exactly once.', { exact: true })).toBeVisible();
  const readsBeforeRefresh = scenario.queueReads.length;
  await page.getByRole('button', { name: 'Refresh call queue', exact: true }).click();
  await expect.poll(() => scenario.queueReads.length).toBeGreaterThan(readsBeforeRefresh);
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
});

test('pending calls clearly block Previous, Skip and queue navigation until resolved', async ({ page }) => {
  const scenario = await installCallingScenario(page, { delayedStart: true });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeEnabled();
  await dial(page, 'Vas Patel');
  await expect.poll(() => scenario.starts.length).toBe(1);
  await expect(page.getByText('Saving call start...', { exact: true })).toBeVisible();
  await expect(page.getByText('Log this call or choose Didn’t call before changing companies.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select company Calling Company 3', exact: true })).toBeDisabled();
  const readsBeforeRefresh = scenario.queueReads.length;
  await page.getByRole('button', { name: 'Refresh call queue', exact: true }).click();
  await expect.poll(() => scenario.queueReads.length).toBeGreaterThan(readsBeforeRefresh);
  await expect(page.getByRole('heading', { name: 'Calling Company 2', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(0);
  scenario.releaseStart();
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.discards).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
});

test('unsaved notes and follow-up options reset before calling another company', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await dial(page);
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByRole('textbox').fill('Unsaved note belongs only to company one.');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tomorrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: "Didn't call", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await dial(page, 'Vas Patel');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a note', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'More options', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep existing', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tomorrow', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ prospectId: 'calling-prospect-2', outcome: 'attempted', notes: '' });
  expect(scenario.confirmations[0]).not.toHaveProperty('nextFollowUp');
  expect(scenario.discards).toHaveLength(1);
});

test('finishing a skipped pass offers an explicit revisit and Previous without automatic calls', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  for (let index = 0; index < candidates.length; index++) {
    await expect(page.getByRole('heading', { name: `Calling Company ${index + 1}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  const revisit = page.getByRole('button', { name: 'Revisit skipped companies', exact: true });
  await expect(revisit).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous company', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Sam Taylor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(revisit).toBeVisible();
  await revisit.click();
  await expect(page.getByRole('heading', { name: 'Calling Company 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  expect(scenario.starts).toHaveLength(0);
  expect(scenario.confirmations).toHaveLength(0);
  expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 0, confirmedToday: 0 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual([]);
});

test('a skipped company confirmed after Previous leaves the deferred count and explicit revisit queue', async ({ page }) => {
  const scenario = await installCallingScenario(page);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous company', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Vas Patel', exact: true })).toBeVisible();
  await dial(page, 'Vas Patel');
  await expect(page.getByText('Call started', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I called · next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  for (let index = 2; index < candidates.length; index++) {
    await expect(page.getByRole('heading', { name: `Calling Company ${index + 1}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  await expect(page.getByText('5 companies skipped for now.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  await page.getByRole('button', { name: 'Revisit skipped companies', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Morgan Lee', exact: true })).toBeVisible();
  const nextCompanies = page.getByRole('region', { name: 'Next companies', exact: true });
  await expect(nextCompanies.getByRole('button', { name: 'Select company Calling Company 2', exact: true })).toHaveCount(0);
  for (const company of [3, 4, 5, 6]) await expect(nextCompanies.getByRole('button', { name: `Select company Calling Company ${company}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Call Jim Carter', exact: true })).toBeVisible();
  await expect(page.getByTestId('calls-confirmed-today')).toHaveText('1');
  expect(scenario.starts).toHaveLength(1);
  expect(scenario.confirmations).toHaveLength(1);
  expect(scenario.confirmations[0]).toMatchObject({ prospectId: 'calling-prospect-2', outcome: 'attempted' });
  expect(scenario.discards).toHaveLength(0);
  expect(scenario.progress()).toMatchObject({ startedToday: 1, confirmedToday: 1 });
  expect(await page.evaluate(() => (window as Window & { __callingDialHrefs?: string[] }).__callingDialHrefs)).toEqual(['tel:+17805550100']);
});
