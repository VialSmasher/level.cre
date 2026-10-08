import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import {
  blockConfirmedPhone, callSessionStorageKey, createMobileCallSession, freezeCallConfirmation,
  isPhoneIssueOutcome, parseStoredCallSession, restorePendingCallSession,
  type CallConfirmationContinuation, type CallQueueCandidate, type CallQueueResponse,
  type CallingContact, type CallingPhoneChoice, type CallingWorkspace,
  type MobileCallOutcome, type MobileCallSession,
} from '@/lib/mobileCalling'

export type CallingSessionResult = {
  status: string
  newXpGained?: number
  canDismissLocally?: boolean
  contactId?: string | null
  contactSnapshot?: CallingContact | null
  workspace?: CallingWorkspace
}

export type CallingSessionResolution = {
  sequence: number
  type: 'confirmed' | 'discarded' | 'unavailable'
  session: MobileCallSession
  result: CallingSessionResult
}

export type CallingSessionController = {
  brokerId: string | null
  session: MobileCallSession | null
  start: (candidate: CallQueueCandidate, contact: CallingContact, choice: CallingPhoneChoice, origin?: MobileCallSession['origin']) => MobileCallSession | null
  confirm: (outcome?: MobileCallOutcome, notes?: string, nextFollowUp?: string | null, continuation?: CallConfirmationContinuation) => boolean
  discard: (origin?: MobileCallSession['origin']) => boolean
  retryStart: () => boolean
  retryConfirmation: () => boolean
  pendingStart: boolean
  pendingConfirmation: boolean
  pendingDiscard: boolean
  busy: boolean
  startError: Error | null
  confirmationError: Error | null
  discardError: Error | null
  error: Error | null
  recoveryReady: boolean
  recovering: boolean
  recoveryError: Error | null
  retryRecovery: () => void
  resolution: CallingSessionResolution | null
  claimResolution: (sequence: number) => boolean
}

const CallingSessionContext = createContext<CallingSessionController | null>(null)

function loadSession(brokerId: string | null) {
  if (!brokerId) return null
  try { return parseStoredCallSession(localStorage.getItem(callSessionStorageKey(brokerId)), brokerId) }
  catch { return null }
}

export function CallingSessionProvider({ children }: { children: ReactNode }) {
  const { user, isDemoMode } = useAuth()
  const brokerId = isDemoMode ? 'demo-user' : user?.id || null
  // A new authenticated actor gets new refs, recovery and mutations. Frozen calls
  // remain in their own broker's storage and cannot cross into another account.
  return <BrokerCallingSession key={brokerId || 'signed-out'} brokerId={brokerId}>{children}</BrokerCallingSession>
}

