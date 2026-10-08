import { listProspectContacts, ProspectContactError, type ProspectContact } from './prospectContactService';
import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { XP_VALUES } from './gamification';
import { businessPhoneKey, contactIdentityKey, derivePhoneReadiness, isPhoneBlocked, readPhoneReadinessMetadata, type PhoneReadiness } from './phoneReadiness';

export const MOBILE_CALL_OUTCOMES = [
  'attempted',
  'wrong_number',
  'disconnected',
  'contacted',
  'no_answer',
  'left_message',
  'scheduled_meeting',
  'not_interested',
  'follow_up_later',
] as const;

export type MobileCallOutcome = typeof MOBILE_CALL_OUTCOMES[number];

export const MobileCallOutcomeSchema = z.object({
  clientEventId: z.string().trim().min(10).max(120),
  prospectId: z.string().trim().min(1).max(200),
  contactId: z.string().uuid().optional(),
  expectedPhone: z.string().trim().min(3).max(80),
  outcome: z.enum(MOBILE_CALL_OUTCOMES),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  callStartedAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).optional().default(''),
  nextFollowUp: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export type MobileCallOutcomeInput = z.infer<typeof MobileCallOutcomeSchema>;

export const MobileCallStartSchema = z.object({
  clientEventId: z.string().trim().min(10).max(120),
  prospectId: z.string().trim().min(1).max(200),
  contactId: z.string().uuid().optional(),
  expectedPhone: z.string().trim().min(3).max(80),
  callStartedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const MobileCallDiscardSchema = z.object({
  clientEventId: z.string().trim().min(10).max(120),
  prospectId: z.string().trim().min(1).max(200),
  contactId: z.string().uuid().optional(),
}).strict();

export type MobileCallStartInput = z.infer<typeof MobileCallStartSchema>;
export type MobileCallDiscardInput = z.infer<typeof MobileCallDiscardSchema>;

export class MobileCallingError extends Error {
  status: number;
  code: string;
  canonicalProspectId?: string;

  constructor(params: { message: string; status: number; code: string; canonicalProspectId?: string }) {
    super(params.message);
    this.name = 'MobileCallingError';
    this.status = params.status;
    this.code = params.code;
    this.canonicalProspectId = params.canonicalProspectId;
  }
}

export type MobileCallQueueCandidate = {
  id: string;
  phoneReadiness?: PhoneReadiness;
  priorityScore: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  contact: {
    name: string | null;
    company: string | null;
    phone: string;
    email: string | null;
  };
  prospect: {
    id: string;
    name: string;
    status: string;
    address: string | null;
    businessName: string | null;
    followUpDueDate: string | null;
    lastContactDate: string | null;
  };
  listingTitles: string[];
  recentActivity: Array<{
    id: string;
    type: string;
    outcome: string;
    occurredAt: string;
    notes: string;
  }>;
};

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function brokerDayNumber(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return Math.floor(Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000);
}

function dayDifference(left: Date, right: Date) {
  return brokerDayNumber(right) - brokerDayNumber(left);
}

export function rankMobileCallCandidate(params: {
  status: string;
  followUpDueDate?: unknown;
  lastContactDate?: unknown;
  lastInteractionAt?: unknown;
  createdAt?: unknown;
  now?: Date;
}) {
  const now = params.now || new Date();
  const dueAt = asDate(params.followUpDueDate);
  const lastTouch = asDate(params.lastContactDate)
    || asDate(params.lastInteractionAt)
    || asDate(params.createdAt);
  const reasons: string[] = [];
  let score = 20;

  if (dueAt) {
    const dueInDays = dayDifference(now, dueAt);
    if (dueInDays < 0) {
      score += 64 + Math.min(Math.abs(dueInDays), 14);
      reasons.push(`${Math.abs(dueInDays)}d overdue`);
    } else if (dueInDays === 0) {
      score += 62;
      reasons.push('Due today');
    } else if (dueInDays <= 7) {
      score += 48 - (dueInDays * 3);
      reasons.push(`Due in ${dueInDays}d`);
    }
  } else {
    reasons.push('No next call set');
  }

  if (lastTouch) {
    const inactiveDays = Math.max(0, dayDifference(lastTouch, now));
    if (inactiveDays >= 60) {
      score += 24;
      reasons.push(`${inactiveDays}d since touch`);
    } else if (inactiveDays >= 30) {
      score += 14;
      reasons.push(`${inactiveDays}d since touch`);
    } else if (inactiveDays >= 14) {
      score += 7;
      reasons.push(`${inactiveDays}d since touch`);
    }
  } else {
    score += 26;
    reasons.push('No activity yet');
  }

  if (params.status === 'listing') {
    score += 12;
    reasons.push('Active listing');
  } else if (params.status === 'contacted') {
    score += 8;
    reasons.push('Warm contact');
  }

  const boundedScore = Math.max(0, Math.min(score, 100));
  const priority = boundedScore >= 85
    ? 'critical'
    : boundedScore >= 65
      ? 'high'
      : boundedScore >= 45
        ? 'medium'
        : 'low';

  return { score: boundedScore, priority, reasons: reasons.slice(0, 3) } as const;
}

export function phonesMatch(left: string, right: string) {
  const leftKey = businessPhoneKey(left);
  return Boolean(leftKey && leftKey === businessPhoneKey(right));
}
export function eventTypeForCallOutcome(outcome: MobileCallOutcome) {
  return outcome === 'attempted' || outcome === 'wrong_number' || outcome === 'disconnected' || outcome === 'no_answer' || outcome === 'left_message' ? 'call_attempted' : 'call_connected';
}

export async function listMobileCallQueue(params: {
  pool: Pool;
  userId: string;
  limit: number;
  now?: Date;
  includeCalledToday?: boolean;
}): Promise<{ rows: MobileCallQueueCandidate[]; totalEligible: number }> {
  const now = params.now || new Date();
  const { rows } = await params.pool.query(`
    SELECT
      COUNT(*) OVER() AS total_eligible,
      p.id,
      p.name,
      p.status,
      p.address,
      p.contact_name,
      p.contact_email,
      p.contact_phone,
      p.contact_company,
      p.business_name,
      p.follow_up_due_date,
      p.last_contact_date,
      p.created_at,
      p.ai_metadata,
      COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.is_primary DESC,c.created_at,c.id) FROM public.prospect_contacts c
        WHERE c.user_id=p.user_id AND c.prospect_id=p.id AND c.archived_at IS NULL),'[]'::jsonb) AS contacts,
      latest.last_interaction_at,
      COALESCE(listings.listing_titles, ARRAY[]::varchar[]) AS listing_titles,
      COALESCE(recent.items, '[]'::jsonb) AS recent_activity
    FROM public.prospects p
    LEFT JOIN LATERAL (
      SELECT MAX(ci.created_at) AS last_interaction_at
      FROM public.contact_interactions ci
      WHERE ci.user_id = p.user_id AND ci.prospect_id = p.id
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT array_remove(array_agg(DISTINCT l.title), NULL) AS listing_titles
      FROM public.listing_prospects lp
      JOIN public.listings l ON l.id = lp.listing_id AND l.archived_at IS NULL
      WHERE lp.prospect_id = p.id
    ) listings ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'type', item.type,
        'outcome', item.outcome,
        'occurredAt', item.date,
        'notes', item.notes
      ) ORDER BY item.created_at DESC) AS items
      FROM (
        SELECT ci.id, ci.type, ci.outcome, ci.date, LEFT(COALESCE(ci.notes, ''), 240) AS notes, ci.created_at
        FROM public.contact_interactions ci
        WHERE ci.user_id = p.user_id AND ci.prospect_id = p.id
        ORDER BY ci.created_at DESC
        LIMIT 3
      ) item
    ) recent ON true
    WHERE p.user_id = $1
      AND p.merged_into_prospect_id IS NULL
      AND COALESCE(p.status, '') <> 'no_go'
      AND ($3::boolean OR NOT EXISTS (
        SELECT 1
        FROM public.contact_interactions today_call
        WHERE today_call.user_id = p.user_id
          AND today_call.prospect_id = p.id
          AND today_call.type = 'call'
          AND (today_call.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Edmonton')::date = ($2::timestamptz AT TIME ZONE 'America/Edmonton')::date
      ))
    ORDER BY COALESCE(p.follow_up_due_date, latest.last_interaction_at, p.created_at) ASC, p.id ASC

  `, [params.userId, now.toISOString(), params.includeCalledToday === true]);

  const chronologicalKeys = new Map<string, number>(rows.map((row) => [row.id,
    (asDate(row.follow_up_due_date) || asDate(row.last_interaction_at) || asDate(row.created_at))?.getTime() ?? Infinity,
  ]));
  const candidates = rows
    .map((row) => {
      const phoneReadiness = derivePhoneReadiness(row, Array.isArray(row.contacts) ? row.contacts : [], { now });
      const rank = rankMobileCallCandidate({
        status: row.status,
        followUpDueDate: row.follow_up_due_date,
        lastContactDate: row.last_contact_date,
        lastInteractionAt: row.last_interaction_at,
        createdAt: row.created_at,
        now,
      });
      return {
        id: `call:${row.id}`, phoneReadiness,
        priorityScore: rank.score,
        priority: rank.priority,
        reasons: rank.reasons,
        contact: {
          name: row.contact_name || null,
          company: row.contact_company || row.business_name || null,
          phone: phoneReadiness.usableChoices[0]?.number || '',
          email: row.contact_email || null,
        },
        prospect: {
          id: row.id,
          name: row.name,
          status: row.status,
          address: row.address || null,
          businessName: row.business_name || null,
          followUpDueDate: asDate(row.follow_up_due_date)?.toISOString() || null,
          lastContactDate: asDate(row.last_contact_date)?.toISOString() || null,
        },
        listingTitles: Array.isArray(row.listing_titles) ? row.listing_titles : [],
        recentActivity: Array.isArray(row.recent_activity) ? row.recent_activity : [],
      } satisfies MobileCallQueueCandidate;
    })
    .filter((candidate) => candidate.phoneReadiness.status === 'ready')
    .sort((left, right) => right.priorityScore - left.priorityScore
      || (chronologicalKeys.get(left.prospect.id)! - chronologicalKeys.get(right.prospect.id)!)
      || left.prospect.id.localeCompare(right.prospect.id))
    .slice(0, params.limit);
  return { rows: candidates, totalEligible: rows.filter((row) => derivePhoneReadiness(row, Array.isArray(row.contacts) ? row.contacts : [], { now }).status === 'ready').length };
}

function outcomeSummary(outcome: MobileCallOutcome, notes: string) {
  const labels: Record<MobileCallOutcome, string> = {
    attempted: 'Call attempted',
    wrong_number: 'Wrong number',
    disconnected: 'Disconnected number',
    contacted: 'Connected',
    no_answer: 'No answer',
    left_message: 'Left voicemail',
    scheduled_meeting: 'Meeting scheduled',
    not_interested: 'Not interested',
    follow_up_later: 'Follow up later',
  };
  return notes ? `${labels[outcome]}: ${notes}` : labels[outcome];
}

async function findExistingEvent(client: PoolClient, userId: string, clientEventId: string) {
  const { rows } = await client.query(`
    SELECT id, prospect_id, interaction_id, event_type, evidence_status, match_status,
           phone, occurred_at, source_metadata
    FROM public.activity_events
    WHERE user_id = $1 AND source = 'level_cre_mobile_calling' AND external_event_id = $2
    LIMIT 1
  `, [userId, clientEventId]);
  return rows[0] || null;
}

const CALLING_SOURCE = 'level_cre_mobile_calling';

type CallEvent = {
  id: string;
  prospect_id: string | null;
  interaction_id: string | null;
  event_type: string;
  evidence_status: string;
  match_status: string;
  phone: string | null;
  occurred_at: string | Date;
  source_metadata: Record<string, any>;
};

function sessionState(event: CallEvent): 'started' | 'confirmed' | 'discarded' {
  if (event.source_metadata?.sessionState === 'discarded' || event.match_status === 'ignored') return 'discarded';
  return event.interaction_id ? 'confirmed' : 'started';
}

function assertSameSession(event: CallEvent, input: { prospectId: string; expectedPhone?: string; contactId?: string }) {
  const savedProspectId = event.source_metadata?.prospectId || event.prospect_id;
  const savedPhone = event.source_metadata?.phoneSnapshot || event.phone;
  if ((input.contactId && input.contactId !== event.source_metadata?.contactId) || savedProspectId !== input.prospectId || (input.expectedPhone && !(sessionState(event) === 'discarded' && !savedPhone) && (!savedPhone || !phonesMatch(input.expectedPhone, savedPhone)))) {
    throw new MobileCallingError({ message: 'This call key is already associated with a different record, contact or phone.', status: 409, code: 'idempotency_conflict' });
  }
}

// Serializes retries, confirmation and undo even before the ledger row exists.
async function lockSession(client: PoolClient, userId: string, clientEventId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([CALLING_SOURCE, userId, clientEventId])]);
}

async function requireCallableProspect(client: PoolClient, userId: string, input: { prospectId: string; expectedPhone: string; contactId?: string }, frozenContact?: ProspectContact) {
  const { rows } = await client.query(`
    SELECT id, name, status, address, contact_name, contact_email, contact_phone,
           contact_company, business_name, merged_into_prospect_id, follow_up_due_date,
           last_contact_date, created_at, ai_metadata
    FROM public.prospects
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    FOR UPDATE
  `, [input.prospectId, userId]);
  const prospect = rows[0];
  if (!prospect) {
    throw new MobileCallingError({ message: 'Prospect was not found for the signed-in broker.', status: 404, code: 'prospect_not_found' });
  }
  if (prospect.merged_into_prospect_id) {
    throw new MobileCallingError({ message: 'This prospect was consolidated into another record.', status: 409, code: 'prospect_merged', canonicalProspectId: prospect.merged_into_prospect_id });
  }
  if (prospect.status === 'no_go') {
    throw new MobileCallingError({ message: 'This prospect is inactive. Choose an active prospect before calling.', status: 409, code: 'prospect_inactive' });
  }
  // Saved starts retain their person/number attribution even after contact edits or archive.
  // The owned prospect is still checked on every new confirmation.
  let contact = frozenContact;
  if (!contact) {
    try {
      const contacts = await listProspectContacts(client, userId, prospect);
      contact = input.contactId ? contacts.find((item) => item.id === input.contactId) : contacts.find((item) => item.isPrimary);
    } catch (error) {
      if (error instanceof ProspectContactError) throw new MobileCallingError({ message: error.message, status: error.status, code: error.code });
      throw error;
    }
    if (!contact) throw new MobileCallingError({ message: 'Contact was not found on this record.', status: 404, code: 'contact_not_found' });
    if (isPhoneBlocked(prospect, contact, input.expectedPhone)) throw new MobileCallingError({ message: 'This number was reported wrong or disconnected. Choose another number.', status: 409, code: 'phone_blocked' });
    if (![contact.phone, ...contact.additionalPhones.map((item) => item.number)].some((phone) => phone && phonesMatch(input.expectedPhone, phone))) {
      throw new MobileCallingError({ message: 'The contact phone number changed. Refresh before recording this call.', status: 409, code: input.contactId ? 'contact_phone_changed' : 'prospect_phone_changed' });
    }
  }
  return { ...prospect, contact_name: contact.name, contact_company: contact.company,
    contact_email: contact.email, contact_phone: input.expectedPhone, calling_contact: contact, calling_account: prospect };
}

function candidateSnapshot(prospect: Record<string, any>, now: Date): MobileCallQueueCandidate {
  const rank = rankMobileCallCandidate({ status: prospect.status, followUpDueDate: prospect.follow_up_due_date, lastContactDate: prospect.last_contact_date, createdAt: prospect.created_at, now });
  return {
    id: `call:${prospect.id}`,
    priorityScore: rank.score,
    priority: rank.priority,
    reasons: rank.reasons,
    contact: { name: prospect.contact_name || null, company: prospect.contact_company || prospect.business_name || null, phone: prospect.contact_phone, email: prospect.contact_email || null },
    prospect: { id: prospect.id, name: prospect.name, status: prospect.status, address: prospect.address || null, businessName: prospect.business_name || null, followUpDueDate: asDate(prospect.follow_up_due_date)?.toISOString() || null, lastContactDate: asDate(prospect.last_contact_date)?.toISOString() || null },
    listingTitles: [],
    recentActivity: [],
  };
}

export async function recordMobileCallStart(params: { pool: Pool; userId: string; input: MobileCallStartInput }) {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    await lockSession(client, params.userId, params.input.clientEventId);
    const existing: CallEvent | null = await findExistingEvent(client, params.userId, params.input.clientEventId);
    if (existing) {
      assertSameSession(existing, params.input);
      await client.query('COMMIT');
      return { duplicate: true, eventId: existing.id, prospectId: params.input.prospectId, status: sessionState(existing), callStartedAt: existing.source_metadata?.callStartedAt || asDate(existing.occurred_at)?.toISOString(), contactId: existing.source_metadata?.contactId || null, contactSnapshot: existing.source_metadata?.contactSnapshot || null };
    }
    const prospect = await requireCallableProspect(client, params.userId, params.input);
    const now = new Date();
    const callStartedAt = params.input.callStartedAt || now.toISOString();
    if (new Date(callStartedAt).getTime() > now.getTime() + 300_000) {
      throw new MobileCallingError({ message: 'Call start time is in the future. Check the device clock and try again.', status: 400, code: 'invalid_call_time' });
    }
    const eventId = randomUUID();
    await client.query(`
      INSERT INTO public.activity_events (
        id, user_id, source, external_event_id, event_type, direction,
        evidence_status, occurred_at, contact_name, company, email, phone,
        summary, property_address, confidence, match_status, match_reason, prospect_id, source_metadata
      ) VALUES (
        $1, $2, 'level_cre_mobile_calling', $3, 'call_started', 'outbound',
        'observed', $4, $5, $6, $7, $8, 'Call started from a phone link', $9,
        100, 'matched', 'broker_selected_prospect_and_phone', $10, $11::jsonb
      )
    `, [eventId, params.userId, params.input.clientEventId, callStartedAt, prospect.contact_name, prospect.contact_company || prospect.business_name, prospect.contact_email, params.input.expectedPhone, prospect.address, prospect.id, JSON.stringify({ sessionState: 'started', prospectId: prospect.id, contactId: prospect.calling_contact.id, contactSnapshot: prospect.calling_contact, callStartedAt, phoneSnapshot: params.input.expectedPhone, candidate: candidateSnapshot(prospect.calling_account, now), confirmationMethod: 'observed_phone_link_click', client: 'level_cre_responsive_web' })]);
    await client.query('COMMIT');
    return { duplicate: false, eventId, prospectId: prospect.id, status: 'started' as const, callStartedAt, contactId: prospect.calling_contact.id, contactSnapshot: prospect.calling_contact };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function discardMobileCallStart(params: { pool: Pool; userId: string; input: MobileCallDiscardInput }) {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    await lockSession(client, params.userId, params.input.clientEventId);
    const event: CallEvent | null = await findExistingEvent(client, params.userId, params.input.clientEventId);
    if (!event) {
      // Closing a rejected or delayed start must serialize with that start. A
      // tombstone prevents its original request from reviving a cancelled key.
      // Only an owned record authorizes a new ledger write; inactive and merged
      // records are allowed because this action creates no confirmed outreach.
      const owned = await client.query('SELECT id FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE', [params.input.prospectId,params.userId]);
      if (!owned.rows[0]) {
        await client.query('COMMIT');
        return { duplicate: false, eventId: null, prospectId: params.input.prospectId, status: 'unavailable' as const, canDismissLocally: true };
      }
      const eventId = randomUUID();
      await client.query(`INSERT INTO public.activity_events (
        id,user_id,source,external_event_id,event_type,direction,evidence_status,occurred_at,
        summary,confidence,match_status,match_reason,prospect_id,source_metadata
      ) VALUES ($1,$2,'level_cre_mobile_calling',$3,'call_started','outbound','observed',now(),
        'Call start cancelled by broker',100,'ignored','broker_cancelled_unsaved_start',$4,$5::jsonb)`,
      [eventId,params.userId,params.input.clientEventId,params.input.prospectId,JSON.stringify({sessionState:'discarded',prospectId:params.input.prospectId,contactId:params.input.contactId || null,discardedAt:new Date().toISOString(),discardReason:'broker_did_not_call',client:'level_cre_responsive_web'})]);
      await client.query('COMMIT');
      return { duplicate: false,eventId,prospectId:params.input.prospectId,status:'discarded' as const };
    }
    assertSameSession(event, params.input);
    const status = sessionState(event);
    if (status === 'confirmed') throw new MobileCallingError({ message: 'This call has already been confirmed. It cannot be undone as a phone-link click.', status: 409, code: 'call_already_confirmed' });
    if (status !== 'discarded') {
      await client.query(`
        UPDATE public.activity_events
        SET match_status = 'ignored', summary = 'Call start cancelled by broker',
            source_metadata = source_metadata || $3::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2
      `, [event.id, params.userId, JSON.stringify({ sessionState: 'discarded', discardedAt: new Date().toISOString(), discardReason: 'broker_did_not_call' })]);
    }
    await client.query('COMMIT');
    return { duplicate: status === 'discarded', eventId: event.id, prospectId: params.input.prospectId, status: 'discarded' as const };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type MobileCallPendingSession = {
  eventId: string;
  clientEventId: string;
  prospectId: string;
  phoneSnapshot: string;
  callStartedAt: string;
  candidate: MobileCallQueueCandidate;
  contactId: string | null;
  contactSnapshot: ProspectContact | null;
};

export async function getMobileCallingProgress(params: { pool: Pool; userId: string; now?: Date }) {
  const now = params.now || new Date();
  const [counts, pending, confirmedEvents, interactions] = await Promise.all([
    params.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE (COALESCE(NULLIF(source_metadata->>'callStartedAt', '')::timestamptz, occurred_at) AT TIME ZONE 'America/Edmonton')::date = ($2::timestamptz AT TIME ZONE 'America/Edmonton')::date) AS started_today
      FROM public.activity_events
      WHERE user_id = $1 AND source = 'level_cre_mobile_calling' AND match_status <> 'ignored'
        AND COALESCE(source_metadata->>'sessionState', '') <> 'discarded'
        AND source_metadata ? 'candidate'
    `, [params.userId, now.toISOString()]),
    params.pool.query(`
      SELECT id, external_event_id, prospect_id, phone, occurred_at, source_metadata
      FROM public.activity_events
      WHERE user_id = $1 AND source = 'level_cre_mobile_calling'
        AND event_type = 'call_started' AND evidence_status = 'observed'
        AND match_status <> 'ignored' AND source_metadata->>'sessionState' = 'started'
      ORDER BY occurred_at DESC
      LIMIT 50
    `, [params.userId]),
    params.pool.query(`
      SELECT id, occurred_at, event_type, interaction_id
      FROM public.activity_events
      WHERE user_id = $1 AND evidence_status = 'confirmed'
        AND event_type IN ('call_attempted', 'call_connected') AND match_status <> 'ignored'
    `, [params.userId]),
    params.pool.query(`
      SELECT id, date, created_at, outcome
      FROM public.contact_interactions
      WHERE user_id = $1 AND type = 'call'
    `, [params.userId]),
  ]);
  const count = counts.rows[0] || {};
  const pendingSessions: MobileCallPendingSession[] = pending.rows.flatMap((row) => {
    const metadata = row.source_metadata || {};
    const candidate = metadata.candidate;
    if (!candidate || !metadata.prospectId || !metadata.phoneSnapshot) return [];
    return [{ eventId: row.id, clientEventId: row.external_event_id, prospectId: metadata.prospectId, phoneSnapshot: metadata.phoneSnapshot, callStartedAt: metadata.callStartedAt || asDate(row.occurred_at)?.toISOString(), candidate, contactId: metadata.contactId || null, contactSnapshot: metadata.contactSnapshot || null }];
  });
  // Daily target includes existing manual calls and canonical ledger calls.
  // A linked event and interaction represent one call, regardless of source.
  const representedInteractions = new Set<string>();
  const confirmedCalls = new Map<string, { today: boolean; connected: boolean }>();
  let confirmedToday = 0;
  let connectedToday = 0;
  const today = brokerDayNumber(now);
  const isToday = (value: unknown, fallback?: unknown) => {
    const date = asDate(value) || asDate(fallback);
    return date ? brokerDayNumber(date) === today : false;
  };
  for (const event of confirmedEvents.rows) {
    if (event.interaction_id) representedInteractions.add(event.interaction_id);
    const key = event.interaction_id ? `interaction:${event.interaction_id}` : `event:${event.id}`;
    const group = confirmedCalls.get(key) || { today: false, connected: false };
    group.today ||= isToday(event.occurred_at);
    group.connected ||= event.event_type === 'call_connected';
    confirmedCalls.set(key, group);
  }
  for (const group of confirmedCalls.values()) {
    if (!group.today) continue;
    confirmedToday += 1;
    if (group.connected) connectedToday += 1;
  }
  const connectedOutcomes = new Set<string>(MOBILE_CALL_OUTCOMES.filter((outcome) => eventTypeForCallOutcome(outcome) === 'call_connected'));
  for (const interaction of interactions.rows) {
    if (representedInteractions.has(interaction.id) || !isToday(interaction.date, interaction.created_at)) continue;
    confirmedToday += 1;
    if (connectedOutcomes.has(interaction.outcome)) connectedToday += 1;
  }
  return { progress: { startedToday: Number(count.started_today || 0), confirmedToday, connectedToday }, pendingSessions };
}

export async function recordMobileCallOutcome(params: {
  pool: Pool;
  userId: string;
  input: MobileCallOutcomeInput;
}) {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');
    await lockSession(client, params.userId, params.input.clientEventId);
    const existing: CallEvent | null = await findExistingEvent(client, params.userId, params.input.clientEventId);
    if (existing) {
      assertSameSession(existing, params.input);
      if (sessionState(existing) === 'discarded') {
        throw new MobileCallingError({ message: 'This phone-link click was undone. Start a new call before confirming.', status: 409, code: 'call_start_discarded' });
      }
      if (sessionState(existing) === 'confirmed') {
        if (existing.source_metadata?.outcome && existing.source_metadata.outcome !== params.input.outcome) {
          throw new MobileCallingError({ message: 'This call was already confirmed with a different outcome.', status: 409, code: 'idempotency_conflict' });
        }
        await client.query('COMMIT');
        return { duplicate: true, eventId: existing.id, interactionId: existing.interaction_id, prospectId: params.input.prospectId, status: 'confirmed' as const };
      }
    }
    const prospect = await requireCallableProspect(client, params.userId, params.input, existing?.source_metadata?.contactSnapshot);
    const occurredAt = params.input.occurredAt || new Date().toISOString();
    const eventId = existing?.id || randomUUID();
    const metadata = {
      sessionState: 'confirmed',
      prospectId: params.input.prospectId,
      contactId: existing && !existing.source_metadata?.contactId ? null : prospect.calling_contact.id,
      contactSnapshot: existing && !existing.source_metadata?.contactId ? null : prospect.calling_contact,
      outcome: params.input.outcome,
      confirmationMethod: params.input.outcome === 'attempted' ? 'broker_confirmed_call_attempt' : 'broker_selected_mobile_outcome',
      callStartedAt: existing?.source_metadata?.callStartedAt || params.input.callStartedAt || null,
      phoneSnapshot: params.input.expectedPhone,
      client: 'level_cre_responsive_web',
    };
    if (existing) {
      await client.query(`
        UPDATE public.activity_events
        SET event_type = $3, evidence_status = 'confirmed', occurred_at = $4,
            summary = $5, match_status = 'matched', match_reason = 'broker_confirmed_prospect_and_phone',
            source_metadata = source_metadata || $6::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2
      `, [eventId, params.userId, eventTypeForCallOutcome(params.input.outcome), occurredAt, outcomeSummary(params.input.outcome, params.input.notes), JSON.stringify(metadata)]);
    } else {
      await client.query(`
      INSERT INTO public.activity_events (
        id, user_id, source, external_event_id, event_type, direction,
        evidence_status, occurred_at, contact_name, company, email, phone,
        summary, property_address, confidence, match_status, match_reason,
        prospect_id, source_metadata
      ) VALUES (
        $1, $2, 'level_cre_mobile_calling', $3, $4, 'outbound',
        'confirmed', $5, $6, $7, $8, $9, $10, $11, 100, 'matched',
        'broker_confirmed_prospect_and_phone', $12, $13::jsonb
      )
    `, [
      eventId,
      params.userId,
      params.input.clientEventId,
      eventTypeForCallOutcome(params.input.outcome),
      occurredAt,
      prospect.contact_name,
      prospect.contact_company || prospect.business_name,
      prospect.contact_email,
      prospect.contact_phone,
      outcomeSummary(params.input.outcome, params.input.notes),
      prospect.address,
      params.input.prospectId,
      JSON.stringify(metadata),
    ]);
    }

    const interactionId = randomUUID();
    await client.query(`
      INSERT INTO public.contact_interactions (
        id, user_id, prospect_id, date, type, outcome, notes, next_follow_up,
        source_provider, source_message_id, source_metadata
      ) VALUES ($1, $2, $3, $4, 'call', $5, $6, $7, 'level_cre_mobile', $8, $9::jsonb)
    `, [
      interactionId,
      params.userId,
      params.input.prospectId,
      occurredAt,
      params.input.outcome,
      params.input.notes,
      params.input.nextFollowUp === undefined ? null : params.input.nextFollowUp,
      params.input.clientEventId,
      JSON.stringify({ activityEventId: eventId, contactId: metadata.contactId, contactSnapshot: metadata.contactSnapshot, phoneSnapshot: params.input.expectedPhone, outcome: params.input.outcome }),
    ]);

    await client.query(`
      UPDATE public.activity_events
      SET interaction_id = $2, updated_at = now()
      WHERE id = $1 AND user_id = $3
    `, [eventId, interactionId, params.userId]);

    await client.query(`
      INSERT INTO public.activity_event_links (
        id, user_id, event_id, entity_type, entity_id, role, confidence, metadata
      ) VALUES ($1, $2, $3, 'prospect', $4, 'broker_confirmed_subject', 100, $5::jsonb)
      ON CONFLICT (event_id, entity_type, entity_id, role) DO NOTHING
    `, [randomUUID(), params.userId, eventId, params.input.prospectId, JSON.stringify({ phoneMatched: true })]);

    if (params.input.outcome === 'wrong_number' || params.input.outcome === 'disconnected') {
      const state = readPhoneReadinessMetadata(prospect.calling_account);
      if (!state || state.blocks.length >= 200) throw new MobileCallingError({ message: 'Phone findings need review before another finding can be saved.', status: 409, code: 'phone_metadata_conflict' });
      const block = { contactId: metadata.contactId, identityKey: contactIdentityKey(prospect.calling_contact), phoneKey: businessPhoneKey(params.input.expectedPhone)!, number: params.input.expectedPhone, reason: params.input.outcome, eventId, recordedAt: occurredAt };
      const aiMetadata = { ...(prospect.calling_account.ai_metadata || {}), phoneReadiness: { ...state, blocks: [...state.blocks, block], research: null } };
      await client.query('UPDATE public.prospects SET ai_metadata=$3::jsonb,updated_at=now() WHERE id=$1 AND user_id=$2', [prospect.id, params.userId, JSON.stringify(aiMetadata)]);
      prospect.calling_account.ai_metadata = aiMetadata;
    }
    const followUpProvided = Object.prototype.hasOwnProperty.call(params.input, 'nextFollowUp');
    const connected = eventTypeForCallOutcome(params.input.outcome) === 'call_connected';
    await client.query(`
      UPDATE public.prospects
      SET last_contact_date = CASE WHEN $6::boolean THEN $3 ELSE last_contact_date END,
          follow_up_due_date = CASE WHEN $4::boolean THEN $5::timestamptz ELSE follow_up_due_date END,
          status = CASE WHEN $6::boolean AND status = 'prospect' THEN 'contacted' ELSE status END,
          updated_at = now()
      WHERE id = $1 AND user_id = $2 AND merged_into_prospect_id IS NULL
    `, [params.input.prospectId, params.userId, occurredAt, followUpProvided, params.input.nextFollowUp ?? null, connected]);

    await client.query(`
      INSERT INTO public.skill_activities (
        id, user_id, skill_type, action, xp_gained, related_id, multiplier
      ) VALUES ($1, $2, 'followUp', 'phone_call', $3, $4, 1)
    `, [randomUUID(), params.userId, XP_VALUES.FOLLOW_UP_CALL, interactionId]);

    await client.query(`
      INSERT INTO public.broker_skills (
        id, user_id, prospecting, follow_up, consistency, market_knowledge,
        last_activity, streak_days, created_at, updated_at
      ) VALUES ($1, $2, 0, $3, 0, 0, now(), 1, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        follow_up = COALESCE(public.broker_skills.follow_up, 0) + EXCLUDED.follow_up,
        last_activity = now(),
        streak_days = CASE
          WHEN public.broker_skills.last_activity IS NULL THEN 1
          WHEN (public.broker_skills.last_activity AT TIME ZONE 'UTC' AT TIME ZONE 'America/Edmonton')::date = (now() AT TIME ZONE 'America/Edmonton')::date - 1 THEN COALESCE(public.broker_skills.streak_days, 0) + 1
          WHEN (public.broker_skills.last_activity AT TIME ZONE 'UTC' AT TIME ZONE 'America/Edmonton')::date < (now() AT TIME ZONE 'America/Edmonton')::date - 1 THEN 1
          ELSE GREATEST(COALESCE(public.broker_skills.streak_days, 0), 1)
        END,
        updated_at = now()
    `, [randomUUID(), params.userId, XP_VALUES.FOLLOW_UP_CALL]);

    await client.query('COMMIT');
    return {
      duplicate: false,
      eventId,
      interactionId,
      prospectId: params.input.prospectId,
      status: 'confirmed' as const,
      nextFollowUp: followUpProvided ? params.input.nextFollowUp ?? null : undefined,
      newXpGained: XP_VALUES.FOLLOW_UP_CALL,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
