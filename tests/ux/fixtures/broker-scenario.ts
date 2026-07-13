import type { Page, Route } from '@playwright/test';

const now = new Date();
const isoDaysAgo = (days: number) => new Date(now.getTime() - (days * 86_400_000)).toISOString();

const prospects = [
  {
    id: 'prospect-10735',
    userId: 'demo-user',
    name: '10735 214 St NW',
    businessName: 'West End Distribution',
    contactCompany: 'West End Distribution',
    contactName: 'Morgan Lee',
    contactEmail: 'morgan@example.com',
    address: '10735 214 St NW, Edmonton, AB',
    status: 'hot',
    latitude: '53.5512',
    longitude: '-113.6901',
  },
  {
    id: 'prospect-2959',
    userId: 'demo-user',
    name: '2959 Parsons Road NW',
    businessName: 'South Edmonton Industrial',
    contactCompany: 'South Edmonton Industrial',
    contactName: 'Vas Patel',
    contactEmail: 'vas@example.com',
    address: '2959 Parsons Road NW, Edmonton, AB',
    status: 'contacted',
    latitude: '53.4601',
    longitude: '-113.4897',
  },
  {
    id: 'prospect-border',
    userId: 'demo-user',
    name: 'Border Site',
    businessName: 'Border Site Owner',
    address: 'Edmonton, AB',
    status: 'new',
  },
];

const primaryAction = {
  id: 'action-10735',
  type: 'follow_up_due',
  priority: 'critical',
  priorityScore: 98,
  title: 'Advance 10735 214 St',
  reason: 'This is the strongest live revenue opportunity and the buyer thread is active.',
  suggestedAction: 'Call the buyer, confirm the decision path, and push toward an offer or tour commitment.',
  source: 'outlook',
  dueAt: isoDaysAgo(1),
  prospect: {
    id: 'prospect-10735',
    name: 'West End Distribution',
    address: '10735 214 St NW, Edmonton, AB',
    contactName: 'Morgan Lee',
    contactEmail: 'morgan@example.com',
    listingTitles: [],
  },
  automationHints: {
    stage: 'active_work',
    participantEmails: ['morgan@example.com'],
    propertyMentions: ['10735 214 St'],
    dealTerms: ['tour', 'offer'],
  },
};

const waitingAction = {
  id: 'action-2959',
  type: 'outlook_signal',
  priority: 'high',
  priorityScore: 88,
  title: 'Confirm access at 2959 Parsons',
  reason: 'The tour is waiting on property access confirmation.',
  suggestedAction: 'Confirm that Vas can open the property and send the tour time.',
  source: 'outlook',
  dueAt: isoDaysAgo(0),
  prospect: {
    id: 'prospect-2959',
    name: 'South Edmonton Industrial',
    address: '2959 Parsons Road NW, Edmonton, AB',
    contactName: 'Vas Patel',
    contactEmail: 'vas@example.com',
    listingTitles: [],
  },
  automationHints: {
    stage: 'waiting_on_reply',
    participantEmails: ['vas@example.com'],
    propertyMentions: ['2959 Parsons'],
    dealTerms: ['tour access'],
  },
};

const salesBrief = {
  generatedAt: now.toISOString(),
  summary: {
    openActions: 4,
    dueFollowUps: 1,
    staleProspects: 1,
    listingProgressItems: 1,
    emailCleanupItems: 1,
    outlookSignals: 2,
    researchTargets: 1,
  },
  pipelineHealth: {
    activeProspects: 9,
    withNextAction: 7,
    missingNextAction: 2,
    overdueNextActions: 1,
    stalledProspects: 1,
    nextActionCoveragePercent: 78,
  },
  actions: [
    primaryAction,
    waitingAction,
    {
      id: 'action-border',
      type: 'research_target',
      priority: 'medium',
      priorityScore: 62,
      title: 'Find the owner of the Border Site',
      reason: 'The property is mapped but no reachable ownership contact is attached.',
      suggestedAction: 'Pull title and add the owner contact.',
      source: 'level_cre',
      prospect: { id: 'prospect-border', name: 'Border Site', address: 'Edmonton, AB' },
      automationHints: { stage: 'stale_work', propertyMentions: ['Border Site'] },
    },
  ],
  nextBestAction: primaryAction,
  outlook: { emailsAnalyzed: 42, signals: [], watchTerms: ['10735 214 St', '2959 Parsons'] },
  integrations: { salesActivityAgentConfigured: true },
};

const activitySeries = Array.from({ length: 28 }, (_, index) => {
  const date = new Date(now.getTime() - ((27 - index) * 86_400_000));
  const active = index % 3 !== 0;
  return {
    date: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
    email: active ? 2 : 0,
    call: active ? 1 : 0,
    meeting: index % 7 === 0 ? 1 : 0,
    other: 0,
    total: active ? 3 + (index % 7 === 0 ? 1 : 0) : 0,
  };
});

