import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, MapPin, Phone, RotateCcw } from 'lucide-react'
import { Link } from 'wouter'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import { CallingContacts, contactName } from '@/features/calling/CallingContacts'
import { CallingActivity } from '@/features/calling/CallingActivity'
import {
  buildTelHref, brokerCallDate, callSessionStorageKey, contactPhoneOptions, nextCallFollowUpIso, nextUncalledContact, parseStoredCallSession,
  type CallQueueCandidate, type CallQueueResponse, type MobileCallOutcome,
  type MobileCallSession, type NextCallStep, type CallingContact, type CallingWorkspace,
} from '@/lib/mobileCalling'
import { cn } from '@/lib/utils'

type CompanyVisit = { candidate: CallQueueCandidate; contactId: string | null; phone: string }

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
  const resolvedClientEventIds = useRef(new Set<string>())
  const nameRef = useRef<HTMLHeadingElement>(null)
  const [focusNext, setFocusNext] = useState(false)
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null)
  const [retainedCandidate, setRetainedCandidate] = useState<CallQueueCandidate | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(session?.contactId || null)
  const [selectedPhone, setSelectedPhone] = useState(session?.expectedPhone || '')
  const [completedContactIds, setCompletedContactIds] = useState<Set<string>>(() => new Set())
  const [activityFilter, setActivityFilter] = useState<'account' | 'contact'>('contact')
  const [showAllCompanies, setShowAllCompanies] = useState(false)
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set())
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set())
  const [previousCompanies, setPreviousCompanies] = useState<CompanyVisit[]>([])
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
  const candidates = (queueQuery.data?.rows || []).filter((candidate) => !completedIds.has(candidate.prospect.id) && !skippedIds.has(candidate.prospect.id))
  const activeCandidate = session?.candidate || retainedCandidate || candidates.find((candidate) => candidate.prospect.id === selectedProspectId) || candidates[0] || null
  const prospectId = activeCandidate?.prospect.id
  const workspaceKey = ['/api/calling/workspace', brokerId, prospectId] as const
  const workspaceQuery = useQuery<CallingWorkspace>({
    queryKey: workspaceKey,
    enabled: Boolean(prospectId),
    queryFn: async () => (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(prospectId!)}/workspace`)).json(),
    staleTime: 30_000,
  })
  const contacts = (workspaceQuery.data?.contacts || []).filter((contact) => !contact.archivedAt)
  const selectedContact = session?.contactSnapshot || contacts.find((contact) => contact.id === selectedContactId) || null
  const selectedName = selectedContact ? contactName(selectedContact) : activeCandidate ? displayName(activeCandidate) : 'Selected contact'
  const phoneOptions = selectedContact ? contactPhoneOptions(selectedContact) : []
  const phone = session?.expectedPhone || selectedPhone
  const activityContactId = session?.contactId || selectedContactId
  const contactActivityQuery = useQuery<CallingWorkspace>({
    queryKey: ['/api/calling/workspace-activity', brokerId, prospectId, activityContactId],
    enabled: Boolean(prospectId && activityContactId && activityFilter === 'contact'),
    queryFn: async () => (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(prospectId!)}/workspace?contactId=${encodeURIComponent(activityContactId!)}`)).json(),
    staleTime: 15_000,
  })
  const historyQuery = activityFilter === 'account' ? workspaceQuery : contactActivityQuery
  const anotherContact = session && !session.contactId ? null : nextUncalledContact(contacts, session?.contactId || selectedContactId, workspaceQuery.data?.activity || [], completedContactIds)

  useEffect(() => {
    if (!prospectId || session || !workspaceQuery.data) return
    const current = contacts.find((contact) => contact.id === selectedContactId)
    const primary = contacts.find((contact) => contact.id === workspaceQuery.data?.primaryContactId)
    const next = current || (primary && contactPhoneOptions(primary).some((option) => option.href) ? primary : contacts.find((contact) => contactPhoneOptions(contact).some((option) => option.href))) || primary || contacts[0]
    if (!next) { setSelectedContactId(null); setSelectedPhone(''); return }
    if (next.id !== selectedContactId) setSelectedContactId(next.id)
    const options = contactPhoneOptions(next)
    if (!options.some((option) => option.number === selectedPhone)) setSelectedPhone(options.find((option) => option.href)?.number || options[0]?.number || '')
  }, [prospectId, workspaceQuery.data, selectedContactId, session])

  const selectContact = (contact: CallingContact) => {
    if (sessionRef.current) return
    setSelectedContactId(contact.id)
    const options = contactPhoneOptions(contact)
    setSelectedPhone(options.find((option) => option.href)?.number || options[0]?.number || '')
    setActivityFilter('contact')
  }

  const rememberCompany = (visit: CompanyVisit) => {
    setPreviousCompanies((visits) => visits.at(-1)?.candidate.prospect.id === visit.candidate.prospect.id
      ? [...visits.slice(0, -1), visit] : [...visits, visit])
  }

  const prepareCompany = (visit: CompanyVisit) => {
    // Pin the viewed company across queue refreshes, including a previously logged company.
    setRetainedCandidate(visit.candidate)
    setSelectedProspectId(visit.candidate.prospect.id)
    setSelectedContactId(visit.contactId)
    setSelectedPhone(visit.phone)
    setActivityFilter('contact')
    setNotes('')
    setShowNotes(false)
    setShowOptions(false)
    setNextStep('keep')
    setFocusNext(true)
  }

  const selectCompany = (candidate: CallQueueCandidate) => {
    if (sessionRef.current || candidate.prospect.id === activeCandidate?.prospect.id) return
    if (activeCandidate) rememberCompany({ candidate: activeCandidate, contactId: selectedContactId, phone })
    prepareCompany({ candidate, contactId: null, phone: '' })
  }

  const skipCompany = () => {
    if (sessionRef.current || !activeCandidate) return
    rememberCompany({ candidate: activeCandidate, contactId: selectedContactId, phone })
    setSkippedIds((ids) => new Set(ids).add(activeCandidate.prospect.id))
    const next = candidates.find((candidate) => candidate.prospect.id !== activeCandidate.prospect.id)
    if (next) prepareCompany({ candidate: next, contactId: null, phone: '' })
    else {
      setRetainedCandidate(null)
      setSelectedProspectId(null)
      setSelectedContactId(null)
      setSelectedPhone('')
    }
    setAnnouncement('Company skipped for now. No call was logged.')
  }

  const previousCompany = () => {
    if (sessionRef.current) return
    const previous = previousCompanies.at(-1)
    if (!previous) return
    setPreviousCompanies((visits) => visits.slice(0, -1))
    prepareCompany(previous)
    setAnnouncement('Previous company ready. No call has started.')
  }

  const revisitSkipped = () => {
    if (sessionRef.current) return
    setSkippedIds(new Set())
    setRetainedCandidate(null)
    setSelectedProspectId(null)
    setSelectedContactId(null)
    setSelectedPhone('')
    setFocusNext(true)
  }

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
    discardMutation.reset()
  }

  const refreshActivity = () => {
    for (const queryKey of [
      ['/api/calling/queue', brokerId], ['/api/automation/sales-brief?limit=25'],
      ['/api/automation/activity-pulse'], ['/api/prospects'], ['/api/interactions'],
      ['/api/automation/production-activities'],
      ['/api/skill-activities'], ['/api/skills'], ['/api/stats/header'],
      ['/api/calling/workspace', brokerId], ['/api/calling/workspace-activity', brokerId],
    ]) void queryClient.invalidateQueries({ queryKey })
  }

  const startMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      const response = await apiRequest('POST', '/api/calling/starts', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, callStartedAt: started.startedAt,
        ...(started.contactId ? { contactId: started.contactId } : {}),
      }, { keepalive: true })
      return response.json()
    },
    onSuccess: (result, started) => {
      if (sessionRef.current?.clientEventId !== started.clientEventId) return
      if (result.status !== 'started') {
        if (result.status === 'confirmed') completeCall(started)
        else { resolvedClientEventIds.current.add(started.clientEventId); resetForm() }
        refreshActivity()
        return
      }
      persistSession({ ...sessionRef.current, recorded: true,
        contactId: result.contactId ?? sessionRef.current.contactId,
        contactSnapshot: result.contactSnapshot ?? sessionRef.current.contactSnapshot,
      })
      setAnnouncement('Call start recorded. Confirm when you have tried the call.')
      void queueQuery.refetch()
    },
  })

  const outcomeMutation = useMutation({
    mutationFn: async ({ started, confirmation }: { started: MobileCallSession; confirmation: NonNullable<MobileCallSession['confirmation']> }) => {
      // A fast confirmation must preserve the durable click before creating its outcome.
      // Reconcile the same event ID when the initial start acknowledgement is still pending.
      if (!started.recorded) {
        const reconciled = await startMutation.mutateAsync(started)
        if (reconciled.status !== 'started') return reconciled
      }
      const response = await apiRequest('POST', '/api/calling/outcomes', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, ...confirmation,
        ...(started.contactId ? { contactId: started.contactId } : {}),
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
      completeCall(sessionRef.current)
      refreshActivity()
    },
    onSettled: () => { completionRef.current = false },
  })

  const discardMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      // The server records a discarded tombstone even when the initial start failed.
      // Its session lock also prevents a delayed start from resurrecting this call.
      const response = await apiRequest('POST', '/api/calling/discards', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        ...(started.contactId ? { contactId: started.contactId } : {}),
      })
      return response.json()
    },
    onSuccess: (result, started) => {
      if (sessionRef.current?.clientEventId !== started.clientEventId) return
      resolvedClientEventIds.current.add(started.clientEventId)
      queryClient.setQueryData<CallQueueResponse>(queueKey, (current) => current ? {
        ...current, pendingSessions: (current.pendingSessions || []).filter((item) => item.clientEventId !== started.clientEventId),
      } : current)
      resetForm()
      if (result.status === 'unavailable' && result.canDismissLocally) {
        setRetainedCandidate(null)
        setSelectedProspectId(null)
        setSelectedContactId(null)
        setSelectedPhone('')
        setCompletedIds((ids) => new Set(ids).add(started.prospectId))
        setAnnouncement('Record unavailable. Local call attempt cleared.')
      } else {
        prepareCompany({ candidate: started.candidate, contactId: started.contactId || null, phone: started.expectedPhone })
        setAnnouncement('Call start undone. This company is still selected.')
      }
      refreshActivity()
    },
  })

  const completeCall = (started: MobileCallSession) => {
    resolvedClientEventIds.current.add(started.clientEventId)
    setCompletedIds((ids) => new Set(ids).add(started.prospectId))
    if (started.contactId) setCompletedContactIds((ids) => new Set(ids).add(started.contactId!))
    queryClient.setQueryData<CallQueueResponse>(queueKey, (current) => current ? {
      ...current,
      rows: current.rows.filter((candidate) => candidate.prospect.id !== started.prospectId),
      pendingSessions: (current.pendingSessions || []).filter((item) => item.clientEventId !== started.clientEventId),
    } : current)
    if (started.afterConfirmation === 'another_contact' && started.nextContactId) {
      setRetainedCandidate(started.candidate)
      setSelectedProspectId(started.prospectId)
      setSelectedContactId(started.nextContactId)
      const next = contacts.find((contact) => contact.id === started.nextContactId)
      setSelectedPhone(next ? contactPhoneOptions(next).find((option) => option.href)?.number || '' : '')
      setActivityFilter('contact')
      setAnnouncement('Call logged. Another contact is ready on this company; no call has started.')
    } else {
      rememberCompany({ candidate: started.candidate, contactId: started.contactId || null, phone: started.expectedPhone })
      const next = candidates.find((candidate) => candidate.prospect.id !== started.prospectId)
      if (next) prepareCompany({ candidate: next, contactId: null, phone: '' })
      else {
        setRetainedCandidate(null)
        setSelectedProspectId(null)
        setSelectedContactId(null)
        setSelectedPhone('')
        setActivityFilter('contact')
      }
      setAnnouncement('Call logged. Next company ready.')
    }
    resetForm()
    setFocusNext(true)
  }

  useEffect(() => {
    if (!queueQuery.data) return
    if (!restorationChecked.current) {
      restorationChecked.current = true
      const stored = sessionRef.current
      if (stored) startMutation.mutate(stored)
    }
    if (sessionRef.current) return
    const pending = queueQuery.data.pendingSessions?.find((item) => !resolvedClientEventIds.current.has(item.clientEventId))
    if (!pending?.candidate) return
    persistSession({
      brokerId, clientEventId: pending.clientEventId, prospectId: pending.prospectId,
      expectedPhone: pending.phoneSnapshot, startedAt: pending.callStartedAt,
      recorded: true, candidate: pending.candidate,
      contactId: pending.contactId, contactSnapshot: pending.contactSnapshot,
    })
  }, [queueQuery.data, completedIds])

  useEffect(() => {
    if (!focusNext || !activeCandidate || session) return
    nameRef.current?.focus()
    setFocusNext(false)
  }, [focusNext, activeCandidate?.prospect.id, session])

  const busy = outcomeMutation.isPending || discardMutation.isPending
  const submissionLocked = busy || Boolean(session?.confirmation)
  const startCall = (event: MouseEvent<HTMLAnchorElement>, contact = selectedContact, number = phone) => {
    if (!activeCandidate || !contact || !buildTelHref(number) || sessionRef.current || busy) { event.preventDefault(); return }
    selectContact(contact)
    const started: MobileCallSession = {
      brokerId, clientEventId: newClientEventId(), prospectId: activeCandidate.prospect.id,
      expectedPhone: number, startedAt: new Date().toISOString(),
      candidate: activeCandidate, recorded: false,
      contactId: contact.id, contactSnapshot: { ...contact, additionalPhones: contact.additionalPhones.map((option) => ({ ...option })) },
    }
    persistSession(started)
    setAnnouncement(`Starting a call to ${contactName(contact)}.`)
    // Native link activation stays synchronous; recording proceeds alongside the dialer.
    startMutation.mutate(started)
  }
  const confirm = (outcome: MobileCallOutcome = 'attempted', after: 'next_company' | 'another_contact' = 'next_company') => {
    const started = sessionRef.current
    if (!started || busy || completionRef.current) return
    completionRef.current = true
    const confirmation = confirmationRef.current || {
      outcome, notes: notes.trim(),
      ...(nextStep === 'keep' ? {} : { nextFollowUp: nextCallFollowUpIso(nextStep) }),
    }
    confirmationRef.current = confirmation
    const frozen = { ...started, confirmation,
      afterConfirmation: started.afterConfirmation || after,
      nextContactId: started.afterConfirmation ? started.nextContactId : after === 'another_contact' ? anotherContact?.id || null : null,
    }
    persistSession(frozen)
    outcomeMutation.mutate({ started: frozen, confirmation })
  }

  const progress = queueQuery.data?.progress || { startedToday: 0, confirmedToday: 0, connectedToday: 0 }
  const recordedSessionIsListed = queueQuery.data?.pendingSessions?.some((item) => item.clientEventId === session?.clientEventId)
  const pendingCredit = session && brokerCallDate(session.startedAt) === brokerCallDate(new Date()) && !recordedSessionIsListed && !startMutation.isError && !discardMutation.isPending ? 1 : 0
  const startedToday = progress.startedToday + pendingCredit
  const callTarget = Math.max(0, Math.trunc(Number(profile?.goals?.callsPerDay) || 0))
  const targetPercent = callTarget ? Math.min(100, (progress.confirmedToday / callTarget) * 100) : 0
  const telHref = selectedContact && phone ? buildTelHref(phone) : null
  const error = outcomeMutation.error || discardMutation.error || startMutation.error
  const upcoming = candidates.filter((candidate) => candidate.prospect.id !== activeCandidate?.prospect.id)
  const account = workspaceQuery.data?.prospect

  return (
    <div className="min-h-[calc(100dvh-7.5rem)] bg-slate-50 lg:min-h-screen">
      <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
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

      <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 lg:px-6 lg:py-6">
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="Today's calling progress">
          <dl className="grid grid-cols-3 gap-3">
            <div><dt className="text-[11px] text-slate-500">Calls started</dt><dd data-testid="calls-started-today" className="mt-0.5 text-xl font-semibold tabular-nums text-slate-600">{startedToday}</dd></div>
            <div><dt className="text-[11px] text-slate-500">Calls logged</dt><dd data-testid="calls-confirmed-today" className="mt-0.5 text-xl font-semibold tabular-nums text-blue-700">{progress.confirmedToday}</dd></div>
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

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        {activeCandidate ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Current call">
            <div className="px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Button variant="ghost" className="h-11 gap-1 px-2 text-xs text-slate-500" aria-label="Previous company" disabled={Boolean(session) || !previousCompanies.length} onClick={previousCompany}><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Previous</Button>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">{activeCandidate.reasons[0] || 'Ready to call'}</span>
                </div>
                <Link href={'/app?prospectId=' + encodeURIComponent(activeCandidate.prospect.id)} onClick={() => {
                  try { window.localStorage.setItem('levelcre:focusProspectId', activeCandidate.prospect.id); } catch {}
                }} className="inline-flex min-h-8 shrink-0 items-center rounded text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">View record<ArrowRight className="ml-1 h-3 w-3" /></Link>
              </div>
              <h2 ref={nameRef} tabIndex={-1} className="break-words text-2xl font-semibold leading-tight text-slate-950 outline-none">{companyName(activeCandidate)}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span className="capitalize">{(activeCandidate.prospect.status || 'prospect').replaceAll('_', ' ')}</span>{account?.buildingSf ? <span>{Number(account.buildingSf).toLocaleString()} SF</span> : null}{account?.lotSizeAcres ? <span>{Number(account.lotSizeAcres).toLocaleString()} acres</span> : null}</div>
              {activeCandidate.prospect.address ? <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><MapPin className="mt-1 h-3 w-3 shrink-0" />{activeCandidate.prospect.address}</p> : null}
              {activeCandidate.listingTitles.length ? <p className="mt-1 text-xs text-slate-500">Pursuit: {activeCandidate.listingTitles.slice(0, 2).join(' · ')}</p> : null}
            </div>

            <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Calling contact</p><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="break-words text-sm font-medium text-slate-800">{selectedName}</p>{phoneOptions.length > 1 ? <><label htmlFor="calling-phone" className="sr-only">Phone number for {selectedName}</label><select id="calling-phone" value={phone} disabled={Boolean(session)} onChange={(event) => setSelectedPhone(event.target.value)} className="min-h-11 max-w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:bg-slate-50">{phoneOptions.map((option) => <option key={option.number} value={option.number}>{option.label} · {option.number}{option.href ? '' : ' · check number'}</option>)}</select></> : phone ? <p className="min-h-8 content-center text-xs tabular-nums text-slate-600">{phone}</p> : null}</div></div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                {session ? (
                  <Button className="h-11 shrink-0 gap-2 bg-emerald-700 px-4 text-sm font-semibold hover:bg-emerald-800" disabled={busy} onClick={() => confirm()}>{outcomeMutation.isPending ? 'Confirming...' : discardMutation.isPending ? 'Undoing...' : 'I called · next'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
                ) : telHref ? (
                  <Button asChild className="h-11 shrink-0 gap-2 bg-blue-600 px-4 text-sm font-semibold hover:bg-blue-700"><a href={telHref} onClick={(event) => startCall(event)} aria-label={'Call ' + selectedName}><Phone aria-hidden="true" className="h-4 w-4" /><span>Call</span></a></Button>
                ) : <Button className="h-11" disabled>{workspaceQuery.isLoading ? 'Loading contacts...' : 'Check phone number'}</Button>}
                <Button variant="ghost" className="h-11 px-3 text-slate-500" disabled={Boolean(session)} onClick={skipCompany}>Skip</Button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"><p className="text-slate-500">{session ? session.confirmation && session.afterConfirmation === 'another_contact' ? 'Retry will log this call and prepare another contact on this company.' : 'Confirm after trying the call.' : 'Opens your dialer.'}</p>{session ? <p className={cn('font-medium', startMutation.isError ? 'text-amber-700' : 'text-emerald-700')}>{session.recorded ? 'Call started' : startMutation.isError ? 'Call start not recorded' : 'Saving call start...'}</p> : null}</div>
              {!telHref && !session && !workspaceQuery.isLoading && !workspaceQuery.isError ? <p className="mt-2 text-xs leading-4 text-amber-700">This contact needs one dialable number. Select another contact, edit the number, or skip for now.</p> : null}

              {session ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] leading-4 text-slate-500">Log this call or choose Didn’t call before changing companies.</p>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" className="h-11 px-2 text-xs text-slate-500" disabled={busy} onClick={() => discardMutation.mutate(session)}>Didn't call</Button>
                    <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setShowNotes((value) => !value)} aria-expanded={showNotes} aria-controls="call-notes">{showNotes ? 'Hide note' : 'Add a note'}</Button>
                    <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setShowOptions((value) => !value)} aria-expanded={showOptions} aria-controls="call-options">More options<ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>
                    {anotherContact && !session.confirmation ? <Button variant="ghost" className="h-11 px-2 text-xs text-slate-600" aria-label="Log & try another contact" disabled={submissionLocked} onClick={() => confirm('attempted', 'another_contact')}>Log &amp; try another contact<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button> : null}
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
            {workspaceQuery.isError ? <div role="alert" className="border-t border-slate-100 px-4 py-4"><p className="text-xs text-amber-800">Contacts could not be loaded.</p><Button variant="ghost" size="sm" onClick={() => workspaceQuery.refetch()}>Retry contacts</Button></div> : workspaceQuery.isLoading ? <p className="border-t border-slate-100 px-4 py-4 text-xs text-slate-500">Loading company workspace...</p> : <>
              <CallingContacts key={activeCandidate.prospect.id} prospectId={activeCandidate.prospect.id} contacts={contacts} selectedId={session?.contactId || selectedContactId} selectedPhone={phone} locked={Boolean(session)} onSelect={selectContact} onDial={startCall} onSaved={(workspace, contactId) => {
                queryClient.setQueryData(workspaceKey, workspace)
                void queryClient.invalidateQueries({ queryKey: ['/api/calling/workspace-activity', brokerId, activeCandidate.prospect.id] })
                void queryClient.invalidateQueries({ queryKey: ['/api/calling/queue', brokerId] })
                void queryClient.invalidateQueries({ queryKey: ['/api/prospects'] })
                const saved = workspace.contacts.find((contact) => contact.id === contactId)
                if (saved) selectContact(saved)
              }} />
              {account?.notes ? <details className="border-t border-slate-100 px-4 py-3 sm:px-5"><summary className="min-h-9 cursor-pointer text-xs font-medium text-slate-500">Company notes</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{account.notes}</p></details> : null}
              <CallingActivity rows={historyQuery.data?.activity || []} filter={activityFilter} onFilter={setActivityFilter} contactName={selectedName} unattributedCount={workspaceQuery.data?.unattributedActivityCount || 0} loading={activityFilter === 'contact' && Boolean(activityContactId) ? contactActivityQuery.isLoading : historyQuery.isLoading} error={historyQuery.isError} onRetry={() => historyQuery.refetch()} />
            </>}
          </section>
        ) : !queueQuery.isLoading && !queueQuery.isError ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-center"><Check className="mx-auto h-6 w-6 text-emerald-600" /><h2 className="mt-2 text-lg font-bold text-slate-950">You're through the queue</h2><p className="mt-2 text-sm text-slate-500">{skippedIds.size ? skippedIds.size + ' companies skipped for now.' : progress.confirmedToday ? progress.confirmedToday + ' calls confirmed today. Good progress.' : 'No prospects with a saved phone number are ready.'}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="ghost" className="h-11 gap-1 text-xs text-slate-500" aria-label="Previous company" disabled={!previousCompanies.length} onClick={previousCompany}><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Previous</Button>{skippedIds.size ? <Button variant="outline" onClick={revisitSkipped}>Revisit skipped companies</Button> : null}<Button variant="outline" onClick={() => { setCompletedIds(new Set()); setSkippedIds(new Set()); setIncludeCalledToday(true) }}>Show contacts called today</Button></div></section>
        ) : null}

        {activeCandidate || upcoming.length ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white xl:sticky xl:top-4" aria-label="Next companies">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">Calling queue</h2><span className="text-[11px] text-slate-500">{queueQuery.data?.totalEligible ?? candidates.length} in queue</span></div>
            <ol className="divide-y divide-slate-100 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto">
              {upcoming.map((candidate, index) => (
                <li key={candidate.prospect.id} className={cn(index >= 5 && !showAllCompanies && 'hidden xl:block')}><button type="button" className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:cursor-default disabled:opacity-60" aria-label={'Select company ' + companyName(candidate)} disabled={Boolean(session)} onClick={() => selectCompany(candidate)}>
                  <span className="mt-0.5 w-4 shrink-0 text-xs tabular-nums text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{companyName(candidate)}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{candidate.contact.name ? candidate.contact.name + ' · ' : ''}{candidate.contact.phone}</p></div>
                  <span className="mt-0.5 max-w-[35%] text-right text-[10px] leading-4 text-slate-500">{candidate.reasons[0] || 'Ready'}</span>
                </button>
                </li>
              ))}
            </ol>
            {upcoming.length > 5 ? <Button variant="ghost" className="m-2 h-11 text-xs text-slate-500 xl:hidden" aria-expanded={showAllCompanies} onClick={() => setShowAllCompanies((value) => !value)}>{showAllCompanies ? 'Show fewer companies' : 'View all companies'}</Button> : null}
            {!upcoming.length ? <p className="px-4 py-6 text-xs text-slate-500">This is the last company in your queue.</p> : null}
            <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] leading-5 text-slate-500"><Building2 className="mt-1 h-3.5 w-3.5 shrink-0" /><p>Select a company to prepare the next call. Calls count toward your goal when you log them.</p></div>
          </section>
        ) : null}
        </div>
      </main>
    </div>
  )
}
