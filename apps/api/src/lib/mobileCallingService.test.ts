import { primaryContactIdentity } from './prospectContactService';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MobileCallingError,
  MobileCallOutcomeSchema,
  MobileCallStartSchema,
  MobileCallDiscardSchema,
  discardMobileCallStart,
  eventTypeForCallOutcome,
  getMobileCallingProgress,
  listMobileCallQueue,
  phonesMatch,
  rankMobileCallCandidate,
  recordMobileCallOutcome,
  recordMobileCallStart,
} from './mobileCallingService';

test('mobile call outcome input requires an explicit prospect, phone snapshot, and idempotency key', () => {
  const valid = MobileCallOutcomeSchema.parse({
    clientEventId: 'call-session-123',
    prospectId: 'prospect-1',
    expectedPhone: '(780) 555-0100',
    outcome: 'left_message',
    occurredAt: '2026-08-22T16:00:00.000Z',
    nextFollowUp: '2026-08-25T18:00:00.000Z',
  });
  assert.equal(valid.outcome, 'left_message');
  assert.equal(MobileCallOutcomeSchema.safeParse({ ...valid, prospectName: 'fabricated' }).success, false);
  assert.equal(MobileCallOutcomeSchema.safeParse({ ...valid, expectedPhone: '' }).success, false);
});

test('phone snapshots match common North American formatting without fuzzy contact matching', () => {
  assert.equal(phonesMatch('+1 (780) 555-0100', '780-555-0100'), true);
  assert.equal(phonesMatch('780-555-0100', '780-555-0199'), false);
  assert.equal(phonesMatch('', '780-555-0100'), false);
  assert.equal(phonesMatch('780-555-0100 ext. 12', '(780) 555-0100 x12'), true);
  assert.equal(phonesMatch('780-555-0100 extension 12', '(780) 555-0100 x12'), true);
  assert.equal(phonesMatch('780-555-0100;ext=12', '(780) 555-0100 x12'), true);
  assert.equal(phonesMatch('780-555-0100,12', '(780) 555-0100;12'), true);
  assert.equal(phonesMatch('780-555-0100 ext. 12', '780-555-0100 ext. 13'), false);
  assert.equal(phonesMatch('780-555-0100 ext. 12', '780-555-010012'), false);
  assert.equal(phonesMatch('CALL 780-555-0100', '780-555-0100'), false);
  assert.equal(phonesMatch('++780-555-0100', '780-555-0100'), false);
});

test('call outcomes distinguish an attempt from a confirmed connection', () => {
  assert.equal(eventTypeForCallOutcome('attempted'), 'call_attempted');
  assert.equal(eventTypeForCallOutcome('no_answer'), 'call_attempted');
  assert.equal(eventTypeForCallOutcome('left_message'), 'call_attempted');
  assert.equal(eventTypeForCallOutcome('contacted'), 'call_connected');
  assert.equal(eventTypeForCallOutcome('scheduled_meeting'), 'call_connected');
});

test('call ranking prioritizes current reminders over unscheduled warm records', () => {
  const now = new Date('2026-08-22T18:00:00.000Z');
  const overdue = rankMobileCallCandidate({
    status: 'contacted',
    followUpDueDate: '2026-08-20T18:00:00.000Z',
    lastContactDate: '2026-08-01T18:00:00.000Z',
    now,
  });
  const unscheduled = rankMobileCallCandidate({
    status: 'contacted',
    lastContactDate: '2026-08-15T18:00:00.000Z',
    now,
  });
  assert.ok(overdue.score > unscheduled.score);
  assert.equal(overdue.priority, 'critical');
  assert.match(overdue.reasons[0], /overdue/);
});

test('call ranking evaluates reminders on the Edmonton calendar day', () => {
  const morningInEdmonton = new Date('2026-08-22T14:00:00.000Z');
  const laterTheSameEdmontonDay = rankMobileCallCandidate({
    status: 'contacted',
    followUpDueDate: '2026-08-23T05:30:00.000Z',
    now: morningInEdmonton,
  });

  assert.equal(laterTheSameEdmontonDay.reasons[0], 'Due today');
});

