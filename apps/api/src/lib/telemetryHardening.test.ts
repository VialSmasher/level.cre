import { reportingWindowStart } from './reportingWindow'
import { legacyAgentRouteAllowed } from '../auth'
import assert from 'node:assert/strict'
import test from 'node:test'
import { inboundWebhookAuthorized } from './inboundWebhookAuth'
import { importSalesActivityBatch, SalesActivityBatchSchema } from './salesActivityImportService'
import { summarizeCaptureHealth } from './captureHealthService'
import { buildMappingCoverage, summarizeCommercialProgress } from './telemetryInsights'
import { ingestionRateLimit } from './automationTelemetry'
import type { ProductionActivityRow } from './productionActivityService'

const at = '2026-09-04T12:00:00Z'
function activity(overrides: Partial<ProductionActivityRow> = {}): ProductionActivityRow {
  return { id: 'a', timestamp: at, date: at, type: 'email', action: 'email_sent', direction: 'outbound', sourceProvider: 'codex', sourceIdentities: ['external:a'], sourceMetadata: { email: 'person@example.test', subject: 'Space requirement' }, prospectId: 'p', interactionId: null, ...overrides }
}
test('inbound authentication rejects known recipient, query secret, wrong secret and missing configuration', () => {
  const forged = { headers: {}, query: { secret: 'configured' }, body: { To: 'known@inbound.example', MailboxHash: 'known', userId: 'victim' } }
  assert.equal(inboundWebhookAuthorized(forged, 'configured'), false)
  assert.equal(inboundWebhookAuthorized({ headers: { 'x-levelcre-inbound-secret': 'wrong' } }, 'configured'), false)
  assert.equal(inboundWebhookAuthorized({ headers: { 'x-levelcre-inbound-secret': 'configured' } }, ''), false)
  assert.equal(inboundWebhookAuthorized({ headers: { authorization: 'Basic ' + Buffer.from('postmark:configured').toString('base64') } }, 'configured'), true)
  assert.equal(inboundWebhookAuthorized({ headers: { authorization: 'Bearer configured' } }, 'configured'), true)
})
test('canonical failure retains original event identity and returns a retryable rejection; replay completes', async () => {
  let imported: any = null; let interactionId: string | null = null; let created = 0
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes('INSERT INTO public.automation_event_payloads')) return { rows: [{ fingerprint: args[4] }] }
    if (sql.includes('FROM public.prospects')) return { rows: [{ id: 'p', merged_into_prospect_id: null }] }
    if (sql.includes('SELECT id, interaction_id') && sql.includes('sales_activity_imports')) return { rows: imported ? [imported] : [] }
    if (sql.includes('INSERT INTO public.sales_activity_imports')) {
      imported ||= { id: 'receipt', interaction_id: null, match_status: 'matched', prospect_id: 'p' }
      return { rows: [imported] }
    }
    if (sql.includes('FROM public.contact_interactions')) return { rows: interactionId ? [{ id: interactionId }] : [] }
    if (sql.includes('UPDATE public.sales_activity_imports')) imported.interaction_id = args[3]
    return { rows: [] }
  }
  const pool = { query, connect: async () => ({ query, release() {} }) } as any
  const storage = { createContactInteraction: async () => { created++; interactionId = 'interaction'; return { id: interactionId } } }
  const payload = SalesActivityBatchSchema.parse({ producerId: 'pat-pc', activities: [{ externalActivityId: 'confirmed-send', prospectId: 'p', status: 'sent', activityType: 'call', activityAt: at }] })
  const failed = await importSalesActivityBatch({ pool, storage, userId: 'u', payload, recordActivityEvent: async () => { throw Error('canonical unavailable') } })
  assert.equal(failed.errors, 1)
  assert.equal(failed.results[0].externalActivityId, 'confirmed-send')
  assert.equal(failed.results[0].receiptStatus, 'rejected')
  assert.equal(failed.results[0].retryable, true)
  const retried = await importSalesActivityBatch({ pool, storage, userId: 'u', payload, recordActivityEvent: async () => {} })
  assert.equal(retried.results[0].receiptStatus, 'applied')
  assert.equal(retried.errors, 0)
  assert.equal(created, 1)
})
test('equal counts of disjoint identities do not report healthy capture', () => {
  const health = summarizeCaptureHealth({ capturedRows: [{ provider: 'inbound', provider_message_id: 'missing', subject: 'Hello', recipient_emails: ['other@example.test'], sent_at: at, created_at: at }], canonicalRows: [activity()], now: new Date(at) })
  assert.equal(health.unreconciledCount, 1)
  assert.equal(health.status, 'attention')
  assert.equal(health.oldestPendingAt, new Date(at).toISOString())
})
test('progression excludes replies before outreach and unrelated conversations', () => {
  const rows = [
    activity(), activity({ id: 'early', direction: 'inbound', timestamp: '2026-09-04T11:00:00Z' }),
    activity({ id: 'other', direction: 'inbound', timestamp: '2026-09-04T13:00:00Z', sourceMetadata: { email: 'other@example.test', subject: 'Space requirement' } }),
    activity({ id: 'reply', direction: 'inbound', timestamp: '2026-09-04T14:00:00Z', sourceMetadata: { email: 'person@example.test', subject: 'Re: Space requirement' } }),
    activity({ id: 'unrelated-meeting', type: 'meeting', prospectId: 'other', direction: 'internal' }),
  ]
  const result = summarizeCommercialProgress(rows, Date.parse('2026-09-01'))
  assert.equal(result.repliedConversations, 1)
  assert.equal(result.attributableConversations, 1)
  assert.equal(result.prospectsWithMeetings, 0)
})
test('coverage groups actions by reason and recognizes verified polygon geometry', () => {
  const rows = [activity(), activity({ id: 'b' }), activity({ id: 'c', prospectId: 'polygon' }), activity({ id: 'd', prospectId: null, sourceMetadata: { company: 'Unknown tenant' } })]
  const result = buildMappingCoverage(rows, [
    { id: 'p', name: 'Tenant', address: null, location_lat: null, location_lng: null, geometry: null },
    { id: 'polygon', name: 'Site', address: 'Verified address', location_lat: null, location_lng: null, geometry: { type: 'Polygon', coordinates: [[[-113.5,53.5],[-113.6,53.5],[-113.5,53.6],[-113.5,53.5]]] } },
  ], Date.parse('2026-09-01'))
  assert.equal(result.mappedActions, 1)
  assert.equal(result.unmappedActions, 3)
  assert.equal(result.groups[0].actions, 2)
  assert.equal(result.groups[0].reason, 'Verified location needed')
})
test('ingestion limiter returns a retry interval and does not forward over-limit requests', async () => {
  const pool = { query: async () => ({ rows: [{ requests: 121, retry_after: 42 }] }) } as any
  const response = { locals: {}, code: 200, headers: {} as Record<string,string>, setHeader(name: string, value: string) { this.headers[name] = value }, status(code: number) { this.code = code; return this }, json() {} }
  let forwarded = false
  await ingestionRateLimit(pool)({ user: { id: 'broker' } } as any, response as any, () => { forwarded = true })
  assert.equal(response.code, 429)
  assert.equal(response.headers['Retry-After'], '42')
  assert.equal(forwarded, false)
})


