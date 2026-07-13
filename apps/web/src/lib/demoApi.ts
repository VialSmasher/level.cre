type DemoApiResult = {
  handled: boolean
  payload: unknown
  status?: number
}

const now = new Date()
const isoDaysAgo = (days: number) => new Date(now.getTime() - (days * 86_400_000)).toISOString()

const prospects = [
  {
    id: 'demo-prospect-10735',
    userId: 'demo-user',
    name: '10735 214 St NW',
    status: 'contacted',
    notes: 'Active buyer conversation. Confirm the decision path and next commitment.',
    geometry: { type: 'Point', coordinates: [-113.6901, 53.5512] },
    createdDate: isoDaysAgo(45),
    lastContactDate: isoDaysAgo(1),
    followUpTimeframe: '1_month',
    followUpDueDate: isoDaysAgo(0),
    contactName: 'Morgan Lee',
    contactEmail: 'morgan@example.test',
    contactCompany: 'West End Distribution',
    businessName: 'West End Distribution',
    buildingSf: 28500,
  },
  {
    id: 'demo-prospect-2959',
    userId: 'demo-user',
    name: '2959 Parsons Road NW',
    status: 'contacted',
    notes: 'Tour is waiting on access confirmation.',
    geometry: { type: 'Point', coordinates: [-113.4897, 53.4601] },
    createdDate: isoDaysAgo(30),
    lastContactDate: isoDaysAgo(3),
    followUpTimeframe: '1_month',
    followUpDueDate: isoDaysAgo(0),
    contactName: 'Vas Patel',
    contactEmail: 'vas@example.test',
    contactCompany: 'South Edmonton Industrial',
    businessName: 'South Edmonton Industrial',
    buildingSf: 12000,
  },
  {
    id: 'demo-prospect-14840',
    userId: 'demo-user',
    name: '14840 134 Ave NW',
    status: 'listing',
    notes: 'Active listing farm and owner outreach campaign.',
    geometry: { type: 'Point', coordinates: [-113.5752, 53.6001] },
    createdDate: isoDaysAgo(120),
    lastContactDate: isoDaysAgo(5),
    contactName: 'Jim Carter',
    contactEmail: 'jim@example.test',
    contactCompany: 'Northwest Industrial Holdings',
    buildingSf: 24000,
  },
  {
    id: 'demo-prospect-border',
    userId: 'demo-user',
    name: 'Border Site',
    status: 'prospect',
    notes: 'Drive-by lead. Ownership contact still needs to be confirmed.',
    geometry: { type: 'Point', coordinates: [-113.6415, 53.5668] },
    createdDate: isoDaysAgo(12),
    followUpTimeframe: '1_month',
  },
  {
    id: 'demo-prospect-16520',
    userId: 'demo-user',
    name: '16520 111 Ave NW',
    status: 'development',
    notes: 'Team pursuit owned by Jack. Monitor and mentor rather than lead.',
    geometry: { type: 'Point', coordinates: [-113.6095, 53.5596] },
    createdDate: isoDaysAgo(60),
    lastContactDate: isoDaysAgo(4),
    contactName: 'Jack Norris',
    contactEmail: 'jack@example.test',
    contactCompany: 'Level CRE Team',
  },
]

const submarkets = [
  { id: 'demo-submarket-west', userId: 'demo-user', name: 'West Edmonton', color: '#2563eb', isActive: 'true' },
  { id: 'demo-submarket-northwest', userId: 'demo-user', name: 'Northwest Edmonton', color: '#059669', isActive: 'true' },
  { id: 'demo-submarket-south', userId: 'demo-user', name: 'South Edmonton', color: '#ea580c', isActive: 'true' },
  { id: 'demo-submarket-nisku', userId: 'demo-user', name: 'Nisku / Leduc', color: '#7c3aed', isActive: 'true' },
]