function outcomeHarness(options?: { existingEvent?: boolean; currentPhone?: string; prospect?: Record<string, unknown>; event?: Record<string, unknown> | null; failInteraction?: boolean }) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      if (text.includes('FROM public.prospects') && text.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'prospect-1',
          name: 'Acme Industrial',
          status: 'prospect',
          address: '123 Industrial Road',
          contact_name: 'Alex Owner',
          contact_email: 'alex@example.com',
          contact_phone: options?.currentPhone ?? '780-555-0100',
          contact_company: 'Acme Ltd.',
          business_name: null,
          merged_into_prospect_id: null,
          ...options?.prospect,
        }] };
      }
      if (text.includes('public.prospect_contacts')) {
        const fields = { contact_name: 'Alex Owner', contact_email: 'alex@example.com', contact_phone: options?.currentPhone ?? '780-555-0100', ...options?.prospect };
        return { rows: [{ id: '10000000-0000-4000-8000-000000000001', user_id: 'user-1', prospect_id: 'prospect-1',
          is_primary: true, source: 'legacy_primary', name: fields.contact_name, email: fields.contact_email,
          phone: fields.contact_phone, company: 'Acme Ltd.', identity_key: primaryContactIdentity(fields), additional_phones: [] }] };
      }
      if (text.includes('INSERT INTO public.activity_events')) {
        return { rows: options?.existingEvent ? [] : [{ id: 'event-1' }] };
      }
      if (text.includes('SELECT id, prospect_id, interaction_id')) {
        const event = options?.event ?? (options?.existingEvent ? {
          id: 'event-existing', prospect_id: 'prospect-1', interaction_id: 'interaction-existing',
          phone: '780-555-0100', event_type: 'call_connected', evidence_status: 'confirmed', match_status: 'matched',
          occurred_at: '2026-08-22T18:00:00.000Z', source_metadata: { outcome: 'contacted', phoneSnapshot: '780-555-0100' },
        } : null);
        return { rows: event ? [event] : [] };
      }
      if (text.includes('INSERT INTO public.contact_interactions') && options?.failInteraction) throw new Error('database unavailable');
      return { rows: [] };
    },
    release() { released = true; },
  };
  return {
    pool: { async connect() { return client; } } as any,
    queries,
    get released() { return released; },
  };
}

const outcomeInput = {
  clientEventId: 'call-session-123',
  prospectId: 'prospect-1',
  expectedPhone: '780-555-0100',
  outcome: 'contacted' as const,
  occurredAt: '2026-08-22T18:00:00.000Z',
  callStartedAt: '2026-08-22T17:55:00.000Z',
  notes: 'Discussed timing.',
  nextFollowUp: '2026-08-29T18:00:00.000Z',
};

test('recording a confirmed call writes the evidence, interaction, prospect, and scorecard in one transaction', async () => {
  const harness = outcomeHarness();
  const result = await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput });

  assert.equal(result.duplicate, false);
  assert.equal(result.prospectId, 'prospect-1');
  assert.ok(harness.queries.some((query) => query.text.includes('INSERT INTO public.contact_interactions')));
  assert.ok(harness.queries.some((query) => query.text.includes('INSERT INTO public.activity_event_links')));
  assert.ok(harness.queries.some((query) => query.text.includes('UPDATE public.prospects')));
  assert.ok(harness.queries.some((query) => query.text.includes('INSERT INTO public.skill_activities')));
  assert.ok(harness.queries.some((query) => query.text.includes('INSERT INTO public.broker_skills')));
  assert.equal(harness.queries.at(-1)?.text, 'COMMIT');
  assert.equal(harness.released, true);
});

test('replaying the same call confirmation returns the existing interaction without awarding activity twice', async () => {
  const harness = outcomeHarness({ existingEvent: true });
  const result = await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput });

  assert.equal(result.duplicate, true);
  assert.equal(result.interactionId, 'interaction-existing');
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.skill_activities')), false);
  assert.equal(harness.queries.at(-1)?.text, 'COMMIT');
});

test('call XP starts a streak at one and compares prior UTC timestamps on the Edmonton day', async () => {
  const harness = outcomeHarness();
  await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput });
  const skillsUpdate = harness.queries.find((query) => query.text.includes('INSERT INTO public.broker_skills'))!;
  assert.match(skillsUpdate.text, /VALUES \(\$1, \$2, 0, \$3, 0, 0, now\(\), 1, now\(\), now\(\)\)/);
  assert.match(skillsUpdate.text, /last_activity AT TIME ZONE 'UTC' AT TIME ZONE 'America\/Edmonton'/);
  assert.match(skillsUpdate.text, /GREATEST\(COALESCE\(public\.broker_skills\.streak_days, 0\), 1\)/);
});

