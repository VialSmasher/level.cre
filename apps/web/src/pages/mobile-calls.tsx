import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Phone, RotateCcw } from 'lucide-react'
import { Link } from 'wouter'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import {
  buildTelHref, callSessionStorageKey, nextCallFollowUpIso, parseStoredCallSession,
  type CallQueueCandidate, type CallQueueResponse, type MobileCallOutcome,
  type MobileCallSession, type NextCallStep,
} from '@/lib/mobileCalling'
import { cn } from '@/lib/utils'

const NEXT_STEPS: Array<{ value: 'keep' | NextCallStep; label: string }> = [
  { value: 'keep', label: 'Keep existing' }, { value: 'tomorrow', label: 'Tomorrow' },
  { value: '3d', label: '3 days' }, { value: '1w', label: '1 week' },
  { value: '1m', label: '1 month' }, { value: 'none', label: 'None' },
]

function displayName(candidate: CallQueueCandidate) {
  return candidate.contact.name || candidate.contact.company || candidate.prospect.name
}

function companyName(candidate: CallQueueCandidate) {
  return candidate.contact.company || candidate.prospect.businessName || candidate.prospect.name
}

function loadSession(brokerId: string) {
  try { return parseStoredCallSession(localStorage.getItem(callSessionStorageKey(brokerId)), brokerId) }
  catch { return null }
}

function newClientEventId() {
  return `call-${crypto.randomUUID()}`
}

export default function MobileCallsPage() {
  const { user, isDemoMode } = useAuth()
  const brokerId = isDemoMode ? 'demo-user' : user?.id
  return brokerId ? <CallingDesk key={brokerId} brokerId={brokerId} /> : null
}