const interactions = [
  {
    id: 'demo-interaction-1',
    userId: 'demo-user',
    prospectId: 'demo-prospect-10735',
    date: isoDaysAgo(1),
    type: 'email',
    outcome: 'follow_up_later',
    notes: 'Buyer asked to discuss timing and the next step.',
    nextFollowUp: isoDaysAgo(0),
    sourceProvider: 'codex',
    sourceMessageId: 'demo-message-10735',
  },
  {
    id: 'demo-interaction-2',
    userId: 'demo-user',
    prospectId: 'demo-prospect-2959',
    date: isoDaysAgo(3),
    type: 'email',
    outcome: 'scheduled_meeting',
    notes: 'Tour timing proposed; property access still needs confirmation.',
    nextFollowUp: isoDaysAgo(0),
    sourceProvider: 'outlook',
    sourceMessageId: 'demo-message-2959',
  },
  {
    id: 'demo-interaction-3',
    userId: 'demo-user',
    prospectId: 'demo-prospect-14840',
    date: isoDaysAgo(5),
    type: 'call',
    outcome: 'contacted',
    notes: 'Spoke with Jim about current listing activity.',
    sourceProvider: 'manual',
  },
  {
    id: 'demo-interaction-4',
    userId: 'demo-user',
    prospectId: 'demo-prospect-16520',
    date: isoDaysAgo(4),
    type: 'meeting',
    outcome: 'contacted',
    notes: 'Reviewed pursuit progress with Jack.',
    sourceProvider: 'manual',
  },
]

const requirements = [
  {
    id: 'demo-requirement-1',
    userId: 'demo-user',
    title: 'West Edmonton distribution requirement',
    source: 'Direct',
    location: 'West Edmonton',
    contactName: 'Morgan Lee',
    contactEmail: 'morgan@example.test',
    contactPhone: '',
    spaceSize: '25,000 - 50,000 SF',
    timeline: '1_3_months',
    status: 'active',
    tags: ['tenant', 'distribution'],
    notes: 'Prioritize functional loading and quick possession.',
    createdAt: isoDaysAgo(18),
    updatedAt: isoDaysAgo(1),
  },
  {
    id: 'demo-requirement-2',
    userId: 'demo-user',
    title: 'South Edmonton service industrial search',
    source: 'Referral',
    location: 'South Edmonton',
    contactName: 'Taylor Chen',
    contactEmail: 'taylor@example.test',
    contactPhone: '',
    spaceSize: '10,000 - 25,000 SF',
    timeline: '3_6_months',
    status: 'active',
    tags: ['tenant', 'service industrial'],
    notes: 'Needs office, yard potential, and transit access.',
    createdAt: isoDaysAgo(9),
    updatedAt: isoDaysAgo(2),
  },
]

const listings = [
  {
    id: 'demo-listing-14840',
    userId: 'demo-user',
    title: '14840 134 Ave Listing Farm',
    address: '14840 134 Ave NW, Edmonton, AB',
    lat: '53.6001',
    lng: '-113.5752',
    submarket: 'Northwest Edmonton',
    dealType: 'lease',
    size: '24000',
    price: null,
    createdAt: isoDaysAgo(30),
    archivedAt: null,
    prospectCount: 18,
  },
  {
    id: 'demo-listing-parsons',
    userId: 'demo-user',
    title: '2959 Parsons Requirement',
    address: '2959 Parsons Road NW, Edmonton, AB',
    lat: '53.4601',
    lng: '-113.4897',
    submarket: 'South Edmonton',
    dealType: 'lease',
    size: '12000',
    price: null,
    createdAt: isoDaysAgo(14),
    archivedAt: null,
    prospectCount: 7,
  },
]

const sharedListings = [
  {
    id: 'demo-listing-jack',
    userId: 'demo-user-jack',
    title: '16520 111 Ave',
    address: '16520 111 Ave NW, Edmonton, AB',
    ownerName: 'Jack Norris',
    ownerEmail: 'jack@example.test',
    memberRole: 'viewer',
    createdAt: isoDaysAgo(20),
    archivedAt: null,
    prospectCount: 5,
  },
]