test('a changed phone snapshot blocks attribution before any activity is written', async () => {
  const harness = outcomeHarness({ currentPhone: '780-555-0199' });
  await assert.rejects(
    recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput }),
    (error: unknown) => error instanceof MobileCallingError && error.code === 'prospect_phone_changed',
  );
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.activity_events')), false);
  assert.equal(harness.queries.at(-1)?.text, 'ROLLBACK');
  assert.equal(harness.released, true);
});

const startedEvent = {
  id: 'event-started', prospect_id: 'prospect-1', interaction_id: null,
  phone: '780-555-0100', event_type: 'call_started', evidence_status: 'observed', match_status: 'matched',
  occurred_at: '2026-08-22T17:55:00.000Z',
  source_metadata: { sessionState: 'started', prospectId: 'prospect-1', phoneSnapshot: '780-555-0100', callStartedAt: '2026-08-22T17:55:00.000Z' },
};

const startInput = {
  clientEventId: outcomeInput.clientEventId,
  prospectId: outcomeInput.prospectId,
  expectedPhone: outcomeInput.expectedPhone,
  callStartedAt: outcomeInput.callStartedAt,
};

test('start and undo accept only stable identities and reject a payload-supplied broker', () => {
  assert.equal(MobileCallStartSchema.safeParse(startInput).success, true);
  assert.equal(MobileCallStartSchema.safeParse({ ...startInput, userId: 'another-broker' }).success, false);
  assert.equal(MobileCallDiscardSchema.safeParse({ clientEventId: startInput.clientEventId, prospectId: startInput.prospectId }).success, true);
  assert.equal(MobileCallDiscardSchema.safeParse({ clientEventId: startInput.clientEventId, prospectId: startInput.prospectId, userId: 'another-broker' }).success, false);
  assert.equal(MobileCallOutcomeSchema.safeParse({ ...outcomeInput, outcome: 'attempted', nextFollowUp: undefined }).success, true);
});

test('one click persists an observed session and candidate snapshot without claiming contact or awarding XP', async () => {
  const harness = outcomeHarness();
  const result = await recordMobileCallStart({ pool: harness.pool, userId: 'user-1', input: startInput });
  assert.equal(result.status, 'started');
  assert.equal(result.duplicate, false);
  const insert = harness.queries.find((query) => query.text.includes('INSERT INTO public.activity_events'))!;
  assert.match(insert.text, /'call_started'/);
  assert.match(insert.text, /'observed'/);
  assert.equal(insert.values?.[1], 'user-1');
  const metadata = JSON.parse(String(insert.values?.[10]));
  assert.equal(metadata.prospectId, 'prospect-1');
  assert.equal(metadata.candidate.id, 'call:prospect-1');
  assert.equal(metadata.candidate.contact.phone, startInput.expectedPhone);
  assert.equal(harness.queries.some((query) => /INSERT INTO public.contact_interactions|INSERT INTO public.skill_activities|UPDATE public.prospects/.test(query.text)), false);
  assert.equal(harness.queries.at(-1)?.text, 'COMMIT');
});

test('replayed start reconciles a completed session even when the current prospect phone has changed', async () => {
  const harness = outcomeHarness({ existingEvent: true, currentPhone: '780-555-0199' });
  const result = await recordMobileCallStart({ pool: harness.pool, userId: 'user-1', input: startInput });
  assert.equal(result.duplicate, true);
  assert.equal(result.status, 'confirmed');
  assert.equal(harness.queries.some((query) => query.text.includes('FROM public.prospects')), false);
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO')), false);
});