function BrokerCallingSession({ brokerId, children }: { brokerId: string | null; children: ReactNode }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [session, setSession] = useState<MobileCallSession | null>(() => loadSession(brokerId))
  const sessionRef = useRef(session)
  const activeRef = useRef(true)
  const completionRef = useRef(false)
  const discardingRef = useRef(false)
  const restorationChecked = useRef(false)
  const resolvedIds = useRef(new Set<string>())
  const startRequests = useRef(new Map<string, Promise<CallingSessionResult>>())
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [resolution, setResolution] = useState<CallingSessionResolution | null>(null)
  const resolutionSequence = useRef(0)
  const claimedResolution = useRef(0)
  const recoveryQuery = useQuery<CallQueueResponse>({
    queryKey: ['/api/calling/queue', brokerId, false],
    enabled: Boolean(brokerId),
    queryFn: async () => (await apiRequest('GET', '/api/calling/queue?limit=25')).json(),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  useLayoutEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  const isCurrent = (started: MobileCallSession) => activeRef.current
    && started.brokerId === brokerId && sessionRef.current?.clientEventId === started.clientEventId

  const persistSession = (value: MobileCallSession | null) => {
    sessionRef.current = value
    setSession(value)
    if (!brokerId) return
    try {
      if (value) localStorage.setItem(callSessionStorageKey(brokerId), JSON.stringify(value))
      else localStorage.removeItem(callSessionStorageKey(brokerId))
    } catch {
      // Server recovery also preserves recorded starts when browser storage fails.
    }
  }

  const refreshActivity = () => {
    for (const queryKey of [
      ['/api/calling/queue', brokerId], ['/api/automation/sales-brief?limit=25'],
      ['/api/automation/activity-pulse'], ['/api/prospects'], ['/api/interactions'],
      ['/api/automation/production-activities'], ['/api/skill-activities'], ['/api/skills'],
      ['/api/stats/header'], ['/api/profile'], ['/api/calling/workspace', brokerId],
      ['/api/calling/workspace-activity', brokerId], ['/api/calling/needs-number'],
    ]) void queryClient.invalidateQueries({ queryKey })
  }

  const resolveSession = (type: CallingSessionResolution['type'], started: MobileCallSession, result: CallingSessionResult) => {
    if (!isCurrent(started)) return
    const frozen = sessionRef.current!
    resolvedIds.current.add(started.clientEventId)
    queryClient.setQueriesData<CallQueueResponse>({ queryKey: ['/api/calling/queue', brokerId] }, (current) => current ? {
      ...current,
      rows: type === 'confirmed' ? current.rows.filter((candidate) => candidate.prospect.id !== started.prospectId) : current.rows,
      pendingSessions: (current.pendingSessions || []).filter((item) => item.clientEventId !== started.clientEventId),
    } : current)
    persistSession(null)
    completionRef.current = false
    discardingRef.current = false
    startMutation.reset()
    outcomeMutation.reset()
    discardMutation.reset()
    setResolution({ sequence: ++resolutionSequence.current, type, session: frozen, result })
    refreshActivity()
  }

  const recordStart = (started: MobileCallSession) => {
    const existing = startRequests.current.get(started.clientEventId)
    if (existing) return existing
    const request = (async () => {
      if (!isCurrent(started)) throw new Error('Call session is no longer active.')
      return (await apiRequest('POST', '/api/calling/starts', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, callStartedAt: started.startedAt,
        ...(started.contactId ? { contactId: started.contactId } : {}),
      }, { keepalive: true })).json() as Promise<CallingSessionResult>
    })()
    startRequests.current.set(started.clientEventId, request)
    void request.then(() => startRequests.current.delete(started.clientEventId), () => startRequests.current.delete(started.clientEventId))
    return request
  }

  const startMutation = useMutation({
    mutationFn: recordStart,
    onSuccess: (result, started) => {
      if (!isCurrent(started)) return
      if (result.status !== 'started') {
        resolveSession(result.status === 'confirmed' ? 'confirmed' : 'discarded', started, result)
        return
      }
      persistSession({ ...sessionRef.current!, recorded: true,
        contactId: result.contactId ?? sessionRef.current!.contactId,
        contactSnapshot: result.contactSnapshot ?? sessionRef.current!.contactSnapshot,
      })
      void queryClient.invalidateQueries({ queryKey: ['/api/calling/queue', brokerId] })
    },
  })

  const outcomeMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      const confirmation = started.confirmation!
      // A fast confirmation waits for this exact saved start. Its in-flight POST
      // is shared with the original click, and retries never activate a dialer.
      if (!started.recorded) {
        const reconciled = await startMutation.mutateAsync(started)
        if (reconciled.status !== 'started') return reconciled
      }
      if (!isCurrent(started)) throw new Error('Call session is no longer active.')
      const result = await (await apiRequest('POST', '/api/calling/outcomes', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        expectedPhone: started.expectedPhone, ...confirmation,
        ...(started.contactId ? { contactId: started.contactId } : {}),
        occurredAt: started.startedAt, callStartedAt: started.startedAt,
      }, { keepalive: true })).json() as CallingSessionResult
      if (isPhoneIssueOutcome(confirmation.outcome) && isCurrent(started)) {
        result.workspace = await (await apiRequest('GET', `/api/calling/prospects/${encodeURIComponent(started.prospectId)}/workspace`)).json() as CallingWorkspace
      }
      return result
    },
    onSuccess: (result, started) => {
      if (!isCurrent(started)) return
      if (started.confirmation && isPhoneIssueOutcome(started.confirmation.outcome)) {
        const issue = started.confirmation.outcome
        queryClient.setQueryData<CallingWorkspace>(['/api/calling/workspace', brokerId, started.prospectId], (current) => result.workspace || (current?.phoneReadiness ? {
          ...current, phoneReadiness: blockConfirmedPhone(current.phoneReadiness, started, issue),
        } : current))
      }
      toast({
        title: (result.newXpGained || 0) > 0 ? 'Call saved · +' + result.newXpGained : 'Call already recorded',
        description: started.candidate.contact.company || started.candidate.prospect.businessName || started.candidate.prospect.name,
        className: 'mt-14 border-slate-200 bg-white py-3 pl-4 pr-10 shadow-sm sm:mt-0', duration: 2400,
      })
      resolveSession('confirmed', started, result)
    },
    onSettled: () => { completionRef.current = false },
  })

  const discardMutation = useMutation({
    mutationFn: async (started: MobileCallSession) => {
      if (!isCurrent(started)) throw new Error('Call session is no longer active.')
      return (await apiRequest('POST', '/api/calling/discards', {
        clientEventId: started.clientEventId, prospectId: started.prospectId,
        ...(started.contactId ? { contactId: started.contactId } : {}),
      })).json() as Promise<CallingSessionResult>
    },
    onSuccess: (result, started) => resolveSession(result.status === 'unavailable' && result.canDismissLocally ? 'unavailable' : 'discarded', started, result),
    onSettled: () => { discardingRef.current = false },
  })

  useEffect(() => {
    if (!recoveryQuery.isFetchedAfterMount || !recoveryQuery.isSuccess || !recoveryQuery.data) return
    setRecoveryReady(true)
    if (!restorationChecked.current) {
      restorationChecked.current = true
      const stored = sessionRef.current
      if (stored) startMutation.mutate(stored)
    }
    if (sessionRef.current) return
    const pending = recoveryQuery.data.pendingSessions?.find((item) => !resolvedIds.current.has(item.clientEventId))
    if (!pending?.candidate || !brokerId) return
    persistSession(restorePendingCallSession(brokerId, pending))
  }, [brokerId, recoveryQuery.data, recoveryQuery.isFetchedAfterMount, recoveryQuery.isSuccess])

  const busy = outcomeMutation.isPending || discardMutation.isPending
  const start: CallingSessionController['start'] = (candidate, contact, choice, origin = 'map') => {
    if (!brokerId || !recoveryReady || sessionRef.current || busy || !activeRef.current) return null
    const created = createMobileCallSession(brokerId, candidate, contact, choice)
    if (!created) return null
    const started: MobileCallSession = { ...created, origin }
    startMutation.reset()
    outcomeMutation.reset()
    discardMutation.reset()
    persistSession(started)
    startMutation.mutate(started)
    return started
  }
  const confirm: CallingSessionController['confirm'] = (outcome = 'attempted', notes = '', nextFollowUp, continuation) => {
    const started = sessionRef.current
    if (!started || busy || completionRef.current || discardingRef.current || !activeRef.current) return false
    completionRef.current = true
    const frozen = freezeCallConfirmation(started, {
      outcome, notes: notes.trim(), ...(nextFollowUp === undefined ? {} : { nextFollowUp }),
    }, continuation)
    persistSession(frozen)
    outcomeMutation.mutate(frozen)
    return true
  }
  const discard: CallingSessionController['discard'] = (origin = 'map') => {
    const started = sessionRef.current
    if (!started || busy || completionRef.current || discardingRef.current || !activeRef.current) return false
    discardingRef.current = true
    const frozen = { ...started, origin }
    persistSession(frozen)
    discardMutation.mutate(frozen)
    return true
  }
  const retryStart = () => {
    const started = sessionRef.current
    if (!started || startMutation.isPending || busy || !activeRef.current) return false
    startMutation.mutate(started)
    return true
  }

  const value: CallingSessionController = {
    brokerId, session, start, confirm, discard, retryStart,
    retryConfirmation: () => confirm(),
    pendingStart: startMutation.isPending, pendingConfirmation: outcomeMutation.isPending,
    pendingDiscard: discardMutation.isPending, busy,
    startError: startMutation.error, confirmationError: outcomeMutation.error,
    discardError: discardMutation.error,
    error: outcomeMutation.error || discardMutation.error || startMutation.error,
    recoveryReady, recovering: Boolean(brokerId && !recoveryReady && recoveryQuery.isFetching),
    recoveryError: !recoveryReady ? recoveryQuery.error : null,
    retryRecovery: () => { void recoveryQuery.refetch() }, resolution,
    claimResolution: (sequence) => {
      if (!activeRef.current || !resolution || sequence !== resolution.sequence || sequence <= claimedResolution.current) return false
      claimedResolution.current = sequence
      return true
    },
  }
  return <CallingSessionContext.Provider value={value}>{children}</CallingSessionContext.Provider>
}

export function useCallingSession() {
  const controller = useContext(CallingSessionContext)
  if (!controller) throw new Error('CallingSessionProvider is required for calling controls.')
  return controller
}