const emailItems = [
  {
    id: 'email-10735',
    matchStatus: 'pending_review',
    confidence: 0.97,
    matchReason: 'Matched by property address and participant email.',
    suggestedInteractionType: 'email',
    suggestedOutcome: 'follow_up_later',
    suggestedSummary: 'Buyer asked for the next step on 10735 214 St and is ready to discuss timing.',
    suggestedNextFollowUp: isoDaysAgo(-2),
    interactionId: null,
    email: {
      provider: 'outlook',
      providerMessageId: 'message-10735',
      providerThreadId: 'thread-10735',
      direction: 'inbound',
      subject: 'Re: 10735 214 St - next steps',
      senderEmail: 'morgan@example.com',
      senderName: 'Morgan Lee',
      recipientEmails: ['patrick@example.com'],
      sentAt: isoDaysAgo(1),
      receivedAt: isoDaysAgo(1),
      snippet: 'Can we talk through the next step and timing for the property?',
      attachmentNames: [],
      sourceUrl: '',
    },
    prospect: {
      id: 'prospect-10735',
      name: '10735 214 St NW',
      address: '10735 214 St NW, Edmonton, AB',
      status: 'hot',
      contactCompany: 'West End Distribution',
      businessName: 'West End Distribution',
    },
    listing: null,
  },
  {
    id: 'email-unmatched',
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
      providerMessageId: 'message-unmatched',
      providerThreadId: null,
      direction: 'outbound',
      subject: 'Edmonton industrial requirement',
      senderEmail: 'patrick@example.com',
      senderName: 'Patrick Livingston',
      recipientEmails: ['newbuyer@example.com'],
      sentAt: isoDaysAgo(2),
      receivedAt: null,
      snippet: 'Following up on the west Edmonton requirement we discussed.',
      attachmentNames: [],
      sourceUrl: '',
    },
    prospect: null,
    listing: null,
  },
];

const listings = [
  {
    id: 'listing-14840',
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
    id: 'listing-parsons',
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
];

const sharedListings = [
  {
    id: 'listing-jack',
    userId: 'jack-user',
    title: '16520 111 Ave - Jack',
    address: '16520 111 Ave NW, Edmonton, AB',
    createdAt: isoDaysAgo(20),
    archivedAt: null,
    prospectCount: 5,
  },
];

const skillActivities = [
  { id: 'skill-1', skillType: 'followUp', action: 'email_sent', xpGained: 10, timestamp: isoDaysAgo(0) },
  { id: 'skill-2', skillType: 'followUp', action: 'call', xpGained: 15, timestamp: isoDaysAgo(0) },
  { id: 'skill-3', skillType: 'prospecting', action: 'add_prospect', xpGained: 25, timestamp: isoDaysAgo(0) },
  { id: 'skill-4', skillType: 'marketKnowledge', action: 'add_requirement', xpGained: 20, timestamp: isoDaysAgo(0) },
];

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installBrokerScenario(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('levelcre:ux-scenario') !== 'broker-baseline-v1') {
      localStorage.clear();
      localStorage.setItem('levelcre:ux-scenario', 'broker-baseline-v1');
      localStorage.setItem('demo-mode', 'true');
    }
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/auth/demo/user') {
      return fulfillJson(route, {
        id: 'demo-user',
        email: 'patrick@levelcre.test',
        firstName: 'Patrick',
        lastName: 'Livingston',
        profileImageUrl: null,
      });
    }
    if (path === '/api/automation/sales-brief') return fulfillJson(route, salesBrief);
    if (path === '/api/agent/sales-activity/imports') return fulfillJson(route, { rows: [] });
    if (path === '/api/automation/activity-pulse') {
      return fulfillJson(route, {
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
      });
    }
    if (path === '/api/email/outlook/config') {
      return fulfillJson(route, {
        configured: true,
        connected: true,
        connection: {
          id: 'outlook-demo',
          emailAddress: 'patrick@levelcre.test',
          displayName: 'Patrick Livingston',
          status: 'active',
          lastSyncedAt: isoDaysAgo(0),
          errorMessage: null,
        },
      });
    }
    if (path === '/api/email/inbound/config') {
      return fulfillJson(route, {
        configured: true,
        domainConfigured: true,
        intakeAddress: 'level-bcc@example.test',
        webhookUrl: '/api/email/inbound/postmark',
      });
    }
    if (path === '/api/email/review/counts') {
      return fulfillJson(route, {
        needsContext: 1,
        pendingReview: 1,
        approved: 0,
        autoLogged: 8,
        ignored: 2,
        rejected: 0,
      });
    }
    if (path === '/api/email/review' && method === 'GET') return fulfillJson(route, emailItems);
    if (path.startsWith('/api/email/review/') && method !== 'GET') return fulfillJson(route, { ok: true });
    if (path === '/api/prospects') return fulfillJson(route, prospects);
    if (path === '/api/listings' && url.searchParams.get('scope') === 'shared') return fulfillJson(route, sharedListings);
    if (path === '/api/listings') return fulfillJson(route, listings);
    if (path === '/api/stats/header') {
      return fulfillJson(route, { totalLevel: 8, assetsTracked: 137, followupsLogged: 4, streakDays: 4 });
    }
    if (path === '/api/skills') {
      return fulfillJson(route, { prospecting: 1850, followUp: 2400, consistency: 1200, marketKnowledge: 950 });
    }
    if (path === '/api/skill-activities') return fulfillJson(route, skillActivities);
    if (path === '/api/requirements') return fulfillJson(route, []);

    return fulfillJson(route, { ok: true });
  });
}
