import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Archive, CheckCircle2, ExternalLink, Inbox as InboxIcon, Mail, RefreshCcw, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'wouter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiRequest } from '@/lib/queryClient'
import type { Prospect } from '@level-cre/shared/schema'

type EmailReviewStatus = 'needs_context' | 'pending_review' | 'auto_logged' | 'approved' | 'ignored' | 'rejected' | 'all'

type EmailReviewItem = {
  id: string
  matchStatus: Exclude<EmailReviewStatus, 'all'>
  confidence: number
  matchReason: string
  suggestedInteractionType: string
  suggestedOutcome: string
  suggestedSummary: string
  suggestedNextFollowUp: string | null
  interactionId: string | null
  email: {
    provider: string
    providerMessageId: string
    providerThreadId: string | null
    direction: string
    subject: string
    senderEmail: string
    senderName: string
    recipientEmails: string[]
    sentAt: string | null
    receivedAt: string | null
    snippet: string
    attachmentNames: string[]
    sourceUrl: string
  }
  prospect: null | {
    id: string
    name: string
    address: string
    status: string
    contactCompany?: string
    businessName?: string
  }
  listing: null | {
    id: string
    title: string
  }
}

type EmailReviewCounts = {
  needsContext: number
  pendingReview: number
  approved: number
  autoLogged: number
  ignored: number
  rejected: number
}

type OutlookConfig = {
  configured: boolean
  connected: boolean
  redirectUri?: string
  reason?: string
  scopes?: string[]
  connection: null | {
    id: string
    emailAddress: string | null
    displayName: string | null
    status: string
    lastSyncedAt: string | null
    errorMessage: string | null
  }
}

type InboundEmailConfig = {
  configured: boolean
  domainConfigured: boolean
  intakeAddress: string | null
  webhookUrl: string
}

const statusLabels: Record<EmailReviewStatus, string> = {
  needs_context: 'Needs Context',
  pending_review: 'Ready to Log',
  auto_logged: 'Logged',
  approved: 'Approved',
  ignored: 'Archived',
  rejected: 'Rejected',
  all: 'All',
}

function formatEmailDate(item: EmailReviewItem) {
  const value = item.email.sentAt || item.email.receivedAt
  if (!value) return 'No date'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'No date'
  return `${formatDistanceToNow(date, { addSuffix: true })}`
}