test('confirmation upgrades the start event and preserves its original timestamp without double counting a click', async () => {
  const harness = outcomeHarness({ event: startedEvent });
  const { nextFollowUp: _nextFollowUp, ...input } = outcomeInput;
  const result = await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: { ...input, outcome: 'attempted', callStartedAt: '2026-08-22T17:58:00.000Z' } });
  assert.equal(result.eventId, startedEvent.id);
  assert.equal(result.status, 'confirmed');
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.activity_events')), false);
  const upgrade = harness.queries.find((query) => query.text.includes('SET event_type = $3'))!;
  assert.equal(upgrade.values?.[2], 'call_attempted');
  const metadata = JSON.parse(String(upgrade.values?.[5]));
  assert.equal(metadata.callStartedAt, startedEvent.source_metadata.callStartedAt);
  assert.equal(metadata.confirmationMethod, 'broker_confirmed_call_attempt');
  const prospectUpdate = harness.queries.find((query) => query.text.includes('UPDATE public.prospects'))!;
  assert.equal(prospectUpdate.values?.[3], false, 'a plain confirmation does not change the follow-up date');
  assert.equal(prospectUpdate.values?.[5], false, 'an attempt does not mark the prospect contacted or change last meaningful contact');
  assert.equal(harness.queries.filter((query) => query.text.includes('INSERT INTO public.skill_activities')).length, 1);
});

test('no answer and voicemail preserve meaningful contact dates unless the broker supplies a follow-up', async () => {
  const { nextFollowUp: _nextFollowUp, ...input } = outcomeInput;
  for (const outcome of ['no_answer', 'left_message'] as const) {
    const harness = outcomeHarness();
    await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: { ...input, outcome } });
    const prospectUpdate = harness.queries.find((query) => query.text.includes('UPDATE public.prospects'))!;
    assert.equal(prospectUpdate.values?.[3], false);
    assert.equal(prospectUpdate.values?.[5], false);
  }
});

test('a replayed confirmation remains harmless after a prospect becomes inactive', async () => {
  const harness = outcomeHarness({ existingEvent: true, prospect: { status: 'no_go', merged_into_prospect_id: 'merged-1' } });
  const result = await recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput });
  assert.equal(result.duplicate, true);
  assert.equal(harness.queries.some((query) => query.text.includes('FROM public.prospects')), false);
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.skill_activities')), false);
});

test('new starts and confirmations reject inactive, missing and merged prospects before activity writes', async () => {
  for (const prospect of [{ status: 'no_go' }, { merged_into_prospect_id: 'prospect-canonical' }]) {
    for (const action of ['start', 'confirm'] as const) {
      const harness = outcomeHarness({ prospect });
      const request = action === 'start'
        ? recordMobileCallStart({ pool: harness.pool, userId: 'user-1', input: startInput })
        : recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput });
      await assert.rejects(request, (error: unknown) => error instanceof MobileCallingError && ['prospect_inactive', 'prospect_merged'].includes(error.code));
      assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.activity_events')), false);
      assert.equal(harness.queries.at(-1)?.text, 'ROLLBACK');
    }
  }
  // A broker-scoped lookup which returns no row must never create a prospect.
  const absentPool = { async connect() { return { async query(text: string) { return { rows: [] }; }, release() {} }; } } as any;
  await assert.rejects(recordMobileCallStart({ pool: absentPool, userId: 'other-broker', input: startInput }), (error: unknown) => error instanceof MobileCallingError && error.code === 'prospect_not_found');
});

test('a reused key cannot attribute another prospect or number', async () => {
  for (const input of [{ ...startInput, prospectId: 'prospect-2' }, { ...startInput, expectedPhone: '780-555-0199' }]) {
    const harness = outcomeHarness({ event: startedEvent });
    await assert.rejects(recordMobileCallStart({ pool: harness.pool, userId: 'user-1', input }), (error: unknown) => error instanceof MobileCallingError && error.code === 'idempotency_conflict');
    assert.equal(harness.queries.at(-1)?.text, 'ROLLBACK');
  }
});

test('undo marks only an unconfirmed start ignored and remains replayable after a phone or merge change', async () => {
  const harness = outcomeHarness({ event: startedEvent, currentPhone: '780-555-0199', prospect: { merged_into_prospect_id: 'prospect-2' } });
  const input = { clientEventId: startInput.clientEventId, prospectId: startInput.prospectId };
  const result = await discardMobileCallStart({ pool: harness.pool, userId: 'user-1', input });
  assert.equal(result.status, 'discarded');
  assert.equal(result.duplicate, false);
  assert.equal(harness.queries.some((query) => query.text.includes('FROM public.prospects')), false);
  assert.ok(harness.queries.some((query) => query.text.includes("match_status = 'ignored'")));
  const replay = outcomeHarness({ event: { ...startedEvent, match_status: 'ignored', source_metadata: { ...startedEvent.source_metadata, sessionState: 'discarded' } } });
  assert.equal((await discardMobileCallStart({ pool: replay.pool, userId: 'user-1', input })).duplicate, true);
  assert.equal(replay.queries.some((query) => query.text.includes('UPDATE')), false);
});