const actions = [
  {
    id: 'demo-action-10735',
    type: 'follow_up_due',
    priority: 'critical',
    priorityScore: 98,
    title: 'Advance 10735 214 St',
    reason: 'This is the strongest live revenue opportunity and the buyer thread is active.',
    suggestedAction: 'Call the buyer, confirm the decision path, and push toward an offer or tour commitment.',
    source: 'outlook',
    dueAt: isoDaysAgo(1),
    prospect: {
      id: 'demo-prospect-10735',
      name: 'West End Distribution',
      address: '10735 214 St NW, Edmonton, AB',
      contactName: 'Morgan Lee',
      contactEmail: 'morgan@example.test',
      listingTitles: [],
    },
    automationHints: {
      stage: 'active_work',
      participantEmails: ['morgan@example.test'],
      propertyMentions: ['10735 214 St'],
      dealTerms: ['tour', 'offer'],
    },
  },
  {
    id: 'demo-action-2959',
    type: 'outlook_signal',
    priority: 'high',
    priorityScore: 88,
    title: 'Confirm access at 2959 Parsons',
    reason: 'The tour is waiting on property access confirmation.',
    suggestedAction: 'Confirm that Vas can open the property and send the tour time.',
    source: 'outlook',
    dueAt: isoDaysAgo(0),
    prospect: {
      id: 'demo-prospect-2959',
      name: 'South Edmonton Industrial',
      address: '2959 Parsons Road NW, Edmonton, AB',
      contactName: 'Vas Patel',
      contactEmail: 'vas@example.test',
      listingTitles: [],
    },
    automationHints: {
      stage: 'waiting_on_reply',
      participantEmails: ['vas@example.test'],
      propertyMentions: ['2959 Parsons'],
      dealTerms: ['tour access'],
    },
  },
  {
    id: 'demo-action-border',
    type: 'research_target',
    priority: 'medium',
    priorityScore: 62,
    title: 'Find the owner of the Border Site',
    reason: 'The property is mapped but no reachable ownership contact is attached.',
    suggestedAction: 'Pull title and add the owner contact.',
    source: 'level_cre',
    prospect: { id: 'demo-prospect-border', name: 'Border Site', address: 'Edmonton, AB' },
    automationHints: { stage: 'stale_work', propertyMentions: ['Border Site'] },
  },
]

const activitySeries = Array.from({ length: 28 }, (_, index) => {
  const date = new Date(now.getTime() - ((27 - index) * 86_400_000))
  const active = index % 3 !== 0
  const meeting = index % 7 === 0 ? 1 : 0
  return {
    date: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
    email: active ? 2 : 0,
    call: active ? 1 : 0,
    meeting,
    other: 0,
    total: (active ? 3 : 0) + meeting,
  }
})

let emailItems = [
  {
    id: 'demo-email-10735',
    matchStatus: 'pending_review',
    confidence: 0.97,
    matchReason: 'Matched by property address and participant email.',
    suggestedInteractionType: 'email',
    suggestedOutcome: 'follow_up_later',
    suggestedSummary: 'Buyer asked for the next step on 10735 214 St and is ready to discuss timing.',
    suggestedNextFollowUp: isoDaysAgo(-2),
    interactionId: null,
    email: {
      provider: 'codex',
      providerMessageId: 'demo-message-10735',
      providerThreadId: 'demo-thread-10735',
      direction: 'inbound',
      subject: 'Re: 10735 214 St - next steps',
      senderEmail: 'morgan@example.test',
      senderName: 'Morgan Lee',
      recipientEmails: ['broker@example.test'],
      sentAt: isoDaysAgo(1),
      receivedAt: isoDaysAgo(1),
      snippet: 'Can we talk through the next step and timing for the property?',
      attachmentNames: [],
      sourceUrl: '',
    },
    prospect: {
      id: 'demo-prospect-10735',
      name: '10735 214 St NW',
      address: '10735 214 St NW, Edmonton, AB',
      status: 'contacted',
      contactCompany: 'West End Distribution',
      businessName: 'West End Distribution',
    },
    listing: null,
  },
  {
    id: 'demo-email-unmatched',
    matchStatus: 'needs_context',
    confidence: 0.42,
    matchReason: 'No reliable company or property match yet.',
    suggestedInteractionType: 'email',
    suggestedOutcome: 'contacted',
    suggestedSummary: 'A new industrial requirement may need to be attached to a company.',
    suggestedNextFollowUp: null,
    interactionId: null,
    email: {
      provider: 'postmark',
      providerMessageId: 'demo-message-unmatched',
      providerThreadId: null,
      direction: 'outbound',
      subject: 'Edmonton industrial requirement',
      senderEmail: 'broker@example.test',
      senderName: 'Demo Broker',
      recipientEmails: ['newbuyer@example.test'],
      sentAt: isoDaysAgo(2),
      receivedAt: null,
      snippet: 'Following up on the west Edmonton requirement we discussed.',
      attachmentNames: [],
      sourceUrl: '',
    },
    prospect: null,
    listing: null,
  },
]

