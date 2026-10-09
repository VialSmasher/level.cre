import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Building2, Check, CircleCheck, ChevronDown, MapPin, Mail, MessageCircle, Phone, RotateCcw } from 'lucide-react'
import { Link } from 'wouter'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VoiceDictationButton } from '@/components/VoiceDictationButton'
import { useAuth } from '@/contexts/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { apiRequest } from '@/lib/queryClient'
import { CallingContacts, ContactEditor, contactName } from '@/features/calling/CallingContacts'
import { useCallingSession } from '@/features/calling/CallingSessionProvider'
import { CallingActivity } from '@/features/calling/CallingActivity'
import { NeedsNumberList } from '@/features/calling/NeedsNumberList'
import {
  brokerCallDate, contactPhoneOptions, nextCallFollowUpIso, nextUncalledContact,
  preferredCallingChoice, nextCallingChoice, isPhoneIssueOutcome, phoneIssueLabel,
  type CallQueueCandidate, type CallQueueResponse, type MobileCallOutcome,
  type MobileCallSession, type NextCallStep, type CallingContact, type CallingWorkspace, type NeedsNumberRow,
} from '@/lib/mobileCalling'
import { cn } from '@/lib/utils'
import { callingEmailLink } from '@/lib/callingEmail'
import { CallingContext } from '@/features/calling/CallingContext'
import { CallingSearch } from '@/features/calling/CallingSearch'
import { searchedCallingCandidate } from '@/lib/callingSearch'

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

export default function MobileCallsPage() {
  const { user, isDemoMode } = useAuth()
  const brokerId = isDemoMode ? 'demo-user' : user?.id
  return brokerId ? <CallingDesk key={brokerId} brokerId={brokerId} /> : null
}