test('undo cannot silently remove a confirmed call and confirmation cannot revive a discarded click', async () => {
  const confirmed = outcomeHarness({ existingEvent: true });
  await assert.rejects(discardMobileCallStart({ pool: confirmed.pool, userId: 'user-1', input: { clientEventId: startInput.clientEventId, prospectId: startInput.prospectId } }), (error: unknown) => error instanceof MobileCallingError && error.code === 'call_already_confirmed');
  const discarded = outcomeHarness({ event: { ...startedEvent, match_status: 'ignored' } });
  await assert.rejects(recordMobileCallOutcome({ pool: discarded.pool, userId: 'user-1', input: outcomeInput }), (error: unknown) => error instanceof MobileCallingError && error.code === 'call_start_discarded');
  assert.equal(discarded.queries.some((query) => query.text.includes('INSERT INTO')), false);
});

test('an interaction failure rolls back the ledger upgrade and XP together', async () => {
  const harness = outcomeHarness({ event: startedEvent, failInteraction: true });
  await assert.rejects(recordMobileCallOutcome({ pool: harness.pool, userId: 'user-1', input: outcomeInput }), /database unavailable/);
  assert.equal(harness.queries.at(-1)?.text, 'ROLLBACK');
  assert.equal(harness.queries.some((query) => query.text.includes('INSERT INTO public.skill_activities')), false);
  assert.equal(harness.released, true);
});

test('pending sessions recover the original contact even if the current queue no longer includes it', async () => {
  const candidate = { id: 'call:prospect-1', contact: { phone: '780-555-0100' }, prospect: { id: 'prospect-1', name: 'Acme' } };
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const pool = { async query(text: string, values: unknown[]) {
    queries.push({ text, values });
    if (text.includes('AS started_today')) return { rows: [{ started_today: '4' }] };
    if (text.includes("event_type = 'call_started'")) return { rows: [{ id: 'event-started', external_event_id: startInput.clientEventId, source_metadata: { ...startedEvent.source_metadata, candidate } }] };
    if (text.includes('FROM public.contact_interactions')) return { rows: [{ id: 'manual-1', outcome: 'no_answer', date: '2026-08-22T18:00:00.000Z' }] };
    return { rows: [{ id: 'event-confirmed-1', event_type: 'call_attempted', occurred_at: '2026-08-22T18:00:00.000Z' }, { id: 'event-confirmed-2', event_type: 'call_connected', occurred_at: '2026-08-22T18:00:00.000Z' }] };
  } } as any;
  const result = await getMobileCallingProgress({ pool, userId: 'user-1', now: new Date('2026-08-22T18:00:00.000Z') });
  assert.deepEqual(result.progress, { startedToday: 4, confirmedToday: 3, connectedToday: 1 });
  assert.equal(result.pendingSessions[0].candidate, candidate);
  assert.equal(result.pendingSessions[0].prospectId, 'prospect-1');
  assert.ok(queries.every((query) => query.values[0] === 'user-1'));
  assert.ok(queries.filter((query) => query.text.includes('FROM public.activity_events')).every((query) => query.text.includes("match_status <> 'ignored'")));
});