const skillActivities = [
  { id: 'demo-skill-1', skillType: 'followUp', action: 'email_sent', xpGained: 10, timestamp: isoDaysAgo(0) },
  { id: 'demo-skill-2', skillType: 'followUp', action: 'call', xpGained: 15, timestamp: isoDaysAgo(0) },
  { id: 'demo-skill-3', skillType: 'prospecting', action: 'add_prospect', xpGained: 25, timestamp: isoDaysAgo(0) },
  { id: 'demo-skill-4', skillType: 'marketKnowledge', action: 'add_requirement', xpGained: 20, timestamp: isoDaysAgo(0), relatedId: 'demo-requirement-1' },
]

function emailCounts() {
  const count = (status: string) => emailItems.filter((item) => item.matchStatus === status).length
  return {
    needsContext: count('needs_context'),
    pendingReview: count('pending_review'),
    approved: count('approved'),
    autoLogged: 8 + count('auto_logged'),
    ignored: 2 + count('ignored'),
    rejected: count('rejected'),
  }
}

function readPayload(pathname: string, searchParams: URLSearchParams): DemoApiResult | null {
  if (pathname === '/api/auth/demo/user') {
    return { handled: true, payload: { id: 'demo-user', email: 'broker@example.test', firstName: 'Demo', lastName: 'Broker', profileImageUrl: null } }
  }
  if (pathname === '/api/auth/user') return { handled: true, payload: null }
  if (pathname === '/api/profile') {
    return { handled: true, payload: { id: 'demo-user', name: 'Demo Broker', submarkets: submarkets.map((item) => item.name) } }
  }
  if (pathname === '/api/prospects') return { handled: true, payload: prospects }
  if (pathname === '/api/submarkets') return { handled: true, payload: submarkets }
  if (pathname === '/api/interactions') {
    const prospectId = searchParams.get('prospectId')
    return { handled: true, payload: prospectId ? interactions.filter((item) => item.prospectId === prospectId) : interactions }
  }
  if (pathname === '/api/requirements') return { handled: true, payload: requirements }
  if (pathname === '/api/listings' && searchParams.get('scope') === 'shared') return { handled: true, payload: sharedListings }
  if (pathname === '/api/listings') return { handled: true, payload: listings }
  if (/^\/api\/listings\/[^/]+\/members$/.test(pathname)) return { handled: true, payload: [] }
  if (/^\/api\/listings\/[^/]+\/prospects$/.test(pathname)) return { handled: true, payload: [] }
  if (/^\/api\/listings\/[^/]+$/.test(pathname)) {
    const id = pathname.split('/').at(-1)
    return { handled: true, payload: [...listings, ...sharedListings].find((item) => item.id === id) || null }
  }
  if (pathname === '/api/automation/sales-brief') {
    return {
      handled: true,
      payload: {
        generatedAt: now.toISOString(),
        summary: { openActions: 4, dueFollowUps: 1, staleProspects: 1, listingProgressItems: 1, emailCleanupItems: 1, outlookSignals: 2, researchTargets: 1 },
        pipelineHealth: { activeProspects: 9, withNextAction: 7, missingNextAction: 2, overdueNextActions: 1, stalledProspects: 1, nextActionCoveragePercent: 78 },
        actions,
        nextBestAction: actions[0],
        outlook: { emailsAnalyzed: 42, signals: [], watchTerms: ['10735 214 St', '2959 Parsons'] },
        integrations: { salesActivityAgentConfigured: true },
      },
    }
  }
  if (pathname === '/api/automation/activity-pulse') {
    return {
      handled: true,
      payload: {
        generatedAt: now.toISOString(),
        days: 28,
        total: activitySeries.reduce((sum, day) => sum + day.total, 0),
        activeDays: activitySeries.filter((day) => day.total > 0).length,
        streakDays: 4,
        automated: 37,
        manual: 18,
        currentPeriodTotal: 55,
        previousPeriodTotal: 42,
        trendPercent: 31,
        series: activitySeries,
      },
    }
  }
  if (pathname === '/api/agent/sales-activity/imports') return { handled: true, payload: { rows: [] } }
  if (pathname === '/api/email/outlook/config') {
    return {
      handled: true,
      payload: {
        configured: true,
        connected: true,
        connection: { id: 'demo-outlook', emailAddress: 'broker@example.test', displayName: 'Demo Broker', status: 'active', lastSyncedAt: isoDaysAgo(0), errorMessage: null },
      },
    }
  }
  if (pathname === '/api/email/inbound/config') {
    return { handled: true, payload: { configured: true, domainConfigured: true, intakeAddress: 'level-bcc@example.test', webhookUrl: '/api/email/inbound/postmark' } }
  }
  if (pathname === '/api/email/review/counts') return { handled: true, payload: emailCounts() }
  if (pathname === '/api/email/review') {
    const status = searchParams.get('status')
    return { handled: true, payload: !status || status === 'all' ? emailItems : emailItems.filter((item) => item.matchStatus === status) }
  }
  if (pathname === '/api/stats/header') return { handled: true, payload: { totalLevel: 8, assetsTracked: 137, followupsLogged: 4, streakDays: 4 } }
  if (pathname === '/api/skills') return { handled: true, payload: { prospecting: 1850, followUp: 2400, consistency: 1200, marketKnowledge: 950 } }
  if (pathname === '/api/skill-activities') return { handled: true, payload: skillActivities }
  if (pathname === '/api/market-comps') return { handled: true, payload: [] }
  if (pathname === '/api/leaderboard') return { handled: true, payload: [] }
  if (pathname.startsWith('/api/tool-a/review/')) return { handled: true, payload: [] }
  return null
}