export default function InboxPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<EmailReviewStatus>('all')
  const [search, setSearch] = useState('')
  const [prospectDrafts, setProspectDrafts] = useState<Record<string, string>>({})

  const { data: counts } = useQuery<EmailReviewCounts>({
    queryKey: ['/api/email/review/counts'],
  })

  const { data: outlookConfig } = useQuery<OutlookConfig>({
    queryKey: ['/api/email/outlook/config'],
  })

  const { data: inboundConfig } = useQuery<InboundEmailConfig>({
    queryKey: ['/api/email/inbound/config'],
  })

  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
  })

  const { data: items = [], isLoading } = useQuery<EmailReviewItem[]>({
    queryKey: [`/api/email/review?status=${status}`],
  })

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => {
      const haystack = [
        item.email.subject,
        item.email.senderEmail,
        item.email.senderName,
        item.email.snippet,
        item.prospect?.name,
        item.prospect?.address,
        item.matchReason,
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [items, search])

  const capturedCount = (
    (counts?.needsContext ?? 0) +
    (counts?.pendingReview ?? 0) +
    (counts?.autoLogged ?? 0) +
    (counts?.approved ?? 0) +
    (counts?.ignored ?? 0) +
    (counts?.rejected ?? 0)
  )
  const estimatedEmailXp = capturedCount * 10
  const dashboardCards = [
    { label: 'Captured', value: capturedCount, helper: 'BCC email activity', tone: 'text-slate-950' },
    { label: 'Needs Context', value: counts?.needsContext ?? 0, helper: 'Optional cleanup', tone: 'text-amber-700' },
    { label: 'Logged', value: counts?.autoLogged ?? 0, helper: 'Prospect interactions', tone: 'text-emerald-700' },
    { label: 'Email XP', value: estimatedEmailXp, helper: 'Captured activity value', tone: 'text-blue-700' },
  ]

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/email/review/counts'] })
    queryClient.invalidateQueries({ queryKey: [`/api/email/review?status=${status}`] })
  }

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, matchStatus, prospectId, listingId }: { id: string; matchStatus?: Exclude<EmailReviewStatus, 'all'>; prospectId?: string | null; listingId?: string | null }) => {
      const response = await apiRequest('PATCH', `/api/email/review/${id}`, { matchStatus, prospectId, listingId })
      return response.json()
    },
    onSuccess: invalidate,
  })

  const logInteractionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/email/review/${id}/create-interaction`)
      return response.json()
    },
    onSuccess: invalidate,
  })

  const syncOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/email/outlook/sync', { days: 30 })
      return response.json()
    },
    onSuccess: invalidate,
  })

  const prospectOptions = useMemo(() => {
    return [...prospects]
      .sort((left, right) => (left.contactCompany || left.businessName || left.name || '').localeCompare(right.contactCompany || right.businessName || right.name || ''))
      .slice(0, 250)
  }, [prospects])

  const connectOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/ms365/auth-url?returnTo=/app/inbox')
      return response.json() as Promise<{ url: string }>
    },
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })

  return (
    <div className="min-h-0 flex-1 bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <InboxIcon className="h-4 w-4" />
              Inbox
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">CRM Activity</h1>
            <p className="mt-1 text-sm text-slate-500">Captured emails, lightweight context cleanup, and sales activity credit.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 gap-1.5 bg-white px-3 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              BCC capture {inboundConfig?.configured ? 'ready' : 'needs setup'}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/profile">
                <Settings className="mr-2 h-4 w-4" />
                Email Settings
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dashboardCards.map((card) => (
            <Card key={card.label} className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                <div className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value.toLocaleString()}</div>
                <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search emails, prospects, addresses"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(value) => setStatus(value as EmailReviewStatus)}>
                <SelectTrigger className="w-[170px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="needs_context">Needs Context</SelectItem>
                  <SelectItem value="pending_review">Ready to Log</SelectItem>
                  <SelectItem value="auto_logged">Logged</SelectItem>
                  <SelectItem value="ignored">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={invalidate} aria-label="Refresh">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden rounded-lg border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">Outlook</p>
                <Badge variant="outline" className={outlookConfig?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}>
                  {outlookConfig?.connected ? 'Connected' : outlookConfig?.configured ? 'Ready to connect' : 'Needs setup'}
                </Badge>
              </div>
              {outlookConfig?.connected ? (
                <p className="mt-1 text-sm text-slate-500">
                  {outlookConfig.connection?.emailAddress || outlookConfig.connection?.displayName || 'Microsoft 365'}
                  {outlookConfig.connection?.lastSyncedAt ? ` · synced ${formatDistanceToNow(new Date(outlookConfig.connection.lastSyncedAt), { addSuffix: true })}` : ''}
                </p>
              ) : outlookConfig?.configured ? (
                <p className="mt-1 text-sm text-slate-500">Connect Microsoft 365 to start filling the review queue.</p>
              ) : (
                <p className="mt-1 break-all text-sm text-slate-500">
                  Add Outlook OAuth credentials. Redirect URI: {outlookConfig?.redirectUri || '/api/email/outlook/callback'}
                </p>
              )}
              {outlookConfig?.connection?.errorMessage ? (
                <p className="mt-1 text-sm text-red-600">{outlookConfig.connection.errorMessage}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!outlookConfig?.connected ? (
                <Button
                  disabled={!outlookConfig?.configured || connectOutlookMutation.isPending}
                  onClick={() => connectOutlookMutation.mutate()}
                >
                  {connectOutlookMutation.isPending ? 'Connecting...' : 'Connect Outlook'}
                </Button>
              ) : (
                <Button onClick={() => syncOutlookMutation.mutate()} disabled={syncOutlookMutation.isPending}>
                  {syncOutlookMutation.isPending ? 'Syncing...' : 'Sync Outlook'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hidden rounded-lg border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">BCC intake</p>
                <Badge
                  variant="outline"
                  className={inboundConfig?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}
                >
                  {inboundConfig?.configured ? 'Webhook ready' : 'Needs secret'}
                </Badge>
              </div>
              {inboundConfig?.intakeAddress ? (
                <p className="mt-1 break-all text-sm text-slate-500">{inboundConfig.intakeAddress}</p>
              ) : (
                <p className="mt-1 break-all text-sm text-slate-500">
                  Add EMAIL_INBOUND_WEBHOOK_SECRET and EMAIL_INBOUND_DOMAIN to enable a personal BCC address.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              disabled={!inboundConfig?.intakeAddress}
              onClick={() => inboundConfig?.intakeAddress && navigator.clipboard?.writeText(inboundConfig.intakeAddress)}
            >
              Copy address
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {isLoading ? (
            <Card className="rounded-lg border-slate-200">
              <CardContent className="py-10 text-center text-sm text-slate-500">Loading email review...</CardContent>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card className="rounded-lg border-slate-200">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Mail className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">No {statusLabels[status].toLowerCase()} emails</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.map((item) => (
              <Card key={item.id} className="rounded-lg border-slate-200 bg-white shadow-sm">
                <CardHeader className="space-y-3 p-4 pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-slate-50 text-slate-700">
                          {statusLabels[item.matchStatus]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={item.prospect ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}
                        >
                          {item.prospect ? 'Context attached' : 'Unattached'}
                        </Badge>
                        {item.matchStatus === 'needs_context' ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            <Sparkles className="mr-1 h-3 w-3" />
                            XP captured
                          </Badge>
                        ) : null}
                        <span className="text-xs text-slate-500">{formatEmailDate(item)}</span>
                      </div>
                      <CardTitle className="mt-2 truncate text-base text-slate-950">
                        {item.email.subject || '(No subject)'}
                      </CardTitle>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {item.email.senderName || item.email.senderEmail || 'Unknown sender'}
                        {item.email.senderEmail ? ` <${item.email.senderEmail}>` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.email.sourceUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={item.email.sourceUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updateStatusMutation.isPending}
                        onClick={() => updateStatusMutation.mutate({ id: item.id, matchStatus: 'ignored' })}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </Button>
                      <Button
                        size="sm"
                        disabled={!item.prospect || logInteractionMutation.isPending}
                        onClick={() => logInteractionMutation.mutate(item.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Log to Prospect
                      </Button>
                      {item.prospect ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: item.id, prospectId: null, listingId: null, matchStatus: 'needs_context' })}
                        >
                          Clear Context
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-2">
                    <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                      {item.suggestedSummary || item.email.snippet || 'No preview available.'}
                    </p>
                    {item.matchReason ? (
                      <p className="text-xs text-slate-500">{item.matchReason}</p>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email Context</p>
                    {item.prospect ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-semibold text-slate-950">{item.prospect.contactCompany || item.prospect.businessName || item.prospect.name || 'Untitled prospect'}</p>
                        {(item.prospect.contactCompany || item.prospect.businessName) && item.prospect.name ? (
                          <p className="text-xs text-slate-600">{item.prospect.name}</p>
                        ) : null}
                        <p className="text-xs text-slate-600">{item.prospect.address || 'No address'}</p>
                        <Badge variant="outline" className="mt-1 bg-white text-slate-700">{item.prospect.status}</Badge>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-slate-500">Captured as sales activity. Attach context only if it is worth it.</p>
                        <Select
                          value={prospectDrafts[item.id] || ''}
                          onValueChange={(value) => setProspectDrafts((prev) => ({ ...prev, [item.id]: value }))}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Choose company or prospect" />
                          </SelectTrigger>
                          <SelectContent>
                            {prospectOptions.map((prospect) => (
                              <SelectItem key={prospect.id} value={prospect.id}>
                                {prospect.contactCompany || prospect.businessName || prospect.name || 'Untitled prospect'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!prospectDrafts[item.id] || updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: item.id, prospectId: prospectDrafts[item.id], matchStatus: 'pending_review' })}
                        >
                          Attach Context
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