function CallingDesk({ brokerId }: { brokerId: string }) {
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const calling = useCallingSession()
  const { session, resolution } = calling
  const sessionRef = useRef(session)
  sessionRef.current = session
  const observedResolution = useRef(0)
  const savedContactSelection = useRef<{ prospectId: string; contactId: string } | null>(null)
  const nameRef = useRef<HTMLHeadingElement>(null)
  const [focusNext, setFocusNext] = useState(false)
  const [requestedProspectId] = useState(() => new URLSearchParams(window.location.search).get('prospectId'))
  const requestedRecordHandled = useRef(!requestedProspectId || Boolean(session))
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
  const [emailEditor, setEmailEditor] = useState<{ contact: CallingContact; existingIds: string[] } | null>(null)
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
  const requestedWorkspaceQuery = useQuery<CallingWorkspace>({
    queryKey: ['/api/calling/workspace', brokerId, requestedProspectId],
    enabled: Boolean(requestedProspectId && !requestedRecordHandled.current && !session),
    queryFn: async () => (await apiRequest('GET', '/api/calling/prospects/' + encodeURIComponent(requestedProspectId!) + '/workspace')).json(),
    staleTime: 30_000, retry: false,
  })
  const candidates = (queueQuery.data?.rows || []).filter((candidate) => !completedIds.has(candidate.prospect.id) && !skippedIds.has(candidate.prospect.id))
  const activeCandidate = session?.candidate || retainedCandidate || candidates.find((candidate) => candidate.prospect.id === selectedProspectId) || (requestedRecordHandled.current ? candidates[0] : null) || null
  const prospectId = activeCandidate?.prospect.id
  const workspaceKey = ['/api/calling/workspace', brokerId, prospectId] as const
  const workspaceQuery = useQuery<CallingWorkspace>({
    queryKey: workspaceKey,
    enabled: Boolean(prospectId),
    queryFn: async () => (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(prospectId!)}/workspace`)).json(),
    staleTime: 30_000,
  })
  const contacts = (workspaceQuery.data?.contacts || []).filter((contact) => !contact.archivedAt)
  const readiness = workspaceQuery.data?.phoneReadiness || null
  const selectedContact = session?.contactSnapshot || contacts.find((contact) => contact.id === selectedContactId) || null
  const selectedName = selectedContact ? contactName(selectedContact) : activeCandidate ? displayName(activeCandidate) : 'Selected contact'
  const email = callingEmailLink(session ? session.contactSnapshot?.email : selectedContact?.email)
  const phoneOptions = selectedContact ? contactPhoneOptions(selectedContact, readiness) : []
  const phone = session?.expectedPhone || selectedPhone
  const activityContactId = session ? session.contactId || null : selectedContactId
  const contactActivityQuery = useQuery<CallingWorkspace>({
    queryKey: ['/api/calling/workspace-activity', brokerId, prospectId, activityContactId],
    enabled: Boolean(prospectId && activityContactId),
    queryFn: async () => (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(prospectId!)}/workspace?contactId=${encodeURIComponent(activityContactId!)}`)).json(),
    staleTime: 15_000,
  })
  const historyQuery = activityFilter === 'account' ? workspaceQuery : contactActivityQuery
  const anotherContact = session && !session.contactId ? null : nextUncalledContact(contacts, session?.contactId || selectedContactId, workspaceQuery.data?.activity || [], completedContactIds, new Date(), readiness)

  useEffect(() => {
    if (requestedRecordHandled.current) return
    if (session) { requestedRecordHandled.current = true; return }
    const workspace = requestedWorkspaceQuery.data
    if (!workspace) return
    requestedRecordHandled.current = true
    const primary = workspace.contacts.find((contact) => contact.id === workspace.primaryContactId)
    const preferred = workspace.phoneReadiness?.status === 'ready' ? preferredCallingChoice(workspace.phoneReadiness) : null
    const candidate = queueQuery.data?.rows.find((row) => row.prospect.id === workspace.prospect.id) || {
      id: 'call:' + workspace.prospect.id, prospect: workspace.prospect,
      contact: { name: primary?.name || null, company: workspace.prospect.businessName || primary?.company || workspace.prospect.name,
        email: primary?.email || null, phone: primary?.phone || '' },
      priorityScore: 0, priority: 'medium' as const, reasons: ['Selected from map'], listingTitles: [],
      recentActivity: workspace.activity, phoneReadiness: workspace.phoneReadiness,
    }
    setRetainedCandidate(candidate)
    setSelectedProspectId(workspace.prospect.id)
    setSelectedContactId(preferred?.contactId || workspace.primaryContactId)
    setSelectedPhone(preferred?.number || '')
  }, [requestedWorkspaceQuery.data, session])

  useEffect(() => {
    if (!prospectId || session || !workspaceQuery.data) return
    // Cache notifications can arrive after local selection. Hold a just-saved
    // replacement identity until the returned roster is visible to this render.
    const intended = savedContactSelection.current
    const saved = intended?.prospectId === prospectId ? contacts.find((contact) => contact.id === intended.contactId) : null
    if (intended?.prospectId === prospectId && !saved) return
    if (saved) savedContactSelection.current = null
    const current = saved || contacts.find((contact) => contact.id === selectedContactId)
    const primary = contacts.find((contact) => contact.id === workspaceQuery.data?.primaryContactId)
    const preferred = preferredCallingChoice(readiness)
    const defaultContact = readiness?.missingPrimaryContactNumber && readiness.primaryEmailTarget ? primary : contacts.find((contact) => contact.id === preferred?.contactId)
    const next = current || defaultContact || primary || contacts[0]
    if (!next) { setSelectedContactId(null); setSelectedPhone(''); return }
    if (next.id !== selectedContactId) setSelectedContactId(next.id)
    const options = contactPhoneOptions(next, readiness)
    if (!options.some((option) => option.number === selectedPhone && option.href)) setSelectedPhone(preferredCallingChoice(readiness, next.id)?.number || options.find((option) => option.href)?.number || options[0]?.number || '')
  }, [prospectId, workspaceQuery.data, selectedContactId, selectedPhone, session])

  const selectContact = (contact: CallingContact, workspace = workspaceQuery.data) => {
    if (sessionRef.current) return
    setSelectedContactId(contact.id)
    const options = contactPhoneOptions(contact, workspace?.phoneReadiness || null)
    setSelectedPhone(preferredCallingChoice(workspace?.phoneReadiness, contact.id)?.number || options.find((option) => option.href)?.number || options[0]?.number || '')
    setActivityFilter('contact')
  }

  const rememberCompany = (visit: CompanyVisit) => {
    setPreviousCompanies((visits) => visits.at(-1)?.candidate.prospect.id === visit.candidate.prospect.id
      ? [...visits.slice(0, -1), visit] : [...visits, visit])
  }

  const prepareCompany = (visit: CompanyVisit) => {
    savedContactSelection.current = null
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

  const selectSearchContact = (workspace: CallingWorkspace, contact: CallingContact) => {
    if (sessionRef.current || calling.busy || !calling.recoveryReady) return false
    if (activeCandidate) rememberCompany({ candidate: activeCandidate, contactId: selectedContactId, phone })
    requestedRecordHandled.current = true
    const candidate = searchedCallingCandidate(workspace, contact)
    const choice = preferredCallingChoice(workspace.phoneReadiness, contact.id)
    prepareCompany({ candidate, contactId: contact.id, phone: choice?.number || contactPhoneOptions(contact, workspace.phoneReadiness || null)[0]?.number || '' })
    setAnnouncement(contactName(contact) + ' selected. No call has started.')
    return true
  }

  const reviewNumber = (row: NeedsNumberRow) => selectCompany({
    id: 'call:' + row.prospect.id, prospect: row.prospect,
    contact: { name: row.contactName, company: row.company, phone: '', email: null },
    priority: row.priority, priorityScore: row.priorityScore, reasons: row.reasons,
    listingTitles: [], recentActivity: [], phoneReadiness: row.phoneReadiness,
  })

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

  const resetForm = () => {
    setNotes('')
    setShowNotes(false)
    setShowOptions(false)
    setNextStep('keep')
  }

  const completeCall = (started: MobileCallSession) => {
    setSkippedIds((ids) => {
      const remaining = new Set(ids)
      remaining.delete(started.prospectId)
      return remaining
    })
    setCompletedIds((ids) => new Set(ids).add(started.prospectId))
    if (started.contactId) setCompletedContactIds((ids) => new Set(ids).add(started.contactId!))
    const currentWorkspace = queryClient.getQueryData<CallingWorkspace>(['/api/calling/workspace', brokerId, started.prospectId])
    const nextChoice = currentWorkspace?.phoneReadiness?.usableChoices.find((choice) => choice.contactId === started.nextContactId && choice.phoneKey === started.nextPhoneKey)
      || preferredCallingChoice(currentWorkspace?.phoneReadiness, started.nextContactId)
      || (started.confirmation && isPhoneIssueOutcome(started.confirmation.outcome) ? preferredCallingChoice(currentWorkspace?.phoneReadiness) : null)
    if (started.afterConfirmation === 'another_contact' && started.nextContactId && (nextChoice?.contactId || !currentWorkspace?.phoneReadiness)) {
      setRetainedCandidate(started.candidate)
      setSelectedProspectId(started.prospectId)
      setSelectedContactId(nextChoice?.contactId || started.nextContactId)
      setSelectedPhone(nextChoice?.number || '')
      setActivityFilter('contact')
      setAnnouncement(started.confirmation && isPhoneIssueOutcome(started.confirmation.outcome) ? phoneIssueLabel(started.confirmation.outcome) + ' saved. Another number is ready on this company; no call has started.' : 'Call logged. Another contact is ready on this company; no call has started.')
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
      setAnnouncement(started.confirmation && isPhoneIssueOutcome(started.confirmation.outcome) ? phoneIssueLabel(started.confirmation.outcome) + ' saved. Next company ready.' : 'Call logged. Next company ready.')
    }
    resetForm()
    setFocusNext(true)
  }

  useEffect(() => {
    if (!resolution || resolution.sequence <= observedResolution.current) return
    observedResolution.current = resolution.sequence
    if (resolution.session.origin === 'map' || !calling.claimResolution(resolution.sequence)) return
    const started = resolution.session
    sessionRef.current = null
    if (resolution.type === 'confirmed') completeCall(started)
    else {
      resetForm()
      if (resolution.type === 'unavailable') {
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
    }
  }, [resolution])

  useEffect(() => {
    if (session?.confirmation) setNotes(session.confirmation.notes)
  }, [session?.clientEventId])

  useEffect(() => {
    if (!focusNext || !activeCandidate || session) return
    nameRef.current?.focus()
    setFocusNext(false)
  }, [focusNext, activeCandidate?.prospect.id, session])

  const busy = calling.busy
  const submissionLocked = busy || Boolean(session?.confirmation)
  const emailEditLocked = Boolean(session) || busy || !calling.recoveryReady || workspaceQuery.isError || !selectedContact
  const editSelectedEmail = () => {
    if (emailEditLocked || sessionRef.current || !selectedContact || selectedContact.prospectId !== prospectId) return
    setEmailEditor({ contact: structuredClone(selectedContact), existingIds: contacts.map((contact) => contact.id) })
  }
  const onContactSaved = (workspace: CallingWorkspace, contactId?: string) => {
    const savedProspectId = workspace.prospect.id
    const saved = workspace.contacts.find((contact) => contact.id === contactId && !contact.archivedAt)
    if (saved && savedProspectId === prospectId && !sessionRef.current) savedContactSelection.current = { prospectId: savedProspectId, contactId: saved.id }
    queryClient.setQueryData(['/api/calling/workspace', brokerId, savedProspectId], workspace)
    void queryClient.invalidateQueries({ queryKey: ['/api/calling/workspace-activity', brokerId, savedProspectId] })
    void queryClient.invalidateQueries({ queryKey: ['/api/calling/queue', brokerId] })
    void queryClient.invalidateQueries({ queryKey: ['/api/calling/search', brokerId] })
    void queryClient.invalidateQueries({ queryKey: ['/api/prospects'] })
    void queryClient.invalidateQueries({ queryKey: ['/api/calling/needs-number'] })
    if (saved && savedProspectId === prospectId) selectContact(saved, workspace)
  }
  const startCall = (event: MouseEvent<HTMLAnchorElement>, contact = selectedContact, number = phone) => {
    const choice = readiness?.usableChoices.find((option) => option.contactId === contact?.id && option.number === number)
    if (!activeCandidate || !contact || !choice || sessionRef.current || busy) { event.preventDefault(); return }
    selectContact(contact)
    const started = calling.start({ ...activeCandidate, phoneReadiness: readiness || undefined }, contact, choice, 'calls')
    if (!started) { event.preventDefault(); return }
    sessionRef.current = started
    setAnnouncement(`Starting a call to ${contactName(contact)}.`)
    // Native link activation stays synchronous; the shared provider saves this click.
  }
  const confirm = (outcome: MobileCallOutcome = 'attempted', after: 'next_company' | 'another_contact' = 'next_company') => {
    const started = sessionRef.current
    if (!started || busy) return
    const frozenOutcome = started.confirmation?.outcome || outcome
    const nextChoice = isPhoneIssueOutcome(frozenOutcome)
      ? nextCallingChoice(readiness, started, completedContactIds)
      : after === 'another_contact' && anotherContact ? preferredCallingChoice(readiness, anotherContact.id) : null
    calling.confirm(outcome, notes, nextStep === 'keep' ? undefined : nextCallFollowUpIso(nextStep), {
      afterConfirmation: isPhoneIssueOutcome(frozenOutcome) ? nextChoice?.contactId ? 'another_contact' : 'next_company' : after,
      nextContactId: nextChoice?.contactId || null, nextPhoneKey: nextChoice?.phoneKey || null,
    })
  }

  const progress = queueQuery.data?.progress || { startedToday: 0, confirmedToday: 0, connectedToday: 0 }
  const recordedSessionIsListed = queueQuery.data?.pendingSessions?.some((item) => item.clientEventId === session?.clientEventId)
  const pendingCredit = session && brokerCallDate(session.startedAt) === brokerCallDate(new Date()) && !recordedSessionIsListed && !Boolean(calling.startError) && !calling.pendingDiscard ? 1 : 0
  const startedToday = progress.startedToday + pendingCredit
  const callTarget = Math.max(0, Math.trunc(Number(profile?.goals?.callsPerDay) || 0))
  const targetPercent = callTarget ? Math.min(100, (progress.confirmedToday / callTarget) * 100) : 0
  const selectedPhoneOption = phoneOptions.find((option) => option.number === phone)
  const telHref = selectedPhoneOption?.href || null
  const error = calling.error || calling.recoveryError
  const upcoming = candidates.filter((candidate) => candidate.prospect.id !== activeCandidate?.prospect.id)
  const account = workspaceQuery.data?.prospect

  return (
    <div className="min-h-[calc(100dvh-7.5rem)] bg-[#f6f9ff] lg:min-h-screen">
      <header className="border-b border-blue-100 bg-white px-4 py-2 lg:px-8 xl:px-10">
        <div className="mx-auto flex max-w-[1410px] items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Back to Today">
              <Link href="/app/desk"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-lg font-semibold text-slate-950">Calls</h1>
          </div>
          <Button variant="ghost" size="icon" aria-label="Refresh call queue" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
            <RotateCcw className={cn('h-4 w-4', queueQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1490px] space-y-4 px-4 py-4 lg:px-8 lg:py-5 xl:px-10">
        <section aria-label="Today's calling progress">
          <dl className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="relative rounded-xl border border-blue-100 bg-white px-3 py-3 sm:px-4 sm:py-3 sm:pl-[72px]"><dt className="text-[11px] leading-4 text-slate-600 sm:text-sm"><span aria-hidden="true" className="absolute left-4 top-1/2 hidden -translate-y-1/2 h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100/70 text-blue-600 sm:flex"><Phone aria-hidden="true" className="h-5 w-5" /></span>Calls started</dt><dd data-testid="calls-started-today" className="mt-0.5 text-xl font-semibold leading-7 tabular-nums text-slate-950 sm:text-2xl">{startedToday}</dd></div>
            <div className="relative rounded-xl border border-blue-100 bg-white px-3 py-3 sm:px-4 sm:py-3 sm:pl-[72px]"><dt className="text-[11px] leading-4 text-slate-600 sm:text-sm"><span aria-hidden="true" className="absolute left-4 top-1/2 hidden -translate-y-1/2 h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 sm:flex"><CircleCheck aria-hidden="true" className="h-5 w-5" /></span>Calls logged</dt><dd data-testid="calls-confirmed-today" className="mt-0.5 text-xl font-semibold leading-7 tabular-nums text-emerald-700 sm:text-2xl">{progress.confirmedToday}</dd></div>
            <div className="relative rounded-xl border border-blue-100 bg-white px-3 py-3 sm:px-4 sm:py-3 sm:pl-[72px]"><dt className="text-[11px] leading-4 text-slate-600 sm:text-sm"><span aria-hidden="true" className="absolute left-4 top-1/2 hidden -translate-y-1/2 h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100/70 text-blue-600 sm:flex"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span>Conversations</dt><dd className="mt-0.5 text-xl font-semibold leading-7 tabular-nums text-slate-950 sm:text-2xl">{progress.connectedToday}</dd></div>
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
            <p className="text-sm font-semibold text-amber-950">{calling.recoveryError ? 'Saved calls unavailable' : 'Recording failed'}</p>
            <p className="mt-1 text-xs text-amber-900">{calling.recoveryError ? 'Load your saved calls before starting a new call.' : session?.recorded ? 'Your call start is saved. Confirm again to finish; the same call will be reused.' : 'Your call start has not been recorded. Retry here without dialing again.'}</p>
            {calling.recoveryError ? <Button className="mt-2" variant="outline" onClick={calling.retryRecovery} disabled={calling.recovering}>Retry loading calls</Button> : null}
            {Boolean(calling.startError) && session ? <Button className="mt-2" variant="outline" onClick={() => calling.retryStart()} disabled={calling.pendingStart || busy}>Retry recording</Button> : null}
          </div>
        ) : null}

        {requestedWorkspaceQuery.isError && !activeCandidate ? <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">This record could not be loaded. <Button variant="outline" className="ml-2" onClick={() => requestedWorkspaceQuery.refetch()}>Retry record</Button></div> : null}
        {requestedWorkspaceQuery.isLoading || queueQuery.isLoading && !activeCandidate ? <p className="py-8 text-center text-sm text-slate-500">Finding your next call...</p> : null}
        {queueQuery.isError && !activeCandidate ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-center"><p className="font-semibold">Call queue unavailable</p><Button className="mt-3" variant="outline" onClick={() => queueQuery.refetch()}>Try again</Button></div>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.43fr)_minmax(340px,1fr)]">
        <div className="min-w-0 xl:col-start-2 xl:row-start-1"><CallingSearch brokerId={brokerId} locked={Boolean(session) || busy || !calling.recoveryReady} onSelect={selectSearchContact} /></div>
        {activeCandidate ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-blue-100 bg-white xl:col-start-1 xl:row-start-1 xl:row-span-2" aria-label="Current call">
            <div className="bg-blue-50/70 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
              <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Button variant="ghost" className="h-11 gap-1 px-2 text-sm text-blue-900 hover:bg-blue-100/70" aria-label="Previous company" disabled={Boolean(session) || !previousCompanies.length} onClick={previousCompany}><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Previous</Button>
                  <span className={cn("rounded-md px-2 py-1 text-xs font-medium", activeCandidate.reasons[0]?.toLowerCase().includes("overdue") ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800")}>{activeCandidate.reasons[0] || 'Ready to call'}</span>
                </div>
                <Link href={'/app?prospectId=' + encodeURIComponent(activeCandidate.prospect.id)} onClick={() => {
                  try { window.localStorage.setItem('levelcre:focusProspectId', activeCandidate.prospect.id); } catch {}
                }} className="inline-flex min-h-8 shrink-0 items-center rounded text-xs text-blue-900 underline-offset-2 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">View record<ArrowRight className="ml-1 h-3 w-3" /></Link>
              </div>
              <h2 ref={nameRef} tabIndex={-1} className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-950 outline-none sm:text-[28px]">{companyName(activeCandidate)}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600"><span className="capitalize">{(activeCandidate.prospect.status || 'prospect').replaceAll('_', ' ')}</span>{account?.buildingSf ? <span>{Number(account.buildingSf).toLocaleString()} SF</span> : null}{account?.lotSizeAcres ? <span>{Number(account.lotSizeAcres).toLocaleString()} acres</span> : null}</div>
              {activeCandidate.prospect.address ? <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><MapPin className="mt-1 h-3 w-3 shrink-0" />{activeCandidate.prospect.address}</p> : null}
              {activeCandidate.listingTitles.length ? <p className="mt-1 text-xs text-slate-500">Pursuit: {activeCandidate.listingTitles.slice(0, 2).join(' · ')}</p> : null}
            </div>

            <div className="border-t border-blue-100/70 px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Calling contact</p><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="break-words text-sm font-medium text-slate-900 sm:text-base">{selectedName}</p>{phoneOptions.length > 1 ? <><label htmlFor="calling-phone" className="sr-only">Phone number for {selectedName}</label><select id="calling-phone" value={selectedPhoneOption?.phoneKey || ''} disabled={Boolean(session)} onChange={(event) => setSelectedPhone(phoneOptions.find((option) => option.phoneKey === event.target.value)?.number || '')} className="min-h-11 max-w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:bg-slate-50">{phoneOptions.map((option) => <option key={option.phoneKey} value={option.phoneKey} disabled={!option.href}>{option.label} · {option.number}{option.blockedReason ? ' · ' + phoneIssueLabel(option.blockedReason) : option.href ? '' : ' · check number'}</option>)}</select></> : phone ? <p className="min-h-8 content-center text-sm tabular-nums text-slate-600 sm:text-base">{phone}{selectedPhoneOption?.blockedReason ? <span className="ml-2 text-amber-700">{phoneIssueLabel(selectedPhoneOption.blockedReason)}</span> : null}</p> : null}</div>
                  {email ? <a href={email.href} aria-label={'Email ' + selectedName + ' at ' + email.email} title="Opens your default email app" className="mt-1 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded text-xs text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-sm"><Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{email.email}</span></a> : <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-xs text-slate-500">{selectedContact?.email ? 'Check this contact’s saved email address' : 'No email saved for this contact'}</p>{selectedContact ? <Button variant="ghost" className="h-11 gap-1.5 px-2 text-xs text-blue-700 hover:bg-blue-50 hover:text-blue-800" aria-label={(selectedContact.email ? 'Edit email for ' : 'Add email for ') + selectedName} disabled={emailEditLocked} onClick={editSelectedEmail}><Mail aria-hidden="true" className="h-3.5 w-3.5" />{selectedContact.email ? 'Edit email' : 'Add email'}</Button> : null}{session ? <p className="basis-full text-xs text-slate-500">Finish or undo this call to edit the email.</p> : null}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                {session ? (
                  <Button className="h-11 shrink-0 gap-2 bg-emerald-700 px-4 text-sm font-semibold hover:bg-emerald-800" disabled={busy} onClick={() => confirm()}>{calling.pendingConfirmation ? 'Confirming...' : calling.pendingDiscard ? 'Undoing...' : 'I called · next'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
                ) : telHref && calling.recoveryReady ? (
                  <Button asChild className="h-11 shrink-0 gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold shadow-sm hover:bg-blue-700"><a href={telHref} onClick={(event) => startCall(event)} aria-label={'Call ' + selectedName}><Phone aria-hidden="true" className="h-4 w-4" /><span>Call</span></a></Button>
                ) : <Button className="h-11" disabled>{!calling.recoveryReady ? 'Restoring calls...' : workspaceQuery.isLoading ? 'Loading contacts...' : 'Check phone number'}</Button>}
                <Button variant="ghost" className="h-11 px-3 text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-800" disabled={Boolean(session)} onClick={skipCompany}>Skip</Button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"><p className="text-slate-500">{session ? session.confirmation && session.afterConfirmation === 'another_contact' ? 'Retry will log this call and prepare another contact on this company.' : 'Confirm after trying the call.' : 'Opens your dialer.'}</p>{session ? <p className={cn('font-medium', Boolean(calling.startError) ? 'text-amber-700' : 'text-emerald-700')}>{session.recorded ? 'Call started' : Boolean(calling.startError) ? 'Call start not recorded' : 'Saving call start...'}</p> : null}</div>
              <CallingContext contactId={activityContactId} contactName={selectedName} contactRows={contactActivityQuery.data?.activity || []} accountRows={workspaceQuery.data?.activity || []} loading={activityContactId ? contactActivityQuery.isLoading : workspaceQuery.isLoading} error={activityContactId ? contactActivityQuery.isError : workspaceQuery.isError} />
              {!telHref && !session && !workspaceQuery.isLoading && !workspaceQuery.isError ? <p className="mt-2 text-xs leading-4 text-amber-700">This contact needs one dialable number. Select another contact, edit the number, or skip for now.</p> : null}

              {session ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] leading-4 text-slate-500">Log this call or choose Didn’t call before changing companies.</p>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" className="h-11 px-2 text-xs text-slate-500" disabled={busy} onClick={() => calling.discard('calls')}>Didn't call</Button>
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
                      <div><p className="mb-2 text-xs text-slate-500">Log the attempt and stop using this number</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="h-11 px-3 text-xs" disabled={submissionLocked} onClick={() => confirm('wrong_number')}>Wrong number</Button><Button variant="outline" className="h-11 px-3 text-xs" disabled={submissionLocked} onClick={() => confirm('disconnected')}>Disconnected</Button></div></div>
                      {session.confirmation ? <p className="text-xs text-slate-500">Retry will use your saved outcome and note. Follow-up: {session.confirmation.nextFollowUp === undefined ? 'keep existing' : session.confirmation.nextFollowUp === null ? 'none' : new Date(session.confirmation.nextFollowUp).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' })}.</p> : <div><p className="mb-2 text-xs font-semibold text-slate-500">Next follow-up · optional</p><div className="flex flex-wrap gap-2">{NEXT_STEPS.map((item) => <Button key={item.value} size="sm" variant={nextStep === item.value ? 'default' : 'outline'} aria-pressed={nextStep === item.value} disabled={submissionLocked} onClick={() => setNextStep(item.value)}>{item.label}</Button>)}</div></div>}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {workspaceQuery.isError ? <div role="alert" className="border-t border-slate-100 px-4 py-4"><p className="text-xs text-amber-800">Contacts could not be loaded.</p><Button variant="ghost" size="sm" onClick={() => workspaceQuery.refetch()}>Retry contacts</Button></div> : workspaceQuery.isLoading ? <p className="border-t border-slate-100 px-4 py-4 text-xs text-slate-500">Loading company workspace...</p> : <>
              <CallingContacts key={activeCandidate.prospect.id} prospectId={activeCandidate.prospect.id} contacts={contacts} selectedId={session?.contactId || selectedContactId} selectedPhone={phone} locked={Boolean(session)} readiness={readiness} onSelect={selectContact} onDial={startCall} onSaved={onContactSaved} />
              {account?.notes ? <details className="border-t border-blue-100/70 px-4 py-3 sm:px-6"><summary className="min-h-9 cursor-pointer text-xs font-medium text-slate-500">Company notes</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{account.notes}</p></details> : null}
              <CallingActivity rows={historyQuery.data?.activity || []} filter={activityFilter} onFilter={setActivityFilter} contactName={selectedName} unattributedCount={workspaceQuery.data?.unattributedActivityCount || 0} loading={activityFilter === 'contact' && Boolean(activityContactId) ? contactActivityQuery.isLoading : historyQuery.isLoading} error={historyQuery.isError} onRetry={() => historyQuery.refetch()} />
            </>}
          </section>
        ) : !queueQuery.isLoading && !queueQuery.isError ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-center xl:col-start-1 xl:row-start-1 xl:row-span-2"><Check className="mx-auto h-6 w-6 text-emerald-600" /><h2 className="mt-2 text-lg font-bold text-slate-950">You're through the queue</h2><p className="mt-2 text-sm text-slate-500">{skippedIds.size ? skippedIds.size + ' companies skipped for now.' : progress.confirmedToday ? progress.confirmedToday + ' calls confirmed today. Good progress.' : 'No prospects with a saved phone number are ready.'}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="ghost" className="h-11 gap-1 text-xs text-slate-500" aria-label="Previous company" disabled={!previousCompanies.length} onClick={previousCompany}><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Previous</Button>{skippedIds.size ? <Button variant="outline" onClick={revisitSkipped}>Revisit skipped companies</Button> : null}<Button variant="outline" onClick={() => { setCompletedIds(new Set()); setSkippedIds(new Set()); setIncludeCalledToday(true) }}>Show contacts called today</Button></div></section>
        ) : null}

        <aside className="min-w-0 space-y-4 xl:col-start-2 xl:row-start-2 xl:sticky xl:top-4">
        {activeCandidate || upcoming.length ? (
          <section className="min-w-0 overflow-hidden rounded-xl border border-blue-100 bg-white" aria-label="Next companies">
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-3"><h2 className="text-base font-semibold text-slate-900 sm:text-lg">Calling queue</h2><span className="text-xs tabular-nums text-slate-600">{queueQuery.data?.totalEligible ?? candidates.length} in queue</span></div>
            <ol className="divide-y divide-blue-50 xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto">
              {upcoming.map((candidate, index) => {
                const choice = preferredCallingChoice(candidate.phoneReadiness)
                return (
                <li key={candidate.prospect.id} className={cn(index >= 5 && !showAllCompanies && 'hidden xl:block')}><button type="button" className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors sm:py-3 hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:cursor-default disabled:opacity-60" aria-label={'Select company ' + companyName(candidate)} disabled={Boolean(session)} onClick={() => selectCompany(candidate)}>
                  <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-slate-500">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800 sm:text-base">{companyName(candidate)}</p><p className="mt-0.5 truncate text-xs text-slate-500 sm:text-[13px]">{choice?.contactName ? choice.contactName + ' · ' : ''}{choice?.number || 'Number unavailable'}</p></div>
                  <span className="mt-0.5 max-w-[35%] text-right text-[11px] leading-4 text-slate-500">{candidate.reasons[0] || 'Ready'}</span>
                </button>
                </li>
              )})}
            </ol>
            {upcoming.length > 5 ? <Button variant="ghost" className="m-2 h-11 text-xs text-slate-500 xl:hidden" aria-expanded={showAllCompanies} onClick={() => setShowAllCompanies((value) => !value)}>{showAllCompanies ? 'Show fewer companies' : 'View all companies'}</Button> : null}
            {!upcoming.length ? <p className="px-4 py-6 text-xs text-slate-500">This is the last company in your queue.</p> : null}
            <div className="flex items-start gap-2 border-t border-blue-100 bg-blue-50/50 px-5 py-3 text-xs leading-5 text-slate-500"><Building2 className="mt-1 h-3.5 w-3.5 shrink-0" /><p>Select a company to prepare the next call. Calls count toward your goal when you log them.</p></div>
          </section>
        ) : null}
        <NeedsNumberList onSelect={reviewNumber} locked={Boolean(session)} />
        </aside>
        </div>
      </main>
      {emailEditor ? <ContactEditor key={emailEditor.contact.id} prospectId={emailEditor.contact.prospectId} contact={emailEditor.contact} existingIds={emailEditor.existingIds} focusEmail onClose={() => setEmailEditor(null)} onSaved={(workspace, contactId) => { onContactSaved(workspace, contactId); setEmailEditor(null) }} /> : null}
    </div>
  )
}