function writePayload(method: string, pathname: string, data: unknown): DemoApiResult | null {
  if (/^\/api\/email\/review\/[^/]+$/.test(pathname) && method === 'PATCH') {
    const id = pathname.split('/').at(-1)
    const patch = (data || {}) as Record<string, unknown>
    emailItems = emailItems.map((item) => item.id === id ? { ...item, ...patch } as typeof item : item)
    return { handled: true, payload: { ok: true } }
  }
  if (/^\/api\/email\/review\/[^/]+\/create-interaction$/.test(pathname) && method === 'POST') {
    const id = pathname.split('/').at(-2)
    emailItems = emailItems.map((item) => item.id === id ? { ...item, matchStatus: 'auto_logged' } : item)
    return { handled: true, payload: { ok: true } }
  }
  if (pathname.startsWith('/api/agent/sales-activity/imports/') && method === 'PATCH') return { handled: true, payload: { ok: true } }
  if (pathname === '/api/email/outlook/sync' || pathname === '/api/email/outlook/sync-bcc') return { handled: true, payload: { ok: true, imported: 0 } }
  if (pathname === '/api/email/outlook/connect') return { handled: true, payload: { url: '/app/inbox' } }
  if (pathname.startsWith('/api/requirements') || pathname.startsWith('/api/interactions') || pathname.startsWith('/api/prospects') || pathname.startsWith('/api/listings')) {
    return { handled: true, payload: { ok: true } }
  }
  return null
}

export function isDemoModeRequested() {
  try {
    return localStorage.getItem('demo-mode') === 'true'
  } catch {
    return false
  }
}

export function getDemoApiResult(method: string, url: string, data?: unknown): DemoApiResult | null {
  if (!isDemoModeRequested()) return null
  const parsed = new URL(url, window.location.origin)
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'GET') return readPayload(parsed.pathname, parsed.searchParams)
  return writePayload(normalizedMethod, parsed.pathname, data)
}

export function demoJsonResponse(result: DemoApiResult) {
  return new Response(JSON.stringify(result.payload), {
    status: result.status || 200,
    headers: { 'content-type': 'application/json' },
  })
}