test('reporting windows use Edmonton midnight across daylight-saving changes', () => {
  assert.equal(reportingWindowStart(new Date('2026-09-04T19:00:00Z'), 28).toISOString(), '2026-08-08T06:00:00.000Z')
  assert.equal(reportingWindowStart(new Date('2026-03-08T19:00:00Z'), 1).toISOString(), '2026-03-08T07:00:00.000Z')
  assert.equal(reportingWindowStart(new Date('2026-11-01T19:00:00Z'), 1).toISOString(), '2026-11-01T06:00:00.000Z')
})
test('legacy credentials cannot write arbitrary broker routes or review decisions', () => {
  assert.equal(legacyAgentRouteAllowed('DELETE', '/api/prospects/p'), false)
  assert.equal(legacyAgentRouteAllowed('PATCH', '/api/agent/sales-activity/imports/i'), false)
  assert.equal(legacyAgentRouteAllowed('POST', '/api/agent/sales-activity/batch'), true)
  assert.equal(legacyAgentRouteAllowed('GET', '/api/automation/production-activities'), true)
})

test('producer identity conflict is rejected before downstream side effects', async () => {
  const query = async (sql: string) => sql.includes('FROM public.prospects') ? {rows:[{id:'p',merged_into_prospect_id:null}]} : sql.includes('automation_event_payloads') ? {rows:[{fingerprint:'different'}]} : {rows:[]}
  const pool = { query, connect: async () => ({query,release(){}}) } as any
  let created = false
  const result = await importSalesActivityBatch({ pool, userId:'u', storage:{createContactInteraction:async()=>{created=true;return{id:'unexpected'}}}, payload:SalesActivityBatchSchema.parse({producerId:'pat-pc',activities:[{externalActivityId:'same-id',prospectId:'p',status:'sent',activityType:'call',activityAt:at}]}) })
  assert.equal(result.errors,1)
  assert.equal(result.results[0].code,'event_payload_conflict')
  assert.equal(result.results[0].retryable,false)
  assert.equal(result.results[0].externalActivityId,'same-id')
  assert.equal(created,false)
})