function CallingDesk({ brokerId }: { brokerId: string }) {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const { toast } = useToast()
  const [session, setSession] = useState<MobileCallSession | null>(() => loadSession(brokerId))
  const sessionRef = useRef(session)
  const completionRef = useRef(false)
  const confirmationRef = useRef(session?.confirmation)
  const restorationChecked = useRef(false)
  const nameRef = useRef<HTMLHeadingElement>(null)
  const [focusNext, setFocusNext] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set())
  const [includeCalledToday, setIncludeCalledToday] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(() => session?.confirmation?.notes || '')
  const [nextStep, setNextStep] = useState<'keep' | NextCallStep>('keep')
  const [announcement, setAnnouncement] = useState('')
  const queueKey = ['/api/calling/queue', brokerId, includeCalledToday] as const
  const queueQuery = useQuery<CallQueueResponse>({
    queryKey: queueKey,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/calling/queue?limit=25${includeCalledToday ? '&includeCalledToday=true' : ''}`)
      return response.json()
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
  const candidates = (queueQuery.data?.rows || []).filter((candidate) => !completedIds.has(candidate.prospect.id))
  const activeCandidate = session?.candidate || candidates[Math.min(activeIndex, Math.max(0, candidates.length - 1))] || null

  const persistSession = (value: MobileCallSession | null) => {
    sessionRef.current = value
    setSession(value)
    try {
      if (value) localStorage.setItem(callSessionStorageKey(brokerId), JSON.stringify(value))
      else localStorage.removeItem(callSessionStorageKey(brokerId))
    } catch {
      // The server also keeps the started session when browser storage is unavailable.
    }
  }

  const resetForm = () => {
    persistSession(null)
    completionRef.current = false
    confirmationRef.current = undefined
    setNotes('')
    setShowNotes(false)
    setShowOptions(false)
    setNextStep('keep')
    startMutation.reset()
    outcomeMutation.reset()
  }

  const refreshActivity = () => {
    for (const queryKey of [
      ['/api/calling/queue', brokerId], ['/api/automation/sales-brief?limit=25'],
      ['/api/automation/activity-pulse'], ['/api/prospects'], ['/api/interactions'],
      ['/api/automation/production-activities'],
      ['/api/skill-activities'], ['/api/skills'], ['/api/stats/header'],
    ]) void queryClient.invalidateQueries({ queryKey })
  }

  const startMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      const response = await apiRequest('POST', '/api/calling/starts', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, callStartedAt: started.startedAt,
      }, { keepalive: true })
      return response.json()
    },
    onSuccess: (result, started) => {
      if (sessionRef.current?.clientEventId !== started.clientEventId) return
      if (result.status !== 'started') {
        resetForm()
        if (result.status === 'confirmed') setCompletedIds((ids) => new Set(ids).add(started.prospectId))
        refreshActivity()
        return
      }
      persistSession({ ...sessionRef.current, recorded: true })
      setAnnouncement('Call start recorded. Confirm when you have tried the call.')
      void queueQuery.refetch()
    },
  })

  const outcomeMutation = useMutation({
    mutationFn: async ({ started, confirmation }: { started: MobileCallSession; confirmation: NonNullable<MobileCallSession['confirmation']> }) => {
      const response = await apiRequest('POST', '/api/calling/outcomes', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, ...confirmation,
        occurredAt: started.startedAt, callStartedAt: started.startedAt,
      }, { keepalive: true })
      return response.json()
    },
    onSuccess: (result, { started }) => {
      if (sessionRef.current?.clientEventId !== started.clientEventId) return
      toast({
        title: result.newXpGained > 0 ? 'Call saved · +' + result.newXpGained : 'Call already recorded',
        description: companyName(started.candidate),
        className: 'mt-14 border-slate-200 bg-white py-3 pl-4 pr-10 shadow-sm sm:mt-0',
        duration: 2400,
      })
      // Advance the card without waiting for unrelated dashboard queries.
      setCompletedIds((ids) => new Set(ids).add(started.prospectId))
      setActiveIndex(0)
      queryClient.setQueryData<CallQueueResponse>(queueKey, (current) => current ? {
        ...current,
        rows: current.rows.filter((candidate) => candidate.prospect.id !== started.prospectId),
        pendingSessions: (current.pendingSessions || []).filter((item) => item.clientEventId !== started.clientEventId),
      } : current)
      resetForm()
      setFocusNext(true)
      setAnnouncement(`${displayName(started.candidate)} confirmed. Next prospect ready.`)
      refreshActivity()
    },
    onSettled: () => { completionRef.current = false },
  })

  const discardMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      // Resolve a lost start response under the same key before discarding it.
      if (!started.recorded) await startMutation.mutateAsync(started)
      const response = await apiRequest('POST', '/api/calling/discards', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
      })
      return response.json()
    },
    onSuccess: (_result, started) => {
      if (sessionRef.current?.clientEventId !== started.clientEventId) return
      queryClient.setQueryData<CallQueueResponse>(queueKey, (current) => current ? {
        ...current, pendingSessions: (current.pendingSessions || []).filter((item) => item.clientEventId !== started.clientEventId),
      } : current)
      resetForm()
      setAnnouncement('Call start undone.')
      void queueQuery.refetch()
    },
  })

  useEffect(() => {
    if (!queueQuery.data) return
    if (!restorationChecked.current) {
      restorationChecked.current = true
      const stored = sessionRef.current
      if (stored) startMutation.mutate(stored)
    }
    if (sessionRef.current) return
    const pending = queueQuery.data.pendingSessions?.find((item) => !completedIds.has(item.prospectId))
    if (!pending?.candidate) return
    persistSession({
      brokerId, clientEventId: pending.clientEventId, prospectId: pending.prospectId,
      expectedPhone: pending.phoneSnapshot, startedAt: pending.callStartedAt,
      recorded: true, candidate: pending.candidate,
    })
  }, [queueQuery.data, completedIds])

  useEffect(() => {
    if (!focusNext || !activeCandidate || session) return
    nameRef.current?.focus()
    setFocusNext(false)
  }, [focusNext, activeCandidate?.prospect.id, session])

  const busy = outcomeMutation.isPending || discardMutation.isPending
  const submissionLocked = busy || Boolean(session?.confirmation)
  const startCall = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!activeCandidate || sessionRef.current || busy) { event.preventDefault(); return }
    const started: MobileCallSession = {
      brokerId, clientEventId: newClientEventId(), prospectId: activeCandidate.prospect.id,
      expectedPhone: activeCandidate.contact.phone, startedAt: new Date().toISOString(),
      candidate: activeCandidate, recorded: false,
    }
    persistSession(started)
    setAnnouncement(`Starting a call to ${displayName(activeCandidate)}.`)
    // Native link activation stays synchronous; recording proceeds alongside the dialer.
    startMutation.mutate(started)
  }
  const confirm = (outcome: MobileCallOutcome = 'attempted') => {
    const started = sessionRef.current
    if (!started || busy || completionRef.current) return
    completionRef.current = true
    const confirmation = confirmationRef.current || {
      outcome, notes: notes.trim(),
      ...(nextStep === 'keep' ? {} : { nextFollowUp: nextCallFollowUpIso(nextStep) }),
    }
    confirmationRef.current = confirmation
    persistSession({ ...started, confirmation })
    outcomeMutation.mutate({ started, confirmation })
  }

  const progress = queueQuery.data?.progress || { startedToday: 0, confirmedToday: 0, connectedToday: 0 }
  const recordedSessionIsListed = queueQuery.data?.pendingSessions?.some((item) => item.clientEventId === session?.clientEventId)
  const brokerDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(date)
  const pendingCredit = session && brokerDate(new Date(session.startedAt)) === brokerDate(new Date()) && !recordedSessionIsListed && !startMutation.isError && !discardMutation.isPending ? 1 : 0
  const startedToday = progress.startedToday + pendingCredit
  const callTarget = Math.max(0, Math.trunc(Number(profile?.goals?.callsPerDay) || 0))
  const targetPercent = callTarget ? Math.min(100, (progress.confirmedToday / callTarget) * 100) : 0
  const telHref = activeCandidate ? buildTelHref(activeCandidate.contact.phone) : null
  const error = outcomeMutation.error || discardMutation.error || startMutation.error
  const upcoming = candidates.filter((candidate) => candidate.prospect.id !== activeCandidate?.prospect.id).slice(0, 4)
  const recentActivity = activeCandidate?.recentActivity[0]

  return (
    <div className="min-h-[calc(100dvh-7.5rem)] bg-slate-50 lg:min-h-screen">
      <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Back to Today">
              <Link href="/app/desk"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-base font-semibold text-slate-950">Calls</h1>
          </div>
          <Button variant="ghost" size="icon" aria-label="Refresh call queue" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
            <RotateCcw className={cn('h-4 w-4', queueQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 lg:px-6">
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="Today's calling progress">
          <dl className="grid grid-cols-3 gap-3">
            <div><dt className="text-[11px] text-slate-500">Started today</dt><dd data-testid="calls-started-today" className="mt-0.5 text-xl font-semibold tabular-nums text-slate-600">{startedToday}</dd></div>
            <div><dt className="text-[11px] text-slate-500">Confirmed today</dt><dd data-testid="calls-confirmed-today" className="mt-0.5 text-xl font-semibold tabular-nums text-blue-700">{progress.confirmedToday}</dd></div>
            <div><dt className="text-[11px] text-slate-500">Conversations</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-700">{progress.connectedToday}</dd></div>
          </dl>
          {callTarget ? (
            <div className="mt-2 flex items-center gap-3">
              <div role="progressbar" aria-label="Daily call target" aria-valuenow={Math.min(progress.confirmedToday, callTarget)} aria-valuemin={0} aria-valuemax={callTarget} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: targetPercent + '%' }} /></div>
              <span className="shrink-0 text-[11px] text-slate-500">{progress.confirmedToday} / {callTarget} daily target</span>
            </div>
          ) : null}
        </section>

        <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
        {error ? (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">Recording failed</p>
            <p className="mt-1 text-xs text-amber-900">{session?.recorded ? 'Your call start is saved. Confirm again to finish; the same call will be reused.' : 'Your call start has not been recorded. Retry here without dialing again.'}</p>
            {startMutation.isError && session ? <Button className="mt-2" variant="outline" onClick={() => startMutation.mutate(session)} disabled={startMutation.isPending || busy}>Retry recording</Button> : null}
          </div>
        ) : null}

        {queueQuery.isLoading && !activeCandidate ? <p className="py-8 text-center text-sm text-slate-500">Finding your next call...</p> : null}
        {queueQuery.isError && !activeCandidate ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-center"><p className="font-semibold">Call queue unavailable</p><Button className="mt-3" variant="outline" onClick={() => queueQuery.refetch()}>Try again</Button></div>
        ) : null}

        {activeCandidate ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Current call">
            <div className="px-4 pb-2 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">{activeCandidate.reasons[0] || 'Ready to call'}</span>
                <Link href={'/app?prospectId=' + encodeURIComponent(activeCandidate.prospect.id)} onClick={() => {
                  try { window.localStorage.setItem('levelcre:focusProspectId', activeCandidate.prospect.id); } catch {}
                }} className="inline-flex min-h-8 shrink-0 items-center rounded text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">View record<ArrowRight className="ml-1 h-3 w-3" /></Link>
              </div>
              <h2 ref={nameRef} tabIndex={-1} className="break-words text-xl font-semibold leading-tight text-slate-950 outline-none">{companyName(activeCandidate)}</h2>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                {activeCandidate.contact.name && activeCandidate.contact.name !== companyName(activeCandidate) ? <p className="text-slate-600">{activeCandidate.contact.name}</p> : null}
                <p className="font-medium tabular-nums text-slate-800">{activeCandidate.contact.phone}</p>
              </div>
              {activeCandidate.prospect.address ? <p className="mt-2 text-xs leading-5 text-slate-500">{activeCandidate.prospect.address}</p> : null}
              {activeCandidate.listingTitles.length ? <p className="mt-1 text-xs text-slate-500">Pursuit: {activeCandidate.listingTitles.slice(0, 2).join(' · ')}</p> : null}
              {!telHref && !session ? <p className="mt-2 text-xs leading-4 text-amber-700">This record needs one dialable number. Check the linked record or skip for now.</p> : null}
              {recentActivity ? (
                <details key={activeCandidate.prospect.id} className="group mt-3 border-t border-slate-100">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between rounded text-xs text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">Recent activity<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
                  <p className="pb-2 text-xs leading-5 text-slate-600">{recentActivity.notes || recentActivity.outcome.replaceAll('_', ' ')}</p>
                </details>
              ) : null}
              {session ? <p className={cn('mt-2 text-xs font-medium', startMutation.isError ? 'text-amber-700' : 'text-emerald-700')}>{session.recorded ? 'Call started' : startMutation.isError ? 'Call start not recorded' : 'Saving call start...'}</p> : null}
            </div>

            <div className="border-t border-slate-100 px-4 py-3">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                {session ? <Button variant="ghost" className="h-11 px-2 text-xs text-slate-500" disabled={busy} onClick={() => discardMutation.mutate(session)}>Didn't call</Button> : <Button variant="ghost" className="h-11 px-3 text-slate-500" disabled={candidates.length < 2} onClick={() => setActiveIndex((index) => (index + 1) % candidates.length)}>Skip</Button>}
                {session ? (
                  <Button className="h-11 gap-2 bg-emerald-700 text-sm font-semibold hover:bg-emerald-800" disabled={busy} onClick={() => confirm()}>{outcomeMutation.isPending ? 'Confirming...' : discardMutation.isPending ? 'Undoing...' : 'I called · next'}<ArrowRight className="h-4 w-4" /></Button>
                ) : telHref ? (
                  <Button asChild className="h-11 bg-blue-600 text-sm font-semibold hover:bg-blue-700"><a href={telHref} onClick={startCall}><Phone className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">Call {displayName(activeCandidate)}</span></a></Button>
                ) : <Button className="h-11" disabled>Check phone number</Button>}
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-500">{session ? 'Confirm after trying the call.' : 'Opens your dialer.'}</p>

              {session ? (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setShowNotes((value) => !value)} aria-expanded={showNotes} aria-controls="call-notes">{showNotes ? 'Hide note' : 'Add a note'}</Button>
                    <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setShowOptions((value) => !value)} aria-expanded={showOptions} aria-controls="call-options">More options<ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>
                  </div>
                  {showNotes ? (
                    <div id="call-notes" className="mt-2">
                      <div className="mb-2 flex items-center justify-between"><label htmlFor="call-note" className="text-xs font-semibold text-slate-500">Note · optional</label><VoiceDictationButton disabled={submissionLocked} onTranscript={(text) => setNotes((current) => current ? current.trimEnd() + ' ' + text : text)} /></div>
                      <Textarea id="call-note" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Just the useful bit..." disabled={submissionLocked} />
                    </div>
                  ) : null}
                  {showOptions ? (
                    <div id="call-options" className="mt-3 space-y-3">
                      <div><p className="mb-2 text-xs font-semibold text-slate-500">Choose an outcome and move on</p><div className="grid grid-cols-3 gap-2">
                        <Button variant="outline" className="h-11 px-2 text-xs" disabled={submissionLocked} onClick={() => confirm('no_answer')}>No answer</Button>
                        <Button variant="outline" className="h-11 px-2 text-xs" disabled={submissionLocked} onClick={() => confirm('left_message')}>Voicemail</Button>
                        <Button variant="outline" className="h-11 px-2 text-xs" disabled={submissionLocked} onClick={() => confirm('contacted')}>Connected</Button>
                      </div></div>
                      {session.confirmation ? <p className="text-xs text-slate-500">Retry will use your saved outcome and note. Follow-up: {session.confirmation.nextFollowUp === undefined ? 'keep existing' : session.confirmation.nextFollowUp === null ? 'none' : new Date(session.confirmation.nextFollowUp).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' })}.</p> : <div><p className="mb-2 text-xs font-semibold text-slate-500">Next follow-up · optional</p><div className="flex flex-wrap gap-2">{NEXT_STEPS.map((item) => <Button key={item.value} size="sm" variant={nextStep === item.value ? 'default' : 'outline'} aria-pressed={nextStep === item.value} disabled={submissionLocked} onClick={() => setNextStep(item.value)}>{item.label}</Button>)}</div></div>}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : !queueQuery.isLoading && !queueQuery.isError ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-center"><Check className="mx-auto h-6 w-6 text-emerald-600" /><h2 className="mt-2 text-lg font-bold text-slate-950">You're through the queue</h2><p className="mt-2 text-sm text-slate-500">{progress.confirmedToday ? progress.confirmedToday + ' calls confirmed today. Good progress.' : 'No prospects with a saved phone number are ready.'}</p><Button className="mt-4" variant="outline" onClick={() => { setCompletedIds(new Set()); setIncludeCalledToday(true) }}>Show contacts called today</Button></section>
        ) : null}

        {upcoming.length ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Next companies">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5"><h2 className="text-xs font-semibold text-slate-700">Up next</h2><span className="text-[11px] text-slate-500">{queueQuery.data?.totalEligible ?? candidates.length} in queue</span></div>
            <ol className="divide-y divide-slate-100">
              {upcoming.map((candidate, index) => (
                <li key={candidate.prospect.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 w-4 shrink-0 text-xs tabular-nums text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{companyName(candidate)}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{candidate.contact.name ? candidate.contact.name + ' · ' : ''}{candidate.contact.phone}</p></div>
                  <span className="mt-0.5 max-w-[35%] text-right text-[10px] leading-4 text-slate-500">{candidate.reasons[0] || 'Ready'}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
    </div>
  )
}