test('daily confirmed totals include manual calls, exclude phone-link clicks and deduplicate linked events', async () => {
  const queries: string[] = [];
  let reverseEvidence = false;
  const pool = { async query(text: string) {
    queries.push(text);
    if (text.includes('AS started_today')) return { rows: [{ started_today: '5' }] };
    if (text.includes("event_type = 'call_started'")) return { rows: [] };
    if (text.includes('FROM public.contact_interactions')) return { rows: [
      { id: 'linked-mobile', outcome: 'contacted', date: '2026-08-22T18:00:00.000Z' },
      { id: 'manual-connected', outcome: 'contacted', date: '2026-08-22T18:00:00.000Z' },
      { id: 'manual-attempt', outcome: 'attempted', date: '2026-08-22T18:00:00.000Z' },
      { id: 'manual-voicemail', outcome: 'left_message', date: '2026-08-22T18:00:00.000Z' },
      { id: 'prior-day', outcome: 'contacted', date: '2026-08-22T05:59:00.000Z' },
      { id: 'legacy-bad-date', outcome: 'no_answer', date: 'unknown', created_at: new Date('2026-08-22T18:00:00.000Z') },
    ] };
    const evidence = [
      { id: 'mobile-event', event_type: 'call_connected', interaction_id: 'linked-mobile', occurred_at: '2026-08-22T18:00:00.000Z' },
      { id: 'duplicate-evidence', event_type: 'call_attempted', interaction_id: 'linked-mobile', occurred_at: '2026-08-22T18:00:00.000Z' },
      { id: 'canonical-unlinked', event_type: 'call_attempted', interaction_id: null, occurred_at: '2026-08-22T18:00:00.000Z' },
    ];
    return { rows: reverseEvidence ? evidence.reverse() : evidence };
  } } as any;
  const result = await getMobileCallingProgress({ pool, userId: 'user-1', now: new Date('2026-08-22T18:00:00.000Z') });
  assert.deepEqual(result.progress, { startedToday: 5, confirmedToday: 6, connectedToday: 2 });
  reverseEvidence = true;
  const reversed = await getMobileCallingProgress({ pool, userId: 'user-1', now: new Date('2026-08-22T18:00:00.000Z') });
  assert.deepEqual(reversed.progress, result.progress);
  const startLedgerQuery = queries.find((text) => text.includes('AS started_today'))!;
  assert.match(startLedgerQuery, /source_metadata \? 'candidate'/);
  const confirmedLedgerQuery = queries.find((text) => text.includes("evidence_status = 'confirmed'"))!;
  assert.match(confirmedLedgerQuery, /event_type IN \('call_attempted', 'call_connected'\)/);
  assert.match(confirmedLedgerQuery, /match_status <> 'ignored'/);
  assert.doesNotMatch(confirmedLedgerQuery, /source = 'level_cre_mobile_calling'/);
});

test('queue count represents all eligible prospects instead of the returned page size', async () => {
  let parameters: unknown[] = [];
  const pool = { async query(_text: string, values: unknown[]) {
    parameters = values;
    return { rows: [{ id: 'prospect-1', name: 'Acme', status: 'prospect', contact_phone: '780-555-0100', total_eligible: '73' }] };
  } } as any;
  const result = await listMobileCallQueue({ pool, userId: 'user-1', limit: 1, includeCalledToday: true });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, 'call:prospect-1');
  assert.equal(result.totalEligible, 73);
  assert.equal(parameters[0], 'user-1');
  assert.equal(parameters[3], true);
});

test('equal call priorities keep the same chronological and prospect order across refetches', async () => {
  const records = [
    { id: 'prospect-b', follow_up_due_date: '2026-06-02T18:00:00.000Z' },
    { id: 'prospect-a', follow_up_due_date: '2026-06-02T18:00:00.000Z' },
    { id: 'prospect-c', follow_up_due_date: '2026-06-01T18:00:00.000Z' },
  ].map((record) => ({ ...record, name: record.id, status: 'contacted', contact_phone: '780-555-0100', last_contact_date: '2026-05-01T18:00:00.000Z' }));
  const queries: string[] = [];
  const fetch = async (rows: typeof records) => listMobileCallQueue({
    pool: { async query(text: string) { queries.push(text); return { rows }; } } as any,
    userId: 'user-1', limit: 3, now: new Date('2026-08-22T18:00:00.000Z'),
  });
  const first = await fetch(records);
  const second = await fetch([...records].reverse());
  assert.ok(first.rows.every((candidate) => candidate.priorityScore === 100));
  assert.deepEqual(first.rows.map((candidate) => candidate.prospect.id), ['prospect-c', 'prospect-a', 'prospect-b']);
  assert.deepEqual(second.rows.map((candidate) => candidate.prospect.id), first.rows.map((candidate) => candidate.prospect.id));
  assert.ok(queries.every((query) => /ORDER BY COALESCE\(p\.follow_up_due_date, latest\.last_interaction_at, p\.created_at\) ASC, p\.id ASC/.test(query)));
});
